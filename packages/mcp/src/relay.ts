/**
 * Relay runner — connects to Chrome via CDP relay for real Playwright page objects.
 *
 * Supports both keyword commands (via BrowserBackend) and JavaScript (via AsyncFunction).
 * JS scripts execute in Node.js with full access to filesystem, npm packages, and streams.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import { CDPRelayServer, parseInput, resolveArgs, UPDATE_COMMANDS, ALL_COMMANDS, replVersion } from '@playwright-repl/core';
import type { EngineResult } from '@playwright-repl/core';
import type { RunnerModule } from './types.js';
import { logEvent } from './logger.js';

import type { Browser, BrowserContext, Page } from '@playwright/test';

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// ─── Playwright backend deps (same pattern as Engine) ───────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
interface PlaywrightDeps {
    BrowserBackend: new (config: any, browserContext: any, tools: any[]) => any;
    browserTools: any[];
    resolveConfig: (config: any) => Promise<any> | any;
    commands: Record<string, any>;
    parseCommand: (command: any, args: any) => { toolName: string; toolParams: Record<string, any> };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

let _deps: PlaywrightDeps | undefined;

function loadDeps(): PlaywrightDeps {
    if (_deps) return _deps;
    const require = createRequire(import.meta.url);
    // Resolve playwright-core through @playwright/test → playwright → playwright-core chain (pnpm strict mode)
    const pwTestDir = path.dirname(require.resolve('@playwright/test/package.json'));
    const pwTestReq = createRequire(path.join(pwTestDir, 'package.json'));
    const pwDir = path.dirname(pwTestReq.resolve('playwright/package.json'));
    const pwReq = createRequire(path.join(pwDir, 'package.json'));
    const pwCoreDir = path.dirname(pwReq.resolve('playwright-core/package.json'));
    const pwCoreReq = (sub: string) => require(path.join(pwCoreDir, sub));
    _deps = {
        BrowserBackend:  pwCoreReq('lib/tools/backend/browserBackend.js').BrowserBackend,
        browserTools:    pwCoreReq('lib/tools/backend/tools.js').browserTools,
        resolveConfig:   pwCoreReq('lib/tools/mcp/config.js').resolveConfig,
        commands:        pwCoreReq('lib/tools/cli-daemon/commands.js').commands,
        parseCommand:    pwCoreReq('lib/tools/cli-daemon/command.js').parseCommand,
    };
    return _deps;
}

// ─── Descriptions ───────────────────────────────────────────────────────────

import { descriptions as bridgeDescriptions } from './bridge.js';

export const descriptions = {
    ...bridgeDescriptions,

    runCommand: bridgeDescriptions.runCommand + `

RELAY MODE BONUS: Since this server runs in relay mode, JavaScript commands execute in Node.js with real Playwright page objects. You get full access to:
  - Filesystem (fs, path)
  - npm packages (await import('exceljs'))
  - Local modules (await import('./helpers.mjs'))
  - No timeout limits`,

    runScript: bridgeDescriptions.runScript + `

RELAY MODE BONUS: language='javascript' scripts execute in Node.js with full access to filesystem, npm packages, streams, and child processes. No timeout limits.`,
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

function formatJsResult(value: unknown): string {
    if (value === undefined || value === null) return 'Done';
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

function formatToolResult(result: { content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>; isError?: boolean }): EngineResult {
    let text: string | undefined;
    let image: string | undefined;
    for (const item of result.content) {
        if (item.type === 'text' && !text) text = item.text;
        if (item.type === 'image' && !image) image = `data:${item.mimeType || 'image/png'};base64,${item.data}`;
    }
    return { isError: result.isError, text, image };
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let backend: any = null;

    async function ensureConnected(): Promise<{ page: Page; context: BrowserContext }> {
        // Already connected and alive
        if (browser && page) {
            try {
                await page.title(); // health check
                return { page, context: context! };
            } catch {
                logEvent('Page connection stale, reconnecting...');
                browser = null;
                context = null;
                page = null;
                backend = null;
            }
        }

        // Wait for extension to connect to relay
        if (!relay.extensionConnected) {
            console.error('Waiting for extension to connect...');
            logEvent('Waiting for extension...');
            await relay.waitForExtension(30000);
            console.error('Extension connected');
            logEvent('Extension connected');
        }

        // Connect Playwright via CDP
        const pwModule = '@playwright/test';
        const pw = await (Function('m', 'return import(m)')(pwModule)) as typeof import('@playwright/test');
        expect = pw.expect;

        browser = await pw.chromium.connectOverCDP(relay.cdpEndpoint());
        context = browser.contexts()[0];
        page = context.pages()[0];

        if (!page) {
            throw new Error('No page found — make sure a tab is open in Chrome');
        }

        // Create BrowserBackend for keyword command support
        const deps = loadDeps();
        const config = await deps.resolveConfig({
            browser: { browserName: 'chromium', launchOptions: {}, contextOptions: { viewport: null }, isolated: false },
            server: {},
            network: {},
            timeouts: { action: 5000, navigation: 15000 },
        });
        backend = new deps.BrowserBackend(config, context, deps.browserTools);
        const cwd = process.cwd();
        await backend.initialize?.({
            name: 'playwright-repl',
            version: replVersion,
            cwd,
            roots: [{ uri: url.pathToFileURL(cwd).href, name: 'cwd' }],
            timestamp: Date.now(),
        });

        logEvent(`Connected to page: ${page.url()}`);
        console.error(`Connected to page: ${page.url()}`);
        return { page, context };
    }

    // ── JS execution ────────────────────────────────────────────────────────

    async function executeJS(script: string): Promise<EngineResult> {
        const { page: p, context: ctx } = await ensureConnected();

        try {
            const fn = new AsyncFunction('page', 'context', 'expect', script);
            const result = await fn(p, ctx, expect);
            return { text: formatJsResult(result), isError: false };
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);

            // Stale page — try reconnecting once
            if (msg.includes('Target closed') || msg.includes('TargetClosedError')) {
                browser = null; context = null; page = null; backend = null;
                try {
                    const { page: p2, context: ctx2 } = await ensureConnected();
                    const fn = new AsyncFunction('page', 'context', 'expect', script);
                    const result = await fn(p2, ctx2, expect);
                    return { text: formatJsResult(result), isError: false };
                } catch (retryErr: unknown) {
                    return { text: retryErr instanceof Error ? retryErr.message : String(retryErr), isError: true };
                }
            }

            return { text: msg, isError: true };
        }
    }

    // ── Keyword execution ───────────────────────────────────────────────────

    async function executeKeyword(args: ReturnType<typeof parseInput>): Promise<EngineResult> {
        await ensureConnected();
        if (!backend) throw new Error('Backend not initialized');

        const deps = loadDeps();
        // resolveArgs transforms role-based, text-based, verify, etc. into run-code
        const resolved = resolveArgs(args!);
        const command = deps.commands[resolved._[0]];
        if (!command) {
            return { text: `Unknown command: ${resolved._[0]}`, isError: true };
        }

        const { toolName, toolParams } = deps.parseCommand(command, resolved);
        if (!toolName) {
            return { text: `Command "${args!._[0]}" is not supported in relay mode.`, isError: true };
        }

        toolParams._meta = { cwd: process.cwd() };
        try {
            const response = await backend.callTool(toolName, toolParams);
            return formatToolResult(response);
        } catch (e: unknown) {
            return { text: e instanceof Error ? e.message : String(e), isError: true };
        }
    }

    // ── Detect mode: keyword or JS ──────────────────────────────────────────

    function isKeywordCommand(command: string): boolean {
        const parsed = parseInput(command);
        if (!parsed) return false;
        const cmdName = parsed._[0];
        if (!cmdName) return false;
        return ALL_COMMANDS.includes(cmdName);
    }

    return {
        descriptions,
        runner: {
            async runCommand(command: string): Promise<EngineResult> {
                const trimmed = command.trim();

                // Keyword command → BrowserBackend
                if (isKeywordCommand(trimmed)) {
                    const parsed = parseInput(trimmed)!;
                    const cmdName = parsed._[0];
                    const isUpdate = UPDATE_COMMANDS.has(cmdName);
                    const result = await executeKeyword(parsed);

                    // Auto-append snapshot for update commands
                    if (!result.isError && isUpdate) {
                        const snap = await executeKeyword(parseInput('snapshot')!).catch(() => null);
                        if (snap && !snap.isError && snap.text) {
                            const resultText = result.text?.trim() || '';
                            result.text = resultText
                                ? `### Result\n${resultText}\n### Snapshot\n${snap.text}`
                                : `### Snapshot\n${snap.text}`;
                        }
                    }
                    return result;
                }

                // JavaScript → AsyncFunction
                const script = isSingleExpression(trimmed)
                    ? `return ${trimmed.replace(/;$/, '')}`
                    : trimmed;
                return executeJS(script);
            },

            async runScript(script: string, language: 'pw' | 'javascript'): Promise<EngineResult> {
                if (language === 'pw') {
                    // Run each line as a keyword command
                    const lines = script.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
                    const output: string[] = [];
                    for (const line of lines) {
                        const parsed = parseInput(line);
                        if (!parsed) continue;
                        const result = await executeKeyword(parsed);
                        const mark = result.isError ? '\u2717' : '\u2713';
                        output.push(`${mark} ${line}${result.text ? `\n  ${result.text}` : ''}`);
                        if (result.isError) {
                            return { text: output.join('\n'), isError: true };
                        }
                    }
                    return { text: output.join('\n'), isError: false };
                }
                return executeJS(script);
            },
        },
    };
}
