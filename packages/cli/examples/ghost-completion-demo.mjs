#!/usr/bin/env node
/**
 * Ghost completion demo — standalone test for inline suggestions.
 *
 * Run:  node examples/ghost-completion-demo.mjs
 *
 * Type a prefix (e.g. "go") and see dimmed suggestion text.
 * Tab cycles through matches, Right Arrow accepts.
 */

import readline from 'node:readline';

const COMMANDS = [
  'click', 'check', 'close', 'console', 'cookie-get', 'cookie-list',
  'dblclick', 'drag', 'eval', 'fill', 'goto', 'go-back', 'go-forward',
  'hover', 'network', 'open', 'press', 'reload', 'screenshot', 'select',
  'snapshot', 'type', 'uncheck', 'upload',
  '.help', '.aliases', '.status', '.exit',
];

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '\x1b[36mpw>\x1b[0m ',
});

// ─── Ghost completion via _ttyWrite ─────────────────────────────────────────

let ghost = '';
let matches = [];
let matchIdx = 0;

function getMatches(input) {
  if (input.length > 0 && !input.includes(' ')) {
    return COMMANDS.filter(cmd => cmd.startsWith(input) && cmd !== input);
  }
  return [];
}

function renderGhost(suffix) {
  ghost = suffix;
  rl.output.write(`\x1b[2m${ghost}\x1b[0m\x1b[${ghost.length}D`);
}

const origTtyWrite = rl._ttyWrite.bind(rl);
rl._ttyWrite = function (s, key) {
  if (ghost && key) {
    // Right-arrow-at-end accepts ghost suggestion
    if (key.name === 'right' && rl.cursor === rl.line.length) {
      const text = ghost;
      rl.output.write('\x1b[K');
      ghost = '';
      matches = [];
      rl._insertString(text);
      return;
    }

    // Tab cycles through matches (or accepts if only one)
    if (key.name === 'tab') {
      if (matches.length > 1) {
        rl.output.write('\x1b[K');
        matchIdx = (matchIdx + 1) % matches.length;
        const input = rl.line || '';
        renderGhost(matches[matchIdx].slice(input.length));
        return;
      }
      // Single match — accept it
      const text = ghost;
      rl.output.write('\x1b[K');
      ghost = '';
      matches = [];
      rl._insertString(text);
      return;
    }
  }

  // Tab on empty input — show all commands as ghost suggestions
  if (key && key.name === 'tab') {
    if ((rl.line || '') === '') {
      matches = COMMANDS;
      matchIdx = 0;
      renderGhost(matches[0]);
    }
    return;
  }

  // Clear existing ghost text before readline processes the key
  if (ghost) {
    rl.output.write('\x1b[K');
    ghost = '';
  }

  // Let readline handle the key normally
  origTtyWrite(s, key);

  // Render new ghost text if cursor is at end of line
  const input = rl.line || '';
  matches = getMatches(input);
  matchIdx = 0;
  if (matches.length > 0 && rl.cursor === rl.line.length) {
    renderGhost(matches[0].slice(input.length));
  }
};

// ─── REPL loop ──────────────────────────────────────────────────────────────

console.log('Ghost completion demo — Tab cycles matches, Right Arrow accepts\n');
rl.prompt();

rl.on('line', (line) => {
  if (line.trim() === '.exit') {
    rl.close();
    return;
  }
  console.log(`  → ${line.trim() || '(empty)'}`);
  rl.prompt();
});

rl.on('close', () => {
  console.log('\nBye!');
  process.exit(0);
});
