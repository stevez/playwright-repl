/**
 * Recording E2E tests — verify the full recording flow with real recorder.
 *
 * Flow: panel Record button → background startRecording() →
 * chrome.scripting.executeScript(recorder.js) → user interacts with page →
 * content script captures event → chrome.runtime.sendMessage → editor.
 */

import { test, expect } from './fixtures.js';

test.describe('Recording flow', () => {
  test.beforeEach(async ({ sidePanel, extensionId, testPage }) => {
    await sidePanel.goto(extensionId);

    // Bring test page to front and attach the extension to it
    await testPage.bringToFront();
    await sidePanel.attachToActiveTab();
  });

  // Stop recording after each test to avoid state leaking between tests
  test.afterEach(async ({ sidePanel }) => {
    if (await sidePanel.isRecording()) await sidePanel.stopRecording();
  });

  // ─── PW mode ─────────────────────────────────────────────────────────────

  test.describe('PW mode', () => {
    test.beforeEach(async ({ sidePanel }) => {
      // Ensure PW mode (may have been set to JS by a previous test in this worker)
      await sidePanel.switchMode('pw');
    });

    test('record button toggles to Stop and goto appears', async ({ sidePanel }) => {
      await sidePanel.recordBtn.click();
      await expect(sidePanel.recordBtn).toHaveClass(/recording/, { timeout: 10000 });
      await expect(sidePanel.recordBtn).toHaveAttribute('title', 'Stop recording');

      // goto should be pre-populated with the fixture URL
      await sidePanel.waitForEditorText('goto "');
    });

    test('clicking a button records a click action', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording();

      await testPage.bringToFront();
      await testPage.getByRole('button', { name: 'Submit' }).click();

      await sidePanel.waitForEditorText('click button "Submit"');
    });

    test('filling a text input records a fill action', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording();

      await testPage.bringToFront();
      await testPage.getByLabel('Name').fill('Alice');
      // Press Tab to commit the fill (recorder batches fill on blur/navigation)
      await testPage.getByLabel('Name').press('Tab');

      await sidePanel.waitForEditorText('fill');
    });

    test('checking a checkbox records a check action', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording();

      await testPage.bringToFront();
      await testPage.getByLabel('Accept terms').click();

      await sidePanel.waitForEditorText('check');
    });

    // Fixture CSS: .todo-item .destroy { display: none }
    //              .todo-item:hover .destroy { display: inline-block }
    // Delete buttons are hidden until parent is hovered.
    // Recorder must detect this via CSS inspection and emit hover before click.

    test('hover-revealed button: records hover + click (multiple items)', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording();

      await testPage.bringToFront();
      await testPage.locator('.todo-item', { hasText: 'shopping' }).hover();
      await testPage.locator('.todo-item', { hasText: 'shopping' }).getByRole('button', { name: 'Delete' }).click();

      await sidePanel.waitForEditorText('click button "Delete"');
      const editorText = await sidePanel.getEditorText();
      expect(editorText).toContain('hover');
      expect(editorText).toContain('click');
      expect(editorText).not.toContain('.nth(');
      expect(editorText).not.toContain('.first()');
    });

    test('hover-revealed button: records hover + click (single item)', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording();

      await testPage.bringToFront();
      await testPage.locator('.single-todo .todo-item').hover();
      await testPage.locator('.single-todo .todo-item').getByRole('button', { name: 'Delete' }).click();

      await sidePanel.waitForEditorText('click button "Delete"');
      const editorText = await sidePanel.getEditorText();
      expect(editorText).toContain('hover');
      expect(editorText).toContain('click');
    });

    test('filling input in legacy table form uses CSS selector, not getByRole (#768)', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording();

      await testPage.bringToFront();
      await testPage.locator('#LoginName').fill('testuser');
      await testPage.locator('#LoginName').press('Tab');

      await sidePanel.waitForEditorText('fill');
      const editorText = await sidePanel.getEditorText();
      // Informal labels (adjacent cell text) can't be resolved by Playwright at runtime.
      // Should use CSS selector (e.g. input#LoginName) which always works.
      expect(editorText).toContain('"testuser"');
      expect(editorText).toContain('css');
      expect(editorText).not.toContain('textbox "Benutzerkennung:*"');
    });

    test('clicking inside a <frame> uses frame tag, not iframe (#769)', async ({ sidePanel, testPage }) => {
      const ctx = testPage.context();
      // Serve frameset pages via route so they're same-origin (file:// treats frames as cross-origin)
      await ctx.route('https://test.local/frameset.html', route => route.fulfill({
        contentType: 'text/html',
        body: '<html><frameset><frame name="main" src="https://test.local/frame-content.html" /></frameset></html>',
      }));
      await ctx.route('https://test.local/frame-content.html', route => route.fulfill({
        contentType: 'text/html',
        body: '<button>Arbeitskorb</button>',
      }));

      await testPage.goto('https://test.local/frameset.html');
      await testPage.bringToFront();
      await sidePanel.attachToActiveTab();

      await sidePanel.startRecording();

      await testPage.bringToFront();
      await testPage.frame({ name: 'main' })!.getByRole('button', { name: 'Arbeitskorb' }).click();

      await sidePanel.waitForEditorText('click button "Arbeitskorb"');
      const editorText = await sidePanel.getEditorText();
      expect(editorText).toContain('--frame "frame[name=');
      expect(editorText).not.toContain('iframe');
    });

    test('stop recording resets button state', async ({ sidePanel }) => {
      await sidePanel.recordBtn.click();
      await expect(sidePanel.recordBtn).toHaveClass(/recording/, { timeout: 10000 });

      await sidePanel.stopRecording();
      await expect(sidePanel.recordBtn).toHaveAttribute('title', 'Start Recording');
    });
  });

  // ─── JS mode ─────────────────────────────────────────────────────────────

  test.describe('JS mode', () => {
    test.beforeEach(async ({ sidePanel }) => {
      await sidePanel.switchMode('js');
    });

    test('record inserts goto with JS syntax', async ({ sidePanel }) => {
      await sidePanel.startRecording('await page.goto(');
    });

    test('clicking a button records JS click action', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording('await page.goto(');

      await testPage.bringToFront();
      await testPage.getByRole('button', { name: 'Submit' }).click();

      await sidePanel.waitForEditorText('.click()');
    });

    test('filling a text input records JS fill action', async ({ sidePanel, testPage }) => {
      await sidePanel.startRecording('await page.goto(');

      await testPage.bringToFront();
      await testPage.getByLabel('Name').fill('Bob');
      await testPage.getByLabel('Name').press('Tab');

      await sidePanel.waitForEditorText('.fill(');
    });
  });
});
