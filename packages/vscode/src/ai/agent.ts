/**
 * AI assist — unified fix / polish / review loop using vscode.lm tool use.
 *
 * Gives the LLM browser tools (snapshot, run_command, run_test) so it can
 * inspect the page, fix failing tests, polish code, and verify changes.
 */

import type * as vscodeTypes from '../vscodeTypes';
import type { IBrowserManager } from '../browser';
import { parsePolishResponse, selectModel } from './provider';

// ─── Test Detection ──────────────────────────────────────────────────────────

/** Detect the full range of the test() call enclosing the cursor. */
function detectTestRange(
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
        return new vscode.Range(
          new vscode.Position(testOpenLine, 0),
          new vscode.Position(i, doc.lineAt(i).text.length),
        );
      }
    }
  }
  return undefined;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 10;

const AGENT_TOOLS = [
  {
    name: 'snapshot',
    description: 'Get the current page\'s ARIA accessibility tree. Use this to understand what elements are on the page and find the right locators.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page. Use this to see visual layout, styling, or issues that the ARIA tree cannot capture.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
  {
    name: 'run_command',
    description: 'Execute a single Playwright REPL command (e.g. "goto https://example.com", "click button \\"Submit\\"", "fill textbox \\"Email\\" hello@example.com"). Returns the command output or error.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        command: { type: 'string', description: 'The REPL command to execute' },
      },
      required: ['command'],
    },
  },
  {
    name: 'run_script',
    description: 'Run multi-line JavaScript code in the browser context. Use for complex operations like evaluating expressions, checking multiple elements, or running async sequences. Has access to `page`, `expect`, and all Playwright APIs.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'The JavaScript code to execute' },
      },
      required: ['code'],
    },
  },
  {
    name: 'run_test',
    description: 'Run a specific test from the current file by name. Compiles the full file (including beforeEach, fixtures, etc.) and runs only the named test. Returns pass/fail with error details. Note: the file is saved before running so changes in the editor are included.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        testName: { type: 'string', description: 'The exact test name to run, e.g. "has get started link"' },
      },
      required: ['testName'],
    },
  },
];

// ─── System Prompt ────────────────────────────────────────────────────────────

function buildAgentSystemPrompt(userPrompt?: string): string {
  const goal = userPrompt
    ? `Follow the user's instructions: "${userPrompt}"`
    : '';

  return `You are a Playwright test assistant. You have browser tools to interact with a live page.

Your job is to **fix**, **polish**, and **review** the given test code in a single pass.

## Playwright Best Practices

Follow these practices when polishing and reviewing:

**Locators** — use user-facing attributes, never implementation details:
- Prefer: getByRole() > getByText() > getByLabel() > getByPlaceholder() > getByTestId()
- Avoid: CSS selectors, XPath, page.$(), page.$$(), page.evaluate() when a locator works
- Use \`filter({ hasText })\` and \`locator()\` chaining instead of complex selectors

**Assertions** — use web-first assertions (they auto-wait and auto-retry):
- Use \`expect(locator).toBeVisible()\` — never \`waitForSelector()\`
- Use \`expect(page).toHaveURL()\` / \`toHaveTitle()\` for navigation
- Use \`toHaveText()\`, \`toHaveValue()\`, \`toHaveAttribute()\` for content checks
- Add assertions after every state-changing action (click, fill, navigate)
- Prefer specific assertions (toHaveText("Submit")) over generic ones (toBeVisible)

**Anti-patterns** — fix these when found:
- Replace \`page.waitForTimeout()\` with web-first assertions
- Replace \`page.waitForSelector()\` with \`expect(locator).toBeVisible()\`
- Replace \`elementHandle\` API with locators
- Remove \`force: true\` unless absolutely necessary
- Remove redundant or duplicate steps

**Readability**:
- Extract repeated locator chains into variables
- Add brief comments for complex multi-step flows (3+ actions)

## Steps

1. **Fix** — run the test; if it fails, diagnose and fix until it passes.
2. **Polish** — apply the best practices above, even when the test already passes.
3. **Review** — check for flaky patterns, missing assertions, and anti-patterns.
${goal ? `4. **User instruction** — ${goal}\n` : ''}
## Available tools
- **snapshot**: Get the page's accessibility tree to understand what's on the page.
- **screenshot**: Take a screenshot to see visual layout, styling, or issues the ARIA tree can't show.
- **run_command**: Execute a single REPL command (goto, click, fill, press, snapshot, etc.).
- **run_script**: Run multi-line JavaScript in the browser context for complex operations.
- **run_test**: Run a specific test by name from the current file. Compiles the full file (including beforeEach, fixtures) and returns pass/fail with errors.

## Workflow
1. Use \`snapshot\` to understand the current page state.
2. Use \`run_test\` to see if the test currently passes or fails.
3. If it fails — fix the issues (wrong locators, missing waits, incorrect assertions).
4. Polish and review the code using the best practices above.
5. Use \`run_test\` again to verify your final code passes.
6. Only return the final code AFTER verifying it passes with \`run_test\`.

## Constraints
- All tools run in the browser context (Chrome extension service worker). Node.js APIs are NOT available.
- Do NOT use require(), fs, path, or any Node.js modules in run_script.

## Output Rules
- Return ONLY the final improved code. No prose, no explanation, no code fences.
- Preserve the test's original intent — do NOT change what the test verifies.
- Return the EXACT same structure as the input (full test() block or code fragment).
- Preserve the original indentation style.
- Do NOT add imports, describe() wrappers, or test() wrappers that weren't in the input.`;
}

// ─── Tool Execution ───────────────────────────────────────────────────────────

type ToolResult = string | { image: Uint8Array; mime: string };

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  browserManager: IBrowserManager,
  editor: vscodeTypes.TextEditor,
): Promise<ToolResult> {
  switch (name) {
    case 'snapshot': {
      const result = await browserManager.runCommand('snapshot');
      return result.isError ? `ERROR: ${result.text}` : (result.text || '(empty snapshot)');
    }
    case 'screenshot': {
      const result = await browserManager.runCommand('screenshot');
      if (result.isError) return `ERROR: ${result.text}`;
      if (!result.image) return 'ERROR: No screenshot returned';
      // result.image is a data URL like "data:image/png;base64,..."
      const match = result.image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (!match) return 'ERROR: Invalid screenshot format';
      const bytes = Uint8Array.from(atob(match[2]), c => c.charCodeAt(0));
      return { image: bytes, mime: match[1] };
    }
    case 'run_command': {
      const result = await browserManager.runCommand(input.command as string);
      return result.isError ? `ERROR: ${result.text}` : (result.text || 'OK');
    }
    case 'run_script': {
      const result = await browserManager.runScript(input.code as string, 'javascript');
      return result.isError ? `ERROR: ${result.text}` : (result.text || 'OK');
    }
    case 'run_test': {
      const testResult = await runTestFromFile(editor, input.testName as string, browserManager);
      // If all tests were skipped, the grep didn't match — tell the AI
      if (testResult.includes('0 passed, 0 failed'))
        return testResult + '\n\nNote: No test matched that name. The test name must include the full path including describe() prefixes, e.g. "My Suite > my test name".';
      return testResult;
    }
    default:
      return `Unknown tool: ${name}`;
  }
}

/** Extract the test name from a test() block, e.g. test('my test', ...) → 'my test' */
function extractTestName(code: string): string | undefined {
  const match = code.match(/test\s*\(\s*(['"`])(.*?)\1/);
  return match ? match[2] : undefined;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

/** Compile the editor's file and run a specific test by name via the browser framework. */
async function runTestFromFile(
  editor: vscodeTypes.TextEditor,
  testName: string,
  browserManager: IBrowserManager,
): Promise<string> {
  let compile: ((filePath: string) => Promise<string>) | undefined;
  try {
    const bridgeUtils = require('@playwright-repl/runner/dist/bridge-utils.cjs') as {
      compile: (filePath: string) => Promise<string>;
    };
    compile = bridgeUtils.compile;
  } catch {
    return 'ERROR: @playwright-repl/runner not available for compilation';
  }

  const filePath = editor.document.uri.fsPath;
  let compiled: string;
  try {
    compiled = await compile(filePath);
  } catch (e: unknown) {
    return `ERROR: Compile failed: ${(e as Error).message}`;
  }

  const escapedName = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let script = 'globalThis.__resetTestState();\n';
  script += 'globalThis.__setGrepExact(' + JSON.stringify(`^${escapedName}$`) + ');\n';
  script += compiled + '\n';
  script += 'await globalThis.__runTests();';

  const result = await browserManager.runScript(script, 'javascript');
  return result.isError ? `FAILED:\n${result.text}` : `PASSED:\n${result.text || 'All tests passed'}`;
}

export async function aiAssist(
  vscode: vscodeTypes.VSCode,
  editor: vscodeTypes.TextEditor,
  browserManager: IBrowserManager,
  logger?: vscodeTypes.LogOutputChannel,
  userPrompt?: string,
): Promise<void> {
  const log = (msg: string) => logger?.info(`[AI Assist] ${msg}`);
  // Determine target range
  const selection = editor.selection;
  const targetRange = (selection && !selection.isEmpty)
    ? new vscode.Range(selection.start, selection.end)
    : detectTestRange(vscode, editor);

  if (!targetRange) {
    vscode.window.showWarningMessage('Place your cursor inside a test() function, or select code to fix.');
    return;
  }

  log(`Target range: lines ${targetRange.start.line + 1}-${targetRange.end.line + 1}`);

  const originalText = editor.document.getText(targetRange);
  if (!originalText.trim()) {
    vscode.window.showWarningMessage('No code to fix.');
    return;
  }

  // Select model
  const model = await selectModel(vscode);
  if (!model) {
    vscode.window.showWarningMessage('No AI model available. Install GitHub Copilot or another LLM extension, or check playwright-repl.aiModel/aiVendor settings.');
    return;
  }
  log(`Selected model: ${model.id || model.name || 'unknown'} (vendor: ${model.vendor || 'unknown'})`);

  // Include full file context so the AI knows test names, describes, and beforeEach hooks
  const fullFileText = editor.document.getText();

  // Build initial messages — no snapshot included, AI must call snapshot tool itself
  const messages: any[] = [
    vscode.LanguageModelChatMessage.User(buildAgentSystemPrompt(userPrompt)),
    vscode.LanguageModelChatMessage.User(
      `Here is the full test file for context:\n\n${fullFileText}\n\n`
      + `Here is the specific test code to improve (lines ${targetRange.start.line + 1}-${targetRange.end.line + 1}):\n\n${originalText}\n\n`
      + 'IMPORTANT: Start by calling the snapshot tool to see the current page state before making any changes. '
      + 'When using run_test, use the FULL test name including describe() prefixes separated by " > ".',
    ),
  ];

  // Run agent loop with progress
  let finalCode: string | undefined;
  let lastRunTestName: string | undefined; // track full test name from agent's run_test calls
  let codeAlreadyApplied = false; // set when auto-verify applies + saves the code

  try {
    finalCode = await vscode.window.withProgress(
      {
        location: 15 /* ProgressLocation.Notification */,
        title: 'AI Assist',
        cancellable: true,
      },
      async (progress, token) => {
        for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
          if (token.isCancellationRequested) return undefined;

          progress.report({ message: `iteration ${iteration + 1}/${MAX_ITERATIONS}` });

          // Force snapshot on first iteration so the AI inspects the page
          const tools = iteration === 0 ? [AGENT_TOOLS[0]] : AGENT_TOOLS; // snapshot only on first
          const toolMode = iteration === 0 ? 2 /* LanguageModelChatToolMode.Required */ : undefined;
          const response = await model.sendRequest(messages, { tools, toolMode }, token);

          // Collect text and tool call parts from the stream
          const textParts: string[] = [];
          const toolCalls: Array<{ callId: string; name: string; input: Record<string, unknown> }> = [];

          for await (const chunk of response.stream) {
            if (chunk instanceof (vscode as any).LanguageModelTextPart) {
              textParts.push(chunk.value);
            } else if (chunk instanceof (vscode as any).LanguageModelToolCallPart) {
              toolCalls.push({ callId: chunk.callId, name: chunk.name, input: chunk.input });
            }
          }

          log(`Iteration ${iteration + 1}: ${toolCalls.length} tool calls, ${textParts.join('').length} chars text`);

          // No tool calls — model is done, text is the final answer
          if (toolCalls.length === 0) {
            const finalText = textParts.join('');
            log('Model returned final answer (no tool calls)');
            log(`Response:\n${finalText}`);

            // Auto-verify: run the test before accepting the code
            const candidateCode = parsePolishResponse(finalText, originalText);
            const verifyName = lastRunTestName || extractTestName(candidateCode);
            if (verifyName && candidateCode.trim() !== originalText.trim()) {
              progress.report({ message: 'verifying...' });
              // Apply code and save so run_test compiles the latest file
              await editor.edit(eb => eb.replace(targetRange, candidateCode));
              await editor.document.save();
              const verifyResult = await runTestFromFile(editor, verifyName, browserManager);
              log(`Auto-verify "${verifyName}": ${verifyResult.slice(0, 200)}`);
              const passed = verifyResult.includes('✓') && !verifyResult.includes('✗');
              const failed = !passed;
              if (failed && iteration < MAX_ITERATIONS - 1) {
                // Revert and feed error back to the agent
                await vscode.commands.executeCommand('undo');
                await editor.document.save();
                log('Test failed — feeding error back to agent');
                messages.push(
                  vscode.LanguageModelChatMessage.Assistant(finalText),
                  vscode.LanguageModelChatMessage.User(
                    `I applied your code and ran the test "${verifyName}", but it FAILED:\n\n${verifyResult}\n\n`
                    + 'Please fix the code and return the corrected version. Remember to preserve the original test structure.',
                  ),
                );
                continue; // retry
              }
              // Auto-verify passed — code is already in the editor
              codeAlreadyApplied = true;
            }

            return finalText;
          }

          // Execute tool calls and feed results back
          for (const tc of toolCalls) {
            if (token.isCancellationRequested) return undefined;

            progress.report({ message: `iteration ${iteration + 1}/${MAX_ITERATIONS} — ${tc.name}` });

            log(`Tool call: ${tc.name}(${JSON.stringify(tc.input)})`);

            // Track the full test name (with describe prefix) from run_test calls
            if (tc.name === 'run_test' && tc.input.testName)
              lastRunTestName = tc.input.testName as string;

            let result: ToolResult;
            try {
              result = await executeTool(tc.name, tc.input, browserManager, editor);
            } catch (e: unknown) {
              result = `ERROR: ${(e as Error).message}`;
            }

            const resultSummary = typeof result === 'string' ? result.slice(0, 200) : `[image ${result.mime}]`;
            log(`Tool result: ${resultSummary}`);

            const resultParts: any[] = typeof result === 'string'
              ? [new (vscode as any).LanguageModelTextPart(result)]
              : [(vscode as any).LanguageModelDataPart.image(result.image, result.mime)];

            const LMMessage = vscode.LanguageModelChatMessage;
            messages.push(
              (LMMessage as any).Assistant([
                new (vscode as any).LanguageModelToolCallPart(tc.callId, tc.name, tc.input),
              ]),
              (LMMessage as any).User([
                new (vscode as any).LanguageModelToolResultPart(tc.callId, resultParts),
              ]),
            );
          }
        }

        // Max iterations reached — ask model for final answer without tools
        progress.report({ message: 'finishing up...' });
        const finalResponse = await model.sendRequest(messages, {}, token);
        let text = '';
        for await (const chunk of finalResponse.text) text += chunk;
        return text;
      },
    );
  } catch (e: unknown) {
    if ((e as Error).message?.includes('Cancelled') || (e as Error).message?.includes('canceled'))
      return;
    vscode.window.showErrorMessage(`AI Assist failed: ${(e as Error).message}`);
    return;
  }

  if (!finalCode) return;

  log(`Final code: ${finalCode.length} chars`);

  try {
    // Detect prose responses (reviews, explanations) vs code
    const isProse = /^(Here|I |The |This |Sure|Let me|##|Based on|\*\*)/im.test(finalCode.trim());
    if (isProse) {
      log('Response is prose — showing in output channel');
      if (logger) {
        logger.appendLine('\n── AI Assist ──────────────────────────────────');
        logger.appendLine(finalCode);
        logger.appendLine('───────────────────────────────────────────────\n');
        logger.show(true); // true = preserve focus on editor
      }
      return;
    }

    if (codeAlreadyApplied) {
      log('Code already applied and verified by auto-verify');
      return;
    }

    // Parse and validate
    const polished = parsePolishResponse(finalCode, originalText);
    log(`Parsed: ${polished.length} chars, Original: ${originalText.length} chars, Same: ${polished.trim() === originalText.trim()}`);

    if (polished.trim() === originalText.trim()) {
      log('No changes needed');
      vscode.window.showInformationMessage('Code looks good — no changes needed.');
      return;
    }

    // Replace code (user can Ctrl+Z to revert)
    log('Replacing editor content...');
    const success = await editor.edit(editBuilder => {
      editBuilder.replace(targetRange, polished);
    });
    log(`Replace result: ${success}`);
  } catch (e: unknown) {
    log(`Error in final step: ${(e as Error).message}\n${(e as Error).stack}`);
    vscode.window.showErrorMessage(`AI Assist failed: ${(e as Error).message}`);
  }
}
