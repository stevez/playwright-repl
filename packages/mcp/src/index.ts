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
import { createRelayRunner } from './relay.js';
import { logStartup, logEvent, logToolCall, logToolResult, logError, logHttp, LOG_FILE } from './logger.js';
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
const relay = argv.includes('--relay');
const headed = argv.includes('--headed');

// ─── Create runner ───────────────────────────────────────────────────────────

let runnerModule;
if (relay) {
    runnerModule = await createRelayRunner(argv);
} else if (standalone) {
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

const mode = relay ? 'relay' : standalone ? 'standalone' : 'bridge';
logStartup(mode, `log → ${LOG_FILE}`);

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
            const t0 = Date.now();
            let command = '';
            try {
                const body = await readBody(req);
                ({ command } = JSON.parse(body));
                logHttp(`→ ${command}`);
                const result = await withTimeout(r.runCommand(command), 30000, `Command timed out after 30s: ${command}`);
                const ms = Date.now() - t0;
                logHttp(`${result.isError ? '✗' : '✓'} ${command} (${ms}ms)`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e: unknown) {
                logHttp(`✗ ${command} — ${(e as Error).message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ text: (e as Error).message, isError: true }));
            }
            return;
        }
        if (req.method === 'POST' && req.url === '/run-script') {
            const t0 = Date.now();
            let language = 'pw';
            try {
                const body = await readBody(req);
                const parsed = JSON.parse(body);
                const script = parsed.script as string;
                language = parsed.language || 'pw';
                const preview = script.split('\n')[0].slice(0, 60);
                logHttp(`→ [${language}] ${preview}${script.length > preview.length ? '…' : ''}`);
                const result = await withTimeout(r.runScript(script, language as 'pw' | 'javascript'), 30000, `Script timed out after 30s`);
                const ms = Date.now() - t0;
                logHttp(`${result.isError ? '✗' : '✓'} [${language}] (${ms}ms)`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (e: unknown) {
                logHttp(`✗ [${language}] — ${(e as Error).message}`);
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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(message)), ms);
        promise.then(
            (v) => { clearTimeout(timer); resolve(v); },
            (e) => { clearTimeout(timer); reject(e); },
        );
    });
}

function readBody(req: http.IncomingMessage, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        const timer = setTimeout(() => {
            req.destroy();
            reject(new Error(`Request body read timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        req.on('data', (chunk: string) => data += chunk);
        req.on('end', () => { clearTimeout(timer); resolve(data); });
        req.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
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
