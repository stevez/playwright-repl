/**
 * Input parser — transforms human input into minimist-style args.
 *
 * Flow: "c e5" → alias resolve → ["click", "e5"] → minimist → { _: ["click", "e5"] }
 *
 * The resulting object is sent to the daemon as-is. The daemon runs
 * parseCliCommand() which maps it to a tool call.
 */

import { minimist, COMMANDS } from './resolve.js';
import {
  buildRunCode, verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  verifyVisible, verifyInputValue, waitForText,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  actionByRole, fillByRole, selectByRole, pressKeyByRole,
} from './page-scripts.js';
import type { ParsedArgs } from './types.js';

// ─── Command aliases ─────────────────────────────────────────────────────────

export const ALIASES: Record<string, string> = {
  // Navigation
  'o':    'open',
  'g':    'goto',
  'go':   'goto',
  'back': 'go-back',
  'fwd':  'go-forward',
  'r':    'reload',

  // Interaction
  'c':    'click',
  'dc':   'dblclick',
  't':    'type',
  'f':    'fill',
  'h':    'hover',
  'p':    'press',
  'sel':  'select',
  'chk':  'check',
  'unchk':'uncheck',

  // Inspection
  'hl':   'highlight',
  's':    'snapshot',
  'snap': 'snapshot',
  'ss':   'screenshot',
  'e':    'eval',
  'con':  'console',
  'net':  'network',

  // Tabs
  'tl':   'tab-list',
  'tn':   'tab-new',
  'tc':   'tab-close',
  'ts':   'tab-select',

  // Assertions
  'v':    'verify',
  'vt':   'verify-text',
  've':   'verify-element',
  'vv':   'verify-value',
  'vl':   'verify-list',

  // Session
  'q':    'close',
  'ls':   'list',
};

// ─── Known boolean options ───────────────────────────────────────────────────

export const booleanOptions = new Set([
  'headed', 'persistent', 'extension', 'submit', 'clear',
  'fullPage', 'static', 'exact',
]);

// ─── All known commands ──────────────────────────────────────────────────────

export const ALL_COMMANDS: string[] = Object.keys(COMMANDS);

// ─── Tokenizer ───────────────────────────────────────────────────────────────

/**
 * Tokenize input respecting quoted strings.
 * "fill e7 'hello world'" → ["fill", "e7", "hello world"]
 */
function tokenize(line: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuote: string | null = null;
  // Track parenthesis depth — inside parens, whitespace and quotes are preserved
  // so CSS locators like `div:has-text("RFCP")` stay as a single token.
  let parenDepth = 0;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === inQuote) {
        inQuote = null;
        // Quotes inside parens are part of the CSS syntax — keep them
        if (parenDepth > 0) current += ch;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
      // Quotes inside parens are part of the CSS syntax — keep them
      if (parenDepth > 0) current += ch;
    } else if (ch === '(') {
      parenDepth++;
      current += ch;
    } else if (ch === ')') {
      parenDepth = Math.max(0, parenDepth - 1);
      current += ch;
    } else if ((ch === ' ' || ch === '\t') && parenDepth === 0) {
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

// ─── Main parse function ─────────────────────────────────────────────────────

/**
 * Parse a REPL input line into a minimist args object ready for the daemon.
 * Returns null if the line is empty.
 */
// Commands where everything after the keyword is a single raw argument
const RAW_COMMANDS = new Set(['run-code', 'eval']);

export function parseInput(line: string): ParsedArgs | null {
  const tokens = tokenize(line);
  if (tokens.length === 0) return null;

  // Resolve alias
  const cmd = tokens[0].toLowerCase();
  if (ALIASES[cmd]) tokens[0] = ALIASES[cmd];

  // For run-code / eval, preserve the rest of the line as a single raw string
  if (RAW_COMMANDS.has(tokens[0])) {
    const cmdLen = line.match(/^\s*\S+/)![0].length;
    const rest = line.slice(cmdLen).trim();
    return rest ? { _: [tokens[0], rest] } : { _: [tokens[0]] };
  }

  // Pre-process --in <role> <text> → --in-role <role> --in-text <text>
  // Or --in <text> → --in-text <text> (text-only, no role)
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '--in' && i + 2 < tokens.length && !tokens[i + 1].startsWith('--') && !tokens[i + 2].startsWith('--') && /^[a-z]+$/.test(tokens[i + 1])) {
      tokens.splice(i, 3, '--in-role', tokens[i + 1], '--in-text', tokens[i + 2]);
      break;
    }
    if (tokens[i] === '--in' && i + 1 < tokens.length && !tokens[i + 1].startsWith('--') && !/^[a-z]+$/.test(tokens[i + 1])) {
      // Text-only --in: keep in-text only, page-scripts will try common roles
      tokens.splice(i, 2, '--in-text', tokens[i + 1]);
      break;
    }
  }

  // Parse with minimist (same lib and boolean set as playwright-cli)
  const args = minimist(tokens, { boolean: [...booleanOptions] }) as ParsedArgs;

  // Stringify non-boolean values (playwright-cli does this)
  for (const key of Object.keys(args)) {
    if (key === '_') continue;
    if (typeof args[key] !== 'boolean')
      args[key] = String(args[key]);
  }
  for (let i = 0; i < args._.length; i++)
    args._[i] = String(args._[i]);

  // Remove boolean options set to false that weren't explicitly passed.
  // minimist sets all declared booleans to false by default, but the
  // daemon rejects unknown options like --headed false.
  for (const opt of booleanOptions) {
    if (args[opt] === false) {
      const hasExplicitNo = tokens.some(t => t === `--no-${opt}`);
      if (!hasExplicitNo) delete args[opt];
    }
  }

  return args;
}

// ─── REPL-level argument transformations ────────────────────────────────────

type PageScriptFn = (...args: unknown[]) => Promise<void>;

/**
 * Apply the same transformations the CLI REPL does before engine.run():
 *   - Verify commands → run-code with page scripts
 *   - Text locators → run-code with actionByText/fillByText/etc.
 *   - Auto-wrap run-code body with async (page) => { ... }
 */
export function resolveArgs(args: ParsedArgs): ParsedArgs {
  const cmdName = args._[0];
  const frameSel = args.frame ? String(args.frame) : undefined;

  // ── Unified verify command → run-code translation ──────────
  if (cmdName === 'verify') {
    const subType = args._[1];
    const rest = args._.slice(2);
    let translated: ParsedArgs | null = null;
    if (subType === 'title' && rest.length > 0)
      translated = buildRunCode(verifyTitle as PageScriptFn, rest.join(' '));
    else if (subType === 'url' && rest.length > 0)
      translated = buildRunCode(verifyUrl as PageScriptFn, rest.join(' '));
    else if (subType === 'text' && rest.length > 0)
      translated = buildRunCode(verifyText as PageScriptFn, rest.join(' '));
    else if (subType === 'no-text' && rest.length > 0)
      translated = buildRunCode(verifyNoText as PageScriptFn, rest.join(' '));
    else if (subType === 'element' && rest.length >= 2)
      translated = buildRunCode(verifyElement as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'no-element' && rest.length >= 2)
      translated = buildRunCode(verifyNoElement as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'value' && rest.length >= 2)
      translated = buildRunCode(verifyValue as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'visible' && rest.length >= 2)
      translated = buildRunCode(verifyVisible as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'input-value' && rest.length >= 2)
      translated = buildRunCode(verifyInputValue as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'list' && rest.length >= 2)
      translated = buildRunCode(verifyList as PageScriptFn, rest[0], rest.slice(1));
    if (translated) args = translated;
  }

  // ── Legacy verify-* commands (backward compat) ─────────────
  const verifyFns: Record<string, PageScriptFn> = {
    'verify-text': verifyText as PageScriptFn,
    'verify-element': verifyElement as PageScriptFn,
    'verify-value': verifyValue as PageScriptFn,
    'verify-visible': verifyVisible as PageScriptFn,
    'verify-input-value': verifyInputValue as PageScriptFn,
    'verify-list': verifyList as PageScriptFn,
    'verify-title': verifyTitle as PageScriptFn,
    'verify-url': verifyUrl as PageScriptFn,
    'verify-no-text': verifyNoText as PageScriptFn,
    'verify-no-element': verifyNoElement as PageScriptFn,
  };
  if (verifyFns[cmdName]) {
    const pos = args._.slice(1);
    const fn = verifyFns[cmdName];
    let translated: ParsedArgs | null = null;
    if (cmdName === 'verify-text' || cmdName === 'verify-no-text' || cmdName === 'verify-title' || cmdName === 'verify-url') {
      const text = pos.join(' ');
      if (text) translated = buildRunCode(fn, text);
    } else if (cmdName === 'verify-no-element' || cmdName === 'verify-element' || cmdName === 'verify-visible') {
      if (pos[0] && pos.length >= 2) translated = buildRunCode(fn, pos[0], pos.slice(1).join(' '));
    } else if (pos[0] && pos.length >= 2) {
      const rest = cmdName === 'verify-list' ? pos.slice(1) : pos.slice(1).join(' ');
      translated = buildRunCode(fn, pos[0], rest);
    }
    if (translated) args = translated;
  }

  // ── wait-for-text → run-code with polling ──────────────────
  if (cmdName === 'wait-for-text') {
    const text = args._.slice(1).join(' ');
    if (text) args = buildRunCode(waitForText as PageScriptFn, text);
  }

  // ── Auto-resolve role-based to native Playwright locator ──
  const ROLE_ACTIONS: Record<string, string> = {
    click: 'click', dblclick: 'dblclick', hover: 'hover',
    check: 'check', uncheck: 'uncheck',
  };
  if (args._.length >= 3 && args._[1] && /^[a-z]+$/.test(args._[1]) && !args._.some(a => a.includes('>>'))) {
    const role = args._[1];
    const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
    const inRole = args['in-role'] !== undefined ? String(args['in-role']) : undefined;
    const inText = args['in-text'] !== undefined ? String(args['in-text']) : undefined;
    if (ROLE_ACTIONS[cmdName]) {
      const name = args._.slice(2).join(' ');
      args = buildRunCode(actionByRole as PageScriptFn, role, name, ROLE_ACTIONS[cmdName], nth, inRole, inText);
    } else if (cmdName === 'fill') {
      const name = args._[2];
      const value = args._.slice(3).join(' ') || '';
      args = buildRunCode(fillByRole as PageScriptFn, role, name, value, nth, inRole, inText);
    } else if (cmdName === 'select') {
      const name = args._[2];
      const value = args._.slice(3).join(' ') || '';
      args = buildRunCode(selectByRole as PageScriptFn, role, name, value, nth, inRole, inText);
    } else if (cmdName === 'press') {
      const name = args._[2];
      const key = args._.slice(3).join(' ') || '';
      args = buildRunCode(pressKeyByRole as PageScriptFn, role, name, key, nth, inRole, inText);
    }
  }

  // ── Auto-resolve text to native Playwright locator ─────────
  const textFns: Record<string, PageScriptFn> = {
    click: actionByText as PageScriptFn, dblclick: actionByText as PageScriptFn, hover: actionByText as PageScriptFn,
    fill: fillByText as PageScriptFn, select: selectByText as PageScriptFn, check: checkByText as PageScriptFn, uncheck: uncheckByText as PageScriptFn,
  };
  if (textFns[cmdName] && args._[0] !== 'run-code' && args._[1] && !/^e\d+$/.test(args._[1]) && !args._.some(a => a.includes('>>'))) {
    const textArg = args._[1];
    const extraArgs = args._.slice(2);
    const fn = textFns[cmdName];
    const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
    const exact = args.exact === true ? true : undefined;
    if (fn === actionByText) args = buildRunCode(fn, textArg, cmdName, nth, exact);
    else if (cmdName === 'fill' || cmdName === 'select') args = buildRunCode(fn, textArg, extraArgs[0] || '', nth, exact);
    else args = buildRunCode(fn, textArg, nth, exact);
  }

  // ── go-back / go-forward → evaluate history.back/forward ──
  if (cmdName === 'go-back') {
    args = { _: ['run-code', 'async (page) => { await page.evaluate(() => history.back()); return "Navigated back"; }'] };
  }
  if (cmdName === 'go-forward') {
    args = { _: ['run-code', 'async (page) => { await page.evaluate(() => history.forward()); return "Navigated forward"; }'] };
  }

  // ── Auto-wrap run-code body with async (page) => { ... } ──
  if (cmdName === 'run-code' && args._[1] && !args._[1].startsWith('async')) {
    const STMT = /^(await|return|const|let|var|for|if|while|throw|try)\b/;
    const body = !args._[1].includes(';') && !STMT.test(args._[1])
      ? `return await ${args._[1]}`
      : args._[1];
    args = { _: ['run-code', `async (page) => { ${body} }`] };
  }

  // ── --frame: wrap run-code to operate inside an iframe ──
  if (frameSel && args._[0] === 'run-code' && args._[1]) {
    const inner = args._[1];
    // Wrap: resolve the frame, then call the inner function with the frame as "page"
    args = { _: ['run-code', `async (page) => { const __frame = await page.locator(${JSON.stringify(frameSel)}).contentFrame(); return await (${inner})(__frame); }`] };
  }

  return args;
}
