/**
 * pw-completion-source.ts
 *
 * CodeMirror 6 completion extension for Playwright API (JavaScript mode).
 *
 * Provides:
 *   - Member completions after a dot (page.goto, locator.click, etc.)
 *   - Assertion completions after expect(x). (toBeVisible, toHaveText, etc.)
 *   - Top-level variable completions (page, context, expect, etc.)
 */

import type {
  CompletionContext,
  CompletionResult,
  Completion,
} from "@codemirror/autocomplete";
// ── Apply helper ──────────────────────────────────────────────────────────────
//
// Inserts "()" after method completions and places cursor between the parens.

function applyMethod(view: any, completion: Completion, from: number, to: number) {
  const insert = completion.label + "()";
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + completion.label.length + 1 },
  });
}

import PW_COMPLETIONS from "./pw-completions.json";

// ── Types ─────────────────────────────────────────────────────────────────────

type InterfaceName = keyof typeof PW_COMPLETIONS;

interface RawCompletion {
  label: string;
  type: string;
  detail?: string;
  info?: string;
}

// ── Variable → Interface map ──────────────────────────────────────────────────
//
// Maps common variable names to their Playwright interface.
// Extend this with names used in your own REPL context.

const VAR_TO_INTERFACE: Record<string, InterfaceName> = {
  // Page
  page: "Page",

  // Locator
  locator: "Locator",
  el: "Locator",
  element: "Locator",
  btn: "Locator",
  input: "Locator",
  link: "Locator",

  // BrowserContext
  context: "BrowserContext",
  ctx: "BrowserContext",

  // Browser
  browser: "Browser",

  // Frame
  frame: "Frame",
  mainFrame: "Frame",

  // ElementHandle
  handle: "ElementHandle",
  elementHandle: "ElementHandle",

  // Misc
  keyboard: "Keyboard",
  mouse: "Mouse",
  touchscreen: "Touchscreen",
  request: "Request",
  response: "Response",
  route: "Route",
  download: "Download",
  dialog: "Dialog",
  fileChooser: "FileChooser",
};

// ── Method return type map ────────────────────────────────────────────────────
//
// Maps method names to the interface they return, enabling chained completions.
// e.g. page.getByRole("button"). → Locator methods

const METHOD_RETURN_TYPE: Record<string, InterfaceName> = {
  // → Locator
  getByRole: "Locator", getByText: "Locator", getByLabel: "Locator",
  getByPlaceholder: "Locator", getByAltText: "Locator", getByTitle: "Locator",
  getByTestId: "Locator", locator: "Locator",
  first: "Locator", last: "Locator", nth: "Locator",
  filter: "Locator", and: "Locator", or: "Locator",
  // → Frame
  frame: "Frame", mainFrame: "Frame",
  contentFrame: "Frame", parentFrame: "Frame",
  // → Keyboard / Mouse / Touchscreen (page.keyboard. etc.)
  keyboard: "Keyboard", mouse: "Mouse", touchscreen: "Touchscreen",
  // → Request / Response
  request: "Request", response: "Response",
};

// ── Locator-returning methods (for expect() type resolution) ─────────────────

const LOCATOR_RETURNING = new Set([
  "getByText", "getByRole", "getByLabel", "getByPlaceholder",
  "getByAltText", "getByTitle", "getByTestId",
  "locator", "nth", "first", "last", "filter", "and", "or",
]);

// ── Assertion matchers ────────────────────────────────────────────────────────

interface AssertionEntry {
  label: string;
  detail: string;
  info: string;
}

const LOCATOR_ASSERTIONS: AssertionEntry[] = [
  { label: "toBeAttached",     detail: "(options?) => Promise<void>",               info: "Ensures element is attached to the DOM." },
  { label: "toBeChecked",      detail: "(options?) => Promise<void>",               info: "Ensures checkbox or radio is checked." },
  { label: "toBeDisabled",     detail: "(options?) => Promise<void>",               info: "Ensures element is disabled." },
  { label: "toBeEditable",     detail: "(options?) => Promise<void>",               info: "Ensures element is editable." },
  { label: "toBeEmpty",        detail: "(options?) => Promise<void>",               info: "Ensures element has no text or is an empty input." },
  { label: "toBeEnabled",      detail: "(options?) => Promise<void>",               info: "Ensures element is enabled." },
  { label: "toBeFocused",      detail: "(options?) => Promise<void>",               info: "Ensures element is focused." },
  { label: "toBeHidden",       detail: "(options?) => Promise<void>",               info: "Ensures element is not visible." },
  { label: "toBeInViewport",   detail: "(options?) => Promise<void>",               info: "Ensures element intersects the viewport." },
  { label: "toBeVisible",      detail: "(options?) => Promise<void>",               info: "Ensures element is visible." },
  { label: "toContainText",    detail: "(text, options?) => Promise<void>",         info: "Ensures element contains the given text." },
  { label: "toHaveAccessibleDescription", detail: "(description, options?) => Promise<void>", info: "Ensures element has the given accessible description." },
  { label: "toHaveAccessibleName",        detail: "(name, options?) => Promise<void>",         info: "Ensures element has the given accessible name." },
  { label: "toHaveAttribute",  detail: "(name, value, options?) => Promise<void>",  info: "Ensures element has the given attribute and value." },
  { label: "toHaveClass",      detail: "(expected, options?) => Promise<void>",     info: "Ensures element has the given CSS class(es)." },
  { label: "toHaveCount",      detail: "(count, options?) => Promise<void>",        info: "Ensures locator resolves to exactly N elements." },
  { label: "toHaveCSS",        detail: "(name, value, options?) => Promise<void>",  info: "Ensures element has the given CSS property value." },
  { label: "toHaveId",         detail: "(id, options?) => Promise<void>",           info: "Ensures element has the given id attribute." },
  { label: "toHaveJSProperty", detail: "(name, value, options?) => Promise<void>",  info: "Ensures element has the given JS property value." },
  { label: "toHaveRole",       detail: "(role, options?) => Promise<void>",         info: "Ensures element has the given ARIA role." },
  { label: "toHaveScreenshot", detail: "(name?, options?) => Promise<void>",        info: "Ensures element matches a screenshot." },
  { label: "toHaveText",       detail: "(text, options?) => Promise<void>",         info: "Ensures element has the given text content." },
  { label: "toHaveValue",      detail: "(value, options?) => Promise<void>",        info: "Ensures input element has the given value." },
  { label: "toHaveValues",     detail: "(values, options?) => Promise<void>",       info: "Ensures multi-select has the given selected values." },
];

const PAGE_ASSERTIONS: AssertionEntry[] = [
  { label: "toHaveScreenshot", detail: "(name?, options?) => Promise<void>",  info: "Ensures page matches a screenshot." },
  { label: "toHaveTitle",      detail: "(title, options?) => Promise<void>",  info: "Ensures page has the given title." },
  { label: "toHaveURL",        detail: "(url, options?) => Promise<void>",    info: "Ensures page has the given URL." },
];

const GENERIC_ASSERTIONS: AssertionEntry[] = [
  { label: "toBe",               detail: "(expected) => void",          info: "Strict equality check (Object.is)." },
  { label: "toBeCloseTo",        detail: "(number, digits?) => void",   info: "Checks floating-point number proximity." },
  { label: "toBeDefined",        detail: "() => void",                  info: "Ensures value is not undefined." },
  { label: "toBeFalsy",          detail: "() => void",                  info: "Ensures value is falsy." },
  { label: "toBeGreaterThan",    detail: "(number) => void",            info: "Ensures value > number." },
  { label: "toBeGreaterThanOrEqual", detail: "(number) => void",        info: "Ensures value >= number." },
  { label: "toBeInstanceOf",     detail: "(Class) => void",             info: "Ensures value is instance of class." },
  { label: "toBeLessThan",       detail: "(number) => void",            info: "Ensures value < number." },
  { label: "toBeLessThanOrEqual",detail: "(number) => void",            info: "Ensures value <= number." },
  { label: "toBeNull",           detail: "() => void",                  info: "Ensures value is null." },
  { label: "toBeTruthy",         detail: "() => void",                  info: "Ensures value is truthy." },
  { label: "toBeUndefined",      detail: "() => void",                  info: "Ensures value is undefined." },
  { label: "toContain",          detail: "(item) => void",              info: "Checks array contains item, or string contains substring." },
  { label: "toEqual",            detail: "(expected) => void",          info: "Deep equality check." },
  { label: "toHaveLength",       detail: "(number) => void",            info: "Checks .length property." },
  { label: "toHaveProperty",     detail: "(path, value?) => void",      info: "Checks object has property at path." },
  { label: "toMatch",            detail: "(regexp|string) => void",     info: "Checks string matches regexp or substring." },
  { label: "toMatchObject",      detail: "(object) => void",            info: "Checks object contains expected properties." },
  { label: "toStrictEqual",      detail: "(expected) => void",          info: "Strict deep equality including object types." },
  { label: "toThrow",            detail: "(error?) => void",            info: "Checks function throws an error." },
];

function toAssertionCompletions(entries: AssertionEntry[]): Completion[] {
  return entries.map((item) => ({
    label: item.label,
    type: "method",
    detail: item.detail,
    boost: 5,
    apply: applyMethod,
  }));
}

// Cache assertion completion arrays
const LOCATOR_ASSERTION_COMPLETIONS = toAssertionCompletions(LOCATOR_ASSERTIONS);
const PAGE_ASSERTION_COMPLETIONS    = toAssertionCompletions(PAGE_ASSERTIONS);
const GENERIC_ASSERTION_COMPLETIONS = toAssertionCompletions(GENERIC_ASSERTIONS);

// ── Top-level snippets ────────────────────────────────────────────────────────
//
// Offered when user types at the top level (no dot), e.g. typing "pa" offers "page".

const TOP_LEVEL_COMPLETIONS: Completion[] = [
  // REPL essentials (boosted above built-in JS completions)
  { label: "async",  type: "keyword",  boost: 5 },
  { label: "await",  type: "keyword",  boost: 7 },
  { label: "expect", type: "function", detail: "(value) => Assertions", boost: 6 },
  // REPL globals (only suggest the actual predefined variables, not aliases)
  { label: "page",    type: "variable", detail: "Page",           boost: 4 },
  { label: "context", type: "variable", detail: "BrowserContext", boost: 3 },
  { label: "browser", type: "variable", detail: "Browser",       boost: 3 },
];

// ── Completion cache ──────────────────────────────────────────────────────────

const completionCache = new Map<InterfaceName, Completion[]>();

function toCompletions(interfaceName: InterfaceName): Completion[] {
  if (completionCache.has(interfaceName)) {
    return completionCache.get(interfaceName)!;
  }

  const raw: RawCompletion[] = (PW_COMPLETIONS as any)[interfaceName] ?? [];

  const completions: Completion[] = raw.map((item) => ({
    label: item.label,
    type: item.type,
    detail: item.detail,
    boost: 5,
    ...(item.type === "method" ? { apply: applyMethod } : {}),
  }));

  completionCache.set(interfaceName, completions);
  return completions;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Walk backwards from the cursor through a chain like:
 *   page.locator('#id').
 * and return the outermost variable name ("page").
 *
 * This is a simple heuristic — good enough for a REPL where chains
 * typically start from a known root variable.
 */
function resolveChainRoot(textBefore: string): string | null {
  // Strip the trailing dot and anything after the last complete identifier
  // e.g. "await page.locator('#id')." → "page.locator('#id')"
  const stripped = textBefore.replace(/\.\w*$/, "").trim();

  // Walk back through chained calls: foo.bar().baz() → foo
  // Find the leftmost word token before any dot, skipping JS keywords
  const noKeywords = stripped.replace(/\b(await|async|const|let|var|return|new)\s+/g, '');
  const match = noKeywords.match(/(?:^|[\s=({[,!&|?:+\-*/%])(\w+)/);
  return match ? match[1] : null;
}

// ── Main completion source ────────────────────────────────────────────────────

export function playwrightCompletions(
  context: CompletionContext
): CompletionResult | null {

  // ── Case 1: expect(x). assertion completions ──────────────────────────────
  // Matches:  expect(page).      expect(locator).toBeV
  //           expect(page).not.  (soft/not chaining)
  //           expect(page.getByText("x")).
  const expectMatch = context.matchBefore(/expect\s*\(.*\)(?:\.not)?\.[\w$]*/);

  if (expectMatch) {
    const afterDot = expectMatch.text.split(".").pop() ?? "";
    const inner = expectMatch.text.match(/expect\s*\((.*)\)/)?.[1] ?? "";

    // Check if inner ends with a locator-returning method call
    const lastMethod = inner.match(/\.(\w+)\s*\([^)]*\)\s*$/)?.[1];
    const iface = VAR_TO_INTERFACE[inner.trim()];

    const options =
      lastMethod && LOCATOR_RETURNING.has(lastMethod) ? LOCATOR_ASSERTION_COMPLETIONS :
      iface === "Page"    ? PAGE_ASSERTION_COMPLETIONS :
      iface === "Locator" ? LOCATOR_ASSERTION_COMPLETIONS :
                            GENERIC_ASSERTION_COMPLETIONS;

    return {
      from: expectMatch.to - afterDot.length,
      options,
      validFor: /^\w*$/,
    };
  }

  // ── Case 2: member completion after a dot ──────────────────────────────────
  // Matches:  page.     page.go     page.locator('#x').
  // Multiline: also match .method() at start of line (after Shift+Enter) (#799)
  const dotMatch = context.matchBefore(/[\w$)'"]+\.[\w$]*/)
      || context.matchBefore(/\.[\w$]*/);

  if (dotMatch) {
    // Figure out what's typed after the dot (the partial member name)
    const afterDot = dotMatch.text.split(".").pop() ?? "";
    const textBefore = context.state.doc.sliceString(0, dotMatch.to - afterDot.length);

    // Check the last method call before the dot for return type resolution
    // e.g. "page.getByLabel('submit')." → lastMethod = "getByLabel"
    const lastMethodMatch = textBefore.match(/\.(\w+)\s*\([^)]*\)\s*\.$/);
    // Also handle property access: "page.keyboard." → lastProp = "keyboard"
    const lastPropMatch = lastMethodMatch ? null : textBefore.match(/\.(\w+)\s*\.$/);
    const lastMethod = lastMethodMatch?.[1] ?? lastPropMatch?.[1];

    let interfaceName: InterfaceName | null = null;

    // Chain return type: getByLabel() → Locator, keyboard → Keyboard
    if (lastMethod && lastMethod in METHOD_RETURN_TYPE) {
      interfaceName = METHOD_RETURN_TYPE[lastMethod];
    } else {
      // Direct variable lookup: "page." → Page
      const firstSegment = dotMatch.text.split(".")[0];
      const rootVar = firstSegment in VAR_TO_INTERFACE
        ? firstSegment
        : resolveChainRoot(context.state.doc.sliceString(0, dotMatch.from) + firstSegment);

      if (rootVar && rootVar in VAR_TO_INTERFACE) {
        interfaceName = VAR_TO_INTERFACE[rootVar];
      }
    }

    if (interfaceName) {
      return {
        from: dotMatch.to - afterDot.length,
        options: toCompletions(interfaceName),
        validFor: /^\w*$/,
      };
    }
  }

  // ── Case 3: top-level variable names ──────────────────────────────────────
  // Only trigger when the user has typed at least 2 chars to avoid noise
  const wordMatch = context.matchBefore(/\w{2,}/);

  if (wordMatch && !context.explicit) {
    return {
      from: wordMatch.from,
      options: TOP_LEVEL_COMPLETIONS,
      validFor: /^\w*$/,
    };
  }

  // Explicit invoke (Ctrl+Space) at top level with 0–1 chars
  if (context.explicit) {
    const word = context.matchBefore(/\w*/);
    return {
      from: word ? word.from : context.pos,
      options: TOP_LEVEL_COMPLETIONS,
      validFor: /^\w*$/,
    };
  }

  return null;
}
