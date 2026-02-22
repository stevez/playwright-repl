/**
 * E2E test fixtures — launches Chromium with the extension loaded,
 * sets up page.route() mocking, and provides fixtures to tests.
 */

import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

type ExtensionContext = { context: BrowserContext; extensionId: string };
type MockResponse = (response: { text: string; isError: boolean }) => void;

/**
 * Custom test fixtures for the extension panel.
 *
 * Worker-scoped: browser context is shared across all tests in a worker.
 * Test-scoped: panelPage and mockResponse reset per test.
 */
export const test = base.extend<
  { panelPage: Page; mockResponse: MockResponse },
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

    // Context-level route: applies to all pages, set up once
    await context.route('**/health', (route) => {
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: '0.4.0-test' }),
      });
    });

    await use({ context, extensionId });
    await context.close();
  }, { scope: 'worker' }],

  // Test-scoped: fresh panelPage with route mocking for each test
  panelPage: async ({ extensionContext }, use) => {
    const { context, extensionId } = extensionContext;
    const page = await context.newPage();

    (page as any)._runResponse = { text: 'OK', isError: false };

    await page.route('**/run', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify((page as any)._runResponse),
      });
    });

    await page.goto(`chrome-extension://${extensionId}/panel/panel.html`);
    await page.waitForSelector('.line-info', { timeout: 10000 });

    await use(page);
    await page.close();
  },

  mockResponse: async ({ panelPage }, use) => {
    await use((response: { text: string; isError: boolean }) => {
      (panelPage as any)._runResponse = response;
    });
  },
});

export { expect } from '@playwright/test';
