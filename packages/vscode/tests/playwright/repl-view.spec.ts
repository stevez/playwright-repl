/**
 * Tests for replView.script.ts — the REPL webview client script.
 *
 * Tests the webview directly: load HTML + script in a page, simulate
 * extension messages via Event dispatch. No Extension, no activate(),
 * no browser needed.
 */

import { test as base, expect, Page } from '@playwright/test';
import { filterAppCoverage, saveClientCoverage } from 'nextcov/playwright';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const EXTENSION_DIR = path.resolve(__dirname, '../..');

function transformUrl(url: string): string {
  if (!url.startsWith('http://localhost/')) return url;
  const suffix = url.substring('http://localhost/'.length);
  return pathToFileURL(path.join(EXTENSION_DIR, suffix)).href;
}

const replHtml = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"></head>
<body class="repl-view">
  <div id="filter-bar" style="display:none">
    <button class="filter-btn active" data-filter="all">All</button>
    <button class="filter-btn" data-filter="command">Commands</button>
    <button class="filter-btn" data-filter="output">Output</button>
    <button class="filter-btn" data-filter="error">Errors</button>
    <button class="filter-btn" data-filter="info">Info</button>
  </div>
  <div id="search-bar" style="display:none">
    <input id="search-input" type="text" placeholder="Find…" />
    <span id="search-count"></span>
    <button class="filter-btn" id="search-prev">&#x2191;</button>
    <button class="filter-btn" id="search-next">&#x2193;</button>
    <button class="filter-btn" id="search-close">&#x2715;</button>
  </div>
  <div id="output"></div>
  <div id="input-row">
    <div id="autocomplete-dropdown"></div>
    <span id="prompt">pw&gt;</span>
    <textarea id="command-input" rows="1" placeholder="Type a command..."></textarea>
  </div>
  <script src="/dist/replView.script.js"></script>
</body>
</html>`;

// Lightweight fixture: a page serving the replView HTML + script.
const test = base.extend<{ replPage: Page }>({
  replPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.route('**/*', async route => {
      const url = route.request().url();
      if (url === 'http://localhost/')
        await route.fulfill({ contentType: 'text/html', body: replHtml });
      else if (url.startsWith('http://localhost/')) {
        const suffix = url.substring('http://localhost/'.length);
        const filePath = path.join(EXTENSION_DIR, suffix);
        if (fs.existsSync(filePath))
          await route.fulfill({ body: fs.readFileSync(filePath) });
        else
          await route.fulfill({ status: 404 });
      } else {
        await route.continue();
      }
    });

    // Mock acquireVsCodeApi: captures outgoing messages in window.__messages.
    await page.addInitScript(() => {
      (window as any).__messages = [];
      (window as any).acquireVsCodeApi = () => ({
        postMessage: (data: any) => (window as any).__messages.push(data),
      });
    });

    await page.coverage.startJSCoverage();
    await page.goto('http://localhost');
    await use(page);

    // Collect client-side coverage from the standalone replView page
    const jsCoverage = await page.coverage.stopJSCoverage();
    const entries = jsCoverage.map(e => ({ ...e, url: transformUrl(e.url) }));
    const appCoverage = filterAppCoverage(entries);
    if (appCoverage.length > 0)
      await saveClientCoverage('replview-standalone', appCoverage as any);

    await context.close();
  },
});

/** Dispatch a message from the "extension" to the webview. */
async function postToWebview(page: Page, method: string, params?: Record<string, any>) {
  await page.evaluate(({ method, params }) => {
    const event = new Event('message');
    (event as any).data = { method, params };
    window.dispatchEvent(event);
  }, { method, params });
}

/** Type a command in the REPL input and press Enter. */
async function typeCommand(page: Page, command: string) {
  const input = page.locator('#command-input');
  await input.fill(command);
  await input.press('Enter');
}

/** Read captured messages sent from webview to extension. */
async function getCapturedMessages(page: Page): Promise<any[]> {
  return page.evaluate(() => (window as any).__messages);
}

test('should render welcome message', async ({ replPage }) => {
  await postToWebview(replPage, 'output', { text: 'Playwright REPL\nType commands. Use ↑↓ for history.', type: 'info' });
  await postToWebview(replPage, 'output', { text: 'Waiting for browser...', type: 'error' });

  await expect(replPage.locator('#output')).toContainText('Playwright REPL');
  await expect(replPage.locator('#output')).toContainText('Waiting for browser');
});

test('should render output lines with correct CSS classes', async ({ replPage }) => {
  await postToWebview(replPage, 'output', { text: 'hello', type: 'output' });
  await postToWebview(replPage, 'output', { text: 'oops', type: 'error' });
  await postToWebview(replPage, 'output', { text: 'note', type: 'info' });

  await expect(replPage.locator('.line-output')).toContainText('hello');
  await expect(replPage.locator('.line-error')).toContainText('oops');
  await expect(replPage.locator('.line-info')).toContainText('note');
});

test('should send execute message on Enter', async ({ replPage }) => {
  await typeCommand(replPage, 'snapshot');

  const messages = await getCapturedMessages(replPage);
  const execMsg = messages.find((m: any) => m.method === 'execute');
  expect(execMsg).toBeTruthy();
  expect(execMsg.params.command).toBe('snapshot');
});

test('should show typed command in output', async ({ replPage }) => {
  await typeCommand(replPage, 'click e5');
  await expect(replPage.locator('.line-command')).toContainText('click e5');
});

test('should clear output on clear message', async ({ replPage }) => {
  await postToWebview(replPage, 'output', { text: 'some output', type: 'info' });
  await expect(replPage.locator('#output .line')).not.toHaveCount(0);

  await postToWebview(replPage, 'clear');
  await expect(replPage.locator('#output')).toBeEmpty();
});

test('should disable input during processing', async ({ replPage }) => {
  await postToWebview(replPage, 'processing', { processing: true });
  await expect(replPage.locator('#command-input')).toBeDisabled();

  await postToWebview(replPage, 'processing', { processing: false });
  await expect(replPage.locator('#command-input')).toBeEnabled();
});

test('should navigate history with arrow keys', async ({ replPage }) => {
  await typeCommand(replPage, 'first');
  await typeCommand(replPage, 'second');

  const input = replPage.locator('#command-input');
  // ArrowUp from empty input → most recent command
  await input.press('ArrowUp');
  await expect(input).toHaveValue('second');
  // Move cursor to start (script checks selectionStart === 0)
  await input.press('Home');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('first');
  await input.press('ArrowDown');
  await expect(input).toHaveValue('second');
  await input.press('ArrowDown');
  await expect(input).toHaveValue('');
});

test('should request history on load', async ({ replPage }) => {
  const messages = await getCapturedMessages(replPage);
  const historyMsg = messages.find((m: any) => m.method === 'getHistory');
  expect(historyMsg).toBeTruthy();
});

test('should restore history from extension', async ({ replPage }) => {
  await postToWebview(replPage, 'history', { history: ['old1', 'old2'] });

  const input = replPage.locator('#command-input');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('old1');
  await input.press('Home');
  await input.press('ArrowUp');
  await expect(input).toHaveValue('old2');
});

// ─── Filter tests ────────────────────────────────────────────────────────

test('should toggle filter bar visibility', async ({ replPage }) => {
  const filterBar = replPage.locator('#filter-bar');
  await expect(filterBar).not.toBeVisible();

  await postToWebview(replPage, 'toggleFilter');
  await expect(filterBar).toBeVisible();

  await postToWebview(replPage, 'toggleFilter');
  await expect(filterBar).not.toBeVisible();
});

test('should filter output by type', async ({ replPage }) => {
  // Add lines of different types
  await typeCommand(replPage, 'test command');
  await postToWebview(replPage, 'output', { text: 'some output', type: 'output' });
  await postToWebview(replPage, 'output', { text: 'an error', type: 'error' });
  await postToWebview(replPage, 'output', { text: 'info note', type: 'info' });

  // Show filter bar and filter to errors only
  await postToWebview(replPage, 'toggleFilter');
  await replPage.locator('.filter-btn[data-filter="error"]').click();

  // Error line visible, others hidden
  await expect(replPage.locator('.line-error')).toBeVisible();
  await expect(replPage.locator('.line-command')).toBeHidden();
  await expect(replPage.locator('.line-output')).toBeHidden();
  await expect(replPage.locator('.line-info')).toBeHidden();

  // Switch back to all
  await replPage.locator('.filter-btn[data-filter="all"]').click();
  await expect(replPage.locator('.line-command')).toBeVisible();
  await expect(replPage.locator('.line-output')).toBeVisible();
  await expect(replPage.locator('.line-error')).toBeVisible();
  await expect(replPage.locator('.line-info')).toBeVisible();
});

// ─── Search tests ────────────────────────────────────────────────────────

test('should toggle search bar visibility', async ({ replPage }) => {
  const searchBar = replPage.locator('#search-bar');
  await expect(searchBar).not.toBeVisible();

  await postToWebview(replPage, 'toggleSearch');
  await expect(searchBar).toBeVisible();
  await expect(replPage.locator('#search-input')).toBeFocused();

  await postToWebview(replPage, 'toggleSearch');
  await expect(searchBar).not.toBeVisible();
});

test('should highlight matching lines on search', async ({ replPage }) => {
  await postToWebview(replPage, 'output', { text: 'hello world', type: 'output' });
  await postToWebview(replPage, 'output', { text: 'goodbye world', type: 'output' });
  await postToWebview(replPage, 'output', { text: 'hello again', type: 'output' });

  await postToWebview(replPage, 'toggleSearch');
  await replPage.locator('#search-input').fill('hello');

  // Two lines should be highlighted
  await expect(replPage.locator('.search-highlight')).toHaveCount(2);
  await expect(replPage.locator('#search-count')).toHaveText('1/2');
});

test('should navigate search results', async ({ replPage }) => {
  await postToWebview(replPage, 'output', { text: 'apple pie', type: 'output' });
  await postToWebview(replPage, 'output', { text: 'banana split', type: 'output' });
  await postToWebview(replPage, 'output', { text: 'apple sauce', type: 'output' });

  await postToWebview(replPage, 'toggleSearch');
  await replPage.locator('#search-input').fill('apple');

  await expect(replPage.locator('#search-count')).toHaveText('1/2');

  // Navigate to next
  await replPage.locator('#search-next').click();
  await expect(replPage.locator('#search-count')).toHaveText('2/2');

  // Navigate to previous (wraps around)
  await replPage.locator('#search-prev').click();
  await expect(replPage.locator('#search-count')).toHaveText('1/2');
});

test('should close search with Escape', async ({ replPage }) => {
  await postToWebview(replPage, 'toggleSearch');
  await replPage.locator('#search-input').fill('test');
  await replPage.locator('#search-input').press('Escape');

  await expect(replPage.locator('#search-bar')).not.toBeVisible();
});

// ─── Clear test ──────────────────────────────────────────────────────────

test('should clear output via clear message', async ({ replPage }) => {
  await postToWebview(replPage, 'output', { text: 'line 1', type: 'output' });
  await postToWebview(replPage, 'output', { text: 'line 2', type: 'output' });
  await expect(replPage.locator('#output .line')).toHaveCount(2);

  await postToWebview(replPage, 'clear');
  await expect(replPage.locator('#output')).toBeEmpty();
});
