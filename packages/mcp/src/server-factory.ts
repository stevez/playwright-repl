/**
 * Creates an McpServer instance with run_command and run_script tools registered.
 * Extracted into its own module to avoid circular imports between index.ts and http-transport.ts.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { COMMANDS, CATEGORIES } from '@playwright-repl/core';
import pkg from '../package.json' with { type: 'json' };
import { logEvent, logToolCall, logToolResult, logError } from './logger.js';
import type { Runner, RunnerDescriptions } from './types.js';

export function createMcpServer(r: Runner, desc: RunnerDescriptions): McpServer {
    const server = new McpServer({ name: 'playwright-repl', version: pkg.version });

    server.registerTool(
        'run_command',
        {
            description: desc.runCommand,
            inputSchema: {
                command: z.string().describe(desc.runCommandInput),
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
                const result = await r.runCommand(command);
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
            description: desc.runScript,
            inputSchema: desc.scriptOnly
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
                const result = await r.runScript(script, language);
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

    return server;
}
