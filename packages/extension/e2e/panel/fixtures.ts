/**
 * E2E test fixtures — launches Chromium with the extension loaded
 * and provides a fresh page with JS coverage tracking per test.
 */

import { test as base, chromium, type BrowserContext, type Page } from '@playwright/test';
import { collectClientCoverage } from 'nextcov/playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

const transformUrl = (url: string) => {
  if (!url.startsWith('chrome-extension://')) return url;
  return pathToFileURL(path.join(EXTENSION_PATH, new URL(url).pathname)).href;
};

type ExtensionContext = { context: BrowserContext; extensionId: string };

/**
 * Custom test fixtures for the extension panel.
 *
 * Worker-scoped: browser context is shared across all tests in a worker.
 * Test-scoped: panelPage resets per test, wrapped in JS coverage tracking.
 */
export const test = base.extend<
  { panelPage: Page; extensionId: string },
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

    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];

    await use({ context, extensionId });
    await context.close();
  }, { scope: 'worker' }],

  // Expose extensionId so tests can build the panel URL
  extensionId: async ({ extensionContext }, use) => {
    await use(extensionContext.extensionId);
  },

  // Test-scoped: fresh page wrapped in JS coverage tracking
  panelPage: async ({ extensionContext }, use, testInfo) => {
    const { context } = extensionContext;
    const page = await context.newPage();

    await collectClientCoverage(page, testInfo, async () => {
      await use(page);
    }, { transformUrl });

    await page.close();
  },
});

export { expect } from '@playwright/test';
