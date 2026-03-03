# CodeMirror 6 — Phase 2: `.pw` Syntax Highlighting

## Context

Phase 1 (v0.7.8) replaced the editor textarea with CodeMirror 6. The editor currently renders all text in the default color. Phase 2 adds a custom `.pw` language mode so commands, comments, strings, and flags are color-coded — matching the VS Code token color scheme.

## Token Types & Colors

| Token | Example | Light | Dark |
|---|---|---|---|
| **Command** | `click`, `fill`, `goto` | `--color-command` (#0451a5) | (#569cd6) |
| **Comment** | `# this is a comment` | `--color-comment` (#6a9955) | (#6a9955) |
| **String** | `"Buy groceries"` | new `--color-string` (#a31515) | (#ce9178) |
| **Flag** | `--submit`, `--nth` | new `--color-flag` (#795e26) | (#dcdcaa) |
| **URL** | `https://example.com` | new `--color-url` (#0070c1) | (#9cdcfe) |

Everything else (args, numbers, refs) stays `--text-default`.

---

## Step-by-step

### Step 1: Add CSS variables for new token types

**File**: `packages/extension/src/panel/panel.css`

Add 3 new variables to both `:root` and `.theme-dark`:

```css
/* In :root (light), after --color-comment line */
--color-string: #a31515;
--color-flag: #795e26;
--color-url: #0070c1;

/* In .theme-dark, after --color-comment line */
--color-string: #ce9178;
--color-flag: #dcdcaa;
--color-url: #9cdcfe;
```

### Step 2: Create the `.pw` language definition

**New file**: `packages/extension/src/panel/lib/pw-language.ts`

Use CM6's `StreamLanguage` — simplest approach for line-based syntax (no multi-line constructs).

**Command set**: Build a `Set<string>` containing all command names from `resolve.ts` COMMANDS map + extra commands from `completion-data.ts` + common aliases from `parser.ts`. Full list:

```
// Commands (resolve.ts)
open, close, goto, go-back, go-forward, reload, click, dblclick, fill, type, press,
hover, select, check, uncheck, upload, drag, snapshot, screenshot, eval, console,
network, run-code, tab-list, tab-new, tab-close, tab-select, cookie-list, cookie-get,
cookie-set, cookie-delete, cookie-clear, localstorage-list, localstorage-get,
localstorage-set, localstorage-delete, localstorage-clear, sessionstorage-list,
sessionstorage-get, sessionstorage-set, sessionstorage-delete, sessionstorage-clear,
state-save, state-load, dialog-accept, dialog-dismiss, resize, pdf, config-print,
install-browser, list, close-all, kill-all, route, route-list, unroute

// Extra commands (completion-data.ts)
highlight, verify, verify-text, verify-element, verify-value, verify-list,
verify-title, verify-url, verify-no-text, verify-no-element

// Aliases (parser.ts)
o, g, go, back, fwd, r, c, dc, t, f, h, p, sel, chk, unchk,
hl, s, snap, ss, e, con, net, tl, tn, tc, ts, v, vt, ve, vv, vl, q, ls
```

**Tokenizer logic** (`token` function):

1. Start of line → reset `commandSeen` flag
2. Skip whitespace → return `null`
3. If `!commandSeen` and `#` → consume to end of line → return `'comment'`
4. If `!commandSeen` → match `[\w-]+` → if in COMMANDS set → return `'keyword'`, set `commandSeen = true`
5. If `"` or `'` → consume until matching close quote (handle `\\` escapes) → return `'string'`
6. If `--` → match `[\w-]+` → return `'attributeName'`
7. If `https?://` → consume non-whitespace → return `'url'`
8. Else → advance one char → return `null`

**State type**: `{ commandSeen: boolean }`

**Export**: `pwLanguage` (the `StreamLanguage` instance)

### Step 3: Define the highlight style

**Same file** (`pw-language.ts`)

```ts
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags } from '@lezer/highlight';

const pwHighlightStyle = HighlightStyle.define([
  { tag: tags.keyword,       color: 'var(--color-command)' },
  { tag: tags.comment,       color: 'var(--color-comment)', fontStyle: 'italic' },
  { tag: tags.string,        color: 'var(--color-string)' },
  { tag: tags.attributeName, color: 'var(--color-flag)' },
  { tag: tags.url,           color: 'var(--color-url)', textDecoration: 'underline' },
]);

export const pwSyntax = [
  pwLanguage,
  syntaxHighlighting(pwHighlightStyle),
];
```

`@lezer/highlight` ships with `@codemirror/language` — no extra install needed.

### Step 4: Add to baseExtensions

**File**: `packages/extension/src/panel/lib/codemirror-setup.ts`

Import and add to the extensions array:

```ts
import { pwSyntax } from './pw-language';

export const baseExtensions = [
    ...pwSyntax,                                 // ← ADD first
    lineNumbers(),
    // ... rest unchanged
];
```

### Step 5: Build and verify visually

```bash
npm run build
```

Load the extension in Chrome. Type or open a `.pw` script. Check:
- Commands are blue
- Comments are green italic
- Strings are red/orange
- Flags are gold
- URLs are teal underlined
- Toggle dark mode — colors switch correctly

### Step 6: Run tests

```bash
npm test
npm run build && cd packages/extension && npx playwright test
```

No test changes expected — syntax highlighting is purely visual.

---

## Files summary

| File | Change |
|---|---|
| `packages/extension/src/panel/panel.css` | Add `--color-string`, `--color-flag`, `--color-url` |
| `packages/extension/src/panel/lib/pw-language.ts` | **New** — StreamLanguage tokenizer + HighlightStyle |
| `packages/extension/src/panel/lib/codemirror-setup.ts` | Import `pwSyntax`, add to `baseExtensions` |
