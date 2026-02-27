/**
 * Tokenizes a raw .pw command string, respecting quoted arguments.
 * Returns an empty array for comments and empty lines.
 */
export function tokenize(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.startsWith("#")) return [];
  const tokens = [];
  let current = "";
  let inQuote = false;
  let quoteChar = "";
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (inQuote) {
      if (ch === quoteChar) { inQuote = false; tokens.push(current); current = ""; }
      else current += ch;
    } else if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; }
    else if (ch === " " || ch === "\t") { if (current) { tokens.push(current); current = ""; } }
    else current += ch;
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Converts a .pw REPL command to Playwright TypeScript code.
 * Returns a code string, or null if the command is invalid.
 */
export function pwToPlaywright(cmd: string): string | null {
  const tokens = tokenize(cmd);
  if (!tokens.length) return null;
  const command = tokens[0].toLowerCase();
  const args = tokens.slice(1);

  switch (command) {
    case "goto":
    case "open": {
      if (!args[0]) return null;
      let url = args[0];
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      return `await page.goto(${JSON.stringify(url)});`;
    }
    case "click":
    case "c": {
      if (!args[0]) return null;
      const t = args[0];
      if (/^e\d+$/.test(t)) return `// click ${t} — snapshot ref, use a locator instead`;
      if (args[1]) {
        return `await page.getByText(${JSON.stringify(args[1])}).getByText(${JSON.stringify(t)}).click();`;
      }
      return `await page.getByText(${JSON.stringify(t)}).click();`;
    }
    case "dblclick": {
      if (!args[0]) return null;
      return `await page.getByText(${JSON.stringify(args[0])}).dblclick();`;
    }
    case "fill":
    case "f": {
      if (args.length < 2) return null;
      return `await page.getByLabel(${JSON.stringify(args[0])}).fill(${JSON.stringify(args[1])});`;
    }
    case "select": {
      if (args.length < 2) return null;
      return `await page.getByLabel(${JSON.stringify(args[0])}).selectOption(${JSON.stringify(args[1])});`;
    }
    case "check": {
      if (!args[0]) return null;
      return `await page.getByLabel(${JSON.stringify(args[0])}).check();`;
    }
    case "uncheck": {
      if (!args[0]) return null;
      return `await page.getByLabel(${JSON.stringify(args[0])}).uncheck();`;
    }
    case "hover": {
      if (!args[0]) return null;
      return `await page.getByText(${JSON.stringify(args[0])}).hover();`;
    }
    case "press":
    case "p": {
      if (!args[0]) return null;
      const key = args[0].charAt(0).toUpperCase() + args[0].slice(1);
      return `await page.keyboard.press(${JSON.stringify(key)});`;
    }
    case "screenshot": {
      if (args[0] === "full") {
        return `await page.screenshot({ path: 'screenshot.png', fullPage: true });`;
      }
      return `await page.screenshot({ path: 'screenshot.png' });`;
    }
    case "snapshot":
    case "s":
      return `// snapshot — no Playwright equivalent (use Playwright Inspector)`;
    case "eval": {
      const expr = args.join(" ");
      return `await page.evaluate(() => ${expr});`;
    }
    case "go-back":
    case "back":
      return `await page.goBack();`;
    case "go-forward":
    case "forward":
      return `await page.goForward();`;
    case "reload":
      return `await page.reload();`;
    case "verify-text": {
      if (!args[0]) return null;
      return `await expect(page.getByText(${JSON.stringify(args[0])})).toBeVisible();`;
    }
    case "verify-no-text": {
      if (!args[0]) return null;
      return `await expect(page.getByText(${JSON.stringify(args[0])})).not.toBeVisible();`;
    }
    case "verify-element": {
      if (!args[0]) return null;
      return `await expect(page.getByText(${JSON.stringify(args[0])})).toBeVisible();`;
    }
    case "verify-no-element": {
      if (!args[0]) return null;
      return `await expect(page.getByText(${JSON.stringify(args[0])})).not.toBeVisible();`;
    }
    case "verify-url": {
      if (!args[0]) return null;
      return `await expect(page).toHaveURL(/${args[0].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/);`;
    }
    case "verify-title": {
      if (!args[0]) return null;
      return `await expect(page).toHaveTitle(/${args[0].replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/);`;
    }
    default:
      return `// unknown command: ${cmd}`;
  }
}

/**
 * Converts an array of .pw commands into a complete Playwright test file.
 */
export function exportToPlaywright(cmds: string[]): string {
  const lines = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test('recorded session', async ({ page }) => {`,
  ];
  for (const cmd of cmds) {
    const trimmed = cmd.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("#")) {
      lines.push(`  ${trimmed.replace("#", "//")}`);
      continue;
    }
    const converted = pwToPlaywright(trimmed);
    if (converted) {
      lines.push(`  ${converted}`);
    }
  }
  lines.push(`});`);
  return lines.join("\n");
}
