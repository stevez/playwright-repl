/**
 * E2E tests for the preferences page.
 */

import { test, expect } from './fixtures.js';

test.describe('Preferences page', () => {

  test.beforeEach(async ({ prefsPage, extensionId }) => {
    await prefsPage.goto(`chrome-extension://${extensionId}/preferences/preferences.html`);
    // Clear storage then reload so React reads defaults
    await prefsPage.evaluate(() => chrome.storage.local.clear());
    await prefsPage.reload();
    await prefsPage.waitForLoadState('domcontentloaded');
  });

  // ─── Defaults ───────────────────────────────────────────────────────────

  test('shows heading', async ({ prefsPage }) => {
    await expect(prefsPage.locator('h2')).toHaveText('Playwright REPL Preferences');
  });

  test('defaults to Side Panel', async ({ prefsPage }) => {
    await expect(prefsPage.getByRole('radio', { name: /Side Panel/ })).toBeChecked();
  });

  test('defaults to pw language mode', async ({ prefsPage }) => {
    await expect(prefsPage.getByRole('radio', { name: /^pw/ })).toBeChecked();
  });

  test('defaults bridge port to 9876', async ({ prefsPage }) => {
    await expect(prefsPage.getByRole('spinbutton')).toHaveValue('9876');
  });

  // ─── Open As ────────────────────────────────────────────────────────────

  test('switching to Popup persists after reload', async ({ prefsPage }) => {
    await prefsPage.getByRole('radio', { name: /Popup/ }).click();
    await expect(prefsPage.getByRole('radio', { name: /Popup/ })).toBeChecked();

    await prefsPage.reload();
    await expect(prefsPage.getByRole('radio', { name: /Popup/ })).toBeChecked();
  });

  test('switching back to Side Panel persists', async ({ prefsPage }) => {
    await prefsPage.getByRole('radio', { name: /Popup/ }).click();
    await prefsPage.getByRole('radio', { name: /Side Panel/ }).click();

    await prefsPage.reload();
    await expect(prefsPage.getByRole('radio', { name: /Side Panel/ })).toBeChecked();
  });

  // ─── Language Mode ──────────────────────────────────────────────────────

  test('switching to js mode persists after reload', async ({ prefsPage }) => {
    await prefsPage.getByRole('radio', { name: /^js/ }).click();
    await expect(prefsPage.getByRole('radio', { name: /^js/ })).toBeChecked();

    await prefsPage.reload();
    await expect(prefsPage.getByRole('radio', { name: /^js/ })).toBeChecked();
  });

  // ─── Bridge Port ────────────────────────────────────────────────────────

  test('changing bridge port persists after reload', async ({ prefsPage }) => {
    const input = prefsPage.getByRole('spinbutton');
    await input.fill('1234');

    await prefsPage.reload();
    await expect(prefsPage.getByRole('spinbutton')).toHaveValue('1234');
  });
});
