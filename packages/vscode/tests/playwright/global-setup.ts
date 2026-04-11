/**
 * Global Setup for Playwright Mock Tests
 *
 * Initializes client-side coverage collection before tests run.
 */

import * as path from 'path';
import { initCoverage, loadNextcovConfig } from 'nextcov/playwright';

export default async function globalSetup() {
  const config = await loadNextcovConfig(path.join(__dirname, 'playwright.config.ts'));
  await initCoverage(config);
}
