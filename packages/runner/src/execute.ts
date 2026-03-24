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
  _opts: RunOptions,
  nodePage?: any,
  cdpPage?: any,
): Promise<TestResult[]> {
  const needsNode = await detectNodeAPIs(testFilePath);

  if (needsNode) {
    return executeNode(testFilePath, bridge, nodePage, cdpPage);
  }
  return executeBrowser(testFilePath, bridge);
}

// ─── Browser Path ──────────────────────────────────────────────────────────

async function executeBrowser(
  testFilePath: string,
  bridge: BridgeServer,
): Promise<TestResult[]> {
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
  nodePage?: any,
  cdpPage?: any,
): Promise<TestResult[]> {
  ensureFramework();
  (globalThis as any).__resetTestState();

  const bridgeRun = async (cmd: string) => {
    const r = await bridge.run(cmd);
    if (r.isError) throw new Error(r.text || 'Bridge error');
    return r;
  };
  (globalThis as any).__proxyPage = createPageProxy(bridgeRun, nodePage, cdpPage);
  (globalThis as any).__proxyExpect = createExpect(bridgeRun);

  const compiled = await compileNode(testFilePath);
  const tmpFile = path.join(os.tmpdir(), `pw-test-${Date.now()}.mjs`);
  try {
    fs.writeFileSync(tmpFile, compiled);
    const mod = await import(`file://${tmpFile.replace(/\\/g, '/')}`);
    const resultText = typeof mod.default === 'string' ? mod.default : '';
    return parseResults(resultText, testFilePath);
  } finally {
    delete (globalThis as any).__proxyPage;
    delete (globalThis as any).__proxyExpect;
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
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
          const result = await globalThis.__runTests();
          export default result;
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
  /\.route\s*\(/,       // page.route() with callbacks
  /\.routeFromHAR\s*\(/, // file path access
  /\.waitForEvent\s*\(/, // non-serializable return objects
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
