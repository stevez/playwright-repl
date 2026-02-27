# Extension Panel: React + Tailwind Migration

## Context

The extension side panel (`packages/extension/src/panel/panel.ts`) is 1067 lines of vanilla DOM manipulation — `innerHTML`, `getElementById`, manual event listeners, and scattered state variables. As the UI grows, this becomes hard to maintain. We're doing a full rewrite to React with Tailwind CSS.

**What stays unchanged:** `background.ts`, `content/recorder.ts`, `lib/converter.ts`, `types.d.ts`
**What changes:** `panel.html`, `panel.ts` → React components, `panel.css` → Tailwind

## Dependencies to add

```
react react-dom @types/react @types/react-dom    # React
@vitejs/plugin-react                              # Vite React support
tailwindcss @tailwindcss/vite                     # Tailwind v4 (CSS-first, Vite plugin)
```

## Component Structure

```
src/panel/
├── panel.html          # Simplified: just <div id="root"> + <script>
├── panel.tsx           # Mount React app, theme detection
├── App.tsx             # Layout: Toolbar → Editor → Splitter → Console → Lightbox
├── reducer.ts          # useReducer: state, actions, panelReducer
├── components/
│   ├── Toolbar.tsx     # Open, Save, Copy, Record, Run, Step, Export buttons
│   ├── EditorPane.tsx  # Line numbers, textarea, line highlight, scroll sync
│   ├── Splitter.tsx    # Draggable divider (mousedown/mousemove/mouseup)
│   ├── ConsolePane.tsx # Console header + Output + InputBar
│   ├── CommandInput.tsx # Input with ghost text + autocomplete dropdown + history
│   ├── OutputLine.tsx  # Single output line (command/success/error/snapshot/comment/info)
│   ├── Screenshot.tsx  # Inline screenshot with save button + click-to-enlarge
│   ├── CodeBlock.tsx   # Export code display with copy button
│   └── Lightbox.tsx    # Full-screen screenshot viewer
├── hooks/
│   ├── useCommandHistory.ts  # ArrowUp/Down navigation, add to history
│   ├── useAutocomplete.ts    # Ghost text + dropdown logic
│   └── useSplitter.ts        # Drag resize state
├── lib/
│   ├── commands.ts     # COMMANDS array + LOCAL_COMMANDS set (extracted from panel.ts)
│   ├── server.ts       # executeCommand(), health check — fetch wrapper
│   └── clipboard.ts    # copyToClipboard() (execCommand workaround for DevTools)
└── panel.css           # @import "tailwindcss"; + custom theme variables + any overrides
```

## Key Design Decisions

### State management
- `useReducer` for shared state (output lines, run state, line results) — one dispatch handles multiple related updates atomically
- `useState` for component-local state (input text, local toggles)
- Pass `state` + `dispatch` as props from App to children (flat structure, no Context needed)
- No external library needed — the state is all local to the panel

### Preserve element IDs for E2E tests
Keep these IDs so E2E tests (`e2e/panel/panel.test.ts`) need minimal changes:
`#output`, `#command-input`, `#editor`, `#run-btn`, `#record-btn`, `#step-btn`, `#copy-btn`, `#save-btn`, `#export-btn`, `#console-stats`, `#prompt`, `#lightbox`, `#line-numbers`, `#file-info`, `#console-clear-btn`

Also preserve CSS classes used in E2E assertions:
`.line-info`, `.line-command`, `.line-success`, `.line-error`, `.line-comment`, `.line-snapshot`, `.code-block`, `.recording`

### Tailwind v4
- CSS-first config via `@theme` block in panel.css
- Define light/dark theme colors as CSS variables (migrate from current panel.css)
- Dark mode via `prefers-color-scheme` media query (Tailwind's `dark:` variant)
- Monospace font stack as Tailwind theme value

### Vite config changes
- Add `@vitejs/plugin-react` to plugins
- Add `@tailwindcss/vite` to plugins
- Entry point stays `panel/panel.html` (Vite handles JSX/TSX via the plugin)

## Migration Steps

### Step 1: Setup (dependencies + config) ✅ DONE
- Install dependencies
- Update `vite.config.ts` with React + Tailwind plugins + `@` alias
- Update `tsconfig.json` with `"jsx": "react-jsx"` + `baseUrl`/`paths` for `@/` alias
- Create `panel.css` with Tailwind import + theme variables

### Step 2: Core components (no behavior yet) ✅ DONE
- `panel.html` → minimal `<div id="root">` + script
- `panel.tsx` → `createRoot()` mount
- `App.tsx` → static layout skeleton
- All components rendering the right HTML structure with Tailwind classes
- Verify: extension loads, shows the layout

### Step 3: Server communication + REPL ✅ DONE
- `lib/server.ts` — `executeCommand()` with `CommandResult` return type, `checkHealth()` with `Promise<boolean>`
- `ConsolePane.tsx` — input handling, Enter to submit, output display with line types
- Component tests: `test/components/ConsolePane.browser.test.tsx` (8 tests, 100% coverage)
- Vitest browser mode setup: `vitest.component.config.ts` with playwright provider
- Verify: can type commands, see output

### Step 4: useReducer + EditorPane ← NEXT

**Step 4a: Create the reducer (`src/panel/reducer.ts`)**
- State:
  ```ts
  {
    outputLines: OutputLine[]
    editorContent: string
    filename: string
    isRunning: boolean
    currentRunLine: number      // -1 = none
    stepLine: number            // -1 = not stepping
    passCount: number
    failCount: number
    lineResults: ('pass' | 'fail' | null)[]
  }
  ```
- Actions: `ADD_LINE`, `CLEAR_CONSOLE`, `COMMAND_SUBMITTED`, `COMMAND_SUCCESS`, `COMMAND_ERROR`, `SET_EDITOR_CONTENT`, `SET_FILENAME`, `RUN_START`, `RUN_STOP`, `SET_RUN_LINE`, `STEP_INIT`, `STEP_ADVANCE`

**Step 4b: Refactor App.tsx to use `useReducer`**
- Replace `useState<OutputLine[]>` with `useReducer(panelReducer, initialState)`
- Pass `state.outputLines` + `dispatch` to ConsolePane

**Step 4c: Refactor ConsolePane to use `dispatch`**
- Replace `setOutputLines` prop with `dispatch`
- `handleSubmit` dispatches `COMMAND_SUBMITTED`, then `COMMAND_SUCCESS` or `COMMAND_ERROR`
- Clear button dispatches `CLEAR_CONSOLE`

**Step 4d: Create EditorPane component**
- Textarea (`#editor`) + line numbers gutter (`#line-numbers`)
- Scroll sync between textarea and line numbers
- Line highlight for `currentRunLine`
- Pass/fail markers from `lineResults`
- File info display (`#file-info`)
- `onKeyDown` Ctrl+Enter shortcut
- Props: `editorContent`, `filename`, `currentRunLine`, `lineResults`, `dispatch`

**Step 4e: Add EditorPane to App.tsx layout**
- Render EditorPane above ConsolePane with splitter between them

**Step 4f: Tests**
- Unit test the reducer (pure function — no browser needed, use `vitest.config.ts`)
- Component test for EditorPane (browser mode)
- Update ConsolePane tests to use `dispatch` instead of `setOutputLines`

**Files:**
| File | Action |
|---|---|
| `src/panel/reducer.ts` | **New** — state, actions, reducer |
| `src/panel/types.ts` | **Update** — add `LineResult` type |
| `src/panel/App.tsx` | **Update** — useReducer |
| `src/panel/components/ConsolePane.tsx` | **Update** — dispatch instead of setOutputLines |
| `src/panel/components/EditorPane.tsx` | **New** |
| `test/reducer.test.ts` | **New** — pure unit tests |
| `test/components/ConsolePane.browser.test.tsx` | **Update** — use dispatch |
| `test/components/EditorPane.browser.test.tsx` | **New** |

### Step 5: Autocomplete + Ghost text
- `useAutocomplete` hook
- `CommandInput.tsx` — dropdown, ghost text overlay
- Tab/ArrowUp/ArrowDown/Escape handling
- Verify: ghost text appears, dropdown works

### Step 6: Recording + remaining features
- Record button toggle + chrome.runtime messaging
- Screenshot display + Lightbox
- Export (pwToPlaywright)
- Splitter drag
- Open/Save/Copy buttons
- Verify: full functionality

### Step 7: Tests
- Rewrite `test/panel.test.ts` using vitest browser mode (real browser, not jsdom)
- Mock server for `/health` and `/run` endpoints (e.g. MSW or simple fetch mock)
- Mock Chrome extension APIs: `chrome.tabs.query`, `chrome.runtime.sendMessage`, `chrome.runtime.onMessage` for recording flows (start/stop recording, receive recorded commands)
- Component tests and page-level tests for full panel behavior
- E2E tests should mostly pass as-is (same IDs/classes)
- Fix any E2E test selectors that changed

### Step 8: Cleanup
- Delete old `panel.ts` and `panel.css`
- Verify all tests pass
- Verify extension loads and works in Chrome

## Files

| File | Action |
|------|--------|
| `packages/extension/package.json` | Add React, Tailwind, plugin dependencies |
| `packages/extension/vite.config.ts` | Add React + Tailwind Vite plugins |
| `packages/extension/tsconfig.json` | Add `"jsx": "react-jsx"` |
| `packages/extension/src/panel/panel.html` | Simplify to `<div id="root">` |
| `packages/extension/src/panel/panel.ts` | **Delete** (replaced by React) |
| `packages/extension/src/panel/panel.css` | **Rewrite** with Tailwind |
| `packages/extension/src/panel/panel.tsx` | **New** — React mount |
| `packages/extension/src/panel/App.tsx` | **New** — Main layout |
| `packages/extension/src/panel/components/*.tsx` | **New** — 9 components |
| `packages/extension/src/panel/hooks/*.ts` | **New** — 3 hooks |
| `packages/extension/src/panel/lib/*.ts` | **New** — 3 utility modules |
| `packages/extension/test/panel.test.ts` | **Rewrite** with vitest browser mode + mock server |
| `packages/extension/e2e/panel/panel.test.ts` | Minor fixes if needed |

## Backlog

- [ ] Fix snapshot response type — use 'snapshot' instead of 'success' for snapshot command, render as `<pre>` with monospace
- [ ] Support localstorage-clear command
- [ ] Show connection status — indicator in UI, manual connect method with URL input
- [ ] Fix #root overflow — add `overflow: hidden` to `#root` to prevent body scroll on long output
- [ ] Reduce browser test timeout — default 30s is too long for failing tests

## Verification

1. `npm run build -w packages/extension` — builds without errors
2. Load extension in Chrome → panel renders correctly
3. `npm test -w packages/extension` — unit tests pass
4. `npm run test:e2e -w packages/extension` — E2E tests pass
5. Manual smoke test: REPL commands, run script, record, export, theme toggle
