# Auto-display scope variables on debug pause (#223)

## Context

The JS debugger pauses at breakpoints and supports stepping, but users can't see variable values without adding `console.log` statements. We want to show scope variables automatically when the debugger pauses, displayed in a "Variables" tab next to the Console.

## Design decisions

- **Tab-based UI**: Add [Console] [Variables] tabs to the bottom pane. Only one tab visible at a time (full width for ~400px side panel).
- **Auto-switch**: When debugger pauses → switch to Variables tab. When debugging ends → switch back to Console.
- **Variables tab only visible during debugging** (`isStepDebugging === true`).
- **Scope filtering**: Show `local`, `closure`, `script` scopes. Filter out `global` (too large).
- **Lazy loading**: Top-level scope properties fetched on expand; nested objects use existing `ObjectTree` lazy expansion via `swGetProperties`.
- **Local scope auto-expanded**, other scopes collapsed by default.

## Data flow

```
Debugger.paused event (sw-debugger.ts)
  → extract scopeChain from callFrames[0] (filter out 'global')
  → pass ScopeInfo[] (type + objectId) through PauseCallback
  → run.ts dispatches SET_SCOPE_DATA to reducer
  → VariablesPane reads scopeData, calls swGetProperties(objectId)
  → fromCdpGetProperties() → Record<string, SerializedValue>
  → renders each variable with existing ObjectTree component
```

## Changes

### 1. `sw-debugger.ts` — Export ScopeInfo type + extend PauseCallback

Add exported type:
```ts
export type ScopeInfo = { type: string; name?: string; objectId: string };
```

Change callback type:
```ts
type PauseCallback = (lineNumber: number, scopes: ScopeInfo[]) => void;
```

In `Debugger.paused` handler (~line 326), extract scope chain and pass to callback:
```ts
const scopes: ScopeInfo[] = (params.callFrames[0].scopeChain ?? [])
    .filter((s: any) => s.type !== 'global')
    .map((s: any) => ({ type: s.type, name: s.name, objectId: s.object.objectId }));
pauseCallback?.(params.callFrames[0].location.lineNumber, scopes);
```

### 2. `reducer.ts` — Add scopeData + bottomTab state

State additions:
```ts
scopeData: ScopeInfo[];                    // initial: []
bottomTab: 'console' | 'variables';       // initial: 'console'
```

New actions:
```ts
| { type: 'SET_SCOPE_DATA', scopes: ScopeInfo[] }
| { type: 'SET_BOTTOM_TAB', tab: 'console' | 'variables' }
```

Handlers:
- `SET_SCOPE_DATA`: set `scopeData`, auto-switch `bottomTab` to `'variables'` when scopes non-empty
- `SET_BOTTOM_TAB`: set `bottomTab`
- `RUN_STOP`: also clear `scopeData: []` and reset `bottomTab: 'console'`

### 3. `run.ts` — Dispatch scope data on pause

Update `onDebugPaused` callback signature to `(line: number, scopes: ScopeInfo[])`. Dispatch `SET_SCOPE_DATA` alongside `SET_RUN_LINE` on each pause:
```ts
dispatch({ type: 'SET_SCOPE_DATA', scopes });
```

### 4. `VariablesPane.tsx` — New component

Renders scope sections. Each `ScopeSection`:
- Shows header (e.g. "Local", "Closure (greet)") — click to expand/collapse
- On expand: calls `swGetProperties(scope.objectId)` → `fromCdpGetProperties()` → renders each variable with `ObjectTree`
- Local scope auto-expanded; others collapsed
- Re-fetches when `scope.objectId` changes (new pause event)
- Empty state: "Not paused" message

Reuses existing exports:
- `ObjectTree` from `Console/ObjectTree.tsx` (named export)
- `fromCdpGetProperties` from `Console/cdpToSerialized.ts`
- `swGetProperties` from `sw-debugger.ts`

### 5. `BottomPane.tsx` — New wrapper component

Contains:
- **Tab bar**: [Console] [Variables] buttons with `data-active` attribute pattern
- Variables tab button only rendered when `isStepDebugging === true`
- Conditionally renders `<Console>` or `<VariablesPane>` based on `bottomTab`

### 6. `Console/index.tsx` — Remove header bar

The Console currently renders its own header (`<span>Console</span>` at line 97-99). Remove this header since the tab bar in `BottomPane` replaces it. Keep the clear button row.

### 7. `App.tsx` — Replace Console with BottomPane

Replace `<Console outputLines={state.outputLines} dispatch={dispatch} />` with:
```tsx
<BottomPane
    bottomTab={state.bottomTab}
    outputLines={state.outputLines}
    scopeData={state.scopeData}
    isStepDebugging={state.isStepDebugging}
    dispatch={dispatch}
/>
```

### 8. `panel.css` — Tab styling

Style active/inactive tabs using `data-active` attribute (same pattern as .pw/JS mode toggle).

## Files

| File | Change |
|------|--------|
| `src/panel/lib/sw-debugger.ts` | Export `ScopeInfo`, extend `PauseCallback`, extract scope chain |
| `src/panel/reducer.ts` | Add `scopeData`, `bottomTab` state + actions, clear on `RUN_STOP` |
| `src/panel/lib/run.ts` | Update `onDebugPaused` callback to accept + dispatch scopes |
| `src/panel/components/VariablesPane.tsx` | **New** — scope sections with ObjectTree rendering |
| `src/panel/components/BottomPane.tsx` | **New** — tab bar + conditional Console/Variables rendering |
| `src/panel/components/Console/index.tsx` | Remove header bar (replaced by tab bar) |
| `src/panel/App.tsx` | Replace `<Console>` with `<BottomPane>` |
| `src/panel/panel.css` | Tab active/inactive styles |

## Verification

1. Build: `cd packages/extension && pnpm build`
2. Tests: `cd packages/extension && pnpm test && npm run test:component`
3. Manual testing:
   - Click Debug → Variables tab auto-appears with scope data
   - Step Over → variables update in place
   - Local scope shows variables; Closure scope collapsed
   - Click Console tab → console output visible; click Variables → back to variables
   - Click Stop → switches back to Console tab, Variables tab disappears
   - Expand nested object → lazy loads properties
   - When not debugging, only Console tab shown (no Variables tab)
