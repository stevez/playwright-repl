/**
 * REPL Webview — interactive command panel for Playwright REPL.
 */

import { WebviewBase } from './webviewBase';
import type { IBrowserManager } from './browser';
import * as vscodeTypes from './vscodeTypes';
import { COMMANDS, CATEGORIES, ALIASES, buildCompletionItems } from '@playwright-repl/core';

function core() {
  return { COMMANDS, CATEGORIES, ALIASES };
}

export class ReplView extends WebviewBase {
  private _browserManager: IBrowserManager | undefined;
  private _history: string[] = [];
  private _commandCount = 0;

  get viewId() { return 'playwright-repl.replView'; }
  get scriptName() { return 'replView.script.js'; }
  get bodyClass() { return 'repl-view'; }

  constructor(vscode: vscodeTypes.VSCode, extensionUri: vscodeTypes.Uri) {
    super(vscode, extensionUri);
  }

  setBrowserManager(browserManager: IBrowserManager) {
    this._browserManager = browserManager;
  }

  notifyBrowserConnected() {
    this._appendOutput('Connected to browser.', 'info');
  }

  notifyBrowserDisconnected() {
    this._appendOutput('Browser disconnected.', 'error');
  }

  bodyHtml(_webview: vscodeTypes.Webview): string {
    return `
      <style>
        body.repl-view {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          font-family: var(--vscode-editor-font-family, 'Consolas, monospace');
          font-size: var(--vscode-editor-font-size, 13px);
          user-select: text;
        }
        #output {
          flex: 1;
          overflow-y: auto;
          padding: 4px 8px;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .line { line-height: 1.4; }
        .line-command { color: var(--vscode-terminal-ansiBrightWhite, var(--vscode-editor-foreground)); }
        .line-command::before { content: 'pw> '; color: var(--vscode-terminal-ansiGreen); }
        .line-output { color: var(--vscode-editor-foreground); }
        .line-error { color: var(--vscode-terminal-ansiRed); }
        .line-info { color: var(--vscode-terminal-ansiCyan, var(--vscode-descriptionForeground)); }
        #input-row {
          display: flex;
          align-items: flex-start;
          padding: 4px 8px;
          border-top: 1px solid var(--vscode-panelInput-border, var(--vscode-panel-border));
        }
        #prompt {
          color: var(--vscode-terminal-ansiGreen);
          margin-right: 4px;
          flex: none;
        }
        #command-input {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          color: var(--vscode-editor-foreground);
          font-family: inherit;
          font-size: inherit;
          padding: 2px 0;
          resize: none;
          overflow: hidden;
          line-height: 1.4;
          field-sizing: content;
          max-height: 40vh;
        }
        #command-input::placeholder {
          color: var(--vscode-input-placeholderForeground);
        }
        #command-input:disabled {
          opacity: 0.5;
        }
        /* Object tree */
        details.obj-tree { margin: 2px 0; }
        details.obj-tree > summary {
          cursor: pointer;
          list-style: revert;
          color: var(--vscode-editor-foreground);
        }
        details.obj-tree > summary:hover {
          background: var(--vscode-list-hoverBackground);
        }
        .obj-row { padding-left: 16px; line-height: 1.4; }
        .obj-key { color: var(--vscode-debugTokenExpression-name, #9cdcfe); }
        .obj-string { color: var(--vscode-debugTokenExpression-string, #ce9178); }
        .obj-number { color: var(--vscode-debugTokenExpression-number, #b5cea8); }
        .obj-boolean { color: var(--vscode-debugTokenExpression-boolean, #569cd6); }
        .obj-null { color: var(--vscode-descriptionForeground); font-style: italic; }
        #input-row {
          position: relative;
        }
        #autocomplete-dropdown {
          position: absolute;
          bottom: 100%;
          left: 8px;
          min-width: 200px;
          max-width: 400px;
          max-height: 200px;
          overflow-y: auto;
          background: var(--vscode-editorSuggestWidget-background, var(--vscode-editorWidget-background));
          border: 1px solid var(--vscode-editorSuggestWidget-border, var(--vscode-widget-border));
          border-radius: 3px;
          z-index: 100;
          display: none;
        }
        #autocomplete-dropdown.visible { display: block; }
        .ac-item {
          padding: 2px 8px;
          display: flex;
          justify-content: space-between;
          cursor: pointer;
          font-family: inherit;
          font-size: inherit;
        }
        .ac-item.ac-selected, .ac-item:hover {
          background: var(--vscode-editorSuggestWidget-selectedBackground, var(--vscode-list-activeSelectionBackground));
          color: var(--vscode-editorSuggestWidget-selectedForeground, var(--vscode-list-activeSelectionForeground));
        }
        .ac-cmd { flex: none; }
        .ac-desc {
          color: var(--vscode-descriptionForeground);
          margin-left: 12px;
          font-size: 0.9em;
          opacity: 0.8;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      </style>
      <div id="output"></div>
      <div id="input-row">
        <div id="autocomplete-dropdown"></div>
        <span id="prompt">pw&gt;</span>
        <textarea id="command-input" rows="1" placeholder="Type a command..." autofocus></textarea>
      </div>
    `;
  }

  async onMessage(data: any) {
    if (data.method === 'execute') {
      await this._execute(data.params.command);
    } else if (data.method === 'getHistory') {
      this.postMessage('history', { history: this._history });
    } else if (data.method === 'savePdf') {
      await this._savePdf(data.params.dataUri);
    }
  }

  protected onViewReady() {
    const connected = this._browserManager?.isRunning() ?? false;
    this._appendOutput('Playwright REPL\nType commands. Use ↑↓ for history.', 'info');
    this._appendOutput(connected ? 'Connected to browser.' : 'Waiting for browser... Launch with Ctrl+Shift+P → "Launch Browser"', connected ? 'info' : 'error');
    this.postMessage('completionItems', { items: buildCompletionItems() });
  }

  private async _execute(command: string) {
    if (!command.trim()) return;

    // Add to history
    this._history.unshift(command);
    if (this._history.length > 100) this._history.pop();

    // Handle local commands
    if (this._handleLocal(command))
      return;

    if (!this._browserManager?.isRunning()) {
      this._appendOutput('Browser not running. Use Ctrl+Shift+P → "Playwright REPL: Launch Browser" first.', 'error');
      return;
    }

    this._setProcessing(true);
    this._commandCount++;
    const start = Date.now();
    try {
      const result = await this._browserManager.runCommand(command);
      const elapsed = Date.now() - start;

      // PDF — offer save
      if (result.image?.startsWith('data:application/pdf')) {
        this._appendPdf(result.image);
      } else if (result.image) {
        this._appendImage(result.image);
      }

      if (result.text) {
        // Strip markdown section headers
        const text = result.text.replace(/^### \w[\w ]*\n/gm, '');

        // Try to render as object tree if it's JSON
        const structured = result.isError ? null : this._tryParseStructured(text);
        if (structured !== null)
          this.postMessage('structuredOutput', { data: structured });
        else
          this._appendOutput(text, result.isError ? 'error' : 'output');
      }
      if (!result.text && !result.image) {
        this._appendOutput('Done.', 'info');
      }

      // Show timing
      this._appendOutput(`(${elapsed}ms)`, 'info');
    } catch (err: unknown) {
      this._appendOutput(`Error: ${(err as Error).message}`, 'error');
    }
    this._setProcessing(false);
  }

  private _handleLocal(command: string): boolean {
    const trimmed = command.trim();

    // .clear — clear output
    if (trimmed === '.clear') {
      this.postMessage('clear');
      return true;
    }

    // help / .help — categorized command list
    if (trimmed === 'help' || trimmed === '.help') {
      const { CATEGORIES } = core();
      const lines = Object.entries(CATEGORIES)
        .map(([cat, cmds]) => `  ${cat}: ${cmds.join(', ')}`)
        .join('\n');
      this._appendOutput(`Available commands:\n${lines}\n\nType "help <command>" for details.`, 'info');
      return true;
    }

    // help <command> — detailed command help
    if (trimmed.startsWith('help ')) {
      const cmd = trimmed.slice(5).trim();
      const { COMMANDS } = core();
      const info = COMMANDS[cmd];
      if (!info) {
        this._appendOutput(`Unknown command: "${cmd}". Type "help" for available commands.`, 'error');
        return true;
      }
      const parts = [`${cmd} — ${info.desc}`];
      if (info.usage) parts.push(`Usage: ${info.usage}`);
      if (info.examples?.length) {
        parts.push('Examples:');
        for (const ex of info.examples) parts.push(`  ${ex}`);
      }
      this._appendOutput(parts.join('\n'), 'info');
      return true;
    }

    // .history / .history clear
    if (trimmed === '.history') {
      this._appendOutput(this._history.length ? this._history.slice().reverse().join('\n') : '(no history)', 'info');
      return true;
    }
    if (trimmed === '.history clear') {
      this._history.length = 0;
      this._appendOutput('History cleared.', 'info');
      return true;
    }

    // .aliases — show command aliases
    if (trimmed === '.aliases') {
      const { ALIASES } = core();
      const grouped: Record<string, string[]> = {};
      for (const [alias, cmd] of Object.entries(ALIASES)) {
        if (!grouped[cmd]) grouped[cmd] = [];
        grouped[cmd].push(alias);
      }
      const lines = Object.entries(grouped)
        .map(([cmd, aliases]) => `  ${aliases.join(', ')} → ${cmd}`)
        .join('\n');
      this._appendOutput(`Aliases:\n${lines}`, 'info');
      return true;
    }

    // .status — connection status
    if (trimmed === '.status') {
      const running = this._browserManager?.isRunning() ?? false;
      const bridge = this._browserManager?.bridge?.connected ?? false;
      this._appendOutput(
        `Browser: ${running ? 'running' : 'stopped'}\n` +
        `Bridge: ${bridge ? 'connected' : 'disconnected'}\n` +
        `Commands: ${this._commandCount}`,
        'info',
      );
      return true;
    }

    return false;
  }

  /** Try to parse text as a JSON object or array. Returns null for primitives/strings/failures. */
  private _tryParseStructured(text: string): unknown {
    const trimmed = text.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === 'object' && parsed !== null) return parsed;
    } catch {}
    return null;
  }

  private _appendOutput(text: string, type: 'output' | 'error' | 'info') {
    this.postMessage('output', { text, type });
  }

  private _appendImage(dataUri: string) {
    this.postMessage('image', { dataUri });
  }

  private _appendPdf(dataUri: string) {
    this.postMessage('pdf', { dataUri });
  }

  private async _savePdf(dataUri: string) {
    const uri = await this._vscode.window.showSaveDialog({
      filters: { 'PDF': ['pdf'] },
      defaultUri: this._vscode.Uri.file('page.pdf'),
    });
    if (!uri) return;
    const base64 = dataUri.split(',')[1];
    if (!base64) return;
    const buffer = Buffer.from(base64, 'base64');
    await this._vscode.workspace.fs.writeFile(uri, buffer);
    this._appendOutput(`Saved to ${uri.fsPath}`, 'info');
  }

  private _setProcessing(processing: boolean) {
    this.postMessage('processing', { processing });
  }
}
