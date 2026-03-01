/**
 * Recording integration E2E tests.
 *
 * Tests the full recording pipeline with the real extension:
 *   recorder.js (content script) → chrome.runtime.sendMessage → panel.js
 *
 * Key challenge: In E2E tests the panel runs as a regular tab
 * (not a real side panel), so we trigger recording via chrome.runtime.sendMessage
 * from the panel page (an extension page that can message the service worker).
 */

import { test, expect } from './fixtures.js';
import type { Page } from '@playwright/test';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Start recording on the target page via chrome.runtime.sendMessage
 * sent from the panel page (an extension page), the same way the
 * panel triggers recording in production.
 */
async function startRecordingOn(panelPage: Page, targetPage: Page): Promise<{ ok: boolean; error?: string }> {
  const targetUrl = targetPage.url();
  return await panelPage.evaluate(async (url: string) => {
    const tabs: any[] = await (chrome.tabs.query as any)({});
    const tab = tabs.find((t: any) => t.url && t.url.startsWith(url));
    if (!tab) return { ok: false, error: 'Target tab not found for ' + url };
    return await (chrome.runtime.sendMessage as any)({ type: 'pw-record-start', tabId: tab.id });
  }, targetUrl);
}

/**
 * Stop recording on the target page.
 */
async function stopRecordingOn(panelPage: Page, targetPage: Page): Promise<{ ok: boolean }> {
  const targetUrl = targetPage.url();
  return await panelPage.evaluate(async (url: string) => {
    const tabs: any[] = await (chrome.tabs.query as any)({});
    const tab = tabs.find((t: any) => t.url && t.url.startsWith(url));
    if (!tab) return { ok: true };
    return await (chrome.runtime.sendMessage as any)({ type: 'pw-record-stop', tabId: tab.id });
  }, targetUrl);
}

/**
 * Wait for a command matching a pattern to appear in the panel's console output.
 */
async function waitForConsoleCommand(panelPage: Page, pattern: string, timeoutMs: number = 10000): Promise<void> {
  await panelPage.waitForFunction(
    ([pat]) => {
      const cmds = document.querySelectorAll('[data-type="command"]');
      return [...cmds].some(el => new RegExp(pat).test(el.textContent!));
    },
    [pattern],
    { timeout: timeoutMs },
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('recorder injects and captures a click on a link', async ({ recordingPages }) => {
  const { panelPage, targetPage } = recordingPages;

  // Start recording on the target page
  const result = await startRecordingOn(panelPage, targetPage);
  expect(result.ok).toBe(true);

  // Bring target page to front and click the link
  await targetPage.bringToFront();
  await targetPage.locator('a').first().click();

  // The recorder should capture the click and send it to the panel
  await panelPage.bringToFront();
  await waitForConsoleCommand(panelPage, 'click');

  // Verify it also appeared in the editor
  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).toContain('click');

  await stopRecordingOn(panelPage, targetPage);
});

test('recorder appends --nth for ambiguous locators', async ({ recordingPages }) => {
  const { panelPage, targetPage } = recordingPages;

  // Navigate to a page with multiple duplicate tab buttons (npm/yarn tabs)
  await targetPage.goto('https://playwright.dev/docs/intro');
  await targetPage.waitForLoadState('domcontentloaded');

  const result = await startRecordingOn(panelPage, targetPage);
  expect(result.ok).toBe(true);

  // Click the second "npm" tab — multiple tab buttons share the same "npm" text.
  // The recorder's nthSuffix only counts interactive elements (role=tab, button, a, etc.)
  // so non-clickable "npm" text in code blocks is ignored.
  await targetPage.bringToFront();
  const npmTabs = targetPage.locator('role=tab', { hasText: /^npm$/ });
  const count = await npmTabs.count();
  expect(count).toBeGreaterThan(1);  // confirm duplicates exist
  await npmTabs.nth(1).click();

  await panelPage.bringToFront();
  await waitForConsoleCommand(panelPage, 'click.*--nth 1');

  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).toContain('--nth 1');
  await stopRecordingOn(panelPage, targetPage);
});

test('recorder ignores clicks on non-interactive elements', async ({ recordingPages }) => {
  const { panelPage, targetPage } = recordingPages;

  await targetPage.goto('https://playwright.dev/docs/intro');
  await targetPage.waitForLoadState('domcontentloaded');

  const result = await startRecordingOn(panelPage, targetPage);
  expect(result.ok).toBe(true);

  // Click a heading — non-interactive, recorder should ignore it
  await targetPage.bringToFront();
  await targetPage.locator('h1').first().click();

  // Wait and verify no command was recorded
  await panelPage.bringToFront();
  await panelPage.waitForTimeout(2000);
  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).not.toContain('click');

  await stopRecordingOn(panelPage, targetPage);
});

test('recorder captures input/fill events', async ({ recordingPages }) => {
  const { panelPage, targetPage } = recordingPages;

  // Navigate to a page with an input field
  await targetPage.goto('https://demo.playwright.dev/todomvc/');
  await targetPage.waitForLoadState('domcontentloaded');

  const result = await startRecordingOn(panelPage, targetPage);
  expect(result.ok).toBe(true);

  // Type into the input field — recorder debounces fill after 1500ms
  await targetPage.bringToFront();
  const input = targetPage.locator('.new-todo');
  await input.fill('Buy groceries');

  // Wait for the debounced fill to flush (1500ms debounce + buffer)
  await targetPage.waitForTimeout(2500);

  await panelPage.bringToFront();
  await waitForConsoleCommand(panelPage, 'fill.*Buy groceries');

  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).toContain('fill');
  expect(editorValue).toContain('Buy groceries');

  await stopRecordingOn(panelPage, targetPage);
});

test('recorder captures keyboard press events', async ({ recordingPages }) => {
  const { panelPage, targetPage } = recordingPages;

  // Navigate to a page with an input
  await targetPage.goto('https://demo.playwright.dev/todomvc/');
  await targetPage.waitForLoadState('domcontentloaded');

  const result = await startRecordingOn(panelPage, targetPage);
  expect(result.ok).toBe(true);

  // Type and press Enter
  await targetPage.bringToFront();
  const input = targetPage.locator('.new-todo');
  await input.fill('Test item');
  await input.press('Enter');

  await panelPage.bringToFront();
  await waitForConsoleCommand(panelPage, 'press Enter');

  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).toContain('press Enter');

  await stopRecordingOn(panelPage, targetPage);
});

test('stop recording cleans up — no more commands captured', async ({ recordingPages }) => {
  const { panelPage, targetPage } = recordingPages;

  const result = await startRecordingOn(panelPage, targetPage);
  expect(result.ok).toBe(true);

  // Click while recording — should be captured
  await targetPage.bringToFront();
  await targetPage.locator('a').first().click();
  await panelPage.bringToFront();
  await waitForConsoleCommand(panelPage, 'click');

  // Stop recording
  await stopRecordingOn(panelPage, targetPage);

  // Clear editor to check for new commands
  await panelPage.evaluate(() => {
    (document.getElementById('editor') as HTMLTextAreaElement).value = '';
  });

  // Navigate back and click again — should NOT be captured
  await targetPage.bringToFront();
  await targetPage.goBack();
  await targetPage.waitForLoadState('domcontentloaded');
  await targetPage.locator('a').first().click();

  // Wait a bit and verify no new commands appeared in editor
  await panelPage.bringToFront();
  await panelPage.waitForTimeout(2000);
  const editorValue = await panelPage.locator('#editor').inputValue();
  expect(editorValue).toBe('');
});

test('recorder re-injects after page navigation', async ({ recordingPages }) => {
  const { panelPage, targetPage } = recordingPages;

  const result = await startRecordingOn(panelPage, targetPage);
  expect(result.ok).toBe(true);

  // Click a link that navigates to a new page
  await targetPage.bringToFront();
  await targetPage.locator('a').first().click();
  await targetPage.waitForLoadState('domcontentloaded');

  // Wait for re-injection (tabs.onUpdated fires on 'complete')
  await targetPage.waitForTimeout(1000);

  // Clear the editor to isolate new commands
  await panelPage.bringToFront();
  await panelPage.evaluate(() => {
    (document.getElementById('editor') as HTMLTextAreaElement).value = '';
  });

  // Now interact with the new page — recorder should still work
  await targetPage.bringToFront();

  // Press Tab on the new page to trigger a keyboard event
  await targetPage.keyboard.press('Tab');

  await panelPage.bringToFront();
  await waitForConsoleCommand(panelPage, 'press Tab');

  await stopRecordingOn(panelPage, targetPage);
});
