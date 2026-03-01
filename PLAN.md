# PLAN.md — Roadmap

## Completed Phases

### Phase 1: Core REPL (v0.1)

The foundation — a persistent REPL connected to the Playwright MCP daemon.

- [x] DaemonConnection class (Unix socket client, newline-delimited JSON)
- [x] parseInput() with minimist matching daemon expectations
- [x] Command aliases (s→snapshot, c→click, o→open, g→goto, etc.)
- [x] Tab completion for commands and options
- [x] Command history (persisted to daemon cache dir)
- [x] Auto-start daemon if not running
- [x] Auto-reconnect on connection loss
- [x] Meta-commands (.help, .status, .aliases, .reconnect, .exit)
- [x] Timing display for slow commands (>500ms)
- [x] Boolean option handling (strip false defaults)
- [x] Async command queue (prevents race conditions on piped input)

### Phase 2: Modularize + Repo Setup (v0.1)

- [x] Split into `src/` modules: connection, parser, workspace, repl, recorder, resolve, colors, index
- [x] CLI entry point, package.json, bin field
- [x] Verify commands (verify-text, verify-element, verify-value, verify-list)
- [x] Text-based locators — click/fill/check/etc. accept text args
- [x] README.md with usage, examples, command reference

### Phase 3: Session Record & Replay (v0.2)

- [x] SessionRecorder, SessionPlayer, SessionManager
- [x] .record / .save / .replay / .pause / .discard meta-commands
- [x] --replay and --step CLI flags
- [x] 6 example .pw files

### Phase 4: Testing (v0.3)

- [x] Unit tests with vitest — 254 tests, 96% coverage
- [x] Cross-platform support (Windows named pipes)
- [x] Page-scripts refactor, run-code auto-wrap, eval raw parsing, red errors

### Phase 5: Monorepo Setup (v0.4)

- [x] Restructured into `packages/core`, `packages/cli`, `packages/extension`
- [x] npm workspaces with shared dependencies

### Phase 6: Engine (v0.4)

- [x] `Engine` class wrapping `BrowserServerBackend` in-process
- [x] No daemon, no socket — commands execute directly
- [x] `Engine.run()` API matches `DaemonConnection.run()`

### Phase 7: Connect Mode (v0.4)

- [x] `--connect [port]` connects to existing Chrome via CDP

### Phase 8: Extension Mode (v0.5)

- [x] Side panel extension (Manifest V3) with REPL, script editor, recorder
- [x] Direct CDP: Engine connects to Chrome via `--remote-debugging-port`
- [x] CommandServer: HTTP server relays commands from panel to Engine
- [x] Extension-side recording with `--nth` auto-detection
- [x] Export to Playwright TypeScript tests
- [x] E2E tests with Playwright Test (59 tests)

### Phase 9: TypeScript Migration & Cleanup (v0.5)

- [x] All 3 packages converted to TypeScript
- [x] `tsc --build` with project references (core → cli dependency ordering)
- [x] Vite build for extension (3 entry points)
- [x] Suppress snapshot for non-snapshot commands (goto shows only URL/title)
- [x] Text locator `--nth` support for disambiguating multiple matches
- [x] Stale files and daemon code removed

---

## Backlog

### Open Issues

- [ ] **#16 Chaining selectors** — support combining locators (e.g., `click "Delete" "Buy groceries"`)
- [ ] **#15 Add `clear` command** — clear the REPL console
- [ ] **#14 Add `highlight` command** — visually highlight elements on the page
- [ ] **#4 CSV/Excel/Markdown export** — save session data in tabular formats

### Done (moved from backlog)

- [x] **#5 Convert to Playwright tests** — export `.pw` files as Playwright TypeScript tests (v0.5 extension export)
- [x] **Reuse test workflow in release** — `test.yml` callable via `workflow_call`, `release.yml` uses it (v0.6)
- [x] **CLI replay regression tests** — multi-file `--replay` with pass/fail reporting and log file (v0.6)

### Future Ideas

- [ ] Convert extension command E2E tests (Playwright Test) to vitest integration tests — they only use HTTP fetch, no browser UI
- [x] ~~Migrate extension panel to React~~ (replaced vanilla DOM in panel.ts with React components — see PLAN-REACT.md)
- [ ] Migrate extension panel CSS to Tailwind — replace custom CSS in panel.css with Tailwind utility classes (see below)
- [ ] Replace custom recorder with Playwright's recording infrastructure (battle-tested locator generation)
- [ ] Variable substitution in .pw files (e.g., `${URL}`, `${USER}`)
- [ ] CLI strict mode violation hint — suggest `--nth` when multiple elements match
- [ ] Add missing commands: keydown, keyup, mousemove, mousedown, mouseup, mousewheel, tracing, video
- [ ] Config file support (.playwright-repl.json)
- [ ] Plugin system for custom commands

---

## Unified `verify` command (done)

Single `verify` command with 8 sub-types replacing individual `verify-*` commands. `query` command dropped — `eval` covers the same use cases.

### Command syntax

```
verify title "Hello"               # page.title().includes("Hello")
verify url "/about"                # page.url().includes("/about")
verify text "Welcome"              # getByText("Welcome") is visible
verify no-text "Gone"              # getByText("Gone") is NOT visible
verify element button "Submit"     # getByRole("button", {name: "Submit"}) exists
verify no-element button "Submit"  # getByRole("button", {name: "Submit"}) NOT exists
verify value e5 "hello"            # inputValue() === "hello"
verify list e3 "a" "b"             # list contains items
```

### Files modified

- `packages/core/src/page-scripts.ts` — Added verifyTitle, verifyUrl, verifyNoText, verifyNoElement
- `packages/core/src/index.ts` — Exported new functions
- `packages/core/src/extension-server.ts` — Unified verify sub-type routing + legacy verify-* compat
- `packages/cli/src/repl.ts` — Same routing + knownExtras updated
- `packages/core/src/parser.ts` — Added `v`→`verify` alias
- `packages/core/src/completion-data.ts` — Added verify + verify-* completions
- `packages/extension/src/panel/lib/commands.ts` — Added `verify` entry
- `packages/extension/src/panel/lib/converter.ts` — Added verify sub-type Playwright export

---

## Tailwind CSS Migration: Extension Side Panel

### Context

The React migration is complete — all components use React with `useReducer` state management. However, styling still uses ~750 lines of custom CSS in `panel.css` with ID/class selectors. Tailwind v4 (`@tailwindcss/vite`) is already installed and the CSS file already has `@import "tailwindcss"`, but no utility classes are used yet. This plan migrates layout/styling from custom CSS rules to inline Tailwind utility classes, keeping `panel.css` only for things Tailwind can't express (pseudo-elements, scrollbars, theme variables, hover parent→child).

### Key Decisions

**Theme variables: Keep `:root` / `.theme-dark` approach**
- Dark mode is driven by `chrome.devtools.panels.themeName` (class-based, not media query)
- ~40 CSS custom properties already work perfectly
- Reference them inline via Tailwind v4 arbitrary property syntax: `bg-(--bg-body)`, `text-(--text-default)`

**What stays in panel.css (~250 lines after migration)**
- `@import "tailwindcss"` + `:root` / `.theme-dark` theme variables
- `html, body`, `#root` base styles
- Pseudo-elements: `.line-command::before { content: "> " }`, `.line-success::before`, `.line-error::before`, `.line-pass::before`, `.line-fail::before`
- Scrollbar styles (`#editor::-webkit-scrollbar*`, `#output::-webkit-scrollbar*`)
- Parent hover→child rules (`#splitter:hover #splitter-handle`, `.screenshot-block:hover .screenshot-zoom-hint`)
- Button descendant rules (`#toolbar button`, `:hover`, `:disabled`)
- Special states (`#record-btn.recording`, `#run-btn` colors)
- Test-critical class rules (`.status-dot.connected`, `.status-dot.disconnected`, `.autocomplete-item.active`)
- Code block, screenshot block (complex child selectors + hover transitions)
- Placeholder/caret styles

**What moves to inline className**
- All container layouts: `flex`, `flex-col`, `flex-1`, `items-center`, `justify-between`, `gap-*`, `overflow-hidden`
- All spacing: `p-*`, `px-*`, `py-*`, `m-*`
- Typography: `font-bold`, `font-semibold`, `text-xs`, `text-sm`
- Borders: `border`, `border-b`, `border-t`, `border-y`, `rounded`
- Sizing: `w-full`, `h-full`, `shrink-0`, `min-h-[80px]`
- Positioning: `relative`, `absolute`, `fixed`, `inset-0`
- Display: `whitespace-pre`, `whitespace-pre-wrap`, `resize-none`
- Colors via arbitrary properties: `bg-(--bg-toolbar)`, `text-(--text-default)`, `border-(--border-primary)`

**Preserved selectors (E2E + component tests)**

IDs: `#toolbar`, `#toolbar-left`, `#toolbar-right`, `#editor-pane`, `#editor`, `#line-numbers`, `#output`, `#console-pane`, `#command-input`, `#prompt`, `#splitter`, `#lightbox`, `#run-btn`, `#record-btn`, `#step-btn`, `#save-btn`, `#export-btn`, `#open-btn`, `#file-info`, `#console-clear-btn`

Classes: `.line-command`, `.line-success`, `.line-error`, `.line-info`, `.line-comment`, `.line-snapshot`, `.line-active`, `.line-pass`, `.line-fail`, `.code-block`, `.recording`, `.status-dot`, `.connected`, `.disconnected`, `.port-input`, `.autocomplete-item`, `.active`, `.toolbar-sep`

### Phase 0: Infrastructure

Add `@tailwindcss/vite` to component test config so Tailwind utilities are processed during browser tests. Remove the `*` CSS reset (Tailwind v4 preflight handles it).

**Files:**
- `vitest.component.config.ts` — add `tailwindcss()` plugin
- `panel.css` — remove `* { margin: 0; padding: 0; box-sizing: border-box; }`

**Test:** all component + E2E tests pass (no visual change)

### Phase 1: Splitter + Lightbox (simplest components)

**Splitter.tsx** — move `#splitter` layout + `#splitter-handle` size to className. Keep hover rules in CSS.

**Lightbox.tsx** — move `#lightbox` overlay layout, button styles, image sizing to className. Remove corresponding CSS rules.

**Files:**
- `Splitter.tsx`, `Lightbox.tsx` — add className
- `panel.css` — remove ~30 lines

**Test:** component + E2E tests pass

### Phase 2: EditorPane

Move `#editor-pane` flex layout, `#line-numbers` base layout, `#editor-wrapper` positioning, `#editor` textarea base to className. Keep pseudo-elements (`.line-pass::before`, `.line-fail::before`), placeholder, scrollbar, and `#line-highlight` specifics in CSS.

**Files:**
- `EditorPane.tsx` — add className
- `panel.css` — remove ~30 lines

**Test:** EditorPane component tests pass (`.line-pass`, `.line-fail`, `.line-active` classes preserved)

### Phase 3: Toolbar

Move `#toolbar`, `#toolbar-left`, `#toolbar-right` container layouts, `#file-info` text, `.status-indicator` base layout, `.status-label` text to className. Keep button descendant rules, `.recording`, run/step special colors, `.toolbar-sep`, `.status-dot.*`, `.port-input`, hover rules in CSS.

**Files:**
- `Toolbar.tsx` — add className
- `panel.css` — remove ~25 lines

**Test:** Toolbar component tests pass (`.status-dot`, `.port-input` selectors preserved)

### Phase 4: ConsolePane + CommandInput

**ConsolePane.tsx** — move `#console-pane` flex layout, `#console-header` flex, `#console-title` text, `#console-clear-btn` base, `#output` scroll container to className. Keep all `.line-*` rules (pseudo-elements), `.code-block`, `.screenshot-block`, pass/fail counts in CSS.

**CommandInput.tsx** — move `#input-bar` flex layout, `#prompt` text, `#input-wrapper` relative, `#ghost-text` absolute, `#command-input` input base, `#autocomplete-dropdown` base to className. Keep `.autocomplete-item.active` hover rule, placeholder, caret in CSS.

**Files:**
- `ConsolePane.tsx`, `CommandInput.tsx` — add className
- `panel.css` — remove ~30 lines

**Test:** all component + E2E tests pass

### Phase 5: Final cleanup

Audit `panel.css` for any orphaned rules. Verify all remaining rules are necessary. Target: ~250 lines.

**Test:** full test suite + manual visual check in Chrome (light + dark theme)

### Files Summary

| Phase | Files Modified |
|-------|---------------|
| 0 | `vitest.component.config.ts`, `panel.css` |
| 1 | `Splitter.tsx`, `Lightbox.tsx`, `panel.css` |
| 2 | `EditorPane.tsx`, `panel.css` |
| 3 | `Toolbar.tsx`, `panel.css` |
| 4 | `ConsolePane.tsx`, `CommandInput.tsx`, `panel.css` |
| 5 | `panel.css` (final audit) |

All files in `packages/extension/src/panel/` or `packages/extension/`.

### Verification

After each phase:
1. `npm run test:component -w packages/extension` — browser component tests
2. `npm run build -w packages/extension` — Vite build succeeds
3. `npm run test:e2e -w packages/extension` — E2E tests pass
4. Manual: load extension in Chrome, check light + dark themes

## Key Risks

1. **Playwright internal imports** (`lib/mcp/browser/*`): Not public API, may break on upgrades. Mitigate by pinning Playwright version and testing on upgrade.
2. **Element refs** require `page._snapshotForAI()` (internal). Same risk — already used by the MCP tools.
