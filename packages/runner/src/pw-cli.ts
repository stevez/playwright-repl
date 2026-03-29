#!/usr/bin/env node
/**
 * pw — drop-in replacement for npx playwright test
 *
 * 1. Spawns Playwright CLI with custom worker via --require preload
 * 2. Each worker lazily launches its own browser + bridge (reused across test groups)
 * 3. Worker compiles test → sends to bridge (one call) → results back
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const require = createRequire(__filename);

const pwCliPath = require.resolve('@playwright/test/cli');
const preloadPath = path.resolve(path.dirname(__filename), 'pw-preload.cjs');
// Chrome extension: bundled in dist/chrome-extension/ (npm), or resolve from workspace (dev)
const bundledExt = path.resolve(path.dirname(__filename), 'chrome-extension');
import fs from 'node:fs';
const extPath = fs.existsSync(path.join(bundledExt, 'manifest.json'))
  ? bundledExt
  : path.resolve(path.dirname(require.resolve('@playwright-repl/extension/package.json')), 'dist');

const args = process.argv.slice(2);
if (args.length === 0 || (args[0] && args[0].startsWith('-'))) {
  args.unshift('test');
}

const existingNodeOptions = process.env.NODE_OPTIONS || '';
const child = spawn(process.execPath, [pwCliPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    PW_EXT_PATH: extPath,
    NODE_OPTIONS: `${existingNodeOptions} --require ${preloadPath}`.trim(),
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
