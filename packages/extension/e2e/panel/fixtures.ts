/**
 * E2E test fixtures — launches Chromium with the extension loaded,
 * intercepts chrome.runtime.sendMessage to mock the background service worker,
 * and provides fixtures to tests.
 */

import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

type ExtensionContext = { context: BrowserContext; extensionId: string };

/**
 * Custom test fixtures for the extension panel.
 *
 * Worker-scoped: browser context is shared across all tests in a worker.
 * Test-scoped: panelPage resets per test.
 */
export const test = base.extend<
  { panelPage: Page },
  { extensionContext: ExtensionContext }
>({
  // Worker-scoped: launch browser once, reuse across tests
  extensionContext: [async ({}, use) => {
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

    // Get extension ID from the service worker URL
    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];

    await use({ context, extensionId });
    await context.close();
  }, { scope: 'worker' }],

  // Test-scoped: fresh panelPage with mocked chrome.runtime.sendMessage
  panelPage: async ({ extensionContext }, use) => {
    const { context, extensionId } = extensionContext;
    const page = await context.newPage();

    await page.goto(`chrome-extension://${extensionId}/panel/panel.html`);

    // Override chrome.runtime.sendMessage after page load to stub lifecycle messages
    await page.evaluate(() => {
      const orig = (chrome.runtime.sendMessage as any).bind(chrome.runtime);
      (chrome.runtime as any).sendMessage = async (msg: any) => {
        if (msg.type === 'health') return { ok: true };
        if (msg.type === 'attach') return { ok: true, url: 'https://example.com' };
        if (msg.type === 'record-start') return { ok: true, url: 'https://example.com' };
        if (msg.type === 'record-stop') return { ok: true };
        return orig(msg);
      };
      // Mock connect() so recording tests can toggle without a real port
      (chrome.runtime as any).connect = () => ({
        onMessage: { addListener: () => {} },
        onDisconnect: { addListener: () => {} },
        disconnect: () => {},
      });
    });

    await page.waitForSelector('[data-testid="command-input"]', { timeout: 10000 });

    await use(page);
    await page.close();
  },
});

export { expect } from '@playwright/test';
