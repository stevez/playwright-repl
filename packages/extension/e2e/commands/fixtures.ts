/**
 * Command integration test fixtures.
 *
 * Launches Chromium with the real extension loaded. Commands are sent via
 * the panel UI (CodeMirror input → Enter), with the full stack:
 * panel → swDebugEval → background service worker (playwright-crx).
 */

import { test as base, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { collectClientCoverage } from 'nextcov/playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

const transformUrl = (url: string) => {
  if (!url.startsWith('chrome-extension://')) return url;
  return pathToFileURL(path.join(EXTENSION_PATH, new URL(url).pathname)).href;
};

type ExtensionContext = { context: BrowserContext; extensionId: string; sw: Worker };

export const test = base.extend<
  { panelPage: Page; testPage: Page },
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

  // Test-scoped: fresh panel page per test
  // collectClientCoverage wraps the entire lifecycle so startJSCoverage runs before goto
  panelPage: async ({ extensionContext }, use, testInfo) => {
    const { context, extensionId } = extensionContext;
    const page = await context.newPage();

    await collectClientCoverage(page, testInfo, async () => {
      await page.goto(`chrome-extension://${extensionId}/panel/panel.html`);
      await page.waitForSelector('[data-testid="command-input"]', { timeout: 10000 });
      await use(page);
    }, { transformUrl });

    await page.close();
  },

  // Test-scoped: target page navigated to playwright.dev, attached to extension
  testPage: async ({ extensionContext, panelPage }, use) => {
    const { context } = extensionContext;
    const page = await context.newPage();
    await page.goto('https://playwright.dev');

    // Bring to front so it's the active tab for chrome.tabs.query
    await page.bringToFront();

    // Attach the extension to the active tab
    await panelPage.evaluate(() =>
      new Promise(resolve =>
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) =>
          tab?.id
            ? chrome.runtime.sendMessage({ type: 'attach', tabId: tab.id }, resolve)
            : resolve({ ok: false })
        )
      )
    );

    await use(page);
    await page.close();
  },
});

const RESULT_SELECTOR = '[data-type="success"], [data-type="error"], [data-type="screenshot"], [data-type="snapshot"]';

/**
 * Submit a command through the panel UI (CodeMirror input → Enter) and return
 * the result from the output pane. Handles text results and screenshot images.
 */
export async function sendCommand(
  panelPage: Page,
  command: string,
): Promise<{ text: string; isError: boolean; image?: string }> {
  const prevCount = await panelPage.locator(RESULT_SELECTOR).count();

  await panelPage.getByTestId('command-input').locator('.cm-content').click();
  await panelPage.keyboard.type(command, { delay: 0 });
  await panelPage.keyboard.press('Escape'); // close autocomplete
  await panelPage.keyboard.press('Enter');

  // Wait for a new result element to appear (auto-retry via Playwright locator)
  const last = panelPage.locator(RESULT_SELECTOR).nth(prevCount);
  await expect(last).toBeAttached({ timeout: 15000 });
  const type = await last.getAttribute('data-type');

  if (type === 'screenshot') {
    const image = await last.locator('img').getAttribute('src') ?? '';
    return { text: '', isError: false, image };
  }

  const text = (await last.textContent()) ?? '';
  const isError = type === 'error';
  return { text, isError };
}

/**
 * Alias for sendCommand — both go through the panel UI.
 * Kept as a separate export for run-code tests that explicitly want the UI path.
 */
export const sendViaUI = sendCommand;
