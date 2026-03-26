/**
 * Mode Detection
 *
 * Determines test execution mode by analyzing the full dependency tree via esbuild:
 * - 'browser': pure browser test → run in browser via shim (fastest, 0ms overhead)
 * - 'compiler': uses Node.js APIs → run in Node.js, page/expect → bridge (~2ms per call)
 *
 * Uses esbuild's metafile to check ALL resolved imports (not just the test file),
 * so Node.js usage in helpers/utilities is detected correctly.
 *
 * Detection is per-file. If any dependency uses Node.js APIs, the entire file
 * uses compiler mode.
 */

import path from 'node:path';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

const NODE_BUILTINS = new Set([
  'fs', 'path', 'child_process', 'os', 'crypto', 'util',
  'stream', 'events', 'net', 'http', 'https', 'url',
  'worker_threads', 'cluster', 'dgram', 'dns', 'tls',
  'readline', 'zlib', 'buffer', 'assert', 'vm', 'perf_hooks',
  'async_hooks', 'string_decoder', 'querystring', 'punycode',
]);

export type TestMode = 'browser' | 'compiler';

/**
 * Detect test mode by attempting an esbuild bundle with platform: 'browser'.
 * If esbuild encounters Node.js built-in imports, they'll appear as externals
 * in the metafile — indicating the test needs Node.js.
 */
export async function detectTestMode(testFilePath: string): Promise<TestMode> {
  const esbuild = await import('esbuild');
  const shimPath = path.resolve(path.dirname(__filename), '../src/shim/test-runner.ts');

  try {
    const result = await esbuild.build({
      entryPoints: [testFilePath],
      bundle: true,
      write: false,
      format: 'iife',
      platform: 'browser',
      metafile: true,
      alias: { '@playwright/test': shimPath },
      // Mark Node.js built-ins as external — if they appear in metafile, test needs Node.js
      external: [...NODE_BUILTINS].flatMap(m => [m, `node:${m}`]),
      logLevel: 'silent',
    });

    // Check if any resolved import is a Node.js built-in
    for (const inputPath of Object.keys(result.metafile!.inputs)) {
      // esbuild marks externals with a prefix like <define:fs> or the bare module name
      for (const imp of result.metafile!.inputs[inputPath].imports) {
        const modName = imp.path.replace(/^node:/, '');
        if (NODE_BUILTINS.has(modName)) return 'compiler';
      }
    }

    // Check source + local imports for Node globals and Playwright Node-only APIs
    const fs = await import('fs');
    const NODE_PATTERNS = [
      /\bprocess\.env\b/, /\bprocess\.cwd\b/, /\bprocess\.argv\b/,
      /\b__dirname\b/, /\b__filename\b/, /\bBuffer\.\b/,
      // Playwright APIs that need Node (callbacks, non-serializable)
      /\.route\s*\(/, /\.unroute\s*\(/, /\.routeFromHAR\s*\(/,
      /\.waitForEvent\s*\(/, /\.waitForResponse\s*\(/, /\.waitForRequest\s*\(/,
      /\.\$eval\s*\(/, /\.\$\$eval\s*\(/,
    ];

    // Check all resolved source files (not just the entry)
    for (const inputPath of Object.keys(result.metafile!.inputs)) {
      if (inputPath.includes('node_modules')) continue;
      try {
        const src = fs.default.readFileSync(inputPath, 'utf-8');
        for (const pattern of NODE_PATTERNS) {
          if (pattern.test(src)) return 'compiler';
        }
      } catch { /* skip unreadable files */ }
    }

    return 'browser';
  } catch {
    // If esbuild fails, fall back to compiler mode (safer)
    return 'compiler';
  }
}
