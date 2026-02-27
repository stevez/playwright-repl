/**
 * Recording integration E2E fixtures.
 *
 * Launches Chromium with the real extension loaded, opens a panel page
 * and a target page. Tests verify that user interactions on the target
 * page produce recorded commands visible in the panel editor.
 *
 * Unlike the panel tests (which mock chrome APIs), these tests exercise
 * the real background.js + recorder.js + panel.js message flow.
 */

import { test as base, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');

type ExtensionContext = { context: BrowserContext; extensionId: string; sw: Worker };
type RecordingPages = { panelPage: Page; targetPage: Page; extensionId: string; sw: Worker; context: BrowserContext };

export const test = base.extend<
  { recordingPages: RecordingPages },
  { extensionContext: ExtensionContext }
>({
  // Worker-scoped: browser context with extension loaded
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

    await use({ context, extensionId, sw });
    await context.close();
  }, { scope: 'worker' }],

  // Test-scoped: panel page + target page pair
  recordingPages: async ({ extensionContext }, use) => {
    const { context, extensionId, sw } = extensionContext;

    // Mock /health and /run so panel initializes (recording is extension-side only)
    const panelPage = await context.newPage();

    await panelPage.route('**/health', (route) => {
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'ok', version: '0.4.0-test' }),
      });
    });
    await panelPage.route('**/run', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ text: 'OK', isError: false }),
      });
    });

    await panelPage.goto(`chrome-extension://${extensionId}/panel/panel.html`);
    await panelPage.waitForSelector('#command-input', { timeout: 10000 });

    // Open a target page with a simple test form
    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.waitForLoadState('domcontentloaded');

    // Bring target page to front so it's the "active tab" for chrome.tabs.query
    await targetPage.bringToFront();

    await use({ panelPage, targetPage, extensionId, sw, context });

    await targetPage.close();
    await panelPage.close();
  },
});

export { expect } from '@playwright/test';
