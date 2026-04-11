/**
 * Locator Picker
 *
 * Uses Playwright's page.pickLocator() API (1.59+) for element picking.
 * Single await — no polling, no content script injection.
 */

import * as vscode from 'vscode';
import type { IBrowserManager } from './browser.js';

export interface ILocatorsView {
  showLocator(locator: string, ariaSnapshot?: string): void;
}

export interface IAssertView {
  showAssertion(locator: string, assertion: string, elementInfo?: any, ariaSnapshot?: string): Promise<void> | void;
}

export class Picker {
  private _browserManager: IBrowserManager;
  private _outputChannel: vscode.OutputChannel;
  private _locatorsView: ILocatorsView | undefined;
  private _assertView: IAssertView | undefined;
  private _picking = false;
  private _sendToAssert = false;

  constructor(browserManager: IBrowserManager, outputChannel: vscode.OutputChannel) {
    this._browserManager = browserManager;
    this._outputChannel = outputChannel;
  }

  get isPicking() { return this._picking; }

  setLocatorsView(view: ILocatorsView) {
    this._locatorsView = view;
  }

  setAssertView(view: IAssertView) {
    this._assertView = view;
  }

  /** Start pick and send result to Assert Builder */
  async startForAssert() {
    this._sendToAssert = true;
    await this.start();
  }

  dispose() {
  }

  async start() {
    if (this._picking) return;
    const page = this._browserManager.page;
    if (!page) {
      vscode.window.showWarningMessage('Launch browser first.');
      return;
    }

    this._picking = true;
    this._outputChannel.appendLine('Pick mode started. Click an element in the browser.');

    try {
      const locator = await page.pickLocator();
      const fullLocator = `page.${locator.toString()}`;
      this._outputChannel.appendLine(`Picked: ${fullLocator}`);

      // Get aria snapshot
      let ariaSnapshot = '';
      try {
        ariaSnapshot = await locator.ariaSnapshot();
      } catch {}

      // Derive assertion from element info
      const info = await this._getElementInfo(locator);
      const assertion = deriveAssertion(info, fullLocator);

      // Copy to clipboard if setting is enabled
      const copyOnPick = vscode.workspace.getConfiguration('playwright-repl').get('pickLocatorCopyToClipboard', false);
      if (copyOnPick)
        await vscode.env.clipboard.writeText(fullLocator);

      if (this._locatorsView)
        this._locatorsView.showLocator(fullLocator, ariaSnapshot);
      if (this._assertView && this._sendToAssert)
        this._assertView.showAssertion(fullLocator, assertion, info, ariaSnapshot);
      this._sendToAssert = false;
    } catch (e: unknown) {
      const msg = (e as Error).message || String(e);
      if (!msg.includes('cancelled'))
        this._outputChannel.appendLine(`Pick failed: ${msg}`);
    } finally {
      this._picking = false;
      this._outputChannel.appendLine('Pick mode ended.');
    }
  }

  async stop() {
    if (!this._picking) return;
    const page = this._browserManager.page;
    if (page) {
      try { await page.cancelPickLocator(); } catch {}
    }
    this._picking = false;
    this._outputChannel.appendLine('Pick mode ended.');
  }

  private async _getElementInfo(locator: any): Promise<ElementInfo> {
    const info: ElementInfo = {};
    try {
      const tag = await locator.evaluate((el: Element) => el.tagName);
      info.tag = tag;
      const attrs = await locator.evaluate((el: Element) => {
        const result: Record<string, string> = {};
        for (const attr of el.attributes)
          result[attr.name] = attr.value;
        return result;
      });
      info.attributes = attrs;
      info.text = await locator.innerText().catch(() => '');
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')
        info.value = await locator.inputValue().catch(() => undefined);
      if (tag === 'INPUT' && (attrs.type === 'checkbox' || attrs.type === 'radio'))
        info.checked = await locator.isChecked().catch(() => undefined);
    } catch {}
    return info;
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ElementInfo {
  tag?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  attributes?: Record<string, string>;
}

// ─── Assertion derivation ─────────────────────────────────────────────────

export function deriveAssertion(info: ElementInfo, locator: string): string {
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
