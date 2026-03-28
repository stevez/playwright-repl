import * as vscode from 'vscode';
import type { BrowserManager } from './browser.js';
import { createRequire } from 'node:module';

// ─── ANSI helpers ──────────────────────────────────────────────────────────

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

// ─── Lazy-loaded core module ──────────────────────────────────────────────

let _core: any;
function core() {
  if (!_core) {
    const _require = createRequire(__filename);
    _core = _require('@playwright-repl/core');
  }
  return _core;
}

// ─── PlaywrightRepl ────────────────────────────────────────────────────────

export class PlaywrightRepl {
  private _terminal: vscode.Terminal | undefined;
  private _writeEmitter = new vscode.EventEmitter<string>();
  private _closeEmitter = new vscode.EventEmitter<number | void>();
  private _buffer = '';
  private _history: string[] = [];
  private _historyIndex = -1;
  private _browserManager: BrowserManager | undefined;
  private _processing = false;
  private _lastSnapshot = '';
  private _commandCount = 0;
  disposed = false;

  constructor(browserManager?: BrowserManager) {
    this._browserManager = browserManager;
  }

  setBrowserManager(browserManager: BrowserManager) {
    this._browserManager = browserManager;
  }

  show() {
    if (this._terminal) {
      this._terminal.show();
      return;
    }

    const pty: vscode.Pseudoterminal = {
      onDidWrite: this._writeEmitter.event,
      onDidClose: this._closeEmitter.event,
      open: () => this._onOpen(),
      close: () => this._onClose(),
      handleInput: (data: string) => this._onInput(data),
    };

    this._terminal = vscode.window.createTerminal({
      name: 'Playwright REPL',
      pty,
    });
    this._terminal.show();
  }

  private _onOpen() {
    this._writeEmitter.fire(`${GREEN}Playwright REPL${RESET}\r\n`);
    this._writeEmitter.fire(`${DIM}Type Playwright commands. Use ↑↓ for history.${RESET}\r\n`);
    this._prompt();
  }

  private _onClose() {
    this.disposed = true;
    this._terminal = undefined;
  }

  private _prompt() {
    this._writeEmitter.fire(`${GREEN}>${RESET} `);
  }

  private async _onInput(data: string) {
    // Enter
    if (data === '\r') {
      this._writeEmitter.fire('\r\n');
      const command = this._buffer.trim();
      this._buffer = '';
      this._historyIndex = -1;

      if (command) {
        this._history.unshift(command);
        if (this._history.length > 100) this._history.pop();
        await this._execute(command);
      }
      this._prompt();
      return;
    }

    // Backspace
    if (data === '\x7f') {
      if (this._buffer.length > 0) {
        this._buffer = this._buffer.slice(0, -1);
        this._writeEmitter.fire('\b \b');
      }
      return;
    }

    // Escape sequences (arrows)
    if (data.startsWith('\x1b[')) {
      const code = data.slice(2);
      // Up arrow — history back
      if (code === 'A') {
        if (this._historyIndex < this._history.length - 1) {
          this._historyIndex++;
          this._replaceLine(this._history[this._historyIndex]!);
        }
        return;
      }
      // Down arrow — history forward
      if (code === 'B') {
        if (this._historyIndex > 0) {
          this._historyIndex--;
          this._replaceLine(this._history[this._historyIndex]!);
        } else if (this._historyIndex === 0) {
          this._historyIndex = -1;
          this._replaceLine('');
        }
        return;
      }
      // Ignore left/right for now
      return;
    }

    // Ctrl+C
    if (data === '\x03') {
      this._buffer = '';
      this._writeEmitter.fire('^C\r\n');
      this._prompt();
      return;
    }

    // Ctrl+D — close
    if (data === '\x04') {
      this._closeEmitter.fire();
      return;
    }

    // Regular character
    this._buffer += data;
    this._writeEmitter.fire(data);
  }

  private _replaceLine(text: string) {
    // Clear current line, rewrite
    const clearLen = this._buffer.length;
    this._writeEmitter.fire('\b'.repeat(clearLen) + ' '.repeat(clearLen) + '\b'.repeat(clearLen));
    this._buffer = text;
    this._writeEmitter.fire(text);
  }

  private _write(text: string) {
    const lines = text.split('\n');
    for (const line of lines) {
      this._writeEmitter.fire(`${line}\r\n`);
    }
  }

  private _handleLocal(command: string): boolean {
    const trimmed = command.trim();

    if (trimmed === '.clear') {
      this._writeEmitter.fire('\x1b[2J\x1b[H');
      return true;
    }

    if (trimmed === 'help' || trimmed === '.help') {
      const { CATEGORIES } = core();
      const lines = Object.entries(CATEGORIES)
        .map(([cat, cmds]: [string, string[]]) => `  ${cat}: ${(cmds as string[]).join(', ')}`)
        .join('\n');
      this._write(`${CYAN}Available commands:${RESET}\n${lines}\n\nType "help <command>" for details.`);
      return true;
    }

    if (trimmed.startsWith('help ')) {
      const cmd = trimmed.slice(5).trim();
      const { COMMANDS } = core();
      const info = COMMANDS[cmd];
      if (!info) {
        this._write(`${RED}Unknown command: "${cmd}". Type "help" for available commands.${RESET}`);
        return true;
      }
      const parts = [`${cmd} — ${info.desc}`];
      if (info.usage) parts.push(`Usage: ${info.usage}`);
      if (info.examples?.length) {
        parts.push('Examples:');
        for (const ex of info.examples) parts.push(`  ${ex}`);
      }
      this._write(parts.join('\n'));
      return true;
    }

    if (trimmed === '.history') {
      this._write(this._history.length ? this._history.slice().reverse().join('\n') : '(no history)');
      return true;
    }
    if (trimmed === '.history clear') {
      this._history.length = 0;
      this._write('History cleared.');
      return true;
    }

    if (trimmed === '.aliases') {
      const { ALIASES } = core();
      const grouped: Record<string, string[]> = {};
      for (const [alias, cmd] of Object.entries(ALIASES) as [string, string][]) {
        if (!grouped[cmd]) grouped[cmd] = [];
        grouped[cmd].push(alias);
      }
      const lines = Object.entries(grouped)
        .map(([cmd, aliases]) => `  ${aliases.join(', ')} → ${cmd}`)
        .join('\n');
      this._write(`${CYAN}Aliases:${RESET}\n${lines}`);
      return true;
    }

    if (trimmed === '.status') {
      const running = this._browserManager?.isRunning() ?? false;
      const bridge = this._browserManager?.bridge?.connected ?? false;
      this._write(
        `Browser: ${running ? `${GREEN}running${RESET}` : `${RED}stopped${RESET}`}\n` +
        `Bridge: ${bridge ? `${GREEN}connected${RESET}` : `${RED}disconnected${RESET}`}\n` +
        `Commands: ${this._commandCount}`
      );
      return true;
    }

    if (trimmed.startsWith('locator ')) {
      const ref = trimmed.slice(8).trim();
      if (!this._lastSnapshot) {
        this._write(`${RED}No snapshot cached. Run "snapshot" first.${RESET}`);
        return true;
      }
      const { refToLocator } = core();
      const result = refToLocator(this._lastSnapshot, ref);
      if (!result) {
        this._write(`${RED}Ref "${ref}" not found in last snapshot. Run "snapshot" to refresh.${RESET}`);
        return true;
      }
      this._write(`js: page.${result.js}\npw: ${result.pw}`);
      return true;
    }

    return false;
  }

  private async _execute(command: string) {
    if (this._processing) return;
    this._processing = true;

    if (this._handleLocal(command)) {
      this._processing = false;
      return;
    }

    if (!this._browserManager?.isRunning()) {
      this._writeEmitter.fire(`${RED}Browser not running. Use Ctrl+Shift+P → "Playwright REPL: Launch Browser" first.${RESET}\r\n`);
      this._processing = false;
      return;
    }

    this._commandCount++;
    const start = Date.now();
    try {
      const result = await this._browserManager.runCommand(command);
      const elapsed = Date.now() - start;

      // Cache snapshot for locator command
      if (/^(snapshot|snap|s)(\s|$)/.test(command) && result.text && !result.isError)
        this._lastSnapshot = result.text;

      if (!result.text) {
        this._writeEmitter.fire(`${DIM}Done. (${elapsed}ms)${RESET}\r\n`);
        this._processing = false;
        return;
      }
      // Strip markdown section headers (### Result, ### Error, etc.)
      const text = result.text.replace(/^### \w[\w ]*\n/gm, '');
      const color = result.isError ? RED : '';
      const lines = text.split('\n');
      for (const line of lines) {
        this._writeEmitter.fire(`${color}${line}${color ? RESET : ''}\r\n`);
      }
      this._writeEmitter.fire(`${DIM}(${elapsed}ms)${RESET}\r\n`);
    } catch (err: unknown) {
      this._writeEmitter.fire(`${RED}Error: ${(err as Error).message}${RESET}\r\n`);
    }

    this._processing = false;
  }
}
