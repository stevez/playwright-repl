#!/usr/bin/env node
/**
 * pw — drop-in replacement for npx playwright test
 *
 * Routes test files:
 * - Bridge-eligible files → direct bridge execution (fast, no test runner overhead)
 * - Node-mode files → standard `npx playwright test` (full compatibility)
 *
 * When no bridge is available, all tests go through standard Playwright.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const _require = createRequire(__filename);

// Resolve Playwright CLI from the user's project to avoid duplicate module instances
const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
let pwCliPath: string;
try {
  pwCliPath = projectRequire.resolve('@playwright/test/cli');
} catch {
  pwCliPath = _require.resolve('@playwright/test/cli');
}
// Chrome extension: monorepo first (dev, has latest changes), then bundled (npm)
const monorepoExt = path.resolve(path.dirname(__filename), '../../extension/dist');
const bundledExt = path.resolve(path.dirname(__filename), 'chrome-extension');
const extPath = fs.existsSync(path.join(monorepoExt, 'manifest.json'))
  ? monorepoExt
  : bundledExt;

const args = process.argv.slice(2);
const subcommand = args[0];

// ─── Subcommands ─────────────────────────────────────────────────────────────

if (subcommand === 'repl') {
  const { handleRepl } = await import('./pw-repl.js');
  await handleRepl(args.slice(1));
  // handleRepl keeps process alive via node:repl — don't exit here
}


// ─── Default: test ───────────────────────────────────────────────────────────

if (args.length === 0 || (args[0] && args[0].startsWith('-'))) {
  args.unshift('test');
}

if (args[0] === 'test') {
  // Try direct execution via serviceWorker.evaluate() for bridge-eligible tests
  const handled = await tryDirectEvaluate(args.slice(1), extPath);
  if (handled !== null) {
    process.exit(handled);
  }
}

// Fallback: run tests via standard Playwright
const child = spawn(process.execPath, [pwCliPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    PW_EXT_PATH: extPath,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});

// ─── Direct evaluate mode ────────────────────────────────────────────────────

/**
 * Try to run tests directly via serviceWorker.evaluate().
 * Returns exit code (0 = all passed, 1 = failures) or null if fallback needed.
 */
async function tryDirectEvaluate(testArgs: string[], extensionPath: string): Promise<number | null> {
  const { createRequire: cr } = await import('node:module');
  const require = cr(import.meta.url);

  let bridgeUtils: {
    needsNode: (filePath: string) => boolean;
    compile: (filePath: string) => Promise<string>;
    parseAllResults: (text: string) => { status: string; duration: number; errors: { message: string }[] }[];
  };
  try {
    bridgeUtils = require('./bridge-utils.cjs');
  } catch {
    return null; // bridge-utils not available
  }

  // Find test files from args (simple: just .spec.ts/.test.ts files)
  const testFiles: string[] = [];
  const flagArgs: string[] = [];
  for (const arg of testArgs) {
    if (arg.startsWith('-')) {
      flagArgs.push(arg);
    } else {
      // Resolve relative to cwd
      const resolved = path.resolve(arg);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        testFiles.push(resolved);
      } else if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
        // Find test files in directory
        const entries = fs.readdirSync(resolved, { recursive: true }) as string[];
        for (const entry of entries) {
          if (/\.(spec|test)\.[tj]sx?$/.test(entry)) {
            testFiles.push(path.join(resolved, entry));
          }
        }
      } else {
        return null; // unknown arg, fall back
      }
    }
  }

  if (testFiles.length === 0) return null; // no files found, fall back

  // Check all files are bridge-eligible
  for (const file of testFiles) {
    if (bridgeUtils.needsNode(file)) return null; // needs Node, fall back
  }

  // Check for flags we can't handle
  const unsupportedFlags = flagArgs.filter(f =>
    !f.startsWith('--workers') && !f.startsWith('--reporter') && !f.startsWith('--headed') && !f.startsWith('--headless')
  );
  if (unsupportedFlags.length > 0) return null; // unknown flags, fall back

  const headed = flagArgs.includes('--headed');
  const headless = flagArgs.includes('--headless');

  // Launch Chromium with extension
  let chromium;
  try {
    chromium = (await import('@playwright/test')).chromium;
  } catch {
    return null;
  }

  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: headless || !headed,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');

  // Navigate to blank page and attach
  const page = context.pages()[0] || await context.newPage();
  await page.goto('about:blank');
  await new Promise(r => setTimeout(r, 500));

  // Navigate and wait for extension to initialize
  await page.goto('about:blank');
  await new Promise(r => setTimeout(r, 2000));

  // Attach extension to the active tab
  await sw.evaluate(async () => {
    const [tab] = await (globalThis as any).chrome.tabs.query({ active: true });
    if (tab?.id) await (self as any).handleBridgeCommand({ command: 'goto about:blank', scriptType: 'command' });
  });

  let totalPassed = 0, totalFailed = 0, totalSkipped = 0;

  for (const file of testFiles) {
    const relPath = path.relative(process.cwd(), file);
    const compiled = await bridgeUtils.compile(file);

    const result = await sw.evaluate(async (code: string) => {
      // Reset test state from previous file
      if ((globalThis as any).__resetTestState) (globalThis as any).__resetTestState();
      // The compiled IIFE registers tests synchronously
      new Function(code)();
      // Then run them asynchronously
      return await (globalThis as any).__runTests();
    }, compiled);

    // Parse results
    const lines = (result as string).split('\n');
    console.log(`\n  ${relPath}`);
    for (const line of lines) {
      if (line.trim()) console.log(`  ${line}`);
      if (line.includes('✓')) totalPassed++;
      if (line.includes('✗')) totalFailed++;
      if (line.includes('skipped')) totalSkipped++;
    }
  }

  console.log(`\n  ${totalPassed} passed, ${totalFailed} failed, ${totalSkipped} skipped (${testFiles.length} files)\n`);

  await context.close();
  return totalFailed > 0 ? 1 : 0;
}
