import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: [
    'src/extension.ts',
    'src/babelBundle.ts',
    'src/oopReporter.ts',
    'src/debugTransform.ts',
    'src/playwrightFinder.ts',
    'src/settingsView.script.ts',
    'src/locatorsView.script.ts',
    'src/replView.script.ts',
    'src/assertView.script.ts',
  ],
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
    // ESM modules that use import.meta.url — can't be bundled into CJS
    '@playwright-repl/core',
  ],
  format: 'cjs',
  platform: 'node',
  target: 'ES2019',
  sourcemap: true,
  minify: !watch,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(options);

  // Copy CDP preload (standalone CJS, not bundled)
  fs.copyFileSync('src/cdpPreload.cjs', 'dist/cdpPreload.cjs');

  // Copy Chrome extension dist into VSIX bundle
  const src = path.resolve('..', 'extension', 'dist');
  const dest = path.resolve('chrome-extension');
  if (fs.existsSync(src)) {
    fs.cpSync(src, dest, { recursive: true });
    console.log('Chrome extension copied to chrome-extension/');
  } else {
    console.warn('Warning: extension/dist not found — skipping chrome-extension copy');
  }

  console.log('Build complete.');
}
