/**
 * Command integration tests — exercises the full stack:
 * real Engine + CommandServer + Playwright browser.
 *
 * Each test sends commands via HTTP POST /run and asserts on actual results.
 */

import { test, expect } from './fixtures.js';

// ─── Test URLs ──────────────────────────────────────────────────────────────
// Use Playwright-hosted sites to avoid Cloudflare bot protection in CI.
const TEST_URL = 'https://demo.playwright.dev/todomvc/';
const SECOND_URL = 'https://playwright.dev/';

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Extract an element ref (e.g. "e5") from snapshot text by matching a label.
 * Handles formats like:
 *   - link "Learn more" [ref=e6]       → label before ref
 *   - textbox "Name" [ref=e2]          → label before ref
 *   - combobox [ref=e2]:               → type before ref (no label)
 */
function findRef(snapshotText: string, labelPattern: string): string {
  // Try: label appears before [ref=eN] on same line
  const re1 = new RegExp(`${labelPattern}.*\\[ref=(e\\d+)\\]`, 'i');
  const m1 = snapshotText.match(re1);
  if (m1) return m1[1];

  // Try: [ref=eN] appears before label on same line
  const re2 = new RegExp(`\\[ref=(e\\d+)\\].*${labelPattern}`, 'i');
  const m2 = snapshotText.match(re2);
  if (m2) return m2[1];

  throw new Error(`No ref found for "${labelPattern}" in snapshot:\n${snapshotText}`);
}

// ─── Navigation ─────────────────────────────────────────────────────────────

test('goto navigates to a URL', async ({ run }) => {
  const result = await run(`goto ${TEST_URL}`);
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain(TEST_URL);
});

test('goto with alias g', async ({ run }) => {
  const result = await run(`g ${TEST_URL}`);
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain(TEST_URL);
});

test('go-back navigates to previous page', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  await run(`goto ${SECOND_URL}`);
  const result = await run('go-back');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain(TEST_URL);
});

test('go-forward navigates to next page', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  await run(`goto ${SECOND_URL}`);
  await run('go-back');
  const result = await run('go-forward');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain(SECOND_URL);
});

// ─── Snapshot ───────────────────────────────────────────────────────────────

test('snapshot returns accessibility tree with refs', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('snapshot');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('todos');
  expect(result.text).toMatch(/\[ref=e\d+\]/);
});

test('snapshot with alias s', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('s');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('todos');
  expect(result.text).toMatch(/\[ref=e\d+\]/);
});

// ─── Click ──────────────────────────────────────────────────────────────────

test('click an element by ref', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const snap = await run('snapshot');
  const ref = findRef(snap.text, 'TodoMVC');
  const result = await run(`click ${ref}`);
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('Page URL');
});

// ─── Fill ───────────────────────────────────────────────────────────────────

test('fill an input field', async ({ run }) => {
  await run('goto https://demo.playwright.dev/todomvc/');
  const result = await run('fill "What needs to be done" "Buy groceries"');
  expect(result.isError).toBeFalsy();
});

// ─── Press ──────────────────────────────────────────────────────────────────

test('press a keyboard key', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('press Tab');
  expect(result.isError).toBeFalsy();
});

// ─── Select ─────────────────────────────────────────────────────────────────

test('select a dropdown option', async ({ run }) => {
  await run('goto https://the-internet.herokuapp.com/dropdown');
  const snap = await run('snapshot');
  const ref = findRef(snap.text, 'combobox');
  const result = await run(`select ${ref} "Option 1"`);
  expect(result.isError).toBeFalsy();
});

// ─── Eval ───────────────────────────────────────────────────────────────────

test('eval executes JavaScript', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('eval document.title');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('TodoMVC');
});

// ─── Screenshot ─────────────────────────────────────────────────────────────

test('screenshot captures the page', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('screenshot');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('.png');
  expect(result.image).toMatch(/^data:image\/png;base64,/);
});

// ─── Check / Uncheck ────────────────────────────────────────────────────────

test('check a todo item', async ({ run }) => {
  await run('goto https://demo.playwright.dev/todomvc/');
  await run('fill "What needs to be done" "Buy groceries"');
  await run('press Enter');
  const result = await run('check "Buy groceries"');
  expect(result.isError).toBeFalsy();
});

test('uncheck a todo item', async ({ run }) => {
  await run('goto https://demo.playwright.dev/todomvc/');
  await run('fill "What needs to be done" "Clean house"');
  await run('press Enter');
  await run('check "Clean house"');
  const result = await run('uncheck "Clean house"');
  expect(result.isError).toBeFalsy();
});

// ─── Hover ──────────────────────────────────────────────────────────────────

test('hover over an element', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('hover "todos"');
  expect(result.isError).toBeFalsy();
});

// ─── Run-code ───────────────────────────────────────────────────────────────

test('run-code simple expression returns result', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('run-code page.title()');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('### Result');
  expect(result.text).toContain('TodoMVC');
  expect(result.text).toContain('return await page.title()');
});

test('run-code multi-statement with semicolons', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('run-code const t = await page.title(); return t');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('### Result');
  expect(result.text).toContain('TodoMVC');
  expect(result.text).toContain('const t = await page.title(); return t');
});

test('run-code with await statement', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('run-code await page.waitForTimeout(100)');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('await page.waitForTimeout(100)');
});

test('run-code with async function passes through unchanged', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('run-code async (page) => { const t = await page.title(); return t }');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('### Result');
  expect(result.text).toContain('TodoMVC');
  expect(result.text).toContain('const t = await page.title(); return t');
});

// ─── Verify commands ────────────────────────────────────────────────────────

test('verify-text passes when text exists', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify-text "todos"');
  expect(result.isError).toBeFalsy();
});

test('verify-text fails when text is missing', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify-text "nonexistent text xyz"');
  expect(result.isError).toBe(true);
  expect(result.text).toContain('Text not found');
});

test('verify-element passes when element exists', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify-element heading "todos"');
  expect(result.isError).toBeFalsy();
});

// ─── Unified verify command ─────────────────────────────────────────────────

test('verify title passes when title matches', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify title "TodoMVC"');
  expect(result.isError).toBeFalsy();
});

test('verify title fails when title does not match', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify title "Nonexistent Title XYZ"');
  expect(result.isError).toBe(true);
  expect(result.text).toContain('does not contain');
});

test('verify url passes when URL matches', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify url "todomvc"');
  expect(result.isError).toBeFalsy();
});

test('verify url fails when URL does not match', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify url "nonexistent-path"');
  expect(result.isError).toBe(true);
  expect(result.text).toContain('does not contain');
});

test('verify text passes when text is visible', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify text "todos"');
  expect(result.isError).toBeFalsy();
});

test('verify text fails when text is not visible', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify text "nonexistent text xyz"');
  expect(result.isError).toBe(true);
  expect(result.text).toContain('Text not found');
});

test('verify no-text passes when text is absent', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify no-text "nonexistent text xyz"');
  expect(result.isError).toBeFalsy();
});

test('verify element passes when element exists', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify element heading "todos"');
  expect(result.isError).toBeFalsy();
});

test('verify no-element passes when element is absent', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('verify no-element button "Nonexistent XYZ"');
  expect(result.isError).toBeFalsy();
});

test('v alias routes to verify', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('v title "TodoMVC"');
  expect(result.isError).toBeFalsy();
});

// ─── Aliases ────────────────────────────────────────────────────────────────

test('alias c for click', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const snap = await run('s');
  const ref = findRef(snap.text, 'TodoMVC');
  const result = await run(`c ${ref}`);
  expect(result.isError).toBeFalsy();
});

// ─── Tab commands ────────────────────────────────────────────────────────────

/**
 * Count tab entries in tab-list output.
 * Format: "- N: [Title](URL)" or "- N: (current) [Title](URL)"
 */
function countTabs(tabListText: string): number {
  return tabListText.split('\n').filter(l => /^- \d+:/.test(l)).length;
}

test('tab-list shows open tabs', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('tab-list');
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('demo.playwright.dev');
  expect(result.text).toMatch(/- 0:.*\(current\)/);
});

test('tab-new opens a new tab', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const before = await run('tab-list');
  const tabsBefore = countTabs(before.text);

  const result = await run('tab-new');
  expect(result.isError).toBeFalsy();

  const after = await run('tab-list');
  const tabsAfter = countTabs(after.text);
  expect(tabsAfter).toBe(tabsBefore + 1);
  // New tab becomes current
  expect(after.text).toMatch(/- 1:.*\(current\)/);
});

test('tab-select switches to a tab by index', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  await run('tab-new');
  // New tab is current — switch back to first tab
  const result = await run('tab-select 0');
  expect(result.isError).toBeFalsy();

  // Verify first tab is now current
  const list = await run('tab-list');
  expect(list.text).toMatch(/- 0:.*\(current\).*demo\.playwright\.dev/);
});

test('tab-close closes the current tab', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  await run('tab-new');
  const before = await run('tab-list');
  const tabsBefore = countTabs(before.text);

  // Close the current tab (the new one)
  const result = await run('tab-close');
  expect(result.isError).toBeFalsy();

  const after = await run('tab-list');
  const tabsAfter = countTabs(after.text);
  expect(tabsAfter).toBe(tabsBefore - 1);
});

test('tab-new then goto navigates in the new tab', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  await run('tab-new');
  await run(`goto ${SECOND_URL}`);

  const list = await run('tab-list');
  expect(list.text).toContain('demo.playwright.dev');
  expect(list.text).toContain('playwright.dev');
});

test('tab aliases tl, tn, tc, ts work', async ({ run }) => {
  await run(`goto ${TEST_URL}`);

  const list = await run('tl');
  expect(list.isError).toBeFalsy();
  expect(list.text).toContain('demo.playwright.dev');

  const newTab = await run('tn');
  expect(newTab.isError).toBeFalsy();

  const select = await run('ts 0');
  expect(select.isError).toBeFalsy();

  const close = await run('ts 1');
  expect(close.isError).toBeFalsy();
  await run('tc');
});

// ─── Errors ─────────────────────────────────────────────────────────────────

test('unknown command returns error', async ({ run }) => {
  const result = await run('nonexistent');
  expect(result.isError).toBe(true);
  expect(result.text).toContain('Unknown command');
});

test('invalid ref returns error', async ({ run }) => {
  await run(`goto ${TEST_URL}`);
  const result = await run('click e9999');
  expect(result.isError).toBe(true);
});
