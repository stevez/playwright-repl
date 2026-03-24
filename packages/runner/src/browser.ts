/**
 * Launch Chromium with playwright-crx extension.
 * Sets the bridge port in chrome.storage so the offscreen doc connects to it.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export async function launchBrowser(opts: { headed: boolean; bridgePort: number }) {
  const require = createRequire(__filename);

  // Find extension dist path
  const extPkgPath = require.resolve('@playwright-repl/extension/package.json');
  const extPath = path.resolve(path.dirname(extPkgPath), 'dist');

  // Launch Chromium with extension
  const pw = require('playwright-core');
  const context = await pw.chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: !opts.headed,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-infobars',
    ],
  });

  // Set bridge port in chrome.storage so offscreen doc connects to it
  // (same approach as E2E bridge tests)
  let sw = context.serviceWorkers()[0];
  if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10000 });
  const extensionId = sw.url().split('/')[2];

  const page = context.pages()[0] || await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/panel/panel.html`);
  await page.evaluate((port: number) => (globalThis as any).chrome.storage.local.set({ bridgePort: port }), opts.bridgePort);
  await page.goto('about:blank');

  return { context, page };
}
