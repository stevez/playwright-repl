/**
 * Completion data — builds the list of items for ghost completion.
 *
 * Sources: COMMANDS from resolve.ts plus REPL meta-commands (.help, .exit, etc.).
 */

import { COMMANDS } from './resolve.js';

// ─── Meta-commands ───────────────────────────────────────────────────────────

const META_COMMANDS = [
  { cmd: '.clear',     desc: 'Clear terminal output' },
  { cmd: '.help',      desc: 'Show available commands' },
  { cmd: '.aliases',   desc: 'Show command aliases' },
  { cmd: '.history',   desc: 'Show command history' },
  { cmd: '.history clear', desc: 'Clear command history' },
  { cmd: '.status',    desc: 'Show connection status' },
  { cmd: '.reconnect', desc: 'Reconnect to daemon' },
  { cmd: '.record',    desc: 'Start recording commands' },
  { cmd: '.save',      desc: 'Stop recording and save' },
  { cmd: '.pause',     desc: 'Pause/resume recording' },
  { cmd: '.discard',   desc: 'Discard current recording' },
  { cmd: '.replay',    desc: 'Replay a recorded session' },
  { cmd: '.exit',      desc: 'Exit REPL' },
];

const EXTRA_COMMANDS = [
  { cmd: 'highlight',       desc: 'Highlight matching elements' },
  { cmd: 'verify',          desc: 'Assert page state (title, url, text, element, value, list)' },
  { cmd: 'verify-text',     desc: 'Assert text is visible on page' },
  { cmd: 'verify-element',  desc: 'Assert element exists by role and name' },
  { cmd: 'verify-value',    desc: 'Assert input/select/checkbox value' },
  { cmd: 'verify-list',     desc: 'Assert list contains expected items' },
  { cmd: 'verify-title',    desc: 'Assert page title contains text' },
  { cmd: 'verify-url',      desc: 'Assert page URL contains text' },
  { cmd: 'verify-no-text',  desc: 'Assert text is not visible on page' },
  { cmd: 'verify-no-element', desc: 'Assert element does not exist' },
];

export interface CompletionItem {
  cmd: string;
  desc: string;
}

// ─── Build completion items ──────────────────────────────────────────────────

/**
 * Returns a sorted array of `{ cmd, desc }` for all completable items:
 * commands and meta-commands.
 */
export function buildCompletionItems() {
  const items = [];

  // Primary commands
  for (const [name, info] of Object.entries(COMMANDS)) {
    items.push({ cmd: name, desc: info.desc });
  }

  // Extra commands (not in COMMANDS but handled by REPL)
  items.push(...EXTRA_COMMANDS);

  // Meta-commands
  items.push(...META_COMMANDS);

  items.sort((a, b) => a.cmd.localeCompare(b.cmd));
  return items;
}
