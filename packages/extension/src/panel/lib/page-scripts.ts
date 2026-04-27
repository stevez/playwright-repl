// @ts-nocheck — This file is intentionally untyped JavaScript.
// Functions here are called directly with the Playwright page object.
// Type annotations are omitted so this file can also be used in
// plain-JS contexts without a TypeScript build step.

/**
 * Page-context functions for direct execution.
 *
 * Each function is a real, testable async function that takes (page, ...args).
 * background.ts calls them directly with the page object from crxApp.
 */

// ─── Verify functions ───────────────────────────────────────────────────────

export async function verifyText(page, text) {
  if (await page.getByText(text).filter({ visible: true }).count() === 0)
    throw new Error('Text not found: ' + text);
}

export async function verifyElement(page, role, name) {
  // Link with URL: match by href instead of accessible name
  const isUrl = role === 'link' && name && /^\/|^https?:\/\//.test(name);
  const loc = isUrl ? page.locator('a[href^="' + name + '"]:not([aria-hidden="true"])') : page.getByRole(role, { name });
  if (await loc.count() === 0)
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

  if (await loc.count() > 0) {
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
    return;
  }

  // Radio group: find a role=group labeled <label>, then check which radio is selected
  const group = page.getByRole('group', { name: label });
  if (await group.count() > 0) {
    const checkedRadio = group.locator('input[type=radio]:checked');
    if (await checkedRadio.count() === 0)
      throw new Error('No radio button selected in group "' + label + '"');
    const value = await checkedRadio.evaluate(e => {
      const lbl = document.querySelector('label[for="' + e.id + '"]');
      return lbl ? lbl.textContent.trim() : e.value;
    });
    if (value !== expected)
      throw new Error('Expected "' + expected + '" selected, got "' + value + '" in group "' + label + '"');
    return;
  }

  throw new Error('Element not found for label: ' + label);
}

// ─── Text locator actions ───────────────────────────────────────────────────

export async function actionByText(page, text, action, nth?, exact?) {
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
  // Strict mode: filter hidden elements (e.g. cdk-visually-hidden checkboxes)
  if (nth === undefined && await loc.count() > 1) {
    const visible = loc.filter({ visible: true });
    const vc = await visible.count();
    if (vc >= 1) loc = vc === 1 ? visible : visible.first();
    else loc = loc.first();
  }
  await loc[action]();
}

export async function fillByText(page, text, value, nth?, exact?) {
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByPlaceholder(text);
    if (await loc.count() === 0) loc = page.getByRole('textbox', { name: text });
    // Informal label fallback: find text, walk up DOM to locate a nearby input
    if (await loc.count() === 0) {
      const sel = await page.getByText(text).first().evaluate((el: Element) => {
        let a: Element | null = el.closest('td, th') || el.closest('tr') || el.parentElement;
        while (a && a !== document.body) {
          const inp = a.querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), textarea, [contenteditable="true"]');
          if (inp) {
            const id = '__pw_fill_' + Math.random().toString(36).slice(2);
            inp.setAttribute('data-pw-fill', id);
            return '[data-pw-fill="' + id + '"]';
          }
          a = a.parentElement;
        }
        return null;
      });
      if (sel) {
        loc = page.locator(sel);
        await loc.fill(value);
        if (typeof page.evaluate === 'function')
          await page.evaluate(() => document.querySelectorAll('[data-pw-fill]').forEach(el => el.removeAttribute('data-pw-fill'))).catch(() => {});
        return;
      }
    }
  }
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.fill(value);
}

export async function selectByText(page, text, value, nth?, exact?) {
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByRole('combobox', { name: text });
    // Informal label fallback: find text, walk up DOM to locate a nearby select
    if (await loc.count() === 0) {
      const sel = await page.getByText(text).first().evaluate((el: Element) => {
        let a: Element | null = el.closest('td, th') || el.closest('tr') || el.parentElement;
        while (a && a !== document.body) {
          const s = a.querySelector('select');
          if (s) {
            const id = '__pw_fill_' + Math.random().toString(36).slice(2);
            s.setAttribute('data-pw-fill', id);
            return '[data-pw-fill="' + id + '"]';
          }
          a = a.parentElement;
        }
        return null;
      });
      if (sel) {
        loc = page.locator(sel);
        await loc.selectOption(value);
        if (typeof page.evaluate === 'function')
          await page.evaluate(() => document.querySelectorAll('[data-pw-fill]').forEach(el => el.removeAttribute('data-pw-fill'))).catch(() => {});
        return;
      }
    }
  }
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  else if (await loc.count() > 1) loc = loc.filter({ visible: true });
  await loc.selectOption(value);
}

export async function checkByText(page, text, nth?, exact?) {
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
  if (nth === undefined && await loc.count() > 1) {
    const visible = loc.filter({ visible: true });
    const vc = await visible.count();
    if (vc >= 1) loc = vc === 1 ? visible : visible.first();
    else loc = loc.first();
  }
  await loc.check();
}

export async function uncheckByText(page, text, nth?, exact?) {
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
  if (nth === undefined && await loc.count() > 1) {
    const visible = loc.filter({ visible: true });
    const vc = await visible.count();
    if (vc >= 1) loc = vc === 1 ? visible : visible.first();
    else loc = loc.first();
  }
  await loc.uncheck();
}

// ─── Role-based actions (used by recorder output) ──────────────────────────

export async function actionByRole(page, role, name, action, nth, inRole, inText) {
  // Link with URL: match by href instead of accessible name
  const isUrl = role === 'link' && name && /^\/|^https?:\/\//.test(name);
  const roleOpts = (name && !isUrl) ? { name, exact: true } : {};
  let loc = isUrl ? page.locator('a[href^="' + name + '"]:not([aria-hidden="true"])') : page.getByRole(role, roleOpts);
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, roleOpts);
  } else if (inText !== undefined) {
    for (const r of ['region', 'group', 'article', 'listitem', 'dialog', 'form']) {
      const scoped = page.getByRole(r).filter({ hasText: inText }).getByRole(role, roleOpts);
      if (await scoped.count() > 0) { loc = scoped; break; }
    }
  }
  if (nth !== undefined) loc = loc.nth(nth);
  else if (await loc.count() > 1) loc = loc.filter({ visible: true });
  await loc[action]();
}

export async function fillByRole(page, role, name, value, nth, inRole, inText) {
  const roleOpts = name ? { name, exact: true } : {};
  let loc = page.getByRole(role, roleOpts);
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, roleOpts);
  } else if (inText !== undefined) {
    for (const r of ['region', 'group', 'article', 'listitem', 'dialog', 'form']) {
      const scoped = page.getByRole(r).filter({ hasText: inText }).getByRole(role, roleOpts);
      if (await scoped.count() > 0) { loc = scoped; break; }
    }
  }
  if (nth !== undefined) loc = loc.nth(nth);
  else if (await loc.count() > 1) loc = loc.filter({ visible: true });
  await loc.fill(value);
}

export async function selectByRole(page, role, name, value, nth, inRole, inText) {
  const roleOpts = name ? { name, exact: true } : {};
  let loc = page.getByRole(role, roleOpts);
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, roleOpts);
  } else if (inText !== undefined) {
    for (const r of ['region', 'group', 'article', 'listitem', 'dialog', 'form']) {
      const scoped = page.getByRole(r).filter({ hasText: inText }).getByRole(role, roleOpts);
      if (await scoped.count() > 0) { loc = scoped; break; }
    }
  }
  if (nth !== undefined) loc = loc.nth(nth);
  else if (await loc.count() > 1) loc = loc.filter({ visible: true });
  await loc.selectOption(value);
}

// ─── Highlight ──────────────────────────────────────────────────────────────

export async function highlightByText(page, text, nth?, exact?) {
  let loc = exact ? page.getByText(text, { exact: true }) : page.getByText(text);
  const count = await loc.count();
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.highlight();
  return nth !== undefined
    ? 'Highlighted 1 of ' + count
    : 'Highlighted ' + count + ' element' + (count !== 1 ? 's' : '');
}

export async function highlightByRole(page, role, name, nth, inRole?, inText?) {
  // Link with URL: match by href instead of accessible name
  const isUrl = role === 'link' && name && /^\/|^https?:\/\//.test(name);
  const roleOpts = (name && !isUrl) ? { name, exact: true } : {};
  let loc = isUrl ? page.locator('a[href^="' + name + '"]:not([aria-hidden="true"])') : page.getByRole(role, roleOpts);
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, roleOpts);
  } else if (inText !== undefined) {
    for (const r of ['region', 'group', 'article', 'listitem', 'dialog', 'form']) {
      const scoped = page.getByRole(r).filter({ hasText: inText }).getByRole(role, roleOpts);
      if (await scoped.count() > 0) { loc = scoped; break; }
    }
  }
  const count = await loc.count();
  if (nth !== undefined) loc = loc.nth(nth);
  await loc.highlight();
  return nth !== undefined
    ? 'Highlighted 1 of ' + count
    : 'Highlighted ' + count + ' element' + (count !== 1 ? 's' : '');
}

export async function highlightBySelector(page, selector, nth?) {
  let loc = page.locator(selector);
  const count = await loc.count();
  if (nth !== undefined) loc = loc.filter({ visible: true }).nth(nth);
  await loc.highlight();
  return nth !== undefined
    ? 'Highlighted 1 of ' + count
    : 'Highlighted ' + count + ' element' + (count !== 1 ? 's' : '');
}

export async function highlightByRef(page, ref) {
  const loc = page.locator('aria-ref=' + ref);
  await loc.highlight();
  return 'Highlighted';
}

export async function clearHighlight(page) {
  // Highlight a non-matching locator — Playwright replaces the current highlight
  // with nothing (0 elements), clearing it visually while keeping internal state valid.
  await page.locator('#__pw_clear__').highlight().catch(() => {});
  return 'Cleared';
}

// ─── Chaining (>> selectors) ────────────────────────────────────────────────

export async function chainAction(page, selector, action, value) {
  let loc = page.locator(selector);
  // If multiple matches, try filtering to avoid strict violation:
  // 1. Exclude aria-hidden elements
  // 2. Filter to visible elements only
  // 3. Fall back to first match
  if (await loc.count() > 1) {
    const noHidden = page.locator(selector + ':not([aria-hidden="true"])');
    if (await noHidden.count() === 1) { loc = noHidden; }
    else {
      const visible = loc.filter({ visible: true });
      const vc = await visible.count();
      if (vc >= 1) loc = vc === 1 ? visible : visible.first();
      else loc = loc.first();
    }
  }
  try {
    if (value !== undefined) await loc[action](value);
    else await loc[action]();
  } catch {
    // Retry with force for covered elements (e.g. YouTube video player overlay)
    if (value !== undefined) await loc[action](value, { force: true });
    else await loc[action]({ force: true });
  }
  return 'Done';
}

// ─── Navigation ─────────────────────────────────────────────────────────────

export async function goBack(page) {
  await page.goBack();
  return page.url();
}

export async function goForward(page) {
  await page.goForward();
  return page.url();
}

export async function gotoUrl(page, url) {
  await page.goto(url);
  return 'Navigated to ' + url;
}

export async function reloadPage(page) {
  await page.reload();
  return 'Reloaded';
}

// ─── Timing ─────────────────────────────────────────────────────────────────

export async function waitMs(page, ms) {
  await page.waitForTimeout(ms);
  return 'Waited ' + ms + 'ms';
}

// ─── Page info ───────────────────────────────────────────────────────────────

export async function getTitle(page) {
  return await page.title();
}

export async function getUrl(page) {
  return page.url();
}

// ─── Eval ────────────────────────────────────────────────────────────────────

export async function evalCode(page, code) {
  const result = await page.evaluate(code);
  return result !== undefined ? JSON.stringify(result) : 'undefined';
}

// ─── Run Code ────────────────────────────────────────────────────────────────

export async function runCode(page, code) {
  const AsyncFunction = runCode.constructor;
  const trimmed = code.trim();
  // If code is a function expression, call it with page; otherwise treat as function body
  const isFnExpr = /^(async\s*)?\(|^(async\s+)?function\b/.test(trimmed);
  const body = isFnExpr ? `return (${trimmed})(page)` : `return ${trimmed}`;
  const fn = new AsyncFunction('page', body);
  const result = await fn(page);
  return result != null && typeof result !== 'object' ? String(result) : 'Done';
}

// ─── Screenshot ──────────────────────────────────────────────────────────────

export async function takeScreenshot(page, fullPage) {
  const data = await page.screenshot({ type: 'jpeg', fullPage: !!fullPage });
  // Return object so background.ts can set the image field
  return { __image: data.toString('base64'), mimeType: 'image/jpeg' };
}

// ─── Snapshot ────────────────────────────────────────────────────────────────

export async function takeSnapshot(page) {
  if (typeof page.ariaSnapshot === 'function') {
    return await page.ariaSnapshot({ mode: 'ai' });
  }
  // Legacy fallback for older Playwright versions
  if (typeof page._snapshotForAI === 'function') {
    const result = await page._snapshotForAI();
    return result.full ?? String(result);
  }
  const title = await page.title();
  const url = page.url();
  return 'Title: ' + title + '\nURL: ' + url;
}

// ─── Ref-based actions ───────────────────────────────────────────────────────

export async function refAction(page, ref, action, value) {
  // Use the aria-ref custom selector engine (NOT a CSS attribute selector).
  // Refs are JS properties on elements, resolved via _lastAriaSnapshotForQuery.
  // Run snapshot first if refs are stale.
  const loc = page.locator('aria-ref=' + ref);
  if (await loc.count() === 0) throw new Error('Element ' + ref + ' not found. Run snapshot first.');
  if (value !== undefined) await loc[action](value);
  else await loc[action]();
  return 'Done';
}

// ─── Press / Type ────────────────────────────────────────────────────────────

export async function pressKey(page, target, key) {
  if (!target || target === key) {
    // pressKey called with only a key (global keyboard press)
    await page.keyboard.press(target);
    return 'Pressed ' + target;
  }
  const isRef = /^e\d+$/.test(target);
  if (isRef) {
    await page.locator('aria-ref=' + target).press(key);
    return 'Pressed ' + key;
  }
  let loc = page.getByText(target, { exact: true });
  if (await loc.count() === 0) loc = page.getByRole('textbox', { name: target });
  if (await loc.count() === 0) loc = page.getByRole('combobox', { name: target });
  if (await loc.count() === 0) loc = page.getByPlaceholder(target);
  if (await loc.count() === 0) loc = page.getByText(target);
  if (await loc.count() > 1) {
    const visible = loc.filter({ visible: true });
    const vc = await visible.count();
    if (vc >= 1) loc = vc === 1 ? visible : visible.first();
    else loc = loc.first();
  }
  await loc.press(key);
  return 'Pressed ' + key;
}

export async function pressKeyByRole(page, role, name, key, nth, inRole, inText) {
  const roleOpts = name ? { name, exact: true } : {};
  let loc = page.getByRole(role, roleOpts);
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, roleOpts);
  } else if (inText !== undefined) {
    for (const r of ['region', 'group', 'article', 'listitem', 'dialog', 'form']) {
      const scoped = page.getByRole(r).filter({ hasText: inText }).getByRole(role, roleOpts);
      if (await scoped.count() > 0) { loc = scoped; break; }
    }
  }
  if (nth !== undefined) loc = loc.nth(nth);
  else if (await loc.count() > 1) loc = loc.filter({ visible: true });
  await loc.press(key);
  return 'Pressed ' + key;
}

export async function typeText(page, text) {
  await page.keyboard.type(text);
  return 'Typed';
}

// ─── Storage ─────────────────────────────────────────────────────────────────

export async function localStorageGet(page, key) {
  return await page.evaluate(k => localStorage.getItem(k), key);
}

export async function localStorageSet(page, key, value) {
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);
  return 'Set';
}

export async function localStorageDelete(page, key) {
  await page.evaluate(k => localStorage.removeItem(k), key);
  return 'Deleted';
}

export async function localStorageClear(page) {
  await page.evaluate(() => localStorage.clear());
  return 'Cleared';
}

export async function localStorageList(page) {
  const items = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      result[k] = localStorage.getItem(k);
    }
    return result;
  });
  return JSON.stringify(items, null, 2);
}

export async function sessionStorageGet(page, key) {
  return await page.evaluate(k => sessionStorage.getItem(k), key);
}

export async function sessionStorageSet(page, key, value) {
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [key, value]);
  return 'Set';
}

export async function sessionStorageDelete(page, key) {
  await page.evaluate(k => sessionStorage.removeItem(k), key);
  return 'Deleted';
}

export async function sessionStorageClear(page) {
  await page.evaluate(() => sessionStorage.clear());
  return 'Cleared';
}

export async function sessionStorageList(page) {
  const items = await page.evaluate(() => {
    const result = {};
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      result[k] = sessionStorage.getItem(k);
    }
    return result;
  });
  return JSON.stringify(items, null, 2);
}

// ─── Cookies ─────────────────────────────────────────────────────────────────

export async function cookieList(page) {
  const cookies = await page.context().cookies();
  return JSON.stringify(cookies, null, 2);
}

export async function cookieGet(page, name) {
  const cookies = await page.context().cookies();
  const c = cookies.find(c => c.name === name);
  return c ? JSON.stringify(c, null, 2) : 'Cookie not found: ' + name;
}

export async function cookieSet(page, name, value) {
  const url = page.url();
  await page.context().addCookies([{ name, value, url }]);
  return 'Cookie set: ' + name;
}

export async function cookieDelete(page, name) {
  await page.context().clearCookies({ name });
  return 'Cookie deleted: ' + name;
}

export async function cookieClear(page) {
  await page.context().clearCookies();
  return 'Cleared';
}

// ─── Drag ─────────────────────────────────────────────────────────────────────

export async function dragDrop(page, source, target) {
  let srcLoc = /^e\d+$/.test(source) ? page.locator('aria-ref=' + source) : page.getByText(source);
  let tgtLoc = /^e\d+$/.test(target) ? page.locator('aria-ref=' + target) : page.getByText(target);
  if (await srcLoc.count() > 1) srcLoc = srcLoc.filter({ visible: true }).first();
  if (await tgtLoc.count() > 1) tgtLoc = tgtLoc.filter({ visible: true }).first();
  await srcLoc.dragTo(tgtLoc);
  return 'Dragged';
}

// ─── Resize ───────────────────────────────────────────────────────────────────

export async function resizeViewport(page, width, height) {
  await page.setViewportSize({ width: parseInt(width), height: parseInt(height) });
  return 'Resized to ' + width + 'x' + height;
}

// ─── PDF ─────────────────────────────────────────────────────────────────────

export async function takePdf(page) {
  const data = await page.pdf();
  return { __image: data.toString('base64'), mimeType: 'application/pdf' };
}

// ─── Console / Network / Dialog / Route (globalThis state) ───────────────────

export async function getConsoleMessages(_page, clear) {
  if (clear) { globalThis.__consoleMessages = []; return 'Console cleared'; }
  const msgs = globalThis.__consoleMessages || [];
  return msgs.length === 0 ? 'No console messages (listening...)' : msgs.join('\n');
}

export async function getNetworkRequests(_page, clear, includeStatic) {
  if (clear) { globalThis.__networkRequests = []; return 'Network log cleared'; }
  let reqs = globalThis.__networkRequests || [];
  if (!includeStatic) {
    const skip = new Set(['stylesheet', 'image', 'font', 'media', 'other']);
    reqs = reqs.filter(r => !skip.has(r.type));
  }
  return reqs.length === 0
    ? 'No network requests (listening...)'
    : reqs.map(r => r.status + ' ' + r.method + ' ' + r.url).join('\n');
}

export async function setDialogAccept(_page) {
  globalThis.__dialogMode = 'accept';
  return 'Dialogs will be auto-accepted';
}

export async function setDialogDismiss(_page) {
  globalThis.__dialogMode = 'dismiss';
  return 'Dialogs will be auto-dismissed';
}

export async function addRoute(page, pattern) {
  if (!globalThis.__activeRoutes) globalThis.__activeRoutes = [];
  const handler = route => route.abort();
  await page.route(pattern, handler);
  globalThis.__activeRoutes.push({ pattern, handler });
  return 'Route added (blocked): ' + pattern;
}

export async function listRoutes(_page) {
  const routes = globalThis.__activeRoutes || [];
  return routes.length === 0 ? 'No active routes' : routes.map(r => r.pattern).join('\n');
}

export async function removeRoute(page, pattern) {
  if (!globalThis.__activeRoutes || globalThis.__activeRoutes.length === 0)
    return 'No routes to remove';
  const idx = globalThis.__activeRoutes.findIndex(r => r.pattern === pattern);
  if (idx === -1) return 'Route not found: ' + pattern;
  await page.unroute(pattern, globalThis.__activeRoutes[idx].handler);
  globalThis.__activeRoutes.splice(idx, 1);
  return 'Route removed: ' + pattern;
}

// ─── Tab operations ───────────────────────────────────────────────────────────
// Use chrome.tabs API (available in SW) so ALL Chrome tabs are visible,
// not just pages tracked by playwright-crx. Scoped to the attached tab's window.

export async function tabList(_page) {
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  const tabs = await chrome.tabs.query(windowId !== undefined ? { windowId } : {});
  return JSON.stringify(tabs.map((tab, i) => ({
    index: i,
    title: tab.title || '',
    url: tab.url || '',
    current: tab.id === activeTabId,
  })), null, 2);
}

export async function tabNew(_page, url) {
  const tabUrl = url || 'about:blank';
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  await chrome.tabs.create(windowId !== undefined ? { url: tabUrl, windowId } : { url: tabUrl });
  return 'Opened new tab' + (url ? ': ' + url : '');
}

export async function tabClose(_page, index) {
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  const tabs = await chrome.tabs.query(windowId !== undefined ? { windowId } : {});
  const tab = index !== undefined ? tabs[index] : tabs.find(t => t.id === activeTabId);
  if (!tab?.id) throw new Error('Tab ' + (index !== undefined ? index : 'current') + ' not found');
  const url = tab.url || '';
  await chrome.tabs.remove(tab.id);
  return 'Closed: ' + url;
}

export async function tabSelect(_page, index) {
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  const tabs = await chrome.tabs.query(windowId !== undefined ? { windowId } : {});
  const tab = tabs[index];
  if (!tab?.id) throw new Error('Tab ' + index + ' not found');
  const res = await globalThis.attachToTab(tab.id);
  if (!res.ok) throw new Error(res.error || 'Attach failed');
  return 'Selected tab ' + index + ': ' + (res.url || '');
}
