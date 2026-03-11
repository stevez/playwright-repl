import { describe, it, expect } from "vitest";
import { playwrightCompletions } from "@/lib/pw-completion-source";
import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

// ── Mock helpers ─────────────────────────────────────────────────────────────
//
// Build a fake CompletionContext from a string where "|" marks the cursor.
// e.g. "page.|"  → cursor at position 5, doc text = "page."

function mockContext(input: string, explicit = false): CompletionContext {
  const pos = input.indexOf("|");
  if (pos === -1) throw new Error('Mock input must contain "|" for cursor position');
  const text = input.slice(0, pos) + input.slice(pos + 1);

  return {
    pos,
    explicit,
    state: {
      doc: {
        sliceString(from: number, to: number) {
          return text.slice(from, to);
        },
      },
    },
    matchBefore(re: RegExp) {
      // CM6 matchBefore: try to match the regex ending at cursor on the current line
      const before = text.slice(0, pos);
      const m = before.match(new RegExp(re.source + "$"));
      if (!m) return null;
      return {
        from: pos - m[0].length,
        to: pos,
        text: m[0],
      };
    },
  } as unknown as CompletionContext;
}

function hasLabel(result: CompletionResult | null, label: string): boolean {
  return (result?.options ?? []).some((o) => o.label === label);
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("playwrightCompletions", () => {
  // ── Case 1: dot-member completions ──────────────────────────────────────

  describe("dot-member completions", () => {
    it("page. shows Page methods", () => {
      const result = playwrightCompletions(mockContext("page.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "goto")).toBe(true);
      expect(hasLabel(result, "click")).toBe(true);
    });

    it("locator. shows Locator methods", () => {
      const result = playwrightCompletions(mockContext("locator.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "click")).toBe(true);
      expect(hasLabel(result, "fill")).toBe(true);
    });

    it("context. shows BrowserContext methods", () => {
      const result = playwrightCompletions(mockContext("context.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "newPage")).toBe(true);
    });

    it("page.go filters to matching methods", () => {
      const result = playwrightCompletions(mockContext("page.go|"));
      expect(result).not.toBeNull();
      // from should be right after the dot
      expect(result!.from).toBe(5);
    });
  });

  // ── Case 2: chained completions ─────────────────────────────────────────

  describe("chained completions", () => {
    it("page.getByRole('button'). shows Locator methods", () => {
      const result = playwrightCompletions(mockContext("page.getByRole('button').|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "click")).toBe(true);
      expect(hasLabel(result, "fill")).toBe(true);
      // Should NOT show Page methods like goto
      expect(hasLabel(result, "goto")).toBe(false);
    });

    it("page.getByText('hello'). shows Locator methods", () => {
      const result = playwrightCompletions(mockContext("page.getByText('hello').|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "click")).toBe(true);
    });

    it("page.keyboard. shows Keyboard methods", () => {
      const result = playwrightCompletions(mockContext("page.keyboard.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "press")).toBe(true);
      expect(hasLabel(result, "type")).toBe(true);
    });

    it("page.mouse. shows Mouse methods", () => {
      const result = playwrightCompletions(mockContext("page.mouse.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "click")).toBe(true);
      expect(hasLabel(result, "move")).toBe(true);
    });
  });

  // ── Case 3: expect() assertion completions ──────────────────────────────

  describe("expect() assertion completions", () => {
    it("expect(page). shows Page assertions", () => {
      const result = playwrightCompletions(mockContext("expect(page).|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "toHaveTitle")).toBe(true);
      expect(hasLabel(result, "toHaveURL")).toBe(true);
    });

    it("expect(locator). shows Locator assertions", () => {
      const result = playwrightCompletions(mockContext("expect(locator).|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "toBeVisible")).toBe(true);
      expect(hasLabel(result, "toHaveText")).toBe(true);
    });

    it("expect(page).not. shows Page assertions", () => {
      const result = playwrightCompletions(mockContext("expect(page).not.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "toHaveTitle")).toBe(true);
    });

    it("expect(page.getByText('hello')). shows Locator assertions", () => {
      const result = playwrightCompletions(
        mockContext('expect(page.getByText("hello")).|')
      );
      expect(result).not.toBeNull();
      expect(hasLabel(result, "toBeVisible")).toBe(true);
      expect(hasLabel(result, "toHaveText")).toBe(true);
      // Should NOT show Page-only assertions
      expect(hasLabel(result, "toHaveTitle")).toBe(false);
    });

    it("expect(page.getByRole('button')).not. shows Locator assertions", () => {
      const result = playwrightCompletions(
        mockContext("expect(page.getByRole('button')).not.|")
      );
      expect(result).not.toBeNull();
      expect(hasLabel(result, "toBeVisible")).toBe(true);
    });

    it("expect(someVar). shows generic assertions", () => {
      const result = playwrightCompletions(mockContext("expect(count).|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "toBe")).toBe(true);
      expect(hasLabel(result, "toEqual")).toBe(true);
    });
  });

  // ── Case 4: top-level completions ───────────────────────────────────────

  describe("top-level completions", () => {
    it("typing 'pa' offers page", () => {
      const result = playwrightCompletions(mockContext("pa|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "page")).toBe(true);
    });

    it("typing 'co' offers context", () => {
      const result = playwrightCompletions(mockContext("co|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "context")).toBe(true);
    });

    it("single char does not trigger (no noise)", () => {
      const result = playwrightCompletions(mockContext("p|"));
      expect(result).toBeNull();
    });

    it("explicit Ctrl+Space at empty input shows all top-level", () => {
      const result = playwrightCompletions(mockContext("|", true));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "page")).toBe(true);
      expect(hasLabel(result, "expect")).toBe(true);
    });
  });

  // ── Case 5: method apply (parens insertion) ─────────────────────────────

  describe("method completions have apply function", () => {
    it("page methods have apply for () insertion", () => {
      const result = playwrightCompletions(mockContext("page.|"));
      const gotoCompletion = result?.options.find((o) => o.label === "goto");
      expect(gotoCompletion).toBeDefined();
      expect(gotoCompletion!.type).toBe("method");
      expect(typeof gotoCompletion!.apply).toBe("function");
    });

    it("property completions do not have apply", () => {
      const result = playwrightCompletions(mockContext("page.|"));
      const prop = result?.options.find(
        (o) => o.type === "property"
      );
      if (prop) {
        expect(prop.apply).toBeUndefined();
      }
    });

    it("assertion completions have apply for () insertion", () => {
      const result = playwrightCompletions(mockContext("expect(page).|"));
      const assertion = result?.options.find((o) => o.label === "toHaveTitle");
      expect(assertion).toBeDefined();
      expect(typeof assertion!.apply).toBe("function");
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("unknown variable returns null for dot completion", () => {
      const result = playwrightCompletions(mockContext("foo.|"));
      expect(result).toBeNull();
    });

    it("await page. still resolves page", () => {
      const result = playwrightCompletions(mockContext("await page.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "goto")).toBe(true);
    });

    it("const el = page.locator('#x'); el. resolves Locator", () => {
      const result = playwrightCompletions(mockContext("el.|"));
      expect(result).not.toBeNull();
      expect(hasLabel(result, "click")).toBe(true);
    });
  });
});
