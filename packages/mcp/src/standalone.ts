/**
 * Standalone runner — launches a browser directly via Playwright (relay mode).
 * No Chrome extension dependency.
 */

import { resolveCommand, UPDATE_COMMANDS } from '@playwright-repl/core';
import type { EngineResult } from '@playwright-repl/core';
import type { RunnerModule } from './types.js';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function isSingleExpression(code: string): boolean {
    const trimmed = code.trim();
    if (trimmed.includes('\n')) return false;
    const withoutTrailing = trimmed.replace(/;$/, '');
    if (withoutTrailing.includes(';')) return false;
    if (/^(const |let |var |if |for |while |switch |try |class |function )/.test(trimmed)) return false;
    return true;
}

function formatResult(value: unknown): EngineResult {
    if (value === undefined || value === null) return { text: 'Done', isError: false };
    if (typeof value === 'string') {
        try {
            const obj = JSON.parse(value);
            if (obj && typeof obj === 'object' && '__image' in obj)
                return { text: '', isError: false, image: `data:${obj.mimeType};base64,${obj.__image}` };
        } catch { /* not JSON */ }
        return { text: value, isError: false };
    }
    if (typeof value === 'object' && value !== null && '__image' in value) {
        const img = value as { __image: string; mimeType: string };
        return { text: '', isError: false, image: `data:${img.mimeType};base64,${img.__image}` };
    }
    if (typeof value === 'number' || typeof value === 'boolean') return { text: String(value), isError: false };
    try { return { text: JSON.stringify(value, null, 2), isError: false }; }
    catch { return { text: String(value), isError: false }; }
}

export const descriptions = {
    runCommandInput: `A keyword command ('snapshot', 'goto https://example.com', 'click Submit', \
'fill "Email" user@example.com') or JavaScript expression ('await page.title()')`,

    runCommand: `Run a command in the browser. Supports KEYWORD (.pw) commands and JavaScript.

Keyword commands:
   snapshot, goto <url>, click <text>, fill <label> <value>, press <key>,
   verify-text <text>, verify-no-text <text>, screenshot,
   check <label>, select <label> <value>, localstorage-list, localstorage-clear

JavaScript: any expression using page, context, expect (e.g. 'await page.title()')

Update commands (click, fill, goto, press, hover, select, check, uncheck, etc.) automatically include a snapshot of the page after the action. You do NOT need to call snapshot separately after these commands.

Use snapshot only for initial exploration or after read-only commands. Use screenshot to visually verify the current state.

IMPORTANT: Before writing .pw commands, run 'help' to get the full list of available commands. Only use commands that appear in the help output. Do not invent commands.`,

    runScript: `Run a multi-line script. Supports both .pw keyword commands (language='pw') and JavaScript (language='javascript').
For .pw: each line is a keyword command, run sequentially. Lines starting with # are skipped. Stops on first error.
For JavaScript: full Playwright API with page, context, expect.

IMPORTANT: Only use commands listed by 'help'. Run run_command('help') first if unsure which commands are available.`,

    scriptOnly: false,
} as const;

export function createStandaloneRunner(
    headed: boolean,
): RunnerModule {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let page: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let context: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let expect: any = null;
    let starting: Promise<void> | null = null;

    async function ensureBrowser(): Promise<void> {
        if (page) return;
        if (starting) return starting;
        starting = (async () => {
            const pwModule = '@playwright/test';
            const pw = await (Function('m', 'return import(m)')(pwModule));
            expect = pw.expect;
            const browser = await pw.chromium.launch({
                headless: !headed,
                args: ['--no-first-run', '--no-default-browser-check'],
            });
            context = await browser.newContext();
            page = await context.newPage();
            console.error(`playwright-repl standalone started (${headed ? 'headed' : 'headless'}, relay mode)`);
        })();
        return starting;
    }

    async function executeExpr(jsExpr: string): Promise<EngineResult> {
        await ensureBrowser();
        try {
            const fn = new AsyncFunction('page', 'context', 'expect', jsExpr);
            const result = await fn(page, context, expect);
            return formatResult(result);
        } catch (e: unknown) {
            return { text: e instanceof Error ? e.message : String(e), isError: true };
        }
    }

    return {
        descriptions,
        runner: {
            async runCommand(command: string): Promise<EngineResult> {
                const trimmed = command.trim();

                // Keyword command → resolveCommand → jsExpr
                const resolved = resolveCommand(trimmed);
                if (resolved) {
                    const result = await executeExpr(resolved.jsExpr);
                    // Auto-append snapshot for update commands
                    const cmdName = trimmed.split(/\s+/)[0].toLowerCase();
                    if (!result.isError && UPDATE_COMMANDS.has(cmdName)) {
                        const snapResolved = resolveCommand('snapshot');
                        if (snapResolved) {
                            const snap = await executeExpr(snapResolved.jsExpr).catch(() => null);
                            if (snap && !snap.isError && snap.text) {
                                const resultText = result.text?.trim() || '';
                                result.text = resultText
                                    ? `### Result\n${resultText}\n### Snapshot\n${snap.text}`
                                    : `### Snapshot\n${snap.text}`;
                            }
                        }
                    }
                    return result;
                }

                // JavaScript → AsyncFunction
                const script = isSingleExpression(trimmed)
                    ? `return ${trimmed.replace(/;$/, '')}`
                    : trimmed;
                return executeExpr(script);
            },

            async runScript(script: string, language: 'pw' | 'javascript'): Promise<EngineResult> {
                if (language === 'javascript') {
                    return executeExpr(script);
                }
                // .pw keyword script — line by line
                const lines = script.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
                const results: string[] = [];
                for (const line of lines) {
                    const resolved = resolveCommand(line.trim());
                    if (!resolved) {
                        results.push(`✗ ${line.trim()} — Unknown command`);
                        return { text: results.join('\n'), isError: true };
                    }
                    const result = await executeExpr(resolved.jsExpr);
                    const status = result.isError ? '✗' : '✓';
                    results.push(`${status} ${line.trim()}${result.isError && result.text ? ` — ${result.text}` : ''}`);
                    if (result.isError)
                        return { text: results.join('\n'), isError: true };
                }
                return { text: results.join('\n'), isError: false };
            },
        },
    };
}
