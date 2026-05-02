/**
 * Relay E2E test fixtures.
 *
 * Launches Chromium directly (no extension) with a real Playwright page.
 * Commands are executed via resolveCommand → AsyncFunction — same path
 * as the CLI relay mode and VS Code relay mode.
 *
 * A local HTTP server serves test-page.html to eliminate network latency.
 */

import { test as base, chromium, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { resolveCommand, UPDATE_COMMANDS, COMMANDS, CATEGORIES } from '../../../core/dist/index.js';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEST_PAGE_PATH = path.resolve(__dirname, 'test-page.html');

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

type RelayContext = {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  testUrl: string;
};

type CommandResult = { text?: string; isError?: boolean; image?: string };

/**
 * Execute a command via relay mode — keyword or JavaScript.
 * Same execution path as BrowserManager._execExpr / relayExec in CLI.
 */
async function relayRun(
  command: string,
  page: Page,
  context: BrowserContext,
  expectFn: typeof expect,
): Promise<CommandResult> {
  const trimmed = command.trim();

  // Help commands — handled locally (not a Playwright MCP command)
  if (trimmed === 'help') {
    const lines = Object.entries(CATEGORIES).map(([cat, cmds]) => `  ${cat}: ${(cmds as string[]).join(', ')}`);
    return { text: `Available commands:\n${lines.join('\n')}`, isError: false };
  }
  if (trimmed.startsWith('help ')) {
    const cmd = trimmed.slice(5).trim();
    const info = COMMANDS[cmd] as { desc?: string; usage?: string; examples?: string[] } | undefined;
    if (!info) return { text: `Unknown command: "${cmd}"`, isError: true };
    const parts = [`${cmd} — ${info.desc || ''}`];
    if (info.usage) parts.push(`Usage: ${info.usage}`);
    return { text: parts.join('\n'), isError: false };
  }

  // Keyword command → resolveCommand → jsExpr
  const resolved = resolveCommand(trimmed);
  if (resolved) {
    try {
      const fn = new AsyncFunction('page', 'context', 'expect', resolved.jsExpr);
      const result = await fn(page, context, expectFn);
      return formatResult(result);
    } catch (e: unknown) {
      return { text: e instanceof Error ? e.message : String(e), isError: true };
    }
  }

  // JavaScript — wrap single expressions with return
  const isSingleExpr = !trimmed.includes('\n') && !trimmed.replace(/;$/, '').includes(';')
    && !/^(const |let |var |if |for |while |switch |try |class |function )/.test(trimmed);
  const script = isSingleExpr ? `return ${trimmed.replace(/;$/, '')}` : trimmed;
  try {
    const fn = new AsyncFunction('page', 'context', 'expect', script);
    const result = await fn(page, context, expectFn);
    return formatResult(result);
  } catch (e: unknown) {
    return { text: e instanceof Error ? e.message : String(e), isError: true };
  }
}

async function relayRunScript(
  script: string,
  language: 'pw' | 'javascript',
  page: Page,
  context: BrowserContext,
  expectFn: typeof expect,
): Promise<CommandResult> {
  if (language === 'javascript') {
    try {
      const fn = new AsyncFunction('page', 'context', 'expect', script);
      const result = await fn(page, context, expectFn);
      return formatResult(result);
    } catch (e: unknown) {
      return { text: e instanceof Error ? e.message : String(e), isError: true };
    }
  }
  // .pw — line by line
  const lines = script.split('\n').filter(l => l.trim() && !l.trim().startsWith('#'));
  const results: string[] = [];
  for (const line of lines) {
    const r = await relayRun(line.trim(), page, context, expectFn);
    const status = r.isError ? '\u2717' : '\u2713';
    results.push(`${status} ${line.trim()}${r.isError && r.text ? ` \u2014 ${r.text}` : ''}`);
    if (r.isError) return { text: results.join('\n'), isError: true };
  }
  return { text: results.join('\n'), isError: false };
}

function formatResult(value: unknown): CommandResult {
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

export const test = base.extend<
  {
    relay: { run: (cmd: string) => Promise<CommandResult>; runScript: (script: string, language: 'pw' | 'javascript') => Promise<CommandResult> };
    testUrl: string;
  },
  { relayContext: RelayContext }
>({
  // Worker-scoped: browser + HTTP server, reused across all tests in a worker
  relayContext: [async ({}, use) => {
    // Start local HTTP server for test pages
    const html = fs.readFileSync(TEST_PAGE_PATH, 'utf-8');
    const httpServer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(html);
    });
    await new Promise<void>(resolve => httpServer.listen(0, resolve));
    const httpPort = (httpServer.address() as { port: number }).port;
    const testUrl = `http://localhost:${httpPort}`;

    // Launch browser directly — same as relay mode
    const browser = await chromium.launch({
      headless: !process.env.HEADED,
      args: ['--no-first-run', '--no-default-browser-check'],
    });
    const context = await browser.newContext();
    const page = await context.newPage();

    await use({ browser, context, page, testUrl });

    await browser.close();
    httpServer.close();
  }, { scope: 'worker' }],

  // Test-scoped relay runner
  relay: async ({ relayContext }, use) => {
    const { page, context } = relayContext;
    await use({
      run: (cmd: string) => relayRun(cmd, page, context, expect),
      runScript: (script: string, language: 'pw' | 'javascript') => relayRunScript(script, language, page, context, expect),
    });
  },

  testUrl: async ({ relayContext }, use) => {
    await use(relayContext.testUrl);
  },
});
