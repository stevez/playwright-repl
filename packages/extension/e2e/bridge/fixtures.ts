/**
 * Bridge E2E test fixtures.
 *
 * Launches Chromium with the real extension loaded + a BridgeServer on port 9876.
 * The extension's offscreen document auto-connects via WebSocket.
 * Commands are sent via bridge.run() — no panel UI involved.
 */

import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { BridgeServer } from '../../../core/dist/index.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const BRIDGE_PORT = 9876;

type BridgeContext = {
  context: BrowserContext;
  extensionId: string;
  sw: Worker;
  bridge: BridgeServer;
};

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no test-scoped fixtures
export const test = base.extend<
  {},
  { bridgeContext: BridgeContext; testPage: Page }
>({
  // Worker-scoped: BridgeServer + browser, reused across all tests in a worker
  bridgeContext: [async ({}, use) => {
    // 1. Start BridgeServer BEFORE the browser so the offscreen doc connects on init
    const bridge = new BridgeServer();
    await bridge.start(BRIDGE_PORT);

    // 2. Launch browser with extension
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
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

    // 4. Navigate initial tab away from about:blank
    const [initialPage] = context.pages();
    if (initialPage) await initialPage.goto('https://httpbin.org');

    // 5. Wait for offscreen document to connect via WebSocket
    await bridge.waitForConnection(30000);

    await use({ context, extensionId, sw, bridge });

    // Close browser first (terminates WebSocket client), then bridge server
    await context.close();
    // bridge.close() can hang if wss.close waits for dead connections — race with timeout
    await Promise.race([
      bridge.close(),
      new Promise<void>(r => setTimeout(r, 5000)),
    ]);
  }, { scope: 'worker' }],

  // Worker-scoped: persistent test page reused across tests
  testPage: [async ({ bridgeContext }, use) => {
    const { context } = bridgeContext;
    const page = await context.newPage();
    await page.goto('https://demo.playwright.dev/todomvc/');
    await page.bringToFront();
    await use(page);
    await page.close();
  }, { scope: 'worker' }],
});
