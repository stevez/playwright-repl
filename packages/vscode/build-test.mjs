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
const extensionOptions = {
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

// Webview scripts — bundled for browser with sourcemaps for coverage
/** @type {esbuild.BuildOptions} */
const webviewOptions = {
  entryPoints: [
    'src/settingsView.script.ts',
    'src/locatorsView.script.ts',
    'src/replView.script.ts',
    'src/assertView.script.ts',
  ],
  bundle: true,
  outdir: 'dist',
  external: ['vscode'],
  format: 'cjs',
  platform: 'browser',
  target: 'ES2019',
  sourcemap: true,
  minify: false,
};

await Promise.all([
  esbuild.build(extensionOptions),
  esbuild.build(webviewOptions),
]);
console.log('Test build complete.');
