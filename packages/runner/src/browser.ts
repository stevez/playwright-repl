/**
 * Launch Chromium with playwright-crx extension.
 * Same approach as the VS Code extension's BrowserManager.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);

export async function launchBrowser(opts: { headed: boolean; bridgePort: number }) {
  const require = createRequire(__filename);

  // Find extension dist path via package dependency
  const extMain = require.resolve('@playwright-repl/extension');
  const extDir = extMain.replace(/[\\/]dist[\\/].*$/, '');
  const extPath = path.resolve(extDir, 'dist');

  // Launch Chromium with extension
  const pw = require('playwright-core');
  await pw.chromium.launchPersistentContext('', {
    channel: 'chromium',
    headless: !opts.headed,
    args: [
      `--disable-extensions-except=${extPath}`,
      `--load-extension=${extPath}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-infobars',
      '--remote-debugging-port=9222',
      'https://www.google.com',
    ],
  });
}
