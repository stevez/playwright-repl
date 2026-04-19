/**
 * AI test agent — iterative write/run/debug loop using vscode.lm tool use.
 *
 * Gives the LLM browser tools (snapshot, run_command, run_test) so it can
 * verify and fix test code against the live page.
 */

import type * as vscodeTypes from '../vscodeTypes';
import type { IBrowserManager } from '../browser';
import { detectTestRange } from './polish';
import { parsePolishResponse, selectModel } from './provider';

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
    : 'Improve the given test code until it passes against the current page.';

  return `You are a Playwright test agent. You have browser tools to interact with a live page.

Your goal: ${goal}

## Available tools
- **snapshot**: Get the page's accessibility tree to understand what's on the page.
- **screenshot**: Take a screenshot to see visual layout, styling, or issues the ARIA tree can't show.
- **run_command**: Execute a single REPL command (goto, click, fill, press, snapshot, etc.).
- **run_script**: Run multi-line JavaScript in the browser context for complex operations.
- **run_test**: Run a specific test by name from the current file. Compiles the full file (including beforeEach, fixtures) and returns pass/fail with errors.

## Workflow
1. Use \`snapshot\` to understand the current page state.
2. Analyze the test code and identify issues (wrong locators, missing waits, incorrect assertions).
3. Use \`run_command\` to explore the page if needed (e.g. click through a flow to verify element names).
4. Use \`run_test\` with the test name to verify your fix. It compiles the full file (with beforeEach, fixtures, etc.) and runs just that test.
5. If the test fails, read the error, fix the code, and try again.
6. Only return the final code AFTER verifying it passes with \`run_test\`.

## Constraints
- All tools run in the browser context (Chrome extension service worker). Node.js APIs are NOT available.
- Do NOT use require(), fs, path, or any Node.js modules in run_script.

## Rules
- Return ONLY the final improved code. No prose, no explanation, no code fences.
- Preserve the test's original intent — do NOT change what the test verifies.
- Return the EXACT same structure as the input (full test() block or code fragment).
- Preserve the original indentation style.
- Use semantic Playwright locators: getByRole() > getByText() > getByTestId() > CSS.
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

export async function agentWithAI(
  vscode: vscodeTypes.VSCode,
  editor: vscodeTypes.TextEditor,
  browserManager: IBrowserManager,
  logger?: vscodeTypes.LogOutputChannel,
  userPrompt?: string,
): Promise<void> {
  const log = (msg: string) => logger?.info(`[AI Agent] ${msg}`);
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

  try {
    finalCode = await vscode.window.withProgress(
      {
        location: 15 /* ProgressLocation.Notification */,
        title: 'AI Agent',
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
            return finalText;
          }

          // Execute tool calls and feed results back
          for (const tc of toolCalls) {
            if (token.isCancellationRequested) return undefined;

            progress.report({ message: `iteration ${iteration + 1}/${MAX_ITERATIONS} — ${tc.name}` });

            log(`Tool call: ${tc.name}(${JSON.stringify(tc.input)})`);

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
    vscode.window.showErrorMessage(`AI Agent failed: ${(e as Error).message}`);
    return;
  }

  if (!finalCode) return;

  log(`Final code: ${finalCode.length} chars`);

  try {
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
    vscode.window.showErrorMessage(`AI Agent failed: ${(e as Error).message}`);
  }
}
