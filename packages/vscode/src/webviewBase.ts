/**
 * WebviewBase — abstract base class for webview panels.
 *
 * Extracts shared boilerplate from ReplView, AssertView, LocatorsView:
 * - WebviewViewProvider registration
 * - resolveWebviewView with options, HTML, message handler
 * - postMessage helper
 * - HTML skeleton (CSP, nonce, common.css, script)
 */

import { DisposableBase } from './disposableBase';
import { getNonce, html } from './utils';
import * as vscodeTypes from './vscodeTypes';

export abstract class WebviewBase extends DisposableBase implements vscodeTypes.WebviewViewProvider {
  protected _vscode: vscodeTypes.VSCode;
  protected _view: vscodeTypes.WebviewView | undefined;
  protected _extensionUri: vscodeTypes.Uri;

  /** Unique view identifier, e.g. 'playwright-repl.replView' */
  abstract get viewId(): string;
  /** Script filename in dist/, e.g. 'replView.script.js' */
  abstract get scriptName(): string;
  /** CSS class for the body element, e.g. 'repl-view' */
  abstract get bodyClass(): string;
  /** View-specific HTML: inline styles + body content */
  abstract bodyHtml(webview: vscodeTypes.Webview): string;
  /** Handle messages from the webview script */
  abstract onMessage(data: any): Promise<void> | void;

  constructor(vscode: vscodeTypes.VSCode, extensionUri: vscodeTypes.Uri, options?: { retainContextWhenHidden?: boolean }) {
    super();
    this._vscode = vscode;
    this._extensionUri = extensionUri;
    this._disposables.push(
      vscode.window.registerWebviewViewProvider(this.viewId, this, {
        webviewOptions: { retainContextWhenHidden: options?.retainContextWhenHidden ?? true },
      }),
    );
  }

  resolveWebviewView(webviewView: vscodeTypes.WebviewView) {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    webviewView.webview.html = this._buildHtml(webviewView.webview);

    this._disposables.push(
      webviewView.webview.onDidReceiveMessage(data => this.onMessage(data)),
    );

    this.onViewReady();
  }

  /** Override to run logic after the webview is resolved (e.g. send initial data). */
  protected onViewReady() {}

  /** Send a message to the webview. */
  protected postMessage(method: string, params?: Record<string, any>) {
    void this._view?.webview.postMessage({ method, params });
  }

  private _buildHtml(webview: vscodeTypes.Webview): string {
    const style = webview.asWebviewUri(this._vscode.Uri.joinPath(this._extensionUri, 'media', 'common.css'));
    const script = webview.asWebviewUri(this._vscode.Uri.joinPath(this._extensionUri, 'dist', this.scriptName));
    const nonce = getNonce();

    return html`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src data:;">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${style}" rel="stylesheet">
      </head>
      <body class="${this.bodyClass}">
        ${this.bodyHtml(webview)}
      </body>
      <script nonce="${nonce}" src="${script}"></script>
      </html>
    `;
  }
}
