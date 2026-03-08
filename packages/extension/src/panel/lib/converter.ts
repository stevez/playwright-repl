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
