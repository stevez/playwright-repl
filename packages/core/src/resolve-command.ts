// @ts-nocheck — Functions are stringified via fn.toString() for eval contexts.
/**
 * Resolve a keyword command to a JavaScript expression string.
 *
 * This is the "common layer" — pure Playwright API only.
 * Platform-specific commands (Chrome tabs, Node.js video, etc.) are handled
 * by extending this in the extension or relay packages.
 *
 * Returns { jsExpr } for known commands, or null if unrecognised.
 */

import {
  verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  verifyVisible, verifyCssVisible, verifyCssElement, verifyCssNoElement, verifyCssValue,
  verifyInputValue, waitForText,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  actionByRole, fillByRole, selectByRole, pressKeyByRole,
} from './page-scripts.js';

import {
  gotoUrl, reloadPage, goBack, goForward,
  waitMs, getTitle, getUrl,
  evalCode, runCode,
  takeScreenshot, takeSnapshot, takePdf,
  refAction, pressKey, typeText,
  highlightByText, highlightByRole, highlightBySelector, highlightByRef, clearHighlight,
  chainAction,
  localStorageGet, localStorageSet, localStorageDelete, localStorageClear, localStorageList,
  sessionStorageGet, sessionStorageSet, sessionStorageDelete, sessionStorageClear, sessionStorageList,
  cookieList, cookieGet, cookieSet, cookieDelete, cookieClear,
  dragDrop, resizeViewport,
  getConsoleMessages, getNetworkRequests, setDialogAccept, setDialogDismiss,
  addRoute, listRoutes, removeRoute,
  tracingStart, tracingStop,
  videoStart, videoStop,
  tabList, tabNew, tabClose, tabSelect,
} from './command-scripts.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Serialize a value for inline JS — undefined becomes the literal `undefined` */
function ser(v) {
  if (v === undefined) return 'undefined';
  return JSON.stringify(v);
}

/** Build a JS expression that calls a page-script function (page is expected in scope) */
function call(fn, ...args) {
  return `return await (${fn.toString()})(page, ${args.map(ser).join(', ')})`;
}

/**
 * Build a scoped JS expression — finds the nearest ancestor containing inText,
 * then calls fn with the scoped locator as `page`.
 */
function callScoped(fn, inText, _targetText, ...args) {
  const anchorCode = `(async () => { const __e = page.getByText(${ser(inText)}, { exact: true }); return (await __e.count()) > 0 ? __e : page.getByText(${ser(inText)}); })()`;
  const fallbackCheck = `(await ${anchorCode}).first().evaluate((el) => {
          const S = new Set(['FIELDSET','SECTION','ARTICLE','DETAILS','DIALOG','FORM']);
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
        })`;
  return `return await (async () => {
    let __scope = page;
    const __roles = ['group', 'article', 'listitem', 'region', 'dialog', 'form'];
    for (const __r of __roles) {
      const __c = page.getByRole(__r).filter({ hasText: ${ser(inText)} });
      if (await __c.count() > 0) { __scope = __c.first(); break; }
    }
    if (__scope === page) {
      try {
        const __sel = await ${fallbackCheck};
        if (__sel) __scope = page.locator(__sel);
      } catch {}
    }
    if (__scope !== page) {
      const __tc = await __scope.getByText(${ser(_targetText)}).count().catch(() => 0);
      if (__tc === 0) __scope = page;
    }
    try {
      return await (${fn.toString()})(__scope, ${args.map(ser).join(', ')});
    } finally {
      if (typeof page.evaluate === 'function')
        await page.evaluate(() => document.querySelectorAll('[data-pw-in]').forEach(el => el.removeAttribute('data-pw-in'))).catch(() => {});
    }
  })()`;
}

// ─── Tokenizer ──────────────────────────────────────────────────────────────

const BOOLEAN_OPTIONS = new Set([
  'headed', 'persistent', 'extension', 'submit', 'clear',
  'fullPage', 'includeStatic', 'exact',
]);

function tokenize(line) {
  const tokens = [];
  let current = '';
  let inQuote = null;
  let parenDepth = 0;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) { inQuote = null; if (parenDepth > 0) current += ch; }
      else current += ch;
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      if (parenDepth > 0) current += ch;
    } else if (ch === '(') { parenDepth++; current += ch; }
    else if (ch === ')') { parenDepth = Math.max(0, parenDepth - 1); current += ch; }
    else if ((ch === ' ' || ch === '\t') && parenDepth === 0) {
      if (current) { tokens.push(current); current = ''; }
    } else current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

// ─── Parse input ────────────────────────────────────────────────────────────

const RAW_COMMANDS = new Set(['run-code', 'eval']);

function parseInput(line) {
  const tokens = tokenize(line);
  if (tokens.length === 0) return null;
  tokens[0] = tokens[0].toLowerCase();
  if (RAW_COMMANDS.has(tokens[0])) {
    const cmdLen = line.match(/^\s*\S+/)[0].length;
    const rest = line.slice(cmdLen).trim();
    return rest ? { _: [tokens[0], rest] } : { _: [tokens[0]] };
  }
  const positional = [];
  const opts = {};
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].startsWith('--')) {
      const key = tokens[i].slice(2);
      if (BOOLEAN_OPTIONS.has(key)) { opts[key] = true; i++; }
      else if (key === 'in' && i + 2 < tokens.length && !tokens[i + 1].startsWith('--') && !tokens[i + 2].startsWith('--') && /^[a-z]+$/.test(tokens[i + 1])) {
        opts['in-role'] = tokens[i + 1]; opts['in-text'] = tokens[i + 2]; i += 3;
      } else if (key === 'in' && i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        opts['in-text'] = tokens[i + 1]; i += 2;
      } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        opts[key] = tokens[i + 1]; i += 2;
      } else { opts[key] = true; i++; }
    } else { positional.push(tokens[i]); i++; }
  }
  return { _: positional, ...opts };
}

// ─── Resolve ────────────────────────────────────────────────────────────────

function resolveArgs(args) {
  const cmdName = args._[0];

  // ── Verify unified ──
  if (cmdName === 'verify') {
    const subType = args._[1];
    const rest = args._.slice(2);
    if (rest[0] === 'css' && rest.length >= 2) {
      const selector = rest.slice(1).join(' ');
      if (subType === 'visible') return { jsExpr: call(verifyCssVisible, selector) };
      if (subType === 'element') return { jsExpr: call(verifyCssElement, selector) };
      if (subType === 'no-element') return { jsExpr: call(verifyCssNoElement, selector) };
      if (subType === 'value' && rest.length >= 3) {
        const sel = rest.slice(1, -1).join(' ');
        return { jsExpr: call(verifyCssValue, sel, rest[rest.length - 1]) };
      }
    }
    if (subType === 'title' && rest.length > 0) return { jsExpr: call(verifyTitle, rest.join(' ')) };
    if (subType === 'url' && rest.length > 0) return { jsExpr: call(verifyUrl, rest.join(' ')) };
    if (subType === 'text' && rest.length > 0) return { jsExpr: call(verifyText, rest.join(' ')) };
    if (subType === 'no-text' && rest.length > 0) return { jsExpr: call(verifyNoText, rest.join(' ')) };
    if (subType === 'element' && rest.length >= 2) return { jsExpr: call(verifyElement, rest[0], rest.slice(1).join(' ')) };
    if (subType === 'no-element' && rest.length >= 2) return { jsExpr: call(verifyNoElement, rest[0], rest.slice(1).join(' ')) };
    if (subType === 'value' && rest.length >= 2) return { jsExpr: call(verifyValue, rest[0], rest.slice(1).join(' ')) };
    if (subType === 'list' && rest.length >= 2) return { jsExpr: call(verifyList, rest[0], rest.slice(1)) };
  }

  // ── Verify css subcommand ──
  const CSS_VERIFY = { 'verify-visible': verifyCssVisible, 'verify-element': verifyCssElement, 'verify-no-element': verifyCssNoElement };
  if (CSS_VERIFY[cmdName] && args._[1] === 'css' && args._.length >= 3) {
    return { jsExpr: call(CSS_VERIFY[cmdName], args._.slice(2).join(' ')) };
  }
  if (cmdName === 'verify-value' && args._[1] === 'css' && args._.length >= 4) {
    return { jsExpr: call(verifyCssValue, args._.slice(2, -1).join(' '), args._[args._.length - 1]) };
  }

  // ── Legacy verify-* ──
  const TEXT_VERIFY = new Set(['verify-text', 'verify-no-text', 'verify-title', 'verify-url']);
  const ELEMENT_VERIFY = new Set(['verify-element', 'verify-no-element', 'verify-visible']);
  const verifyFns = {
    'verify-text': verifyText, 'verify-element': verifyElement, 'verify-visible': verifyVisible,
    'verify-value': verifyValue, 'verify-list': verifyList, 'verify-title': verifyTitle,
    'verify-url': verifyUrl, 'verify-no-text': verifyNoText, 'verify-no-element': verifyNoElement,
  };
  if (verifyFns[cmdName]) {
    const pos = args._.slice(1);
    const fn = verifyFns[cmdName];
    if (TEXT_VERIFY.has(cmdName)) { const text = pos.join(' '); if (text) return { jsExpr: call(fn, text) }; }
    else if (ELEMENT_VERIFY.has(cmdName)) { if (pos[0] && pos.length >= 2) return { jsExpr: call(fn, pos[0], pos.slice(1).join(' ')) }; }
    else if (cmdName === 'verify-value' && pos[0] && pos.length >= 2) {
      const isRef = /^e\d+$/.test(pos[0]);
      return { jsExpr: call(isRef ? verifyValue : verifyInputValue, pos[0], pos.slice(1).join(' ')) };
    }
    else if (pos[0] && pos.length >= 2) {
      const rest = cmdName === 'verify-list' ? pos.slice(1) : pos.slice(1).join(' ');
      return { jsExpr: call(fn, pos[0], rest) };
    }
  }

  // ── Wait-for-text ──
  if (cmdName === 'wait-for-text') {
    const text = args._.slice(1).join(' ');
    if (text) return { jsExpr: call(waitForText, text) };
  }

  // ── Navigation ──
  if (cmdName === 'goto' || cmdName === 'open') {
    const url = args._[1];
    if (url) return { jsExpr: call(gotoUrl, url) };
  }
  if (cmdName === 'reload') return { jsExpr: call(reloadPage) };
  if (cmdName === 'go-back') return { jsExpr: call(goBack) };
  if (cmdName === 'go-forward') return { jsExpr: call(goForward) };

  // ── Page info ──
  if (cmdName === 'title') return { jsExpr: call(getTitle) };
  if (cmdName === 'url') return { jsExpr: call(getUrl) };

  // ── Wait ──
  if (cmdName === 'wait') {
    const ms = parseInt(args._[1]) || 1000;
    return { jsExpr: call(waitMs, ms) };
  }

  // ── Eval / Run code ──
  if (cmdName === 'eval') return { jsExpr: call(evalCode, args._[1] || '') };
  if (cmdName === 'run-code') return { jsExpr: call(runCode, args._[1] || '') };

  // ── Screenshot / PDF / Snapshot ──
  if (cmdName === 'screenshot') return { jsExpr: `return JSON.stringify(await (${takeScreenshot.toString()})(page, ${!!(args.fullPage)}))` };
  if (cmdName === 'pdf') return { jsExpr: `return JSON.stringify(await (${takePdf.toString()})(page))` };
  if (cmdName === 'snapshot') return { jsExpr: call(takeSnapshot) };

  // ── Highlight ──
  if (cmdName === 'highlight') {
    if (args.clear) return { jsExpr: call(clearHighlight) };
    const loc = args._[1];
    if (loc) {
      if (/^e\d+$/.test(loc)) return { jsExpr: call(highlightByRef, loc) };
      if (loc === 'css') {
        const selector = args._.slice(2).join(' ');
        if (selector) return { jsExpr: call(highlightBySelector, selector, args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined) };
      }
      const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
      const exact = args.exact ? true : undefined;
      const inRole = args['in-role'] !== undefined ? String(args['in-role']) : undefined;
      const inText = args['in-text'] !== undefined ? String(args['in-text']) : undefined;
      if (/^[a-z]+$/.test(loc) && (args._.length >= 3 || inText !== undefined || nth !== undefined)) {
        const name = args._.length >= 3 ? args._.slice(2).join(' ') : '';
        if (inText && !inRole) return { jsExpr: callScoped(highlightByRole, inText, name, loc, name, nth) };
        return { jsExpr: call(highlightByRole, loc, name, nth, inRole, inText) };
      }
      if (inText && !inRole) return { jsExpr: callScoped(highlightByText, inText, loc, loc, nth, exact) };
      return { jsExpr: call(highlightByText, loc, nth, exact) };
    }
  }

  // ── CSS subcommand ──
  const CSS_ACTIONS = { click: 'click', dblclick: 'dblclick', hover: 'hover', check: 'check', uncheck: 'uncheck', fill: 'fill', select: 'selectOption' };
  if (CSS_ACTIONS[cmdName] && args._[1] === 'css') {
    const needsValue = cmdName === 'fill' || cmdName === 'select';
    const selectorParts = needsValue ? args._.slice(2, -1) : args._.slice(2);
    const selector = selectorParts.join(' ');
    const value = needsValue ? args._[args._.length - 1] : undefined;
    if (selector) return { jsExpr: call(chainAction, selector, CSS_ACTIONS[cmdName], value) };
  }

  // ── >> chaining ──
  const CHAIN_ACTIONS = { click: 'click', dblclick: 'dblclick', hover: 'hover', check: 'check', uncheck: 'uncheck', fill: 'fill', select: 'selectOption' };
  if (CHAIN_ACTIONS[cmdName] && args._.some(a => a.includes('>>'))) {
    const action = CHAIN_ACTIONS[cmdName];
    const positional = args._.slice(1);
    let lastChainIdx = -1;
    for (let i = 0; i < positional.length; i++) {
      if (positional[i] === '>>' || positional[i].includes('>>')) lastChainIdx = i;
    }
    const selectorEnd = positional[lastChainIdx] !== '>>' && positional[lastChainIdx]?.includes('>>')
      ? lastChainIdx : lastChainIdx + 1;
    const selector = positional.slice(0, selectorEnd + 1).join(' ');
    const rest = positional.slice(selectorEnd + 1).join(' ');
    return { jsExpr: call(chainAction, selector, action, rest || undefined) };
  }

  // ── Role-based actions ──
  const ROLE_ACTIONS = { click: 'click', dblclick: 'dblclick', hover: 'hover', check: 'check', uncheck: 'uncheck' };
  const inTextForRole = args['in-text'] !== undefined ? String(args['in-text']) : undefined;
  const nthForRole = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
  if (args._[1] && /^[a-z]+$/.test(args._[1]) && !args._.some(a => a.includes('>>')) && (args._.length >= 3 || inTextForRole !== undefined || nthForRole !== undefined)) {
    const role = args._[1];
    const nth = nthForRole;
    const inRole = args['in-role'] !== undefined ? String(args['in-role']) : undefined;
    const inText = inTextForRole;
    if (ROLE_ACTIONS[cmdName]) {
      const name = args._.length >= 3 ? args._.slice(2).join(' ') : '';
      if (inText && !inRole) return { jsExpr: callScoped(actionByRole, inText, name, role, name, ROLE_ACTIONS[cmdName], nth) };
      return { jsExpr: call(actionByRole, role, name, ROLE_ACTIONS[cmdName], nth, inRole, inText) };
    }
    if (cmdName === 'fill') return { jsExpr: call(fillByRole, role, args._[2], args._.slice(3).join(' ') || '', nth, inRole, inText) };
    if (cmdName === 'select') return { jsExpr: call(selectByRole, role, args._[2], args._.slice(3).join(' ') || '', nth, inRole, inText) };
    if (cmdName === 'press') return { jsExpr: call(pressKeyByRole, role, args._[2], args._.slice(3).join(' ') || '', nth, inRole, inText) };
  }

  // ── Text-based actions ──
  const textFns = { click: actionByText, dblclick: actionByText, hover: actionByText, fill: fillByText, select: selectByText, check: checkByText, uncheck: uncheckByText };
  if (textFns[cmdName] && args._[1] && !/^e\d+$/.test(args._[1]) && !args._.some(a => a.includes('>>'))) {
    const textArg = args._[1];
    const extraArgs = args._.slice(2);
    const fn = textFns[cmdName];
    const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
    const exact = args.exact ? true : undefined;
    const inText = args['in-text'] !== undefined ? String(args['in-text']) : undefined;
    if (fn === actionByText) {
      if (inText) return { jsExpr: callScoped(fn, inText, textArg, textArg, cmdName, nth, exact) };
      return { jsExpr: call(fn, textArg, cmdName, nth, exact) };
    }
    if (cmdName === 'fill' || cmdName === 'select') {
      if (inText) return { jsExpr: callScoped(fn, inText, textArg, textArg, extraArgs[0] || '', nth, exact) };
      return { jsExpr: call(fn, textArg, extraArgs[0] || '', nth, exact) };
    }
    if (inText) return { jsExpr: callScoped(fn, inText, textArg, textArg, nth, exact) };
    return { jsExpr: call(fn, textArg, nth, exact) };
  }

  // ── Ref-based actions ──
  const REF_ACTIONS = { click: 'click', dblclick: 'dblclick', hover: 'hover', check: 'check', uncheck: 'uncheck', fill: 'fill', select: 'selectOption', type: 'fill' };
  if (REF_ACTIONS[cmdName] && args._[1] && /^e\d+$/.test(args._[1])) {
    const ref = args._[1];
    const value = args._.slice(2).join(' ') || undefined;
    return { jsExpr: call(refAction, ref, REF_ACTIONS[cmdName], value) };
  }

  // ── Press ──
  if (cmdName === 'press') {
    const pos = args._.slice(1);
    if (pos.length === 1) return { jsExpr: call(pressKey, pos[0], pos[0]) };
    if (pos.length >= 2) return { jsExpr: call(pressKey, pos[0], pos[1]) };
  }

  // ── Type ──
  if (cmdName === 'type') {
    const text = args._.slice(1).join(' ');
    if (text) return { jsExpr: call(typeText, text) };
  }

  // ── Locator ──
  if (cmdName === 'locator') {
    const ref = args._[1];
    if (ref) return { jsExpr: `return (await page.locator(${ser('aria-ref=' + ref)}).normalize()).toString()` };
  }

  // ── localStorage ──
  if (cmdName === 'localstorage-get') return { jsExpr: call(localStorageGet, args._[1]) };
  if (cmdName === 'localstorage-set') return { jsExpr: call(localStorageSet, args._[1], args._.slice(2).join(' ')) };
  if (cmdName === 'localstorage-delete') return { jsExpr: call(localStorageDelete, args._[1]) };
  if (cmdName === 'localstorage-clear') return { jsExpr: call(localStorageClear) };
  if (cmdName === 'localstorage-list') return { jsExpr: call(localStorageList) };

  // ── sessionStorage ──
  if (cmdName === 'sessionstorage-get') return { jsExpr: call(sessionStorageGet, args._[1]) };
  if (cmdName === 'sessionstorage-set') return { jsExpr: call(sessionStorageSet, args._[1], args._.slice(2).join(' ')) };
  if (cmdName === 'sessionstorage-delete') return { jsExpr: call(sessionStorageDelete, args._[1]) };
  if (cmdName === 'sessionstorage-clear') return { jsExpr: call(sessionStorageClear) };
  if (cmdName === 'sessionstorage-list') return { jsExpr: call(sessionStorageList) };

  // ── Cookies ──
  if (cmdName === 'cookie-list') return { jsExpr: call(cookieList) };
  if (cmdName === 'cookie-get') return { jsExpr: call(cookieGet, args._[1]) };
  if (cmdName === 'cookie-set') return { jsExpr: call(cookieSet, args._[1], args._.slice(2).join(' ')) };
  if (cmdName === 'cookie-delete') return { jsExpr: call(cookieDelete, args._[1]) };
  if (cmdName === 'cookie-clear') return { jsExpr: call(cookieClear) };

  // ── Drag / Resize ──
  if (cmdName === 'drag' && args._[1] && args._[2]) return { jsExpr: call(dragDrop, args._[1], args._[2]) };
  if (cmdName === 'resize' && args._[1] && args._[2]) return { jsExpr: call(resizeViewport, args._[1], args._[2]) };

  // ── Console / Network ──
  if (cmdName === 'console') return { jsExpr: call(getConsoleMessages, args.clear) };
  if (cmdName === 'network') return { jsExpr: call(getNetworkRequests, args.clear, args.includeStatic) };

  // ── Dialog ──
  if (cmdName === 'dialog-accept') return { jsExpr: call(setDialogAccept) };
  if (cmdName === 'dialog-dismiss') return { jsExpr: call(setDialogDismiss) };

  // ── Routes ──
  if (cmdName === 'route' && args._[1]) return { jsExpr: call(addRoute, args._[1]) };
  if (cmdName === 'route-list') return { jsExpr: call(listRoutes) };
  if (cmdName === 'unroute' && args._[1]) return { jsExpr: call(removeRoute, args._[1]) };

  // ── Tracing ──
  if (cmdName === 'tracing-start') return { jsExpr: call(tracingStart) };
  if (cmdName === 'tracing-stop') return { jsExpr: call(tracingStop) };

  // ── Video ──
  if (cmdName === 'video-start') return { jsExpr: call(videoStart) };
  if (cmdName === 'video-stop') return { jsExpr: call(videoStop) };

  // ── Tabs ──
  if (cmdName === 'tab-list') return { jsExpr: call(tabList) };
  if (cmdName === 'tab-new') return { jsExpr: call(tabNew, args._[1]) };
  if (cmdName === 'tab-close') return { jsExpr: call(tabClose, args._[1] !== undefined ? parseInt(String(args._[1])) : undefined) };
  if (cmdName === 'tab-select') return { jsExpr: call(tabSelect, args._[1] !== undefined ? parseInt(String(args._[1])) : undefined) };

  return null;
}

// ─── Public API ─────────────────────────────────────────────────────────────

export interface ResolvedCommand {
  jsExpr: string;
}

/**
 * Resolve a keyword command string to a JavaScript expression.
 * Returns { jsExpr } for known pure-Playwright commands, or null if unrecognised.
 * The jsExpr expects `page` to be in scope.
 */
export function resolveCommand(input: string): ResolvedCommand | null {
  const args = parseInput(input.trim());
  if (!args) return null;
  return resolveArgs(args);
}
