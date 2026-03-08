# Backlog

## High Priority

- [x] **Unified `verify` command** — Single `verify` command with sub-types: `verify title "Hello"`, `verify url "/about"`, `verify text "Welcome"`, `verify no-text "Gone"`, `verify element button "Submit"`, `verify no-element button "Submit"`, `verify value e5 "hello"`, `verify list e3 "a" "b"`. Uses `String.includes()` for title/url. Old `verify-*` commands kept as aliases. `query` dropped — `eval` covers the same use cases.
- [x] **History loads in wrong order** — Investigated: current `.reverse()` + `.push()` logic is actually correct (newest at index 0). Not a bug.
- [x] **Dark mode toggle** — Sun/moon SVG toggle in Toolbar, `useEffect` toggles `.theme-dark` class on `<html>`, persisted via `localStorage`.
- [x] **Extension spawn path bug** — `engine.ts:133` resolves `--load-extension` to `packages/extension` instead of `packages/extension/dist`. Fix: append `/dist` to the resolved path.
- [x] **Auto-inject `expect` in `run-code`** — Implemented via `swDebugEval`; `expect(page.locator(...)).toBeVisible()` and `.not` negation work natively.
- [x] **`expect().not` negation in `run-code`** — Fixed: sandbox removed, `run-code` now routes through `swDebugEval` which uses the real `expect` object. `.not` works natively.

## Architecture

- [x] **Route `executeCommand` through `swDebugEval` instead of `sendMessage`** — Done: `bridge.ts:executeCommand` now calls `swDebugEval(jsExpr)` directly instead of `chrome.runtime.sendMessage`.
- [x] **Replace sandbox.html with `swDebugEval` for `run-code`** — Done: `sandbox.html`, `sandbox-runner.ts`, and all proxy infrastructure removed. `run-code` uses `swDebugEval` directly.
- [ ] **WebSocket CLI bridge** ([#69](https://github.com/stevez/playwright-repl/issues/69)) — External terminal REPL drives extension via WebSocket without `--remote-debugging-port`.

## Big Ideas

- [ ] **Script test runner** ([#70](https://github.com/stevez/playwright-repl/issues/70)) — "Run all" button streams pass/fail per `await` statement with CM6 gutter decorations.
- [ ] **AI test generation** ([#71](https://github.com/stevez/playwright-repl/issues/71)) — Natural language → `expect()` assertions via Claude API + snapshot context.
- [ ] **AI browser agent** ([#72](https://github.com/stevez/playwright-repl/issues/72)) — Claude operates the browser step-by-step via `swDebugEval` pipeline.
- [ ] **Step debugger** ([#73](https://github.com/stevez/playwright-repl/issues/73)) — Step through scripts line by line with CM6 highlighting and a variables panel.

## Medium Priority

- [x] **CLI `clear` command** ([#15](https://github.com/stevez/playwright-repl/issues/15))
- [x] **Chaining selectors with `>>`** ([#16](https://github.com/stevez/playwright-repl/issues/16))
- [x] **Upgrade editor to CodeMirror 6**
- [x] **Toolbar icons**
- [x] **Publish CLI to npm** — Published `@playwright-repl/core@0.7.10` and `playwright-repl@0.7.10` to npm. Closes #37.
- [x] **Command timeout** — 15s `AbortController` timeout in `executeCommand`.
- [x] **Fix failing recording component tab**
- [ ] **Editor context menu** ([#74](https://github.com/stevez/playwright-repl/issues/74)) — Right-click: Run line, Copy, Export to TypeScript.
- [ ] **Record into editor (dual mode)** ([#75](https://github.com/stevez/playwright-repl/issues/75)) — Live incremental recording in `.pw` and `JS` modes.
- [ ] **Capture locator** ([#76](https://github.com/stevez/playwright-repl/issues/76)) — "Pick element" mode captures `getByRole(...)`/`getByText(...)` locator strings.
- [ ] **Extract shared `resolveArgs`** ([#77](https://github.com/stevez/playwright-repl/issues/77)) — Dedup verify/text-locator logic between `extension-server.ts` and `repl.ts`.
- [ ] **Failed commands not recorded** ([#78](https://github.com/stevez/playwright-repl/issues/78)) — CLI `session.record(line)` skips failed commands.
- [ ] **History write errors silently swallowed** ([#79](https://github.com/stevez/playwright-repl/issues/79)) — `catch {}` hides disk-full/permission errors.
- [ ] **Playwright version too loose** ([#80](https://github.com/stevez/playwright-repl/issues/80)) — `>=1.59.0-alpha` should be pinned to `<1.60.0`.
- [ ] **Client-initiated reattach** ([#39](https://github.com/stevez/playwright-repl/issues/39)) — Reconnect button/auto-retry after "Frame was detached".
- [ ] **Fix skipped autocomplete keyboard test** ([#81](https://github.com/stevez/playwright-repl/issues/81)) — CM6 + vitest-browser keyboard dispatch mismatch.
- [ ] **Improve test coverage after playwright-crx migration** ([#82](https://github.com/stevez/playwright-repl/issues/82)) — `commands.ts`, `page-scripts.ts`, `App.tsx`, `Toolbar.tsx` at 0%.
- [ ] **Auto-attach fails when only one tab open** ([#83](https://github.com/stevez/playwright-repl/issues/83)) — `chrome://` tabs rejected with no retry fallback.

## Console (Phase 2) — [#98](https://github.com/stevez/playwright-repl/issues/98)

- [ ] **CDP remote object inspection** ([#84](https://github.com/stevez/playwright-repl/issues/84)) — Expandable tree for `document`, `window` via `Runtime.getProperties`.
- [ ] **ObjectTree array rendering** ([#85](https://github.com/stevez/playwright-repl/issues/85)) — Inline previews and table layout for homogeneous arrays.
- [ ] **Console autocomplete** ([#86](https://github.com/stevez/playwright-repl/issues/86)) — pw keywords + JS property completions via `Runtime.completionsForExpression`.
- [ ] **Console input in scroll flow** ([#87](https://github.com/stevez/playwright-repl/issues/87)) — Inline input option (Chrome DevTools style) vs. fixed at bottom.
- [ ] **Snapshot as expandable tree in console** ([#88](https://github.com/stevez/playwright-repl/issues/88)) — Parse snapshot text → collapsible CM6 tree.
- [ ] **Richer console output types** ([#89](https://github.com/stevez/playwright-repl/issues/89)) — info/warning banners, code-block highlighting, screenshot rendering.
- [ ] **Terminal → console output parity** ([#90](https://github.com/stevez/playwright-repl/issues/90)) — Terminal commands stream results into console too.
- [ ] **Editor JS mode** ([#91](https://github.com/stevez/playwright-repl/issues/91)) — `.pw`/`JS` toggle; JS mode uses `swDebugEval` directly.
- [ ] **Capture `console.log` in JS mode** — Intercept `console.log`/`console.error` in `swDebugEval` wrapper and route output to the panel console instead of service worker DevTools.
- [ ] **Recording inserts actions before `goto` in JS mode** — When recording starts, the initial `goto` is appended to the editor but cursor-tracking may cause subsequent recorded actions to land before the `goto` line instead of after it.
- [ ] **JS mode hangs on 2nd `await` line** — Multi-`await` scripts (e.g. `page.getByLabel(...).fill(...)` followed by another `await`) hang after the first line when run via `runJsScript`/`swDebugEval`. Root cause: likely a timing/resumption issue in the AsyncFunction wrapper inside the service worker.
- [ ] **`localstorage-clear` command missing** — No pw command to clear localStorage. Workaround: `localStorage.clear()` in JS mode or via `eval` in the console.
- [ ] **Console recording / export** ([#92](https://github.com/stevez/playwright-repl/issues/92)) — "Copy session" exports console inputs as `.pw`/JS file.

## Console (Phase 3 — terminal replacement)

- [ ] **Drop terminal tab** ([#93](https://github.com/stevez/playwright-repl/issues/93)) — Remove terminal once console has full parity. Depends on #89 #91 #92 #86.

## Low Priority

- [ ] **Recorder: merge fill + Enter into `fill --submit`** ([#94](https://github.com/stevez/playwright-repl/issues/94)) — Absorb `press Enter` after `fill` in `recorder.ts`.
- [x] **`highlight` command** ([#14](https://github.com/stevez/playwright-repl/issues/14))
- [ ] **Migrate monorepo to pnpm** ([#95](https://github.com/stevez/playwright-repl/issues/95)) — `workspace:*` protocol, no more manual version sync.
- [ ] **Improve README structure** ([#96](https://github.com/stevez/playwright-repl/issues/96)) — Per-package READMEs with root index.
- [ ] **Consolidate `commands.ts` and `page-scripts.ts` into `src/panel/lib/`** ([#100](https://github.com/stevez/playwright-repl/issues/100)) — Merge both files, eliminate `../../` imports, single source of truth for aliases. Closes #97.
- [x] **Convert to TypeScript**
- [x] **Extension server (Phase 8)**
- [x] **Restructure the extension code structure**
- [x] **Tailwind CSS migration**
