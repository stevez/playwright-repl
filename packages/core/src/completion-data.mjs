/**
 * Completion data — builds the list of items for ghost completion.
 *
 * Sources: COMMANDS from resolve.mjs plus REPL meta-commands (.help, .exit, etc.).
 */

import { COMMANDS } from './resolve.mjs';

// ─── Meta-commands ───────────────────────────────────────────────────────────

const META_COMMANDS = [
  { cmd: '.help',      desc: 'Show available commands' },
  { cmd: '.aliases',   desc: 'Show command aliases' },
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
  { cmd: 'verify-text',    desc: 'Assert text is visible on page' },
  { cmd: 'verify-element', desc: 'Assert element exists by role and name' },
  { cmd: 'verify-value',   desc: 'Assert input/select/checkbox value' },
  { cmd: 'verify-list',    desc: 'Assert list contains expected items' },
];

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
