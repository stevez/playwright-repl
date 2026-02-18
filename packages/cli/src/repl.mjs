/**
 * Main REPL loop.
 *
 * Handles readline, command queue, meta-commands, and session management.
 */

import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  replVersion, parseInput, ALIASES, ALL_COMMANDS, buildCompletionItems, c,
  buildRunCode, verifyText, verifyElement, verifyValue, verifyList,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  Engine,
} from '@playwright-repl/core';
import { SessionManager } from './recorder.mjs';

// ─── Response filtering ─────────────────────────────────────────────────────

export function filterResponse(text) {
  const sections = text.split(/^### /m).slice(1);
  const kept = [];
  for (const section of sections) {
    const newline = section.indexOf('\n');
    if (newline === -1) continue;
    const title = section.substring(0, newline).trim();
    const content = section.substring(newline + 1).trim();
    if (title === 'Error')
      kept.push(`${c.red}${content}${c.reset}`);
    else if (title === 'Result' || title === 'Modal state')
      kept.push(content);
  }
  return kept.length > 0 ? kept.join('\n') : null;
}

// ─── Meta-command handlers ──────────────────────────────────────────────────

export function showHelp() {
  console.log(`\n${c.bold}Available commands:${c.reset}`);
  const categories = {
    'Navigation': ['open', 'goto', 'go-back', 'go-forward', 'reload'],
    'Interaction': ['click', 'dblclick', 'fill', 'type', 'press', 'hover', 'select', 'check', 'uncheck', 'drag'],
    'Inspection': ['snapshot', 'screenshot', 'eval', 'console', 'network', 'run-code'],
    'Tabs': ['tab-list', 'tab-new', 'tab-close', 'tab-select'],
    'Storage': ['cookie-list', 'cookie-get', 'localstorage-list', 'localstorage-get', 'state-save', 'state-load'],
  };
  for (const [cat, cmds] of Object.entries(categories)) {
    console.log(`  ${c.bold}${cat}:${c.reset} ${cmds.join(', ')}`);
  }
  console.log(`\n  ${c.dim}Use .aliases for shortcuts, or type any command with --help${c.reset}`);
  console.log(`\n${c.bold}REPL meta-commands:${c.reset}`);
  console.log(`  .aliases              Show command aliases`);
  console.log(`  .status               Show connection status`);
  console.log(`  .reconnect            Restart browser`);
  console.log(`  .record [filename]    Start recording commands`);
  console.log(`  .save                 Stop recording and save`);
  console.log(`  .pause                Pause/resume recording`);
  console.log(`  .discard              Discard recording`);
  console.log(`  .replay <filename>    Replay a recorded session`);
  console.log(`  .exit                 Exit REPL\n`);
}

export function showAliases() {
  console.log(`\n${c.bold}Command aliases:${c.reset}`);
  const groups = {};
  for (const [alias, cmd] of Object.entries(ALIASES)) {
    if (!groups[cmd]) groups[cmd] = [];
    groups[cmd].push(alias);
  }
  for (const [cmd, aliases] of Object.entries(groups).sort()) {
    console.log(`  ${c.cyan}${aliases.join(', ')}${c.reset} → ${cmd}`);
  }
  console.log();
}

export function showStatus(ctx) {
  const { conn, session } = ctx;
  console.log(`Connected: ${conn.connected ? `${c.green}yes${c.reset}` : `${c.red}no${c.reset}`}`);
  console.log(`Commands sent: ${ctx.commandCount}`);
  console.log(`Mode: ${session.mode}`);
  if (session.mode === 'recording' || session.mode === 'paused') {
    console.log(`Recording: ${c.red}⏺${c.reset} ${session.recordingFilename} (${session.recordedCount} commands${session.mode === 'paused' ? ', paused' : ''})`);
  }
}

// ─── Session-level commands ─────────────────────────────────────────────────

export async function handleKillAll(ctx) {
  try {
    await ctx.conn.close();
    console.log(`${c.green}✓${c.reset} Browser closed`);
  } catch (err) {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
  }
}

export async function handleClose(ctx) {
  try {
    await ctx.conn.close();
    console.log(`${c.green}✓${c.reset} Browser closed`);
  } catch (err) {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
  }
}

// ─── Session meta-commands (.record, .save, .pause, .discard, .replay) ──────

export function handleSessionCommand(ctx, line) {
  const { session } = ctx;

  if (line.startsWith('.record')) {
    const filename = line.split(/\s+/)[1] || undefined;
    const file = session.startRecording(filename);
    console.log(`${c.red}⏺${c.reset} Recording to ${c.bold}${file}${c.reset}`);
    ctx.rl.setPrompt(promptStr(ctx));
    return true;
  }

  if (line === '.save') {
    const { filename, count } = session.save();
    console.log(`${c.green}✓${c.reset} Saved ${count} commands to ${c.bold}${filename}${c.reset}`);
    ctx.rl.setPrompt(promptStr(ctx));
    return true;
  }

  if (line === '.pause') {
    const paused = session.togglePause();
    console.log(paused ? `${c.yellow}⏸${c.reset} Recording paused` : `${c.red}⏺${c.reset} Recording resumed`);
    return true;
  }

  if (line === '.discard') {
    session.discard();
    console.log(`${c.yellow}Recording discarded${c.reset}`);
    ctx.rl.setPrompt(promptStr(ctx));
    return true;
  }

  return false;
}

// ─── Process a single line ──────────────────────────────────────────────────

export async function processLine(ctx, line) {
  line = line.trim();
  if (!line) return;

  // ── Meta-commands ────────────────────────────────────────────────

  if (line === '.help' || line === '?') return showHelp();
  if (line === '.aliases') return showAliases();
  if (line === '.status') return showStatus(ctx);

  if (line === '.exit' || line === '.quit') {
    ctx.conn.close();
    process.exit(0);
  }

  if (line === '.reconnect') {
    await ctx.conn.close();
    try {
      await ctx.conn.start(ctx.opts);
      console.log(`${c.green}✓${c.reset} Reconnected`);
    } catch (err) {
      console.error(`${c.red}✗${c.reset} ${err.message}`);
    }
    return;
  }

  // ── Session commands (record/save/pause/discard) ────────────────

  if (line.startsWith('.')) {
    try {
      if (handleSessionCommand(ctx, line)) return;
    } catch (err) {
      console.log(`${c.yellow}${err.message}${c.reset}`);
      return;
    }
  }

  // ── Inline replay ──────────────────────────────────────────────

  if (line.startsWith('.replay')) {
    const filename = line.split(/\s+/)[1];
    if (!filename) {
      console.log(`${c.yellow}Usage: .replay <filename>${c.reset}`);
      return;
    }
    try {
      const player = ctx.session.startReplay(filename);
      console.log(`${c.blue}▶${c.reset} Replaying ${c.bold}${filename}${c.reset} (${player.commands.length} commands)\n`);
      while (!player.done) {
        const cmd = player.next();
        console.log(`${c.dim}${player.progress}${c.reset} ${cmd}`);
        await processLine(ctx, cmd);
      }
      ctx.session.endReplay();
      console.log(`\n${c.green}✓${c.reset} Replay complete`);
    } catch (err) {
      console.error(`${c.red}Error:${c.reset} ${err.message}`);
      ctx.session.endReplay();
    }
    return;
  }

  // ── Regular command — parse and send ─────────────────────────────

  let args = parseInput(line);
  if (!args) return;

  const cmdName = args._[0];
  if (!cmdName) return;

  // Validate command exists
  const knownExtras = ['help', 'list', 'close-all', 'kill-all', 'install', 'install-browser',
                       'verify-text', 'verify-element', 'verify-value', 'verify-list'];
  if (!ALL_COMMANDS.includes(cmdName) && !knownExtras.includes(cmdName)) {
    console.log(`${c.yellow}Unknown command: ${cmdName}${c.reset}`);
    console.log(`${c.dim}Type .help for available commands${c.reset}`);
    return;
  }

  // ── Session-level commands (not forwarded to daemon) ──────────
  if (cmdName === 'kill-all') return handleKillAll(ctx);
  if (cmdName === 'close' || cmdName === 'close-all') return handleClose(ctx);

  // ── Verify commands → run-code translation ──────────────────
  const verifyFns = {
    'verify-text': verifyText,
    'verify-element': verifyElement,
    'verify-value': verifyValue,
    'verify-list': verifyList,
  };
  if (verifyFns[cmdName]) {
    const pos = args._.slice(1);
    const fn = verifyFns[cmdName];
    let translated = null;
    if (cmdName === 'verify-text') {
      const text = pos.join(' ');
      if (text) translated = buildRunCode(fn, text);
    } else if (pos[0] && pos.length >= 2) {
      const rest = cmdName === 'verify-list' ? pos.slice(1) : pos.slice(1).join(' ');
      translated = buildRunCode(fn, pos[0], rest);
    }
    if (translated) {
      args = translated;
    } else {
      console.log(`${c.yellow}Usage: ${cmdName} <args>${c.reset}`);
      return;
    }
  }

  // ── Auto-resolve text to native Playwright locator ─────────
  const textFns = {
    click: actionByText, dblclick: actionByText, hover: actionByText,
    fill: fillByText, select: selectByText, check: checkByText, uncheck: uncheckByText,
  };
  if (textFns[cmdName] && args._[1] && !/^e\d+$/.test(args._[1])) {
    const textArg = args._[1];
    const extraArgs = args._.slice(2);
    const fn = textFns[cmdName];
    let runCodeArgs;
    if (fn === actionByText) runCodeArgs = buildRunCode(fn, textArg, cmdName);
    else if (cmdName === 'fill' || cmdName === 'select') runCodeArgs = buildRunCode(fn, textArg, extraArgs[0] || '');
    else runCodeArgs = buildRunCode(fn, textArg);
    const argsHint = extraArgs.length > 0 ? ` ${extraArgs.join(' ')}` : '';
    ctx.log(`${c.dim}→ ${cmdName} "${textArg}"${argsHint} (via run-code)${c.reset}`);
    args = runCodeArgs;
  }

  // ── Auto-wrap run-code body with async (page) => { ... } ──
  if (cmdName === 'run-code' && args._[1] && !args._[1].startsWith('async')) {
    const STMT = /^(await|return|const|let|var|for|if|while|throw|try)\b/;
    const body = !args._[1].includes(';') && !STMT.test(args._[1])
      ? `return await ${args._[1]}`
      : args._[1];
    args = { _: ['run-code', `async (page) => { ${body} }`] };
    ctx.log(`${c.dim}→ ${args._[1]}${c.reset}`);
  }

  const startTime = performance.now();
  try {
    const result = await ctx.conn.run(args);
    const elapsed = (performance.now() - startTime).toFixed(0);
    if (result?.text) {
      const output = filterResponse(result.text);
      if (output) console.log(output);
    }
    ctx.commandCount++;
    ctx.session.record(line);

    if (elapsed > 500) {
      ctx.log(`${c.dim}(${elapsed}ms)${c.reset}`);
    }
  } catch (err) {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
    if (!ctx.conn.connected) {
      console.log(`${c.yellow}Browser disconnected. Trying to restart...${c.reset}`);
      try {
        await ctx.conn.start(ctx.opts);
        console.log(`${c.green}✓${c.reset} Restarted. Try your command again.`);
      } catch {
        console.error(`${c.red}✗${c.reset} Could not restart. Use .reconnect or restart the REPL.`);
      }
    }
  }
}

// ─── Replay mode (non-interactive, --replay flag) ───────────────────────────

export async function runReplayMode(ctx, replayFile, step) {
  try {
    const player = ctx.session.startReplay(replayFile, step);
    console.log(`${c.blue}▶${c.reset} Replaying ${c.bold}${replayFile}${c.reset} (${player.commands.length} commands)\n`);
    while (!player.done) {
      const cmd = player.next();
      console.log(`${c.dim}${player.progress}${c.reset} ${cmd}`);
      await processLine(ctx, cmd);

      if (ctx.session.step && !player.done) {
        await new Promise((resolve) => {
          process.stdout.write(`${c.dim}  Press Enter to continue...${c.reset}`);
          process.stdin.once('data', () => {
            process.stdout.write('\r\x1b[K');
            resolve();
          });
        });
      }
    }
    ctx.session.endReplay();
    console.log(`\n${c.green}✓${c.reset} Replay complete`);
    ctx.conn.close();
    process.exit(0);
  } catch (err) {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
    ctx.conn.close();
    process.exit(1);
  }
}

// ─── Command loop (interactive) ─────────────────────────────────────────────

export function startCommandLoop(ctx) {
  let processing = false;
  const commandQueue = [];

  async function processQueue() {
    if (processing) return;
    processing = true;
    while (commandQueue.length > 0) {
      const line = commandQueue.shift();
      await processLine(ctx, line);
      if (line.trim()) {
        try {
          fs.mkdirSync(path.dirname(ctx.historyFile), { recursive: true });
          fs.appendFileSync(ctx.historyFile, line.trim() + '\n');
        } catch {}
      }
    }
    processing = false;
    ctx.rl.prompt();
  }

  ctx.rl.prompt();

  ctx.rl.on('line', (line) => {
    commandQueue.push(line);
    processQueue();
  });

  ctx.rl.on('close', async () => {
    while (processing || commandQueue.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }
    ctx.log(`\n${c.dim}Closing browser...${c.reset}`);
    ctx.conn.close();
    process.exit(0);
  });

  let lastSigint = 0;
  ctx.rl.on('SIGINT', () => {
    const now = Date.now();
    if (now - lastSigint < 500) {
      ctx.conn.close();
      process.exit(0);
    }
    lastSigint = now;
    ctx.log(`\n${c.dim}(Ctrl+C again to exit, or type .exit)${c.reset}`);
    ctx.rl.prompt();
  });
}

// ─── Prompt string ──────────────────────────────────────────────────────────

export function promptStr(ctx) {
  const mode = ctx.session.mode;
  const prefix = mode === 'recording' ? `${c.red}⏺${c.reset} `
               : mode === 'paused'    ? `${c.yellow}⏸${c.reset} `
               : '';
  return `${prefix}${c.cyan}pw>${c.reset} `;
}

// ─── Ghost completion (inline suggestion) ───────────────────────────────────

/**
 * Attaches ghost-text completion to a readline interface.
 * Shows dimmed inline suggestion after the cursor; Tab or Right Arrow accepts it.
 *
 * Uses _ttyWrite wrapper instead of _writeToOutput because Node 22+ optimizes
 * single-character appends and doesn't always trigger a full line refresh.
 *
 * @param {readline.Interface} rl
 * @param {Array<{cmd: string, desc: string}>} items - from buildCompletionItems()
 */
/**
 * Returns matching commands for ghost completion.
 * When the input exactly matches a command AND there are longer matches,
 * the exact match is included so the user can cycle through all options.
 */
export function getGhostMatches(cmds, input) {
  if (input.length > 0 && !input.includes(' ')) {
    const longer = cmds.filter(cmd => cmd.startsWith(input) && cmd !== input);
    if (longer.length > 0 && cmds.includes(input)) longer.push(input);
    return longer;
  }
  return [];
}

function attachGhostCompletion(rl, items) {
  if (!process.stdin.isTTY) return;  // no ghost text for piped input

  const cmds = items.map(i => i.cmd);
  let ghost = '';
  let matches = [];   // all matching commands for current input
  let matchIdx = 0;   // which match is currently shown

  function renderGhost(suffix) {
    ghost = suffix;
    rl.output.write(`\x1b[2m${ghost}\x1b[0m\x1b[${ghost.length}D`);
  }

  const origTtyWrite = rl._ttyWrite.bind(rl);
  rl._ttyWrite = function (s, key) {
    // Tab handling — based on matches, not ghost text
    if (key && key.name === 'tab') {
      // Cycle through multiple matches
      if (matches.length > 1) {
        rl.output.write('\x1b[K');
        ghost = '';
        matchIdx = (matchIdx + 1) % matches.length;
        const input = rl.line || '';
        const suffix = matches[matchIdx].slice(input.length);
        if (suffix) renderGhost(suffix);
        return;
      }
      // Single match — accept it
      if (ghost && matches.length === 1) {
        const text = ghost;
        rl.output.write('\x1b[K');
        ghost = '';
        matches = [];
        rl._insertString(text);
        return;
      }
      return;
    }

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
    matches = getGhostMatches(cmds, input);
    matchIdx = 0;
    if (matches.length > 0 && rl.cursor === rl.line.length) {
      renderGhost(matches[0].slice(input.length));
    }
  };
}

// ─── REPL ────────────────────────────────────────────────────────────────────

export async function startRepl(opts = {}) {
  const silent = opts.silent || false;
  const log = (...args) => { if (!silent) console.log(...args); };

  log(`${c.bold}${c.magenta}🎭 Playwright REPL${c.reset} ${c.dim}v${replVersion}${c.reset}`);
  log(`${c.dim}Type .help for commands${c.reset}\n`);

  // ─── Start engine ────────────────────────────────────────────────

  const conn = new Engine();
  try {
    await conn.start(opts);
    log(`${c.green}✓${c.reset} Browser ready\n`);
  } catch (err) {
    console.error(`${c.red}✗${c.reset} Failed to start: ${err.message}`);
    process.exit(1);
  }

  // ─── Session + readline ──────────────────────────────────────────

  const session = new SessionManager();
  const historyDir = path.join(os.homedir(), '.playwright-repl');
  const historyFile = path.join(historyDir, '.repl-history');
  const ctx = { conn, session, rl: null, opts, log, historyFile, commandCount: 0 };

  // Auto-start recording if --record was passed
  if (opts.record) {
    const file = session.startRecording(opts.record);
    log(`${c.red}⏺${c.reset} Recording to ${c.bold}${file}${c.reset}`);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptStr(ctx),
    historySize: 500,
  });
  ctx.rl = rl;

  try {
    const hist = fs.readFileSync(historyFile, 'utf-8').split('\n').filter(Boolean).reverse();
    for (const line of hist) rl.history.push(line);
  } catch {}

  attachGhostCompletion(rl, buildCompletionItems());

  // ─── Start ───────────────────────────────────────────────────────

  if (opts.replay) {
    await runReplayMode(ctx, opts.replay, opts.step);
  } else {
    startCommandLoop(ctx);
  }
}
