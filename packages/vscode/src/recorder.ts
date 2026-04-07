/**
 * Recorder
 *
 * Manages the recording flow in VS Code:
 * 1. Detects cursor context (inside/outside test function)
 * 2. Generates test template if needed
 * 3. Starts recording via Playwright's built-in Recorder (_enableRecorder)
 * 4. Receives actions via in-process channel callbacks (no polling)
 * 5. Inserts each action at cursor in the active editor
 */

import * as vscode from 'vscode';
import type { BrowserManager } from './browser.js';

// ─── Cursor Context Detection ──────────────────────────────────────────────

interface CursorContext {
  inside: boolean;       // true if cursor is inside a test() callback
  indentation: number;   // indentation level for inserted code
  insertLine: number;    // line number to start inserting
}

/**
 * Detect whether the cursor is inside a test() function body.
 * If inside, returns the indentation and insert position.
 * If outside, returns inside=false so we generate a template.
 */
function detectCursorContext(editor: vscode.TextEditor): CursorContext {
  const doc = editor.document;
  const cursorLine = editor.selection.active.line;

  // Walk backward from cursor looking for test( or test.describe(
  let braceDepth = 0;
  for (let i = cursorLine; i >= 0; i--) {
    const line = doc.lineAt(i).text;

    // Count braces from right to left on this line
    for (let j = line.length - 1; j >= 0; j--) {
      if (line[j] === '}') braceDepth++;
      if (line[j] === '{') braceDepth--;
    }

    // If we're inside an opening brace and this line has test(
    if (braceDepth < 0 && /(?:^|\s)test\s*\(/.test(line)) {
      // We're inside a test() callback
      const currentLine = doc.lineAt(cursorLine).text;
      const isEmpty = currentLine.trim() === '';
      const indentation = isEmpty
        ? (doc.lineAt(cursorLine > 0 ? cursorLine - 1 : 0).text.match(/^(\s*)/)?.[1].length ?? 4)
        : (currentLine.match(/^(\s*)/)?.[1].length ?? 4);
      return { inside: true, indentation, insertLine: isEmpty ? cursorLine : cursorLine + 1 };
    }
  }

  // Cursor is outside any test function
  return { inside: false, indentation: 4, insertLine: cursorLine };
}

// ─── Editor Insertion ──────────────────────────────────────────────────────

let lastInsertLine = -1;
let lastInsertLength = 0;
let editQueue: Promise<void> = Promise.resolve();

function insertAtCursor(editor: vscode.TextEditor, text: string, indent: number) {
  editQueue = editQueue.then(async () => {
    const indentStr = ' '.repeat(indent);
    const line = `${indentStr}${text}\n`;
    const pos = new vscode.Position(lastInsertLine, 0);

    await editor.edit(editBuilder => {
      editBuilder.insert(pos, line);
    });

    lastInsertLength = 1;
    lastInsertLine++;

    // Move cursor to inserted line
    const newPos = new vscode.Position(lastInsertLine, 0);
    editor.selection = new vscode.Selection(newPos, newPos);
    editor.revealRange(new vscode.Range(newPos, newPos));
  });
}

function replaceLastInsert(editor: vscode.TextEditor, text: string, indent: number) {
  editQueue = editQueue.then(async () => {
    if (lastInsertLength === 0) {
      // No previous insert — do a regular insert instead (inline, not queued again)
      const indentStr = ' '.repeat(indent);
      const line = `${indentStr}${text}\n`;
      const pos = new vscode.Position(lastInsertLine, 0);
      await editor.edit(editBuilder => { editBuilder.insert(pos, line); });
      lastInsertLength = 1;
      lastInsertLine++;
      return;
    }

    const indentStr = ' '.repeat(indent);
    const line = `${indentStr}${text}`;
    const replaceLine = lastInsertLine - 1;

    await editor.edit(editBuilder => {
      const range = new vscode.Range(
        new vscode.Position(replaceLine, 0),
        new vscode.Position(replaceLine, editor.document.lineAt(replaceLine).text.length),
      );
      editBuilder.replace(range, line);
    });
  });
}

// ─── Recorder Class ────────────────────────────────────────────────────────

export class Recorder {
  private _browserManager: BrowserManager;
  private _outputChannel: vscode.OutputChannel;
  private _recording = false;
  private _statusBarItem: vscode.StatusBarItem;
  private _indentation = 4;
  private _editor: vscode.TextEditor | undefined;

  constructor(browserManager: BrowserManager, outputChannel: vscode.OutputChannel) {
    this._browserManager = browserManager;
    this._outputChannel = outputChannel;

    // Status bar item — always visible, toggles between Record / Stop
    this._statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this._statusBarItem.text = '$(circle-filled) Record';
    this._statusBarItem.tooltip = 'Playwright REPL: Start Recording';
    this._statusBarItem.command = 'playwright-repl.startRecording';
    this._statusBarItem.show();
  }

  get isRecording() { return this._recording; }

  dispose() {
    this._statusBarItem.dispose();
  }

  async start() {
    if (this._recording) return;
    if (!this._browserManager.isRunning()) {
      vscode.window.showWarningMessage('Launch browser first.');
      return;
    }

    this._editor = vscode.window.activeTextEditor;
    const ctx = this._editor ? detectCursorContext(this._editor) : null;

    // If outside test function (or no editor), generate template
    if (!ctx || !ctx.inside) {
      if (!this._editor) {
        vscode.window.showWarningMessage('Open a test file first.');
        return;
      }
      await this._insertTemplate(this._editor, ctx!.insertLine);
    } else {
      this._indentation = ctx.indentation;
      lastInsertLine = ctx.insertLine;
      lastInsertLength = 0;
    }

    // Insert goto for new templates
    if ((!ctx || !ctx.inside) && this._editor) {
      const page = this._browserManager.page;
      const url = page?.url?.() || '';
      if (url && url !== 'about:blank')
        insertAtCursor(this._editor, `await page.goto('${url}');`, this._indentation);
    }

    // Start recording via Playwright's built-in Recorder
    this._recording = true;
    this._statusBarItem.text = '$(debug-stop) Stop Recording';
    this._statusBarItem.tooltip = 'Playwright REPL: Stop Recording';
    this._statusBarItem.command = 'playwright-repl.stopRecording';
    this._statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');

    try {
      await this._browserManager.startRecording({
        onActionAdded: (code: string) => {
          if (!this._recording || !this._editor) return;
          insertAtCursor(this._editor, code, this._indentation);
        },
        onActionUpdated: (code: string) => {
          if (!this._recording || !this._editor) return;
          replaceLastInsert(this._editor, code, this._indentation);
        },
      });
    } catch (e) {
      this._recording = false;
      this._statusBarItem.text = '$(circle-filled) Record';
      this._statusBarItem.command = 'playwright-repl.startRecording';
      this._statusBarItem.backgroundColor = undefined;
      vscode.window.showErrorMessage(`Recording failed: ${String(e)}`);
      return;
    }

    this._outputChannel.appendLine('Recording started.');
  }

  async stop() {
    if (!this._recording) return;

    await this._browserManager.stopRecording();
    this._recording = false;
    this._statusBarItem.text = '$(circle-filled) Record';
    this._statusBarItem.tooltip = 'Playwright REPL: Start Recording';
    this._statusBarItem.command = 'playwright-repl.startRecording';
    this._statusBarItem.backgroundColor = undefined;
    this._outputChannel.appendLine('Recording stopped.');
  }

  private async _insertTemplate(editor: vscode.TextEditor, line: number) {
    const indent = '  ';
    const template = [
      '',
      `test('new test', async ({ page }) => {`,
      `});`,
      '',
    ].join('\n');

    await editor.edit(editBuilder => {
      editBuilder.insert(new vscode.Position(line, 0), template);
    });

    // Position for recording: inside the template body
    this._indentation = indent.length;
    lastInsertLine = line + 2; // inside the test body (after opening brace)
    lastInsertLength = 0;
  }
}
