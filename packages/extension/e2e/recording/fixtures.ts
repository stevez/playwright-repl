/**
 * Recording E2E test fixtures.
 *
 * Launches Chromium with the real extension loaded. Tests exercise the full
 * recording flow: panel → record-start → background (executeScript recorder.js) →
 * content script captures events → chrome.runtime.sendMessage → editor.
 */

import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { collectClientCoverage } from 'nextcov/playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const FIXTURE_PATH = path.resolve(__dirname, 'fixture.html');

export const FIXTURE_URL = pathToFileURL(FIXTURE_PATH).href;

const transformUrl = (url: string) => {
  if (!url.startsWith('chrome-extension://')) return url;
  return pathToFileURL(path.join(EXTENSION_PATH, new URL(url).pathname)).href;
};

type ExtensionContext = { context: BrowserContext; extensionId: string; sw: Worker };

export const test = base.extend<
  { panelPage: Page; testPage: Page; extensionId: string },
  { extensionContext: ExtensionContext }
>({
  // Worker-scoped: browser launched once, reused across all tests in a worker
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

  // Test-scoped: fresh panel page per test (no navigation — done in beforeEach)
  panelPage: async ({ extensionContext }, use, testInfo) => {
    const { context } = extensionContext;
    const page = await context.newPage();

    await collectClientCoverage(page, testInfo, async () => {
      await use(page);
    }, { transformUrl });

    await page.close();
  },

  // Test-scoped: target page navigated to fixture (attachment done in beforeEach)
  testPage: async ({ extensionContext }, use) => {
    const { context } = extensionContext;
    const page = await context.newPage();
    await page.goto(FIXTURE_URL);
    await use(page);
    await page.close();
  },
});

/**
 * Get the editor text content from the panel page.
 */
export async function getEditorText(panelPage: Page): Promise<string> {
  return (await panelPage.getByTestId('editor').getByRole('textbox').textContent()) ?? '';
}

/**
 * Wait until the editor contains the expected text.
 */
export async function waitForEditorText(panelPage: Page, substring: string, timeout = 10000) {
  await panelPage.waitForFunction(
    ({ sel, text }) => {
      const el = document.querySelector(sel);
      return el?.textContent?.includes(text) ?? false;
    },
    { sel: '[data-testid="editor"] [role="textbox"]', text: substring },
    { timeout },
  );
}
