/**
 * Recording E2E tests — verify the full recording flow with real recorder.
 *
 * Flow: panel Record button → background startRecording() →
 * chrome.scripting.executeScript(recorder.js) → user interacts with page →
 * content script captures event → chrome.runtime.sendMessage → editor.
 */

import { test, expect, waitForEditorText } from './fixtures.js';

test.describe('Recording flow', () => {
  test.beforeEach(async ({ panelPage, extensionId, testPage }) => {
    await panelPage.goto(`chrome-extension://${extensionId}/panel/panel.html`);

    // Bring test page to front and attach the extension to it
    await testPage.bringToFront();
    await panelPage.evaluate(() =>
      new Promise(resolve =>
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) =>
          tab?.id
            ? chrome.runtime.sendMessage({ type: 'attach', tabId: tab.id }, resolve)
            : resolve({ ok: false })
        )
      )
    );
  });

  // Stop recording after each test to avoid state leaking between tests
  test.afterEach(async ({ panelPage }) => {
    const btn = panelPage.getByTestId('record-btn');
    const isRecording = await btn.evaluate(el => el.classList.contains('recording'));
    if (isRecording) await btn.click();
  });

  // ─── PW mode ─────────────────────────────────────────────────────────────

  test.describe('PW mode', () => {
    test('record button toggles to Stop and goto appears', async ({ panelPage }) => {
      const btn = panelPage.getByTestId('record-btn');

      await btn.click();
      await expect(btn).toHaveClass(/recording/, { timeout: 10000 });
      await expect(btn).toHaveAttribute('title', 'Stop recording');

      // goto should be pre-populated with the fixture URL
      await waitForEditorText(panelPage, 'goto "');
    });

    test('clicking a button records a click action', async ({ panelPage, testPage }) => {
      await panelPage.getByTestId('record-btn').click();
      await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/, { timeout: 10000 });
      await waitForEditorText(panelPage, 'goto "');

      await testPage.bringToFront();
      await testPage.getByRole('button', { name: 'Submit' }).click();

      // No bringToFront — waitForFunction works via CDP regardless of which tab
      // is active, and keeping the test page in front avoids Chrome throttling
      // the recorder's JS in the background tab.
      await waitForEditorText(panelPage, 'click button "Submit"');
    });

    test('filling a text input records a fill action', async ({ panelPage, testPage }) => {
      await panelPage.getByTestId('record-btn').click();
      await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/, { timeout: 10000 });
      await waitForEditorText(panelPage, 'goto "');

      await testPage.bringToFront();
      await testPage.getByLabel('Name').fill('Alice');
      // Press Tab to commit the fill (recorder batches fill on blur/navigation)
      await testPage.getByLabel('Name').press('Tab');

      await waitForEditorText(panelPage, 'fill');
    });

    test('checking a checkbox records a check action', async ({ panelPage, testPage }) => {
      await panelPage.getByTestId('record-btn').click();
      await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/, { timeout: 10000 });
      await waitForEditorText(panelPage, 'goto "');

      await testPage.bringToFront();
      await testPage.getByLabel('Accept terms').click();

      await waitForEditorText(panelPage, 'check');
    });

    test('stop recording resets button state', async ({ panelPage }) => {
      const btn = panelPage.getByTestId('record-btn');

      // Start
      await btn.click();
      await expect(btn).toHaveClass(/recording/, { timeout: 10000 });

      // Stop
      await btn.click();
      await expect(btn).not.toHaveClass(/recording/);
      await expect(btn).toHaveAttribute('title', 'Start Recording');
    });
  });

  // ─── JS mode ─────────────────────────────────────────────────────────────

  test.describe('JS mode', () => {
    test.beforeEach(async ({ panelPage }) => {
      // Switch to JS mode
      await panelPage.getByTestId('mode-toggle').getByText('JS').click();
      await expect(panelPage.getByTestId('mode-toggle').getByText('JS'))
        .toHaveAttribute('data-active', '');
    });

    test('record inserts goto with JS syntax', async ({ panelPage }) => {
      await panelPage.getByTestId('record-btn').click();
      await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/, { timeout: 10000 });

      await waitForEditorText(panelPage, 'await page.goto(');
    });

    test('clicking a button records JS click action', async ({ panelPage, testPage }) => {
      await panelPage.getByTestId('record-btn').click();
      await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/, { timeout: 10000 });
      await waitForEditorText(panelPage, 'await page.goto(');

      await testPage.bringToFront();
      await testPage.getByRole('button', { name: 'Submit' }).click();

      await waitForEditorText(panelPage, '.click()');
    });

    test('filling a text input records JS fill action', async ({ panelPage, testPage }) => {
      await panelPage.getByTestId('record-btn').click();
      await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/, { timeout: 10000 });
      await waitForEditorText(panelPage, 'await page.goto(');

      await testPage.bringToFront();
      await testPage.getByLabel('Name').fill('Bob');
      await testPage.getByLabel('Name').press('Tab');

      await waitForEditorText(panelPage, '.fill(');
    });
  });
});
