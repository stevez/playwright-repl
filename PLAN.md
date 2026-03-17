# Inline variable values in editor during debug pause (#224)

## Context

When paused at a breakpoint, users have to look at the Variables tab to see values. We want to show variable values inline next to the paused line in the editor, like VS Code does.

## Approach

**Show all local scope variables on the paused line** as faded text after the line content:

```
const x = 10;
let total = 0;
for (const n of arr) {
  total += n;           ← paused here    total = 6, n = 3
}
```

This is simpler than the "per-assignment-line" approach (which requires JS parsing) and still very useful. The `InlineValues` map supports multiple lines, so it can be extended later.

## Data flow

```
Debugger.paused → sw-debugger.ts → onDebugPaused(line, scopes)
  → run.ts dispatches SET_SCOPE_DATA + SET_RUN_LINE
  → App.tsx useEffect: swGetProperties → fromCdpGetProperties → stores localProps
  → localProps shared with both VariablePane (display) and formatInlineValues (inline text)
  → formatInlineValues(line, props) → pure formatting, no CDP call
  → passes InlineValues map to CodeMirrorEditorPane
  → dispatches setInlineValuesEffect to CM
  → inlineValuesDecoration renders InlineValueWidget at end of paused line
```

**Key insight**: `swGetProperties` is called once in `App.tsx` for the local scope. The result is shared by both the Variables tab and the inline values formatter — no duplicate CDP calls.

## Changes

### 1. Export `inlineSummary` from ObjectTree.tsx

Add `export` to the existing `inlineSummary` function (line 14). No other changes.

### 2. `codemirror-setup.ts` — StateEffect + StateField + Widget + Decoration

**a) New types/effects:**
```ts
export type InlineValues = Map<number, string>;  // lineNum → "x = 10, total = 6"
export const setInlineValuesEffect = StateEffect.define<InlineValues>();
```

**b) StateField:**
```ts
const inlineValuesField = StateField.define<InlineValues>({
    create: () => new Map(),
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setInlineValuesEffect)) return e.value;
        }
        return value;
    },
});
```

**c) Widget class:**
```ts
class InlineValueWidget extends WidgetType {
    constructor(readonly text: string) { super(); }
    toDOM() {
        const span = document.createElement('span');
        span.className = 'cm-inline-values';
        span.textContent = '  ' + this.text;
        return span;
    }
    eq(other: InlineValueWidget) { return this.text === other.text; }
}
```

**d) Decoration:**

Note: import `Range` from `@codemirror/state`.

```ts
const inlineValuesDecoration = EditorView.decorations.compute(
    [inlineValuesField],
    (state) => {
        const values = state.field(inlineValuesField);
        if (values.size === 0) return Decoration.none;
        const decorations: Range<Decoration>[] = [];
        for (const [lineNum, text] of values) {
            if (lineNum < 0 || lineNum >= state.doc.lines) continue;
            const line = state.doc.line(lineNum + 1);
            decorations.push(
                Decoration.widget({
                    widget: new InlineValueWidget(text),
                    side: 1,
                }).range(line.to)
            );
        }
        return Decoration.set(decorations, true);
    }
);
```

**e) Register** `inlineValuesField` and `inlineValuesDecoration` in `baseExtensions`.

**f) Update `dispatchRunState`:**
```ts
export function dispatchRunState(
    view: EditorView, runLine: number,
    lineResults: (string | null)[],
    inlineValues: InlineValues = new Map(),
) {
    view.dispatch({
        effects: [
            setRunLineEffect.of(runLine),
            setLineResultsEffect.of(lineResults),
            setInlineValuesEffect.of(inlineValues),
        ],
    });
}
```

**g) Add to `pwTheme`:**
```ts
'.cm-inline-values': {
    color: 'var(--color-inline-value)',
    fontStyle: 'italic',
    opacity: '0.7',
    pointerEvents: 'none',
},
```

### 3. New file: `lib/inline-values.ts`

Pure formatter — no CDP calls. Receives already-fetched props from App.tsx:

```ts
import { inlineSummary } from '@/components/Console/ObjectTree';
import type { SerializedValue } from '@/components/Console/types';
import type { InlineValues } from './codemirror-setup';

const MAX_INLINE_LENGTH = 80;

export function formatInlineValues(
    pausedLine: number,
    props: Record<string, SerializedValue> | null,
): InlineValues {
    const values = new Map<number, string>();
    if (pausedLine < 0 || !props) return values;

    const parts: string[] = [];
    for (const [name, val] of Object.entries(props)) {
        if (name.startsWith('[[')) continue;
        const summary = inlineSummary(val);
        if (!summary) continue;
        parts.push(`${name} = ${summary}`);
    }
    if (parts.length > 0) {
        let text = parts.join(', ');
        if (text.length > MAX_INLINE_LENGTH) text = text.slice(0, MAX_INLINE_LENGTH) + '…';
        values.set(pausedLine, text);
    }

    return values;
}
```

### 4. `App.tsx` — Fetch local scope props + derive inline values

Fetch local scope properties once, share with both VariablePane and inline values:

```tsx
const [localProps, setLocalProps] = useState<Record<string, SerializedValue> | null>(null);

// Fetch local scope properties (shared by VariablePane + inline values)
useEffect(() => {
    if (state.scopeData.length === 0) {
        setLocalProps(null);
        return;
    }
    const localScope = state.scopeData.find(s => s.type === 'local' || s.type === 'block');
    if (!localScope) { setLocalProps(null); return; }

    let cancelled = false;
    swGetProperties(localScope.objectId).then(raw => {
        if (!cancelled) setLocalProps(fromCdpGetProperties(raw));
    });
    return () => { cancelled = true; };
}, [state.scopeData]);

// Derive inline values from already-fetched props (pure, no CDP call)
const inlineValues = useMemo(
    () => formatInlineValues(state.currentRunLine, localProps),
    [state.currentRunLine, localProps],
);
```

Pass `inlineValues` to `<CodeMirrorEditorPane>` and `localProps` to `<VariablePane>`.

### 4b. `VariablePane.tsx` — Accept pre-fetched local props

Update `ScopeSection` for the local scope to use the pre-fetched `localProps` from App.tsx instead of calling `swGetProperties` again. Other scopes (closure, script) still fetch on expand as before.

### 5. `CodeMirrorEditorPane.tsx` — Accept + dispatch

Add `inlineValues` prop. Update the `useEffect` that calls `dispatchRunState`:
```ts
dispatchRunState(view, currentRunLine, lineResults, inlineValues ?? new Map());
```
Add `inlineValues` to the dependency array.

### 6. `panel.css` — Color variable

```css
/* In :root */
--color-inline-value: #6e6e6e;

/* In .theme-dark */
--color-inline-value: #888888;
```

## Cleanup on debug end

Automatic — `RUN_STOP` sets `scopeData: []` and `currentRunLine: -1`, which triggers the `useEffect` to clear `inlineValues` to an empty map.

## Files

| File | Change |
|------|--------|
| `src/panel/components/Console/ObjectTree.tsx` | Export `inlineSummary` |
| `src/panel/lib/codemirror-setup.ts` | StateEffect, StateField, Widget, decoration, update dispatchRunState (import `Range` from `@codemirror/state`) |
| `src/panel/lib/inline-values.ts` | **New** — pure `formatInlineValues` formatter (no CDP calls) |
| `src/panel/App.tsx` | Fetch local scope props once, derive inlineValues via `useMemo`, pass to both VariablePane and EditorPane |
| `src/panel/components/VariablePane.tsx` | Accept pre-fetched `localProps` for local scope (avoid duplicate fetch) |
| `src/panel/components/CodeMirrorEditorPane.tsx` | Accept + dispatch inlineValues prop |
| `src/panel/panel.css` | --color-inline-value CSS variable |

## Verification

1. Build: `cd packages/extension && pnpm build`
2. Debug JS code with breakpoints → faded inline values appear on paused line
3. Step Over → inline values update
4. Stop → inline values disappear
5. Code without local variables (top-level only) → no inline values (only local/block scope shown)
