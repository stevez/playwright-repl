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

export { needsNode as needsNodeMode };

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

// ─── Find playwright.config.ts by walking up from test file ──────────────────

function findConfigDir(startDir: string): string {
  let dir = startDir;
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'playwright.config.ts')) ||
        fs.existsSync(path.join(dir, 'playwright.config.js'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir; // fallback to test file's directory
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export interface RunTestOptions {
  grep?: string;
  timeout?: number;
  headless?: boolean;
}

export async function runTestFile(
  filePath: string,
  bridge: BridgeServer,
  page: any,
  opts?: RunTestOptions,
  onResult?: (result: TestResult) => void,
): Promise<TestResult[]> {
  const isNode = needsNode(filePath);

  if (isNode) {
    return executeNode(filePath, page, opts, onResult);
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
  _page: any,
  opts?: RunTestOptions,
  onResult?: (result: TestResult) => void,
): Promise<TestResult[]> {
  const { spawn } = await import('node:child_process');
  const { createRequire } = await import('node:module');

  const require = createRequire(__filename);
  const pwCliPath = require.resolve('@playwright/test/cli');
  const configDir = findConfigDir(path.dirname(filePath));

  const relPath = path.relative(configDir, filePath).replace(/\\/g, '/');
  const args = [pwCliPath, 'test', relPath, '--workers', '1', '--reporter', 'list', '--project', 'chromium'];
  if (opts?.grep) {
    // Escape regex special chars for Playwright's --grep (which is a regex)
    const escaped = opts.grep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    args.push('--grep', escaped);
  }

  // Use 'node' not process.execPath (which is Electron in VS Code)
  const nodePath = process.env.NVM_SYMLINK
    ? path.join(process.env.NVM_SYMLINK, 'node')
    : 'node';

  console.error(`[pw-cli] ${nodePath} ${args.map(a => a.includes(' ') ? `"${a}"` : a).join(' ')}`);

  return new Promise((resolve) => {
    const results: TestResult[] = [];
    let buffer = '';

    const child = spawn(nodePath, args, {
      cwd: configDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: true,
      env: (() => {
        const env = { ...process.env };
        delete env.ELECTRON_RUN_AS_NODE;
        delete env.NODE_OPTIONS;
        return env;
      })(),
    });

    child.stdout?.on('data', (d: Buffer) => {
      buffer += d.toString();
      // Parse complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // keep incomplete line in buffer
      for (const line of lines) {
        const result = parseListLine(line, filePath);
        if (result) {
          results.push(result);
          if (onResult) onResult(result);
        }
      }
    });

    child.on('close', (code: number | null) => {
      // Parse remaining buffer
      if (buffer.trim()) {
        const result = parseListLine(buffer, filePath);
        if (result) {
          results.push(result);
          if (onResult) onResult(result);
        }
      }
      console.error(`[pw-cli] exit code: ${code}, ${results.length} results`);
      resolve(results);
    });
  });
}

// Parse Playwright list reporter line:
//   ✓  1 [chromium] › file.spec.ts:10:1 › describe › test name (1.2s)
//   ✗  2 [chromium] › file.spec.ts:20:1 › test name (3.4s)
//   -  3 [chromium] › file.spec.ts:30:1 › test name
function parseListLine(line: string, filePath: string): TestResult | null {
  // Match passed: ✓ or ok
  const passMatch = line.match(/^\s*[✓✔].*?›\s+.*?›\s+(.+?)\s+\(([0-9.]+)(m?s)\)/);
  if (passMatch) {
    const dur = passMatch[3] === 's' ? parseFloat(passMatch[2]) * 1000 : parseFloat(passMatch[2]);
    return { name: passMatch[1].trim(), file: filePath, passed: true, skipped: false, duration: dur };
  }
  // Match passed (plain text): "  ok N [project] › ..."
  const okMatch = line.match(/^\s*ok\s+\d+.*?›\s+.*?›\s+(.+?)\s+\(([0-9.]+)(m?s)\)/);
  if (okMatch) {
    const dur = okMatch[3] === 's' ? parseFloat(okMatch[2]) * 1000 : parseFloat(okMatch[2]);
    return { name: okMatch[1].trim(), file: filePath, passed: true, skipped: false, duration: dur };
  }
  // Match failed: ✗ or x
  const failMatch = line.match(/^\s*[✗✘×].*?›\s+.*?›\s+(.+?)\s+\(([0-9.]+)(m?s)\)/);
  if (failMatch) {
    const dur = failMatch[3] === 's' ? parseFloat(failMatch[2]) * 1000 : parseFloat(failMatch[2]);
    return { name: failMatch[1].trim(), file: filePath, passed: false, skipped: false, duration: dur };
  }
  // Match skipped: -
  const skipMatch = line.match(/^\s*-\s+\d+.*?›\s+.*?›\s+(.+)/);
  if (skipMatch) {
    return { name: skipMatch[1].trim(), file: filePath, passed: true, skipped: true, duration: 0 };
  }
  return null;
}

function parseJsonResults(stdout: string, filePath: string): TestResult[] {
  try {
    const report = JSON.parse(stdout);
    const results: TestResult[] = [];

    for (const suite of report.suites || []) {
      collectResults(suite, results, filePath);
    }
    console.error(`[pw-cli] parsed ${results.length} results: ${results.map(r => `${r.passed ? '✓' : '✗'} ${r.name} (${r.duration}ms)`).join(', ')}`);
    return results;
  } catch (e) {
    console.error(`[pw-cli] failed to parse JSON: ${(e as Error).message}`);
    console.error(`[pw-cli] stdout first 200 chars: ${stdout.slice(0, 200)}`);
    return [];
  }
}

function collectResults(suite: any, results: TestResult[], filePath: string, parentTitle?: string): void {
  for (const spec of suite.specs || []) {
    for (const test of spec.tests || []) {
      const result = test.results?.[0];
      const name = parentTitle ? `${parentTitle} > ${spec.title}` : spec.title;
      results.push({
        name,
        file: filePath,
        passed: test.status === 'expected',
        skipped: test.status === 'skipped',
        error: result?.error?.message,
        duration: result?.duration || 0,
      });
    }
  }
  for (const child of suite.suites || []) {
    // Skip file-level suite title (it's the filename), keep describe titles
    const childTitle = parentTitle !== undefined
      ? (child.title ? `${parentTitle} > ${child.title}` : parentTitle)
      : child.title || undefined;
    collectResults(child, results, filePath, childTitle);
  }
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
