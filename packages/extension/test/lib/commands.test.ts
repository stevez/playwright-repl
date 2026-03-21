import { describe, it, expect, beforeAll } from "vitest";

let parseReplCommand: (input: string) => any;

beforeAll(async () => {
  const mod = await import("../../src/panel/lib/commands");
  parseReplCommand = mod.parseReplCommand;
});

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Assert result has jsExpr and return it. */
function direct(input: string) {
  const result = parseReplCommand(input);
  expect(result).toHaveProperty("jsExpr");
  return result as { jsExpr: string };
}

function isError(input: string) {
  const result = parseReplCommand(input);
  expect(result).toHaveProperty("error");
  return result as { error: string };
}

// ─── verify-visible ───────────────────────────────────────────────────────────

describe("verify-visible", () => {
  it("resolves to verifyVisible with role and name", () => {
    const { jsExpr } = direct('verify-visible button "Submit"');
    expect(jsExpr).toContain('verifyVisible');
    expect(jsExpr).toContain('"button"');
    expect(jsExpr).toContain('"Submit"');
  });

  it("resolves multi-word name", () => {
    const { jsExpr } = direct('verify-visible heading "Getting Started"');
    expect(jsExpr).toContain('verifyVisible');
    expect(jsExpr).toContain('"heading"');
    expect(jsExpr).toContain('"Getting Started"');
  });

  it("returns error when missing name arg", () => {
    isError("verify-visible button");
  });

  it("returns error when empty", () => {
    isError("verify-visible");
  });
});

// ─── verify-value (label-based) ───────────────────────────────────────────────

describe("verify-value — label-based", () => {
  it("resolves to verifyInputValue for plain label", () => {
    const { jsExpr } = direct('verify-value "Email" "user@example.com"');
    expect(jsExpr).toContain('verifyInputValue');
    expect(jsExpr).toContain('"Email"');
    expect(jsExpr).toContain('"user@example.com"');
  });

  it("resolves to verifyInputValue for checkbox checked", () => {
    const { jsExpr } = direct('verify-value "Accept terms" "checked"');
    expect(jsExpr).toContain('verifyInputValue');
    expect(jsExpr).toContain('"Accept terms"');
    expect(jsExpr).toContain('"checked"');
  });

  it("resolves to verifyInputValue for checkbox unchecked", () => {
    const { jsExpr } = direct('verify-value "Newsletter" "unchecked"');
    expect(jsExpr).toContain('verifyInputValue');
    expect(jsExpr).toContain('"Newsletter"');
    expect(jsExpr).toContain('"unchecked"');
  });

  it("resolves to verifyInputValue for radio group", () => {
    const { jsExpr } = direct('verify-value "Gender" "Female"');
    expect(jsExpr).toContain('verifyInputValue');
    expect(jsExpr).toContain('"Gender"');
    expect(jsExpr).toContain('"Female"');
  });
});

// ─── verify-value (ref-based) ─────────────────────────────────────────────────

describe("verify-value — ref-based", () => {
  it("resolves to verifyValue when first arg is a ref", () => {
    const { jsExpr } = direct('verify-value e5 "hello"');
    expect(jsExpr).not.toContain('verifyInputValue');
    expect(jsExpr).toContain('verifyValue');
    expect(jsExpr).toContain('"e5"');
    expect(jsExpr).toContain('"hello"');
  });

  it("resolves to verifyValue for ref e12", () => {
    const { jsExpr } = direct('verify-value e12 "world"');
    expect(jsExpr).not.toContain('verifyInputValue');
    expect(jsExpr).toContain('verifyValue');
    expect(jsExpr).toContain('"e12"');
    expect(jsExpr).toContain('"world"');
  });
});

// ─── verify-visible vs verify-element distinction ─────────────────────────────

describe("verify-visible vs verify-element", () => {
  it("verify-element resolves to verifyElement (count-based)", () => {
    const { jsExpr } = direct('verify-element button "Submit"');
    expect(jsExpr).toContain('verifyElement');
    expect(jsExpr).not.toContain('verifyVisible');
  });

  it("verify-visible resolves to verifyVisible (isVisible-based)", () => {
    const { jsExpr } = direct('verify-visible button "Submit"');
    expect(jsExpr).toContain('verifyVisible');
    expect(jsExpr).not.toContain('verifyElement');
  });
});

// ─── existing verify commands unaffected ──────────────────────────────────────

describe("existing verify commands", () => {
  it("verify-text resolves to verifyText", () => {
    const { jsExpr } = direct('verify-text "Hello"');
    expect(jsExpr).toContain('verifyText');
    expect(jsExpr).toContain('"Hello"');
  });

  it("verify-no-text resolves to verifyNoText", () => {
    const { jsExpr } = direct('verify-no-text "Gone"');
    expect(jsExpr).toContain('verifyNoText');
    expect(jsExpr).toContain('"Gone"');
  });

  it("verify text (unified) resolves to verifyText", () => {
    const { jsExpr } = direct('verify text "Welcome"');
    expect(jsExpr).toContain('verifyText');
    expect(jsExpr).toContain('"Welcome"');
  });

  it("verify-url resolves to verifyUrl", () => {
    const { jsExpr } = direct('verify-url "dashboard"');
    expect(jsExpr).toContain('verifyUrl');
    expect(jsExpr).toContain('"dashboard"');
  });
});

// ─── highlight ───────────────────────────────────────────────────────────────

describe("highlight", () => {
  it("routes ref to highlightByRef", () => {
    const { jsExpr } = direct("highlight e8");
    expect(jsExpr).toContain('highlightByRef');
    expect(jsExpr).toContain('"e8"');
  });

  it("routes ref e1 to highlightByRef", () => {
    const { jsExpr } = direct("highlight e1");
    expect(jsExpr).toContain('highlightByRef');
    expect(jsExpr).toContain('"e1"');
  });

  it("routes role+name to highlightByRole", () => {
    const { jsExpr } = direct('highlight textbox "Email"');
    expect(jsExpr).toContain('highlightByRole');
    expect(jsExpr).toContain('"textbox"');
    expect(jsExpr).toContain('"Email"');
  });

  it("routes text to highlightByText", () => {
    const { jsExpr } = direct('highlight "Submit"');
    expect(jsExpr).toContain('highlightByText');
    expect(jsExpr).toContain('"Submit"');
  });

  it("routes CSS selector to highlightBySelector", () => {
    const { jsExpr } = direct("highlight .btn-primary");
    expect(jsExpr).toContain('highlightBySelector');
    expect(jsExpr).toContain('".btn-primary"');
  });

  it("routes --clear to clearHighlight", () => {
    const { jsExpr } = direct("highlight --clear");
    expect(jsExpr).toContain('clearHighlight');
  });
});
