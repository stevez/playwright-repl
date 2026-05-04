/**
 * Command integration test fixtures.
 *
 * Launches Chromium with the real extension loaded. Commands are sent via
 * the panel UI (CodeMirror input → Enter), with the full stack:
 * panel → swDebugEval → background service worker (playwright-crx).
 */

import { test as base, expect, chromium, type BrowserContext, type Page, type Worker } from '@playwright/test';
import { collectClientCoverage } from 'nextcov/playwright';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import fs from 'node:fs';

export { expect };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_PATH = path.resolve(__dirname, '../../dist');
const FIXTURE_DIR = __dirname;

const transformUrl = (url: string) => {
  if (!url.startsWith('chrome-extension://')) return url;
  return pathToFileURL(path.join(EXTENSION_PATH, new URL(url).pathname)).href;
};

type ExtensionContext = { context: BrowserContext; extensionId: string; sw: Worker };

// ─── Local test server ──────────────────────────────────────────────────────

function createTestServer(): Promise<{ server: http.Server; baseUrl: string }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const urlPath = req.url === '/' ? '/fixture.html' : req.url!;
      const filePath = path.join(FIXTURE_DIR, urlPath.replace(/^\//, ''));
      const ext = path.extname(filePath);
      const contentType = ext === '.html' ? 'text/html' : ext === '.js' ? 'application/javascript' : 'text/plain';

      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404);
          res.end('Not found');
        } else {
          res.writeHead(200, { 'Content-Type': contentType });
          res.end(data);
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as { port: number };
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}` });
    });
  });
}

// ─── Test fixtures ──────────────────────────────────────────────────────────

export const test = base.extend<
  { panelPage: Page },
  { extensionContext: ExtensionContext; testServer: { baseUrl: string } }
>({
  // Worker-scoped: local HTTP server for fixture pages
  testServer: [async ({}, use) => {
    const { server, baseUrl } = await createTestServer();
    await use({ baseUrl });
    server.close();
  }, { scope: 'worker' }],

  // Worker-scoped: browser launched once, reused across all tests in a worker
  extensionContext: [async ({ testServer }, use) => {
    const context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: !process.env.HEADED,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    // Navigate the initial blank tab to a real page so auto-attach never sees about:blank
    const [initialPage] = context.pages();
    if (initialPage) await initialPage.goto(testServer.baseUrl);

    let sw = context.serviceWorkers()[0];
    if (!sw) sw = await context.waitForEvent('serviceworker');
    const extensionId = sw.url().split('/')[2];

    // Warm up the service worker so it's responsive for the first test
    await sw.evaluate(() => chrome.runtime.getURL(''));

    await use({ context, extensionId, sw });
    await context.close();
  }, { scope: 'worker' }],

  // Test-scoped: fresh panel page + target tab per test
  panelPage: async ({ extensionContext, testServer }, use, testInfo) => {
    const { context, extensionId } = extensionContext;

    // Create target page
    const targetPage = await context.newPage();
    await targetPage.goto(testServer.baseUrl);

    // Create panel page
    const page = await context.newPage();

    await collectClientCoverage(page, testInfo, async () => {
      await page.goto(`chrome-extension://${extensionId}/panel/panel.html`);
      await page.waitForSelector('[data-testid="command-input"]', { timeout: 10000 });

      // Bring target to front AFTER panel is ready (so it's the active tab for query)
      await targetPage.bringToFront();

      // Attach extension to the active target tab
      await page.evaluate(() =>
        new Promise(resolve =>
          chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) =>
            tab?.id
              ? chrome.runtime.sendMessage({ type: 'attach', tabId: tab.id }, resolve)
              : resolve({ ok: false })
          )
        )
      );

      await use(page);
    }, { transformUrl });

    await page.close();
    await targetPage.close();
  },
});

// ─── sendCommand ────────────────────────────────────────────────────────────

/**
 * Submit a command through the panel UI (CodeMirror input → Enter) and return
 * the result from the output pane.
 *
 * Uses data-entry-id attributes to reliably identify the new result entry,
 * avoiding race conditions from console.log or extension lifecycle messages.
 */
export async function sendCommand(
  panelPage: Page,
  command: string,
): Promise<{ text: string; isError: boolean; image?: string }> {
  const output = panelPage.locator('[data-testid="output"]');

  // Snapshot existing entry IDs before submitting the command
  const prevIds = new Set(
    await output.locator('[data-entry-id]').evaluateAll(
      els => els.map(el => el.getAttribute('data-entry-id'))
    )
  );

  // Type and submit the command
  await panelPage.getByTestId('command-input').locator('.cm-content').click();
  await panelPage.keyboard.type(command, { delay: 0 });
  await panelPage.keyboard.press('Escape'); // close autocomplete
  await panelPage.keyboard.press('Enter');

  // Poll until we find a completed entry with a new ID
  await expect(async () => {
    const entries = await output.locator('[data-entry-id]').evaluateAll(
      (els, prev) => {
        for (const el of els) {
          const id = el.getAttribute('data-entry-id');
          if (id && !prev.includes(id)) {
            const status = el.getAttribute('data-status');
            if (status === 'done' || status === 'error') return { found: true };
          }
        }
        return { found: false };
      },
      [...prevIds]
    );
    expect(entries.found).toBe(true);
  }).toPass({ timeout: 15000 });

  // Find the new completed entry and extract its result
  const allEntries = await output.locator('[data-entry-id]').all();
  let resultEntry: typeof allEntries[0] | null = null;
  for (const entry of allEntries) {
    const id = await entry.getAttribute('data-entry-id');
    if (id && !prevIds.has(id)) {
      const status = await entry.getAttribute('data-status');
      if (status === 'done' || status === 'error') {
        resultEntry = entry;
        // Don't break — we want the last matching entry in case multiple appeared
      }
    }
  }

  if (!resultEntry) throw new Error(`No result entry found for command: ${command}`);

  const resultEl = resultEntry.locator('[data-type]').first();
  const hasResult = await resultEl.count() > 0;

  if (!hasResult) {
    // Entry completed without a visible data-type result (e.g., empty success)
    const status = await resultEntry.getAttribute('data-status');
    return { text: '', isError: status === 'error' };
  }

  const type = await resultEl.getAttribute('data-type');

  if (type === 'screenshot') {
    const image = await resultEl.locator('img').getAttribute('src') ?? '';
    return { text: '', isError: false, image };
  }

  const text = (await resultEl.textContent()) ?? '';
  const isError = type === 'error';
  return { text, isError };
}

/**
 * Alias for sendCommand — both go through the panel UI.
 * Kept as a separate export for run-code tests that explicitly want the UI path.
 */
export const sendViaUI = sendCommand;
