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

/**
 * Like buildRunCode, but scopes the page to an ancestor containing both
 * inText and targetText. Mirrors callScoped() in the extension.
 */
export function buildRunCodeScoped(fn, inText, targetText, ...args) {
  const filtered = args.filter(a => a !== undefined);
  const serialized = filtered.map(a => JSON.stringify(a)).join(', ');
  const inSer = JSON.stringify(inText);
  const tgtSer = JSON.stringify(targetText);
  return { _: ['run-code', `async (page) => {
  let __scope = page;
  for (const __r of ['region','group','article','listitem','dialog','form']) {
    const __c = page.getByRole(__r).filter({ hasText: ${inSer} });
    if (await __c.getByText(${tgtSer}, { exact: true }).count() > 0) { __scope = __c; break; }
  }
  if (__scope === page) {
    try {
      let __anchor = page.getByText(${inSer}, { exact: true });
      if (await __anchor.count() === 0) __anchor = page.getByText(${inSer});
      const __sel = await __anchor.first().evaluate((el, tgt) => {
        let a = el.parentElement;
        while (a && a !== document.body) {
          if (a.textContent.includes(tgt)) {
            const id = '__pw_in_' + Math.random().toString(36).slice(2);
            a.setAttribute('data-pw-in', id);
            return '[data-pw-in="' + id + '"]';
          }
          a = a.parentElement;
        }
        return null;
      }, ${tgtSer});
      if (__sel) __scope = page.locator(__sel);
    } catch {}
  }
  try {
    return await (${fn.toString()})(__scope, ${serialized});
  } finally {
    await page.evaluate(() => document.querySelectorAll('[data-pw-in]').forEach(el => el.removeAttribute('data-pw-in'))).catch(() => {});
  }
}`] };
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

export async function verifyTitle(page, text) {
  const title = await page.title();
  if (!title.includes(text))
    throw new Error('Title "' + title + '" does not contain "' + text + '"');
}

export async function verifyUrl(page, text) {
  const url = page.url();
  if (!url.includes(text))
    throw new Error('URL "' + url + '" does not contain "' + text + '"');
}

export async function waitForText(page, text) {
  await page.getByText(text).first().waitFor({ state: 'visible', timeout: 10000 });
}

export async function verifyNoText(page, text) {
  if (await page.getByText(text).filter({ visible: true }).count() > 0)
    throw new Error('Text still visible: ' + text);
}

export async function verifyNoElement(page, role, name) {
  if (await page.getByRole(role, { name }).count() > 0)
    throw new Error('Element still exists: ' + role + ' "' + name + '"');
}

export async function verifyVisible(page, role, name) {
  if (!(await page.getByRole(role, { name }).isVisible()))
    throw new Error('Element not visible: ' + role + ' "' + name + '"');
}

export async function verifyCssVisible(page, selector) {
  if (!(await page.locator(selector).isVisible()))
    throw new Error('Element not visible: css "' + selector + '"');
}

export async function verifyCssElement(page, selector) {
  if (await page.locator(selector).count() === 0)
    throw new Error('Element not found: css "' + selector + '"');
}

export async function verifyCssNoElement(page, selector) {
  if (await page.locator(selector).count() > 0)
    throw new Error('Element still exists: css "' + selector + '"');
}

export async function verifyCssValue(page, selector, expected) {
  const v = await page.locator(selector).inputValue();
  if (v !== expected)
    throw new Error('Expected "' + expected + '", got "' + v + '"');
}

export async function verifyInputValue(page, label, expected) {
  let loc = page.getByLabel(label);
  if (await loc.count() === 0) loc = page.getByRole('spinbutton', { name: label });
  if (await loc.count() === 0) loc = page.getByRole('textbox', { name: label });
  if (await loc.count() === 0) loc = page.getByRole('combobox', { name: label });
  if (await loc.count() === 0)
    throw new Error('Element not found for label: ' + label);
  const el = loc.first();
  const inputType = await el.evaluate(e => e instanceof HTMLInputElement ? e.type : '');
  if (inputType === 'checkbox') {
    const isChecked = await el.isChecked();
    const expectChecked = ['checked', 'true', 'yes', '1'].includes(expected.toLowerCase());
    if (isChecked !== expectChecked)
      throw new Error('Expected "' + label + '" to be ' + expected + ', but was ' + (isChecked ? 'checked' : 'unchecked'));
    return;
  }
  const value = await el.inputValue();
  if (String(value) !== String(expected))
    throw new Error('Expected "' + expected + '", got "' + value + '" for "' + label + '"');
}

// ─── Text locator actions ───────────────────────────────────────────────────

export async function actionByText(page, text, action, nth, exact?) {
  let loc = page.getByText(text, { exact: true });
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByRole('button', { name: text });
    if (await loc.count() === 0) loc = page.getByRole('link', { name: text });
    if (await loc.count() === 0) loc = page.getByRole('textbox', { name: text });
    if (await loc.count() === 0) loc = page.getByRole('combobox', { name: text });
    if (await loc.count() === 0) loc = page.getByPlaceholder(text);
    if (await loc.count() === 0) loc = page.getByText(text);
  }
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc[action]();
}

export async function fillByText(page, text, value, nth, exact?) {
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByPlaceholder(text);
    if (await loc.count() === 0) loc = page.getByRole('textbox', { name: text });
  }
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.fill(value);
}

export async function selectByText(page, text, value, nth, exact?) {
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByRole('combobox', { name: text });
  }
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.selectOption(value);
}

export async function checkByText(page, text, nth, exact?) {
  if (!exact) {
    const item = page.getByRole('listitem').filter({ hasText: text });
    if (await item.count() > 0) {
      const target = nth !== undefined ? item.filter({ visible: true }).nth(nth) : item;
      await target.getByRole('checkbox').check();
      return;
    }
  }
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByRole('checkbox', { name: text });
  }
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.check();
}

export async function uncheckByText(page, text, nth, exact?) {
  if (!exact) {
    const item = page.getByRole('listitem').filter({ hasText: text });
    if (await item.count() > 0) {
      const target = nth !== undefined ? item.filter({ visible: true }).nth(nth) : item;
      await target.getByRole('checkbox').uncheck();
      return;
    }
  }
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByRole('checkbox', { name: text });
  }
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.uncheck();
}

// ─── Role-based actions ─────────────────────────────────────────────────────

export async function actionByRole(page, role, name, action, nth, inRole, inText) {
  let loc = page.getByRole(role, { name, exact: true });
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, { name, exact: true });
  }
  if (nth !== undefined) loc = loc.nth(nth);
  await loc[action]();
}

export async function fillByRole(page, role, name, value, nth, inRole, inText) {
  let loc = page.getByRole(role, { name, exact: true });
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, { name, exact: true });
  }
  if (nth !== undefined) loc = loc.nth(nth);
  await loc.fill(value);
}

export async function selectByRole(page, role, name, value, nth, inRole, inText) {
  let loc = page.getByRole(role, { name, exact: true });
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, { name, exact: true });
  }
  if (nth !== undefined) loc = loc.nth(nth);
  await loc.selectOption(value);
}

export async function pressKeyByRole(page, role, name, key, nth, inRole, inText) {
  let loc = page.getByRole(role, { name, exact: true });
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, { name, exact: true });
  }
  if (nth !== undefined) loc = loc.nth(nth);
  await loc.press(key);
}
