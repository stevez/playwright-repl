/**
 * AI provider — thin wrapper around vscode.lm for playwright-repl features.
 *
 * Uses VS Code's built-in Language Model API (available since 1.93+). Works with
 * any model the user has installed (Copilot, Claude, etc.) — no API keys needed.
 */

import type * as vscodeTypes from '../vscodeTypes';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ElementInfo {
  tag?: string;
  text?: string;
  value?: string;
  checked?: boolean;
  attributes?: Record<string, string>;
}

export interface AssertionSuggestion {
  /** Playwright assertion type name, e.g. 'toBeVisible', 'toHaveText'. */
  type: string;
  /** Argument for the assertion, if any. For pair types ('toHaveAttribute'), use "name,value". */
  arg?: string;
  /** Negate the assertion with .not.*/
  negate?: boolean;
  /** Short human-readable rationale shown in the UI. */
  explanation: string;
}

export interface AIProvider {
  isAvailable(): Promise<boolean>;
  suggestAssertions(
    elementInfo: ElementInfo,
    ariaSnapshot: string,
    locator: string,
  ): Promise<AssertionSuggestion[]>;
  polishCode(code: string, pageSnapshot?: string): Promise<string>;
}

export class NoModelsAvailableError extends Error {
  constructor() {
    super('No language model available. Install GitHub Copilot or another LLM extension to use AI features.');
    this.name = 'NoModelsAvailableError';
  }
}

// ─── Valid assertion types ──────────────────────────────────────────────────

const VALID_TYPES = new Set([
  'toBeAttached', 'toBeChecked', 'toBeDisabled', 'toBeEditable', 'toBeEmpty',
  'toBeEnabled', 'toBeFocused', 'toBeHidden', 'toBeInViewport', 'toBeVisible',
  'toContainText', 'toHaveAccessibleDescription', 'toHaveAccessibleName',
  'toHaveAttribute', 'toHaveClass', 'toHaveCount', 'toHaveCSS', 'toHaveId',
  'toHaveJSProperty', 'toHaveRole', 'toHaveText', 'toHaveValue', 'toHaveValues',
  'toHaveTitle', 'toHaveURL',
]);

// ─── Implementation ─────────────────────────────────────────────────────────

export class VSCodeLMProvider implements AIProvider {
  constructor(private _vscode: vscodeTypes.VSCode) {}

  async isAvailable(): Promise<boolean> {
    try {
      const lm = (this._vscode as any).lm;
      if (!lm?.selectChatModels) return false;
      const models = await lm.selectChatModels();
      return models.length > 0;
    } catch {
      return false;
    }
  }

  async suggestAssertions(
    elementInfo: ElementInfo,
    ariaSnapshot: string,
    locator: string,
  ): Promise<AssertionSuggestion[]> {
    const lm = (this._vscode as any).lm;
    if (!lm?.selectChatModels)
      throw new NoModelsAvailableError();

    const models = await lm.selectChatModels();
    if (!models.length) throw new NoModelsAvailableError();
    const model = models[0];

    const messages = [
      this._vscode.LanguageModelChatMessage.User(buildSystemPrompt()),
      this._vscode.LanguageModelChatMessage.User(buildUserPrompt(elementInfo, ariaSnapshot, locator)),
    ];

    const response = await model.sendRequest(messages, {}, new this._vscode.CancellationTokenSource().token);
    let fullText = '';
    for await (const chunk of response.text) fullText += chunk;

    return parseSuggestions(fullText);
  }

  async polishCode(code: string, pageSnapshot?: string): Promise<string> {
    const lm = (this._vscode as any).lm;
    if (!lm?.selectChatModels)
      throw new NoModelsAvailableError();

    const models = await lm.selectChatModels();
    if (!models.length) throw new NoModelsAvailableError();
    const model = models[0];

    const messages = [
      this._vscode.LanguageModelChatMessage.User(buildPolishSystemPrompt()),
      this._vscode.LanguageModelChatMessage.User(buildPolishUserPrompt(code, pageSnapshot)),
    ];

    const response = await model.sendRequest(messages, {}, new this._vscode.CancellationTokenSource().token);
    let fullText = '';
    for await (const chunk of response.text) fullText += chunk;

    return parsePolishResponse(fullText, code);
  }
}

// ─── Assertion prompt construction ─────────────────────────────────────────

export function buildSystemPrompt(): string {
  return `You are a Playwright test expert helping developers write meaningful assertions.
Given information about a picked DOM element and the page's accessibility snapshot, suggest 3-5 high-value Playwright assertions.

Rules:
- Return ONLY a JSON array, no prose, no code fences.
- Each item: { "type": string, "arg"?: string, "negate"?: boolean, "explanation": string }
- "type" must be a valid Playwright expect assertion (e.g. "toBeVisible", "toHaveText", "toBeEnabled", "toHaveValue", "toHaveAttribute", "toHaveCount", "toContainText", "toHaveRole", "toBeFocused", "toBeEditable").
- For "toHaveAttribute", use "arg": "name,value" (comma separated).
- Order by importance — most meaningful assertion first.
- "explanation" is a short (under 60 chars) human rationale.
- Avoid redundant assertions (e.g. toBeVisible + toBeAttached both).
- Prefer specific assertions (toHaveText "Submit") over generic ones (toBeVisible) when semantically appropriate.
- For form inputs with values, prioritize toHaveValue.
- For buttons, prioritize toBeEnabled and toHaveText.
- For links, prioritize toHaveAttribute "href" and toHaveText.`;
}

export function buildUserPrompt(
  elementInfo: ElementInfo,
  ariaSnapshot: string,
  locator: string,
): string {
  const parts: string[] = [`Locator: ${locator}`];
  if (elementInfo.tag) parts.push(`Tag: ${elementInfo.tag}`);
  if (elementInfo.text) parts.push(`Text: ${JSON.stringify(elementInfo.text.slice(0, 200))}`);
  if (elementInfo.value !== undefined) parts.push(`Value: ${JSON.stringify(elementInfo.value)}`);
  if (elementInfo.checked !== undefined) parts.push(`Checked: ${elementInfo.checked}`);
  if (elementInfo.attributes && Object.keys(elementInfo.attributes).length > 0) {
    const attrs = Object.entries(elementInfo.attributes)
      .slice(0, 15)
      .map(([k, v]) => `${k}="${v.slice(0, 100)}"`)
      .join(' ');
    parts.push(`Attributes: ${attrs}`);
  }
  if (ariaSnapshot) parts.push(`ARIA snapshot:\n${ariaSnapshot.slice(0, 2000)}`);

  parts.push('', 'Return a JSON array of 3-5 ranked Playwright assertion suggestions.');
  return parts.join('\n');
}

// ─── Response parsing ───────────────────────────────────────────────────────

export function parseSuggestions(responseText: string): AssertionSuggestion[] {
  // Try to extract JSON array from the response (strip code fences, prose)
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const result: AssertionSuggestion[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    const type = typeof obj.type === 'string' ? obj.type : null;
    if (!type || !VALID_TYPES.has(type)) continue;

    const suggestion: AssertionSuggestion = {
      type,
      explanation: typeof obj.explanation === 'string' ? obj.explanation : '',
    };
    if (typeof obj.arg === 'string') suggestion.arg = obj.arg;
    if (obj.negate === true) suggestion.negate = true;
    result.push(suggestion);
  }
  return result.slice(0, 5); // Cap at 5 suggestions
}

// ─── Polish prompt construction ────────────────────────────────────────────

export function buildPolishSystemPrompt(): string {
  return `You are a Playwright test expert. Given test body code, improve it while preserving its intent.

CRITICAL RULES:
- Return ONLY the improved code. No prose, no explanation, no code fences.
- PRESERVE the test's intent — do NOT change what the test verifies or add unrelated actions.
- Return EXACTLY the same structure as the input — if the input is a full test() block, return a full test() block. If the input is just a code fragment, return just the improved fragment.
- Do NOT add imports, describe() wrappers, or test() wrappers that weren't in the input.
- If the code is already clean and idiomatic, return it EXACTLY unchanged.
- Preserve the EXACT original indentation — every line must have the same leading whitespace as the input.

Improvements (apply only when beneficial):
1. LOCATORS: Replace fragile CSS selectors with semantic locators.
   Prefer: getByRole() > getByText() > getByTestId() > getByLabel() > CSS.
2. ASSERTIONS: Add assertions only when clearly missing after state-changing actions.
3. REDUNDANCY: Remove duplicate or unnecessary steps.
4. COMMENTS: Add brief comments only for complex multi-step flows (3+ actions).

Do NOT:
- Rewrite simple tests that are already correct.
- Add navigation steps the original code doesn't have.
- Change assertion targets or values.
- Add comments to single-line test bodies.`;
}

export function buildPolishUserPrompt(code: string, pageSnapshot?: string): string {
  const parts: string[] = [];
  parts.push('Code to polish:', code);
  if (pageSnapshot) {
    parts.push('', 'Current page state (may not reflect the code being polished — use as optional context only):');
    parts.push(pageSnapshot.slice(0, 3000));
  }
  return parts.join('\n');
}

// ─── Polish response parsing ───────────────────────────────────────────────

export function parsePolishResponse(responseText: string, originalCode: string): string {
  let code = responseText.trim();
  // Strip code fences if the model wrapped the response
  const fenceMatch = code.match(/^```(?:typescript|ts|javascript|js)?\s*\n([\s\S]*?)\n```$/);
  if (fenceMatch) code = fenceMatch[1].trim();
  // If response is empty or looks like prose, return original
  if (!code || /^(Here|I |The |This |Sure|Let me)/i.test(code))
    return originalCode;
  return code;
}
