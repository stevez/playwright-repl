/**
 * runTestFile — in-process test execution for IDE integration.
 *
 * Called directly by VS Code extension with its existing bridge + page.
 * No subprocess, no browser launch — bridge stays warm between runs.
 *
 * Two modes:
 * - Browser: compile → send to bridge → runs in service worker (~50ms)
 * - Node (DIRECT): load test in Node → run with real page/expect (reuse browser)
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import type { BridgeServer } from '@playwright-repl/core';
import type { TestResult } from './types.js';

const __filename = fileURLToPath(import.meta.url);

// ─── Node API detection ─────────────────────────────────────────────────────

const NODE_MODULES = new Set([
  'fs', 'path', 'child_process', 'os', 'crypto', 'util',
  'stream', 'events', 'net', 'http', 'https', 'url',
  'worker_threads',
]);

const NODE_PATTERNS = [
  /\brequire\s*\(\s*['"]fs['"]\)/,
  /\brequire\s*\(\s*['"]path['"]\)/,
  /\brequire\s*\(\s*['"]child_process['"]\)/,
  /\bfrom\s+['"]fs['"]/,
  /\bfrom\s+['"]path['"]/,
  /\bfrom\s+['"]child_process['"]/,
  /\bfrom\s+['"]node:/,
  /\bprocess\.env\b/,
  /\bprocess\.cwd\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bBuffer\.\b/,
  /\.route\s*\(/,
  /\.unroute\s*\(/,
  /\.routeFromHAR\s*\(/,
  /\.waitForEvent\s*\(/,
  /\.waitForResponse\s*\(/,
  /\.waitForRequest\s*\(/,
  /\.\$eval\s*\(/,
  /\.\$\$eval\s*\(/,
];

function needsNode(filePath: string): boolean {
  const checked = new Set<string>();

  function check(file: string): boolean {
    if (checked.has(file)) return false;
    checked.add(file);

    let source: string;
    try { source = fs.readFileSync(file, 'utf-8'); }
    catch { return false; }

    for (const pattern of NODE_PATTERNS) {
      if (pattern.test(source)) return true;
    }

    // Check local imports
    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let m;
    while ((m = importRe.exec(source)) !== null) {
      const dir = path.dirname(file);
      const candidates = [
        path.resolve(dir, m[1]),
        path.resolve(dir, m[1] + '.ts'),
        path.resolve(dir, m[1] + '.js'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c) && check(c)) return true;
      }
    }
    return false;
  }

  return check(filePath);
}

// ─── Alias path ─────────────────────────────────────────────────────────────

let _aliasPath: string | null = null;

function getAliasPath(): string {
  if (_aliasPath) return _aliasPath;
  _aliasPath = path.resolve(path.dirname(__filename), 'shim/alias.ts');
  if (!fs.existsSync(_aliasPath)) _aliasPath = _aliasPath.replace('.ts', '.js');
  return _aliasPath;
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export interface RunTestOptions {
  grep?: string;
  timeout?: number;
}

export async function runTestFile(
  filePath: string,
  bridge: BridgeServer,
  page: any,
  opts?: RunTestOptions,
): Promise<TestResult[]> {
  const isNode = needsNode(filePath);

  if (isNode) {
    return executeNode(filePath, page, opts);
  }
  return executeBrowser(filePath, bridge, opts);
}

// ─── Browser path ───────────────────────────────────────────────────────────

async function executeBrowser(
  filePath: string,
  bridge: BridgeServer,
  opts?: RunTestOptions,
): Promise<TestResult[]> {
  const esbuild = await import('esbuild');
  const testDir = path.dirname(filePath);
  const testFileName = path.basename(filePath);

  const plugin = {
    name: 'pw-browser',
    setup(build: any) {
      build.onResolve({ filter: /^__entry__$/ }, () => ({ path: '__entry__', namespace: 'entry' }));
      build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({
        contents: `import './${testFileName}';`,
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

  const compiled = result.outputFiles[0].text;

  // Build script with optional grep
  let script = 'globalThis.__resetTestState();\n';
  if (opts?.grep) {
    const escaped = opts.grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    script += `globalThis.__setGrep(${JSON.stringify(escaped)});\n`;
  } else {
    script += 'globalThis.__setGrep(null);\n';
  }
  script += compiled + '\n';
  script += 'await globalThis.__runTests();';

  const r = await bridge.runScript(script, 'javascript');
  if (r.isError) throw new Error(r.text || 'Bridge error');

  return parseResults(r.text || '', filePath);
}

// ─── Node DIRECT path ───────────────────────────────────────────────────────

async function executeNode(
  filePath: string,
  page: any,
  opts?: RunTestOptions,
): Promise<TestResult[]> {
  const { expect: pwExpect } = await import('@playwright/test');

  // Collect registered tests
  const tests: { name: string; fn: (fixtures: any) => Promise<void>; skip: boolean }[] = [];
  const hooks = { beforeEach: [] as Function[], afterEach: [] as Function[], beforeAll: [] as Function[], afterAll: [] as Function[] };

  const grepRe = opts?.grep ? new RegExp(opts.grep, 'i') : null;

  // Build test registration API
  const testFn: any = (name: string, fn: any) => { tests.push({ name, fn, skip: false }); };
  testFn.only = testFn;
  testFn.skip = (nameOrCond: any, fn?: any) => {
    if (typeof nameOrCond === 'string') tests.push({ name: nameOrCond, fn, skip: true });
  };
  testFn.describe = (name: string, fn: () => void) => {
    const origTest = (globalThis as any).__test;
    const wrappedTest: any = (n: string, f: any) => { tests.push({ name: `${name} > ${n}`, fn: f, skip: false }); };
    wrappedTest.skip = (nOrC: any, f?: any) => {
      if (typeof nOrC === 'string') tests.push({ name: `${name} > ${nOrC}`, fn: f, skip: true });
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
    for (const k of Object.keys(testFn)) (extended as any)[k] = (testFn as any)[k];
    return extended;
  };

  (globalThis as any).__test = testFn;
  (globalThis as any).__expect = pwExpect;

  // Compile and import (registers tests, doesn't run them)
  const compiled = await compileNode(filePath);
  const tmpFile = path.join(os.tmpdir(), `pw-test-${Date.now()}.mjs`);
  try {
    fs.writeFileSync(tmpFile, compiled);
    await import(`file://${tmpFile.replace(/\\/g, '/')}`);
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  // Run tests with real page
  const results: TestResult[] = [];
  const fixtures = { page, context: page.context(), expect: pwExpect };

  for (const hook of hooks.beforeAll) await hook(fixtures);

  for (const t of tests) {
    if (t.skip || (grepRe && !grepRe.test(t.name))) {
      results.push({ name: t.name, file: filePath, passed: true, skipped: true, duration: 0 });
      continue;
    }
    const start = Date.now();
    try {
      for (const fn of hooks.beforeEach) await fn(fixtures);
      await t.fn(fixtures);
      for (const fn of hooks.afterEach) await fn(fixtures);
      results.push({ name: t.name, file: filePath, passed: true, skipped: false, duration: Date.now() - start });
    } catch (err: unknown) {
      const msg = (err as Error).message || String(err);
      results.push({ name: t.name, file: filePath, passed: false, skipped: false, error: msg, duration: Date.now() - start });
    }
  }

  for (const hook of hooks.afterAll) await hook(fixtures);

  return results;
}

async function compileNode(filePath: string): Promise<string> {
  const esbuild = await import('esbuild');
  const testDir = path.dirname(filePath);
  const testFileName = path.basename(filePath);

  const plugin = {
    name: 'pw-node',
    setup(build: any) {
      build.onResolve({ filter: /^__entry__$/ }, () => ({ path: '__entry__', namespace: 'entry' }));
      build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({
        contents: `import './${testFileName}';`,
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

// ─── Parse Results (browser path) ───────────────────────────────────────────

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
