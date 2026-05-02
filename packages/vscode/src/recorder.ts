/**
 * Recorder
 *
 * Manages the recording flow in VS Code:
 * 1. Detects cursor context (inside/outside test function)
 * 2. Generates test template if needed
 * 3. Starts recording via BrowserManager
 * 4. Receives streamed actions via page events
 * 5. Inserts each action at cursor in the active editor
 */

import type * as vscodeTypes from './vscodeTypes';
import type { IBrowserManager } from './browser.js';

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
export function detectCursorContext(editor: vscodeTypes.TextEditor): CursorContext {
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

// ─── Recorder Class ────────────────────────────────────────────────────────

export class Recorder {
  private _vscode: vscodeTypes.VSCode;
  private _browserManager: IBrowserManager;
  private _outputChannel: vscodeTypes.LogOutputChannel;
  private _recording = false;
  private _statusBarItem;
  private _indentation = 4;
  private _editor: vscodeTypes.TextEditor | undefined;

  private _lastInsertLine = -1;
  private _lastInsertLength = 0;
  private _editQueue: Promise<void> = Promise.resolve();

  constructor(vscode: vscodeTypes.VSCode, browserManager: IBrowserManager, outputChannel: vscodeTypes.LogOutputChannel) {
    this._vscode = vscode;
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
      this._vscode.window.showWarningMessage('Launch browser first.');
      return;
    }

    this._editor = this._vscode.window.activeTextEditor;
    const ctx = this._editor ? detectCursorContext(this._editor) : null;

    // If outside test function (or no editor), generate template
    if (!ctx || !ctx.inside) {
      if (!this._editor) {
        this._vscode.window.showWarningMessage('Open a test file first.');
        return;
      }
      await this._insertTemplate(this._editor, ctx!.insertLine);
    } else {
      this._indentation = ctx.indentation;
      this._lastInsertLine = ctx.insertLine;
      this._lastInsertLength = 0;
    }

    // Register event listener BEFORE starting recording to avoid race condition
    this._recording = true;
    this._statusBarItem.text = '$(debug-stop) Stop Recording';
    this._statusBarItem.tooltip = 'Playwright REPL: Stop Recording';
    this._statusBarItem.command = 'playwright-repl.stopRecording';
    this._statusBarItem.backgroundColor = new this._vscode.ThemeColor('statusBarItem.errorBackground');

    this._browserManager.onEvent((event) => {
      if (!this._recording || !this._editor) return;

      if (event.type === 'recorded-action') {
        const action = event.action as { js: string; pw: string };
        this._insertAtCursor(this._editor!, action.js, this._indentation);
      }

      if (event.type === 'recorded-fill-update') {
        const action = event.action as { js: string; pw: string };
        this._replaceLastInsert(this._editor!, action.js, this._indentation);
      }
    });

    // Start recording — returns URL of current page
    const result = await this._browserManager.runCommand('record-start');
    if (result.isError) {
      this._recording = false;
      this._statusBarItem.text = '$(circle-filled) Record';
      this._statusBarItem.command = 'playwright-repl.startRecording';
      this._statusBarItem.backgroundColor = undefined;
      this._browserManager.onEvent(null);
      this._vscode.window.showErrorMessage(`Recording failed: ${result.text}`);
      return;
    }

    // Insert goto only when starting a new test (template was inserted or cursor is at first line)
    if (!ctx || !ctx.inside) {
      const urlMatch = result.text?.match(/Recording started:\s*(.+)/);
      const url = urlMatch?.[1]?.trim() || '';
      if (url && this._editor) {
        this._insertAtCursor(this._editor, `await page.goto('${url}');`, this._indentation);
      }
    }

    this._outputChannel.appendLine('Recording started.');
  }

  async stop() {
    if (!this._recording) return;

    await this._browserManager.runCommand('record-stop');
    this._recording = false;
    this._statusBarItem.text = '$(circle-filled) Record';
    this._statusBarItem.tooltip = 'Playwright REPL: Start Recording';
    this._statusBarItem.command = 'playwright-repl.startRecording';
    this._statusBarItem.backgroundColor = undefined;
    this._browserManager.onEvent(null);
    this._outputChannel.appendLine('Recording stopped.');
  }

  // ─── Private ───────────────────────────────────────────────────────────

  private _insertAtCursor(editor: vscodeTypes.TextEditor, text: string, indent: number) {
    this._editQueue = this._editQueue.then(async () => {
      const indentStr = ' '.repeat(indent);
      const line = `${indentStr}${text}\n`;
      const pos = new this._vscode.Position(this._lastInsertLine, 0);

      await editor.edit(editBuilder => {
        editBuilder.insert(pos, line);
      });

      this._lastInsertLength = 1;
      this._lastInsertLine++;

      // Move cursor to inserted line
      const newPos = new this._vscode.Position(this._lastInsertLine, 0);
      editor.selection = new this._vscode.Selection(newPos, newPos);
      editor.revealRange(new this._vscode.Range(newPos, newPos));
    });
  }

  private _replaceLastInsert(editor: vscodeTypes.TextEditor, text: string, indent: number) {
    this._editQueue = this._editQueue.then(async () => {
      if (this._lastInsertLength === 0) {
        // No previous insert — do a regular insert instead (inline, not queued again)
        const indentStr = ' '.repeat(indent);
        const line = `${indentStr}${text}\n`;
        const pos = new this._vscode.Position(this._lastInsertLine, 0);
        await editor.edit(editBuilder => { editBuilder.insert(pos, line); });
        this._lastInsertLength = 1;
        this._lastInsertLine++;
        return;
      }

      const indentStr = ' '.repeat(indent);
      const line = `${indentStr}${text}`;
      const replaceLine = this._lastInsertLine - 1;

      await editor.edit(editBuilder => {
        const range = new this._vscode.Range(
          new this._vscode.Position(replaceLine, 0),
          new this._vscode.Position(replaceLine, editor.document.lineAt(replaceLine).text.length),
        );
        editBuilder.replace(range, line);
      });
    });
  }

  private async _insertTemplate(editor: vscodeTypes.TextEditor, line: number) {
    const indent = '  ';
    const template = [
      '',
      `test('new test', async ({ page }) => {`,
      `});`,
      '',
    ].join('\n');

    await editor.edit(editBuilder => {
      editBuilder.insert(new this._vscode.Position(line, 0), template);
    });

    // Position for recording: inside the template body
    this._indentation = indent.length;
    this._lastInsertLine = line + 2; // inside the test body (after opening brace)
    this._lastInsertLength = 0;
  }
}
