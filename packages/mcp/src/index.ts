#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import http from 'node:http';
import { COMMANDS, CATEGORIES } from '@playwright-repl/core';
import pkg from '../package.json' with { type: 'json' };
import { createBridgeRunner } from './bridge.js';
import { createEvaluateRunner } from './evaluate.js';
import { createStandaloneRunner } from './standalone.js';
import { logStartup, logEvent, logToolCall, logToolResult, logError, LOG_FILE } from './logger.js';
import type { Runner } from './types.js';
// ─── Process exit handlers — log why the process dies ───────────────────────

process.on('uncaughtException', (err) => {
    logError('uncaughtException', err);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    logError('unhandledRejection', reason);
});

process.on('SIGTERM', () => {
    logEvent('Received SIGTERM — exiting');
    process.exit(0);
});

process.on('SIGINT', () => {
    logEvent('Received SIGINT — exiting');
    process.exit(0);
});

process.on('exit', (code) => {
    logEvent(`Process exiting (code: ${code})`);
});

const argv = process.argv.slice(2);
const standalone = argv.includes('--standalone');
const headed = argv.includes('--headed');

// ─── Create runner ───────────────────────────────────────────────────────────

let runnerModule;
if (standalone) {
    // Try evaluate mode (extension + JS support), fall back to Engine (keyword only)
    try {
        runnerModule = await createEvaluateRunner(argv);
    } catch {
        runnerModule = createStandaloneRunner(headed);
    }
} else {
    runnerModule = await createBridgeRunner(argv);
}

const { runner, descriptions } = runnerModule;

logStartup(standalone ? 'standalone' : 'bridge', `log → ${LOG_FILE}`);

// ─── HTTP server for --command --http piggybacking ──────────────────────────

const httpPort = (() => {
    const idx = argv.indexOf('--http-port');
    if (idx !== -1 && argv[idx + 1]) return parseInt(argv[idx + 1], 10);
    return 9223;
})();

startHttpServer(httpPort, runner);

function startHttpServer(port: number, r: Runner) {
    const server = http.createServer(async (req: http.IncomingMessage, res: http.ServerResponse) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok' }));
            return;
        }
        if (req.method === 'POST' && req.url === '/run') {
            try {
                const body = await readBody(req);
                const { command } = JSON.parse(body);
                const result = await r.runCommand(command);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e: unknown) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text: (e as Error).message, isError: true }));
            }
            return;
        }
        if (req.method === 'POST' && req.url === '/run-script') {
            try {
                const body = await readBody(req);
                const { script, language } = JSON.parse(body);
                const result = await r.runScript(script, language || 'pw');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e: unknown) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text: (e as Error).message, isError: true }));
            }
            return;
        }
        res.writeHead(404);
        res.end('Not found');
    });
    server.listen(port, () => {
        logEvent(`HTTP server on port ${port}`);
    });
    server.on('error', (e: Error) => {
        logEvent(`HTTP server failed: ${e.message}`);
    });
}

function readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        req.on('data', (chunk: string) => data += chunk);
        req.on('end', () => resolve(data));
        req.on('error', reject);
    });
}

// ─── MCP server ──────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'playwright-repl', version: pkg.version });

server.registerTool(
    'run_command',
    {
        description: descriptions.runCommand,
        inputSchema: {
            command: z.string().describe(descriptions.runCommandInput),
        },
    },
    async ({ command }) => {
        const start = Date.now();
        logToolCall('run_command', { command });
        const trimmed = command.trim().toLowerCase();
        if (trimmed === 'help') {
            const lines = Object.entries(CATEGORIES)
                .map(([cat, cmds]) => `  ${cat}: ${cmds.join(', ')}`)
                .join('\n');
            logToolResult('run_command', false, 'help', Date.now() - start);
            return { content: [{ type: 'text' as const, text: `Available commands:\n${lines}\n\nType "help <command>" for details.` }] };
        }
        if (trimmed.startsWith('help ')) {
            const cmd = trimmed.slice(5).trim();
            const info = COMMANDS[cmd];
            if (!info) {
                return { content: [{ type: 'text' as const, text: `Unknown command: "${cmd}". Type "help" for available commands.` }], isError: true };
            }
            const parts = [`${cmd} — ${info.desc}`];
            if (info.usage) parts.push(`Usage: ${info.usage}`);
            if (info.examples?.length) {
                parts.push('Examples:');
                for (const ex of info.examples) parts.push(`  ${ex}`);
            }
            return { content: [{ type: 'text' as const, text: parts.join('\n') }] };
        }
        try {
            const result = await runner.runCommand(command);
            logToolResult('run_command', !!result.isError, result.text, Date.now() - start);
            if (result.image) {
                const [header, data] = result.image.split(',');
                const mimeType = (header.match(/data:(.*);base64/) ?? [])[1] ?? 'image/png';
                return { content: [{ type: 'image' as const, data, mimeType }] };
            }
            return {
                content: [{ type: 'text' as const, text: result.text || 'Done' }],
                isError: result.isError,
            };
        } catch (err) {
            logError('run_command', err);
            throw err;
        }
    }
);

server.registerTool(
    'run_script',
    {
        description: descriptions.runScript,
        inputSchema: descriptions.scriptOnly
            ? { script: z.string().describe('The .pw keyword script to execute (one command per line)') }
            : {
                script: z.string().describe('The script to execute'),
                language: z.enum(['pw', 'javascript']).describe("'pw' for keyword commands (one per line), 'javascript' for a JS/Playwright block"),
            },
    },
    async (params: Record<string, unknown>) => {
        const start = Date.now();
        const script = params.script as string;
        const language = (params.language as 'pw' | 'javascript') || 'pw';
        logToolCall('run_script', { language, script });
        try {
            const result = await runner.runScript(script, language);
            logToolResult('run_script', !!result.isError, result.text, Date.now() - start);
            return {
                content: [{ type: 'text' as const, text: result.text || 'Done' }],
                isError: result.isError,
            };
        } catch (err) {
            logError('run_script', err);
            throw err;
        }
    }
);

server.server.oninitialized = () => {
    const client = server.server.getClientVersion();
    if (client) logEvent(`Client: ${client.name} ${client.version}`);
};

const transport = new StdioServerTransport();
await server.connect(transport);
