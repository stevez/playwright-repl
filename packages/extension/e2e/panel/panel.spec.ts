/**
 * E2E tests for the extension side panel UI.
 *
 * Launches Chromium with the extension loaded, navigates to panel.html,
 * and mocks chrome.runtime.sendMessage to isolate the UI from the background.
 */

import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

/** Fill the CodeMirror 6 editor (contenteditable, not textarea). */
async function fillEditor(page: Page, text: string) {
  await page.getByTestId('editor').getByRole('textbox').click();
  if (text) await page.keyboard.type(text, { delay: 0 });
}

/** Type into the CM6 command input. */
async function fillInput(page: Page, text: string) {
  await page.getByTestId('command-input').locator('.cm-content').click();
  if (text) await page.keyboard.type(text, { delay: 0 });
}

test.describe("Panel page test", () => {

  test.beforeEach(async ({ panelPage, extensionId }) => {
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
    await panelPage.goto(`chrome-extension://${extensionId}/panel/panel.html`);

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

  test('has record button enabled', async ({ panelPage }) => {
    await expect(panelPage.getByTestId('record-btn')).toBeEnabled();
  });

  test('has prompt visible', async ({ panelPage }) => {
    await expect(panelPage.getByTestId('prompt')).toBeVisible();
  });

  // ─── REPL Command Input ────────────────────────────────────────────────────

  test('displays output after command', async ({ panelPage }) => {
    await fillInput(panelPage, 'help');
    await panelPage.keyboard.press('Enter');

    await expect(panelPage.getByTestId('output')).toContainText('Keyword commands', { timeout: 5000 });
  });

  test('clears input after submit', async ({ panelPage }) => {
    await fillInput(panelPage, 'snapshot');
    await panelPage.keyboard.press('Escape');
    await panelPage.keyboard.press('Enter');

    await expect(panelPage.getByTestId('command-input').locator('.cm-placeholder')).toBeVisible();
  });

  test('does not send empty input', async ({ panelPage }) => {
    await fillInput(panelPage, '   ');
    await panelPage.keyboard.press('Enter');

    await expect(panelPage.locator('[data-testid="output"] [data-status]')).toHaveCount(0);
  });

  test('displays error responses with error styling', async ({ panelPage }) => {
    await fillInput(panelPage, 'nonexistent-command');
    await panelPage.keyboard.press('Escape');
    await panelPage.keyboard.press('Enter');

    await expect(panelPage.locator('[data-type="error"]')).toContainText('Unknown command');
  });

  // ─── Command History ───────────────────────────────────────────────────────

  test('navigates history with ArrowUp/ArrowDown', async ({ panelPage }) => {
    await fillInput(panelPage, 'goto https://a.com');
    await panelPage.keyboard.press('Escape');
    await panelPage.keyboard.press('Enter');

    await fillInput(panelPage, 'goto https://b.com');
    await panelPage.keyboard.press('Escape');
    await panelPage.keyboard.press('Enter');

    // Re-focus the input before navigating history
    await panelPage.getByTestId('command-input').locator('.cm-content').click();

    await panelPage.keyboard.press('ArrowUp');
    await expect(panelPage.getByTestId('command-input')).toContainText('goto https://b.com');

    await panelPage.keyboard.press('ArrowUp');
    await expect(panelPage.getByTestId('command-input')).toContainText('goto https://a.com');

    await panelPage.keyboard.press('ArrowDown');
    await expect(panelPage.getByTestId('command-input')).toContainText('goto https://b.com');

    await panelPage.keyboard.press('ArrowDown');
    await expect(panelPage.getByTestId('command-input').locator('.cm-placeholder')).toBeVisible();
  });

  // ─── Local Commands ────────────────────────────────────────────────────────


  test('comments display without server call', async ({ panelPage }) => {
    await fillInput(panelPage, '# this is a comment');
    await panelPage.keyboard.press('Enter');

    await expect(panelPage.getByTestId('output')).toContainText('# this is a comment');
  });

  // ─── Editor ────────────────────────────────────────────────────────────────

  test('shows line numbers for content', async ({ panelPage }) => {
    await fillEditor(panelPage, 'goto https://example.com\nclick OK\npress Enter');

    const lineNums = panelPage.locator('.cm-lineNumbers .cm-gutterElement');
    // CM6 may include an extra gutter element; no exact-count Playwright assertion for >=
    expect(await lineNums.count()).toBeGreaterThanOrEqual(3);
  });

  test('enables buttons when editor has content', async ({ panelPage }) => {
    await fillEditor(panelPage, 'goto https://example.com');

    await expect(panelPage.getByRole('button', { name: 'Save' })).toBeEnabled();
  });

  test('disables buttons when editor is empty', async ({ panelPage }) => {
    await fillEditor(panelPage, '');

    await expect(panelPage.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  // ─── Run Button ────────────────────────────────────────────────────────────

  test('executes all editor lines and shows Run complete', async ({ panelPage }) => {
    await fillEditor(panelPage, 'goto https://example.com\nclick OK');

    await panelPage.getByTestId('run-btn').click();

    await expect(panelPage.getByTestId('output')).toContainText('Run complete', { timeout: 15000 });
  });

  test('shows fail stats when command errors', async ({ panelPage }) => {
    await fillEditor(panelPage, 'click missing');

    await panelPage.getByTestId('run-btn').click();

    await expect(panelPage.getByTestId('output')).toContainText('Run complete', { timeout: 15000 });
  });

  // ─── Recording UI ─────────────────────────────────────────────────────────

  /** Stub record-start, record-stop, and connect() for recording tests. */
  async function mockRecordingApis(page: Page) {
    await page.evaluate(() => {
      const orig = (chrome.runtime.sendMessage as any).bind(chrome.runtime);
      (chrome.runtime as any).sendMessage = async (msg: any) => {
        if (msg.type === 'health') return { ok: true };
        if (msg.type === 'attach') return { ok: true, url: 'https://example.com' };
        if (msg.type === 'record-start') return { ok: true, url: 'https://example.com' };
        if (msg.type === 'record-stop') return { ok: true };
        return orig(msg);
      };
    });
  }

  test('record button toggles to Stop when recording starts', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    const btn = panelPage.getByTestId('record-btn');

    await btn.click();
    await expect(btn).toHaveAttribute('title', 'Stop recording');
    await expect(btn).toHaveClass(/recording/);
  });

  test('record button toggles back to Record when stopped', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    const btn = panelPage.getByTestId('record-btn');

    await btn.click();
    await expect(btn).toHaveAttribute('title', 'Stop recording');
    await btn.click();
    await expect(btn).toHaveAttribute('title', 'Start Recording');
    await expect(btn).not.toHaveClass(/recording/);
  });

  test('record button shows error when record-start fails', async ({ panelPage }) => {
    await panelPage.evaluate(() => {
      const origSend = (chrome.runtime.sendMessage as any).bind(chrome.runtime);
      (chrome.runtime as any).sendMessage = async (msg: any) => {
        if (msg.type === 'record-start') return { ok: false, error: 'Cannot access chrome:// URLs' };
        return origSend(msg);
      };
    });

    const btn = panelPage.getByTestId('record-btn');
    await btn.click();

    await expect(panelPage.locator('[data-type="error"]')).toContainText('Cannot access');
    await expect(btn).not.toHaveClass(/recording/);
  });

  // ─── Recording content insertion ──────────────────────────────────────────

  /** Fire a recorded-action message to the Toolbar's onMessage listener. */
  async function fireRecordedAction(page: Page, action: { pw: string; js: string }) {
    await page.evaluate((a) => (window as any).__fireRecorderMsg({ type: 'recorded-action', action: a }), action);
  }

  test('recording inserts goto in pw mode', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await expect(panelPage.getByTestId('editor').getByRole('textbox'))
      .toContainText('goto "https://example.com"');
  });

  test('recording inserts goto in JS syntax in JS mode', async ({ panelPage }) => {
    await panelPage.getByTestId('mode-toggle').getByText('JS').click(); // pw → js
    await expect(panelPage.getByTestId('mode-toggle').getByText('JS')).toHaveAttribute('data-active', '');
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await expect(panelPage.getByTestId('editor').getByRole('textbox'))
      .toContainText('await page.goto("https://example.com")');
  });

  test('recorded pw action appears after goto', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, { pw: 'click "Submit"', js: "await page.getByText('Submit').click();" });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText('click "Submit"');

    const text = await editor.textContent();
    expect(text!.indexOf('goto')).toBeGreaterThanOrEqual(0);
    expect(text!.indexOf('click')).toBeGreaterThan(text!.indexOf('goto'));
  });

  test('recorded JS action appears after goto in JS mode', async ({ panelPage }) => {
    await panelPage.getByTestId('mode-toggle').getByText('JS').click(); // pw → js
    await expect(panelPage.getByTestId('mode-toggle').getByText('JS')).toHaveAttribute('data-active', '');
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, { pw: 'click "Submit"', js: "await page.getByText('Submit').click();" });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText("page.getByText('Submit').click()");

    const text = await editor.textContent();
    expect(text!.indexOf('page.goto')).toBeGreaterThanOrEqual(0);
    expect(text!.indexOf('getByText')).toBeGreaterThan(text!.indexOf('page.goto'));
  });

  test('multiple recorded actions appear in order', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, { pw: 'click "First"', js: "await page.getByText('First').click();" });
    await fireRecordedAction(panelPage, { pw: 'click "Second"', js: "await page.getByText('Second').click();" });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText('click "Second"');

    const text = await editor.textContent();
    expect(text!.split('First').length - 1).toBe(1);
    expect(text!.indexOf('First')).toBeLessThan(text!.indexOf('Second'));
  });

  test('recording into existing content inserts goto after cursor', async ({ panelPage }) => {
    // Type existing content — cursor ends up at the end
    await fillEditor(panelPage, '# existing script\n');
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText('goto "https://example.com"');

    const text = await editor.textContent();
    expect(text!.indexOf('# existing script')).toBeLessThan(text!.indexOf('goto'));
  });

  test('check action appears in pw mode', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, {
      pw: 'check checkbox "Remember me"',
      js: "await page.getByRole('checkbox', { name: 'Remember me' }).check();",
    });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText('check checkbox "Remember me"');
    expect(await editor.textContent()).not.toContain('click');
  });

  test('check action appears in JS mode', async ({ panelPage }) => {
    await panelPage.getByTestId('mode-toggle').getByText('JS').click();
    await expect(panelPage.getByTestId('mode-toggle').getByText('JS')).toHaveAttribute('data-active', '');
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, {
      pw: 'check checkbox "Remember me"',
      js: "await page.getByRole('checkbox', { name: 'Remember me' }).check();",
    });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText('.check()');
  });

  test('uncheck action appears in pw mode', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, {
      pw: 'uncheck checkbox "Accept terms"',
      js: "await page.getByRole('checkbox', { name: 'Accept terms' }).uncheck();",
    });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText('uncheck checkbox "Accept terms"');
    expect(await editor.textContent()).not.toContain('click');
  });

  test('select action appears in pw mode', async ({ panelPage }) => {
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, {
      pw: 'select combobox "Country" "US"',
      js: "await page.getByRole('combobox', { name: 'Country' }).selectOption('US');",
    });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText('select combobox "Country" "US"');
    expect(await editor.textContent()).not.toContain('click');
  });

  test('select action appears in JS mode', async ({ panelPage }) => {
    await panelPage.getByTestId('mode-toggle').getByText('JS').click();
    await expect(panelPage.getByTestId('mode-toggle').getByText('JS')).toHaveAttribute('data-active', '');
    await mockRecordingApis(panelPage);
    await panelPage.getByTestId('record-btn').click();
    await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

    await fireRecordedAction(panelPage, {
      pw: 'select combobox "Country" "US"',
      js: "await page.getByRole('combobox', { name: 'Country' }).selectOption('US');",
    });

    const editor = panelPage.getByTestId('editor').getByRole('textbox');
    await expect(editor).toContainText("selectOption('US')");
  });

  // ─── Editor mode toggle ─────────────────────────────────────────────────────

  test('has mode toggle showing both modes with active indicator', async ({ panelPage }) => {
    const toggle = panelPage.getByTestId('mode-toggle');
    await expect(toggle).toBeVisible();
    await expect(toggle).toContainText('.pw');
    await expect(toggle).toContainText('JS');
    // .pw is active by default
    await expect(toggle.getByText('.pw')).toHaveAttribute('data-active', '');
    await expect(toggle.getByText('JS')).not.toHaveAttribute('data-active');
    // Click JS to switch
    await toggle.getByText('JS').click();
    await expect(toggle.getByText('JS')).toHaveAttribute('data-active', '');
    await expect(toggle.getByText('.pw')).not.toHaveAttribute('data-active');
  });

  test('step button is enabled in JS mode (starts debug session)', async ({ panelPage }) => {
    await fillEditor(panelPage, 'goto https://example.com');
    await panelPage.getByTestId('mode-toggle').getByText('JS').click(); // pw → js
    await expect(panelPage.locator('#step-btn')).toBeEnabled();
  });

  test('step button is enabled when switching back to pw mode', async ({ panelPage }) => {
    await fillEditor(panelPage, 'goto https://example.com');
    await panelPage.getByTestId('mode-toggle').getByText('JS').click(); // pw → js
    await panelPage.getByTestId('mode-toggle').getByText('.pw').click(); // js → pw
    await expect(panelPage.locator('#step-btn')).toBeEnabled();
  });

  test('editor shows JS placeholder in JS mode', async ({ panelPage }) => {
    await panelPage.getByTestId('mode-toggle').getByText('JS').click(); // pw → js
    await expect(panelPage.getByTestId('editor').locator('.cm-placeholder')).toContainText('// Type JavaScript...');
  });
  
});
