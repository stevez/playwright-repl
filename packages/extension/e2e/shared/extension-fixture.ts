/**
 * Shared extension fixture — launches Chromium with the extension loaded
 * and provides extensionId + coverage helpers.
 *
 * Each test suite re-exports `test` after extending with its own page fixtures.
 */

import { test as base, chromium, type BrowserContext, type Worker } from '@playwright/test';
import { collectClientCoverage } from 'nextcov/playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

export const transformUrl = (url: string) => {
  if (!url.startsWith('chrome-extension://')) return url;
  return pathToFileURL(path.join(EXTENSION_PATH, new URL(url).pathname)).href;
};

export { EXTENSION_PATH, collectClientCoverage };

export type ExtensionContext = { context: BrowserContext; extensionId: string; sw: Worker };

/**
 * Base test fixture with worker-scoped extension context.
 * Extend this in each test suite to add test-scoped page fixtures.
 */
export const extensionTest = base.extend<
  { extensionId: string },
  { extensionContext: ExtensionContext }
>({
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

    // Navigate the initial blank tab to a real page so auto-attach never sees about:blank
    const [initialPage] = context.pages();
    if (initialPage) await initialPage.goto('https://httpbin.org');

    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];

    await use({ context, extensionId, sw });
    await context.close();
  }, { scope: 'worker' }],

  extensionId: async ({ extensionContext }, use) => {
    await use(extensionContext.extensionId);
  },
});
