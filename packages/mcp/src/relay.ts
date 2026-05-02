/**
 * Relay runner — connects to Chrome via CDP relay for real Playwright page objects.
 *
 * Keywords resolve to JS expressions via resolveCommand (pure Playwright API).
 * JS scripts execute in Node.js with full access to filesystem, npm packages, and streams.
 * No BrowserBackend — direct execution against the real page object.
 */

import { CDPRelayServer, resolveCommand, UPDATE_COMMANDS } from '@playwright-repl/core';
import type { EngineResult } from '@playwright-repl/core';
import type { RunnerModule } from './types.js';
import { logEvent } from './logger.js';

import type { Browser, BrowserContext, Page } from '@playwright/test';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ─── Descriptions ───────────────────────────────────────────────────────────

import { descriptions as standaloneDescriptions } from './standalone.js';

export const descriptions = {
    ...standaloneDescriptions,

    runCommand: standaloneDescriptions.runCommand + `

RELAY MODE: JavaScript commands execute in Node.js with real Playwright page objects. Full access to filesystem, npm packages, and local modules.`,

    runScript: standaloneDescriptions.runScript + `

RELAY MODE: language='javascript' scripts execute in Node.js with full access to filesystem, npm packages, streams, and child processes.`,
};

// ─── Script execution ───────────────────────────────────────────────────────

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

    // Screenshot/PDF: { __image, mimeType }
    if (typeof value === 'string') {
        try {
            const obj = JSON.parse(value);
            if (obj && typeof obj === 'object' && '__image' in obj) {
                return { text: '', isError: false, image: `data:${obj.mimeType};base64,${obj.__image}` };
            }
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

// ─── Runner ─────────────────────────────────────────────────────────────────

export async function createRelayRunner(
    argv: string[],
): Promise<RunnerModule> {
    const portIdx = argv.indexOf('--port');
    const port = portIdx !== -1
        ? parseInt(argv[portIdx + 1])
        : (process.env.RELAY_PORT ? parseInt(process.env.RELAY_PORT) : 9877);

    const relay = new CDPRelayServer();
    await relay.start(port);
    console.error(`playwright-repl CDP relay listening on ${relay.cdpEndpoint()}`);
    console.error(`Extension endpoint: ${relay.relayEndpoint()}`);
    logEvent(`Relay listening on ${relay.cdpEndpoint()}`);

    // Playwright connection — established lazily on first command
    let browser: Browser | null = null;
    let context: BrowserContext | null = null;
    let page: Page | null = null;
    let expect: typeof import('@playwright/test').expect;

    async function ensureConnected(): Promise<{ page: Page; context: BrowserContext }> {
        if (browser && page) {
            try {
                await page.title();
                return { page, context: context! };
            } catch {
                logEvent('Page connection stale, reconnecting...');
                browser = null;
                context = null;
                page = null;
            }
        }

        if (!relay.extensionConnected) {
            console.error('Waiting for extension to connect...');
            logEvent('Waiting for extension...');
            await relay.waitForExtension(30000);
            console.error('Extension connected');
            logEvent('Extension connected');
        }

        const pwModule = '@playwright/test';
        const pw = await (Function('m', 'return import(m)')(pwModule)) as typeof import('@playwright/test');
        expect = pw.expect;

        browser = await pw.chromium.connectOverCDP(relay.cdpEndpoint());
        context = browser.contexts()[0];
        page = context.pages()[0];

        if (!page) throw new Error('No page found — make sure a tab is open in Chrome');

        logEvent(`Connected to page: ${page.url()}`);
        console.error(`Connected to page: ${page.url()}`);
        return { page, context };
    }

    async function executeExpr(jsExpr: string): Promise<EngineResult> {
        const { page: p } = await ensureConnected();
        try {
            const fn = new AsyncFunction('page', 'context', 'expect', jsExpr);
            const result = await fn(p, context, expect);
            return formatResult(result);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('Target closed') || msg.includes('TargetClosedError')) {
                browser = null; context = null; page = null;
                try {
                    const { page: p2 } = await ensureConnected();
                    const fn = new AsyncFunction('page', 'context', 'expect', jsExpr);
                    const result = await fn(p2, context, expect);
                    return formatResult(result);
                } catch (retryErr: unknown) {
                    return { text: retryErr instanceof Error ? retryErr.message : String(retryErr), isError: true };
                }
            }
            return { text: msg, isError: true };
        }
    }

    return {
        descriptions,
        runner: {
            async runCommand(command: string): Promise<EngineResult> {
                const trimmed = command.trim();

                // Keyword command → resolveCommand → jsExpr → direct execution
                const resolved = resolveCommand(trimmed);
                if (resolved) {
                    const result = await executeExpr(resolved.jsExpr);
                    if (result.isError) return result;

                    // Auto-append snapshot for update commands
                    const cmdName = trimmed.split(/\s+/)[0].toLowerCase();
                    if (UPDATE_COMMANDS.has(cmdName)) {
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
                if (language === 'pw') {
                    const lines = script.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                    const output: string[] = [];
                    for (const line of lines) {
                        const resolved = resolveCommand(line);
                        if (!resolved) {
                            output.push(`\u2717 ${line}\n  Unknown command`);
                            return { text: output.join('\n'), isError: true };
                        }
                        const result = await executeExpr(resolved.jsExpr);
                        const mark = result.isError ? '\u2717' : '\u2713';
                        output.push(`${mark} ${line}${result.text ? `\n  ${result.text}` : ''}`);
                        if (result.isError) return { text: output.join('\n'), isError: true };
                    }
                    return { text: output.join('\n'), isError: false };
                }
                return executeExpr(script);
            },
        },
    };
}
