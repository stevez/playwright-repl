/**
 * Command integration tests — exercises the full stack:
 * real extension + playwright-crx via chrome.runtime.sendMessage.
 *
 * Commands are sent directly to the background service worker via sendCommand().
 * run-code tests use sendViaUI() since that command routes through the sandbox iframe.
 */

import { test, expect, sendCommand, sendViaUI } from './fixtures.js';
import type { Page } from '@playwright/test';

// ─── Helpers ─────────���──────────────────────────────���────────────────────────

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
  test('goto navigates to a URL', async ({ panelPage, testServer }) => {
    const result = await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('127.0.0.1');
  });

  test('go-back navigates to previous page', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, `goto ${testServer.baseUrl}/page2.html`);
    const result = await sendCommand(panelPage, 'go-back');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain(testServer.baseUrl);
  });

  test('go-forward navigates to next page', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, `goto ${testServer.baseUrl}/page2.html`);
    await sendCommand(panelPage, 'go-back');
    const result = await sendCommand(panelPage, 'go-forward');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('page2.html');
  });
});

// ─── Snapshot ────���───────────────────────────────────────────────────────────

test.describe('Snapshot', () => {
  test('snapshot returns accessibility tree with refs', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'snapshot');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('todos');
    expect(result.text).toMatch(/\[ref=e\d+\]/);
  });

});

// ─── Click ───────────────────────────────────���───────────────────────────────

test.describe('Click', () => {
  test('click an element by ref', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const snap = await sendCommand(panelPage, 'snapshot');
    const ref = findRef(snap.text, 'todos');
    const result = await sendCommand(panelPage, `click ${ref}`);
    expect(result.isError).toBeFalsy();
  });

  test('click by text', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'click "Get started"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Fill ────────────────────────────────────────────────────────────────────

test.describe('Fill', () => {
  test('fill an input field by text', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'fill "What needs to be done" "Buy groceries"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Press ──────���────────────────────────────────────────────────────────────

test.describe('Press', () => {
  test('press a keyboard key', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'press Tab');
    expect(result.isError).toBeFalsy();
  });

  test('press Enter submits a todo', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'fill "What needs to be done" "Buy groceries"');
    const result = await sendCommand(panelPage, 'press Enter');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Eval ────────────────────���───────────────────────────────────────────────

test.describe('Eval', () => {
  test('eval executes JavaScript', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'eval document.title');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('TodoMVC');
  });

});

// ─── Screenshot ──────────────────────────────────────────────────────────────

test.describe('Screenshot', () => {
  test('screenshot captures the page', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'screenshot');
    expect(result.isError).toBeFalsy();
    expect(result.image).toMatch(/^data:image\/(jpeg|png);base64,/);
  });
});

// ─── Check / Uncheck ─────────────────────────────────────────────────────────

test.describe('Check / Uncheck', () => {
  test('check a todo item', async ({ panelPage, testServer }) => {
    await gotoFresh(panelPage, testServer.baseUrl);
    await sendCommand(panelPage, 'fill "What needs to be done" "Buy groceries"');
    await sendCommand(panelPage, 'press Enter');
    const result = await sendCommand(panelPage, 'check "Buy groceries"');
    expect(result.isError).toBeFalsy();
  });

  test('uncheck a todo item', async ({ panelPage, testServer }) => {
    await gotoFresh(panelPage, testServer.baseUrl);
    await sendCommand(panelPage, 'fill "What needs to be done" "Clean house"');
    await sendCommand(panelPage, 'press Enter');
    await sendCommand(panelPage, 'check "Clean house"');
    const result = await sendCommand(panelPage, 'uncheck "Clean house"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Hover ───────────────────────────────────────────────────────────────────

test.describe('Hover', () => {
  test('hover over an element', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'hover "todos"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Verify ──────────────────────────────────────────────────────────────────

test.describe('Verify', () => {
  test('verify-text passes when text exists', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify-text "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify-text fails when text is missing', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify-text "nonexistent text xyz"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Text not found');
  });

  test('verify-element passes when element exists', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify-element heading "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify title passes when title matches', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify title "TodoMVC"');
    expect(result.isError).toBeFalsy();
  });

  test('verify title fails when title does not match', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify title "Nonexistent Title XYZ"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('does not contain');
  });

  test('verify url passes when URL matches', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify url "127.0.0.1"');
    expect(result.isError).toBeFalsy();
  });

  test('verify url fails when URL does not match', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify url "nonexistent-path"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('does not contain');
  });

  test('verify text passes when text is visible', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify text "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify text fails when text is not visible', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify text "nonexistent text xyz"');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Text not found');
  });

  test('verify no-text passes when text is absent', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify no-text "nonexistent text xyz"');
    expect(result.isError).toBeFalsy();
  });

  test('verify element passes when element exists', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify element heading "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify no-element passes when element is absent', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify no-element button "Nonexistent XYZ"');
    expect(result.isError).toBeFalsy();
  });

});

// ─── Tab commands ─────────────────────────────────────────────────────────────

test.describe('Tab commands', () => {
  test('tab-list shows open tabs', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'tab-list');
    expect(result.isError).toBeFalsy();
    // tabList returns an array object; verify via Chrome API that the URL is present
    const tabIndex = await findTabIndexFromPanel(panelPage, '127.0.0.1');
    expect(tabIndex).not.toBeNull();
  });

  test('tab-new opens a new tab', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const tabsBefore = await countTabsFromPanel(panelPage);

    const result = await sendCommand(panelPage, 'tab-new');
    expect(result.isError).toBeFalsy();

    const tabsAfter = await countTabsFromPanel(panelPage);
    expect(tabsAfter).toBe(tabsBefore + 1);
  });

  test('tab-select switches to a tab by index', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'tab-new');

    const tabIndex = await findTabIndexFromPanel(panelPage, '127.0.0.1');
    expect(tabIndex).not.toBeNull();

    const result = await sendCommand(panelPage, `tab-select ${tabIndex}`);
    expect(result.isError).toBeFalsy();
  });

  test('tab-close closes a tab', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'tab-new');
    const tabsBefore = await countTabsFromPanel(panelPage);

    // Close the newly added tab (always appended last, index = tabsBefore - 1)
    const result = await sendCommand(panelPage, `tab-close ${tabsBefore - 1}`);
    expect(result.isError).toBeFalsy();

    const tabsAfter = await countTabsFromPanel(panelPage);
    expect(tabsAfter).toBe(tabsBefore - 1);
  });

});

// ─── Reload ─────────────────────────────────────────────────────────────────

test.describe('Reload', () => {
  test('reload refreshes the page', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'reload');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Dblclick ────────────────────────────────────────────────────────────────

test.describe('Dblclick', () => {
  test('dblclick by text', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'dblclick "Double-click me"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Type ────────────────────────────────────────────────────────────────────

test.describe('Type', () => {
  test('type sends keys one by one', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'click "What needs to be done"');
    const result = await sendCommand(panelPage, 'type "hello"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Select ──────────────────────────────────────────────────────────────────

test.describe('Select', () => {
  test('select a dropdown option', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'select "Priority" "high"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Highlight ───────────────────────────────────────────────────────────────

test.describe('Highlight', () => {
  test('highlight an element by text', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'highlight "todos"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── PDF ─────────────────────────────────────────────────────────────────────

test.describe('PDF', () => {
  test('pdf generates a PDF', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'pdf');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Resize ──────────────────────────────────────────────────────────────────

test.describe('Resize', () => {
  test('resize sets viewport dimensions', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'resize 800 600');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Verify (additional) ─────────────────────────────────────────────────────

test.describe('Verify (additional)', () => {
  test('verify-visible passes for visible element', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify-visible heading "todos"');
    expect(result.isError).toBeFalsy();
  });

  test('verify-value by label passes for matching value', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify-value "Username" "admin"');
    expect(result.isError).toBeFalsy();
  });

  test('verify-value by label fails for wrong value', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'verify-value "Username" "wrong"');
    expect(result.isError).toBe(true);
  });

  test('wait-for-text passes when text already visible', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'wait-for-text "todos"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Cookie commands ─────────────────────────────────────────────────────────

test.describe('Cookies', () => {
  test('cookie-set and cookie-get', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const setResult = await sendCommand(panelPage, 'cookie-set testcookie myvalue');
    expect(setResult.isError).toBeFalsy();

    const getResult = await sendCommand(panelPage, 'cookie-get testcookie');
    expect(getResult.isError).toBeFalsy();
    expect(getResult.text).toContain('myvalue');
  });

  test('cookie-list shows cookies', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'cookie-set listcookie val1');
    const result = await sendCommand(panelPage, 'cookie-list');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('listcookie');
  });

  // cookie-delete / cookie-clear use page.context().clearCookies() which triggers
  // "Protocol error (Storage.clearCookies): Either tab id or extension id must be specified."
  // in playwright-crx. Needs fix in page-scripts to pass tab context to CDP.
  test.fixme('cookie-delete removes a cookie', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'cookie-set delcookie val');
    const result = await sendCommand(panelPage, 'cookie-delete delcookie');
    expect(result.isError).toBeFalsy();
  });

  test.fixme('cookie-clear removes all cookies', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'cookie-set c1 v1');
    const result = await sendCommand(panelPage, 'cookie-clear');
    expect(result.isError).toBeFalsy();
  });
});

// ─── LocalStorage commands ───────────────────────────────────────────────────

test.describe('LocalStorage', () => {
  test('localstorage-set and localstorage-get', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const setResult = await sendCommand(panelPage, 'localstorage-set mykey myval');
    expect(setResult.isError).toBeFalsy();

    const getResult = await sendCommand(panelPage, 'localstorage-get mykey');
    expect(getResult.isError).toBeFalsy();
    expect(getResult.text).toContain('myval');
  });

  test('localstorage-list shows items', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'localstorage-set lskey lsval');
    const result = await sendCommand(panelPage, 'localstorage-list');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('lskey');
  });

  test('localstorage-delete removes a key', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'localstorage-set delkey delval');
    const result = await sendCommand(panelPage, 'localstorage-delete delkey');
    expect(result.isError).toBeFalsy();
  });

  test('localstorage-clear removes all items', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'localstorage-set k1 v1');
    const result = await sendCommand(panelPage, 'localstorage-clear');
    expect(result.isError).toBeFalsy();
  });
});

// ─── SessionStorage commands ─────────────────────────────────────────────────

test.describe('SessionStorage', () => {
  test('sessionstorage-set and sessionstorage-get', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const setResult = await sendCommand(panelPage, 'sessionstorage-set sskey ssval');
    expect(setResult.isError).toBeFalsy();

    const getResult = await sendCommand(panelPage, 'sessionstorage-get sskey');
    expect(getResult.isError).toBeFalsy();
    expect(getResult.text).toContain('ssval');
  });

  test('sessionstorage-list shows items', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'sessionstorage-set sslistkey sslistval');
    const result = await sendCommand(panelPage, 'sessionstorage-list');
    expect(result.isError).toBeFalsy();
    expect(result.text).toContain('sslistkey');
  });

  test('sessionstorage-delete removes a key', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'sessionstorage-set ssdelkey ssdelval');
    const result = await sendCommand(panelPage, 'sessionstorage-delete ssdelkey');
    expect(result.isError).toBeFalsy();
  });

  test('sessionstorage-clear removes all items', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'sessionstorage-set ssk1 ssv1');
    const result = await sendCommand(panelPage, 'sessionstorage-clear');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Dialog commands ─────────────────────────────────────────────────────────

test.describe('Dialog', () => {
  test('dialog-accept accepts an alert', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    // Set up dialog handler then trigger the alert
    await sendCommand(panelPage, 'dialog-accept');
    const result = await sendCommand(panelPage, 'click "Show Alert"');
    expect(result.isError).toBeFalsy();
  });

  test('dialog-dismiss dismisses a confirm', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendCommand(panelPage, 'dialog-dismiss');
    const result = await sendCommand(panelPage, 'click "Show Confirm"');
    expect(result.isError).toBeFalsy();
  });
});

// ─── Errors ──────────────────────────────────────────────────────────────────

test.describe('Errors', () => {
  test('unknown command returns error', async ({ panelPage }) => {
    const result = await sendCommand(panelPage, 'nonexistent');
    expect(result.isError).toBe(true);
  });

  test('invalid ref returns error', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendCommand(panelPage, 'click e9999');
    expect(result.isError).toBe(true);
  });
});

// ─── run-code ────────────────────────────────────────────────────────────────
// run-code routes through the sandbox iframe inside the panel, so these tests
// drive the UI directly instead of using sendCommand.

test.describe('run-code', () => {
  test('returns page title', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}/page2.html`);
    const result = await sendViaUI(panelPage, 'run-code await page.title()');
    expect(result.isError).toBe(false);
    expect(result.text).toContain('Playwright');
  });

  test('executes chained locator calls', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await page.locator('text=Get started').click()");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('returns Done for void actions', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await page.click('h1')");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('goto does not hang', async ({ panelPage, testServer }) => {
    const result = await sendViaUI(panelPage, `run-code await page.goto('${testServer.baseUrl}')`);
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('reports errors from failed calls', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await page.locator('.nonexistent-xyz').click({ timeout: 1000 })");
    expect(result.isError).toBe(true);
  });
});

// ─── run-code: expect() ────────��──────────────────────────────────────────────

test.describe('run-code: expect()', () => {
  test('expect(page).toHaveTitle() passes', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page).toHaveTitle(/TodoMVC/)");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('expect(page).toHaveTitle() fails with assertion error', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page).toHaveTitle('WrongTitle')");
    expect(result.isError).toBe(true);
    expect(result.text).toContain('toHaveTitle');
  });

  test('expect(page).toHaveURL() passes (regex)', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page).toHaveURL(/127\\.0\\.0\\.1/)");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('expect(locator).toBeVisible() passes', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page.locator('h1')).toBeVisible()");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });

  test('expect(locator).toBeVisible() fails for missing element', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page.locator('.nonexistent-xyz')).toBeVisible({ timeout: 1000 })");
    expect(result.isError).toBe(true);
    expect(result.text).toContain('toBeVisible');
  });

  test('expect(locator).toHaveText() passes', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    const result = await sendViaUI(panelPage, "run-code await expect(page.locator('h1')).toHaveText('todos')");
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Done');
  });
});

// ─── Console.log capture ──────────────────────────────────────────────────────
// console.log/error/warn in run-code (swDebugEval context) should appear in the
// output pane via Runtime.consoleAPICalled CDP events.

test.describe('Console.log capture', () => {
  test('console.log string appears in output', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendViaUI(panelPage, 'run-code console.log("e2e-log-marker")');
    await expect(panelPage.getByTestId('output')).toContainText('e2e-log-marker');
  });

  test('console.log object shows properties', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendViaUI(panelPage, 'run-code console.log({testKey: "testVal"})');
    const output = panelPage.getByTestId('output');
    await expect(output).toContainText('testKey');
    await expect(output).toContainText('testVal');
  });

  test('console.warn appears in output', async ({ panelPage, testServer }) => {
    await sendCommand(panelPage, `goto ${testServer.baseUrl}`);
    await sendViaUI(panelPage, 'run-code console.warn("e2e-warn-marker")');
    await expect(panelPage.getByTestId('output')).toContainText('e2e-warn-marker');
  });
});
