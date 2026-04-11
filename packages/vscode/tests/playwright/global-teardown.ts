/**
 * Global Teardown for Playwright Mock Tests
 *
 * Collects and processes client-side coverage from webview pages.
 */

import * as path from 'path';
import { finalizeCoverage, loadNextcovConfig } from 'nextcov/playwright';

export default async function globalTeardown() {
  const config = await loadNextcovConfig(path.join(__dirname, 'playwright.config.ts'));
  await finalizeCoverage(config);
}
