/**
 * Command integration tests — exercises the full stack:
 * real extension + playwright-crx via chrome.runtime.sendMessage.
 *
 * Commands are sent directly to the background service worker via sendCommand().
 * run-code tests use sendViaUI() since that command routes through the sandbox iframe.
 */

import { test, expect, sendCommand, sendViaUI } from './fixtures.js';
import type { Page } from '@playwright/test';

const TEST_URL = 'https://demo.playwright.dev/todomvc/';
const SECOND_URL = 'https://playwright.dev/';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Navigate to a URL and clear storage so previous test runs don't leave stale
 * state (e.g. TodoMVC persists todos in localStorage).
 */
async function gotoFresh(panelPage: Parameters<typeof sendCommand>[0], url: string) {
  await sendCommand(panelPage, `goto ${url}`);
  await sendCommand(panelPage, 'eval localStorage.clear()');
  await sendCommand(panelPage, 'eval sessionStorage.clear()');
  await sendCommand(panelPage, `goto ${url}`);
}

/**
 * Extract an element ref (e.g. "e5") from snapshot text by matching a label.
 */
function findRef(snapshotText: string, labelPattern: string): string {
  const re1 = new RegExp(`${labelPattern}.*\\[ref=(e\\d+)\\]`, 'i');
  const m1 = snapshotText.match(re1);
  if (m1) return m1[1];

  const re2 = new RegExp(`\\[ref=(e\\d+)\\].*${labelPattern}`, 'i');
  const m2 = snapshotText.match(re2);
  if (m2) return m2[1];

  throw new Error(`No ref found for "${labelPattern}" in snapshot:\n${snapshotText}`);
}

/**
 * Count tabs visible to the extension (same scope as tabList — attached tab's window).
 * Queries via chrome.tabs API from the panel context.
 */
async function countTabsFromPanel(panelPage: Page): Promise<number> {
  return panelPage.evaluate(() =>
    new Promise<number>(resolve => chrome.tabs.query({}, tabs => resolve(tabs.length)))
  );
}

/**
 * Find the chrome.tabs index of a tab whose URL contains the given substring.
 * Uses the same chrome.tabs.query scope as tabList.
 */
async function findTabIndexFromPanel(panelPage: Page, urlSubstring: string): Promise<number | null> {
  return panelPage.evaluate(sub =>
    new Promise<number | null>(resolve =>
      chrome.tabs.query({}, tabs => {
        const idx = tabs.findIndex(t => (t.url ?? '').includes(sub));
        resolve(idx >= 0 ? idx : null);
      })
    ),
    urlSubstring
  );
}

// ─── Navigation ─────────────────────────────────────────────────────────────

test.describe('Navigation', () => {
  test('goto navigates to a URL', async ({ testPage: _, panelPage }) => {
    const result = await sendCommand(panelPage, `goto ${TEST_URL}`);
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain(TEST_URL);
  });

  test('go-back navigates to previous page', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendCommand(panelPage, `goto ${SECOND_URL}`);
    const result = await sendCommand(panelPage, 'go-back');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain(TEST_URL);
  });

  test('go-forward navigates to next page', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendCommand(panelPage, `goto ${SECOND_URL}`);
    await sendCommand(panelPage, 'go-back');
    const result = await sendCommand(panelPage, 'go-forward');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain(SECOND_URL);
  });
});

// ─── Snapshot ────────────────────────────────────────────────────────────────

test.describe('Snapshot', () => {
  test('snapshot returns accessibility tree with refs', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'snapshot');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('todos');
    expect(result.text).toMatch(/\[ref=e\d+\]/);
  });

});

// ─── Click ───────────────────────────────────────────────────────────────────

test.describe('Click', () => {
  test('click an element by ref', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const snap = await sendCommand(panelPage, 'snapshot');
    const ref = findRef(snap.text, 'TodoMVC');
    const result = await sendCommand(panelPage, `click ${ref}`);
    expect(result.isError).toBeFalsy();
  });

  test('click by text', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${SECOND_URL}`);
    const result = await sendCommand(panelPage, 'click "Get started"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Fill ────────────────────────────────────────────────────────────────────

test.describe('Fill', () => {
  test('fill an input field by text', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'fill "What needs to be done" "Buy groceries"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Press ───────────────────────────────────────────────────────────────────

test.describe('Press', () => {
  test('press a keyboard key', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'press Tab');
    expect(result.isError).toBeFalsy();
  });

  test('press Enter submits a todo', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendCommand(panelPage, 'fill "What needs to be done" "Buy groceries"');
    const result = await sendCommand(panelPage, 'press Enter');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Eval ────────────────────────────────────────────────────────────────────

test.describe('Eval', () => {
  test('eval executes JavaScript', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'eval document.title');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('TodoMVC');
  });

});

// ─── Screenshot ──────────────────────────────────────────────────────────────

test.describe('Screenshot', () => {
  test('screenshot captures the page', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'screenshot');
    expect(result.isError).toBeFalsy();
    expect(result.image).toMatch(/^data:image\/(jpeg|png);base64,/);
  });
});

// ─── Check / Uncheck ─────────────────────────────────────────────────────────

test.describe('Check / Uncheck', () => {
  test('check a todo item', async ({ testPage: _, panelPage }) => {
    await gotoFresh(panelPage, TEST_URL);
    await sendCommand(panelPage, 'fill "What needs to be done" "Buy groceries"');
    await sendCommand(panelPage, 'press Enter');
    const result = await sendCommand(panelPage, 'check "Buy groceries"');
    expect(result.isError).toBeFalsy();
  });

  test('uncheck a todo item', async ({ testPage: _, panelPage }) => {
    await gotoFresh(panelPage, TEST_URL);
    await sendCommand(panelPage, 'fill "What needs to be done" "Clean house"');
    await sendCommand(panelPage, 'press Enter');
    await sendCommand(panelPage, 'check "Clean house"');
    const result = await sendCommand(panelPage, 'uncheck "Clean house"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Hover ───────────────────────────────────────────────────────────────────

test.describe('Hover', () => {
  test('hover over an element', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'hover "todos"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Verify ──────────────────────────────────────────────────────────────────

test.describe('Verify', () => {
  test('verify-text passes when text exists', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify-text "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify-text fails when text is missing', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify-text "nonexistent text xyz"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Text not found');
  });

  test('verify-element passes when element exists', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify-element heading "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify title passes when title matches', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify title "TodoMVC"');
    expect(result.isError).toBeFalsy();
  });

  test('verify title fails when title does not match', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify title "Nonexistent Title XYZ"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('does not contain');
  });

  test('verify url passes when URL matches', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify url "todomvc"');
    expect(result.isError).toBeFalsy();
  });

  test('verify url fails when URL does not match', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify url "nonexistent-path"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('does not contain');
  });

  test('verify text passes when text is visible', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify text "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify text fails when text is not visible', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify text "nonexistent text xyz"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Text not found');
  });

  test('verify no-text passes when text is absent', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify no-text "nonexistent text xyz"');
    expect(result.isError).toBeFalsy();
  });

  test('verify element passes when element exists', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify element heading "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify no-element passes when element is absent', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'verify no-element button "Nonexistent XYZ"');
    expect(result.isError).toBeFalsy();
  });

});

// ─── Tab commands ─────────────────────────────────────────────────────────────

test.describe('Tab commands', () => {
  test('tab-list shows open tabs', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'tab-list');
    expect(result.isError).toBeFalsy();
    // tabList returns an array object; verify via Chrome API that the URL is present
    const tabIndex = await findTabIndexFromPanel(panelPage, 'demo.playwright.dev');
    expect(tabIndex).not.toBeNull();
  });

  test('tab-new opens a new tab', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const tabsBefore = await countTabsFromPanel(panelPage);

    const result = await sendCommand(panelPage, 'tab-new');
    expect(result.isError).toBeFalsy();

    const tabsAfter = await countTabsFromPanel(panelPage);
    expect(tabsAfter).toBe(tabsBefore + 1);
  });

  test('tab-select switches to a tab by index', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendCommand(panelPage, 'tab-new');

    const tabIndex = await findTabIndexFromPanel(panelPage, 'demo.playwright.dev');
    expect(tabIndex).not.toBeNull();

    const result = await sendCommand(panelPage, `tab-select ${tabIndex}`);
    expect(result.isError).toBeFalsy();
  });

  test('tab-close closes a tab', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendCommand(panelPage, 'tab-new');
    const tabsBefore = await countTabsFromPanel(panelPage);

    // Close the newly added tab (always appended last, index = tabsBefore - 1)
    const result = await sendCommand(panelPage, `tab-close ${tabsBefore - 1}`);
    expect(result.isError).toBeFalsy();

    const tabsAfter = await countTabsFromPanel(panelPage);
    expect(tabsAfter).toBe(tabsBefore - 1);
  });

});

// ─── Errors ──────────────────────────────────────────────────────────────────

test.describe('Errors', () => {
  test('unknown command returns error', async ({ panelPage }) => {
    const result = await sendCommand(panelPage, 'nonexistent');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Unknown command');
  });

  test('invalid ref returns error', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendCommand(panelPage, 'click e9999');
    expect(result.isError).toBe(true);
  });
});

// ─── run-code ────────────────────────────────────────────────────────────────
// run-code routes through the sandbox iframe inside the panel, so these tests
// drive the UI directly instead of using sendCommand.

test.describe('run-code', () => {
  test('returns page title', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${SECOND_URL}`);
    const result = await sendViaUI(panelPage, 'run-code await page.title()');
    expect(result.isError).toBe(false);
    expect(result.text).toContain('Playwright');
  });

  test('executes chained locator calls', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${SECOND_URL}`);
    const result = await sendViaUI(panelPage, "run-code await page.locator('text=Get started').click()");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('returns Done for void actions', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await page.click('.header')");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('goto does not hang', async ({ testPage: _, panelPage }) => {
    const result = await sendViaUI(panelPage, `run-code await page.goto('${TEST_URL}')`);
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('reports errors from failed calls', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await page.locator('.nonexistent-xyz').click({ timeout: 1000 })");
    expect(result.isError).toBe(true);
  });
});

// ─── run-code: expect() ───────────────────────────────────────────────────────

test.describe('run-code: expect()', () => {
  test('expect(page).toHaveTitle() passes', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page).toHaveTitle('React • TodoMVC')");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('expect(page).toHaveTitle() fails with assertion error', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page).toHaveTitle('WrongTitle')");
    expect(result.isError).toBe(true);
    expect(result.text).toContain('toHaveTitle');
  });

  test('expect(page).toHaveURL() passes (regex)', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page).toHaveURL(/todomvc/)");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('expect(locator).toBeVisible() passes', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page.locator('h1')).toBeVisible()");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('expect(locator).toBeVisible() fails for missing element', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page.locator('.nonexistent-xyz')).toBeVisible({ timeout: 1000 })");
    expect(result.isError).toBe(true);
    expect(result.text).toContain('toBeVisible');
  });

  test('expect(locator).toHaveText() passes', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page.locator('h1')).toHaveText('todos')");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });
});

// ─── Console.log capture ──────────────────────────────────────────────────────
// console.log/error/warn in run-code (swDebugEval context) should appear in the
// output pane via Runtime.consoleAPICalled CDP events.

test.describe('Console.log capture', () => {
  test('console.log string appears in output', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendViaUI(panelPage, 'run-code console.log("e2e-log-marker")');
    await expect(panelPage.getByTestId('output')).toContainText('e2e-log-marker');
  });

  test('console.log object shows properties', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendViaUI(panelPage, 'run-code console.log({testKey: "testVal"})');
    const output = panelPage.getByTestId('output');
    await expect(output).toContainText('testKey');
    await expect(output).toContainText('testVal');
  });

  test('console.warn appears in output', async ({ testPage: _, panelPage }) => {
    await sendCommand(panelPage, `goto ${TEST_URL}`);
    await sendViaUI(panelPage, 'run-code console.warn("e2e-warn-marker")');
    await expect(panelPage.getByTestId('output')).toContainText('e2e-warn-marker');
  });
});
