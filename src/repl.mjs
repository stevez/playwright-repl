/**
 * Main REPL loop.
 *
 * Handles readline, command queue, meta-commands, and session management.
 */

import readline from 'node:readline';
import path from 'node:path';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

import { replVersion, COMMANDS } from './resolve.mjs';
import { DaemonConnection } from './connection.mjs';
import { socketPath, daemonProfilesDir, isDaemonRunning, startDaemon } from './workspace.mjs';
import { parseInput, ALIASES, ALL_COMMANDS } from './parser.mjs';
import { SessionManager } from './recorder.mjs';
import { c } from './colors.mjs';

// ─── Verify commands → run-code translation ─────────────────────────────────

/**
 * The daemon has browser_verify_* tools but no CLI keyword mappings.
 * We intercept verify-* commands here and translate them to run-code calls
 * that use the equivalent Playwright API.
 */
export function verifyToRunCode(cmdName, positionalArgs) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  switch (cmdName) {
    case 'verify-text': {
      const text = positionalArgs.join(' ');
      if (!text) return null;
      return { _: ['run-code', `async (page) => { if (await page.getByText('${esc(text)}').filter({ visible: true }).count() === 0) throw new Error('Text not found: ${esc(text)}'); }`] };
    }
    case 'verify-element': {
      const [role, ...nameParts] = positionalArgs;
      const name = nameParts.join(' ');
      if (!role || !name) return null;
      return { _: ['run-code', `async (page) => { if (await page.getByRole('${esc(role)}', { name: '${esc(name)}' }).count() === 0) throw new Error('Element not found: ${esc(role)} "${esc(name)}"'); }`] };
    }
    case 'verify-value': {
      const [ref, ...valueParts] = positionalArgs;
      const value = valueParts.join(' ');
      if (!ref || !value) return null;
      return { _: ['run-code', `async (page) => { const el = page.locator('[aria-ref="${esc(ref)}"]'); const v = await el.inputValue(); if (v !== '${esc(value)}') throw new Error('Expected "${esc(value)}", got "' + v + '"'); }`] };
    }
    case 'verify-list': {
      const [ref, ...items] = positionalArgs;
      if (!ref || items.length === 0) return null;
      const checks = items.map(item => `if (await loc.getByText('${esc(item)}').count() === 0) throw new Error('Item not found: ${esc(item)}');`).join(' ');
      return { _: ['run-code', `async (page) => { const loc = page.locator('[aria-ref="${esc(ref)}"]'); ${checks} }`] };
    }
    default:
      return null;
  }
}

// ─── Text-to-action via Playwright native locators ──────────────────────────

/**
 * Build a run-code args object that uses Playwright's native text locators.
 * e.g. click "Active"       → page.getByText("Active").click()
 *      fill "Email" "test"  → page.getByLabel("Email").fill("test")
 *      check "Buy groceries" → listitem with text → checkbox.check()
 */
export function textToRunCode(cmdName, textArg, extraArgs) {
  const esc = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  const text = esc(textArg);

  switch (cmdName) {
    case 'click':
      return { _: ['run-code', `async (page) => {
  let loc = page.getByText('${text}', { exact: true });
  if (await loc.count() === 0) loc = page.getByRole('button', { name: '${text}' });
  if (await loc.count() === 0) loc = page.getByRole('link', { name: '${text}' });
  if (await loc.count() === 0) loc = page.getByText('${text}');
  await loc.click();
}`] };
    case 'dblclick':
      return { _: ['run-code', `async (page) => {
  let loc = page.getByText('${text}', { exact: true });
  if (await loc.count() === 0) loc = page.getByRole('button', { name: '${text}' });
  if (await loc.count() === 0) loc = page.getByRole('link', { name: '${text}' });
  if (await loc.count() === 0) loc = page.getByText('${text}');
  await loc.dblclick();
}`] };
    case 'hover':
      return { _: ['run-code', `async (page) => {
  let loc = page.getByText('${text}', { exact: true });
  if (await loc.count() === 0) loc = page.getByRole('button', { name: '${text}' });
  if (await loc.count() === 0) loc = page.getByRole('link', { name: '${text}' });
  if (await loc.count() === 0) loc = page.getByText('${text}');
  await loc.hover();
}`] };
    case 'fill': {
      const value = esc(extraArgs[0] || '');
      // Try getByLabel first, fall back to getByPlaceholder, then getByRole('textbox')
      return { _: ['run-code', `async (page) => {
  let loc = page.getByLabel('${text}');
  if (await loc.count() === 0) loc = page.getByPlaceholder('${text}');
  if (await loc.count() === 0) loc = page.getByRole('textbox', { name: '${text}' });
  await loc.fill('${value}');
}`] };
    }
    case 'select': {
      const value = esc(extraArgs[0] || '');
      return { _: ['run-code', `async (page) => {
  let loc = page.getByLabel('${text}');
  if (await loc.count() === 0) loc = page.getByRole('combobox', { name: '${text}' });
  await loc.selectOption('${value}');
}`] };
    }
    case 'check':
      // Scope to listitem/group with matching text, then find checkbox inside
      return { _: ['run-code', `async (page) => {
  const item = page.getByRole('listitem').filter({ hasText: '${text}' });
  if (await item.count() > 0) { await item.getByRole('checkbox').check(); return; }
  let loc = page.getByLabel('${text}');
  if (await loc.count() === 0) loc = page.getByRole('checkbox', { name: '${text}' });
  await loc.check();
}`] };
    case 'uncheck':
      return { _: ['run-code', `async (page) => {
  const item = page.getByRole('listitem').filter({ hasText: '${text}' });
  if (await item.count() > 0) { await item.getByRole('checkbox').uncheck(); return; }
  let loc = page.getByLabel('${text}');
  if (await loc.count() === 0) loc = page.getByRole('checkbox', { name: '${text}' });
  await loc.uncheck();
}`] };
    default:
      return null;
  }
}

// ─── Response filtering ─────────────────────────────────────────────────────

export function filterResponse(text) {
  const sections = text.split(/^### /m).slice(1);
  const kept = [];
  for (const section of sections) {
    const newline = section.indexOf('\n');
    if (newline === -1) continue;
    const title = section.substring(0, newline).trim();
    const content = section.substring(newline + 1).trim();
    if (title === 'Result' || title === 'Error' || title === 'Modal state')
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
  console.log(`  .reconnect            Reconnect to daemon`);
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
  const { conn, sessionName, session } = ctx;
  console.log(`Connected: ${conn.connected ? `${c.green}yes${c.reset}` : `${c.red}no${c.reset}`}`);
  console.log(`Session: ${sessionName}`);
  console.log(`Socket: ${socketPath(sessionName)}`);
  console.log(`Commands sent: ${ctx.commandCount}`);
  console.log(`Mode: ${session.mode}`);
  if (session.mode === 'recording' || session.mode === 'paused') {
    console.log(`Recording: ${c.red}⏺${c.reset} ${session.recordingFilename} (${session.recordedCount} commands${session.mode === 'paused' ? ', paused' : ''})`);
  }
}

// ─── Session-level commands ─────────────────────────────────────────────────

export async function handleKillAll(ctx) {
  try {
    let killed = 0;
    if (process.platform === 'win32') {
      let result = '';
      try {
        result = execSync(
          'powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like \'*run-mcp-server*\' -and $_.CommandLine -like \'*--daemon-session*\' } | Select-Object -ExpandProperty ProcessId"',
          { encoding: 'utf-8' }
        );
      } catch (err) {
        result = err.stdout || '';
      }
      for (const line of result.trim().split(/\r?\n/)) {
        const pid = line.trim();
        if (/^\d+$/.test(pid)) {
          try { process.kill(parseInt(pid, 10)); killed++; } catch {}
        }
      }
    } else {
      const result = execSync('ps aux', { encoding: 'utf-8' });
      for (const ln of result.split('\n')) {
        if (ln.includes('run-mcp-server') && ln.includes('--daemon-session')) {
          const pid = ln.trim().split(/\s+/)[1];
          if (pid && /^\d+$/.test(pid)) {
            try { process.kill(parseInt(pid, 10), 'SIGKILL'); killed++; } catch {}
          }
        }
      }
    }
    console.log(killed > 0
      ? `${c.green}✓${c.reset} Killed ${killed} daemon process${killed === 1 ? '' : 'es'}`
      : `${c.dim}No daemon processes found${c.reset}`);
    ctx.conn.close();
  } catch (err) {
    console.error(`${c.red}Error:${c.reset} ${err.message}`);
  }
}

export async function handleClose(ctx) {
  try {
    await ctx.conn.send('stop', {});
    console.log(`${c.green}✓${c.reset} Daemon stopped`);
    ctx.conn.close();
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
    ctx.conn.close();
    try {
      await ctx.conn.connect();
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
  const verifyCommands = ['verify-text', 'verify-element', 'verify-value', 'verify-list'];
  if (verifyCommands.includes(cmdName)) {
    const translated = verifyToRunCode(cmdName, args._.slice(1));
    if (translated) {
      args = translated;
    } else {
      console.log(`${c.yellow}Usage: ${cmdName} <args>${c.reset}`);
      return;
    }
  }

  // ── Auto-resolve text to native Playwright locator ─────────
  const refCommands = ['click', 'dblclick', 'hover', 'fill', 'select', 'check', 'uncheck'];
  if (refCommands.includes(cmdName) && args._[1] && !/^e\d+$/.test(args._[1])) {
    const textArg = args._[1];
    const extraArgs = args._.slice(2);
    const runCodeArgs = textToRunCode(cmdName, textArg, extraArgs);
    if (runCodeArgs) {
      ctx.log(`${c.dim}→ ${runCodeArgs._[1]}${c.reset}`);
      args = runCodeArgs;
    }
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
      console.log(`${c.yellow}Connection lost. Trying to reconnect...${c.reset}`);
      try {
        await ctx.conn.connect();
        console.log(`${c.green}✓${c.reset} Reconnected. Try your command again.`);
      } catch {
        console.error(`${c.red}✗${c.reset} Could not reconnect. Use .reconnect or restart.`);
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
    ctx.log(`\n${c.dim}Disconnecting... (daemon stays running)${c.reset}`);
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

// ─── Tab completer ──────────────────────────────────────────────────────────

export function completer(line) {
  const parts = line.split(/\s+/);
  if (parts.length <= 1) {
    const prefix = parts[0] || '';
    const allNames = [...ALL_COMMANDS, ...Object.keys(ALIASES)];
    const metas = ['.help', '.aliases', '.status', '.reconnect', '.exit',
                   '.record', '.save', '.replay', '.pause', '.discard'];
    const hits = [...allNames, ...metas].filter(n => n.startsWith(prefix));
    return [hits.length ? hits : allNames, prefix];
  }
  const cmd = ALIASES[parts[0]] || parts[0];
  const helpText = COMMANDS[cmd]?.options || [];
  const lastPart = parts[parts.length - 1];
  if (lastPart.startsWith('--')) {
    const hits = helpText.filter(o => o.startsWith(lastPart));
    return [hits, lastPart];
  }
  return [[], line];
}

// ─── REPL ────────────────────────────────────────────────────────────────────

export async function startRepl(opts = {}) {
  const sessionName = opts.session || 'default';
  const silent = opts.silent || false;
  const log = (...args) => { if (!silent) console.log(...args); };

  log(`${c.bold}${c.magenta}🎭 Playwright REPL${c.reset} ${c.dim}v${replVersion}${c.reset}`);
  log(`${c.dim}Session: ${sessionName} | Type .help for commands${c.reset}\n`);

  // ─── Connect to daemon ───────────────────────────────────────────

  const running = await isDaemonRunning(sessionName);
  if (!running) {
    await startDaemon(sessionName, opts);
    await new Promise(r => setTimeout(r, 500));
  }

  const conn = new DaemonConnection(socketPath(sessionName), replVersion);
  try {
    await conn.connect();
    log(`${c.green}✓${c.reset} Connected to daemon${running ? '' : ' (newly started)'}\n`);
  } catch (err) {
    console.error(`${c.red}✗${c.reset} Failed to connect: ${err.message}`);
    console.error(`  Try: playwright-cli open`);
    process.exit(1);
  }

  // ─── Session + readline ──────────────────────────────────────────

  const session = new SessionManager();
  const historyFile = path.join(daemonProfilesDir, '.repl-history');
  const ctx = { conn, session, rl: null, sessionName, log, historyFile, commandCount: 0 };

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
    completer,
  });
  ctx.rl = rl;

  try {
    const hist = fs.readFileSync(historyFile, 'utf-8').split('\n').filter(Boolean).reverse();
    for (const line of hist) rl.history.push(line);
  } catch {}

  // ─── Start ───────────────────────────────────────────────────────

  if (opts.replay) {
    await runReplayMode(ctx, opts.replay, opts.step);
  } else {
    startCommandLoop(ctx);
  }
}
