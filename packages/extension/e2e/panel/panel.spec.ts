/**
 * E2E tests for the extension side panel UI.
 *
 * Launches Chromium with the extension loaded, navigates to panel.html,
 * and mocks chrome.runtime.sendMessage to isolate the UI from the background.
 */

import { test, expect } from './fixtures.js';

test.describe("Panel page test", () => {

  test.beforeEach(async ({ panelPage, sidePanel, extensionId }) => {
    // Clear storage before page load so App.tsx useEffect reads defaults
    await panelPage.addInitScript(() => chrome.storage.local.clear());
    // Intercept onMessage.addListener before React mounts so recording tests
    // can dispatch recorded-action messages to the Toolbar listener
    await panelPage.addInitScript(() => {
      const listeners: any[] = [];
      const origAdd = chrome.runtime.onMessage.addListener.bind(chrome.runtime.onMessage);
      const origRemove = chrome.runtime.onMessage.removeListener.bind(chrome.runtime.onMessage);
      chrome.runtime.onMessage.addListener = ((fn: any) => { listeners.push(fn); return origAdd(fn); }) as any;
      chrome.runtime.onMessage.removeListener = ((fn: any) => {
        const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); return origRemove(fn);
      }) as any;
      (window as any).__fireRecorderMsg = (msg: any) => { for (const fn of listeners) fn(msg, {}, () => {}); };
    });
    await sidePanel.goto(extensionId);

    // Stub health + attach — App.tsx sends these on mount
    await panelPage.evaluate(() => {
      const orig = (chrome.runtime.sendMessage as any).bind(chrome.runtime);
      (chrome.runtime as any).sendMessage = async (msg: any) => {
        if (msg.type === 'health') return { ok: true };
        if (msg.type === 'attach') return { ok: true, url: 'https://example.com' };
        return orig(msg);
      };
    });
  });

  // ─── Initialization ────────────────────────────────────────────────────────

  test('has record button enabled', async ({ sidePanel }) => {
    await expect(sidePanel.recordBtn).toBeEnabled();
  });

  test('has prompt visible', async ({ panelPage }) => {
    await expect(panelPage.getByTestId('prompt')).toBeVisible();
  });

  // ─── REPL Command Input ────────────────────────────────────────────────────

  test('displays output after command', async ({ sidePanel }) => {
    await sidePanel.fillInput('help');
    await sidePanel.raw.keyboard.press('Enter');

    await expect(sidePanel.output).toContainText('Keyword commands', { timeout: 5000 });
  });

  test('clears input after submit', async ({ sidePanel }) => {
    await sidePanel.submitInput('snapshot');

    await expect(sidePanel.commandInput.locator('.cm-placeholder')).toBeVisible();
  });

  test('does not send empty input', async ({ sidePanel }) => {
    await sidePanel.fillInput('   ');
    await sidePanel.raw.keyboard.press('Enter');

    await expect(sidePanel.raw.locator('[data-testid="output"] [data-status]')).toHaveCount(0);
  });

  test('displays error responses with error styling', async ({ sidePanel }) => {
    await sidePanel.submitInput('nonexistent-command');

    await expect(sidePanel.raw.locator('[data-type="error"]')).toContainText('ReferenceError');
  });

  // ─── Command History ───────────────────────────────────────────────────────

  test('navigates history with ArrowUp/ArrowDown', async ({ sidePanel }) => {
    await sidePanel.submitInput('goto https://a.com');
    await sidePanel.submitInput('goto https://b.com');

    // Re-focus the input before navigating history
    await sidePanel.commandInput.locator('.cm-content').click();

    await sidePanel.raw.keyboard.press('ArrowUp');
    await expect(sidePanel.commandInput).toContainText('goto https://b.com');

    await sidePanel.raw.keyboard.press('ArrowUp');
    await expect(sidePanel.commandInput).toContainText('goto https://a.com');

    await sidePanel.raw.keyboard.press('ArrowDown');
    await expect(sidePanel.commandInput).toContainText('goto https://b.com');

    await sidePanel.raw.keyboard.press('ArrowDown');
    await expect(sidePanel.commandInput.locator('.cm-placeholder')).toBeVisible();
  });

  // ─── Local Commands ────────────────────────────────────────────────────────

  test('comments display without server call', async ({ sidePanel }) => {
    await sidePanel.fillInput('# this is a comment');
    await sidePanel.raw.keyboard.press('Enter');

    await expect(sidePanel.output).toContainText('# this is a comment');
  });

  // ─── Editor ────────────────────────────────────────────────────────────────

  test('shows line numbers for content', async ({ sidePanel }) => {
    await sidePanel.fillEditor('goto https://example.com\nclick OK\npress Enter');

    const lineNums = sidePanel.raw.locator('.cm-lineNumbers .cm-gutterElement');
    // CM6 may include an extra gutter element; no exact-count Playwright assertion for >=
    expect(await lineNums.count()).toBeGreaterThanOrEqual(3);
  });

  test('enables buttons when editor has content', async ({ sidePanel }) => {
    await sidePanel.fillEditor('goto https://example.com');

    await expect(sidePanel.raw.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('disables buttons when editor is empty', async ({ sidePanel }) => {
    await sidePanel.fillEditor('');

    await expect(sidePanel.raw.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // ─── Run Button ────────────────────────────────────────────────────────────

  test('executes all editor lines and shows Run complete', async ({ sidePanel }) => {
    await sidePanel.fillEditor('goto https://example.com\nclick OK');

    await sidePanel.runBtn.click();

    await expect(sidePanel.output).toContainText('Run complete', { timeout: 15000 });
  });

  test('shows fail stats when command errors', async ({ sidePanel }) => {
    await sidePanel.fillEditor('click missing');

    await sidePanel.runBtn.click();

    await expect(sidePanel.output).toContainText('Run complete', { timeout: 15000 });
  });

  // ─── Recording UI ─────────────────────────────────────────────────────────

  test('record button toggles to Stop when recording starts', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();

    await expect(sidePanel.recordBtn).toHaveAttribute('title', 'Stop recording');
  });

  test('record button toggles back to Record when stopped', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();
    await expect(sidePanel.recordBtn).toHaveAttribute('title', 'Stop recording');

    await sidePanel.stopRecording();
    await expect(sidePanel.recordBtn).toHaveAttribute('title', 'Start Recording');
  });

  test('record button shows error when record-start fails', async ({ sidePanel }) => {
    await sidePanel.raw.evaluate(() => {
      const origSend = (chrome.runtime.sendMessage as any).bind(chrome.runtime);
      (chrome.runtime as any).sendMessage = async (msg: any) => {
        if (msg.type === 'record-start') return { ok: false, error: 'Cannot access chrome:// URLs' };
        return origSend(msg);
      };
    });

    await sidePanel.recordBtn.click();

    await expect(sidePanel.raw.locator('[data-type="error"]')).toContainText('Cannot access');
    await expect(sidePanel.recordBtn).not.toHaveClass(/recording/);
  });

  // ─── Recording content insertion ──────────────────────────────────────────

  test('recording inserts goto in pw mode', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();

    await expect(sidePanel.editor).toContainText('goto "https://example.com"');
  });

  test('recording inserts goto in JS syntax in JS mode', async ({ sidePanel }) => {
    await sidePanel.switchMode('js');
    await sidePanel.startMockRecording();

    await expect(sidePanel.editor).toContainText('await page.goto("https://example.com")');
  });

  test('recorded pw action appears after goto', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({ pw: 'click "Submit"', js: "await page.getByText('Submit').click();" });

    await expect(sidePanel.editor).toContainText('click "Submit"');

    const text = await sidePanel.getEditorText();
    expect(text.indexOf('goto')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('click')).toBeGreaterThan(text.indexOf('goto'));
  });

  test('recorded JS action appears after goto in JS mode', async ({ sidePanel }) => {
    await sidePanel.switchMode('js');
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({ pw: 'click "Submit"', js: "await page.getByText('Submit').click();" });

    await expect(sidePanel.editor).toContainText("page.getByText('Submit').click()");

    const text = await sidePanel.getEditorText();
    expect(text.indexOf('page.goto')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('getByText')).toBeGreaterThan(text.indexOf('page.goto'));
  });

  test('multiple recorded actions appear in order', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({ pw: 'click "First"', js: "await page.getByText('First').click();" });
    await sidePanel.fireRecordedAction({ pw: 'click "Second"', js: "await page.getByText('Second').click();" });

    await expect(sidePanel.editor).toContainText('click "Second"');

    const text = await sidePanel.getEditorText();
    expect(text.split('First').length - 1).toBe(1);
    expect(text.indexOf('First')).toBeLessThan(text.indexOf('Second'));
  });

  test('recording into existing content inserts goto after cursor', async ({ sidePanel }) => {
    // Type existing content — cursor ends up at the end
    await sidePanel.fillEditor('# existing script\n');
    await sidePanel.startMockRecording();

    await expect(sidePanel.editor).toContainText('goto "https://example.com"');

    const text = await sidePanel.getEditorText();
    expect(text.indexOf('# existing script')).toBeLessThan(text.indexOf('goto'));
  });

  test('check action appears in pw mode', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({
      pw: 'check checkbox "Remember me"',
      js: "await page.getByRole('checkbox', { name: 'Remember me' }).check();",
    });

    await expect(sidePanel.editor).toContainText('check checkbox "Remember me"');
    expect(await sidePanel.getEditorText()).not.toContain('click');
  });

  test('check action appears in JS mode', async ({ sidePanel }) => {
    await sidePanel.switchMode('js');
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({
      pw: 'check checkbox "Remember me"',
      js: "await page.getByRole('checkbox', { name: 'Remember me' }).check();",
    });

    await expect(sidePanel.editor).toContainText('.check()');
  });

  test('uncheck action appears in pw mode', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({
      pw: 'uncheck checkbox "Accept terms"',
      js: "await page.getByRole('checkbox', { name: 'Accept terms' }).uncheck();",
    });

    await expect(sidePanel.editor).toContainText('uncheck checkbox "Accept terms"');
    expect(await sidePanel.getEditorText()).not.toContain('click');
  });

  test('select action appears in pw mode', async ({ sidePanel }) => {
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({
      pw: 'select combobox "Country" "US"',
      js: "await page.getByRole('combobox', { name: 'Country' }).selectOption('US');",
    });

    await expect(sidePanel.editor).toContainText('select combobox "Country" "US"');
    expect(await sidePanel.getEditorText()).not.toContain('click');
  });

  test('select action appears in JS mode', async ({ sidePanel }) => {
    await sidePanel.switchMode('js');
    await sidePanel.startMockRecording();
    await sidePanel.fireRecordedAction({
      pw: 'select combobox "Country" "US"',
      js: "await page.getByRole('combobox', { name: 'Country' }).selectOption('US');",
    });

    await expect(sidePanel.editor).toContainText("selectOption('US')");
  });

  // ─── Editor mode toggle ─────────────────────────────────────────────────────

  test('has mode toggle showing both modes with active indicator', async ({ sidePanel }) => {
    await expect(sidePanel.modeToggle).toBeVisible();
    await expect(sidePanel.modeToggle).toContainText('.pw');
    await expect(sidePanel.modeToggle).toContainText('JS');
    // .pw is active by default
    await expect(sidePanel.modeToggle.getByText('.pw')).toHaveAttribute('data-active', '');
    await expect(sidePanel.modeToggle.getByText('JS')).not.toHaveAttribute('data-active');
    // Click JS to switch
    await sidePanel.switchMode('js');
    await expect(sidePanel.modeToggle.getByText('.pw')).not.toHaveAttribute('data-active');
  });

  test('debug button is enabled in JS mode', async ({ sidePanel }) => {
    await sidePanel.fillEditor('goto https://example.com');
    await sidePanel.switchMode('js');
    await expect(sidePanel.raw.getByTestId('debug-btn')).toBeEnabled();
  });

  test('step button is enabled when switching back to pw mode', async ({ sidePanel }) => {
    await sidePanel.fillEditor('goto https://example.com');
    await sidePanel.switchMode('js');
    await sidePanel.switchMode('pw');
    await expect(sidePanel.raw.locator('#step-btn')).toBeEnabled();
  });

  test('editor shows JS placeholder in JS mode', async ({ sidePanel }) => {
    await sidePanel.switchMode('js');
    await expect(sidePanel.raw.getByTestId('editor').locator('.cm-placeholder')).toContainText('// Type JavaScript...');
  });

});
