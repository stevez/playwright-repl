/**
 * pw repl — interactive REPL with Playwright page objects.
 *
 * Launches Chromium directly (relay mode) and provides
 * a Node REPL with page, context, expect globals.
 *
 * Usage:
 *   pw repl                        # interactive REPL (headed)
 *   pw repl --headless             # headless mode
 *   pw repl --port 9222 bench.js   # connect to existing Chrome, run script
 */

import repl from 'node:repl';
import { inspect } from 'node:util';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { minimist, resolveCommand } from '@playwright-repl/core';

const __filename = fileURLToPath(import.meta.url);
const _require = createRequire(__filename);

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

export async function handleRepl(argv: string[]): Promise<void> {
  const args = minimist(argv, {
    string: ['port'],
    boolean: ['headless', 'headed'],
    default: { port: '' },
  });

  const port = args.port ? parseInt(args.port as string, 10) : 0;
  const headed = args.headed ? true : !args.headless;
  const scriptFile = args._[0] as string | undefined;

  // Load Playwright
  const pw = _require('@playwright/test');
  const { expect } = pw;

  let browser: unknown;
  let context: unknown;
  let page: unknown;

  if (port) {
    // Connect to existing Chrome via CDP
    browser = await pw.chromium.connectOverCDP(`http://localhost:${port}`);
    context = (browser as { contexts(): unknown[] }).contexts()[0];
    const pages = (context as { pages(): { url(): string }[] })?.pages() ?? [];
    page = pages.find((p: { url: () => string }) => {
      const url = p.url();
      return !url.startsWith('devtools://') && !url.startsWith('chrome://') && !url.startsWith('about:');
    }) ?? pages[0];
    if (!page) {
      console.error('No page found. Open a page in the browser first.');
      process.exit(1);
    }
    console.log(`Connected to Chrome on port ${port}`);
  } else {
    // Launch browser directly (relay mode)
    browser = await pw.chromium.launch({
      headless: !headed,
      args: ['--no-first-run', '--no-default-browser-check'],
    });
    context = await (browser as { newContext(): Promise<unknown> }).newContext();
    page = await (context as { newPage(): Promise<unknown> }).newPage();
    console.log(`Browser launched (${headed ? 'headed' : 'headless'})`);
  }

  // Run script file if provided
  if (scriptFile) {
    const script = fs.readFileSync(scriptFile, 'utf-8');
    const fn = new AsyncFunction('page', 'context', 'expect', script);
    const start = performance.now();
    try {
      const result = await fn(page, context, expect);
      const elapsed = performance.now() - start;
      if (result !== undefined) console.log(result);
      console.log(`\n${elapsed.toFixed(1)}ms`);
    } catch (e: unknown) {
      const elapsed = performance.now() - start;
      console.error((e as Error).message);
      console.log(`\n${elapsed.toFixed(1)}ms (error)`);
      process.exit(1);
    }
    await (browser as { close(): Promise<void> }).close();
    process.exit(0);
  }

  // Interactive REPL
  type EvalCb = (err: Error | null, result?: unknown) => void;
  let lastElapsed = 0;

  const r = repl.start({
    prompt: 'pw> ',
    eval: (input: string, _context: object, _file: string, cb: EvalCb) => {
      const cmd = input.trim();
      if (!cmd) { cb(null, undefined); return; }

      const start = performance.now();

      // Try keyword command first
      const resolved = resolveCommand(cmd);
      const jsExpr = resolved ? resolved.jsExpr : cmd;

      const fn = new AsyncFunction('page', 'context', 'expect', `return ${jsExpr}`);
      fn(page, context, expect).then(
        (result: unknown) => {
          lastElapsed = performance.now() - start;
          cb(null, result ?? undefined);
        },
        (err: Error) => {
          lastElapsed = performance.now() - start;
          cb(err);
        },
      );
    },
    writer(value: unknown): string {
      const formatted = value === undefined || value === null ? '' :
        typeof value === 'string' ? value :
        inspect(value, { depth: 1, colors: true });
      const timing = `(${lastElapsed.toFixed(1)}ms)`;
      lastElapsed = 0;
      if (!formatted) return timing;
      return `${formatted}\n${timing}`;
    },
  });

  await new Promise<void>(resolve => {
    r.on('exit', async () => {
      await (browser as { close(): Promise<void> }).close();
      resolve();
    });
  });
  process.exit(0);
}
