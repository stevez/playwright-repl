/**
 * Completion data — builds the list of items for dropdown autocomplete.
 *
 * Sources: COMMANDS from resolve.mjs, ALIASES from parser.mjs,
 * plus REPL meta-commands (.help, .exit, etc.).
 */

import { COMMANDS } from './resolve.mjs';
import { ALIASES } from './parser.mjs';

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

// ─── Build completion items ──────────────────────────────────────────────────

/**
 * Returns a sorted array of `{ cmd, desc }` for all completable items:
 * commands, aliases (with "→ target" description), and meta-commands.
 */
export function buildCompletionItems() {
  const items = [];

  // Primary commands
  for (const [name, info] of Object.entries(COMMANDS)) {
    items.push({ cmd: name, desc: info.desc });
  }

  // Aliases — show "→ target" as description
  for (const [alias, target] of Object.entries(ALIASES)) {
    items.push({ cmd: alias, desc: `→ ${target}` });
  }

  // Meta-commands
  items.push(...META_COMMANDS);

  items.sort((a, b) => a.cmd.localeCompare(b.cmd));
  return items;
}
