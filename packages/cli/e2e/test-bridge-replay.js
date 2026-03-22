#!/usr/bin/env node
/**
 * E2E test for bridge --replay: spawns the CLI, launches Chrome with
 * the extension, connects them, and verifies the CLI exits with code 0.
 *
 * Usage:  node packages/cli/e2e/test-bridge-replay.js
 *         node packages/cli/e2e/test-bridge-replay.js --headed
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const headed = process.argv.includes('--headed');
const extraArgs = process.argv.slice(2).filter(a => a !== '--headed');
const EXTENSION_PATH = path.resolve(__dirname, '../../extension/dist');
const CLI_PATH = path.resolve(__dirname, '../dist/playwright-repl.js');
const EXAMPLES_DIR = path.resolve(__dirname, '../examples');
const BRIDGE_PORT = 19876;

async function main() {
  // 1. Spawn CLI — starts BridgeServer and waits for extension to connect
  const cli = spawn('node', [
    CLI_PATH, '--bridge', '--replay', EXAMPLES_DIR,
    '--bridge-port', String(BRIDGE_PORT),
    ...extraArgs,
  ]);

  let stdout = '';
  let stderr = '';
  cli.stdout.on('data', (chunk) => { stdout += chunk; process.stdout.write(chunk); });
  cli.stderr.on('data', (chunk) => { stderr += chunk; process.stderr.write(chunk); });

  // Wait for CLI to start its bridge server
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`CLI didn't start bridge server.\nstdout: ${stdout}\nstderr: ${stderr}`)),
      15_000,
    );
    const check = () => {
      if (stdout.includes('Bridge server listening')) { clearTimeout(timer); resolve(); }
      else setTimeout(check, 100);
    };
    check();
  });

  // 2. Launch browser with extension
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: !headed,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // 3. Get extension ID from service worker
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  const extensionId = sw.url().split('/')[2];

  // 4. Tell extension to connect to CLI's bridge port
  const [page] = context.pages();
  await page.goto(`chrome-extension://${extensionId}/panel/panel.html`);
  await page.evaluate((p) => chrome.storage.local.set({ bridgePort: p }), BRIDGE_PORT);
  await page.goto('about:blank');
  await page.bringToFront();

  // Small delay for chrome.tabs.query to register the active tab
  await new Promise(r => setTimeout(r, 500));

  // 5. Wait for CLI to finish replaying
  const exitCode = await new Promise((resolve) => {
    cli.on('close', (code) => resolve(code ?? 1));
  });

  // 6. Cleanup
  await context.close();

  // 7. Report
  if (exitCode === 0) {
    console.log('\n✅ Bridge replay test passed');
  } else {
    console.error(`\n❌ Bridge replay test failed (exit code ${exitCode})`);
  }
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
