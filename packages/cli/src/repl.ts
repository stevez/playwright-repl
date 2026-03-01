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
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  Engine,
} from '@playwright-repl/core';
import type { EngineOpts, ParsedArgs } from '@playwright-repl/core';
import { SessionManager } from './recorder.js';
import type { CompletionItem } from '@playwright-repl/core';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ReplOpts extends EngineOpts {
  session?: string;
  replay?: string[];
  record?: string;
  step?: boolean;
  silent?: boolean;
}

export interface ReplContext {
  conn: Engine;
  session: SessionManager;
  rl: readline.Interface | null;
  opts: ReplOpts;
  log: (...args: unknown[]) => void;
  historyFile: string;
  commandCount: number;
  errors: number;
}

// ─── Response filtering ─────────────────────────────────────────────────────

export function filterResponse(text: string, cmdName?: string): string | null {
  const sections = text.split(/^### /m).slice(1);
  const kept: string[] = [];
  for (const section of sections) {
    const newline = section.indexOf('\n');
    if (newline === -1) continue;
    const title = section.substring(0, newline).trim();
    const content = section.substring(newline + 1).trim();
    if (title === 'Error')
      kept.push(`${c.red}${content}${c.reset}`);
    else if (title === 'Snapshot' && cmdName !== 'snapshot')
      continue;
    else if (title === 'Result' || title === 'Modal state' || title === 'Page' || title === 'Snapshot')
      kept.push(content);
  }
  return kept.length > 0 ? kept.join('\n') : null;
}

// ─── Meta-command handlers ──────────────────────────────────────────────────

export function showHelp(): void {
  console.log(`\n${c.bold}Available commands:${c.reset}`);
  const categories: Record<string, string[]> = {
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

  // ── Regular command — parse and send ─────────────────────────────

  let args: ParsedArgs | null = parseInput(line);
  if (!args) return;

  const cmdName = args._[0];
  if (!cmdName) return;

  // Validate command exists
  const knownExtras = ['help', 'list', 'close-all', 'kill-all', 'install', 'install-browser',
                       'verify', 'verify-text', 'verify-element', 'verify-value', 'verify-list',
                       'verify-title', 'verify-url', 'verify-no-text', 'verify-no-element'];
  if (!ALL_COMMANDS.includes(cmdName) && !knownExtras.includes(cmdName)) {
    console.log(`${c.yellow}Unknown command: ${cmdName}${c.reset}`);
    console.log(`${c.dim}Type .help for available commands${c.reset}`);
    return;
  }

  // ── Session-level commands (not forwarded to daemon) ──────────
  if (cmdName === 'kill-all') return handleKillAll(ctx) as unknown as void;
  if (cmdName === 'close' || cmdName === 'close-all') return handleClose(ctx) as unknown as void;

  // ── Unified verify command → run-code translation ──────────
  type PageScriptFn = (...fnArgs: unknown[]) => Promise<void>;
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
    else if (subType === 'list' && rest.length >= 2)
      translated = buildRunCode(verifyList as PageScriptFn, rest[0], rest.slice(1));
    if (translated) {
      args = translated;
    } else {
      console.log(`${c.yellow}Usage: verify <title|url|text|no-text|element|no-element|value|list> <args>${c.reset}`);
      return;
    }
  }

  // ── Legacy verify-* commands (backward compat) ─────────────
  const verifyFns: Record<string, PageScriptFn> = {
    'verify-text': verifyText as PageScriptFn,
    'verify-element': verifyElement as PageScriptFn,
    'verify-value': verifyValue as PageScriptFn,
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
    } else if (cmdName === 'verify-no-element' || cmdName === 'verify-element') {
      if (pos[0] && pos.length >= 2) translated = buildRunCode(fn, pos[0], pos.slice(1).join(' '));
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
  const textFns: Record<string, PageScriptFn> = {
    click: actionByText as PageScriptFn, dblclick: actionByText as PageScriptFn, hover: actionByText as PageScriptFn,
    fill: fillByText as PageScriptFn, select: selectByText as PageScriptFn, check: checkByText as PageScriptFn, uncheck: uncheckByText as PageScriptFn,
  };
  if (textFns[cmdName] && args._[1] && !/^e\d+$/.test(args._[1])) {
    const textArg = args._[1];
    const extraArgs = args._.slice(2);
    const fn = textFns[cmdName];
    const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
    let runCodeArgs: ParsedArgs;
    if (fn === actionByText) runCodeArgs = buildRunCode(fn, textArg, cmdName, nth);
    else if (cmdName === 'fill' || cmdName === 'select') runCodeArgs = buildRunCode(fn, textArg, extraArgs[0] || '', nth);
    else runCodeArgs = buildRunCode(fn, textArg, nth);
    const argsHint = extraArgs.length > 0 ? ` ${extraArgs.join(' ')}` : '';
    const nthHint = nth !== undefined ? ` --nth ${nth}` : '';
    ctx.log(`${c.dim}→ ${cmdName} "${textArg}"${argsHint}${nthHint} (via run-code)${c.reset}`);
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
      const filtered = filterResponse(result.text, cmdName);
      if (filtered !== null) console.log(filtered);
    }
    if (result?.isError) ctx.errors++;
    ctx.commandCount++;
    ctx.session.record(line);

    if (Number(elapsed) > 500) {
      ctx.log(`${c.dim}(${elapsed}ms)${c.reset}`);
    }
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

export function resolveReplayFiles(targets: string[]): string[] {
  const files: string[] = [];
  for (const target of targets) {
    if (fs.statSync(target).isDirectory()) {
      const entries = fs.readdirSync(target)
        .filter(f => f.endsWith('.pw'))
        .sort()
        .map(f => path.join(target, f));
      files.push(...entries);
    } else {
      files.push(target);
    }
  }
  return files;
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
    ctx.conn.close();
    process.exit(0);
  } catch (err: unknown) {
    console.error(`${c.red}Error:${c.reset} ${(err as Error).message}`);
    ctx.conn.close();
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
    ctx.conn.close();
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

  for (const file of files) {
    const basename = path.basename(file);
    log(`=== ${basename} ===`);
    console.log(`${c.blue}▶${c.reset} ${c.bold}${basename}${c.reset}`);

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

    const status = passed ? `${c.green}PASS${c.reset}` : `${c.red}FAIL${c.reset}`;
    log(passed ? `PASS ${basename} (${commandsRun} commands)` : `FAIL ${basename} (${errorMsg})`);
    console.log(`  ${status} ${basename}\n`);
    log('');

    results.push({ file: basename, passed, commands: commandsRun, error: errorMsg });
  }

  // Summary
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

  const summary = `\n${passCount} passed, ${failCount} failed (${results.length} total)`;
  console.log(summary);
  log(summary);

  // Write log file
  fs.writeFileSync(logFile, logLines.join('\n') + '\n', 'utf-8');
  console.log(`${c.dim}Log: ${logFile}${c.reset}`);

  ctx.conn.close();
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
        try {
          fs.mkdirSync(path.dirname(ctx.historyFile), { recursive: true });
          fs.appendFileSync(ctx.historyFile, line.trim() + '\n');
        } catch { /* ignore */ }
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
    ctx.conn.close();
    process.exit(0);
  });

  let lastSigint = 0;
  ctx.rl!.on('SIGINT', () => {
    if (ctx.opts?.extension) {
      ctx.conn.close();
      process.exit(0);
    }
    const now = Date.now();
    if (now - lastSigint < 500) {
      ctx.conn.close();
      process.exit(0);
    }
    lastSigint = now;
    ctx.log(`\n${c.dim}(Ctrl+C again to exit, or type .exit)${c.reset}`);
    ctx.rl!.prompt();
  });
}

// ─── Prompt string ──────────────────────────────────────────────────────────

export function promptStr(ctx: ReplContext): string {
  if (ctx.opts?.extension) return '';
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
  if (input.length > 0 && !input.includes(' ')) {
    const longer = cmds.filter(cmd => cmd.startsWith(input) && cmd !== input);
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

// ─── REPL ────────────────────────────────────────────────────────────────────

export async function startRepl(opts: ReplOpts = {}): Promise<void> {
  const silent = opts.silent || false;
  const log = (...args: unknown[]) => { if (!silent) console.log(...args); };

  log(`${c.bold}${c.magenta}🎭 Playwright REPL${c.reset} ${c.dim}v${replVersion}${c.reset}`);

  // ─── Start engine ────────────────────────────────────────────────

  if (opts.extension) {
    log(`${c.dim}Extension mode: starting CDP relay server...${c.reset}`);
    log('');
  } else {
    log(`${c.dim}Type .help for commands${c.reset}\n`);
  }

  const conn = new Engine();
  try {
    await conn.start(opts);
    if (opts.extension)
      log(`${c.green}✓${c.reset} Extension connected, ready for commands\n`);
    else
      log(`${c.green}✓${c.reset} Browser ready\n`);
  } catch (err: unknown) {
    console.error(`${c.red}✗${c.reset} Failed to start: ${(err as Error).message}`);
    process.exit(1);
  }

  // ─── Session + readline ──────────────────────────────────────────

  const session = new SessionManager();
  const historyDir = path.join(os.homedir(), '.playwright-repl');
  const historyFile = path.join(historyDir, '.repl-history');
  const ctx: ReplContext = { conn, session, rl: null, opts, log, historyFile, commandCount: 0, errors: 0 };

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
