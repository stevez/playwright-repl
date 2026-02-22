// @ts-nocheck — This file is intentionally untyped JavaScript.
// Functions here are stringified via fn.toString() and sent to Playwright's
// browser_run_code tool. Type annotations would appear in the stringified output.

/**
 * Page-context functions for run-code commands.
 *
 * Each function is a real, testable async function that takes (page, ...args).
 * buildRunCode() converts them to code strings via Function.toString(),
 * following the same pattern as playwright-repl-extension/lib/page-scripts.js.
 *
 * IMPORTANT: This file must remain plain JavaScript — NOT TypeScript.
 * These functions are stringified via fn.toString() and sent to Playwright's
 * browser_run_code tool for evaluation. TypeScript annotations would break
 * the stringified output.
 */

// ─── Helper ─────────────────────────────────────────────────────────────────

/**
 * Wraps a function into a run-code args object.
 * Uses fn.toString() + JSON.stringify() — no manual escaping needed.
 *
 * The daemon's browser_run_code calls: `await (code)(page)`
 * So `code` must be a function expression, not an IIFE.
 */
export function buildRunCode(fn, ...args) {
  const filtered = args.filter(a => a !== undefined);
  const serialized = filtered.map(a => JSON.stringify(a)).join(', ');
  return { _: ['run-code', `async (page) => (${fn.toString()})(page, ${serialized})`] };
}

// ─── Verify functions ───────────────────────────────────────────────────────

export async function verifyText(page, text) {
  if (await page.getByText(text).filter({ visible: true }).count() === 0)
    throw new Error('Text not found: ' + text);
}

export async function verifyElement(page, role, name) {
  if (await page.getByRole(role, { name }).count() === 0)
    throw new Error('Element not found: ' + role + ' "' + name + '"');
}

export async function verifyValue(page, ref, expected) {
  const el = page.locator('[aria-ref="' + ref + '"]');
  const v = await el.inputValue();
  if (v !== expected)
    throw new Error('Expected "' + expected + '", got "' + v + '"');
}

export async function verifyList(page, ref, items) {
  const loc = page.locator('[aria-ref="' + ref + '"]');
  for (const item of items) {
    if (await loc.getByText(item).count() === 0)
      throw new Error('Item not found: ' + item);
  }
}

// ─── Text locator actions ───────────────────────────────────────────────────

export async function actionByText(page, text, action, nth) {
  let loc = page.getByText(text, { exact: true });
  if (await loc.count() === 0) loc = page.getByRole('button', { name: text });
  if (await loc.count() === 0) loc = page.getByRole('link', { name: text });
  if (await loc.count() === 0) loc = page.getByText(text);
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc[action]();
}

export async function fillByText(page, text, value, nth) {
  let loc = page.getByLabel(text);
  if (await loc.count() === 0) loc = page.getByPlaceholder(text);
  if (await loc.count() === 0) loc = page.getByRole('textbox', { name: text });
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.fill(value);
}

export async function selectByText(page, text, value, nth) {
  let loc = page.getByLabel(text);
  if (await loc.count() === 0) loc = page.getByRole('combobox', { name: text });
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.selectOption(value);
}

export async function checkByText(page, text, nth) {
  const item = page.getByRole('listitem').filter({ hasText: text });
  if (await item.count() > 0) {
    const target = nth !== undefined ? item.filter({ visible: true }).nth(nth) : item;
    await target.getByRole('checkbox').check();
    return;
  }
  let loc = page.getByLabel(text);
  if (await loc.count() === 0) loc = page.getByRole('checkbox', { name: text });
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.check();
}

export async function uncheckByText(page, text, nth) {
  const item = page.getByRole('listitem').filter({ hasText: text });
  if (await item.count() > 0) {
    const target = nth !== undefined ? item.filter({ visible: true }).nth(nth) : item;
    await target.getByRole('checkbox').uncheck();
    return;
  }
  let loc = page.getByLabel(text);
  if (await loc.count() === 0) loc = page.getByRole('checkbox', { name: text });
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.uncheck();
}
