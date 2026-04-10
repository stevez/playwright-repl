/**
 * REPL Webview — interactive command panel for Playwright REPL.
 */

import { DisposableBase } from './disposableBase';
import { getNonce, html } from './utils';
import type { IBrowserManager } from './browser';
import * as vscodeTypes from './vscodeTypes';
import { COMMANDS, CATEGORIES, ALIASES } from '@playwright-repl/core';

function core() {
  return { COMMANDS, CATEGORIES, ALIASES };
}

export class ReplView extends DisposableBase implements vscodeTypes.WebviewViewProvider {
  private _vscode: vscodeTypes.VSCode;
  private _view: vscodeTypes.WebviewView | undefined;
  private _extensionUri: vscodeTypes.Uri;
  private _browserManager: IBrowserManager | undefined;
  private _history: string[] = [];
  private _commandCount = 0;

  constructor(vscode: vscodeTypes.VSCode, extensionUri: vscodeTypes.Uri) {
    super();
    this._vscode = vscode;
    this._extensionUri = extensionUri;
    this._disposables = [
      vscode.window.registerWebviewViewProvider('playwright-repl.replView', this, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
    ];
  }

  setIBrowserManager(browserManager: IBrowserManager) {
    this._browserManager = browserManager;
  }

  notifyBrowserConnected() {
    this._appendOutput('Connected to browser.', 'info');
  }

  notifyBrowserDisconnected() {
    this._appendOutput('Browser disconnected.', 'error');
  }

  resolveWebviewView(webviewView: vscodeTypes.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = htmlForWebview(this._vscode, this._extensionUri, webviewView.webview);

    this._disposables.push(webviewView.webview.onDidReceiveMessage(async data => {
      if (data.method === 'execute') {
        await this._execute(data.params.command);
      } else if (data.method === 'getHistory') {
        void this._view?.webview.postMessage({ method: 'history', params: { history: this._history } });
      } else if (data.method === 'savePdf') {
        await this._savePdf(data.params.dataUri);
      }
    }));

    // Send welcome message
    const connected = this._browserManager?.isRunning() ?? false;
    this._appendOutput('Playwright REPL\nType commands. Use ↑↓ for history.', 'info');
    this._appendOutput(connected ? 'Connected to browser.' : 'Waiting for browser... Launch with Ctrl+Shift+P → "Launch Browser"', connected ? 'info' : 'error');
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

    // Intercept 'page' — show useful page info instead of raw object
    if (command.trim() === 'page') {
      this._setProcessing(true);
      try {
        const result = await this._browserManager.runCommand('await JSON.stringify({ url: page.url(), title: await page.title(), viewport: await page.evaluate(() => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight, dpr: window.devicePixelRatio })) })');
        if (result.text && !result.isError) {
          const info = JSON.parse(result.text);
          const vp = info.viewport ? `${info.viewport.width}x${info.viewport.height}` : 'auto';
          const dpr = info.viewport?.dpr && info.viewport.dpr !== 1 ? ` @${info.viewport.dpr}x` : '';
          this._appendOutput(
            `URL:      ${info.url}\n` +
            `Title:    ${info.title}\n` +
            `Viewport: ${vp}${dpr}`,
            'output',
          );
        } else {
          this._appendOutput(result.text || 'Could not get page info', 'error');
        }
      } catch (e: unknown) {
        this._appendOutput(`Error: ${(e as Error).message}`, 'error');
      }
      this._setProcessing(false);
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
      void this._view?.webview.postMessage({ method: 'clear' });
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

  private _appendOutput(text: string, type: 'output' | 'error' | 'info') {
    void this._view?.webview.postMessage({ method: 'output', params: { text, type } });
  }

  private _appendImage(dataUri: string) {
    void this._view?.webview.postMessage({ method: 'image', params: { dataUri } });
  }

  private _appendPdf(dataUri: string) {
    void this._view?.webview.postMessage({ method: 'pdf', params: { dataUri } });
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
    void this._view?.webview.postMessage({ method: 'processing', params: { processing } });
  }
}

function htmlForWebview(vscode: vscodeTypes.VSCode, extensionUri: vscodeTypes.Uri, webview: vscodeTypes.Webview) {
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'common.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'replView.script.js'));
  const nonce = getNonce();

  return html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${style}" rel="stylesheet">
      <title>REPL</title>
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
      </style>
    </head>
    <body class="repl-view">
      <div id="output"></div>
      <div id="input-row">
        <span id="prompt">pw&gt;</span>
        <textarea id="command-input" rows="1" placeholder="Type a command..." autofocus></textarea>
      </div>
    </body>
    <script nonce="${nonce}" src="${script}"></script>
    </html>
  `;
}
