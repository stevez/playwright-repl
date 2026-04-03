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
  replVersion, parseInput, ALIASES, ALL_COMMANDS, buildCompletionItems, c, prettyJson,
  BridgeServer, COMMANDS, CATEGORIES, JS_CATEGORIES, refToLocator,
  filterResponse as filterResponseBase, resolveArgs,
} from '@playwright-repl/core';
import type { EngineOpts, ParsedArgs, EngineResult, CompletionItem } from '@playwright-repl/core';
import { Engine } from './engine.js';
import { SessionManager } from './recorder.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReplOpts extends EngineOpts {
  session?: string;
  replay?: string[];
  record?: string;
  step?: boolean;
  silent?: boolean;
  bridge?: boolean;
  bridgePort?: number;
  includeSnapshot?: boolean;
  verbose?: boolean;
}

export interface ReplContext {
  conn: Engine;
  session: SessionManager;
  rl: readline.Interface | null;
  opts: ReplOpts;
  log: (...args: unknown[]) => void;
  historyFile: string;
  sessionHistory: string[];
  commandCount: number;
  errors: number;
  lastSnapshot?: { url: string; snapshotString: string };
}

// ─── Response filtering ─────────────────────────────────────────────────────

/** CLI wrapper: uses core filterResponse + ANSI-colors for error lines. */
export function filterResponse(text: string, cmdName?: string, opts?: { includeSnapshot?: boolean; verbose?: boolean }): string | null {
  const filtered = filterResponseBase(text, cmdName, opts);
  if (!filtered) return null;
  // Strip section headers for human-friendly output (unless verbose)
  const body = opts?.verbose ? filtered : filtered.replace(/^### \w[\w ]*\n/gm, '');
  // Color error lines red (core returns them as plain "Error: ..." text)
  return body.replace(/^(Error: .*)$/gm, `${c.red}$1${c.reset}`);
}

// ─── Meta-command handlers ──────────────────────────────────────────────────

export function showHelp(bridge = false): void {
  console.log(`\n${c.bold}Available commands:${c.reset}`);
  for (const [cat, cmds] of Object.entries(CATEGORIES)) {
    console.log(`  ${c.bold}${cat}:${c.reset} ${cmds.join(', ')}`);
  }
  if (bridge) {
    console.log(`\n${c.bold}JavaScript mode:${c.reset}`);
    console.log(`  ${c.dim}Use Playwright API directly: await page.title(), page.locator('h1').click(), ...${c.reset}`);
    console.log(`  ${c.dim}Type .help js for available Playwright methods${c.reset}`);
  }
  console.log(`\n  ${c.dim}Type .help <command> for details, or .aliases for shortcuts${c.reset}`);
  console.log(`\n${c.bold}REPL meta-commands:${c.reset}`);
  console.log(`  .aliases              Show command aliases`);
  console.log(`  .status               Show connection status`);
  console.log(`  .reconnect            Restart browser`);
  console.log(`  .record [filename]    Start recording commands`);
  console.log(`  .save                 Stop recording and save`);
  console.log(`  .pause                Pause/resume recording`);
  console.log(`  .discard              Discard recording`);
  console.log(`  .replay <filename>    Replay a recorded session`);
  console.log(`  .clear                Clear terminal output`);
  console.log(`  .history              Show command history`);
  console.log(`  .history clear        Clear command history`);
  console.log(`  .exit                 Exit REPL\n`);
}

export function showCommandHelp(cmd: string, bridge = false): void {
  if (cmd === 'js' || cmd === 'javascript') {
    if (!bridge) {
      console.log(`\n${c.dim}JavaScript mode is only available in bridge mode (--bridge).${c.reset}\n`);
      return;
    }
    console.log(`\n${c.bold}JavaScript mode — Playwright API:${c.reset}`);
    console.log(`  ${c.dim}Prefix with ${c.reset}await${c.dim} for async methods${c.reset}\n`);
    console.log(`  ${c.bold}Available globals:${c.reset}`);
    console.log(`    ${c.bold}page${c.reset}      ${c.dim}— Playwright Page object (active browser tab)${c.reset}`);
    console.log(`    ${c.bold}context${c.reset}   ${c.dim}— Playwright BrowserContext (cookies, pages, routes)${c.reset}`);
    console.log(`    ${c.bold}expect${c.reset}    ${c.dim}— Playwright assertion (expect(locator).toBeVisible())${c.reset}`);
    console.log(`    ${c.bold}document${c.reset}  ${c.dim}— DOM document (inside page.evaluate())${c.reset}`);
    console.log(`    ${c.bold}window${c.reset}    ${c.dim}— Browser window (inside page.evaluate())${c.reset}`);
    console.log();
    for (const [cat, methods] of Object.entries(JS_CATEGORIES)) {
      console.log(`  ${c.bold}${cat}:${c.reset} ${methods.join(', ')}`);
    }
    console.log();
    return;
  }
  const info = COMMANDS[cmd];
  if (!info) {
    console.log(`\n${c.dim}Unknown command: "${cmd}". Type .help for available commands.${c.reset}\n`);
    return;
  }
  console.log(`\n${c.bold}${cmd}${c.reset} — ${info.desc}`);
  if (info.usage) console.log(`\n  ${c.dim}Usage:${c.reset} ${info.usage}`);
  if (info.options.length) console.log(`  ${c.dim}Options:${c.reset} ${info.options.join(', ')}`);
  if (info.examples?.length) {
    console.log(`  ${c.dim}Examples:${c.reset}`);
    for (const ex of info.examples) console.log(`    ${ex}`);
  }
  console.log();
}

export function showAliases(): void {
  console.log(`\n${c.bold}Command aliases:${c.reset}`);
  const groups: Record<string, string[]> = {};
  for (const [alias, cmd] of Object.entries(ALIASES)) {
    if (!groups[cmd]) groups[cmd] = [];
    groups[cmd].push(alias);
  }
  for (const [cmd, aliases] of Object.entries(groups).sort()) {
    console.log(`  ${c.cyan}${aliases.join(', ')}${c.reset} → ${cmd}`);
  }
  console.log();
}

export function showStatus(ctx: ReplContext): void {
  const { conn, session } = ctx;
  console.log(`Connected: ${conn.connected ? `${c.green}yes${c.reset}` : `${c.red}no${c.reset}`}`);
  console.log(`Commands sent: ${ctx.commandCount}`);
  console.log(`Mode: ${session.mode}`);
  if (session.mode === 'recording' || session.mode === 'paused') {
    console.log(`Recording: ${c.red}⏺${c.reset} ${session.recordingFilename} (${session.recordedCount} commands${session.mode === 'paused' ? ', paused' : ''})`);
  }
}

// ─── Session-level commands ─────────────────────────────────────────────────

export async function handleKillAll(ctx: ReplContext): Promise<void> {
  try {
    await ctx.conn.close();
    console.log(`${c.green}✓${c.reset} Browser closed`);
  } catch (err: unknown) {
    console.error(`${c.red}Error:${c.reset} ${(err as Error).message}`);
  }
}

export async function handleClose(ctx: ReplContext): Promise<void> {
  try {
    await ctx.conn.close();
    console.log(`${c.green}✓${c.reset} Browser closed`);
  } catch (err: unknown) {
    console.error(`${c.red}Error:${c.reset} ${(err as Error).message}`);
  }
}

// ─── Session meta-commands (.record, .save, .pause, .discard, .replay) ──────

export function handleSessionCommand(ctx: ReplContext, line: string): boolean {
  const { session } = ctx;

  if (line.startsWith('.record')) {
    const filename = line.split(/\s+/)[1] || undefined;
    const file = session.startRecording(filename);
    console.log(`${c.red}⏺${c.reset} Recording to ${c.bold}${file}${c.reset}`);
    ctx.rl!.setPrompt(promptStr(ctx));
    return true;
  }

  if (line === '.save') {
    const { filename, count } = session.save();
    console.log(`${c.green}✓${c.reset} Saved ${count} commands to ${c.bold}${filename}${c.reset}`);
    ctx.rl!.setPrompt(promptStr(ctx));
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
    ctx.rl!.setPrompt(promptStr(ctx));
    return true;
  }

  return false;
}

// ─── Process a single line ──────────────────────────────────────────────────

export async function processLine(ctx: ReplContext, line: string): Promise<void> {
  line = line.trim();
  if (!line) return;

  // ── Meta-commands ────────────────────────────────────────────────

  if (line === '.help' || line === '?') return showHelp();
  if (line.startsWith('.help ')) return showCommandHelp(line.slice(6).trim());
  if (line === '.aliases') return showAliases();
  if (line === '.status') return showStatus(ctx);

  if (line === '.clear') {
    console.clear();
    ctx.rl!.prompt();
    return;
  }

  if (line === '.history clear') {
    ctx.sessionHistory.length = 0;
    console.log('History cleared.');
    return;
  }

  if (line === '.history') {
    const hist = ctx.sessionHistory;
    console.log(hist.length ? hist.join('\n') : '(no history)');
    return;
  }

  if (line === '.exit' || line === '.quit') {
    await ctx.conn.close();
    process.exit(0);
  }

  if (line === '.reconnect') {
    await ctx.conn.close();
    try {
      await ctx.conn.start(ctx.opts);
      console.log(`${c.green}✓${c.reset} Reconnected`);
    } catch (err: unknown) {
      console.error(`${c.red}✗${c.reset} ${(err as Error).message}`);
    }
    return;
  }

  // ── Session commands (record/save/pause/discard) ────────────────

  if (line.startsWith('.')) {
    try {
      if (handleSessionCommand(ctx, line)) return;
    } catch (err: unknown) {
      console.log(`${c.yellow}${(err as Error).message}${c.reset}`);
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
        const cmd = player.next()!;
        console.log(`${c.dim}${player.progress}${c.reset} ${cmd}`);
        await processLine(ctx, cmd);
      }
      ctx.session.endReplay();
      console.log(`\n${c.green}✓${c.reset} Replay complete`);
    } catch (err: unknown) {
      console.error(`${c.red}Error:${c.reset} ${(err as Error).message}`);
      ctx.session.endReplay();
    }
    return;
  }

  // ── Locator (local — uses cached snapshot) ───────────────────────
  if (line.startsWith('locator ')) {
    const ref = line.slice(8).trim();
    if (!ctx.lastSnapshot) {
      console.log(`${c.yellow}No snapshot cached. Run "snapshot" first.${c.reset}`);
      return;
    }
    const locator = refToLocator(ctx.lastSnapshot.snapshotString, ref);
    if (!locator) {
      console.log(`${c.yellow}Ref "${ref}" not found in last snapshot.${c.reset}`);
      return;
    }
    console.log(`js: ${locator.js}\npw: ${locator.pw}`);
    return;
  }

  // ── Regular command — parse and send ─────────────────────────────

  let args: ParsedArgs | null = parseInput(line);
  if (!args) return;

  const cmdName = args._[0];
  if (!cmdName) return;

  // Validate command exists
  const knownExtras = ['help', 'highlight', 'locator', 'list', 'close-all', 'kill-all', 'install', 'install-browser',
                       'verify', 'verify-text', 'verify-element', 'verify-value', 'verify-visible', 'verify-input-value', 'verify-list',
                       'verify-title', 'verify-url', 'verify-no-text', 'verify-no-element'];
  if (!ALL_COMMANDS.includes(cmdName) && !knownExtras.includes(cmdName)) {
    console.log(`${c.yellow}Unknown command: ${cmdName}${c.reset}`);
    console.log(`${c.dim}Type .help for available commands${c.reset}`);
    return;
  }

  // ── Session-level commands (not forwarded to daemon) ──────────
  if (cmdName === 'kill-all') return handleKillAll(ctx) as unknown as void;
  if (cmdName === 'close' || cmdName === 'close-all') return handleClose(ctx) as unknown as void;

  // ── Command transformations (verify, role-based, text, run-code) ──
  const resolved = resolveArgs(args);
  if (resolved._[0] === args._[0] && cmdName === 'verify') {
    // resolveArgs didn't transform — bad verify usage
    console.log(`${c.yellow}Usage: verify <title|url|text|no-text|element|no-element|value|visible|input-value|list> <args>${c.reset}`);
    return;
  }
  if (resolved._[0] !== args._[0] || resolved._[1] !== args._[1]) {
    // Command was transformed — log hint
    ctx.log(`${c.dim}→ ${resolved._[1]?.substring(0, 80)}${resolved._[1]?.length > 80 ? '…' : ''} (via run-code)${c.reset}`);
  }
  args = resolved;

  ctx.session.record(line);
  const startTime = performance.now();
  try {
    const result = await ctx.conn.run(args);
    const snapshotMatch = result?.text?.match(/### Snapshot\n([\s\S]*?)(?=\n### |$)/);
    if (snapshotMatch) {
      const urlMatch = result?.text?.match(/### Page\n-\s*\[.*?\]\((.*?)\)/);
      const raw = snapshotMatch[1].trim();
      const yamlBody = raw.replace(/^```(?:yaml)?\n?/, '').replace(/\n?```$/, '');
      ctx.lastSnapshot = { url: urlMatch?.[1] ?? '', snapshotString: yamlBody };
    }
    const elapsed = (performance.now() - startTime).toFixed(0);
    if (result?.text) {
      const filterOpts = (ctx.opts.includeSnapshot || ctx.opts.verbose)
        ? { includeSnapshot: ctx.opts.includeSnapshot, verbose: ctx.opts.verbose } : undefined;
      const filtered = filterResponse(result.text, cmdName, filterOpts);
      if (filtered !== null) console.log(filtered);
    }
    if (result?.isError) ctx.errors++;
    ctx.commandCount++;

    ctx.log(`${c.dim}(${elapsed}ms)${c.reset}`);
  } catch (err: unknown) {
    ctx.errors++;
    console.error(`${c.red}Error:${c.reset} ${(err as Error).message}`);
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

// ─── Resolve replay targets (files and folders → .pw file list) ──────────────

export function resolveReplayFiles(targets: string[], extensions = ['.pw']): string[] {
  const files: string[] = [];
  for (const target of targets) {
    if (fs.statSync(target).isDirectory()) {
      const entries = fs.readdirSync(target)
        .filter(f => extensions.some(ext => f.endsWith(ext)))
        .sort()
        .map(f => path.join(target, f));
      files.push(...entries);
    } else {
      files.push(target);
    }
  }
  return files;
}

// Load commands from a .pw or .js file, buffering multiline JS expressions.
export function loadReplayFile(file: string): string[] {
  const content = fs.readFileSync(file, 'utf-8');
  const commands: string[] = [];
  let buffer = '';
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    buffer = buffer ? buffer + '\n' + line : line;
    if (isComplete(buffer)) {
      commands.push(buffer);
      buffer = '';
    }
  }
  if (buffer.trim()) commands.push(buffer.trim());
  return commands;
}

// ─── Replay mode (non-interactive, --replay flag) ───────────────────────────

export async function runReplayMode(ctx: ReplContext, replayFile: string, step: boolean): Promise<void> {
  try {
    const player = ctx.session.startReplay(replayFile, step);
    console.log(`${c.blue}▶${c.reset} Replaying ${c.bold}${replayFile}${c.reset} (${player.commands.length} commands)\n`);
    while (!player.done) {
      const cmd = player.next()!;
      console.log(`${c.dim}${player.progress}${c.reset} ${cmd}`);
      await processLine(ctx, cmd);

      if (ctx.session.step && !player.done) {
        await new Promise<void>((resolve) => {
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
    await ctx.conn.close();
    process.exit(0);
  } catch (err: unknown) {
    console.error(`${c.red}Error:${c.reset} ${(err as Error).message}`);
    await ctx.conn.close();
    process.exit(1);
  }
}

// ─── Multi-file replay mode (--replay with multiple files/folders) ───────────

interface FileResult {
  file: string;
  passed: boolean;
  commands: number;
  error?: string;
}

export async function runMultiReplayMode(ctx: ReplContext, targets: string[], step: boolean): Promise<void> {
  const files = resolveReplayFiles(targets);
  if (files.length === 0) {
    console.error(`${c.red}Error:${c.reset} No .pw files found`);
    await ctx.conn.close();
    process.exit(1);
  }

  // Single file → delegate to existing replay mode
  if (files.length === 1) {
    return runReplayMode(ctx, files[0], step);
  }

  const logFile = `replay-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  const logLines: string[] = [];
  const log = (line: string) => logLines.push(line);

  console.log(`${c.blue}▶${c.reset} Running ${c.bold}${files.length}${c.reset} files\n`);
  log(`Replay started ${new Date().toISOString()}`);
  log(`Files: ${files.length}\n`);

  const results: FileResult[] = [];
  const totalStart = performance.now();

  for (const file of files) {
    const basename = path.basename(file);
    log(`=== ${basename} ===`);
    console.log(`${c.blue}▶${c.reset} ${c.bold}${basename}${c.reset}`);
    const fileStart = performance.now();

    let passed = true;
    let commandsRun = 0;
    let errorMsg: string | undefined;

    try {
      const player = ctx.session.startReplay(file, step);
      const total = player.commands.length;

      while (!player.done) {
        const cmd = player.next()!;
        commandsRun++;
        const errsBefore = ctx.errors;

        log(`[${commandsRun}/${total}] ${cmd}`);
        console.log(`  ${c.dim}[${commandsRun}/${total}]${c.reset} ${cmd}`);
        await processLine(ctx, cmd);

        if (ctx.errors > errsBefore) {
          passed = false;
          errorMsg = `failed at command ${commandsRun}/${total}: ${cmd}`;
          log(`  FAIL`);
          break;
        }
        log(`  OK`);
      }
      ctx.session.endReplay();
    } catch (err: unknown) {
      passed = false;
      errorMsg = (err as Error).message;
      log(`  FAIL: ${errorMsg}`);
      try { ctx.session.endReplay(); } catch { /* ignore */ }
    }

    const fileElapsed = ((performance.now() - fileStart) / 1000).toFixed(1);
    const status = passed ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
    log(passed ? `PASS ${basename} (${commandsRun} commands, ${fileElapsed}s)` : `FAIL ${basename} (${errorMsg})`);
    console.log(`  ${status} ${basename} ${c.dim}(${fileElapsed}s)${c.reset}\n`);
    log('');

    results.push({ file: basename, passed, commands: commandsRun, error: errorMsg });
  }

  // Summary
  const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(1);
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;

  log(`=== Summary ===`);
  console.log(`${c.bold}─── Results ───${c.reset}`);
  for (const r of results) {
    const icon = r.passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    const suffix = r.error ? ` — ${r.error}` : '';
    console.log(`  ${icon} ${r.file}${suffix}`);
    log(`${r.passed ? 'PASS' : 'FAIL'} ${r.file}${r.error ? ` — ${r.error}` : ''}`);
  }

  const summary = `\n${passCount} passed, ${failCount} failed (${results.length} total, ${totalElapsed}s)`;
  console.log(summary);
  log(summary);

  // Write log file
  fs.writeFileSync(logFile, logLines.join('\n') + '\n', 'utf-8');
  console.log(`${c.dim}Log: ${logFile}${c.reset}`);

  await ctx.conn.close();
  process.exit(failCount > 0 ? 1 : 0);
}

// ─── Command loop (interactive) ─────────────────────────────────────────────

export function startCommandLoop(ctx: ReplContext): void {
  let processing = false;
  const commandQueue: string[] = [];

  async function processQueue() {
    if (processing) return;
    processing = true;
    while (commandQueue.length > 0) {
      const line = commandQueue.shift()!;
      await processLine(ctx, line);
      if (line.trim()) {
        ctx.sessionHistory.push(line.trim());
        try {
          fs.mkdirSync(path.dirname(ctx.historyFile), { recursive: true });
          fs.appendFileSync(ctx.historyFile, line.trim() + '\n');
        } catch (err: unknown) {
          console.error(`${c.dim}Warning: could not write history: ${(err as Error).message}${c.reset}`);
        }
      }
    }
    processing = false;
    ctx.rl!.prompt();
  }

  ctx.rl!.prompt();

  ctx.rl!.on('line', (line: string) => {
    commandQueue.push(line);
    processQueue();
  });

  ctx.rl!.on('close', async () => {
    while (processing || commandQueue.length > 0) {
      await new Promise(r => setTimeout(r, 50));
    }
    ctx.log(`\n${c.dim}Closing browser...${c.reset}`);
    await ctx.conn.close();
    process.exit(0);
  });

  let lastSigint = 0;
  ctx.rl!.on('SIGINT', () => {
    const now = Date.now();
    if (now - lastSigint < 500) {
      ctx.conn.close().finally(() => process.exit(0));
      return;
    }
    lastSigint = now;
    ctx.log(`\n${c.dim}(Ctrl+C again to exit, or type .exit)${c.reset}`);
    ctx.rl!.prompt();
  });
}

// ─── Prompt string ──────────────────────────────────────────────────────────

export function promptStr(ctx: ReplContext): string {
  const mode = ctx.session.mode;
  const prefix = mode === 'recording' ? `${c.red}⏺${c.reset} `
               : mode === 'paused'    ? `${c.yellow}⏸${c.reset} `
               : '';
  return `${prefix}${c.cyan}pw>${c.reset} `;
}

// ─── Ghost completion (inline suggestion) ───────────────────────────────────

/**
 * Returns matching commands for ghost completion.
 * When the input exactly matches a command AND there are longer matches,
 * the exact match is included so the user can cycle through all options.
 */
export function getGhostMatches(cmds: string[], input: string): string[] {
  if (input.length > 0) {
    // Only match commands with spaces if the input itself contains a space
    const candidates = input.includes(' ')
      ? cmds.filter(cmd => cmd.includes(' '))
      : cmds;
    const longer = candidates.filter(cmd => cmd.startsWith(input) && cmd !== input);
    if (longer.length > 0 && cmds.includes(input)) longer.push(input);
    return longer;
  }
  return [];
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function attachGhostCompletion(rl: any, items: CompletionItem[]): void {
  if (!process.stdin.isTTY) return;  // no ghost text for piped input

  const cmds = items.map((i: CompletionItem) => i.cmd);
  let ghost = '';
  let matches: string[] = [];   // all matching commands for current input
  let matchIdx = 0;   // which match is currently shown

  function renderGhost(suffix: string) {
    ghost = suffix;
    rl.output.write(`\x1b[2m${ghost}\x1b[0m\x1b[${ghost.length}D`);
  }

  const origTtyWrite = rl._ttyWrite.bind(rl);
  rl._ttyWrite = function (s: string, key: { name: string }) {
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
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Multi-line completion check ────────────────────────────────────────────

/**
 * Returns true if the code string has balanced brackets/parens/braces.
 * Used to detect multi-line continuation in bridge mode.
 */
function isComplete(code: string): boolean {
  let depth = 0;
  let inStr: string | null = null;
  for (let i = 0; i < code.length; i++) {
    const ch = code[i];
    if (inStr) {
      if (ch === '\\') { i++; continue; }
      if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      inStr = ch;
    } else if (ch === '{' || ch === '(' || ch === '[') {
      depth++;
    } else if (ch === '}' || ch === ')' || ch === ']') {
      depth--;
    }
  }
  return depth <= 0;
}

// ─── Bridge shared helpers ───────────────────────────────────────────────────

function displayBridgeResult(result: EngineResult, silent: boolean): void {
  if (result.image) {
    const isPdf = result.image.startsWith('data:application/pdf');
    const outDir = path.join(os.homedir(), isPdf ? 'pw-pdfs' : 'pw-screenshots');
    fs.mkdirSync(outDir, { recursive: true });
    const ext = isPdf ? '.pdf' : '.png';
    const prefix = isPdf ? 'pw-pdf' : 'pw-screenshot';
    const outPath = path.join(outDir, `${prefix}-${Date.now()}${ext}`);
    const b64 = result.image.replace(/^data:[^;]+;base64,/, '');
    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));
    if (!silent) console.log(`${isPdf ? 'PDF' : 'Screenshot'} saved to ${outPath}`);
  } else if (result.text) {
    const t = result.text.trim();
    if (!result.isError && (t.startsWith('{') || t.startsWith('['))) {
      console.log(prettyJson(t));
    } else {
      console.log(result.isError ? `${c.red}${result.text}${c.reset}` : result.text);
    }
  }
}

// ─── Bridge replay mode ──────────────────────────────────────────────────────

async function runSingleBridgeFile(
  srv: BridgeServer,
  file: string,
  step: boolean,
  silent: boolean,
  prefixed = false,
): Promise<{ passed: boolean; commandsRun: number; errorMsg?: string }> {
  const log = (...args: unknown[]) => { if (!silent) console.log(...args); };
  const commands = loadReplayFile(file);

  if (!prefixed) {
    log(`${c.blue}▶${c.reset} Replaying ${c.bold}${file}${c.reset} (${commands.length} commands)\n`);
  }

  let commandsRun = 0;
  for (const cmd of commands) {
    commandsRun++;
    const indent = prefixed ? '  ' : '';
    log(`${indent}${c.dim}[${commandsRun}/${commands.length}]${c.reset} ${cmd}`);

    const startTime = performance.now();
    const result = await srv.run(cmd);
    const elapsed = (performance.now() - startTime).toFixed(0);
    displayBridgeResult(result, silent);
    log(`${c.dim}(${elapsed}ms)${c.reset}`);

    if (result.isError) {
      return { passed: false, commandsRun, errorMsg: `failed at [${commandsRun}/${commands.length}]: ${cmd}` };
    }

    if (step && commandsRun < commands.length) {
      await new Promise<void>((resolve) => {
        process.stdout.write(`${c.dim}  Press Enter to continue...${c.reset}`);
        process.stdin.once('data', () => { process.stdout.write('\r\x1b[K'); resolve(); });
      });
    }
  }

  if (!prefixed) log(`\n${c.green}✓${c.reset} Replay complete`);
  return { passed: true, commandsRun };
}

async function runBridgeReplayMode(opts: ReplOpts, srv: BridgeServer): Promise<void> {
  const silent = opts.silent || false;
  const log = (...args: unknown[]) => { if (!silent) console.log(...args); };

  log('Waiting for extension to connect...');
  try {
    await srv.waitForConnection(30000);
  } catch (err: unknown) {
    console.error(`${c.red}Error:${c.reset} ${(err as Error).message}`);
    await srv.close();
    process.exit(1);
  }
  log(`${c.green}✓${c.reset} Extension connected`);

  const files = resolveReplayFiles(opts.replay!, ['.pw', '.js']);
  if (files.length === 0) {
    console.error(`${c.red}Error:${c.reset} No .pw or .js files found`);
    await srv.close();
    process.exit(1);
  }

  if (files.length === 1) {
    const { passed } = await runSingleBridgeFile(srv, files[0], opts.step || false, silent);
    await srv.close();
    process.exit(passed ? 0 : 1);
  }

  // Multi-file
  log(`${c.blue}▶${c.reset} Running ${c.bold}${files.length}${c.reset} files\n`);
  const results: { file: string; passed: boolean; commands: number; error?: string }[] = [];
  const totalStart = performance.now();

  for (const file of files) {
    const basename = path.basename(file);
    log(`${c.blue}▶${c.reset} ${c.bold}${basename}${c.reset}`);
    const fileStart = performance.now();
    const { passed, commandsRun, errorMsg } = await runSingleBridgeFile(srv, file, opts.step || false, silent, true);
    const fileElapsed = ((performance.now() - fileStart) / 1000).toFixed(1);
    const status = passed ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
    log(`  ${status} ${basename} ${c.dim}(${fileElapsed}s)${c.reset}\n`);
    results.push({ file: basename, passed, commands: commandsRun, error: errorMsg });
  }

  const totalElapsed = ((performance.now() - totalStart) / 1000).toFixed(1);
  const passCount = results.filter(r => r.passed).length;
  const failCount = results.filter(r => !r.passed).length;

  log(`${c.bold}─── Results ───${c.reset}`);
  for (const r of results) {
    const icon = r.passed ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
    log(`  ${icon} ${r.file}${r.error ? ` — ${r.error}` : ''}`);
  }
  log(`\n${passCount} passed, ${failCount} failed (${results.length} total, ${totalElapsed}s)`);

  await srv.close();
  process.exit(failCount > 0 ? 1 : 0);
}

// ─── Bridge REPL loop ────────────────────────────────────────────────────────

async function startBridgeLoop(opts: ReplOpts, srv: BridgeServer): Promise<void> {
  const silent = opts.silent || false;
  const log = (...args: unknown[]) => { if (!silent) console.log(...args); };

  const historyDir = path.join(os.homedir(), '.playwright-repl');
  const historyFile = path.join(historyDir, '.repl-history');
  const sessionHistory: string[] = [];
  let lastSnapshot: { url: string; snapshotString: string } | null = null;

  const promptReady = `${c.cyan}pw>${c.reset} `;
  const promptCont  = `${c.dim}...${c.reset} `;

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: promptReady,
    historySize: 500,
  });

  try {
    const hist = fs.readFileSync(historyFile, 'utf-8').split('\n').filter(Boolean).reverse();
    for (const line of hist) (rl as readline.Interface & { history: string[] }).history.push(line);
  } catch { /* ignore */ }

  attachGhostCompletion(rl, buildCompletionItems());

  let buffer = '';
  let processing = false;
  const commandQueue: string[] = [];

  async function handleLine(line: string): Promise<void> {
    // Multi-line accumulation
    buffer = buffer ? buffer + '\n' + line : line;
    if (!isComplete(buffer)) {
      rl.setPrompt(promptCont);
      return;
    }
    const command = buffer.trim();
    buffer = '';
    rl.setPrompt(promptReady);

    if (!command || command.startsWith('#')) return;

    // Meta-commands
    if (command === '.exit' || command === '.quit') {
      await srv.close();
      process.exit(0);
    }
    if (command === '.clear') { console.clear(); return; }
    if (command === '.history clear') { sessionHistory.length = 0; log('History cleared.'); return; }
    if (command === '.history') { log(sessionHistory.length ? sessionHistory.join('\n') : '(no history)'); return; }
    if (command === '.help' || command === '?') { showHelp(true); return; }
    if (command.startsWith('.help ')) { showCommandHelp(command.slice(6).trim(), true); return; }
    if (command === '.aliases') { showAliases(); return; }

    // Record to history
    sessionHistory.push(command);
    try {
      fs.mkdirSync(path.dirname(historyFile), { recursive: true });
      fs.appendFileSync(historyFile, command + '\n');
    } catch (err: unknown) {
      console.error(`${c.dim}Warning: could not write history: ${(err as Error).message}${c.reset}`);
    }

    // Locator (local — uses cached snapshot)
    if (command.startsWith('locator ')) {
      const ref = command.slice(8).trim();
      if (!lastSnapshot) {
        log(`${c.yellow}No snapshot cached. Run "snapshot" first.${c.reset}`);
        return;
      }
      const locator = refToLocator(lastSnapshot.snapshotString, ref);
      if (!locator) {
        log(`${c.yellow}Ref "${ref}" not found in last snapshot.${c.reset}`);
        return;
      }
      log(`js: ${locator.js}\npw: ${locator.pw}`);
      return;
    }

    if (!srv.connected) {
      log(`${c.yellow}[not connected] Waiting for extension...${c.reset}`);
      return;
    }

    const startTime = performance.now();
    const runOpts = opts.includeSnapshot ? { includeSnapshot: true } : undefined;
    const result = await srv.run(command, runOpts);
    const elapsed = (performance.now() - startTime).toFixed(0);
    // Cache snapshot for locator command
    if (result?.text && !result.isError) {
      const snapMatch = result.text.match(/### Snapshot\n([\s\S]+)$/);
      if (snapMatch) {
        lastSnapshot = { url: '', snapshotString: snapMatch[1].trim() };
      } else if (command.trim().startsWith('snapshot')) {
        lastSnapshot = { url: '', snapshotString: result.text.trim() };
      }
    }
    displayBridgeResult(result, silent);
    log(`${c.dim}(${elapsed}ms)${c.reset}`);
  }

  async function processQueue(): Promise<void> {
    if (processing) return;
    processing = true;
    while (commandQueue.length > 0) {
      await handleLine(commandQueue.shift()!);
    }
    processing = false;
    rl.prompt();
  }

  // Print a status message above the current prompt line
  function printStatus(msg: string) {
    process.stdout.write('\r\x1b[K'); // clear current prompt line
    console.log(msg);
    rl.prompt(true);
  }

  if (!silent) {
    srv.onConnect(()    => printStatus(`${c.green}✓${c.reset} Extension connected`));
    srv.onDisconnect(() => printStatus(`${c.yellow}Extension disconnected${c.reset}`));
  }

  rl.prompt();
  rl.on('line', (line: string) => { commandQueue.push(line); processQueue(); });
  rl.on('close', async () => { await srv.close(); process.exit(0); });
  rl.on('SIGINT', () => {
    if (buffer) { buffer = ''; rl.setPrompt(promptReady); rl.prompt(); }
    else rl.close();
  });
}

// ─── REPL ────────────────────────────────────────────────────────────────────

export async function startRepl(opts: ReplOpts = {}): Promise<void> {
  const silent = opts.silent || false;
  const log = (...args: unknown[]) => { if (!silent) console.log(...args); };

  log(`${c.bold}${c.magenta}🎭 Playwright REPL${c.reset} ${c.dim}v${replVersion}${c.reset}`);

  // ─── Standalone mode (new: serviceWorker.evaluate) ─────────────

  if (!opts.bridge && !opts.connect) {
    const { EvaluateConnection, findExtensionPath } = await import('@playwright-repl/core');
    const extPath = process.env.VITEST ? null : findExtensionPath(import.meta.url);
    if (extPath) {
      const conn = new EvaluateConnection();
      log(`${c.dim}Launching Chromium with extension...${c.reset}`);
      try {
        const { chromium } = await import('playwright');
        // Default to headed for evaluate mode (interactive REPL with extension)
        await conn.start(extPath, { headed: opts.headed ?? true, chromium });
        log(`${c.green}✓${c.reset} Browser ready (with extension)`);
        log(`${c.dim}Type .help for commands, JavaScript supported${c.reset}\n`);
        if (opts.replay && opts.replay.length > 0) {
          await runBridgeReplayMode(opts, conn as any);
        } else {
          await startBridgeLoop(opts, conn as any);
        }
        return;
      } catch (err: unknown) {
        log(`${c.yellow}⚠${c.reset} ${c.dim}Could not launch with extension: ${(err as Error).message}${c.reset}`);
        log(`${c.dim}Falling back to standard engine...${c.reset}\n`);
      }
    }
  }

  // ─── Bridge mode ─────────────────────────────────────────────────

  if (opts.bridge) {
    const port = opts.bridgePort ?? 9876;
    const srv = new BridgeServer();
    await srv.start(port);
    log(`Bridge server listening on ws://localhost:${port}`);
    if (opts.replay && opts.replay.length > 0) {
      await runBridgeReplayMode(opts, srv);
    } else {
      log('Waiting for extension to connect...');
      await startBridgeLoop(opts, srv);
    }
    return;
  }

  // ─── Start engine (fallback) ────────────────────────────────────

  log(`${c.dim}Type .help for commands${c.reset}\n`);

  const conn = new Engine();
  try {
    await conn.start(opts);
    log(`${c.green}✓${c.reset} Browser ready\n`);
  } catch (err: unknown) {
    console.error(`${c.red}✗${c.reset} Failed to start: ${(err as Error).message}`);
    process.exit(1);
  }

  // ─── Session + readline ──────────────────────────────────────────

  const session = new SessionManager();
  const historyDir = path.join(os.homedir(), '.playwright-repl');
  const historyFile = path.join(historyDir, '.repl-history');
  const ctx: ReplContext = { conn, session, rl: null, opts, log, historyFile, sessionHistory: [], commandCount: 0, errors: 0 };

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
    for (const line of hist) (rl as readline.Interface & { history: string[] }).history.push(line);
  } catch { /* ignore */ }

  attachGhostCompletion(rl, buildCompletionItems());

  // ─── Start ───────────────────────────────────────────────────────

  if (opts.replay && opts.replay.length > 0) {
    await runMultiReplayMode(ctx, opts.replay, opts.step || false);
  } else {
    startCommandLoop(ctx);
  }
}
