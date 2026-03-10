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

  await expect(panelPage.getByTestId('output')).toContainText('Available commands', { timeout: 5000 });
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

test('record button toggles to Stop when recording starts', async ({ panelPage }) => {
  // The fixture already mocks record-start → { ok: true } and connect() → stub port
  const btn = panelPage.getByTestId('record-btn');

  await btn.click();
  await expect(btn).toHaveAttribute('title', 'Stop recording');
  await expect(btn).toHaveClass(/recording/);
});

test('record button toggles back to Record when stopped', async ({ panelPage }) => {
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

/**
 * Override chrome.runtime.connect() so the port's onMessage listener is captured.
 * Returns a helper that fires a setSources message into the panel.
 * Must be called BEFORE clicking the record button.
 */
async function setupRecorderPort(page: Page): Promise<(sources: any[]) => Promise<void>> {
  await page.evaluate(() => {
    let msgListener: ((msg: any) => void) | null = null;
    (window as any).__fireRecorderSources = (sources: any[]) =>
      msgListener?.({ type: 'recorder', method: 'setSources', sources });
    (chrome.runtime as any).connect = () => ({
      onMessage: { addListener: (fn: any) => { msgListener = fn; } },
      onDisconnect: { addListener: () => {} },
      disconnect: () => {},
    });
  });
  return async (sources: any[]) => {
    await page.evaluate((s) => (window as any).__fireRecorderSources(s), sources);
  };
}

/** Build a sources payload with jsonl + optional javascript actions. */
function recorderSources(jsonlActions: object[], jsActions?: string[]) {
  return [
    { id: 'jsonl', actions: jsonlActions.map((a) => JSON.stringify(a)) },
    ...(jsActions ? [{ id: 'javascript', actions: jsActions }] : []),
  ];
}

test('recording inserts goto in pw mode', async ({ panelPage }) => {
  await setupRecorderPort(panelPage);
  await panelPage.getByTestId('record-btn').click();
  await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

  await expect(panelPage.getByTestId('editor').getByRole('textbox'))
    .toContainText('goto "https://example.com"');
});

test('recording inserts goto in JS syntax in JS mode', async ({ panelPage }) => {
  await panelPage.getByTestId('mode-toggle').click(); // pw → js
  await setupRecorderPort(panelPage);
  await panelPage.getByTestId('record-btn').click();
  await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

  await expect(panelPage.getByTestId('editor').getByRole('textbox'))
    .toContainText('await page.goto("https://example.com")');
});

test('recorded pw action appears after goto', async ({ panelPage }) => {
  const fireSources = await setupRecorderPort(panelPage);
  await panelPage.getByTestId('record-btn').click();
  await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

  await fireSources(recorderSources([
    { name: 'click', locator: { kind: 'text', body: 'Submit' } },
  ]));

  const editor = panelPage.getByTestId('editor').getByRole('textbox');
  await expect(editor).toContainText('click "Submit"');

  const text = await editor.textContent();
  expect(text!.indexOf('goto')).toBeGreaterThanOrEqual(0);
  expect(text!.indexOf('click')).toBeGreaterThan(text!.indexOf('goto'));
});

test('recorded JS action appears after goto in JS mode', async ({ panelPage }) => {
  await panelPage.getByTestId('mode-toggle').click(); // pw → js
  const fireSources = await setupRecorderPort(panelPage);
  await panelPage.getByTestId('record-btn').click();
  await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

  await fireSources(recorderSources(
    [{ name: 'click', locator: { kind: 'text', body: 'Submit' } }],
    ['  await page.click("text=Submit");'],
  ));

  const editor = panelPage.getByTestId('editor').getByRole('textbox');
  await expect(editor).toContainText('page.click("text=Submit")');

  const text = await editor.textContent();
  expect(text!.indexOf('page.goto')).toBeGreaterThanOrEqual(0);
  expect(text!.indexOf('page.click')).toBeGreaterThan(text!.indexOf('page.goto'));
});

test('openPage action is skipped in pw mode', async ({ panelPage }) => {
  const fireSources = await setupRecorderPort(panelPage);
  await panelPage.getByTestId('record-btn').click();
  await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

  await fireSources(recorderSources([
    { name: 'openPage', url: 'https://example.com' },
    { name: 'click', locator: { kind: 'text', body: 'Login' } },
  ]));

  const editor = panelPage.getByTestId('editor').getByRole('textbox');
  await expect(editor).toContainText('click "Login"');
  expect(await editor.textContent()).not.toContain('openPage');
});

test('incremental setSources calls append only new actions', async ({ panelPage }) => {
  const fireSources = await setupRecorderPort(panelPage);
  await panelPage.getByTestId('record-btn').click();
  await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

  // First setSources: one action
  await fireSources(recorderSources([
    { name: 'click', locator: { kind: 'text', body: 'First' } },
  ]));

  const editor = panelPage.getByTestId('editor').getByRole('textbox');
  await expect(editor).toContainText('click "First"');

  // Second setSources: cumulative list, only Second is new
  await fireSources(recorderSources([
    { name: 'click', locator: { kind: 'text', body: 'First' } },
    { name: 'click', locator: { kind: 'text', body: 'Second' } },
  ]));

  await expect(editor).toContainText('click "Second"');

  const text = await editor.textContent();
  // First appears only once (not duplicated)
  expect(text!.split('First').length - 1).toBe(1);
  // Second comes after First
  expect(text!.indexOf('First')).toBeLessThan(text!.indexOf('Second'));
});

test('recording into existing content inserts goto after cursor', async ({ panelPage }) => {
  // Type existing content — cursor ends up at the end
  await fillEditor(panelPage, '# existing script\n');
  await setupRecorderPort(panelPage);
  await panelPage.getByTestId('record-btn').click();
  await expect(panelPage.getByTestId('record-btn')).toHaveClass(/recording/);

  const editor = panelPage.getByTestId('editor').getByRole('textbox');
  await expect(editor).toContainText('goto "https://example.com"');

  const text = await editor.textContent();
  expect(text!.indexOf('# existing script')).toBeLessThan(text!.indexOf('goto'));
});

// ─── Editor mode toggle ─────────────────────────────────────────────────────

test('has mode toggle button showing current mode', async ({ panelPage }) => {
  const toggle = panelPage.getByTestId('mode-toggle');
  await expect(toggle).toBeVisible();
  await expect(toggle).toContainText('.pw');
  await toggle.click();
  await expect(toggle).toContainText('JS');
});

test('step button is enabled in JS mode (starts debug session)', async ({ panelPage }) => {
  await fillEditor(panelPage, 'goto https://example.com');
  await panelPage.getByTestId('mode-toggle').click(); // pw → js
  await expect(panelPage.locator('#step-btn')).toBeEnabled();
});

test('step button is enabled when switching back to pw mode', async ({ panelPage }) => {
  await fillEditor(panelPage, 'goto https://example.com');
  await panelPage.getByTestId('mode-toggle').click(); // pw → js
  await panelPage.getByTestId('mode-toggle').click(); // js → pw
  await expect(panelPage.locator('#step-btn')).toBeEnabled();
});

test('editor shows JS placeholder in JS mode', async ({ panelPage }) => {
  await panelPage.getByTestId('mode-toggle').click(); // pw → js
  await expect(panelPage.getByTestId('editor').locator('.cm-placeholder')).toContainText('// Type JavaScript...');
});
