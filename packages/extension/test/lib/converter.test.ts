import { describe, it, expect } from "vitest";
import { tokenize, pwToPlaywright } from "@/lib/converter.js";

describe("tokenize", () => {
  it("tokenizes simple words", () => {
    expect(tokenize("click Submit")).toEqual(["click", "Submit"]);
  });

  it("tokenizes double-quoted strings", () => {
    expect(tokenize('fill "Email" "test@example.com"')).toEqual([
      "fill",
      "Email",
      "test@example.com",
    ]);
  });

  it("tokenizes single-quoted strings", () => {
    expect(tokenize("fill 'Username' 'alice'")).toEqual([
      "fill",
      "Username",
      "alice",
    ]);
  });

  it("returns empty array for empty string", () => {
    expect(tokenize("")).toEqual([]);
  });

  it("returns empty array for whitespace", () => {
    expect(tokenize("   ")).toEqual([]);
  });

  it("returns empty array for comments", () => {
    expect(tokenize("# a comment")).toEqual([]);
  });

  it("handles mixed quoted and unquoted", () => {
    expect(tokenize('click "destroy" costco')).toEqual([
      "click",
      "destroy",
      "costco",
    ]);
  });

  it("handles tabs as separators", () => {
    expect(tokenize("goto\thttps://example.com")).toEqual([
      "goto",
      "https://example.com",
    ]);
  });

  it("handles quoted string with spaces", () => {
    expect(tokenize('click "Sign In"')).toEqual(["click", "Sign In"]);
  });
});

describe("pwToPlaywright", () => {
  it("returns null for empty string", () => {
    expect(pwToPlaywright("")).toBeNull();
  });

  it("returns null for comments", () => {
    expect(pwToPlaywright("# comment")).toBeNull();
  });

  // goto / open
  it("converts goto with URL", () => {
    expect(pwToPlaywright("goto https://example.com")).toBe(
      'await page.goto("https://example.com");'
    );
  });

  it("converts goto without protocol", () => {
    expect(pwToPlaywright("goto example.com")).toBe(
      'await page.goto("https://example.com");'
    );
  });

  it("converts open alias", () => {
    expect(pwToPlaywright("open https://example.com")).toBe(
      'await page.goto("https://example.com");'
    );
  });

  it("returns null for goto without URL", () => {
    expect(pwToPlaywright("goto")).toBeNull();
  });

  // click
  it("converts click with text", () => {
    expect(pwToPlaywright('click "Submit"')).toBe(
      'await page.getByText("Submit").click();'
    );
  });

  it("converts click with scope (second arg)", () => {
    expect(pwToPlaywright('click "destroy" "costco"')).toBe(
      'await page.getByText("costco").getByText("destroy").click();'
    );
  });

  it("converts click with snapshot ref to comment", () => {
    expect(pwToPlaywright("click e5")).toContain("snapshot ref");
  });

  it("converts c alias", () => {
    expect(pwToPlaywright('c "Submit"')).toBe(
      'await page.getByText("Submit").click();'
    );
  });

  it("returns null for click without target", () => {
    expect(pwToPlaywright("click")).toBeNull();
  });

  // dblclick
  it("converts dblclick", () => {
    expect(pwToPlaywright('dblclick "Item"')).toBe(
      'await page.getByText("Item").dblclick();'
    );
  });

  // fill
  it("converts fill with label and value", () => {
    expect(pwToPlaywright('fill "Email" "test@example.com"')).toBe(
      'await page.getByLabel("Email").fill("test@example.com");'
    );
  });

  it("converts f alias", () => {
    expect(pwToPlaywright('f "Name" "Alice"')).toBe(
      'await page.getByLabel("Name").fill("Alice");'
    );
  });

  it("returns null for fill with missing value", () => {
    expect(pwToPlaywright('fill "Email"')).toBeNull();
  });

  // select
  it("converts select", () => {
    expect(pwToPlaywright('select "Country" "US"')).toBe(
      'await page.getByLabel("Country").selectOption("US");'
    );
  });

  // check / uncheck
  it("converts check", () => {
    expect(pwToPlaywright('check "Remember me"')).toBe(
      'await page.getByLabel("Remember me").check();'
    );
  });

  it("converts uncheck", () => {
    expect(pwToPlaywright('uncheck "Terms"')).toBe(
      'await page.getByLabel("Terms").uncheck();'
    );
  });

  // hover
  it("converts hover", () => {
    expect(pwToPlaywright('hover "Menu"')).toBe(
      'await page.getByText("Menu").hover();'
    );
  });

  // press
  it("converts press with capitalization", () => {
    expect(pwToPlaywright("press enter")).toBe(
      'await page.keyboard.press("Enter");'
    );
  });

  it("converts p alias", () => {
    expect(pwToPlaywright("p tab")).toBe(
      'await page.keyboard.press("Tab");'
    );
  });

  // screenshot
  it("converts screenshot", () => {
    expect(pwToPlaywright("screenshot")).toBe(
      "await page.screenshot({ path: 'screenshot.png' });"
    );
  });

  it("converts screenshot full", () => {
    expect(pwToPlaywright("screenshot full")).toBe(
      "await page.screenshot({ path: 'screenshot.png', fullPage: true });"
    );
  });

  // snapshot
  it("converts snapshot to comment", () => {
    expect(pwToPlaywright("snapshot")).toContain("// snapshot");
  });

  it("converts s alias to comment", () => {
    expect(pwToPlaywright("s")).toContain("// snapshot");
  });

  // eval
  it("converts eval", () => {
    expect(pwToPlaywright("eval document.title")).toBe(
      "await page.evaluate(() => document.title);"
    );
  });

  // navigation
  it("converts go-back", () => {
    expect(pwToPlaywright("go-back")).toBe("await page.goBack();");
  });

  it("converts back alias", () => {
    expect(pwToPlaywright("back")).toBe("await page.goBack();");
  });

  it("converts go-forward", () => {
    expect(pwToPlaywright("go-forward")).toBe("await page.goForward();");
  });

  it("converts forward alias", () => {
    expect(pwToPlaywright("forward")).toBe("await page.goForward();");
  });

  it("converts reload", () => {
    expect(pwToPlaywright("reload")).toBe("await page.reload();");
  });

  // unified verify command
  it("converts verify title", () => {
    expect(pwToPlaywright('verify title "My App"')).toBe(
      "await expect(page).toHaveTitle(/My App/);"
    );
  });

  it("converts verify url", () => {
    expect(pwToPlaywright('verify url "/about"')).toBe(
      "await expect(page).toHaveURL(/\\/about/);"
    );
  });

  it("converts verify text", () => {
    expect(pwToPlaywright('verify text "Welcome"')).toBe(
      'await expect(page.getByText("Welcome")).toBeVisible();'
    );
  });

  it("converts verify no-text", () => {
    expect(pwToPlaywright('verify no-text "Gone"')).toBe(
      'await expect(page.getByText("Gone")).not.toBeVisible();'
    );
  });

  it("converts verify element", () => {
    expect(pwToPlaywright('verify element button "Submit"')).toBe(
      'await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();'
    );
  });

  it("converts verify no-element", () => {
    expect(pwToPlaywright('verify no-element link "Delete"')).toBe(
      'await expect(page.getByRole("link", { name: "Delete" })).not.toBeVisible();'
    );
  });

  it("converts verify value to comment", () => {
    expect(pwToPlaywright('verify value e5 "hello"')).toBe(
      "// verify value e5 — ref-based, use locator"
    );
  });

  it("converts verify list to comment", () => {
    expect(pwToPlaywright('verify list e3 "a" "b"')).toBe(
      "// verify list e3 — ref-based, use locator"
    );
  });

  it("returns null for verify without sub-type", () => {
    expect(pwToPlaywright("verify")).toBeNull();
  });

  it("returns null for verify with unknown sub-type", () => {
    expect(pwToPlaywright("verify unknown")).toBeNull();
  });

  // legacy verify-* commands
  it("converts verify-text", () => {
    expect(pwToPlaywright('verify-text "Hello"')).toBe(
      'await expect(page.getByText("Hello")).toBeVisible();'
    );
  });

  it("converts verify-no-text", () => {
    expect(pwToPlaywright('verify-no-text "Gone"')).toBe(
      'await expect(page.getByText("Gone")).not.toBeVisible();'
    );
  });

  it("converts verify-element", () => {
    expect(pwToPlaywright('verify-element button "Submit"')).toBe(
      'await expect(page.getByRole("button", { name: "Submit" })).toBeVisible();'
    );
  });

  it("converts verify-no-element", () => {
    expect(pwToPlaywright('verify-no-element button "Deleted"')).toBe(
      'await expect(page.getByRole("button", { name: "Deleted" })).not.toBeVisible();'
    );
  });

  it("converts verify-url", () => {
    expect(pwToPlaywright('verify-url "dashboard"')).toBe(
      "await expect(page).toHaveURL(/dashboard/);"
    );
  });

  it("converts verify-url with regex special chars", () => {
    expect(pwToPlaywright('verify-url "example.com/path"')).toBe(
      "await expect(page).toHaveURL(/example\\.com\\/path/);"
    );
  });

  it("converts verify-title", () => {
    expect(pwToPlaywright('verify-title "My App"')).toBe(
      "await expect(page).toHaveTitle(/My App/);"
    );
  });

  it("returns null for verify-text without arg", () => {
    expect(pwToPlaywright("verify-text")).toBeNull();
  });

  it("returns null for verify-url without arg", () => {
    expect(pwToPlaywright("verify-url")).toBeNull();
  });

  it("returns null for verify-title without arg", () => {
    expect(pwToPlaywright("verify-title")).toBeNull();
  });

  // unknown
  it("converts unknown command to comment", () => {
    expect(pwToPlaywright("foobar")).toBe("// unknown command: foobar");
  });
});
