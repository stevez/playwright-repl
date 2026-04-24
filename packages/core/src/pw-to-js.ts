/**
 * Deterministic .pw → Playwright JavaScript converter.
 *
 * Converts .pw keyword commands to idiomatic Playwright Test code.
 * No LLM needed — pure string transformation.
 */

import { parseInput } from './parser.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConvertOptions {
  /** Variable name for the page object (default: 'page'). */
  pageVariable?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function q(s: string): string { return `'${s.replace(/'/g, "\\'")}'`; }

function isRef(s: string): boolean { return /^e\d+$/.test(s); }

/** Build a getByRole locator string. */
function byRole(page: string, role: string, name?: string, nth?: number): string {
  const nameOpt = name ? `, { name: ${q(name)} }` : '';
  const nthSuffix = nth !== undefined ? `.nth(${nth})` : '';
  return `${page}.getByRole(${q(role)}${nameOpt})${nthSuffix}`;
}

/** Build a getByLabel locator string. */
function byLabel(page: string, label: string): string {
  return `${page}.getByLabel(${q(label)})`;
}

/** Build a getByText locator string. */
function byText(page: string, text: string): string {
  return `${page}.getByText(${q(text)})`;
}

/**
 * Detect whether the first positional arg after the command is a role name.
 * Roles are lowercase alpha-only strings like "button", "textbox", "link", "heading".
 * Refs like "e5" are NOT roles. Quoted text is NOT a role.
 */
function isRole(token: string): boolean {
  return /^[a-z]+$/.test(token) && !isRef(token);
}

// ─── Line converter ─────────────────────────────────────────────────────────

/**
 * Convert a single .pw command line to a Playwright JS statement.
 * Returns null for empty lines, comments, and unconvertible commands.
 */
export function pwLineToJs(line: string, opts?: ConvertOptions): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('#')) return `// ${trimmed.slice(1).trimStart()}`;

  const args = parseInput(trimmed);
  if (!args) return null;

  const p = opts?.pageVariable ?? 'page';
  const cmd = args._[0];
  const pos = args._.slice(1);

  switch (cmd) {
    // ── Navigation ──────────────────────────────────────────────
    case 'goto':
      return pos[0] ? `await ${p}.goto(${q(pos[0])});` : null;
    case 'go-back':
      return `await ${p}.goBack();`;
    case 'go-forward':
      return `await ${p}.goForward();`;
    case 'reload':
      return `await ${p}.reload();`;

    // ── Click / dblclick / hover ─────────────────────────────────
    case 'click':
    case 'dblclick':
    case 'hover': {
      const action = cmd === 'dblclick' ? 'dblclick' : cmd;
      if (pos.length === 0) return null;
      if (isRef(pos[0])) return `// ${trimmed}  (ref-based — replace with a locator)`;
      if (pos.length >= 2 && isRole(pos[0])) {
        const name = pos.slice(1).join(' ');
        return `await ${byRole(p, pos[0], name)}.${action}();`;
      }
      const text = pos.join(' ');
      return `await ${byText(p, text)}.${action}();`;
    }

    // ── Fill ─────────────────────────────────────────────────────
    case 'fill': {
      if (pos.length < 2) return null;
      const submit = args.submit === true;
      let fillLine: string;
      if (isRef(pos[0])) {
        fillLine = `// ${trimmed}  (ref-based — replace with a locator)`;
        return fillLine;
      }
      if (pos.length >= 3 && isRole(pos[0])) {
        const name = pos[1];
        const value = pos.slice(2).join(' ');
        fillLine = `await ${byRole(p, pos[0], name)}.fill(${q(value)});`;
      } else {
        const label = pos[0];
        const value = pos.slice(1).join(' ');
        fillLine = `await ${byLabel(p, label)}.fill(${q(value)});`;
      }
      if (submit) fillLine += `\nawait ${p}.keyboard.press('Enter');`;
      return fillLine;
    }

    // ── Type ─────────────────────────────────────────────────────
    case 'type': {
      const text = pos.join(' ');
      if (!text) return null;
      const submit = args.submit === true;
      let typeLine = `await ${p}.keyboard.type(${q(text)});`;
      if (submit) typeLine += `\nawait ${p}.keyboard.press('Enter');`;
      return typeLine;
    }

    // ── Press ────────────────────────────────────────────────────
    case 'press': {
      if (pos.length === 0) return null;
      if (pos.length >= 2 && isRef(pos[0])) {
        return `// ${trimmed}  (ref-based — replace with a locator)`;
      }
      const key = pos[pos.length - 1];
      return `await ${p}.keyboard.press(${q(key)});`;
    }

    // ── Select ───────────────────────────────────────────────────
    case 'select': {
      if (pos.length < 2) return null;
      if (pos.length >= 3 && isRole(pos[0])) {
        const name = pos[1];
        const value = pos.slice(2).join(' ');
        return `await ${byRole(p, pos[0], name)}.selectOption(${q(value)});`;
      }
      const label = pos[0];
      const value = pos.slice(1).join(' ');
      return `await ${byLabel(p, label)}.selectOption(${q(value)});`;
    }

    // ── Check / Uncheck ──────────────────────────────────────────
    case 'check':
    case 'uncheck': {
      if (pos.length === 0) return null;
      if (isRef(pos[0])) return `// ${trimmed}  (ref-based — replace with a locator)`;
      if (pos.length >= 2 && isRole(pos[0])) {
        const name = pos.slice(1).join(' ');
        return `await ${byRole(p, pos[0], name)}.${cmd}();`;
      }
      const text = pos.join(' ');
      return `await ${byLabel(p, text)}.${cmd}();`;
    }

    // ── Assertions ───────────────────────────────────────────────
    case 'verify-text':
      return pos.length > 0
        ? `await expect(${byText(p, pos.join(' '))}).toBeVisible();`
        : null;
    case 'verify-no-text':
      return pos.length > 0
        ? `await expect(${byText(p, pos.join(' '))}).not.toBeVisible();`
        : null;
    case 'verify-element':
      return pos.length >= 2
        ? `await expect(${byRole(p, pos[0], pos.slice(1).join(' '))}).toBeVisible();`
        : null;
    case 'verify-no-element':
      return pos.length >= 2
        ? `await expect(${byRole(p, pos[0], pos.slice(1).join(' '))}).not.toBeVisible();`
        : null;
    case 'verify-visible':
      return pos.length >= 2
        ? `await expect(${byRole(p, pos[0], pos.slice(1).join(' '))}).toBeVisible();`
        : null;
    case 'verify-title':
      return pos.length > 0
        ? `await expect(${p}).toHaveTitle(${q(pos.join(' '))});`
        : null;
    case 'verify-url':
      return pos.length > 0
        ? `await expect(${p}).toHaveURL(/${pos.join(' ').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/);`
        : null;
    case 'verify-value':
      return pos.length >= 2
        ? `// verify-value ${pos[0]} — ref-based, replace with a locator`
        : null;
    case 'verify-input-value':
      return pos.length >= 2
        ? `await expect(${byLabel(p, pos[0])}).toHaveValue(${q(pos.slice(1).join(' '))});`
        : null;
    case 'wait-for-text':
      return pos.length > 0
        ? `await expect(${byText(p, pos.join(' '))}).toBeVisible();`
        : null;

    // ── Inspection ───────────────────────────────────────────────
    case 'screenshot': {
      const filename = args.filename ? String(args.filename) : undefined;
      const fullPage = args.fullPage === true;
      const sopts: string[] = [];
      if (filename) sopts.push(`path: ${q(filename)}`);
      if (fullPage) sopts.push('fullPage: true');
      const arg = sopts.length > 0 ? `{ ${sopts.join(', ')} }` : '';
      return `await ${p}.screenshot(${arg});`;
    }
    case 'eval': {
      const expr = pos.join(' ');
      return expr ? `await ${p}.evaluate(() => ${expr});` : null;
    }

    // ── Run-code (passthrough) ───────────────────────────────────
    case 'run-code':
      return pos[0] ?? null;

    // ── Tabs ─────────────────────────────────────────────────────
    case 'tab-new':
      return pos[0]
        ? `const newPage = await ${p}.context().newPage();\nawait newPage.goto(${q(pos[0])});`
        : `await ${p}.context().newPage();`;

    // ── Unsupported — leave as comment ───────────────────────────
    default:
      return `// ${trimmed}`;
  }
}

// ─── File converter ─────────────────────────────────────────────────────────

/**
 * Convert a .pw script to a Playwright Test file.
 */
export function pwScriptToSpec(pwScript: string, testName?: string, opts?: ConvertOptions): string {
  const name = testName ?? 'generated test';
  const lines = pwScript.split('\n');
  const jsLines: string[] = [];

  for (const line of lines) {
    const result = pwLineToJs(line, opts);
    if (result === null) continue;
    // Handle multi-line results (e.g. fill with --submit)
    for (const subLine of result.split('\n')) {
      jsLines.push(`  ${subLine}`);
    }
  }

  return `import { test, expect } from '@playwright/test';

test(${q(name)}, async ({ page }) => {
${jsLines.join('\n')}
});
`;
}
