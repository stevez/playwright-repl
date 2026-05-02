/**
 * Locators View — locator inspector and highlighter.
 *
 * Originally forked from Microsoft's playwright-vscode, simplified to use
 * BrowserManager only (removed ReusedBrowser dependency).
 */

import { DisposableBase } from './disposableBase';
import { pickElementAction } from './settingsView';
import { getNonce, html } from './utils';
import type { SettingsModel } from './settingsModel';
import type { IBrowserManager } from './browser';
import * as vscodeTypes from './vscodeTypes';

export class LocatorsView extends DisposableBase implements vscodeTypes.WebviewViewProvider {
  private _vscode: vscodeTypes.VSCode;
  private _view: vscodeTypes.WebviewView | undefined;
  private _extensionUri: vscodeTypes.Uri;
  private _locator: { locator: string, error?: string } = { locator: '' };
  private _ariaSnapshot: { yaml: string, error?: string } = { yaml: '' };
  private _ref: string = '';
  private _settingsModel: SettingsModel;
  private _browserManager: IBrowserManager | undefined;

  constructor(vscode: vscodeTypes.VSCode, settingsModel: SettingsModel, extensionUri: vscodeTypes.Uri) {
    super();
    this._vscode = vscode;
    this._extensionUri = extensionUri;
    this._settingsModel = settingsModel;
    this._disposables = [
      vscode.window.registerWebviewViewProvider('playwright-repl.locatorsView', this),
      settingsModel.onChange(() => this._updateSettings()),
    ];
  }

  setBrowserManager(browserManager: IBrowserManager) {
    this._browserManager = browserManager;
    this._updateActions();
  }

  /** Allow external callers (e.g. the picker) to show a locator. */
  public async showLocator(locator: string, ariaSnapshot?: string, ref?: string) {
    this._locator = { locator };
    this._ariaSnapshot = { yaml: ariaSnapshot || '' };
    this._ref = ref || '';
    this._highlighted = false;
    // Focus first so the webview is resolved before we send the update
    await this._vscode.commands.executeCommand('playwright-repl.locatorsView.focus');
    // Small delay to let the webview initialize on first open
    if (!this._view)
      await new Promise(r => setTimeout(r, 200));
    this._updateValues();
  }

  public resolveWebviewView(webviewView: vscodeTypes.WebviewView, context: vscodeTypes.WebviewViewResolveContext, token: vscodeTypes.CancellationToken) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri]
    };

    webviewView.webview.html = htmlForWebview(this._vscode, this._extensionUri, webviewView.webview);
    this._disposables.push(webviewView.webview.onDidReceiveMessage(async data => {
      if (data.method === 'execute') {
        void this._vscode.commands.executeCommand(data.params.command);
      } else if (data.method === 'locatorChanged') {
        this._locator.locator = data.params.locator;
        if (!this._browserManager?.isRunning()) return;
        try {
          await this._browserManager.runCommand(`await ${this._locator.locator}.highlight()`);
          this._locator.error = undefined;
        } catch (e: any) {
          this._locator.error = e.message;
        }
        this._updateValues();
      } else if (data.method === 'ariaSnapshotChanged') {
        this._ariaSnapshot.yaml = data.params.ariaSnapshot;
        // Aria snapshot highlighting not supported via BrowserManager yet
      } else if (data.method === 'toggle') {
        void this._vscode.commands.executeCommand(`playwright-repl.toggle.${data.params.setting}`);
      } else if (data.method === 'highlight') {
        this._highlight();
      }
    }));

    this._disposables.push(webviewView.onDidChangeVisibility(() => {
      if (!webviewView.visible)
        return;
      this._updateActions();
      this._updateValues();
      this._updateSettings();
    }));
    this._updateActions();
    this._updateValues();
    this._updateSettings();
  }

  private _highlighted = false;

  private async _highlight() {
    if (!this._browserManager?.isRunning() || !this._locator.locator) return;
    try {
      if (this._highlighted) {
        await this._browserManager.runCommand('highlight --clear');
        this._highlighted = false;
      } else {
        await this._browserManager.runCommand(`await ${this._locator.locator}.highlight()`);
        this._highlighted = true;
      }
      void this._view?.webview.postMessage({ method: 'highlightState', params: { active: this._highlighted } });
    } catch {}
  }

  private _updateActions() {
    const actions = [
      pickElementAction(this._vscode),
    ];
    if (this._view)
      void this._view.webview.postMessage({ method: 'actions', params: { actions } });
  }

  private _updateValues() {
    void this._view?.webview.postMessage({
      method: 'update',
      params: {
        locator: this._locator,
        ariaSnapshot: this._ariaSnapshot,
        ref: this._ref,
      }
    });
  }

  private _updateSettings() {
    if (this._view)
      void this._view.webview.postMessage({ method: 'settings', params: { settings: this._settingsModel.json() } });
  }
}

function htmlForWebview(vscode: vscodeTypes.VSCode, extensionUri: vscodeTypes.Uri, webview: vscodeTypes.Webview) {
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'common.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'locatorsView.script.js'));
  const nonce = getNonce();

  return html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <style>
        .inline-btn {
          cursor: pointer;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: none;
          padding: 2px 10px;
          border-radius: 2px;
          font-size: 13px;
          margin-left: 6px;
        }
        .inline-btn:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .inline-btn.active {
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
        }
        .switch-label {
          display: flex;
          align-items: center;
          gap: 4px;
          margin-left: 4px;
          font-size: 12px;
          cursor: pointer;
          flex: none;
        }
        .icon-btn {
          cursor: pointer;
          background: none;
          border: none;
          padding: 2px;
          display: flex;
          align-items: center;
          border-radius: 3px;
        }
        .icon-btn:hover {
          background: var(--vscode-toolbar-hoverBackground);
        }
        .icon-btn svg {
          width: 16px;
          height: 16px;
          fill: var(--vscode-editor-foreground);
        }
        .separator {
          color: var(--vscode-panelInput-border, var(--vscode-panel-border));
          margin: 0 4px;
          flex: none;
        }
      </style>
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${style}" rel="stylesheet">
      <title>Playwright</title>
    </head>
    <body class="locators-view">
      <div class="section">
        <div class="hbox">
          <button id="pickBtn" title="Pick locator" class="icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M18 42h-7.5c-3 0-4.5-1.5-4.5-4.5v-27C6 7.5 7.5 6 10.5 6h27C42 6 42 10.404 42 10.5V18h-3V9H9v30h9v3Zm27-15-9 6 9 9-3 3-9-9-6 9-6-24 24 6Z"/></svg></button>
          <label id="locatorLabel">${vscode.l10n.t('Locator')}</label>
          <span class="separator">|</span>
          <label class="switch-label" title="Toggle highlight in browser">
            Highlight
            <input id="highlightSwitch" type="checkbox">
          </label>
        </div>
        <input id="locator" placeholder="${vscode.l10n.t('Locator')}" aria-labelledby="locatorLabel">
        <p id="locatorError" class="error"></p>
      </div>
      <div id="refSection" class="section">
        <div class="hbox">
          <label>Ref</label>
        </div>
        <input id="ref" readonly aria-label="Snapshot ref">
      </div>
      <div id="ariaSection" class="section">
        <div class="hbox">
          <div class="actions" id="actions-2"></div>
          <label id="locatorLabel">Aria</label>
        </div>
        <textarea id="ariaSnapshot" placeholder="Aria" rows="10" readonly aria-labelledby="ariaSnapshotLabel"></textarea>
        <p id="ariaSnapshotError" class="error"></p>
      </div>
    </body>
    <script nonce="${nonce}" src="${script}"></script>
    </html>
  `;
}
