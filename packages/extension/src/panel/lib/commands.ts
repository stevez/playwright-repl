// ─── Command metadata ────────────────────────────────────────────────────────

interface CommandInfo {
    desc: string;
    usage?: string;
    examples?: string[];
}

export const COMMANDS: Record<string, CommandInfo> = {
    'check':                { desc: 'Check a checkbox', usage: 'check <text> | check <ref>' },
    'clear':                { desc: 'Clear the console' },
    'click':                { desc: 'Click an element', usage: 'click <text> | click <ref>',
                              examples: ['click "Submit"', 'click e5', 'click "Submit" --button right'] },
    'config-print':         { desc: 'Print config' },
    'console':              { desc: 'Console messages', usage: 'console [--clear]' },
    'cookie-clear':         { desc: 'Clear cookies' },
    'cookie-delete':        { desc: 'Delete cookie', usage: 'cookie-delete <name>' },
    'cookie-get':           { desc: 'Get cookie', usage: 'cookie-get <name>' },
    'cookie-list':          { desc: 'List cookies' },
    'cookie-set':           { desc: 'Set cookie', usage: 'cookie-set <name> <value>' },
    'dblclick':             { desc: 'Double-click', usage: 'dblclick <text> | dblclick <ref>' },
    'dialog-accept':        { desc: 'Accept dialog' },
    'dialog-dismiss':       { desc: 'Dismiss dialog' },
    'drag':                 { desc: 'Drag and drop', usage: 'drag <source> <target>' },
    'eval':                 { desc: 'Evaluate JavaScript', usage: 'eval <expression>',
                              examples: ['eval document.title'] },
    'export':               { desc: 'Export as Playwright test' },
    'fill':                 { desc: 'Fill a form field', usage: 'fill <text|ref> <value>',
                              examples: ['fill "Email" "user@test.com"', 'fill e3 "hello"'] },
    'go-back':              { desc: 'Go back' },
    'go-forward':           { desc: 'Go forward' },
    'goto':                 { desc: 'Navigate to a URL', usage: 'goto <url>',
                              examples: ['goto https://example.com'] },
    'help':                 { desc: 'Show available commands', usage: 'help [command]',
                              examples: ['help', 'help click'] },
    'highlight':            { desc: 'Highlight element on page', usage: 'highlight <text|selector>',
                              examples: ['highlight "Submit"', 'highlight .btn-primary'] },
    'history':              { desc: 'Show command history' },
    'history clear':        { desc: 'Clear command history' },
    'hover':                { desc: 'Hover over element', usage: 'hover <text> | hover <ref>' },
    'localstorage-clear':   { desc: 'Clear localStorage' },
    'localstorage-delete':  { desc: 'Delete localStorage', usage: 'localstorage-delete <key>' },
    'localstorage-get':     { desc: 'Get localStorage', usage: 'localstorage-get <key>' },
    'localstorage-list':    { desc: 'List localStorage' },
    'localstorage-set':     { desc: 'Set localStorage', usage: 'localstorage-set <key> <value>' },
    'network':              { desc: 'Network requests', usage: 'network [--clear] [--includeStatic]' },
    'open':                 { desc: 'Open the browser' },
    'pdf':                  { desc: 'Save as PDF', usage: 'pdf [--filename <file>]' },
    'press':                { desc: 'Press a keyboard key', usage: 'press <key> | press <ref> <key>',
                              examples: ['press Enter', 'press e5 Tab'] },
    'reload':               { desc: 'Reload page' },
    'resize':               { desc: 'Resize window', usage: 'resize <width> <height>' },
    'route':                { desc: 'Add network route' },
    'route-list':           { desc: 'List routes' },
    'run-code':             { desc: 'Run Playwright code', usage: 'run-code <code>' },
    'screenshot':           { desc: 'Take a screenshot', usage: 'screenshot [--filename <file>] [--fullPage]' },
    'select':               { desc: 'Select dropdown option', usage: 'select <text|ref> <value>',
                              examples: ['select "Country" "US"'] },
    'sessionstorage-clear': { desc: 'Clear sessionStorage' },
    'sessionstorage-delete':{ desc: 'Delete sessionStorage', usage: 'sessionstorage-delete <key>' },
    'sessionstorage-get':   { desc: 'Get sessionStorage', usage: 'sessionstorage-get <key>' },
    'sessionstorage-list':  { desc: 'List sessionStorage' },
    'sessionstorage-set':   { desc: 'Set sessionStorage', usage: 'sessionstorage-set <key> <value>' },
    'snapshot':             { desc: 'Accessibility snapshot', usage: 'snapshot [--filename <file>]' },
    'state-load':           { desc: 'Load storage state' },
    'state-save':           { desc: 'Save storage state', usage: 'state-save [--filename <file>]' },
    'tab-close':            { desc: 'Close tab', usage: 'tab-close [index]' },
    'tab-list':             { desc: 'List tabs' },
    'tab-new':              { desc: 'New tab', usage: 'tab-new [url]' },
    'tab-select':           { desc: 'Select tab', usage: 'tab-select <index>' },
    'type':                 { desc: 'Type text key by key', usage: 'type <text>',
                              examples: ['type "hello world"'] },
    'uncheck':              { desc: 'Uncheck a checkbox', usage: 'uncheck <text> | uncheck <ref>' },
    'unroute':              { desc: 'Remove route' },
    'upload':               { desc: 'Upload a file', usage: 'upload <ref> <filepath>' },
    'verify':               { desc: 'Assert page state', usage: 'verify <type> <args>',
                              examples: ['verify title "My Page"', 'verify text "Hello"', 'verify element button "Submit"'] },
    'verify-element':       { desc: 'Verify element exists by role', usage: 'verify-element <role> <name>' },
    'verify-no-element':    { desc: 'Verify element not exists', usage: 'verify-no-element <role> <name>' },
    'verify-no-text':       { desc: 'Verify text not visible', usage: 'verify-no-text <text>' },
    'verify-text':          { desc: 'Verify text visible', usage: 'verify-text <text>' },
    'verify-title':         { desc: 'Verify page title', usage: 'verify-title <text>' },
    'verify-url':           { desc: 'Verify page URL', usage: 'verify-url <text>' },
    'verify-value':         { desc: 'Verify input / checkbox / radio value', usage: 'verify-value <ref|text> <value>' },
    'verify-visible':       { desc: 'Verify element is visible by role', usage: 'verify-visible <role> <name>' },
};

export const COMMAND_NAMES = Object.keys(COMMANDS);

export const CATEGORIES: Record<string, string[]> = {
    'Navigation':     ['goto', 'open', 'go-back', 'go-forward', 'reload'],
    'Interaction':    ['click', 'dblclick', 'fill', 'type', 'press', 'hover', 'select', 'check', 'uncheck', 'drag'],
    'Verification':   ['verify', 'verify-text', 'verify-no-text', 'verify-title', 'verify-url', 'verify-element', 'verify-no-element', 'verify-value', 'verify-visible'],
    'Inspection':     ['snapshot', 'screenshot', 'eval', 'console', 'network', 'run-code'],
    'Tabs':           ['tab-list', 'tab-new', 'tab-close', 'tab-select'],
    'Cookies':        ['cookie-list', 'cookie-get', 'cookie-set', 'cookie-delete', 'cookie-clear'],
    'LocalStorage':   ['localstorage-list', 'localstorage-get', 'localstorage-set', 'localstorage-delete', 'localstorage-clear'],
    'SessionStorage': ['sessionstorage-list', 'sessionstorage-get', 'sessionstorage-set', 'sessionstorage-delete', 'sessionstorage-clear'],
    'State':          ['state-save', 'state-load'],
    'Other':          ['highlight', 'dialog-accept', 'dialog-dismiss', 'route', 'route-list', 'unroute', 'resize', 'pdf', 'upload', 'export', 'config-print'],
};

// ─── JavaScript mode help ────────────────────────────────────────────────────

export const JS_CATEGORIES: Record<string, string[]> = {
    'Navigation':   ['page.goto(url)', 'page.goBack()', 'page.reload()', '...'],
    'Locators':     ['page.getByRole(role)', 'page.getByText(text)', 'page.locator(sel)', 'page.getByTestId(id)', '...'],
    'Actions':      ['.click()', '.fill(value)', '.press(key)', '.hover()', '.selectOption(value)', '...'],
    'Query':        ['.textContent()', '.getAttribute(name)', '.isVisible()', '.count()', '...'],
    'Assertions':   ['expect(loc).toBeVisible()', '.toHaveText()', '.toHaveValue()', 'expect(page).toHaveTitle()', '.toHaveURL()', '...'],
    'Wait':         ['page.waitForSelector(sel)', 'page.waitForLoadState()', 'page.waitForURL(url)'],
    'Evaluate':     ['page.evaluate(() => expr)'],
    'Other':        ['page.screenshot()', 'page.keyboard.press(key)', 'page.mouse.click(x, y)', '...'],
};

// ─── Command parser ──────────────────────────────────────────────────────────
/**
 * Transforms human input into executable JavaScript expressions.
 *
 * Pipeline: tokenize → resolveArgs → DirectExecution or TabOperation
 *
 * resolveArgs returns either:
 *   - DirectExecution { jsExpr } — a JS string for swDebugEval (runs in SW where `page` is global)
 *   - TabOperation { tabOp, tabArgs } — handled by background.ts via chrome.tabs APIs
 */

import {
  verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  verifyVisible, verifyInputValue,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  actionByRole, fillByRole, selectByRole,
  highlightByText, highlightByRole, highlightBySelector, clearHighlight, chainAction, goBack, goForward,
  gotoUrl, reloadPage, waitMs, getTitle, getUrl,
  evalCode, runCode, takeScreenshot, takeSnapshot,
  refAction, pressKey, typeText,
  localStorageGet, localStorageSet, localStorageDelete, localStorageClear, localStorageList,
  sessionStorageGet, sessionStorageSet, sessionStorageDelete, sessionStorageClear, sessionStorageList,
  cookieList, cookieGet, cookieClear,
  tabList, tabNew, tabClose, tabSelect,
} from './page-scripts';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ParsedArgs {
  _: string[];
  nth?: string | number;
  [key: string]: unknown;
}

export interface DirectExecution {
  jsExpr: string;
}

export type ParseResult =
  | DirectExecution
  | { help: string }
  | { error: string };

function isDirect(result: ParsedArgs | DirectExecution): result is DirectExecution {
  return 'jsExpr' in result;
}

// ─── JS expression helpers ───────────────────────────────────────────────────

/** Serialize a value for inline JS — undefined becomes the literal `undefined` */
function ser(v: unknown): string {
  if (v === undefined) return 'undefined';
  return JSON.stringify(v);
}

/** Build a JS expression that calls a page-script function in the SW context (where `page` is global) */
function call(fn: any, ...args: unknown[]): string {
  return `await (${fn.toString()})(page, ${args.map(ser).join(', ')})`;
}

// ─── Known boolean options ───────────────────────────────────────────────────

const BOOLEAN_OPTIONS = new Set([
  'headed', 'persistent', 'extension', 'submit', 'clear',
  'fullPage', 'includeStatic', 'exact',
]);

// ─── Tokenizer ───────────────────────────────────────────────────────────────

/**
 * Tokenize input respecting quoted strings.
 * "fill e7 'hello world'" → ["fill", "e7", "hello world"]
 */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ' ' || ch === '\t') {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

// ─── Parse Input ─────────────────────────────────────────────────────────────

// Commands where everything after the keyword is a single raw argument
const RAW_COMMANDS = new Set(['run-code', 'eval']);

/**
 * Parse a REPL input line into a ParsedArgs object.
 * Handles tokenization and option extraction.
 */
function parseInput(line: string): ParsedArgs | null {
  const tokens = tokenize(line);
  if (tokens.length === 0) return null;

  tokens[0] = tokens[0].toLowerCase();

  // For run-code / eval, preserve the rest of the line as a single raw string
  if (RAW_COMMANDS.has(tokens[0])) {
    const cmdLen = line.match(/^\s*\S+/)![0].length;
    const rest = line.slice(cmdLen).trim();
    return rest ? { _: [tokens[0], rest] } : { _: [tokens[0]] };
  }

  // Simple option extraction (--key value or --flag)
  const positional: string[] = [];
  const opts: Record<string, unknown> = {};
  let i = 0;
  while (i < tokens.length) {
    if (tokens[i].startsWith('--')) {
      const key = tokens[i].slice(2);
      if (BOOLEAN_OPTIONS.has(key)) {
        opts[key] = true;
        i++;
      } else if (i + 1 < tokens.length && !tokens[i + 1].startsWith('--')) {
        opts[key] = tokens[i + 1];
        i += 2;
      } else {
        opts[key] = true;
        i++;
      }
    } else {
      positional.push(tokens[i]);
      i++;
    }
  }

  return { _: positional, ...opts } as ParsedArgs;
}

// ─── Resolve Args ─────────────────────────────────────────────────────────────

/**
 * Map parsed args to DirectExecution (jsExpr) or TabOperation.
 * Returns null if no mapping found (→ error).
 */
function resolveArgs(args: ParsedArgs): ParsedArgs | DirectExecution {
  const cmdName = args._[0];

  // ── Verify unified ──────────────────────────────────────────
  if (cmdName === 'verify') {
    const subType = args._[1];
    const rest = args._.slice(2);
    if (subType === 'title' && rest.length > 0)
      return { jsExpr: call(verifyTitle, rest.join(' ')) };
    if (subType === 'url' && rest.length > 0)
      return { jsExpr: call(verifyUrl, rest.join(' ')) };
    if (subType === 'text' && rest.length > 0)
      return { jsExpr: call(verifyText, rest.join(' ')) };
    if (subType === 'no-text' && rest.length > 0)
      return { jsExpr: call(verifyNoText, rest.join(' ')) };
    if (subType === 'element' && rest.length >= 2)
      return { jsExpr: call(verifyElement, rest[0], rest.slice(1).join(' ')) };
    if (subType === 'no-element' && rest.length >= 2)
      return { jsExpr: call(verifyNoElement, rest[0], rest.slice(1).join(' ')) };
    if (subType === 'value' && rest.length >= 2)
      return { jsExpr: call(verifyValue, rest[0], rest.slice(1).join(' ')) };
    if (subType === 'list' && rest.length >= 2)
      return { jsExpr: call(verifyList, rest[0], rest.slice(1)) };
  }

  // ── Legacy verify-* commands ────────────────────────────────
  const TEXT_VERIFY_CMDS = new Set(['verify-text', 'verify-no-text', 'verify-title', 'verify-url']);
  const ELEMENT_VERIFY_CMDS = new Set(['verify-element', 'verify-no-element', 'verify-visible']);
  const verifyFns: Record<string, any> = {
    'verify-text': verifyText,
    'verify-element': verifyElement,
    'verify-visible': verifyVisible,
    'verify-value': verifyValue,
    'verify-list': verifyList,
    'verify-title': verifyTitle,
    'verify-url': verifyUrl,
    'verify-no-text': verifyNoText,
    'verify-no-element': verifyNoElement,
  };
  if (verifyFns[cmdName]) {
    const pos = args._.slice(1);
    const fn = verifyFns[cmdName];
    if (TEXT_VERIFY_CMDS.has(cmdName)) {
      const text = pos.join(' ');
      if (text) return { jsExpr: call(fn, text) };
    } else if (ELEMENT_VERIFY_CMDS.has(cmdName)) {
      if (pos[0] && pos.length >= 2) return { jsExpr: call(fn, pos[0], pos.slice(1).join(' ')) };
    } else if (cmdName === 'verify-value' && pos[0] && pos.length >= 2) {
      const isRef = /^e\d+$/.test(pos[0]);
      const valueFn = isRef ? verifyValue : verifyInputValue;
      return { jsExpr: call(valueFn, pos[0], pos.slice(1).join(' ')) };
    } else if (pos[0] && pos.length >= 2) {
      const rest = cmdName === 'verify-list' ? pos.slice(1) : pos.slice(1).join(' ');
      return { jsExpr: call(fn, pos[0], rest) };
    }
  }

  // ── Navigation ──────────────────────────────────────────────
  if (cmdName === 'goto' || cmdName === 'open') {
    const url = args._[1];
    if (!url) return args; // let error bubble
    return { jsExpr: call(gotoUrl, url) };
  }
  if (cmdName === 'reload')
    return { jsExpr: call(reloadPage) };
  if (cmdName === 'go-back')
    return { jsExpr: call(goBack) };
  if (cmdName === 'go-forward')
    return { jsExpr: call(goForward) };

  // ── Page info ───────────────────────────────────────────────
  if (cmdName === 'title')
    return { jsExpr: call(getTitle) };
  if (cmdName === 'url')
    return { jsExpr: call(getUrl) };

  // ── Wait ────────────────────────────────────────────────────
  if (cmdName === 'wait') {
    const ms = parseInt(args._[1]) || 1000;
    return { jsExpr: call(waitMs, ms) };
  }

  // ── Eval ────────────────────────────────────────────────────
  if (cmdName === 'eval') {
    const code = args._[1] || '';
    return { jsExpr: call(evalCode, code) };
  }

  // ── Run code (normally intercepted by run.ts before reaching executeCommand) ──
  if (cmdName === 'run-code') {
    const code = args._[1] || '';
    return { jsExpr: call(runCode, code) };
  }

  // ── Screenshot ──────────────────────────────────────────────
  // Wrapped in JSON.stringify so bridge.ts can detect the __image result
  if (cmdName === 'screenshot')
    return { jsExpr: `JSON.stringify(await (${takeScreenshot.toString()})(page, ${!!(args.fullPage)}))` };

  // ── Snapshot ────────────────────────────────────────────────
  if (cmdName === 'snapshot')
    return { jsExpr: call(takeSnapshot) };

  // ── Highlight ───────────────────────────────────────────────
  if (cmdName === 'highlight') {
    if (args.clear) return { jsExpr: call(clearHighlight) };
    const loc = args._[1];
    if (loc) {
      const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
      const exact = args.exact ? true : undefined;
      const isSelector = /[.#[\]>:=]/.test(loc);
      // highlight <role> "<name>" → getByRole(role, { name })
      if (!isSelector && args._.length >= 3 && /^[a-z]+$/.test(loc)) {
        const name = args._.slice(2).join(' ');
        return { jsExpr: call(highlightByRole, loc, name, nth) };
      }
      return isSelector
        ? { jsExpr: call(highlightBySelector, loc, nth) }
        : { jsExpr: call(highlightByText, loc, nth, exact) };
    }
  }

  // ── >> chaining ─────────────────────────────────────────────
  const LOCATOR_ACTIONS: Record<string, string> = {
    click: 'click', dblclick: 'dblclick', hover: 'hover',
    check: 'check', uncheck: 'uncheck',
    fill: 'fill', select: 'selectOption',
  };
  if (LOCATOR_ACTIONS[cmdName] && args._.some(a => a.includes('>>'))) {
    const action = LOCATOR_ACTIONS[cmdName];
    const positional = args._.slice(1);

    let lastChainIdx = -1;
    for (let i = 0; i < positional.length; i++) {
      if (positional[i] === '>>' || positional[i].includes('>>')) lastChainIdx = i;
    }
    const selectorEnd = positional[lastChainIdx] !== '>>' && positional[lastChainIdx]?.includes('>>')
      ? lastChainIdx
      : lastChainIdx + 1;
    const selector = positional.slice(0, selectorEnd + 1).join(' ');
    const rest = positional.slice(selectorEnd + 1).join(' ');

    return { jsExpr: call(chainAction, selector, action, rest || undefined) };
  }

  // ── Role-based locators (e.g. click tab "npm" --nth 0) ─────
  const ROLE_ACTIONS: Record<string, string> = {
    click: 'click', dblclick: 'dblclick', hover: 'hover',
    check: 'check', uncheck: 'uncheck',
  };
  if (args._.length >= 3 && args._[1] && /^[a-z]+$/.test(args._[1]) && !args._.some(a => a.includes('>>'))) {
    const role = args._[1];
    const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
    if (ROLE_ACTIONS[cmdName]) {
      const name = args._.slice(2).join(' ');
      return { jsExpr: call(actionByRole, role, name, ROLE_ACTIONS[cmdName], nth) };
    }
    if (cmdName === 'fill') {
      return { jsExpr: call(fillByRole, role, args._[2], args._.slice(3).join(' ') || '', nth) };
    }
    if (cmdName === 'select') {
      return { jsExpr: call(selectByRole, role, args._[2], args._.slice(3).join(' ') || '', nth) };
    }
  }

  // ── Text locators ───────────────────────────────────────────
  const textFns: Record<string, any> = {
    click: actionByText, dblclick: actionByText, hover: actionByText,
    fill: fillByText, select: selectByText,
    check: checkByText, uncheck: uncheckByText,
  };
  if (textFns[cmdName] && args._[1] && !/^e\d+$/.test(args._[1]) && !args._.some(a => a.includes('>>'))) {
    const textArg = args._[1];
    const extraArgs = args._.slice(2);
    const fn = textFns[cmdName];
    const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
    const exact = args.exact ? true : undefined;
    if (fn === actionByText)
      return { jsExpr: call(fn, textArg, cmdName, nth, exact) };
    if (cmdName === 'fill' || cmdName === 'select')
      return { jsExpr: call(fn, textArg, extraArgs[0] || '', nth, exact) };
    return { jsExpr: call(fn, textArg, nth, exact) };
  }

  // ── Ref-based actions (e5, e7, ...) ─────────────────────────
  const REF_ACTIONS: Record<string, string> = {
    click: 'click', dblclick: 'dblclick', hover: 'hover',
    check: 'check', uncheck: 'uncheck',
    fill: 'fill', select: 'selectOption', type: 'fill',
  };
  if (REF_ACTIONS[cmdName] && args._[1] && /^e\d+$/.test(args._[1])) {
    const ref = args._[1];
    const action = REF_ACTIONS[cmdName];
    const value = args._.slice(2).join(' ') || undefined;
    return { jsExpr: call(refAction, ref, action, value) };
  }

  // ── Press ───────────────────────────────────────────────────
  if (cmdName === 'press') {
    const pos = args._.slice(1);
    if (pos.length === 1) {
      return { jsExpr: call(pressKey, pos[0], pos[0]) };
    }
    if (pos.length >= 2) {
      return { jsExpr: call(pressKey, pos[0], pos[1]) };
    }
  }

  // ── Type ────────────────────────────────────────────────────
  if (cmdName === 'type') {
    const text = args._.slice(1).join(' ');
    if (text) return { jsExpr: call(typeText, text) };
  }

  // ── localStorage ────────────────────────────────────────────
  if (cmdName === 'localstorage-get')
    return { jsExpr: call(localStorageGet, args._[1]) };
  if (cmdName === 'localstorage-set')
    return { jsExpr: call(localStorageSet, args._[1], args._.slice(2).join(' ')) };
  if (cmdName === 'localstorage-delete')
    return { jsExpr: call(localStorageDelete, args._[1]) };
  if (cmdName === 'localstorage-clear')
    return { jsExpr: call(localStorageClear) };
  if (cmdName === 'localstorage-list')
    return { jsExpr: call(localStorageList) };

  // ── sessionStorage ──────────────────────────────────────────
  if (cmdName === 'sessionstorage-get')
    return { jsExpr: call(sessionStorageGet, args._[1]) };
  if (cmdName === 'sessionstorage-set')
    return { jsExpr: call(sessionStorageSet, args._[1], args._.slice(2).join(' ')) };
  if (cmdName === 'sessionstorage-delete')
    return { jsExpr: call(sessionStorageDelete, args._[1]) };
  if (cmdName === 'sessionstorage-clear')
    return { jsExpr: call(sessionStorageClear) };
  if (cmdName === 'sessionstorage-list')
    return { jsExpr: call(sessionStorageList) };

  // ── Cookies ─────────────────────────────────────────────────
  if (cmdName === 'cookie-list')
    return { jsExpr: call(cookieList) };
  if (cmdName === 'cookie-get')
    return { jsExpr: call(cookieGet, args._[1]) };
  if (cmdName === 'cookie-clear')
    return { jsExpr: call(cookieClear) };

  // ── Tabs ────────────────────────────────────────────────────
  if (cmdName === 'tab-list')
    return { jsExpr: call(tabList) };
  if (cmdName === 'tab-new')
    return { jsExpr: call(tabNew, args._[1]) };
  if (cmdName === 'tab-close') {
    const idx = args._[1] ? parseInt(args._[1]) : undefined;
    return { jsExpr: call(tabClose, idx) };
  }
  if (cmdName === 'tab-select') {
    const idx = args._[1] ? parseInt(args._[1]) : NaN;
    if (isNaN(idx)) return args; // let error bubble
    return { jsExpr: call(tabSelect, idx) };
  }

  return args;
}

// ─── Main entry point ────────────────────────────────────────────────────────

export function parseReplCommand(input: string): ParseResult {
  const tokens = tokenize(input.trim());
  if (tokens.length === 0) return { error: 'Empty command' };

  // Parse input (tokenize + alias + options)
  const args = parseInput(input);
  if (!args) return { error: 'Empty command' };

  // Resolve to DirectExecution, TabOperation, or unrecognised ParsedArgs
  const resolved = resolveArgs(args);

  // DirectExecution
  if (isDirect(resolved)) return resolved;

  // Unknown command
  const cmdName = args._[0];
  return { error: `Unknown command: "${cmdName}". Type "help" for commands.` };
}
