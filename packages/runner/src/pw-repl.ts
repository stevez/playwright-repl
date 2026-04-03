/**
 * pw repl — REPL using serviceWorker.evaluate().
 *
 * Launches Chromium with the Dramaturg extension and provides
 * a Node REPL with Playwright globals (page, context, expect).
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
import { EvaluateConnection, findExtensionPath, minimist } from '@playwright-repl/core';

const __filename = fileURLToPath(import.meta.url);
const _require = createRequire(__filename);

export async function handleRepl(argv: string[]): Promise<void> {
  const args = minimist(argv, {
    string: ['port'],
    boolean: ['headless', 'headed'],
    default: { port: '' },
  });

  const port = args.port ? parseInt(args.port as string, 10) : 0;
  const headed = args.headed ? true : !args.headless;
  const scriptFile = args._[0] as string | undefined;

  // If --port is given, connect to existing Chrome via CDP (legacy mode)
  if (port) {
    const pw = _require('@playwright/test');
    const browser = await pw.chromium.connectOverCDP(`http://localhost:${port}`);
    const context = browser.contexts()[0];
    const pages = context?.pages() ?? [];
    const page = pages.find((p: { url: () => string }) => {
      const url = p.url();
      return !url.startsWith('devtools://') && !url.startsWith('chrome://') && !url.startsWith('about:');
    }) ?? pages[0];
    if (!page) {
      console.error('No page found. Open a page in the browser first.');
      process.exit(1);
    }
    const { expect } = _require('@playwright/test');
    console.log(`Connected to Chrome on port ${port}`);

    if (scriptFile) {
      const script = fs.readFileSync(scriptFile, 'utf-8');
      const fn = new Function('page', 'context', 'browser', 'expect',
        `return (async () => {\n${script}\n})()`);
      const start = performance.now();
      try {
        const result = await fn(page, context, browser, expect);
        const elapsed = performance.now() - start;
        if (result !== undefined) console.log(result);
        console.log(`\n${elapsed.toFixed(1)}ms`);
      } catch (e: unknown) {
        const elapsed = performance.now() - start;
        console.error((e as Error).message);
        console.log(`\n${elapsed.toFixed(1)}ms (error)`);
        process.exit(1);
      }
      process.exit(0);
    }

    const r = repl.start({ prompt: 'pw> ', useGlobal: true });
    Object.assign(r.context, { page, context, browser, expect });
    await new Promise<void>(resolve => r.on('exit', () => resolve()));
    process.exit(0);
  }

  // Default: evaluate mode — launch Chromium with extension
  const conn = new EvaluateConnection();
  const { chromium } = _require('@playwright/test');
  const extPath = findExtensionPath(import.meta.url);
  if (!extPath) throw new Error('Chrome extension not found. Run "pnpm run build" first.');
  await conn.start(extPath, { headed, chromium });
  console.log(`Connected (${headed ? 'headed' : 'headless'})`);

  if (scriptFile) {
    const script = fs.readFileSync(scriptFile, 'utf-8');
    const start = performance.now();
    try {
      const result = await conn.runScript(script, 'javascript');
      const elapsed = performance.now() - start;
      if (result.text) console.log(result.text);
      console.log(`${elapsed.toFixed(1)}ms${result.isError ? ' (error)' : ''}`);
    } catch (e: unknown) {
      const elapsed = performance.now() - start;
      console.error((e as Error).message);
      console.log(`${elapsed.toFixed(1)}ms (error)`);
    }
    await conn.close();
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
      conn.run(cmd).then(
        (result) => {
          lastElapsed = performance.now() - start;
          if (result.isError) cb(new Error(result.text || 'Unknown error'));
          else cb(null, result.text || undefined);
        },
        (err) => { lastElapsed = performance.now() - start; cb(err as Error); },
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
    r.on('exit', async () => { await conn.close(); resolve(); });
  });
  process.exit(0);
}
