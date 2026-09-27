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
  const deps = (fn._deps || []).map(d => `const ${d.name} = ${d.toString()};`).join('\n  ');
  if (!deps)
    return { _: ['run-code', `async (page) => (${fn.toString()})(page, ${serialized})`] };
  return { _: ['run-code', `async (page) => { ${deps}\n  return (${fn.toString()})(page, ${serialized}); }`] };
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
  const deps = (fn._deps || []).map(d => `  const ${d.name} = ${d.toString()};`).join('\n');
  const prelude = deps ? `${deps}\n` : '';
  return { _: ['run-code', `async (page) => {
${prelude}  let __scope = page;
  for (const __r of ['row','group','article','listitem','region','dialog','form']) {
    const __c = page.getByRole(__r).filter({ has: page.getByText(${inSer}, { exact: true }) });
    const __n = await __c.count();
    if (__n > 0) { __scope = __c.first(); break; }
  }
  if (__scope === page) {
    try {
      let __anchor = page.getByText(${inSer}, { exact: true });
      if (await __anchor.count() === 0) __anchor = page.getByText(${inSer});
      const __sel = await __anchor.first().evaluate((el) => {
        const S = new Set(['FIELDSET','SECTION','ARTICLE','DETAILS','DIALOG','FORM','TR']);
        let a = el.parentElement;
        while (a && a !== document.body) {
          if (S.has(a.tagName) || a.hasAttribute('role')) {
            const id = '__pw_in_' + Math.random().toString(36).slice(2);
            a.setAttribute('data-pw-in', id);
            return '[data-pw-in="' + id + '"]';
          }
          a = a.parentElement;
        }
        return null;
      });
      if (__sel) __scope = page.locator(__sel);
    } catch {}
  }
  try {
    return await (${fn.toString()})(__scope, ${serialized});
  } finally {
    if (typeof page.evaluate === 'function')
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
  // Strict mode: filter hidden elements when multiple matches found
  if (nth === undefined && await loc.count() > 1) {
    const visible = loc.filter({ visible: true });
    const vc = await visible.count();
    if (vc >= 1) loc = vc === 1 ? visible : visible.first();
    else loc = loc.first();
  }
  await loc[action]();
}

export async function fillByText(page, text, value, nth, exact?) {
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByPlaceholder(text);
    if (await loc.count() === 0) loc = page.getByRole('textbox', { name: text });
    // Informal label fallback: find text, walk up DOM to locate a nearby input
    if (await loc.count() === 0) {
      const sel = await page.getByText(text).first().evaluate((el) => {
        let a = el.closest('td, th') || el.closest('tr') || el.parentElement;
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

export async function selectByText(page, text, value, nth, exact?) {
  let loc = page.getByLabel(text);
  if (!exact) {
    if (await loc.count() === 0) loc = page.getByRole('combobox', { name: text });
    // Informal label fallback: find text, walk up DOM to locate a nearby select
    if (await loc.count() === 0) {
      const sel = await page.getByText(text).first().evaluate((el) => {
        let a = el.closest('td, th') || el.closest('tr') || el.parentElement;
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

// ─── Role-based actions ─────────────────────────────────────────────────────

/**
 * Shared resolver for *ByRole helpers. Falls back to matching accessible names
 * with role="note" descendants excluded — recorder strips these annotations
 * (e.g. MS Forms "Required to answer" required-star), so playback must too.
 */
async function _resolveByRole(page, role, name, nth, inRole, inText) {
  const isUrl = role === 'link' && name && /^\/|^https?:\/\//.test(name);
  const roleOpts = (name && !isUrl) ? { name, exact: true } : {};
  let loc = isUrl ? page.locator('a[href^="' + name + '"]:not([aria-hidden="true"])') : page.getByRole(role, roleOpts);
  if (inRole !== undefined && inText !== undefined) {
    const cr = ({ list: 'listitem' })[inRole] || inRole;
    loc = page.getByRole(cr).filter({ hasText: inText }).getByRole(role, roleOpts);
  } else if (inText !== undefined) {
    for (const r of ['row', 'region', 'group', 'article', 'listitem', 'dialog', 'form']) {
      const scoped = page.getByRole(r).filter({ hasText: inText }).getByRole(role, roleOpts);
      if (await scoped.count() > 0) { loc = scoped; break; }
    }
  }
  // role="note" fallback: strict match found nothing → retry with clean-name comparison.
  if (name && !isUrl && nth === undefined && inRole === undefined && inText === undefined
      && await loc.count() === 0) {
    const idx = await page.getByRole(role).evaluateAll((els, wanted) => {
      const collect = (node) => {
        let out = '';
        for (const c of node.childNodes) {
          if (c.nodeType === 3) { out += c.textContent || ''; continue; }
          if (c.nodeType !== 1) continue;
          if (c.getAttribute('aria-hidden') === 'true') continue;
          if (c.getAttribute('role') === 'note') continue;
          const label = c.getAttribute('aria-label');
          let contrib = label || collect(c);
          const disp = getComputedStyle(c).display || 'inline';
          if (disp !== 'inline' || c.nodeName === 'BR') contrib = ' ' + contrib + ' ';
          out += contrib;
        }
        return out.replace(/[^\S\u00A0]+/g, ' ').replace(/^[^\S\u00A0]+|[^\S\u00A0]+$/g, '');
      };
      const nameOf = (el) => {
        const lb = el.getAttribute('aria-labelledby');
        if (lb) {
          const parts = lb.split(/\s+/).map(id => {
            const r = document.getElementById(id);
            if (!r) return '';
            if (r.getAttribute('aria-hidden') === 'true') return '';
            if (getComputedStyle(r).display === 'none') return '';
            return collect(r);
          }).filter(Boolean);
          if (parts.length) return parts.join(' ');
        }
        const al = el.getAttribute('aria-label');
        if (al) return al.trim();
        return collect(el);
      };
      const idxs = [];
      for (let i = 0; i < els.length; i++)
        if (nameOf(els[i]) === wanted) idxs.push(i);
      return idxs.length === 1 ? idxs[0] : -1;
    }, name);
    if (idx >= 0) loc = page.getByRole(role).nth(idx);
  }
  if (nth !== undefined) loc = loc.nth(nth);
  else if (await loc.count() > 1) loc = loc.filter({ visible: true });
  return loc;
}

export async function actionByRole(page, role, name, action, nth, inRole, inText) {
  const loc = await _resolveByRole(page, role, name, nth, inRole, inText);
  await loc[action]();
}
actionByRole._deps = [_resolveByRole];

export async function fillByRole(page, role, name, value, nth, inRole, inText) {
  const loc = await _resolveByRole(page, role, name, nth, inRole, inText);
  await loc.fill(value);
}
fillByRole._deps = [_resolveByRole];

export async function selectByRole(page, role, name, value, nth, inRole, inText) {
  const loc = await _resolveByRole(page, role, name, nth, inRole, inText);
  await loc.selectOption(value);
}
selectByRole._deps = [_resolveByRole];

export async function pressKeyByRole(page, role, name, key, nth, inRole, inText) {
  const loc = await _resolveByRole(page, role, name, nth, inRole, inText);
  await loc.press(key);
}
pressKeyByRole._deps = [_resolveByRole];
