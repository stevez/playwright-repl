/**
 * Test Bundler
 *
 * Uses esbuild to prepare a .spec.ts file for bridge execution:
 * 1. Compiles TypeScript → JavaScript
 * 2. Bundles all imports into a single script
 * 3. Aliases @playwright/test → our test-runner shim
 * 4. Appends __runTests() call to execute the tests
 * 5. Optionally includes inline source maps for debugging
 *
 * Returns a JS string ready to send through the bridge.
 */

import path from 'node:path';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

export interface BundleOptions {
  debug?: boolean;  // include source maps + sourceURL for debugging
}

export async function bundleTestFile(testFilePath: string, opts: BundleOptions = {}): Promise<string> {
  // Dynamic import — esbuild is a devDependency
  const esbuild = await import('esbuild');

  const shimPath = path.resolve(path.dirname(__filename), '../src/shim/test-runner.ts');
  const fileName = path.basename(testFilePath);

  const result = await esbuild.build({
    entryPoints: [testFilePath],
    bundle: true,
    write: false,
    format: 'iife',          // plain script — no import/export (runs in eval)
    globalName: '__tests',    // wraps in IIFE, exposes __runTests via __tests
    platform: 'browser',
    sourcemap: opts.debug ? 'inline' : false,
    alias: {
      '@playwright/test': shimPath,
    },
    // Don't fail on Node.js built-ins — just leave them as external
    // (they'll error at runtime if actually used, which is expected)
    external: ['fs', 'path', 'child_process', 'os', 'crypto', 'util', 'stream', 'events', 'net', 'http', 'https'],
  });

  let bundledCode = result.outputFiles[0].text;

  // Add sourceURL so Chrome's debugger can identify the script
  if (opts.debug) {
    bundledCode += `\n//# sourceURL=${fileName}\n`;
  }

  // The IIFE registers all tests + sets globalThis.__runTests.
  // Append the call to execute them.
  return `${bundledCode}\nawait globalThis.__runTests();\n`;
}
