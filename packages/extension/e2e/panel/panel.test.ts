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
  expect(text).toContain('Connected to server');
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

  const input = panelPage.locator('#command-input');
  await input.fill('goto https://example.com');
  await input.press('Enter');

  await panelPage.waitForFunction(
    () => document.querySelector('.line-success')?.textContent?.includes('Navigated'),
  );
});

test('clears input after submit', async ({ panelPage }) => {
  const input = panelPage.locator('#command-input');
  await input.fill('snapshot');
  await input.press('Enter');
  await panelPage.waitForTimeout(200);
  const value = await input.inputValue();
  expect(value).toBe('');
});

test('does not send empty input', async ({ panelPage }) => {
  const input = panelPage.locator('#command-input');
  await input.fill('   ');
  await input.press('Enter');
  await panelPage.waitForTimeout(300);
  const commands = panelPage.locator('.line-command');
  expect(await commands.count()).toBe(0);
});

test('displays error responses with error styling', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: 'Element not found', isError: true });

  const input = panelPage.locator('#command-input');
  await input.fill('click missing');
  await input.press('Enter');

  await panelPage.waitForFunction(
    () => document.querySelector('.line-error')?.textContent?.includes('Element not found'),
  );
});

// ─── Command History ───────────────────────────────────────────────────────

test('navigates history with ArrowUp/ArrowDown', async ({ panelPage }) => {
  const input = panelPage.locator('#command-input');

  await input.fill('goto https://a.com');
  await input.press('Enter');
  await panelPage.waitForTimeout(300);

  await input.fill('goto https://b.com');
  await input.press('Enter');
  await panelPage.waitForTimeout(300);

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

test('clear empties the output', async ({ panelPage }) => {
  const input = panelPage.locator('#command-input');
  await input.fill('snapshot');
  await input.press('Enter');
  await panelPage.waitForSelector('.line-command');

  await input.fill('clear');
  await input.press('Enter');

  // Wait for the output to be cleared
  await expect(panelPage.locator('#output .line')).toHaveCount(0);
});

test('comments display without server call', async ({ panelPage }) => {
  const input = panelPage.locator('#command-input');
  await input.fill('# this is a comment');
  await input.press('Enter');

  await panelPage.waitForSelector('.line-comment');
  const text = await panelPage.locator('.line-comment').last().textContent();
  expect(text).toContain('# this is a comment');
});

// ─── Editor ────────────────────────────────────────────────────────────────

test('shows line numbers for content', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('goto https://example.com\nclick OK\npress Enter');
  await editor.dispatchEvent('input');
  await panelPage.waitForTimeout(100);

  const lineNums = panelPage.locator('#line-numbers div');
  expect(await lineNums.count()).toBe(3);
});

test('enables buttons when editor has content', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('goto https://example.com');
  await editor.dispatchEvent('input');
  await panelPage.waitForTimeout(100);

  expect(await panelPage.locator('#copy-btn').isDisabled()).toBe(false);
  expect(await panelPage.locator('#save-btn').isDisabled()).toBe(false);
  expect(await panelPage.locator('#export-btn').isDisabled()).toBe(false);
});

test('disables buttons when editor is empty', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('');
  await editor.dispatchEvent('input');
  await panelPage.waitForTimeout(100);

  expect(await panelPage.locator('#copy-btn').isDisabled()).toBe(true);
  expect(await panelPage.locator('#save-btn').isDisabled()).toBe(true);
  expect(await panelPage.locator('#export-btn').isDisabled()).toBe(true);
});

// ─── Run Button ────────────────────────────────────────────────────────────

test('executes all editor lines and shows Run complete', async ({ panelPage }) => {
  const editor = panelPage.locator('#editor');
  await editor.fill('goto https://example.com\nclick OK');
  await editor.dispatchEvent('input');

  await panelPage.locator('#run-btn').click();

  await panelPage.waitForFunction(
    () => document.getElementById('output')!.textContent!.includes('Run complete'),
    { timeout: 15000 },
  );
});

test('shows fail stats when command errors', async ({ panelPage, mockResponse }) => {
  mockResponse({ text: 'Failed', isError: true });

  const input = panelPage.locator('#command-input');
  await input.fill('clear');
  await input.press('Enter');

  const editor = panelPage.locator('#editor');
  await editor.fill('click missing');
  await editor.dispatchEvent('input');

  await panelPage.locator('#run-btn').click();

  await panelPage.waitForFunction(
    () => document.getElementById('output')!.textContent!.includes('Run complete'),
    { timeout: 15000 },
  );

  const statsText = await panelPage.locator('#console-stats').textContent();
  expect(statsText).toContain('1');
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
  await expect(btn).toHaveText('Stop');
  const hasRecording = await btn.evaluate(el => el.classList.contains('recording'));
  expect(hasRecording).toBe(true);

  // Info message should appear
  await panelPage.waitForFunction(
    () => {
      const infos = document.querySelectorAll('.line-info');
      return [...infos].some(el => el.textContent!.includes('Recording on'));
    },
  );
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
  await expect(btn).toHaveText('Stop');
  await btn.click();
  await expect(btn).toHaveText('Record');
  const hasRecording = await btn.evaluate(el => el.classList.contains('recording'));
  expect(hasRecording).toBe(false);

  // Stop info message should appear
  await panelPage.waitForFunction(
    () => {
      const infos = document.querySelectorAll('.line-info');
      return [...infos].some(el => el.textContent!.includes('Recording stopped'));
    },
  );
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
  await panelPage.waitForFunction(
    () => document.querySelector('.line-error')?.textContent?.includes('Cannot access'),
  );

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
  await panelPage.waitForFunction(
    () => document.querySelector('.line-command')?.textContent?.includes('click "Submit"'),
  );

  // Verify command is also appended to the editor
  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).toContain('click "Submit"');
});

// ─── Theme ─────────────────────────────────────────────────────────────────

test('applies dark theme based on color scheme', async ({ panelPage }) => {
  await panelPage.emulateMedia({ colorScheme: 'dark' });
  await panelPage.reload();
  await panelPage.waitForSelector('.line-info', { timeout: 10000 });

  const hasDark = await panelPage.evaluate(
    () => document.body.classList.contains('theme-dark'),
  );
  expect(hasDark).toBe(true);

  await panelPage.emulateMedia({ colorScheme: 'light' });
});
