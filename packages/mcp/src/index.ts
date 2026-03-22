#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { COMMANDS, CATEGORIES, refToLocator } from '@playwright-repl/core';
import pkg from '../package.json' with { type: 'json' };
import { createBridgeRunner } from './bridge.js';
import { createStandaloneRunner } from './standalone.js';
import type { SnapshotCache } from './types.js';

const argv = process.argv.slice(2);
const standalone = argv.includes('--standalone');
const headed = argv.includes('--headed');

const snapshotCache: SnapshotCache = { value: null };

// ─── Create runner ───────────────────────────────────────────────────────────

const { runner, descriptions } = standalone
    ? createStandaloneRunner(headed, snapshotCache)
    : await createBridgeRunner(argv, snapshotCache);

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
        const trimmed = command.trim().toLowerCase();
        if (trimmed === 'help') {
            const lines = Object.entries(CATEGORIES)
                .map(([cat, cmds]) => `  ${cat}: ${cmds.join(', ')}`)
                .join('\n');
            return { content: [{ type: 'text' as const, text: `Available commands:\n${lines}\n\nType "help <command>" for details.` }] };
        }
        if (trimmed.startsWith('locator ')) {
            const ref = command.trim().slice(8).trim();
            if (!snapshotCache.value) {
                return { content: [{ type: 'text' as const, text: 'No snapshot cached. Run "snapshot" first.' }], isError: true };
            }
            const locator = refToLocator(snapshotCache.value.snapshotString, ref);
            if (!locator) {
                return { content: [{ type: 'text' as const, text: `Ref "${ref}" not found in last snapshot. Run "snapshot" to refresh.` }], isError: true };
            }
            return { content: [{ type: 'text' as const, text: `js: ${locator.js}\npw: ${locator.pw}` }] };
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
        const result = await runner.runCommand(command);
        if (result.image) {
            const [header, data] = result.image.split(',');
            const mimeType = (header.match(/data:(.*);base64/) ?? [])[1] ?? 'image/png';
            return { content: [{ type: 'image' as const, data, mimeType }] };
        }
        return {
            content: [{ type: 'text' as const, text: result.text || 'Done' }],
            isError: result.isError,
        };
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
        const script = params.script as string;
        const language = (params.language as 'pw' | 'javascript') || 'pw';
        const result = await runner.runScript(script, language);
        return {
            content: [{ type: 'text' as const, text: result.text || 'Done' }],
            isError: result.isError,
        };
    }
);

const transport = new StdioServerTransport();
await server.connect(transport);
