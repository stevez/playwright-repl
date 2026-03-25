/**
 * Execute a test file via two paths:
 *
 * 1. Browser path (default): compile → send to bridge → runs in service worker
 *    where page/expect are real Playwright objects. Zero bridge round-trips.
 *
 * 2. Node.js path: compile → run locally → page calls go through Proxy → bridge.
 *    Used when test imports Node.js APIs (fs, path, http, etc.)
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { BridgeServer } from '@playwright-repl/core';
import { createPageProxy, createExpect } from './proxy-page.js';
import { installFramework } from './shim/framework.js';
import type { RunOptions, TestResult } from './types.js';
import { expect as pwExpect } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);

// ─── Framework (Node.js path) ──────────────────────────────────────────────

let frameworkInstalled = false;

function ensureFramework() {
  if (frameworkInstalled) return;
  installFramework();
  frameworkInstalled = true;
}

// ─── Alias path (resolved once) ────────────────────────────────────────────

let _aliasPath: string | null = null;

function getAliasPath(): string {
  if (_aliasPath) return _aliasPath;
  _aliasPath = path.resolve(path.dirname(__filename), 'shim/alias.ts');
  if (!fs.existsSync(_aliasPath)) _aliasPath = _aliasPath.replace('.ts', '.js');
  return _aliasPath;
}

// Browser framework is pre-loaded in the extension's service worker
// (packages/extension/src/test-framework.ts). No setup needed here.

// ─── Execute (auto-detect path) ────────────────────────────────────────────

export async function executeTestFile(
  testFilePath: string,
  bridge: BridgeServer,
  opts: RunOptions,
  nodePage?: any,
  cdpPage?: any,
): Promise<TestResult[]> {
  const needsNode = opts.forceNode || await detectNodeAPIs(testFilePath);
  console.log(`  [path] ${path.basename(testFilePath)} → ${needsNode ? 'NODE' : 'BROWSER'}`);

  if (needsNode) {
    return executeNode(testFilePath, bridge, opts.grep, nodePage, cdpPage);
  }
  return executeBrowser(testFilePath, bridge, opts.grep);
}

// ─── Browser Path ──────────────────────────────────────────────────────────

async function executeBrowser(
  testFilePath: string,
  bridge: BridgeServer,
  grep?: string,
): Promise<TestResult[]> {
  // Set grep in browser framework
  if (grep) await bridge.run(`globalThis.__setGrep(${JSON.stringify(grep)})`);
  else await bridge.run(`globalThis.__setGrep(null)`);

  const compiled = await compileBrowser(testFilePath);

  // Send compiled test to bridge — runs in SW with real page/expect
  const r = await bridge.run(compiled);
  if (r.isError) throw new Error(r.text || 'Bridge error');

  return parseResults(r.text || '', testFilePath);
}

async function compileBrowser(testFilePath: string): Promise<string> {
  const esbuild = await import('esbuild');
  const testDir = path.dirname(testFilePath);
  const testFileName = path.basename(testFilePath);

  const plugin = {
    name: 'pw-browser',
    setup(build: any) {
      build.onResolve({ filter: /^__entry__$/ }, () => ({ path: '__entry__', namespace: 'entry' }));
      build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({
        contents: `
          import './${testFileName}';
        `,
        resolveDir: testDir,
        loader: 'ts',
      }));
    },
  };

  const result = await esbuild.build({
    entryPoints: ['__entry__'],
    bundle: true, write: false, format: 'iife', platform: 'neutral',
    plugins: [plugin],
    alias: { '@playwright/test': getAliasPath() },
  });

  // Wrap: reset state → run test registration → run tests → return result
  const testCode = result.outputFiles[0].text;
  return `
    globalThis.__resetTestState();
    ${testCode}
    await globalThis.__runTests();
  `;
}

// ─── Node.js Path ──────────────────────────────────────────────────────────

async function executeNode(
  testFilePath: string,
  bridge: BridgeServer,
  grep?: string,
  nodePage?: any,
  cdpPage?: any,
): Promise<TestResult[]> {
  const realPage = cdpPage || nodePage;
  const useProxy = process.argv.includes('--proxy');
  let page: any;
  let expect: any;

  if (useProxy) {
    console.log('  [node] PROXY mode');
    const bridgeRun = async (cmd: string) => {
      console.log(`    [bridge →] ${cmd.substring(0, 120)}`);
      const r = await bridge.run(cmd);
      console.log(`    [bridge ←] ${r.isError ? 'ERR' : 'OK'} ${(r.text || '').substring(0, 80)}`);
      if (r.isError) throw new Error(r.text || 'Bridge error');
      return r;
    };
    page = createPageProxy(bridgeRun, nodePage, cdpPage);
    expect = createExpect(bridgeRun);
  } else {
    console.log(`  [node] DIRECT mode`);
    page = realPage;
    expect = pwExpect;
  }

  // Collect registered tests
  const tests: { name: string; fn: (fixtures: any) => Promise<void>; skip: boolean }[] = [];
  const hooks: { beforeEach: Function[]; afterEach: Function[]; beforeAll: Function[]; afterAll: Function[] } = {
    beforeEach: [], afterEach: [], beforeAll: [], afterAll: [],
  };

  // Provide test/expect on globalThis for the compiled test file
  const grepRe = grep ? new RegExp(grep, 'i') : null;
  const testFn: any = (name: string, fn: any) => { tests.push({ name, fn, skip: false }); };
  testFn.only = testFn;
  testFn.skip = (nameOrCond: any, fn?: any) => {
    if (typeof nameOrCond === 'string') tests.push({ name: nameOrCond, fn, skip: true });
  };
  testFn.describe = (name: string, fn: () => void) => {
    const prefix = name;
    const origTest = (globalThis as any).__test;
    const wrappedTest: any = (n: string, f: any) => { tests.push({ name: `${prefix} > ${n}`, fn: f, skip: false }); };
    wrappedTest.skip = (nOrC: any, f?: any) => {
      if (typeof nOrC === 'string') tests.push({ name: `${prefix} > ${nOrC}`, fn: f, skip: true });
    };
    wrappedTest.only = wrappedTest;
    (globalThis as any).__test = wrappedTest;
    fn();
    (globalThis as any).__test = origTest;
  };
  (testFn.describe as any).configure = () => {};
  testFn.beforeEach = (fn: Function) => { hooks.beforeEach.push(fn); };
  testFn.afterEach = (fn: Function) => { hooks.afterEach.push(fn); };
  testFn.beforeAll = (fn: Function) => { hooks.beforeAll.push(fn); };
  testFn.afterAll = (fn: Function) => { hooks.afterAll.push(fn); };
  testFn.fixme = (condOrName?: any, fn?: any) => {
    if (typeof condOrName === 'string') tests.push({ name: condOrName, fn, skip: true });
  };
  testFn.slow = () => {};
  testFn.info = () => ({ annotations: [] });
  testFn.extend = (fixtures: Record<string, any>) => {
    // Return a test function that applies extended fixtures
    const extended: any = (name: string, fn: any) => {
      testFn(name, async (baseFixtures: any) => {
        const ext = { ...baseFixtures };
        for (const [key, fixtureFn] of Object.entries(fixtures)) {
          if (typeof fixtureFn === 'function') {
            await new Promise<void>((resolve, reject) => {
              Promise.resolve(fixtureFn({ ...ext }, async (value: any) => { ext[key] = value; resolve(); })).catch(reject);
            });
          }
        }
        await fn(ext);
      });
    };
    // Copy methods
    for (const k of Object.keys(testFn)) (extended as any)[k] = (testFn as any)[k];
    return extended;
  };

  (globalThis as any).__test = testFn;
  (globalThis as any).__expect = expect;

  // Compile and import (registers tests, doesn't run them)
  const compiled = await compileNode(testFilePath);
  const tmpFile = path.join(os.tmpdir(), `pw-test-${Date.now()}.mjs`);
  try {
    fs.writeFileSync(tmpFile, compiled);
    await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  // Run tests from Node side with real page
  let bridgeCallCount = 0;
  const origRun = bridge.run.bind(bridge);
  (bridge as any).run = async (cmd: string, opts?: any) => { bridgeCallCount++; return origRun(cmd, opts); };

  const results: TestResult[] = [];
  const fixtures = { page, context: page.context(), expect };

  for (const hook of hooks.beforeAll) await hook(fixtures);

  for (const t of tests) {
    if (t.skip || (grepRe && !grepRe.test(t.name))) {
      results.push({ name: t.name, file: testFilePath, passed: true, skipped: true, duration: 0 });
      continue;
    }
    const start = Date.now();
    try {
      for (const fn of hooks.beforeEach) await fn(fixtures);
      await t.fn(fixtures);
      for (const fn of hooks.afterEach) await fn(fixtures);
      results.push({ name: t.name, file: testFilePath, passed: true, skipped: false, duration: Date.now() - start });
    } catch (err: unknown) {
      const msg = (err as Error).message || String(err);
      console.error(`    [FAIL] ${t.name}\n      ${msg.split('\n').slice(0, 3).join('\n      ')}`);
      results.push({ name: t.name, file: testFilePath, passed: false, skipped: false, error: msg, duration: Date.now() - start });
      // Cancel any pending bridge commands by navigating via Node page (bypasses bridge queue)
      if (useProxy) {
        try { await realPage.goto('about:blank', { timeout: 5000 }); } catch { /* ignore */ }
      }
    }
  }

  for (const hook of hooks.afterAll) await hook(fixtures);

  console.log(`  [node] bridge calls: ${bridgeCallCount}`);
  return results;
}

async function compileNode(testFilePath: string): Promise<string> {
  const esbuild = await import('esbuild');
  const testDir = path.dirname(testFilePath);
  const testFileName = path.basename(testFilePath);

  const plugin = {
    name: 'pw-node',
    setup(build: any) {
      build.onResolve({ filter: /^__entry__$/ }, () => ({ path: '__entry__', namespace: 'entry' }));
      build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({
        contents: `
          import './${testFileName}';
        `,
        resolveDir: testDir,
        loader: 'ts',
      }));
    },
  };

  const result = await esbuild.build({
    entryPoints: ['__entry__'],
    bundle: true, write: false, format: 'esm', platform: 'node',
    plugins: [plugin],
    alias: { '@playwright/test': getAliasPath() },
    external: [
      'fs', 'path', 'child_process', 'os', 'crypto', 'util',
      'stream', 'events', 'net', 'http', 'https', 'url',
      'worker_threads', 'node:*',
    ],
  });

  return result.outputFiles[0].text;
}

// ─── Detection ─────────────────────────────────────────────────────────────

const NODE_MODULES = new Set([
  'fs', 'path', 'child_process', 'os', 'crypto', 'util',
  'stream', 'events', 'net', 'http', 'https', 'url',
  'worker_threads',
]);

// Patterns that need Node.js path (context-level routing)
const NODE_PATTERNS = [
  /\.route\s*\(/,        // page.route() with callbacks
  /\.routeFromHAR\s*\(/, // file path access
  /\.waitForEvent\s*\(/, // non-serializable return objects
  /\bserver\b/,          // server fixture (http.createServer in Node.js)
];

async function detectNodeAPIs(testFilePath: string): Promise<boolean> {
  const esbuild = await import('esbuild');
  const result = await esbuild.build({
    entryPoints: [testFilePath],
    bundle: true, write: false, metafile: true, format: 'esm', platform: 'node',
    alias: { '@playwright/test': getAliasPath() },
    external: [...NODE_MODULES, 'node:*'],
  });

  // Check if any Node.js modules were imported
  for (const input of Object.values(result.metafile!.inputs)) {
    for (const imp of input.imports) {
      const mod = imp.path.replace(/^node:/, '');
      if (NODE_MODULES.has(mod)) return true;
    }
  }

  // Check if test source uses patterns that need Node.js path
  const src = fs.readFileSync(testFilePath, 'utf-8');
  for (const pattern of NODE_PATTERNS) {
    if (pattern.test(src)) return true;
  }

  return false;
}

// ─── Parse Results ─────────────────────────────────────────────────────────

function parseResults(output: string, file: string): TestResult[] {
  const results: TestResult[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const passMatch = lines[i].match(/^\s*[✓✔]\s+(.+?)\s+\((\d+)ms\)/);
    if (passMatch) {
      results.push({ name: passMatch[1], file, passed: true, skipped: false, duration: parseInt(passMatch[2]) });
      continue;
    }
    const failMatch = lines[i].match(/^\s*[✗✘]\s+(.+?)\s+\((\d+)ms\)/);
    if (failMatch) {
      const error = lines[i + 1]?.trim() || 'Test failed';
      results.push({ name: failMatch[1], file, passed: false, skipped: false, error, duration: parseInt(failMatch[2]) });
      continue;
    }
    const skipMatch = lines[i].match(/^\s*-\s+(.+?)\s+\(skipped\)/);
    if (skipMatch) {
      results.push({ name: skipMatch[1], file, passed: true, skipped: true, duration: 0 });
    }
  }

  return results;
}
