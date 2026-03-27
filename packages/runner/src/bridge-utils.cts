/**
 * bridge-utils — shared utilities for bridge-mode test execution.
 *
 * Used by both pw-worker (in test-server workers) and VS Code extension
 * (direct bridge execution in Phase 6).
 */

import fs = require('fs');
import path = require('path');

// ─── Node API detection ───

const NODE_API_PATTERNS: RegExp[] = [
  // Node built-in modules
  /\brequire\s*\(\s*['"]fs['"]\)/,
  /\brequire\s*\(\s*['"]path['"]\)/,
  /\brequire\s*\(\s*['"]child_process['"]\)/,
  /\brequire\s*\(\s*['"]os['"]\)/,
  /\brequire\s*\(\s*['"]net['"]\)/,
  /\brequire\s*\(\s*['"]http['"]\)/,
  /\brequire\s*\(\s*['"]https['"]\)/,
  /\brequire\s*\(\s*['"]crypto['"]\)/,
  /\bfrom\s+['"]fs['"]/,
  /\bfrom\s+['"]path['"]/,
  /\bfrom\s+['"]child_process['"]/,
  /\bfrom\s+['"]node:/,
  // Node globals
  /\bprocess\.env\b/,
  /\bprocess\.cwd\b/,
  /\b__dirname\b/,
  /\b__filename\b/,
  /\bBuffer\.\b/,
  // Playwright APIs that need Node (callbacks, non-serializable)
  /\.route\s*\(/,
  /\.unroute\s*\(/,
  /\.routeFromHAR\s*\(/,
  /\.waitForEvent\s*\(/,
  /\.waitForResponse\s*\(/,
  /\.waitForRequest\s*\(/,
  /\.\$eval\s*\(/,
  /\.\$\$eval\s*\(/,
];

/**
 * Check if a test file (and its local imports) uses Node APIs
 * that can't be executed in the bridge (Chrome extension).
 */
export function needsNode(filePath: string): boolean {
  const checked = new Set<string>();

  function check(file: string): boolean {
    if (checked.has(file)) return false;
    checked.add(file);

    let source: string;
    try { source = fs.readFileSync(file, 'utf-8'); }
    catch { return false; }

    for (const pattern of NODE_API_PATTERNS) {
      if (pattern.test(source)) return true;
    }

    const importRe = /(?:import|from)\s+['"](\.[^'"]+)['"]/g;
    let m: RegExpExecArray | null;
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

// ─── Compile ───

/**
 * Bundle a test file into an IIFE string that can be sent to the bridge.
 * Uses esbuild with an alias plugin to replace @playwright/test with the bridge shim.
 */
export async function compile(testFilePath: string): Promise<string> {
  const esbuild = require('esbuild');

  const testDir = path.dirname(testFilePath);
  const testFileName = path.basename(testFilePath);

  const shimPath = path.resolve(__dirname, 'shim', 'alias.ts');
  const shimPathJs = shimPath.replace('.ts', '.js');
  const aliasPath = fs.existsSync(shimPath) ? shimPath : shimPathJs;

  const plugin = {
    name: 'pw-bridge',
    setup(build: any) {
      build.onResolve({ filter: /^__entry__$/ }, () => ({ path: '__entry__', namespace: 'entry' }));
      build.onLoad({ filter: /.*/, namespace: 'entry' }, () => ({
        contents: 'import "./' + testFileName + '";',
        resolveDir: testDir,
        loader: 'ts',
      }));
    },
  };

  const result = await esbuild.build({
    entryPoints: ['__entry__'],
    bundle: true,
    write: false,
    format: 'iife',
    platform: 'neutral',
    plugins: [plugin],
    alias: { '@playwright/test': aliasPath },
  });

  return result.outputFiles[0].text;
}

// ─── Result parsing ───

export interface TestResultEntry {
  status: string;
  duration: number;
  errors: { message: string }[];
}

/**
 * Parse all test results from bridge output text.
 * Returns an array of results in order of appearance.
 */
export function parseAllResults(text: string): TestResultEntry[] {
  const lines = text.split('\n');
  const results: TestResultEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const passMatch = line.match(/^\s*[✓✔]\s+(.+?)\s+\((\d+)ms\)$/);
    if (passMatch) {
      results.push({ status: 'passed', duration: parseInt(passMatch[2]), errors: [] });
      continue;
    }
    const failMatch = line.match(/^\s*[✗✘]\s+(.+?)(?:\s+\((\d+)ms\))?$/);
    if (failMatch) {
      const dur = failMatch[2] ? parseInt(failMatch[2]) : 0;
      const errLine = lines[i + 1] || '';
      results.push({ status: 'failed', duration: dur, errors: [{ message: errLine.trim() }] });
      continue;
    }
    const skipMatch = line.match(/^\s*-\s+(.+?)\s+\(skipped\)$/);
    if (skipMatch) {
      results.push({ status: 'skipped', duration: 0, errors: [] });
      continue;
    }
  }

  return results;
}

export function findResultByName(lines: string[], testName: string): TestResultEntry {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const passMatch = line.match(/^\s*[✓✔]\s+(.+?)\s+\(\d+ms\)$/);
    if (passMatch && passMatch[1] === testName) {
      const dur = line.match(/\((\d+)ms\)/);
      return { status: 'passed', duration: dur ? parseInt(dur[1]) : 0, errors: [] };
    }
    const failMatch = line.match(/^\s*[✗✘]\s+(.+?)\s+\(\d+ms\)$/);
    if (failMatch && failMatch[1] === testName) {
      const dur = line.match(/\((\d+)ms\)/);
      const errLine = lines[i + 1] || '';
      return { status: 'failed', duration: dur ? parseInt(dur[1]) : 0, errors: [{ message: errLine.trim() }] };
    }
    const skipMatch = line.match(/^\s*-\s+(.+?)\s+\(skipped\)$/);
    if (skipMatch && skipMatch[1] === testName) {
      return { status: 'skipped', duration: 0, errors: [] };
    }
  }
  return { status: 'failed', duration: 0, errors: [{ message: 'Test result not found' }] };
}

export function findResultByIndex(lines: string[], idx: number): TestResultEntry {
  let currentIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.match(/^\s*[✓✔]/)) {
      currentIdx++;
      if (currentIdx === idx) {
        const dur = line.match(/\((\d+)ms\)/);
        return { status: 'passed', duration: dur ? parseInt(dur[1]) : 0, errors: [] };
      }
    } else if (line.match(/^\s*[✗✘]/)) {
      currentIdx++;
      if (currentIdx === idx) {
        const dur = line.match(/\((\d+)ms\)/);
        const errLine = lines[i + 1] || '';
        return { status: 'failed', duration: dur ? parseInt(dur[1]) : 0, errors: [{ message: errLine.trim() }] };
      }
    } else if (line.match(/^\s*-.*\(skipped\)/)) {
      currentIdx++;
      if (currentIdx === idx) {
        return { status: 'skipped', duration: 0, errors: [] };
      }
    }
  }
  return { status: 'failed', duration: 0, errors: [{ message: 'Test result not found' }] };
}
