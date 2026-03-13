import { describe, it, expect } from "vitest";
import { jsonlToRepl } from "@/lib/converter.js";

// ─── helpers ─────────────────────────────────────────────────────────────────

function jsonl(obj: object): string {
  return JSON.stringify(obj);
}

function roleLocator(role: string, name: string) {
  return { kind: "role", body: role, options: { name } };
}

function labelLocator(label: string) {
  return { kind: "label", body: label, options: {} };
}

function textLocator(text: string) {
  return { kind: "text", body: text, options: {} };
}

// ─── jsonlToRepl ─────────────────────────────────────────────────────────────

describe("jsonlToRepl", () => {
  // assertVisible
  it("converts assertVisible with role locator to verify-visible", () => {
    const action = jsonl({ name: "assertVisible", selector: "button", signals: [], locator: roleLocator("button", "Submit") });
    expect(jsonlToRepl(action, false)).toBe('verify-visible button "Submit"');
  });

  it("converts assertVisible with text locator to verify text", () => {
    const action = jsonl({ name: "assertVisible", selector: "text=Welcome", signals: [], locator: textLocator("Welcome") });
    expect(jsonlToRepl(action, false)).toBe('verify text "Welcome"');
  });

  it("returns null for assertVisible with no text", () => {
    const action = jsonl({ name: "assertVisible", selector: ".foo", signals: [], locator: { kind: "default", body: ".foo" } });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // assertText
  it("converts assertText to verify text", () => {
    const action = jsonl({ name: "assertText", selector: "text=Hello", text: "Hello", substring: true, signals: [], locator: textLocator("Hello") });
    expect(jsonlToRepl(action, false)).toBe('verify text "Hello"');
  });

  it("returns null for assertText with no text field", () => {
    const action = jsonl({ name: "assertText", selector: "text=", text: "", substring: true, signals: [] });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // assertValue
  it("converts assertValue with label locator to verify-value", () => {
    const action = jsonl({ name: "assertValue", selector: "input", value: "user@example.com", signals: [], locator: labelLocator("Email") });
    expect(jsonlToRepl(action, false)).toBe('verify-value "Email" "user@example.com"');
  });

  it("converts assertValue with role locator to verify-value", () => {
    const action = jsonl({ name: "assertValue", selector: "input", value: "5", signals: [], locator: roleLocator("spinbutton", "Quantity") });
    expect(jsonlToRepl(action, false)).toBe('verify-value "Quantity" "5"');
  });

  it("returns null for assertValue with no text", () => {
    const action = jsonl({ name: "assertValue", selector: "input", value: "5", signals: [], locator: { kind: "default", body: "input" } });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // assertChecked
  it("converts assertChecked checked=true to verify-value checked", () => {
    const action = jsonl({ name: "assertChecked", selector: "input", checked: true, signals: [], locator: labelLocator("Accept terms") });
    expect(jsonlToRepl(action, false)).toBe('verify-value "Accept terms" "checked"');
  });

  it("converts assertChecked checked=false to verify-value unchecked", () => {
    const action = jsonl({ name: "assertChecked", selector: "input", checked: false, signals: [], locator: labelLocator("Newsletter") });
    expect(jsonlToRepl(action, false)).toBe('verify-value "Newsletter" "unchecked"');
  });

  it("returns null for assertChecked with no text", () => {
    const action = jsonl({ name: "assertChecked", selector: "input", checked: true, signals: [], locator: { kind: "default", body: "input" } });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // ─── openPage / closePage ───────────────────────────────────────────────

  it("converts openPage with URL to goto", () => {
    const action = jsonl({ name: "openPage", url: "https://example.com" });
    expect(jsonlToRepl(action, false)).toBe('goto "https://example.com"');
  });

  it("converts openPage with about:blank to comment", () => {
    const action = jsonl({ name: "openPage", url: "about:blank" });
    expect(jsonlToRepl(action, false)).toBe("# new tab opened");
  });

  it("converts openPage with chrome://newtab/ to comment", () => {
    const action = jsonl({ name: "openPage", url: "chrome://newtab/" });
    expect(jsonlToRepl(action, false)).toBe("# new tab opened");
  });

  it("converts openPage with no URL to comment", () => {
    const action = jsonl({ name: "openPage" });
    expect(jsonlToRepl(action, false)).toBe("# new tab opened");
  });

  it("converts closePage to comment", () => {
    const action = jsonl({ name: "closePage" });
    expect(jsonlToRepl(action, false)).toBe("# tab closed");
  });

  // ─── click ──────────────────────────────────────────────────────────────

  it("converts click with role locator", () => {
    const action = jsonl({ name: "click", selector: "button", locator: roleLocator("button", "Submit") });
    expect(jsonlToRepl(action, false)).toBe('click "Submit"');
  });

  it("skips click on textbox (focus-click noise)", () => {
    const action = jsonl({ name: "click", selector: "input", locator: roleLocator("textbox", "Name") });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  it("converts click with role locator but no name to CSS selector", () => {
    const action = jsonl({ name: "click", selector: "nav.main", locator: { kind: "role", body: "navigation" } });
    expect(jsonlToRepl(action, false)).toBe('click "nav.main"');
  });

  it("converts click with default locator and CSS selector", () => {
    const action = jsonl({ name: "click", selector: ".my-btn", locator: { kind: "default", body: ".my-btn" } });
    expect(jsonlToRepl(action, false)).toBe('click ".my-btn"');
  });

  it("skips click on html/body elements", () => {
    const action = jsonl({ name: "click", selector: "html", locator: { kind: "default", body: "html" } });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  it("returns null for click with no usable locator", () => {
    const action = jsonl({ name: "click", selector: "" });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // ─── fill ──────────────────────────────────────────────────────────────

  it("converts fill with label locator", () => {
    const action = jsonl({ name: "fill", text: "Alice", locator: labelLocator("Name") });
    expect(jsonlToRepl(action, false)).toBe('fill "Name" "Alice"');
  });

  it("converts fill with role locator (no name) to CSS selector", () => {
    const action = jsonl({ name: "fill", text: "test", selector: "input.email", locator: { kind: "role", body: "textbox" } });
    expect(jsonlToRepl(action, false)).toBe('fill "input.email" "test"');
  });

  it("converts fill with default locator", () => {
    const action = jsonl({ name: "fill", text: "val", selector: "#input", locator: { kind: "default", body: "#input" } });
    expect(jsonlToRepl(action, false)).toBe('fill "#input" "val"');
  });

  it("returns null for fill with no locator", () => {
    const action = jsonl({ name: "fill", text: "val" });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // ─── press ─────────────────────────────────────────────────────────────

  it("converts press with label locator", () => {
    const action = jsonl({ name: "press", key: "Enter", locator: labelLocator("Search") });
    expect(jsonlToRepl(action, false)).toBe('press "Search" Enter');
  });

  it("converts press with role locator (no name) to global key press", () => {
    const action = jsonl({ name: "press", key: "Tab", locator: { kind: "role", body: "textbox" } });
    expect(jsonlToRepl(action, false)).toBe("press Tab");
  });

  it("converts global key press (no locator)", () => {
    const action = jsonl({ name: "press", key: "Escape" });
    expect(jsonlToRepl(action, false)).toBe("press Escape");
  });

  it("returns null for press with no key and no locator", () => {
    const action = jsonl({ name: "press" });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // ─── hover ─────────────────────────────────────────────────────────────

  it("converts hover with text locator", () => {
    const action = jsonl({ name: "hover", locator: textLocator("Menu") });
    expect(jsonlToRepl(action, false)).toBe('hover "Menu"');
  });

  it("converts hover with role locator (no name) to CSS selector", () => {
    const action = jsonl({ name: "hover", selector: "a.nav-link", locator: { kind: "role", body: "link" } });
    expect(jsonlToRepl(action, false)).toBe('hover "a.nav-link"');
  });

  it("converts hover with default locator", () => {
    const action = jsonl({ name: "hover", selector: ".tooltip", locator: { kind: "default", body: ".tooltip" } });
    expect(jsonlToRepl(action, false)).toBe('hover ".tooltip"');
  });

  it("returns null for hover with no locator", () => {
    const action = jsonl({ name: "hover" });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // ─── check / uncheck ──────────────────────────────────────────────────

  it("converts check with label locator", () => {
    const action = jsonl({ name: "check", locator: labelLocator("Accept terms") });
    expect(jsonlToRepl(action, false)).toBe('check "Accept terms"');
  });

  it("converts check with role locator (no name) to selector", () => {
    const action = jsonl({ name: "check", selector: "input[type=checkbox]", locator: { kind: "role", body: "checkbox" } });
    expect(jsonlToRepl(action, false)).toBe('check "input[type=checkbox]"');
  });

  it("converts check with selector fallback", () => {
    const action = jsonl({ name: "check", selector: "#terms" });
    expect(jsonlToRepl(action, false)).toBe('check "#terms"');
  });

  it("returns null for check with no locator or selector", () => {
    const action = jsonl({ name: "check" });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  it("converts uncheck with label locator", () => {
    const action = jsonl({ name: "uncheck", locator: labelLocator("Newsletter") });
    expect(jsonlToRepl(action, false)).toBe('uncheck "Newsletter"');
  });

  it("converts uncheck with role locator (no name) to selector", () => {
    const action = jsonl({ name: "uncheck", selector: "input[type=checkbox]", locator: { kind: "role", body: "checkbox" } });
    expect(jsonlToRepl(action, false)).toBe('uncheck "input[type=checkbox]"');
  });

  it("converts uncheck with selector fallback", () => {
    const action = jsonl({ name: "uncheck", selector: "#newsletter" });
    expect(jsonlToRepl(action, false)).toBe('uncheck "#newsletter"');
  });

  it("returns null for uncheck with no locator or selector", () => {
    const action = jsonl({ name: "uncheck" });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // ─── selectOption ─────────────────────────────────────────────────────

  it("converts selectOption with label locator", () => {
    const action = jsonl({ name: "selectOption", options: ["red"], locator: labelLocator("Color") });
    expect(jsonlToRepl(action, false)).toBe('select "Color" "red"');
  });

  it("converts select with role locator (no name) to selector", () => {
    const action = jsonl({ name: "select", options: ["sm"], selector: "select.size", locator: { kind: "role", body: "combobox" } });
    expect(jsonlToRepl(action, false)).toBe('select "select.size" "sm"');
  });

  it("converts selectOption with selector fallback", () => {
    const action = jsonl({ name: "selectOption", options: ["opt1"], selector: "#dropdown" });
    expect(jsonlToRepl(action, false)).toBe('select "#dropdown" "opt1"');
  });

  it("returns null for selectOption with no locator or selector", () => {
    const action = jsonl({ name: "selectOption", options: ["x"] });
    expect(jsonlToRepl(action, false)).toBeNull();
  });

  // ─── setInputFiles ────────────────────────────────────────────────────

  it("converts setInputFiles to unsupported comment", () => {
    const action = jsonl({ name: "setInputFiles", files: ["test.png"] });
    expect(jsonlToRepl(action, false)).toBe("# file upload (unsupported)");
  });

  // ─── unknown action ──────────────────────────────────────────────────

  it("converts unknown action to unsupported comment", () => {
    const action = jsonl({ name: "drag" });
    expect(jsonlToRepl(action, false)).toBe("# drag (unsupported)");
  });

  // ─── navigate ─────────────────────────────────────────────────────────

  it("converts navigate (not first) to goto", () => {
    const action = jsonl({ name: "navigate", url: "https://example.com", signals: [] });
    expect(jsonlToRepl(action, false)).toBe('goto "https://example.com"');
  });

  it("skips navigate when isFirst=true", () => {
    const action = jsonl({ name: "navigate", url: "https://example.com", signals: [] });
    expect(jsonlToRepl(action, true)).toBeNull();
  });

  // ─── nth extraction ──────────────────────────────────────────────────

  it("appends --nth from locator chain (nth kind)", () => {
    const locator = { kind: "role", body: "button", options: { name: "Item" }, next: { kind: "nth", body: 2 } };
    const action = jsonl({ name: "click", locator });
    expect(jsonlToRepl(action, false)).toBe('click "Item" --nth 2');
  });

  it("appends --nth 0 from locator chain (first kind)", () => {
    const locator = { kind: "role", body: "link", options: { name: "More" }, next: { kind: "first" } };
    const action = jsonl({ name: "click", locator });
    expect(jsonlToRepl(action, false)).toBe('click "More" --nth 0');
  });

  it("appends --nth -1 from locator chain (last kind)", () => {
    const locator = { kind: "role", body: "link", options: { name: "More" }, next: { kind: "last" } };
    const action = jsonl({ name: "click", locator });
    expect(jsonlToRepl(action, false)).toBe('click "More" --nth -1');
  });

  it("appends --nth from selector string fallback", () => {
    const action = jsonl({ name: "click", selector: "button >> nth=3", locator: textLocator("Ok") });
    expect(jsonlToRepl(action, false)).toBe('click "Ok" --nth 3');
  });

  // ─── selector-string fallback parsing ─────────────────────────────────

  it("falls back to selector-string parsing for internal:role", () => {
    const action = jsonl({ name: "click", selector: "internal:role=button[name=\"Save\"s]" });
    expect(jsonlToRepl(action, false)).toBe('click "Save"');
  });

  it("falls back to selector-string parsing for internal:text", () => {
    // parseSelector body includes raw quotes+flags, so text becomes the full body string
    const action = jsonl({ name: "click", selector: "internal:text=\"Hello world\"i" });
    const result = jsonlToRepl(action, false);
    expect(result).toContain("click");
    expect(result).toContain("Hello world");
  });

  it("falls back to selector-string parsing for internal:label", () => {
    const action = jsonl({ name: "fill", text: "val", selector: "internal:label=\"Email\"s" });
    const result = jsonlToRepl(action, false);
    expect(result).toContain("fill");
    expect(result).toContain("Email");
    expect(result).toContain("val");
  });

  it("falls back to selector-string parsing for internal:testid", () => {
    const action = jsonl({ name: "click", selector: "internal:testid=[data-testid=\"submit-btn\"s]" });
    expect(jsonlToRepl(action, false)).toBe('click "submit-btn"');
  });

  // ─── extractLocatorMeta: locator chain traversal ──────────────────────

  it("skips nth/first/last nodes in extractLocatorMeta to find role", () => {
    // Recorder puts role first, then nth/first/last as .next
    const locator = { kind: "role", body: "button", options: { name: "Ok" }, next: { kind: "first" } };
    const action = jsonl({ name: "click", locator });
    expect(jsonlToRepl(action, false)).toBe('click "Ok" --nth 0');
  });

  it("handles placeholder locator kind", () => {
    const action = jsonl({ name: "fill", text: "test", locator: { kind: "placeholder", body: "Search..." } });
    expect(jsonlToRepl(action, false)).toBe('fill "Search..." "test"');
  });

  it("handles alt locator kind", () => {
    const action = jsonl({ name: "click", locator: { kind: "alt", body: "Logo" } });
    expect(jsonlToRepl(action, false)).toBe('click "Logo"');
  });

  it("handles title locator kind", () => {
    const action = jsonl({ name: "hover", locator: { kind: "title", body: "Close" } });
    expect(jsonlToRepl(action, false)).toBe('hover "Close"');
  });

  it("handles test-id locator kind", () => {
    const action = jsonl({ name: "click", locator: { kind: "test-id", body: "submit-btn" } });
    expect(jsonlToRepl(action, false)).toBe('click "submit-btn"');
  });

  // ─── edge cases ───────────────────────────────────────────────────────

  it("returns null for invalid JSON", () => {
    expect(jsonlToRepl("not json", false)).toBeNull();
  });
});
