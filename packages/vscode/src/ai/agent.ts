/**
 * AI test agent — iterative write/run/debug loop using vscode.lm tool use.
 *
 * Gives the LLM browser tools (snapshot, run_command, run_test) so it can
 * verify and fix test code against the live page.
 */

import type * as vscodeTypes from '../vscodeTypes';
import type { IBrowserManager } from '../browser';
import { detectTestRange } from './polish';
import { parsePolishResponse } from './provider';

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
    description: 'Run multi-line JavaScript code in the browser context. Use for complex operations like evaluating expressions, checking multiple elements, or running async sequences.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: { type: 'string', description: 'The JavaScript code to execute' },
      },
      required: ['code'],
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

## Workflow
1. Use \`snapshot\` to understand the current page state.
2. Analyze the test code and identify issues (wrong locators, missing waits, incorrect assertions).
3. Use \`run_command\` to explore the page if needed (e.g. click through a flow to verify element names).
4. Use \`run_script\` to test complex expressions or validate locators.
5. If something fails, read the error, fix the code, and try again.
6. When you're confident the code is correct, return the final improved code.

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
    default:
      return `Unknown tool: ${name}`;
  }
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

export async function agentWithAI(
  vscode: vscodeTypes.VSCode,
  editor: vscodeTypes.TextEditor,
  browserManager: IBrowserManager,
  userPrompt?: string,
): Promise<void> {
  // Determine target range
  const selection = editor.selection;
  const targetRange = (selection && !selection.isEmpty)
    ? new vscode.Range(selection.start, selection.end)
    : detectTestRange(vscode, editor);

  if (!targetRange) {
    vscode.window.showWarningMessage('Place your cursor inside a test() function, or select code to fix.');
    return;
  }

  const originalText = editor.document.getText(targetRange);
  if (!originalText.trim()) {
    vscode.window.showWarningMessage('No code to fix.');
    return;
  }

  // Select model
  const lm = (vscode as any).lm;
  if (!lm?.selectChatModels) {
    vscode.window.showWarningMessage('No AI model available. Install GitHub Copilot or another LLM extension.');
    return;
  }
  const models = await lm.selectChatModels();
  if (!models.length) {
    vscode.window.showWarningMessage('No AI model available. Install GitHub Copilot or another LLM extension.');
    return;
  }
  const model = models[0];

  // Get initial page snapshot for context
  let pageSnapshot = '';
  try {
    const snapResult = await browserManager.runCommand('snapshot');
    if (!snapResult.isError && snapResult.text) pageSnapshot = snapResult.text;
  } catch { /* snapshot is optional context */ }

  // Build initial messages
  const messages: any[] = [
    vscode.LanguageModelChatMessage.User(buildAgentSystemPrompt(userPrompt)),
    vscode.LanguageModelChatMessage.User(
      `Here is the test code to improve:\n\n${originalText}`
      + (pageSnapshot ? `\n\nCurrent page state:\n${pageSnapshot.slice(0, 3000)}` : ''),
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

          const response = await model.sendRequest(messages, { tools: AGENT_TOOLS }, token);

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

          // No tool calls — model is done, text is the final answer
          if (toolCalls.length === 0) {
            return textParts.join('');
          }

          // Execute tool calls and feed results back
          for (const tc of toolCalls) {
            if (token.isCancellationRequested) return undefined;

            progress.report({ message: `iteration ${iteration + 1}/${MAX_ITERATIONS} — ${tc.name}` });

            let result: ToolResult;
            try {
              result = await executeTool(tc.name, tc.input, browserManager);
            } catch (e: unknown) {
              result = `ERROR: ${(e as Error).message}`;
            }

            const resultParts: any[] = typeof result === 'string'
              ? [new (vscode as any).LanguageModelTextPart(result)]
              : [new (vscode as any).LanguageModelDataPart.image(result.image, result.mime)];

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

  // Parse and validate
  const polished = parsePolishResponse(finalCode, originalText);
  if (polished.trim() === originalText.trim()) {
    vscode.window.showInformationMessage('Code looks good — no changes needed.');
    return;
  }

  // Replace code (user can Ctrl+Z to revert)
  await editor.edit(editBuilder => {
    editBuilder.replace(targetRange, polished);
  });
}
