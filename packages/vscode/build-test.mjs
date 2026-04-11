/**
 * Test-specific build that bundles @playwright-repl/* packages inline
 * so the Playwright Test loader (which transforms TS→CJS) can load
 * the extension without ESM/CJS conflicts.
 *
 * Since recorder.ts and picker.ts accept vscode as a constructor
 * parameter (not a module import), no vscode alias is needed.
 */
import * as esbuild from 'esbuild';

/** @type {esbuild.BuildOptions} */
const extensionOptions = {
  entryPoints: ['src/extension.ts', 'src/recorder.ts', 'src/picker.ts'],
  bundle: true,
  outdir: 'dist',
  external: [
    'vscode',
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
