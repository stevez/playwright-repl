/**
 * Standalone runner — launches a browser via Engine (in-process Playwright).
 */

import { parseInput, resolveArgs, filterResponse } from '@playwright-repl/core';
import type { EngineResult } from '@playwright-repl/core';
import { Engine } from 'playwright-repl';
import type { RunnerModule, SnapshotCache } from './types.js';

const INCLUDE_SNAPSHOT = { includeSnapshot: true } as const;

export const descriptions = {
    runCommandInput: `A keyword command ('snapshot', 'goto https://example.com', 'click Submit', \
'fill "Email" user@example.com')`,

    runCommand: `Run a command in the browser. Supports KEYWORD (.pw) — playwright-repl commands:
   snapshot, goto <url>, click <text>, fill <label> <value>, press <key>,
   verify-text <text>, verify-no-text <text>, screenshot,
   check <label>, select <label> <value>, localstorage-list, localstorage-clear

Update commands (click, fill, goto, press, hover, select, check, uncheck, etc.) automatically include a snapshot of the page after the action. You do NOT need to call snapshot separately after these commands.

Use snapshot only for initial exploration or after read-only commands. Use screenshot to visually verify the current state.

IMPORTANT: Before writing .pw commands, run 'help' to get the full list of available commands. Only use commands that appear in the help output. Do not invent commands.`,

    runScript: `Run a multi-line .pw keyword script, returning combined pass/fail results.
Each line is a .pw keyword command, run sequentially. Lines starting with # are skipped. Stops on first error.
Useful for replaying a known script without per-step round trips.

IMPORTANT: Only use commands listed by 'help'. Run run_command('help') first if unsure which commands are available.`,

    scriptOnly: true,
} as const;

export function createStandaloneRunner(
    headed: boolean,
    snapshotCache: SnapshotCache,
): RunnerModule {
    let engine: Engine | null = null;
    let starting: Promise<Engine> | null = null;

    function ensureEngine(): Promise<Engine> {
        if (engine) return Promise.resolve(engine);
        if (!starting) {
            const e = new Engine();
            starting = e.start({ headed }).then(() => {
                engine = e;
                console.error(`playwright-repl standalone engine started (${headed ? 'headed' : 'headless'})`);
                return e;
            });
        }
        return starting;
    }

    async function runSingleCommand(command: string): Promise<EngineResult> {
        const e = await ensureEngine();
        const args = parseInput(command);
        if (!args) return { text: `Unknown command: ${command}`, isError: true };
        const cmdName = args._[0];
        const resolved = resolveArgs(args);
        const result = await e.run(resolved);

        // Cache snapshot for locator command — strip YAML code fences
        if (result.text && !result.isError) {
            const snapshotMatch = result.text.match(/### Snapshot\n([\s\S]*?)(?=\n### |$)/);
            if (snapshotMatch) {
                const raw = snapshotMatch[1].trim();
                const yamlBody = raw.replace(/^```(?:yaml)?\n?/, '').replace(/\n?```$/, '');
                snapshotCache.value = { url: '', snapshotString: yamlBody };
            }
        }

        // Filter verbose Playwright response sections — keep snapshots for MCP
        if (result.text) result.text = filterResponse(result.text, cmdName, INCLUDE_SNAPSHOT);
        return result;
    }

    return {
        descriptions,
        runner: {
            runCommand: runSingleCommand,
            async runScript(script: string, language: 'pw' | 'javascript'): Promise<EngineResult> {
                if (language === 'javascript') {
                    return { text: 'JavaScript mode is not supported in standalone mode. Use language="pw" with run-code or eval keywords.', isError: true };
                }
                const lines = script.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
                const results: string[] = [];
                for (const line of lines) {
                    const result = await runSingleCommand(line.trim());
                    const status = result.isError ? '✗' : '✓';
                    results.push(`${status} ${line.trim()}${result.isError && result.text ? ` — ${result.text}` : ''}`);
                    if (result.isError) {
                        return { text: results.join('\n'), isError: true };
                    }
                }
                return { text: results.join('\n'), isError: false };
            },
        },
    };
}
