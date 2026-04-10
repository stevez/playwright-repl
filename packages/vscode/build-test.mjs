/**
 * Test-specific build that bundles @playwright-repl/* packages inline
 * so the mock test infrastructure can require() the extension as CJS.
 *
 * The production build (build.mjs) externalizes these packages because
 * VS Code handles ESM/CJS interop at runtime, but the mock tests run
 * in plain Node.js where require(ESM) fails.
 */
import * as esbuild from 'esbuild';

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outdir: 'dist',
  alias: {
    // Stub the 'vscode' module — our recorder.ts/picker.ts import it
    // at runtime, unlike upstream which only uses type imports.
    'vscode': './tests/playwright/vscode-shim.ts',
  },
  external: [
    // These are loaded dynamically by the extension at runtime
    './babelBundle',
    './debugTransform',
    './oopReporter',
    './playwrightFinder',
    './*.script',
    // Loaded at runtime via require() — nft traces their dependencies
    '@playwright-repl/runner',
  ],
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
  // Polyfill import.meta.url for @playwright-repl/core (ESM) bundled into CJS
  define: { 'import.meta.url': 'importMetaUrl' },
  banner: {
    js: 'var importMetaUrl = require("url").pathToFileURL(__filename).href;',
  },
};

await esbuild.build(options);
console.log('Test build complete.');
