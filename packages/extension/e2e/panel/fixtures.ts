/**
 * E2E test fixtures — launches Chromium with the extension loaded
 * and provides a fresh page with JS coverage tracking per test.
 */

import { type Page } from '@playwright/test';
import { extensionTest, collectClientCoverage, transformUrl } from '../shared/extension-fixture.js';
import { SidePanelPage } from '../shared/SidePanelPage.js';

export const test = extensionTest.extend<
  { panelPage: Page; sidePanel: SidePanelPage }
>({
  // Test-scoped: fresh page wrapped in JS coverage tracking
  panelPage: async ({ extensionContext }, use, testInfo) => {
    const { context } = extensionContext;
    const page = await context.newPage();

    await collectClientCoverage(page, testInfo, async () => {
      await use(page);
    }, { transformUrl });

    await page.close();
  },

  // POM wrapping panelPage
  sidePanel: async ({ panelPage }, use) => {
    await use(new SidePanelPage(panelPage));
  },
});

export { expect } from '@playwright/test';
