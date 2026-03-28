/**
 * Locator Picker
 *
 * V1: Simple pick and insert.
 * 1. Click "Pick Locator" → browser enters pick mode (hover highlight)
 * 2. User clicks an element → locator sent back via bridge event
 * 3. Locator inserted at cursor in the active editor
 * 4. Pick mode ends automatically
 */

import * as vscode from 'vscode';
import type { BrowserManager } from './browser.js';
import type { LocatorsView } from './locatorsView';

export class Picker {
  private _browserManager: BrowserManager;
  private _outputChannel: vscode.OutputChannel;
  private _locatorsView: LocatorsView | undefined;
  private _picking = false;

  constructor(browserManager: BrowserManager, outputChannel: vscode.OutputChannel) {
    this._browserManager = browserManager;
    this._outputChannel = outputChannel;
  }

  get isPicking() { return this._picking; }

  setLocatorsView(view: LocatorsView) {
    this._locatorsView = view;
  }

  dispose() {
  }

  async start() {
    if (this._picking) return;
    if (!this._browserManager.isRunning()) {
      vscode.window.showWarningMessage('Launch browser first.');
      return;
    }

    // Start pick mode
    const result = await this._browserManager.runCommand('pick-start');
    if (result.isError) {
      vscode.window.showErrorMessage(`Pick failed: ${result.text}`);
      return;
    }

    this._picking = true;
    this._outputChannel.appendLine('Pick mode started. Click an element in the browser.');

    // Listen for pick events
    this._browserManager.onEvent(async (event) => {
      if (!this._picking) return;

      if (event.type === 'element-picked-raw') {
        const info = event.info as {
          locator?: string;
          tag?: string;
          text?: string;
          value?: string;
          checked?: boolean;
          attributes?: Record<string, string>;
        };
        const locator = info?.locator;
        if (locator) {
          const fullLocator = `page.${locator}`;
          this._outputChannel.appendLine(`Picked: ${fullLocator}`);

          // Get aria snapshot for the picked element
          let ariaSnapshot = '';
          try {
            const ariaResult = await this._browserManager.runCommand(`await ${fullLocator}.ariaSnapshot()`);
            if (!ariaResult.isError && ariaResult.text)
              ariaSnapshot = ariaResult.text;
          } catch {}

          // Derive assertion from element info
          const assertion = deriveAssertion(info, fullLocator);

          // Copy to clipboard if setting is enabled
          const copyOnPick = vscode.workspace.getConfiguration('playwright-repl').get('pickLocatorCopyToClipboard', false);
          if (copyOnPick)
            await vscode.env.clipboard.writeText(fullLocator);

          if (this._locatorsView)
            this._locatorsView.showLocator(fullLocator, ariaSnapshot, assertion);
        }
        this._stop();
      }

      if (event.type === 'pick-cancelled') {
        this._stop();
      }
    });
  }

  async stop() {
    if (!this._picking) return;
    await this._browserManager.runCommand('pick-stop');
    this._stop();
  }

  private _stop() {
    this._picking = false;
    this._browserManager.onEvent(null);
    this._outputChannel.appendLine('Pick mode ended.');
  }

}

// ─── Assertion derivation ─────────────────────────────────────────────────

function deriveAssertion(
  info: { tag?: string; text?: string; value?: string; checked?: boolean; attributes?: Record<string, string> },
  locator: string,
): string {
  const tag = info.tag?.toLowerCase() ?? '';
  const inputType = (info.attributes?.type || '').toLowerCase();

  // Checkbox/radio → checked assertion
  if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio') && info.checked !== undefined) {
    return info.checked
      ? `await expect(${locator}).toBeChecked();`
      : `await expect(${locator}).not.toBeChecked();`;
  }

  // Input/textarea/select → value assertion
  if ((tag === 'input' || tag === 'textarea' || tag === 'select') && info.value !== undefined) {
    return `await expect(${locator}).toHaveValue('${info.value.replace(/'/g, "\\'")}');`;
  }

  // Has text content → text assertion (skip if locator is getByText — redundant)
  const text = info.text?.trim();
  if (text && !/\.getByText\(/.test(locator)) {
    return `await expect(${locator}).toContainText('${text.slice(0, 80).replace(/'/g, "\\'")}');`;
  }

  // Fallback → visible assertion
  return `await expect(${locator}).toBeVisible();`;
}
