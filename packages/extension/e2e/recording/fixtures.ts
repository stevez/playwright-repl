/**
 * Recording E2E test fixtures.
 *
 * Launches Chromium with the real extension loaded. Tests exercise the full
 * recording flow: panel → record-start → background (executeScript recorder.js) →
 * content script captures events → chrome.runtime.sendMessage → editor.
 */

import { type Page } from '@playwright/test';
import { collectClientCoverage, transformUrl } from '../shared/extension-fixture.js';
import { extensionTest } from '../shared/extension-fixture.js';
import { SidePanelPage } from '../shared/SidePanelPage.js';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export { expect } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, 'fixture.html');

export const FIXTURE_URL = pathToFileURL(FIXTURE_PATH).href;

export const test = extensionTest.extend<
  { panelPage: Page; testPage: Page; sidePanel: SidePanelPage }
>({
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

  // POM wrapping panelPage
  sidePanel: async ({ panelPage }, use) => {
    await use(new SidePanelPage(panelPage));
  },
});
