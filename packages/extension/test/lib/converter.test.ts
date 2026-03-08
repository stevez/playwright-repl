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

  // other actions
  it("converts click with role locator", () => {
    const action = jsonl({ name: "click", selector: "button", button: "left", modifiers: 0, clickCount: 1, signals: [], locator: roleLocator("button", "Submit") });
    expect(jsonlToRepl(action, false)).toBe('click "Submit"');
  });

  it("converts navigate (not first) to goto", () => {
    const action = jsonl({ name: "navigate", url: "https://example.com", signals: [] });
    expect(jsonlToRepl(action, false)).toBe('goto "https://example.com"');
  });

  it("skips navigate when isFirst=true", () => {
    const action = jsonl({ name: "navigate", url: "https://example.com", signals: [] });
    expect(jsonlToRepl(action, true)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    expect(jsonlToRepl("not json", false)).toBeNull();
  });
});
