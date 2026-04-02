/**
 * Bridge runner — connects to Chrome via the Dramaturg extension over WebSocket.
 */

import { BridgeServer, UPDATE_COMMANDS, parseInput } from '@playwright-repl/core';
import type { EngineResult } from '@playwright-repl/core';
import type { RunnerModule, SnapshotCache } from './types.js';
import { logEvent } from './logger.js';

export const descriptions = {
    runCommandInput: `A keyword command ('snapshot', 'goto https://example.com', 'click Submit', \
'fill "Email" user@example.com') or a Playwright expression ('await page.url()')`,

    runCommand: `Run a command in the connected Chrome browser. Supports two input modes:

1. KEYWORD (.pw) — playwright-repl commands:
   snapshot, goto <url>, click <text>, fill <label> <value>, press <key>,
   verify-text <text>, verify-no-text <text>, screenshot,
   check <label>, select <label> <value>, localstorage-list, localstorage-clear

2. PLAYWRIGHT — Playwright API (page.* / crxApp.*):
   await page.url(), await page.title(),
   await page.locator('button').count(),
   await page.evaluate(() => document.title)

Update commands (click, fill, goto, press, hover, select, check, uncheck, etc.) automatically include a snapshot of the page after the action. You do NOT need to call snapshot separately after these commands.

Use snapshot only for initial exploration or after read-only commands. Use screenshot to visually verify the current state.

IMPORTANT: Before writing .pw commands, run 'help' to get the full list of available commands. Only use commands that appear in the help output. Do not invent commands.`,

    runScript: `Run a multi-line script, returning combined pass/fail results.
Useful for replaying a known script without per-step round trips.
Prefer run_command for AI-driven exploration where you need to observe and adapt after each step.

language='pw': each line is a .pw keyword command, run sequentially. Lines starting with # are skipped. Stops on first error.
language='javascript': the entire script is run as a single JavaScript/Playwright block.

IMPORTANT: Only use commands listed by 'help'. Run run_command('help') first if unsure which commands are available.`,

    scriptOnly: false,
} as const;

export async function createBridgeRunner(
    argv: string[],
    snapshotCache: SnapshotCache,
): Promise<RunnerModule> {
    const portIdx = argv.indexOf('--port');
    const port = portIdx !== -1
        ? parseInt(argv[portIdx + 1])
        : (process.env.BRIDGE_PORT ? parseInt(process.env.BRIDGE_PORT) : 9876);

    const srv = new BridgeServer();
    await srv.start(port);
    console.error(`playwright-repl bridge listening on ws://localhost:${port}`);
    logEvent(`Bridge listening on ws://localhost:${port}`);
    srv.onConnect(() => { console.error('Extension connected'); logEvent('Extension connected'); });
    srv.onDisconnect(() => { console.error('Extension disconnected'); logEvent('Extension disconnected'); });

    return {
        descriptions,
        runner: {
            async runCommand(command: string): Promise<EngineResult> {
                if (!srv.connected) {
                    return { text: 'Browser not connected. Open Chrome with the playwright-repl extension — it connects automatically.', isError: true };
                }

                // Determine command name for snapshot logic
                const parsed = parseInput(command);
                const cmdName = parsed?._[0];
                const isUpdate = cmdName !== undefined && UPDATE_COMMANDS.has(cmdName);

                // Request snapshot in the same round-trip for update commands
                const result = await srv.run(command, isUpdate ? { includeSnapshot: true } : undefined);
                if (result.isError) return result;

                // Cache snapshot (from explicit snapshot command or appended by handler)
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
                if (!srv.connected) {
                    return { text: 'Browser not connected. Open Chrome with the playwright-repl extension — it connects automatically.', isError: true };
                }
                return srv.runScript(script, language);
            },
        },
    };
}
