/**
 * Polish with AI — improves recorded test code in one AI pass.
 *
 * Handles range detection, code replacement, and snapshot/revert logic.
 */

import type * as vscodeTypes from '../vscodeTypes';
import type { AIProvider } from './provider';
import type { IBrowserManager } from '../browser';

// ─── Test Detection ─────────────────────────────────────────────────────────

/**
 * Detect the full range of the test() call enclosing the cursor.
 * Includes the test declaration line through the closing `});`.
 */
export function detectTestRange(
  vscode: vscodeTypes.VSCode,
  editor: vscodeTypes.TextEditor,
): vscodeTypes.Range | undefined {
  const doc = editor.document;
  const cursorLine = editor.selection.active.line;

  // Walk backward to find test( opening
  let braceDepth = 0;
  let testOpenLine = -1;
  for (let i = cursorLine; i >= 0; i--) {
    const line = doc.lineAt(i).text;
    for (let j = line.length - 1; j >= 0; j--) {
      if (line[j] === '}') braceDepth++;
      if (line[j] === '{') braceDepth--;
    }
    if (braceDepth < 0 && /(?:^|\s)test\s*\(/.test(line)) {
      testOpenLine = i;
      break;
    }
  }
  if (testOpenLine < 0) return undefined;

  // Find the arrow function body opening brace: look for `=> {`
  let bodyStart = -1;
  for (let i = testOpenLine; i < doc.lineCount; i++) {
    const line = doc.lineAt(i).text;
    if (line.match(/=>\s*\{/)) {
      bodyStart = i + 1;
      break;
    }
  }
  if (bodyStart < 0) return undefined;

  // Walk forward to find matching closing `});`
  braceDepth = 1;
  for (let i = bodyStart; i < doc.lineCount; i++) {
    const line = doc.lineAt(i).text;
    for (const ch of line) {
      if (ch === '{') braceDepth++;
      if (ch === '}') braceDepth--;
      if (braceDepth === 0) {
        // Include through the end of the closing line (the `});` line)
        return new vscode.Range(
          new vscode.Position(testOpenLine, 0),
          new vscode.Position(i, doc.lineAt(i).text.length),
        );
      }
    }
  }
  return undefined;
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

export async function polishWithAI(
  vscode: vscodeTypes.VSCode,
  aiProvider: AIProvider,
  editor: vscodeTypes.TextEditor,
  browserManager?: IBrowserManager,
  range?: vscodeTypes.Range,
): Promise<void> {
  // Determine range
  const targetRange = range || detectTestRange(vscode, editor);
  if (!targetRange) {
    vscode.window.showWarningMessage('Place your cursor inside a test() function, or select code to polish.');
    return;
  }

  const originalText = editor.document.getText(targetRange);
  if (!originalText.trim()) {
    vscode.window.showWarningMessage('No code to polish.');
    return;
  }

  // Opportunistic page snapshot
  let pageSnapshot: string | undefined;
  if (browserManager?.isRunning()) {
    try {
      const result = await browserManager.runCommand('snapshot');
      if (!result.isError && result.text) pageSnapshot = result.text;
    } catch { /* ignore — snapshot is optional */ }
  }

  // Call AI with progress
  let polished: string;
  try {
    polished = await vscode.window.withProgress(
      { location: 15 /* ProgressLocation.Notification */, title: 'Polishing with AI...' },
      () => aiProvider.polishCode(originalText, pageSnapshot),
    );
  } catch (e: unknown) {
    vscode.window.showErrorMessage(`Polish failed: ${(e as Error).message}`);
    return;
  }


  // If AI returned the same code, nothing to do
  if (polished.trim() === originalText.trim()) {
    vscode.window.showInformationMessage('Code looks good — no changes needed.');
    return;
  }

  // Replace code (user can Ctrl+Z to revert)
  await editor.edit(editBuilder => {
    editBuilder.replace(targetRange, polished);
  });
}

