import * as esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';

const watch = process.argv.includes('--watch');

/** @type {esbuild.BuildOptions} */
const options = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode', '@playwright-repl/core', 'esbuild'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  sourcemap: true,
  minify: false,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(options);

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
