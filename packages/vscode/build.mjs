import * as esbuild from 'esbuild';

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
    'src/aiChatView.script.ts',
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
    // Loaded at runtime via require() — nft traces their dependencies
    '@playwright-repl/runner',
  ],
  format: 'cjs',
  platform: 'node',
  target: 'ES2019',
  sourcemap: false,
  minify: !watch,
};

if (watch) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(options);

  console.log('Build complete.');
}
