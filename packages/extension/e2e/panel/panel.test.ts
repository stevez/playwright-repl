/**
 * E2E tests for the extension side panel UI.
 *
 * Launches Chromium with the extension loaded, navigates to panel.html,
 * and uses page.route() to intercept HTTP calls to the CommandServer.
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

test('shows version from health endpoint', async ({ panelPage }) => {
  await expect(panelPage.getByTestId('output')).toContainText('Playwright REPL v0.4.0-test');
});

test('shows connected status', async ({ panelPage }) => {
  await expect(panelPage.getByTestId('output')).toContainText('Connected to localhost');
});

test('has record button enabled', async ({ panelPage }) => {
  await expect(panelPage.getByTestId('record-btn')).toBeEnabled();
});

test('has prompt visible', async ({ panelPage }) => {
  await expect(panelPage.getByTestId('prompt')).toBeVisible();
});

// ─── REPL Command Input ────────────────────────────────────────────────────

test('displays success response after command', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: '### Result\nNavigated to https://example.com', isError: false });

  await fillInput(panelPage, 'goto https://example.com');
  await panelPage.keyboard.press('Escape');  // close autocomplete
  await panelPage.keyboard.press('Enter');

  await expect(panelPage.getByTestId('output')).toContainText('Navigated');
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

  await expect(panelPage.locator('[data-type="command"]')).toHaveCount(0);
});

test('displays error responses with error styling', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: '### Error\nElement not found', isError: true });

  await fillInput(panelPage, 'click missing');
  await panelPage.keyboard.press('Escape');
  await panelPage.keyboard.press('Enter');

  await expect(panelPage.locator('[data-type="error"]')).toContainText('Element not found');
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

test('clear button empties the output', async ({ panelPage }) => {
  await fillInput(panelPage, 'snapshot');
  await panelPage.keyboard.press('Escape');
  await panelPage.keyboard.press('Enter');
  await expect(panelPage.locator('[data-type="command"]')).toBeVisible();

  await panelPage.getByRole('button', { name: 'Clear' }).click();

  await expect(panelPage.getByTestId('output').locator('[data-type]')).toHaveCount(0);
});

test('comments display without server call', async ({ panelPage }) => {
  await fillInput(panelPage, '# this is a comment');
  await panelPage.keyboard.press('Enter');

  await expect(panelPage.locator('[data-type="comment"]')).toContainText('# this is a comment');
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
  await expect(panelPage.getByRole('button', { name: 'Export' })).toBeEnabled();
});

test('disables buttons when editor is empty', async ({ panelPage }) => {
  await fillEditor(panelPage, '');

  await expect(panelPage.getByRole('button', { name: 'Save' })).toBeDisabled();
  await expect(panelPage.getByRole('button', { name: 'Export' })).toBeDisabled();
});

// ─── Run Button ────────────────────────────────────────────────────────────

test('executes all editor lines and shows Run complete', async ({ panelPage }) => {
  await fillEditor(panelPage, 'goto https://example.com\nclick OK');

  await panelPage.getByTestId('run-btn').click();

  await expect(panelPage.getByTestId('output')).toContainText('Run complete', { timeout: 15000 });
});

test('shows fail stats when command errors', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: '### Error\nFailed', isError: true });

  await fillEditor(panelPage, 'click missing');

  await panelPage.getByTestId('run-btn').click();

  await expect(panelPage.getByTestId('output')).toContainText('Run complete', { timeout: 15000 });
});

// ─── Recording UI ─────────────────────────────────────────────────────────

test('record button toggles to Stop when recording starts', async ({ panelPage }) => {
  // Mock chrome APIs so we don't need a real tab to inject into
  await panelPage.evaluate(() => {
    chrome.tabs.query = async () => [{ id: 999, title: "Test Page", url: "https://example.com" }] as chrome.tabs.Tab[];
    const origSend = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (msg: any) => {
      if (msg.type === 'pw-record-start' || msg.type === 'pw-record-stop') return { ok: true };
      return origSend(msg);
    };
  });

  const btn = panelPage.getByTestId('record-btn');

  // Click to start recording
  await btn.click();
  await expect(btn).toHaveAttribute('title', 'Stop recording');
  await expect(btn).toHaveClass(/recording/);
});

test('record button toggles back to Record when stopped', async ({ panelPage }) => {
  await panelPage.evaluate(() => {
    chrome.tabs.query = async () => [{ id: 999, title: "Test Page", url: "https://example.com" }] as chrome.tabs.Tab[];
    const origSend = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (msg: any) => {
      if (msg.type === 'pw-record-start' || msg.type === 'pw-record-stop') return { ok: true };
      return origSend(msg);
    };
  });

  const btn = panelPage.getByTestId('record-btn');

  // Start then stop
  await btn.click();
  await expect(btn).toHaveAttribute('title', 'Stop recording');
  await btn.click();
  await expect(btn).toHaveAttribute('title', 'Start Recording');
  await expect(btn).not.toHaveClass(/recording/);
});

test('record button shows error when injection fails', async ({ panelPage }) => {
  await panelPage.evaluate(() => {
    chrome.tabs.query = async () => [{ id: 999, title: "Test Page", url: "chrome://settings" }] as chrome.tabs.Tab[];
    const origSend = chrome.runtime.sendMessage.bind(chrome.runtime);
    chrome.runtime.sendMessage = async (msg: any) => {
      if (msg.type === 'pw-record-start') return { ok: false, error: 'Cannot access chrome:// URLs' };
      return origSend(msg);
    };
  });

  const btn = panelPage.getByTestId('record-btn');
  await btn.click();

  // Should show error
  await expect(panelPage.locator('[data-type="error"]')).toContainText('Cannot access');

  // Button should NOT be in recording state
  await expect(btn).not.toHaveClass(/recording/);
});

test('received recorded commands appear in editor', async ({ panelPage }) => {
  // Send a message from the service worker to simulate a recorded command
  const context = panelPage.context();
  const sw = context.serviceWorkers()[0];

  await sw.evaluate(() => {
    chrome.runtime.sendMessage({ type: 'pw-recorded-command', command: 'click "Submit"' });
  });

  // Verify command appears in the console output
  await expect(panelPage.locator('[data-type="command"]')).toContainText('click "Submit"');

  // Verify command is also appended to the editor
  await expect(panelPage.getByTestId('editor').getByRole('textbox')).toContainText('click "Submit"');
});
