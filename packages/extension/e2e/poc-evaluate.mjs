#!/usr/bin/env node
/**
 * Proof of concept: execute commands in the Dramaturg extension
 * via serviceWorker.evaluate() — no WebSocket bridge.
 *
 * Usage: node packages/extension/e2e/poc-evaluate.mjs
 */

import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../dist');

async function main() {
  // 1. Launch Chrome with extension
  console.log('Launching Chrome with Dramaturg extension...');
  const context = await chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: false,
    args: [
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
      '--no-first-run',
      '--no-default-browser-check',
    ],
  });

  // 2. Get service worker
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker');
  console.log('Service worker found:', sw.url());

  // 3. Navigate to a page first (extension needs an active tab)
  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://demo.playwright.dev/todomvc/');
  await page.waitForLoadState();
  console.log('Page loaded:', await page.title());

  // 4. Attach extension to the active tab (call the function directly on self)
  const attachResult = await sw.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true });
    if (!tab?.id) return { ok: false, error: 'No active tab' };
    // attachToTab is in background.ts scope — not on self, but we can use handleBridgeCommand
    return await self.handleBridgeCommand({ command: `goto ${tab.url}`, scriptType: 'command' });
  });
  console.log('Attach result:', attachResult);

  // 5. Execute commands via serviceWorker.evaluate()
  console.log('\n--- Testing _runCommand via serviceWorker.evaluate() ---\n');

  // Test: snapshot
  const snapshotResult = await sw.evaluate(async () => {
    return await self._runCommand('snapshot');
  });
  console.log('snapshot:', snapshotResult.isError ? 'ERROR' : 'OK');
  console.log('  contains "todos":', snapshotResult.text?.includes('todos'));

  // Test: fill
  const fillResult = await sw.evaluate(async () => {
    return await self._runCommand('fill "What needs to be done?" Buy groceries');
  });
  console.log('fill:', fillResult.isError ? `ERROR: ${fillResult.text}` : 'OK');

  // Test: press Enter
  const pressResult = await sw.evaluate(async () => {
    return await self._runCommand('press Enter');
  });
  console.log('press Enter:', pressResult.isError ? `ERROR: ${pressResult.text}` : 'OK');

  // Test: snapshot again — should show the todo
  const snapshot2 = await sw.evaluate(async () => {
    return await self._runCommand('snapshot');
  });
  console.log('snapshot after add:', snapshot2.isError ? 'ERROR' : 'OK');
  console.log('  contains "Buy":', snapshot2.text?.includes('Buy'));

  // Test: screenshot
  const ssResult = await sw.evaluate(async () => {
    return await self._runCommand('screenshot');
  });
  console.log('screenshot:', ssResult.isError ? `ERROR: ${ssResult.text}` : 'OK');
  console.log('  has image:', !!ssResult.image);

  console.log('\n--- Done ---');

  // Cleanup
  await context.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
