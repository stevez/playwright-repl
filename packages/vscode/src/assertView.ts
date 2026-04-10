/**
 * Assert Builder — dedicated panel for building and testing Playwright assertions.
 */

import { DisposableBase } from './disposableBase';
import { getNonce, html } from './utils';
import type { IBrowserManager } from './browser';
import type { Picker } from './picker';
import * as vscodeTypes from './vscodeTypes';

interface AssertionType {
  value: string;
  label: string;
  needsArg: boolean;
  argType?: string;
  tags?: string[];  // element tags this applies to, empty = all
}

const ALL_ASSERTION_TYPES: AssertionType[] = [
  // Text
  { value: 'toContainText', label: 'toContainText', needsArg: true, argType: 'string' },
  { value: 'toHaveText', label: 'toHaveText', needsArg: true, argType: 'string' },
  // Visibility & state
  { value: 'toBeVisible', label: 'toBeVisible', needsArg: false },
  { value: 'toBeHidden', label: 'toBeHidden', needsArg: false },
  { value: 'toBeAttached', label: 'toBeAttached', needsArg: false },
  { value: 'toBeEnabled', label: 'toBeEnabled', needsArg: false },
  { value: 'toBeDisabled', label: 'toBeDisabled', needsArg: false },
  // Form elements
  { value: 'toBeChecked', label: 'toBeChecked', needsArg: false, tags: ['input'] },
  { value: 'toHaveValue', label: 'toHaveValue', needsArg: true, argType: 'string', tags: ['input', 'textarea', 'select'] },
  // Attributes & count
  { value: 'toHaveAttribute', label: 'toHaveAttribute', needsArg: true, argType: 'pair' },
  { value: 'toHaveCount', label: 'toHaveCount', needsArg: true, argType: 'number' },
  // Page-level (uses expect(page) not expect(locator))
  { value: 'toHaveURL', label: 'toHaveURL (page)', needsArg: true, argType: 'string' },
  { value: 'toHaveTitle', label: 'toHaveTitle (page)', needsArg: true, argType: 'string' },
];

export function filterTypes(tag?: string, inputType?: string): AssertionType[] {
  const t = tag?.toLowerCase();
  const filtered = ALL_ASSERTION_TYPES.filter(a => {
    if (!a.tags) return true;
    if (!t) return true;
    return a.tags.includes(t);
  });
  // For checkbox/radio, prioritize toBeChecked
  if (t === 'input' && (inputType === 'checkbox' || inputType === 'radio'))
    return filtered.filter(a => a.value !== 'toHaveValue');
  return filtered;
}

export class AssertView extends DisposableBase implements vscodeTypes.WebviewViewProvider {
  private _vscode: vscodeTypes.VSCode;
  private _view: vscodeTypes.WebviewView | undefined;
  private _extensionUri: vscodeTypes.Uri;
  private _browserManager: IBrowserManager | undefined;
  private _picker: Picker | undefined;
  private _locator = '';
  private _assertion = '';
  private _ariaSnapshot = '';

  constructor(vscode: vscodeTypes.VSCode, extensionUri: vscodeTypes.Uri) {
    super();
    this._vscode = vscode;
    this._extensionUri = extensionUri;
    this._disposables = [
      vscode.window.registerWebviewViewProvider('playwright-repl.assertView', this, {
        webviewOptions: { retainContextWhenHidden: true },
      }),
    ];
  }

  setBrowserManager(browserManager: IBrowserManager) {
    this._browserManager = browserManager;
  }

  setPicker(picker: Picker) {
    this._picker = picker;
  }

  /** Called from pick event — fills locator and default assertion */
  public async showAssertion(locator: string, assertion: string, elementInfo?: { tag?: string; attributes?: Record<string, string> }, ariaSnapshot?: string) {
    this._locator = locator;
    this._assertion = assertion;
    this._ariaSnapshot = ariaSnapshot || '';
    const types = filterTypes(elementInfo?.tag, elementInfo?.attributes?.type);
    await this._vscode.commands.executeCommand('playwright-repl.assertView.focus');
    if (!this._view)
      await new Promise(r => setTimeout(r, 200));
    void this._view?.webview.postMessage({
      method: 'update',
      params: { locator, assertion, types, ariaSnapshot: this._ariaSnapshot },
    });
  }

  resolveWebviewView(webviewView: vscodeTypes.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = htmlForWebview(this._vscode, this._extensionUri, webviewView.webview);

    this._disposables.push(webviewView.webview.onDidReceiveMessage(async data => {
      if (data.method === 'pick') {
        await this._vscode.commands.executeCommand('playwright-repl.assertBuilder');
      } else if (data.method === 'verify') {
        await this._verify(data.params.assertion);
      } else if (data.method === 'rebuild') {
        this._rebuildAssertion(data.params.type, data.params.arg, data.params.negate);
      } else if (data.method === 'rebuildSnapshot') {
        this._rebuildSnapshotAssertion(data.params.snapshot, data.params.negate);
      } else if (data.method === 'locatorChanged') {
        this._locator = data.params.locator;
      }
    }));

    // Send types on init
    void webviewView.webview.postMessage({
      method: 'init',
      params: { types: ALL_ASSERTION_TYPES },
    });
  }

  private _rebuildAssertion(type: string, arg?: string, negate?: boolean) {
    if (!this._locator && !type.startsWith('toHave')) return;
    const typeDef = ALL_ASSERTION_TYPES.find(t => t.value === type);
    if (!typeDef) return;

    const not = negate ? 'not.' : '';
    const isPageLevel = type === 'toHaveURL' || type === 'toHaveTitle';
    const target = isPageLevel ? 'page' : this._locator;
    let assertion: string;
    if (typeDef.argType === 'pair' && arg) {
      const parts = arg.split(',').map(s => s.trim());
      assertion = `await expect(${target}).${not}${type}('${parts[0] || ''}', '${parts[1] || ''}');`;
    } else if (typeDef.needsArg && arg) {
      const argStr = typeDef.argType === 'number' ? arg : `'${arg.replace(/'/g, "\\'")}'`;
      assertion = `await expect(${target}).${not}${type}(${argStr});`;
    } else {
      assertion = `await expect(${target}).${not}${type}();`;
    }

    this._assertion = assertion;
    void this._view?.webview.postMessage({
      method: 'assertionUpdated',
      params: { assertion },
    });
  }

  private _rebuildSnapshotAssertion(snapshot?: string, negate?: boolean) {
    if (!this._locator) return;
    const not = negate ? 'not.' : '';
    const assertion = snapshot
      ? `await expect(${this._locator}).${not}toMatchAriaSnapshot(\`\n${snapshot}\n\`);`
      : `await expect(${this._locator}).${not}toMatchAriaSnapshot(\`\`);`;

    this._assertion = assertion;
    void this._view?.webview.postMessage({
      method: 'assertionUpdated',
      params: { assertion },
    });
  }

  private async _verify(assertion: string) {
    if (!this._browserManager?.isRunning() || !assertion) return;
    this._assertion = assertion;
    void this._view?.webview.postMessage({ method: 'verifyProcessing', params: { processing: true } });
    try {
      const result = await this._browserManager.runCommand(assertion);
      const passed = !result.isError;
      void this._view?.webview.postMessage({
        method: 'verifyResult',
        params: { passed, error: passed ? null : result.text },
      });
    } catch (e: unknown) {
      void this._view?.webview.postMessage({
        method: 'verifyResult',
        params: { passed: false, error: (e as Error).message },
      });
    }
    void this._view?.webview.postMessage({ method: 'verifyProcessing', params: { processing: false } });
  }
}

function htmlForWebview(vscode: vscodeTypes.VSCode, extensionUri: vscodeTypes.Uri, webview: vscodeTypes.Webview) {
  const style = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', 'common.css'));
  const script = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'dist', 'assertView.script.js'));
  const nonce = getNonce();

  return html`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <link href="${style}" rel="stylesheet">
      <title>Assert</title>
      <style>
        body.assert-view {
          user-select: text;
          padding: 0;
        }
        .section {
          margin: 0 10px 10px;
          display: flex;
          flex-direction: column;
        }
        .section label {
          flex: none;
          margin-bottom: 2px;
        }
        .hbox {
          display: flex;
          align-items: center;
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
        .inline-btn {
          cursor: pointer;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          border: none;
          padding: 2px 10px;
          border-radius: 2px;
          font-size: 13px;
        }
        .inline-btn:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
        .inline-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        select {
          background: var(--vscode-dropdown-background, var(--vscode-input-background));
          color: var(--vscode-dropdown-foreground, var(--vscode-input-foreground));
          border: 1px solid var(--vscode-dropdown-border, var(--vscode-focusBorder, #007acc)) !important;
          border-radius: 3px;
          padding: 4px 24px 4px 8px;
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          appearance: auto;
          flex: none;
          height: auto !important;
        }
        #argInput {
          margin-top: 4px;
        }
        .radio-label {
          font-size: 13px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 3px;
        }
        .step-num {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: var(--vscode-badge-background);
          color: var(--vscode-badge-foreground);
          font-size: 11px;
          font-weight: bold;
          flex: none;
          margin-right: 6px;
        }
      </style>
    </head>
    <body class="assert-view">
      <div class="section">
        <div class="hbox">
          <span class="step-num">1</span>
          <button id="pickBtn" title="Pick element" class="icon-btn"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><path d="M18 42h-7.5c-3 0-4.5-1.5-4.5-4.5v-27C6 7.5 7.5 6 10.5 6h27C42 6 42 10.404 42 10.5V18h-3V9H9v30h9v3Zm27-15-9 6 9 9-3 3-9-9-6 9-6-24 24 6Z"/></svg></button>
          <label>Pick Element</label>
        </div>
        <label style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:4px;">Locator</label>
        <input id="locator" placeholder="Pick an element or type a locator" aria-label="Locator">
        <label style="font-size:11px;color:var(--vscode-descriptionForeground);margin-top:6px;">ARIA Snapshot</label>
        <textarea id="ariaPreview" placeholder="Pick an element to see its ARIA snapshot" aria-label="ARIA Snapshot" rows="4" readonly style="resize:vertical;font-family:var(--vscode-editor-font-family,monospace);font-size:12px;opacity:0.8;"></textarea>
      </div>
      <div class="section">
        <div class="hbox">
          <span class="step-num">2</span>
          <label>Assert using</label>
        </div>
        <div class="hbox" style="gap:8px;margin-top:2px;">
          <label class="radio-label"><input type="radio" name="assertMode" value="locator" checked> Locator</label>
          <label class="radio-label"><input type="radio" name="assertMode" value="snapshot"> Snapshot</label>
          <label style="flex:none;font-size:12px;cursor:pointer;display:flex;align-items:center;gap:3px;margin-left:8px;">
            <input id="negateCheckbox" type="checkbox">
            Not
          </label>
        </div>
        <div id="locatorMode" style="margin-top:4px;">
          <select id="assertType"></select>
          <input id="argInput" placeholder="Expected value" aria-label="Expected value" style="display:none;">
        </div>
        <div id="snapshotMode" style="display:none;"></div>
      </div>
      <div class="section">
        <div class="hbox">
          <span class="step-num">3</span>
          <label>Verify</label>
        </div>
        <textarea id="assertion" placeholder="Assertion will appear here" aria-label="Assertion" rows="2" style="resize:vertical;font-family:var(--vscode-editor-font-family,monospace);font-size:12px;"></textarea>
        <div class="hbox" style="margin-top:4px;align-items:center;">
          <button id="verifyBtn" class="inline-btn">Verify</button>
          <span id="verifyResult" style="font-size:13px;margin-left:6px;display:none;"></span>
        </div>
      </div>
    </body>
    <script nonce="${nonce}" src="${script}"></script>
    </html>
  `;
}
