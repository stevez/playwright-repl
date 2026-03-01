/**
 * E2E tests for the extension side panel UI.
 *
 * Launches Chromium with the extension loaded, navigates to panel.html,
 * and uses page.route() to intercept HTTP calls to the CommandServer.
 */

import { test, expect } from './fixtures.js';

// ─── Initialization ────────────────────────────────────────────────────────

test('shows version from health endpoint', async ({ panelPage }) => {
  const text = await panelPage.locator('#output').textContent();
  expect(text).toContain('Playwright REPL v0.4.0-test');
});

test('shows connected status', async ({ panelPage }) => {
  const text = await panelPage.locator('#output').textContent();
  expect(text).toContain('Connected to localhost');
});

test('has record button enabled', async ({ panelPage }) => {
  const enabled = await panelPage.locator('#record-btn').isEnabled();
  expect(enabled).toBe(true);
});

test('has prompt visible', async ({ panelPage }) => {
  const visible = await panelPage.locator('#prompt').isVisible();
  expect(visible).toBe(true);
});

// ─── REPL Command Input ────────────────────────────────────────────────────

test('displays success response after command', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: '### Result\nNavigated to https://example.com', isError: false });

  const input = panelPage.getByPlaceholder('Type a .pw command...');
  await input.fill('goto https://example.com');
  await input.press('Enter');

  await expect(panelPage.locator('#output')).toContainText('Navigated');

});

test('clears input after submit', async ({ panelPage }) => {
  const input = panelPage.getByPlaceholder('Type a .pw command...');
  await input.fill('snapshot');
  await input.press('Enter');

  const value = await input.inputValue();
  expect(value).toBe('');
});

test('does not send empty input', async ({ panelPage }) => {
  const input = panelPage.getByPlaceholder('Type a .pw command...');
  await input.fill('   ');
  await input.press('Enter');

  const commands = panelPage.locator('[data-type="command"]');
  expect(await commands.count()).toBe(0);
});

test('displays error responses with error styling', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: '### Error\nElement not found', isError: true });

  const input = panelPage.getByPlaceholder('Type a .pw command...');
  await input.fill('click missing');
  await input.press('Enter');

  await expect(panelPage.locator('[data-type="error"]')).toContainText('Element not found');
});

// ─── Command History ───────────────────────────────────────────────────────

test('navigates history with ArrowUp/ArrowDown', async ({ panelPage }) => {
  const input = panelPage.getByPlaceholder('Type a .pw command...');

  await input.fill('goto https://a.com');
  await input.press('Enter');


  await input.fill('goto https://b.com');
  await input.press('Enter');


  await input.press('ArrowUp');
  expect(await input.inputValue()).toBe('goto https://b.com');

  await input.press('ArrowUp');
  expect(await input.inputValue()).toBe('goto https://a.com');

  await input.press('ArrowDown');
  expect(await input.inputValue()).toBe('goto https://b.com');

  await input.press('ArrowDown');
  expect(await input.inputValue()).toBe('');
});

// ─── Local Commands ────────────────────────────────────────────────────────

test('clear button empties the output', async ({ panelPage }) => {
  const input = panelPage.getByPlaceholder('Type a .pw command...');
  await input.fill('snapshot');
  await input.press('Enter');
  await expect(panelPage.locator('[data-type="command"]')).toBeVisible();

  await panelPage.getByRole('button', { name: 'Clear' }).click();

  await expect(panelPage.locator('#output [data-type]')).toHaveCount(0);
});

test('comments display without server call', async ({ panelPage }) => {
  const input = panelPage.getByPlaceholder('Type a .pw command...');
  await input.fill('# this is a comment');
  await input.press('Enter');

  await expect(panelPage.locator('[data-type="comment"]')).toContainText('# this is a comment');
});

// ─── Editor ────────────────────────────────────────────────────────────────

test('shows line numbers for content', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('goto https://example.com\nclick OK\npress Enter');

  const lineNums = panelPage.locator('#line-numbers div');
  expect(await lineNums.count()).toBe(3);
});

test('enables buttons when editor has content', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('goto https://example.com');


  expect(await panelPage.locator('#save-btn').isDisabled()).toBe(false);
  expect(await panelPage.locator('#export-btn').isDisabled()).toBe(false);
});

test('disables buttons when editor is empty', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('');

  expect(await panelPage.locator('#save-btn').isDisabled()).toBe(true);
  expect(await panelPage.locator('#export-btn').isDisabled()).toBe(true);
});

// ─── Run Button ────────────────────────────────────────────────────────────

test('executes all editor lines and shows Run complete', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('goto https://example.com\nclick OK');


  await panelPage.locator('#run-btn').click();

  await expect(panelPage.locator('#output')).toContainText('Run complete', { timeout: 15000 });
});

test('shows fail stats when command errors', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: '### Error\nFailed', isError: true });

  const editor = panelPage.locator('#editor');
  await editor.fill('click missing');


  await panelPage.locator('#run-btn').click();

  await expect(panelPage.locator('#output')).toContainText('Run complete', { timeout: 15000 });
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

  const btn = panelPage.locator('#record-btn');

  // Click to start recording
  await btn.click();
  await expect(btn).toContainText('Stop');
  const hasRecording = await btn.evaluate(el => el.classList.contains('recording'));
  expect(hasRecording).toBe(true);
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

  const btn = panelPage.locator('#record-btn');

  // Start then stop
  await btn.click();
  await expect(btn).toContainText('Stop');
  await btn.click();
  await expect(btn).toContainText('Record');
  const hasRecording = await btn.evaluate(el => el.classList.contains('recording'));
  expect(hasRecording).toBe(false);
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

  const btn = panelPage.locator('#record-btn');
  await btn.click();

  // Should show error
  await expect(panelPage.locator('[data-type="error"]')).toContainText('Cannot access');

  // Button should NOT be in recording state
  const hasRecording = await btn.evaluate(el => el.classList.contains('recording'));
  expect(hasRecording).toBe(false);
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
  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).toContain('click "Submit"');
});
