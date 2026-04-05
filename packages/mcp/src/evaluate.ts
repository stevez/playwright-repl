/**
 * Evaluate runner — connects to Chrome via serviceWorker.evaluate().
 * No WebSocket bridge needed.
 */

import { EvaluateConnection, findExtensionPath, UPDATE_COMMANDS, parseInput, handleLocalCommand } from '@playwright-repl/core';
import type { EngineResult } from '@playwright-repl/core';
import type { RunnerModule, SnapshotCache } from './types.js';
import { logEvent } from './logger.js';
import { descriptions } from './bridge.js';

export async function createEvaluateRunner(
    argv: string[],
    snapshotCache: SnapshotCache,
): Promise<RunnerModule> {
    const headed = argv.includes('--headed');
    const extPath = findExtensionPath(import.meta.url);
    if (!extPath) throw new Error('Chrome extension not found. Run "pnpm run build" first.');

    const conn = new EvaluateConnection();
    const pwModule = '@playwright/test';
    const { chromium } = await (Function('m', 'return import(m)')(pwModule)) as any;
    await conn.start(extPath, { headed, chromium });
    console.error(`playwright-repl evaluate mode (${headed ? 'headed' : 'headless'})`);
    logEvent(`Evaluate mode started`);

    return {
        descriptions,
        runner: {
            async runCommand(command: string): Promise<EngineResult> {
                // Local commands (video, etc.) — run in Node.js
                const localResult = await handleLocalCommand(command, conn.context);
                if (localResult) return localResult;

                const parsed = parseInput(command);
                const cmdName = parsed?._[0];
                const isUpdate = cmdName !== undefined && UPDATE_COMMANDS.has(cmdName);

                const result = await conn.run(command, isUpdate ? { includeSnapshot: true } : undefined);
                if (result.isError) return result;

                if (result.text) {
                    const snapMatch = result.text.match(/### Snapshot\n([\s\S]+)$/);
                    if (snapMatch) {
                        snapshotCache.value = { url: '', snapshotString: snapMatch[1].trim() };
                    } else if (cmdName === 'snapshot') {
                        snapshotCache.value = { url: '', snapshotString: result.text.trim() };
                    }
                }

                return result;
            },
            async runScript(script: string, language: 'pw' | 'javascript'): Promise<EngineResult> {
                return conn.runScript(script, language);
            },
        },
    };
}
