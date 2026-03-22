/**
 * Bridge runner — connects to Chrome via the Dramaturg extension over WebSocket.
 */

import { BridgeServer } from '@playwright-repl/core';
import type { EngineResult } from '@playwright-repl/core';
import type { RunnerModule, SnapshotCache } from './types.js';

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

Use snapshot to understand the page structure before interacting. Use screenshot to visually verify the current state.

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
    try {
        await srv.start(port);
    } catch (err: any) {
        if (err?.code === 'EADDRINUSE') {
            console.error(`Error: port ${port} is already in use. Another playwright-repl bridge or MCP inspector may be running. Stop it and restart Claude Desktop.`);
            process.exit(1);
        }
        throw err;
    }
    console.error(`playwright-repl bridge listening on ws://localhost:${port}`);
    srv.onConnect(() => console.error('Extension connected'));
    srv.onDisconnect(() => console.error('Extension disconnected'));

    return {
        descriptions,
        runner: {
            async runCommand(command: string): Promise<EngineResult> {
                if (!srv.connected) {
                    return { text: 'Browser not connected. Open Chrome with the playwright-repl extension — it connects automatically.', isError: true };
                }
                const result = await srv.run(command);
                // Bridge mode: snapshot returns raw YAML (no ### headers)
                const trimmed = command.trim().toLowerCase();
                if (trimmed.startsWith('snapshot') && result.text && !result.isError) {
                    snapshotCache.value = { url: '', snapshotString: result.text.trim() };
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
