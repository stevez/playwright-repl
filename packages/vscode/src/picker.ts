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

export class Picker {
  private _browserManager: BrowserManager;
  private _outputChannel: vscode.OutputChannel;
  private _picking = false;
  private _statusBarItem: vscode.StatusBarItem;

  constructor(browserManager: BrowserManager, outputChannel: vscode.OutputChannel) {
    this._browserManager = browserManager;
    this._outputChannel = outputChannel;

    // Status bar button
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this._statusBarItem.text = '$(target) Pick';
    this._statusBarItem.tooltip = 'Playwright IDE: Pick Locator';
    this._statusBarItem.command = 'playwright-ide.pickLocator';
    this._statusBarItem.show();
  }

  get isPicking() { return this._picking; }

  dispose() {
    this._statusBarItem.dispose();
  }

  async start() {
    if (this._picking) return;
    if (!this._browserManager.isRunning()) {
      vscode.window.showWarningMessage('Launch browser first.');
      return;
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('Open a file first.');
      return;
    }

    // Start pick mode
    const result = await this._browserManager.runCommand('pick-start');
    if (result.isError) {
      vscode.window.showErrorMessage(`Pick failed: ${result.text}`);
      return;
    }

    this._picking = true;
    this._statusBarItem.text = '$(target) Picking...';
    this._statusBarItem.tooltip = 'Click an element in the browser';
    this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    this._outputChannel.appendLine('Pick mode started. Click an element in the browser.');

    // Remember which editor and position to insert into
    const targetEditor = editor;
    const targetPosition = editor.selection.active;

    // Listen for pick events
    this._browserManager.onEvent(async (event) => {
      if (!this._picking) return;

      if (event.type === 'element-picked-raw') {
        const info = event.info as { locator?: string };
        const locator = info?.locator;
        if (locator) {
          await this._insertLocator(targetEditor, targetPosition, `page.${locator}`);
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
    this._statusBarItem.text = '$(target) Pick';
    this._statusBarItem.tooltip = 'Playwright IDE: Pick Locator';
    this._statusBarItem.command = 'playwright-ide.pickLocator';
    this._statusBarItem.backgroundColor = undefined;
    this._browserManager.onEvent(null);
    this._outputChannel.appendLine('Pick mode ended.');
  }

  private async _insertLocator(editor: vscode.TextEditor, position: vscode.Position, locator: string) {
    // Bring editor back to focus first
    await vscode.window.showTextDocument(editor.document, editor.viewColumn);
    await editor.edit(editBuilder => {
      editBuilder.insert(position, locator);
    });
    // Move cursor to end of inserted text
    const newPos = new vscode.Position(position.line, position.character + locator.length);
    editor.selection = new vscode.Selection(newPos, newPos);
    this._outputChannel.appendLine(`Picked: ${locator}`);
  }
}
