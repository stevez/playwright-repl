/**
 * Input parser — transforms human input into minimist-style args.
 *
 * Flow: "c e5" → alias resolve → ["click", "e5"] → minimist → { _: ["click", "e5"] }
 *
 * The resulting object is sent to the daemon as-is. The daemon runs
 * parseCliCommand() which maps it to a tool call.
 */

import { minimist, COMMANDS } from './resolve.mjs';

// ─── Command aliases ─────────────────────────────────────────────────────────

export const ALIASES = {
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

  // Assertions (Phase 2 — mapped to daemon tools that exist but have no CLI keywords)
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
  'fullPage', 'includeStatic',
]);

// ─── All known commands ──────────────────────────────────────────────────────

export const ALL_COMMANDS = Object.keys(COMMANDS);

// ─── Tokenizer ───────────────────────────────────────────────────────────────

/**
 * Tokenize input respecting quoted strings.
 * "fill e7 'hello world'" → ["fill", "e7", "hello world"]
 */
function tokenize(line) {
  const tokens = [];
  let current = '';
  let inQuote = null;

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

// ─── Main parse function ─────────────────────────────────────────────────────

/**
 * Parse a REPL input line into a minimist args object ready for the daemon.
 * Returns null if the line is empty.
 */
export function parseInput(line) {
  const tokens = tokenize(line);
  if (tokens.length === 0) return null;

  // Resolve alias
  const cmd = tokens[0].toLowerCase();
  if (ALIASES[cmd]) tokens[0] = ALIASES[cmd];

  // Parse with minimist (same lib and boolean set as playwright-cli)
  const args = minimist(tokens, { boolean: [...booleanOptions] });

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
