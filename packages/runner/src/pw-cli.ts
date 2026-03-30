#!/usr/bin/env node
/**
 * pw — drop-in replacement for npx playwright test
 *
 * Routes test files:
 * - Bridge-eligible files → direct bridge execution (fast, no test runner overhead)
 * - Node-mode files → standard `npx playwright test` (full compatibility)
 *
 * When no bridge is available, all tests go through standard Playwright.
 */

import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const _require = createRequire(__filename);

// Resolve Playwright CLI from the user's project to avoid duplicate module instances
const projectRequire = createRequire(path.join(process.cwd(), 'package.json'));
let pwCliPath: string;
try {
  pwCliPath = projectRequire.resolve('@playwright/test/cli');
} catch {
  pwCliPath = _require.resolve('@playwright/test/cli');
}
// Chrome extension: bundled in dist/chrome-extension/ (npm), or monorepo fallback (dev)
const bundledExt = path.resolve(path.dirname(__filename), 'chrome-extension');
const monorepoExt = path.resolve(path.dirname(__filename), '../../extension/dist');
const extPath = fs.existsSync(path.join(bundledExt, 'manifest.json'))
  ? bundledExt
  : monorepoExt;

const args = process.argv.slice(2);
const subcommand = args[0];

// ─── Subcommands ─────────────────────────────────────────────────────────────

if (subcommand === 'launch') {
  const { handleLaunch } = await import('./pw-launch.js');
  await handleLaunch(args.slice(1));
  process.exit(0);
}

if (subcommand === 'close') {
  const { handleClose } = await import('./pw-launch.js');
  await handleClose(args.slice(1));
  process.exit(0);
}

if (subcommand === 'repl') {
  const { handleRepl } = await import('./pw-repl.js');
  await handleRepl(args.slice(1));
  // handleRepl keeps process alive via node:repl — don't exit here
}

if (subcommand === 'repl-extension') {
  const { handleReplExtension } = await import('./pw-repl-extension.js');
  await handleReplExtension(args.slice(1));
  // handleReplExtension keeps process alive via node:repl
}

// ─── Default: test ───────────────────────────────────────────────────────────

if (args.length === 0 || (args[0] && args[0].startsWith('-'))) {
  args.unshift('test');
}

// Run tests via standard Playwright — no preload, no Module._load hooks.
// Bridge mode is handled by the VS Code extension's _tryDirectBridge.
const child = spawn(process.execPath, [pwCliPath, ...args], {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: {
    ...process.env,
    PW_EXT_PATH: extPath,
  },
});

child.on('exit', (code) => {
  process.exit(code ?? 1);
});
