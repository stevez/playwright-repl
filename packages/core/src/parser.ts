/**
 * Input parser — transforms human input into minimist-style args.
 *
 * Flow: "c e5" → alias resolve → ["click", "e5"] → minimist → { _: ["click", "e5"] }
 *
 * The resulting object is sent to the daemon as-is. The daemon runs
 * parseCliCommand() which maps it to a tool call.
 */

import { minimist, COMMANDS } from './resolve.js';
import type { ParsedArgs } from './engine.js';

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
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '--in' && i + 2 < tokens.length && !tokens[i + 1].startsWith('--') && !tokens[i + 2].startsWith('--')) {
      tokens.splice(i, 3, '--in-role', tokens[i + 1], '--in-text', tokens[i + 2]);
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
