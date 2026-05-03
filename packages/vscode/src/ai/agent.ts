/**
 * AI assist — unified fix / polish / review loop using vscode.lm tool use.
 *
 * Gives the LLM browser tools (snapshot, run_command, run_test) so it can
 * inspect the page, fix failing tests, polish code, and verify changes.
 */

import type * as vscodeTypes from '../vscodeTypes';
import type { IBrowserManager } from '../browser';
import { parsePolishResponse, selectModel } from './provider';
import { Linter } from 'eslint/universal';
import playwrightPlugin from 'eslint-plugin-playwright';
import { execFile } from 'child_process';
import path from 'path';

// ─── Agent Event Protocol ────────────────────────────────────────────────────

export type AgentEvent =
  | { type: 'text'; value: string }
  | { type: 'toolCallStart'; name: string; input: Record<string, unknown>; callId: string }
  | { type: 'toolCallEnd'; name: string; callId: string; result: string }
  | { type: 'iteration'; current: number; max: number }
  | { type: 'verifyStart'; testName: string }
  | { type: 'verifyEnd'; testName: string; passed: boolean; output: string }
  | { type: 'codeApplied'; code: string }
  | { type: 'done'; summary: string }
  | { type: 'error'; message: string };

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
    if (braceDepth < 0 && /(?:^|\s)(?:test|it)\s*\(/.test(line)) {
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

const MAX_ITERATIONS_AUTO = 5;   // auto mode: test → fix → verify
const MAX_ITERATIONS_CUSTOM = 3; // custom prompt: use tools, respond

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
  {
    name: 'lint',
    description: 'Run eslint-plugin-playwright rules against the current file. Returns lint violations (missing awaits, deprecated APIs, raw locators, etc.). Use this during the review phase to catch anti-patterns.',
    inputSchema: { type: 'object' as const, properties: {} },
  },
];

// ─── Linter ──────────────────────────────────────────────────────────────────

const linter = new Linter();
const recommendedConfig = (playwrightPlugin as any).configs['flat/recommended'];
const lintConfig = {
  ...recommendedConfig,
  languageOptions: { ecmaVersion: 2022 as const, sourceType: 'module' as const },
};

// ─── System Prompt ────────────────────────────────────────────────────────────

const TOOLS_DESCRIPTION = `## Available tools
- **snapshot**: Get the page's accessibility tree to understand what's on the page.
- **screenshot**: Take a screenshot to see visual layout, styling, or issues the ARIA tree can't show.
- **run_command**: Execute a single REPL command (goto, click, fill, press, snapshot, etc.).
- **run_script**: Run multi-line JavaScript in the browser context for complex operations.
- **run_test**: Run a specific test by name from the current file. Returns pass/fail with errors.
- **lint**: Run eslint-plugin-playwright rules on the current file. Returns violations.`;

const BEST_PRACTICES = `## Playwright Best Practices
**Locators**: getByRole() > getByText() > getByLabel() > getByPlaceholder() > getByTestId(). Avoid CSS/XPath.
**Assertions**: Use web-first assertions (toBeVisible, toHaveText, toHaveURL). Never waitForSelector/waitForTimeout.
**Anti-patterns**: Replace page.$eval, elementHandle API, force:true. Remove redundant steps.
**Readability**: Extract repeated locators into variables. Brief comments for complex flows.`;

function buildAutoSystemPrompt(): string {
  return `You are a Playwright test assistant. Fix, polish, and review the given test code.

${BEST_PRACTICES}

${TOOLS_DESCRIPTION}

## Workflow
1. Run \`run_test\` to see if the test passes or fails.
2. If it fails — fix the issues.
3. Polish: improve locators, assertions, readability.
4. Run \`lint\` to catch anti-patterns, fix violations.
5. Run \`run_test\` again to verify your final code passes.
6. Return the final code AFTER verifying it passes.

## Output Rules
- Return ONLY the final improved code. No prose, no explanation, no code fences.
- Preserve the test's original intent — do NOT change what the test verifies.
- Return the EXACT same structure as the input (full test() block or code fragment).
- Preserve the original indentation style.
- Do NOT add imports, describe() wrappers, or test() wrappers that weren't in the input.`;
}

function buildCustomSystemPrompt(userPrompt: string): string {
  return `You are a Playwright test assistant. Follow the user's instructions.

${BEST_PRACTICES}

${TOOLS_DESCRIPTION}

## Instructions
${userPrompt}

## Guidelines
- Use the tools above as needed to accomplish the task.
- If the user asks for information (e.g. "run lint", "show me"), use the appropriate tool and report the results as text.
- If the user asks you to modify code, return ONLY the modified code. No prose, no code fences.
- If no code changes are needed, explain your findings in plain text.
- Be concise and direct.`;
}

function buildGenerateSystemPrompt(description: string): string {
  return `You are a Playwright test generator. Generate a complete Playwright test based on the current page state.

${BEST_PRACTICES}

${TOOLS_DESCRIPTION}

## What to test
${description}

## Workflow
1. Call \`snapshot\` to see the current page state and understand what elements are on the page.
2. Explore the page using \`run_command\` — click around, fill forms, hover elements — to understand the UI flows.
3. Generate a complete Playwright test file covering the described scenarios.
4. Run the test with \`run_test\` to verify it passes.
5. If it fails, fix the code and re-run until it passes.
6. Return the final passing test code.

## Output Rules
- Return a COMPLETE Playwright test file with imports and test blocks.
- Start with \`import { test, expect } from '@playwright/test';\`
- Use descriptive test names that reflect the scenarios.
- Each test should navigate to the starting URL and be self-contained.
- Include proper assertions (toBeVisible, toHaveText, toHaveURL, etc.).
- Return ONLY the final code. No prose, no explanation, no code fences.
- If the file already has tests, add the new test(s) to the existing structure.`;
}

function buildAgentSystemPrompt(userPrompt?: string, generate?: boolean): string {
  if (generate) return buildGenerateSystemPrompt(userPrompt || 'the current page');
  return userPrompt ? buildCustomSystemPrompt(userPrompt) : buildAutoSystemPrompt();
}

// ─── Tool Execution ───────────────────────────────────────────────────────────

type ToolResult = string | { image: Uint8Array; mime: string };

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  browserManager: IBrowserManager | undefined,
  editor: vscodeTypes.TextEditor,
): Promise<ToolResult> {
  switch (name) {
    case 'snapshot': {
      if (!browserManager?.isRunning()) return 'ERROR: Browser not running. snapshot requires a running browser.';
      const result = await browserManager.runCommand('snapshot');
      return result.isError ? `ERROR: ${result.text}` : (result.text || '(empty snapshot)');
    }
    case 'screenshot': {
      if (!browserManager?.isRunning()) return 'ERROR: Browser not running. screenshot requires a running browser.';
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
      if (!browserManager?.isRunning()) return 'ERROR: Browser not running. run_command requires a running browser.';
      const result = await browserManager.runCommand(input.command as string);
      return result.isError ? `ERROR: ${result.text}` : (result.text || 'OK');
    }
    case 'run_script': {
      if (!browserManager?.isRunning()) return 'ERROR: Browser not running. run_script requires a running browser.';
      const result = await browserManager.runScript(input.code as string, 'javascript');
      return result.isError ? `ERROR: ${result.text}` : (result.text || 'OK');
    }
    case 'lint': {
      const code = editor.document.getText();
      const messages = linter.verify(code, lintConfig);
      if (messages.length === 0) return 'No lint violations found.';
      return messages
        .map(m => `Line ${m.line}:${m.column} [${m.ruleId}] ${m.message}`)
        .join('\n');
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
  const match = code.match(/(?:test|it)\s*\(\s*(['"`])(.*?)\1/);
  return match ? match[2] : undefined;
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

const RUN_TEST_TIMEOUT = 60_000;

/** Run a test by name via `npx playwright test --grep`. Works headless or with browser reuse. */
async function runTestFromFile(
  editor: vscodeTypes.TextEditor,
  testName: string,
  browserManager?: IBrowserManager,
): Promise<string> {
  const filePath = editor.document.uri.fsPath;
  // Find the workspace root (where playwright.config lives) by walking up from the file
  const workspaceRoot = findWorkspaceRoot(filePath);
  const escapedName = testName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Build env: reuse browser via CDP if available
  const env: Record<string, string | undefined> = { ...process.env };
  const cdpUrl = browserManager?.isRunning() ? browserManager.cdpUrl : undefined;
  if (cdpUrl) {
    // Inject cdpPreload so Playwright reuses the running browser
    try {
      const preloadPath = require.resolve('@playwright-repl/core/static/cdpPreload.cjs').replace(/\\/g, '/');
      env.NODE_OPTIONS = `${env.NODE_OPTIONS || ''} --require ${preloadPath}`.trim();
    } catch { /* cdpPreload not available — run standalone */ }
    env.PW_TEST_CONNECT_WS_ENDPOINT = cdpUrl;
  }

  // Use relative path from workspace root — Playwright treats file args as regex patterns
  const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
  const args = [
    'playwright', 'test',
    `"${relativePath}"`,
    '--grep', `"${escapedName}"`,
    '--reporter=line',
    '--workers=1',
  ];

  return new Promise<string>(resolve => {
    execFile('npx', args, { cwd: workspaceRoot, env, timeout: RUN_TEST_TIMEOUT, shell: true }, (error, stdout, stderr) => {
      const output = (stdout + '\n' + stderr).trim();
      if (error && error.killed)
        return resolve(`TIMEOUT: Test exceeded ${RUN_TEST_TIMEOUT / 1000}s limit.\n\n${output}`);
      // Playwright test exits with code 1 on failure — that's expected
      if (output.includes('passed') || output.includes('failed'))
        return resolve(output);
      if (error)
        return resolve(`ERROR: ${error.message}\n\n${output}`);
      resolve(output);
    });
  });
}

/** Walk up from a file path to find the directory containing playwright.config. */
function findWorkspaceRoot(filePath: string): string {
  const fs = require('fs') as typeof import('fs');
  let dir = path.dirname(filePath);
  while (dir !== path.dirname(dir)) {
    for (const ext of ['ts', 'js', 'mts', 'mjs']) {
      if (fs.existsSync(path.join(dir, `playwright.config.${ext}`)))
        return dir;
    }
    dir = path.dirname(dir);
  }
  return path.dirname(filePath); // fallback
}

export interface AiAssistOptions {
  generate?: boolean;
}

export async function aiAssist(
  vscode: vscodeTypes.VSCode,
  initialEditor: vscodeTypes.TextEditor,
  browserManager: IBrowserManager | undefined,
  logger?: vscodeTypes.LogOutputChannel,
  userPrompt?: string,
  onEvent?: (event: AgentEvent) => void,
  token?: vscodeTypes.CancellationToken,
  options?: AiAssistOptions,
): Promise<void> {
  let editor = initialEditor;
  const log = (msg: string) => logger?.info(`[AI Assist] ${msg}`);
  // Determine target range: selection > test block under cursor > whole file
  const selection = editor.selection;
  const doc = editor.document;
  const targetRange = (selection && !selection.isEmpty)
    ? new vscode.Range(selection.start, selection.end)
    : detectTestRange(vscode, editor)
      || new vscode.Range(new vscode.Position(0, 0), new vscode.Position(doc.lineCount - 1, doc.lineAt(doc.lineCount - 1).text.length));

  log(`Target range: lines ${targetRange.start.line + 1}-${targetRange.end.line + 1}`);

  const originalText = editor.document.getText(targetRange);
  if (!originalText.trim() && !options?.generate) {
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

  const hasBrowser = !!browserManager;

  // Build initial messages
  const isGenerate = !!options?.generate;
  const messages: any[] = [
    vscode.LanguageModelChatMessage.User(buildAgentSystemPrompt(userPrompt, isGenerate)),
  ];

  if (isGenerate) {
    messages.push(vscode.LanguageModelChatMessage.User(
      (originalText.trim()
        ? `The current file has this content:\n\n${fullFileText}\n\nAdd the new test(s) to this existing file.\n\n`
        : 'The editor is empty. Generate a complete new test file.\n\n')
      + (hasBrowser
        ? 'IMPORTANT: Start by calling the snapshot tool to see the current page state.'
        : 'NOTE: No browser is running. Browser tools (snapshot, screenshot, run_command, run_script) are unavailable. ')
      + 'When using run_test, use the FULL test name including describe() prefixes separated by " > ".',
    ));
  } else {
    messages.push(vscode.LanguageModelChatMessage.User(
      `Here is the full test file for context:\n\n${fullFileText}\n\n`
      + `Here is the specific test code to improve (lines ${targetRange.start.line + 1}-${targetRange.end.line + 1}):\n\n${originalText}\n\n`
      + (hasBrowser
        ? 'IMPORTANT: Start by calling the snapshot tool to see the current page state before making any changes. '
        : 'NOTE: No browser is running. Browser tools (snapshot, screenshot, run_command, run_script) are unavailable. Use run_test and lint to verify changes. ')
      + 'When using run_test, use the FULL test name including describe() prefixes separated by " > ".',
    ));
  }

  // ─── Agent loop ─────────────────────────────────────────────────────────

  let finalCode: string | undefined;
  let lastRunTestName: string | undefined;
  let codeAlreadyApplied = false;

  const emit = onEvent || (() => {});

  /** Ensure the editor is visible before editing (it may have lost focus to the chat panel). */
  async function showEditor() {
    editor = await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
  }

  async function runAgentLoop(loopToken: vscodeTypes.CancellationToken): Promise<string | undefined> {
    const maxIterations = (isGenerate || !userPrompt) ? MAX_ITERATIONS_AUTO : MAX_ITERATIONS_CUSTOM;
    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (loopToken.isCancellationRequested) return undefined;

      emit({ type: 'iteration', current: iteration + 1, max: maxIterations });

      // Force tool use on the first iteration (auto mode and generate mode)
      let tools = AGENT_TOOLS;
      let toolMode: number | undefined;
      if (iteration === 0 && (!userPrompt || isGenerate)) {
        if (hasBrowser) {
          tools = [AGENT_TOOLS[0]]; // force snapshot
          toolMode = 2;
        } else if (!isGenerate) {
          tools = AGENT_TOOLS.filter(t => t.name === 'lint'); // force lint
          toolMode = 2;
        }
      }
      const response = await model.sendRequest(messages, { tools, toolMode }, loopToken);

      // Collect text and tool call parts from the stream
      const textParts: string[] = [];
      const toolCalls: Array<{ callId: string; name: string; input: Record<string, unknown> }> = [];

      for await (const chunk of response.stream) {
        if (chunk instanceof (vscode as any).LanguageModelTextPart) {
          textParts.push(chunk.value);
          emit({ type: 'text', value: chunk.value });
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
          emit({ type: 'verifyStart', testName: verifyName });
          await showEditor();
          await editor.edit(eb => eb.replace(targetRange, candidateCode));
          await editor.document.save();
          const verifyResult = await runTestFromFile(editor, verifyName, browserManager);
          log(`Auto-verify "${verifyName}": ${verifyResult.slice(0, 200)}`);
          const hasPassed = verifyResult.includes('✓') || /\d+ passed/.test(verifyResult);
          const hasFailed = verifyResult.includes('✗') || /[1-9]\d* failed/.test(verifyResult);
          const failed = !hasPassed || hasFailed;
          emit({ type: 'verifyEnd', testName: verifyName, passed: !failed, output: verifyResult });
          if (failed && iteration < maxIterations - 1) {
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
            continue;
          }
          codeAlreadyApplied = true;
        }

        return finalText;
      }

      // Execute tool calls and feed results back
      for (const tc of toolCalls) {
        if (loopToken.isCancellationRequested) return undefined;

        log(`Tool call: ${tc.name}(${JSON.stringify(tc.input)})`);
        emit({ type: 'toolCallStart', name: tc.name, input: tc.input, callId: tc.callId });

        if (tc.name === 'run_test' && tc.input.testName)
          lastRunTestName = tc.input.testName as string;

        let result: ToolResult;
        try {
          result = await executeTool(tc.name, tc.input, browserManager, editor);
        } catch (e: unknown) {
          result = `ERROR: ${(e as Error).message}`;
        }

        const resultSummary = typeof result === 'string' ? result.slice(0, 500) : `[image ${result.mime}]`;
        log(`Tool result: ${resultSummary}`);
        emit({ type: 'toolCallEnd', name: tc.name, callId: tc.callId, result: resultSummary });

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
    const finalResponse = await model.sendRequest(messages, {}, loopToken);
    let text = '';
    for await (const chunk of finalResponse.text) {
      text += chunk;
      emit({ type: 'text', value: chunk });
    }
    return text;
  }

  // ─── Run the loop ──────────────────────────────────────────────────────

  try {
    if (onEvent && token) {
      // Streaming path: events go to the chat panel, use provided token
      finalCode = await runAgentLoop(token);
    } else {
      // Notification path: withProgress for backward compat
      finalCode = await vscode.window.withProgress(
        { location: 15, title: 'AI Assist', cancellable: true },
        (_progress, progressToken) => runAgentLoop(progressToken),
      );
    }
  } catch (e: unknown) {
    const msg = (e as Error).message || '';
    if (msg.includes('Cancelled') || msg.includes('canceled') || msg.includes('no choices')) {
      emit({ type: 'done', summary: 'Cancelled.' });
      return;
    }
    emit({ type: 'error', message: msg });
    return;
  }

  if (!finalCode) return;

  log(`Final code: ${finalCode.length} chars`);

  try {
    // Check if the response looks like code (contains test/function patterns) vs prose
    const looksLikeCode = /(?:test|it|describe|import|export|const |let |var |async |await |function )\s*[\(\{]/.test(finalCode.trim());
    if (!looksLikeCode) {
      log('Response is prose');
      if (!onEvent && logger) {
        logger.appendLine('\n── AI Assist ──────────────────────────────────');
        logger.appendLine(finalCode);
        logger.appendLine('───────────────────────────────────────────────\n');
        logger.show(true);
      }
      emit({ type: 'done', summary: 'Review complete.' });
      return;
    }

    if (codeAlreadyApplied) {
      log('Code already applied and verified by auto-verify');
      emit({ type: 'codeApplied', code: finalCode });
      emit({ type: 'done', summary: 'Code applied and verified.' });
      return;
    }

    // Parse and validate
    const polished = parsePolishResponse(finalCode, originalText);
    log(`Parsed: ${polished.length} chars, Original: ${originalText.length} chars, Same: ${polished.trim() === originalText.trim()}`);

    if (!isGenerate && polished.trim() === originalText.trim()) {
      log('No changes needed');
      emit({ type: 'done', summary: 'Code looks good — no changes needed.' });
      vscode.window.showInformationMessage('Code looks good — no changes needed.');
      return;
    }

    // Replace code (user can Ctrl+Z to revert)
    log('Replacing editor content...');
    await showEditor();
    const success = await editor.edit(editBuilder => {
      editBuilder.replace(targetRange, polished);
    });
    log(`Replace result: ${success}`);
    emit({ type: 'codeApplied', code: polished });
    emit({ type: 'done', summary: 'Code applied.' });
  } catch (e: unknown) {
    log(`Error in final step: ${(e as Error).message}\n${(e as Error).stack}`);
    emit({ type: 'error', message: (e as Error).message });
    vscode.window.showErrorMessage(`AI Assist failed: ${(e as Error).message}`);
  }
}
