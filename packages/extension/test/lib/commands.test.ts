import { describe, it, expect, beforeAll } from "vitest";
import type { ParseResult } from '../../src/panel/lib/commands';

let parseReplCommand: (input: string) => ParseResult;

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

  it("routes css subcommand to highlightBySelector", () => {
    const { jsExpr } = direct("highlight css .btn-primary");
    expect(jsExpr).toContain('highlightBySelector');
    expect(jsExpr).toContain('".btn-primary"');
  });

  it("routes --clear to clearHighlight", () => {
    const { jsExpr } = direct("highlight --clear");
    expect(jsExpr).toContain('clearHighlight');
  });

  it("routes css with :has-text() pseudo-class", () => {
    const { jsExpr } = direct('highlight css div:has-text("RFCP")');
    expect(jsExpr).toContain('highlightBySelector');
    expect(jsExpr).toContain('has-text(\\"RFCP\\")');
  });

  it("routes text with dot as text, not CSS", () => {
    const { jsExpr } = direct('highlight "Node.js"');
    expect(jsExpr).toContain('highlightByText');
    expect(jsExpr).toContain('"Node.js"');
  });

  it("routes bare role with --in to highlightByRole", () => {
    const { jsExpr } = direct('highlight img --in "Built on Playwright"');
    expect(jsExpr).toContain('highlightByRole');
    expect(jsExpr).toContain('"img"');
    expect(jsExpr).toContain('""');
  });

  it("routes bare role with --nth to highlightByRole", () => {
    const { jsExpr } = direct('highlight img --nth 2');
    expect(jsExpr).toContain('highlightByRole');
    expect(jsExpr).toContain('"img"');
    expect(jsExpr).toContain('2');
  });
});

// ─── css subcommand ──────────────────────────────────────────────────────────

describe("css subcommand", () => {
  it("routes click css to locator", () => {
    const { jsExpr } = direct("click css .btn-primary");
    expect(jsExpr).toContain('chainAction');
    expect(jsExpr).toContain('".btn-primary"');
    expect(jsExpr).toContain('"click"');
  });

  it("routes hover css to locator", () => {
    const { jsExpr } = direct("hover css div.menu-item");
    expect(jsExpr).toContain('chainAction');
    expect(jsExpr).toContain('"div.menu-item"');
    expect(jsExpr).toContain('"hover"');
  });

  it("routes fill css with value", () => {
    const { jsExpr } = direct('fill css .input "hello"');
    expect(jsExpr).toContain('chainAction');
    expect(jsExpr).toContain('".input"');
    expect(jsExpr).toContain('"fill"');
    expect(jsExpr).toContain('"hello"');
  });

  it("routes check css to locator", () => {
    const { jsExpr } = direct('check css input[type="checkbox"]');
    expect(jsExpr).toContain('chainAction');
    expect(jsExpr).toContain('"check"');
  });
});

// ─── bare role with --in ─────────────────────────────────────────────────────

describe("bare role with --in", () => {
  it("routes click img --in to actionByRole with empty name", () => {
    const { jsExpr } = direct('click img --in "Section Title"');
    expect(jsExpr).toContain('actionByRole');
    expect(jsExpr).toContain('"img"');
    expect(jsExpr).toContain('""');
    expect(jsExpr).toContain('"click"');
  });

  it("routes hover navigation --in to actionByRole", () => {
    const { jsExpr } = direct('hover navigation --in "Header"');
    expect(jsExpr).toContain('actionByRole');
    expect(jsExpr).toContain('"navigation"');
    expect(jsExpr).toContain('"hover"');
  });

  it("routes click img --nth to actionByRole", () => {
    const { jsExpr } = direct('click img --nth 3');
    expect(jsExpr).toContain('actionByRole');
    expect(jsExpr).toContain('"img"');
    expect(jsExpr).toContain('"click"');
  });
});

// ─── --frame flag ───────────────────────────────────────────────────────────

describe("--frame flag", () => {
  it("wraps click with frame context", () => {
    const { jsExpr } = direct('click "Bis 45 km/h" --frame "#oevd-iframe"');
    expect(jsExpr).toContain('page.locator("#oevd-iframe").contentFrame()');
    expect(jsExpr).toContain('"Bis 45 km/h"');
  });

  it("wraps highlight with frame context", () => {
    const { jsExpr } = direct('highlight "Submit" --frame "#myframe"');
    expect(jsExpr).toContain('page.locator("#myframe").contentFrame()');
    expect(jsExpr).toContain('highlightByText');
  });

  it("wraps check with frame context", () => {
    const { jsExpr } = direct('check radio "Accept" --frame "#oevd-iframe"');
    expect(jsExpr).toContain('page.locator("#oevd-iframe").contentFrame()');
    expect(jsExpr).toContain('"Accept"');
  });

  it("wraps fill with frame context", () => {
    const { jsExpr } = direct('fill "Email" "test@example.com" --frame "#form-frame"');
    expect(jsExpr).toContain('page.locator("#form-frame").contentFrame()');
    expect(jsExpr).toContain('"Email"');
    expect(jsExpr).toContain('"test@example.com"');
  });

  it("does not wrap when --frame is absent", () => {
    const { jsExpr } = direct('click "Submit"');
    expect(jsExpr).not.toContain('contentFrame');
  });
});

// ─── --in text-only ─────────────────────────────────────────────────────────

describe("--in text-only", () => {
  it("passes inText to actionByRole for role-based click", () => {
    const { jsExpr } = direct('click radio "Nein" --in "Rechnungsadresse abweichend?"');
    expect(jsExpr).toContain('actionByRole');
    expect(jsExpr).toContain('"Nein"');
    expect(jsExpr).toContain('"Rechnungsadresse abweichend?"');
  });

  it("passes inText to highlightByRole", () => {
    const { jsExpr } = direct('highlight radio "Nein" --in "Rechnungsadresse abweichend?"');
    expect(jsExpr).toContain('highlightByRole');
    expect(jsExpr).toContain('"Nein"');
    expect(jsExpr).toContain('"Rechnungsadresse abweichend?"');
  });

  it("still parses role+text --in correctly", () => {
    const { jsExpr } = direct('click button "Submit" --in dialog "Settings"');
    expect(jsExpr).toContain('actionByRole');
    expect(jsExpr).toContain('"dialog"');
    expect(jsExpr).toContain('"Settings"');
  });

  it("scopes text-based click with --in via callScoped", () => {
    const { jsExpr } = direct('click "Bis 45 km/h" --in "Moped, Roller"');
    expect(jsExpr).toContain('actionByText');
    expect(jsExpr).toContain('"Moped, Roller"');
    expect(jsExpr).toContain('"Bis 45 km/h"');
    expect(jsExpr).toContain('getByRole');
    expect(jsExpr).toContain('data-pw-in');
  });

  it("scopes text-based check with --in via callScoped", () => {
    const { jsExpr } = direct('check "Newsletter" --in "Preferences"');
    expect(jsExpr).toContain('checkByText');
    expect(jsExpr).toContain('"Preferences"');
    expect(jsExpr).toContain('data-pw-in');
  });

  it("scopes text-based fill with --in via callScoped", () => {
    const { jsExpr } = direct('fill "Email" user@example.com --in "Contact"');
    expect(jsExpr).toContain('fillByText');
    expect(jsExpr).toContain('"Contact"');
    expect(jsExpr).toContain('"Email"');
    expect(jsExpr).toContain('data-pw-in');
  });

  it("does not scope text-based click without --in", () => {
    const { jsExpr } = direct('click "Submit"');
    expect(jsExpr).toContain('actionByText');
    expect(jsExpr).not.toContain('data-pw-in');
  });

  it("DOM fallback tries exact first for --in text (preserves existing behavior)", () => {
    const { jsExpr } = direct('click "Nein" --in "Rechnungsadresse abweichend?"');
    // Exact match should be tried first — this is the common case
    expect(jsExpr).toContain('getByText("Rechnungsadresse abweichend?", { exact: true })');
  });

  it("DOM fallback falls back to substring when exact finds nothing (#734)", () => {
    const { jsExpr } = direct('click "Bis 45 km/h" --in "Moped, Roller"');
    // Should try exact first, then fall back to substring
    // so "Moped, Roller" still matches "Moped, Roller, Mokick..."
    expect(jsExpr).toContain('getByText("Moped, Roller", { exact: true })');
    expect(jsExpr).toContain('getByText("Moped, Roller")');
    // Both paths should exist — exact and substring fallback
    const exactCount = (jsExpr.match(/getByText\("Moped, Roller",\s*\{ exact: true \}\)/g) || []).length;
    const substringCount = (jsExpr.match(/getByText\("Moped, Roller"\)/g) || []).length;
    expect(exactCount).toBeGreaterThanOrEqual(1);
    expect(substringCount).toBeGreaterThanOrEqual(1);
  });
});

describe("press", () => {
  it("routes role+name+key to pressKeyByRole", () => {
    const { jsExpr } = direct('press textbox "What needs to be done?" Enter');
    expect(jsExpr).toContain('pressKeyByRole');
    expect(jsExpr).toContain('"textbox"');
    expect(jsExpr).toContain('"What needs to be done?"');
    expect(jsExpr).toContain('"Enter"');
  });

  it("routes global key to pressKey", () => {
    const { jsExpr } = direct("press Enter");
    expect(jsExpr).toContain('pressKey');
    expect(jsExpr).toContain('"Enter"');
  });

  it("routes text+key to pressKey", () => {
    const { jsExpr } = direct('press "Email" Tab');
    expect(jsExpr).toContain('pressKey');
    expect(jsExpr).toContain('"Email"');
    expect(jsExpr).toContain('"Tab"');
  });
});
