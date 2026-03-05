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
    case "verify": {
      const subType = args[0];
      const rest = args.slice(1);
      if (subType === "title" && rest[0])
        return `await expect(page).toHaveTitle(/${rest.join(' ').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/);`;
      if (subType === "url" && rest[0])
        return `await expect(page).toHaveURL(/${rest.join(' ').replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}/);`;
      if (subType === "text" && rest[0])
        return `await expect(page.getByText(${JSON.stringify(rest.join(' '))})).toBeVisible();`;
      if (subType === "no-text" && rest[0])
        return `await expect(page.getByText(${JSON.stringify(rest.join(' '))})).not.toBeVisible();`;
      if (subType === "element" && rest.length >= 2)
        return `await expect(page.getByRole(${JSON.stringify(rest[0])}, { name: ${JSON.stringify(rest.slice(1).join(' '))} })).toBeVisible();`;
      if (subType === "no-element" && rest.length >= 2)
        return `await expect(page.getByRole(${JSON.stringify(rest[0])}, { name: ${JSON.stringify(rest.slice(1).join(' '))} })).not.toBeVisible();`;
      if (subType === "value" && rest.length >= 2)
        return `// verify value ${rest[0]} — ref-based, use locator`;
      if (subType === "list" && rest.length >= 2)
        return `// verify list ${rest[0]} — ref-based, use locator`;
      return null;
    }
    case "verify-text": {
      if (!args[0]) return null;
      return `await expect(page.getByText(${JSON.stringify(args[0])})).toBeVisible();`;
    }
    case "verify-no-text": {
      if (!args[0]) return null;
      return `await expect(page.getByText(${JSON.stringify(args[0])})).not.toBeVisible();`;
    }
    case "verify-element": {
      if (args.length < 2) return null;
      return `await expect(page.getByRole(${JSON.stringify(args[0])}, { name: ${JSON.stringify(args.slice(1).join(' '))} })).toBeVisible();`;
    }
    case "verify-no-element": {
      if (args.length < 2) return null;
      return `await expect(page.getByRole(${JSON.stringify(args[0])}, { name: ${JSON.stringify(args.slice(1).join(' '))} })).not.toBeVisible();`;
    }
    case "verify-visible": {
      if (args.length < 2) return null;
      return `await expect(page.getByRole(${JSON.stringify(args[0])}, { name: ${JSON.stringify(args.slice(1).join(' '))} })).toBeVisible();`;
    }
    case "verify-value": {
      if (args.length < 2) return null;
      return `await expect(page.getByLabel(${JSON.stringify(args[0])})).toHaveValue(${JSON.stringify(args[1])});`;
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

// ─── JSONL → REPL conversion (for port-based recorder) ───

function extractNth(action: any): string {
  let node = action.locator?.next;
  while (node) {
    if (node.kind === 'nth') return ` --nth ${node.body}`;
    if (node.kind === 'first') return ' --nth 0';
    if (node.kind === 'last') return ' --nth -1';
    node = node.next;
  }
  const sel = action.selector || '';
  const nthMatch = sel.match(/>> nth=(-?\d+)/);
  if (nthMatch) return ` --nth ${nthMatch[1]}`;
  return '';
}

interface LocatorMeta {
  text: string | null;
  kind: string;
  body: string;
}

/**
 * Traverses the full locator chain and returns the best display text + kind.
 * - 'role' locators: use options.name (accessible name)
 * - 'text'/'label'/'placeholder'/etc: use body (the text itself)
 * - 'default' (CSS/XPath): no accessible text, body is the CSS selector
 */
function extractLocatorMeta(action: any): LocatorMeta {
  let loc = action.locator;
  let meta: LocatorMeta = { text: null, kind: '', body: '' };
  while (loc) {
    const k: string = loc.kind ?? '';
    if (k === 'nth' || k === 'first' || k === 'last') {
      loc = loc.next;
      continue;
    }
    if (k === 'role' && loc.options?.name) {
      meta = { text: loc.options.name, kind: 'role', body: loc.body ?? '' };
    } else if (['text', 'label', 'placeholder', 'alt', 'title', 'test-id'].includes(k) && loc.body) {
      meta = { text: loc.body, kind: k, body: loc.body };
    } else if (k === 'default' && loc.body) {
      meta = { text: null, kind: 'default', body: loc.body };
    }
    loc = loc.next;
  }
  return meta;
}

/**
 * Converts a Playwright recorder JSONL action string to a REPL command.
 * Returns null if the action should be skipped.
 */
export function jsonlToRepl(jsonStr: string, isFirst: boolean): string | null {
  try {
    const a = JSON.parse(jsonStr);
    const { text, kind, body } = extractLocatorMeta(a);
    const q = (s: string) => `"${s}"`;
    const nth = extractNth(a);

    switch (a.name) {
      case 'navigate':
        if (isFirst) return null;
        return `goto ${q(a.url)}`;
      case 'openPage':
        return a.url && a.url !== 'about:blank' && a.url !== 'chrome://newtab/'
          ? `goto ${q(a.url)}`
          : '# new tab opened';
      case 'closePage':
        return '# tab closed';

      case 'click':
        // Skip focus-clicks on inputs — they're noise before fill/press
        if (kind === 'role' && (body === 'textbox' || body === 'combobox')) return null;
        if (text) return `click ${q(text)}${nth}`;
        // CSS fallback: skip top-level noise (html/body clicks are "click outside" events)
        if (kind === 'default' && a.selector && !['html', 'body'].includes(a.selector.trim()))
          return `click ${q(a.selector)}`;
        return null;

      case 'fill':
        if (text) return `fill ${q(text)} ${q(a.text ?? '')}${nth}`;
        if (kind === 'default' && a.selector) return `fill ${q(a.selector)} ${q(a.text ?? '')}`;
        return null;

      case 'press':
        if (text) return `press ${q(text)} ${a.key ?? ''}${nth}`;
        // Global key press (no locator)
        return a.key ? `press ${a.key}` : null;

      case 'hover':
        if (text) return `hover ${q(text)}${nth}`;
        if (kind === 'default' && a.selector) return `hover ${q(a.selector)}`;
        return null;

      case 'check':
        if (text) return `check ${q(text)}${nth}`;
        return null;

      case 'uncheck':
        if (text) return `uncheck ${q(text)}${nth}`;
        return null;

      case 'selectOption':
      case 'select':
        if (text) return `select ${q(text)} ${q(a.options?.[0] ?? '')}${nth}`;
        return null;

      case 'setInputFiles':
        return '# file upload (unsupported)';

      // ─── Assertions ───────────────────────────────────────────
      case 'assertVisible':
        if (!text) return null;
        if (kind === 'role' && body) return `verify-visible ${body} ${q(text)}`;
        return `verify text ${q(text)}`;

      case 'assertText':
        return a.text ? `verify text ${q(a.text)}` : null;

      case 'assertValue':
        if (text && a.value != null) return `verify-value ${q(text)} ${q(String(a.value))}`;
        return null;

      case 'assertChecked':
        if (!text) return null;
        return `verify-value ${q(text)} ${q(a.checked ? 'checked' : 'unchecked')}`;

      default:
        return `# ${a.name} (unsupported)`;
    }
  } catch {
    return null;
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
