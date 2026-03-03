# Changelog

## v0.7.8 — CodeMirror 6 Editor

**2026-03-02**

### Features

- **CodeMirror 6 editor**: Replaced plain `<textarea>` with CodeMirror 6 for a proper code editing experience
  - Built-in undo/redo (Ctrl+Z / Ctrl+Y)
  - Search & replace (Ctrl+F)
  - Line numbers via CM6 gutter
  - Active line highlighting
  - Bracket matching
  - Pass/fail gutter markers (✓/✗) for run results
  - Current run line highlighting
  - Placeholder text when empty

### Improvements

- **E2E test selectors**: Replaced brittle CSS ID selectors with `getByTestId` and `getByRole` locators
- Added `data-testid` attributes to editor pane, output, prompt, run button, and record button

## v0.7.7 — Toolbar Icons

**2026-03-01**

### Improvements

- **Toolbar icons**: Replaced text labels (Open, Save, Record/Stop, Export) with SVG icons for a cleaner, more compact toolbar
- Added `FolderOpenIcon`, `SaveIcon`, `RecordIcon`, `StopIcon`, `ExportIcon` components
- Adjusted button padding and centering for icon-only buttons

## v0.7.6 — Chaining Selectors with >>

**2026-03-01**

### Features

- **`>>` chaining**: Use Playwright's chained selector syntax with any interaction command (closes [#16](https://github.com/stevez/playwright-repl/issues/16))
  - `click ".nav >> button"` → `page.locator(".nav >> button").click()`
  - `fill ".form >> input" "hello"` → `page.locator(".form >> input").fill("hello")`
  - Works with: click, dblclick, hover, check, uncheck, fill, select
  - Supports both quoted (`click ".nav >> button"`) and unquoted (`click .nav >> button`) syntax

## v0.7.5 — Highlight Command

**2026-03-01**

### Features

- **`highlight` command**: Visualize which elements a locator matches with `highlight <locator>` (closes [#14](https://github.com/stevez/playwright-repl/issues/14))
  - CSS selectors: `highlight .btn` → `page.locator(".btn").highlight()`
  - Text matching: `highlight Submit` → `page.getByText("Submit").highlight()`
  - Auto-detects selector vs text based on CSS-like characters (`.#[]>:=`)
- **`hl` alias**: Short alias for `highlight` (e.g., `hl .btn`)
- **Autocomplete**: `highlight` appears in ghost text suggestions

## v0.7.4 — CLI .clear and .history Commands

**2026-03-01**

### Features

- **`.clear` command**: Clears terminal output in the CLI REPL (closes [#15](https://github.com/stevez/playwright-repl/issues/15))
- **`.history` command**: Shows commands entered in the current session
- **`.history clear` command**: Clears the current session history
- **Ghost text for new commands**: `.clear`, `.history`, and `.history clear` now appear in autocomplete suggestions
- **Multi-word ghost text**: Ghost text now supports commands with spaces (e.g., typing `.history ` suggests `clear`)

## v0.7.3 — Unified Verify Command

**2026-03-01**

### Features

- **Unified `verify` command**: Single command with sub-types replaces individual `verify-*` commands. All sub-types:
  - `verify title "Hello"` — assert page title contains text
  - `verify url "/about"` — assert page URL contains text
  - `verify text "Welcome"` — assert text is visible
  - `verify no-text "Gone"` — assert text is not visible
  - `verify element button "Submit"` — assert element exists by role and name
  - `verify no-element link "Delete"` — assert element does not exist
  - `verify value e5 "hello"` — assert input value (ref-based)
  - `verify list e3 "a" "b"` — assert list contains items (ref-based)
- **`v` alias**: Short alias for `verify` (e.g., `v title "Hello"`)
- **Legacy compatibility**: Old `verify-*` commands (`verify-text`, `verify-element`, `verify-title`, `verify-url`, `verify-no-text`, `verify-no-element`) continue to work as aliases

### New page-script functions

- `verifyTitle(page, text)` — throws if `page.title()` does not contain text
- `verifyUrl(page, text)` — throws if `page.url()` does not contain text
- `verifyNoText(page, text)` — throws if text is still visible on page
- `verifyNoElement(page, role, name)` — throws if element still exists

### Fixed

- **`verify-element` / `verify-no-element` converter**: Now correctly exports `getByRole("button", { name: "Submit" })` instead of incorrect `getByText("Submit")` for Playwright test export

### Tests

- 38 new tests across all packages:
  - 8 page-script function tests (`verifyTitle`, `verifyUrl`, `verifyNoText`, `verifyNoElement`)
  - 9 processline routing tests (unified verify sub-type dispatch)
  - 10 converter export tests (Playwright `expect` assertions)
  - 3 completion-data tests (verify entries present)
  - 5 autocomplete tests (ghost text and match filtering)
  - 11 E2E command tests (real browser, full stack)
- Total: ~470 tests across all packages

---

## v0.7.2 — Command History & Ghost Text Fix

**2026-03-01**

### Features

- **`history` command**: Type `history` in the extension prompt to view command history. `history clear` clears it. Both are local commands — no server connection needed.
- **Command history module**: Refactored from React hook (`useCommandHistory`) to plain module-level store (`lib/command-history.ts`). No React dependencies, shared via ES module singleton.

### Fixed

- **Ghost text persists on complete commands**: Typing a complete command name (e.g., `history`) no longer shows ghost suggestions for longer matches (e.g., `history clear`). Ghost text now stops when input exactly matches a known command.
- **`history clear` leaking into history**: Local commands (`help`, `clear`, `history`, `history clear`) are no longer recorded in command history. Only server commands appear in arrow-up recall.

---

## v0.7.1 — Dark Mode & Bug Fixes

**2026-03-01**

### Features

- **Dark mode toggle**: Sun/moon SVG button in the extension toolbar. Toggles `.theme-dark` CSS class on the document root, switching all CSS variables instantly. Preference persisted via `localStorage`.

### Fixed

- **Extension spawn path**: `--load-extension` now correctly points to `packages/extension/dist` (where `manifest.json` lives) instead of `packages/extension`.

---

## v0.7.0 — Extension React & Tailwind Migration

**2026-02-28**

### Extension — Complete Rewrite

- **React migration**: Rewrote the extension side panel from vanilla TypeScript (1,066-line `panel.ts`) to React with `useReducer` state management. Six components: `Toolbar`, `EditorPane`, `ConsolePane`, `CommandInput`, `Splitter`, `Lightbox`.
- **Tailwind CSS v4**: Migrated ~750 lines of custom CSS to Tailwind utility classes. `panel.css` reduced to ~211 lines (theme variables, toolbar buttons, pseudo-elements, scrollbars).
- **Connection status indicator**: Live status dot (green/red) with 30-second health polling and editable port number.
- **Improved tab targeting**: Each command now sends the active tab URL for correct tab targeting.
- **Unified timeouts**: Action and navigation timeouts standardized to 5s/15s.
- **Command list cleanup**: Removed CLI-only commands from extension, show raw text for non-sectioned responses.
- **Help command**: Added `help` command synced with core command list.

### Technical Details

- **Component architecture**: `App` → `Toolbar` + `Splitter(EditorPane, ConsolePane(CommandInput))` + `Lightbox`
- **State**: Single `useReducer` with actions: `EDIT_EDITOR_CONTENT`, `ADD_LINE`, `RUN_START/STOP`, `SET_LINE_RESULT`, `STEP_INIT/ADVANCE`, `CLEAR_CONSOLE`, etc.
- **Testing**: `data-testid` and `data-type` attributes for test selectors instead of CSS class selectors. Browser-based component tests via `vitest-browser-react`.
- **Build**: Vite with `@tailwindcss/vite` and `@vitejs/plugin-react` plugins.

### Tests

- 535 total tests across all packages (157 CLI + 82 core + 158 extension unit + 80 extension component + 58 extension E2E).

---

## v0.6.0 — Multi-file Replay & Log Reports

**2026-02-22**

### Features

- **Multi-file replay**: `--replay` now accepts multiple files and/or folders. Files run sequentially in a shared browser session; on failure, continues to the next file and reports a summary at the end.
  ```bash
  playwright-repl --replay examples/             # all .pw files in folder
  playwright-repl --replay a.pw b.pw c.pw        # specific files
  playwright-repl --replay examples/ extra.pw    # mix folders and files
  ```
- **Replay log file**: Every multi-file replay writes a `replay-<timestamp>.log` with per-command OK/FAIL results and a summary. The log file is the test report.
- **Error tracking**: `isError` results from the engine (e.g., `verify-text` failures) are now correctly counted. Previously only thrown exceptions were tracked.

### Examples

- Added `localstorage-clear` cleanup to all TodoMVC examples (01–06) so they work in multi-file replay without state leaking between files.
- New `07-test-click-nth.pw` — tests `--nth` disambiguation on playwright.dev.
- New `08-localstorage.pw` — tests `localstorage-list`, `localstorage-clear`, and `reload` to verify storage commands work correctly.

### CI

- Added CLI E2E step to GitHub Actions: runs `playwright-repl --replay examples/` alongside unit tests.

### Tests

- 9 new unit tests for `resolveReplayFiles` and `runMultiReplayMode` (157 CLI tests total).
- 399 total tests across all packages (157 CLI + 82 core + 160 extension).

---

## v0.5.0 — Extension Mode & TypeScript

**2026-02-22**

### Breaking Changes

- **Requires Node.js >= 20** (was >= 18)
- **TypeScript throughout** — all three packages now compiled from TypeScript

### Features

- **Extension mode** (`--extension`): Chrome side panel extension with REPL input, script editor, visual recorder, and export to Playwright tests. Uses direct CDP connection — Engine connects to Chrome via `--remote-debugging-port`.
- **CommandServer**: HTTP server (`POST /run`, `GET /health`) relays commands from the extension panel to the Engine.
- **Recording**: Extension-side recorder captures clicks, form input, selections, checkboxes, and key presses with automatic `--nth` disambiguation for ambiguous text locators.
- **Suppress snapshot for non-snapshot commands**: `goto` now shows only URL and title instead of the full accessibility tree.
- **Text locator `--nth` support**: `click "npm" --nth 1` to target a specific match when multiple elements share the same text.

### Technical Details

- **TypeScript migration**: `packages/core` and `packages/cli` compiled via `tsc --build` with project references; `packages/extension` compiled via Vite.
- **`tsc --build`** handles dependency ordering (core before cli) automatically.
- **Module resolution**: `NodeNext` (tracks latest Node.js module behavior).
- **Testing**: 390+ unit tests (vitest) + 59 E2E tests (Playwright Test) across 3 packages.
- **Extension E2E**: Launches Chrome with the extension loaded, tests panel rendering, command execution, recording, and theme switching.

### Removed

- Stale planning docs (PLAN-CRX.md, PLAN-RECORDING.md, PLAN-TYPESCRIPT.md, MIGRATION_PLAN.md)
- Architecture diagram PNGs (outdated after extension mode redesign)
- `packages/repl-ext/` (moved to separate `playwright-repl-crx` repo)

---

## v0.4.0 — In-Process Engine & Monorepo

**2026-02-18**

### Breaking Changes

- **No more daemon**: The Playwright MCP daemon is replaced by an in-process `Engine` class. No socket, no background process — commands execute directly via `BrowserServerBackend`.
- **Removed `playwright-mcp-server` binary**: The MCP server is no longer bundled. Use Playwright's own MCP server instead.
- **Removed session commands**: `list`, `close-all`, `kill-all` are no longer needed (no daemon to manage).

### Features

- **In-process Engine** (`packages/core/src/engine.ts`): Wraps Playwright's `BrowserServerBackend` directly — faster startup, simpler architecture, no IPC overhead.
- **Connect mode** (`--connect [port]`): Attach to an existing Chrome instance via CDP. Start Chrome with `--remote-debugging-port=9222`, then `playwright-repl --connect`.
- **Monorepo structure**: Restructured into `packages/core` (engine + utilities) and `packages/cli` (REPL + recorder) using npm workspaces.

### Removed

- `src/connection.mjs` — DaemonConnection (Unix socket client)
- `src/workspace.mjs` — daemon startup, socket paths
- `bin/daemon-launcher.cjs` — daemon launcher
- `bin/mcp-server.cjs` — MCP server binary

### Technical Details

- Engine uses dependency injection for testability — Playwright internals loaded lazily via absolute path resolution to bypass the `exports` map
- 214 tests (147 cli + 67 core) across 10 test files

---

## v0.3.0 — Page Scripts & run-code

**2026-02-17**

### Features

- **`run-code` auto-wrap**: Type Playwright code directly — no boilerplate needed
  - `run-code page.title()` → auto-wraps as `async (page) => { return await page.title() }`
  - `run-code await page.click('a')` → wraps without `return` for statement keywords
  - `run-code async (page) => ...` → pass-through for full function expressions
- **Raw parsing for `run-code` / `eval`**: Expressions are preserved as a single raw string — parentheses, braces, quotes, and operators no longer get split by the tokenizer
- **Red error messages**: Daemon errors (`### Error` sections) now display in red
- **Verify commands**: `verify-text`, `verify-element`, `verify-value`, `verify-list` now use real functions via `buildRunCode` instead of template strings

### Refactored

- **Page scripts module** (`src/page-scripts.mjs`): Extracted all run-code templates into real async functions (`verifyText`, `actionByText`, `fillByText`, etc.) — testable, readable, no manual escaping
- **`buildRunCode` helper**: Converts real functions to daemon-compatible code strings using `fn.toString()` + `JSON.stringify()`
- **Consolidated `actionByText`**: Merged `clickByText`, `dblclickByText`, `hoverByText` into a single function with dynamic dispatch via `loc[action]()`
- **Removed `esc()` helper and ~150 lines of template strings** from `repl.mjs`

### Fixed

- **Ghost completion for prefix commands**: Typing "close" now correctly cycles to both "close" and "close-all" (previously only showed "close-all")
- **Removed Tab-on-empty-line**: No longer shows all commands when pressing Tab on empty input

### Tests

- 100 new tests (154 → 254 total across 13 test files)
- New `test/page-scripts.test.mjs` — 21 tests for page-script functions and `buildRunCode`
- Daemon-compatibility test: verifies generated code is a valid function expression

---

## v0.2.1 — Ghost Completion

**2026-02-17**

### Features

- **Ghost completion**: Fish-shell style inline suggestions — type a prefix and see dimmed suggestion text after the cursor
  - **Tab** cycles through matches (e.g., `go` → goto, go-back, go-forward)
  - **Right Arrow** accepts the current suggestion
- Aliases excluded from ghost suggestions (still work when typed)

### Removed

- Removed readline's built-in Tab completer (replaced entirely by ghost completion)

---

## v0.2.0 — MCP Server

**2026-02-16**

### Features

- **MCP Server**: Ships a stdio MCP server (`playwright-mcp-server`) that exposes Playwright's full browser automation toolkit to AI agents (Claude, Cursor, etc.)
- Supports `--headed` flag for visible browser mode

### Configuration

VS Code / Cursor — add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["-p", "playwright-repl", "playwright-mcp-server", "--headed"]
    }
  }
}
```

---

## v0.1.1 — Bug Fixes

**2026-02-12**

### Fixes

- **`kill-all` on Windows 11**: Replace deprecated `wmic` with PowerShell `Get-CimInstance` — fixes `'wmic' is not recognized` error on modern Windows
- **Text locator case sensitivity**: `click`, `dblclick`, and `hover` now use a fallback chain (exact text → button role → link role → substring match) so `click "GET STARTED"` works even when the DOM text is "Get Started"

### Tests

- Updated tests for new text locator fallback chain and PowerShell kill-all

---

## v0.1.0 — Initial Release

**2026-02-09**

First public release of playwright-repl — an interactive REPL for Playwright browser automation.

### Features

**Interactive REPL**
- Persistent socket connection to the Playwright daemon (zero overhead per command)
- 50+ browser commands with short aliases (`c` for click, `s` for snapshot, etc.)
- Tab completion for commands, aliases, and meta-commands
- Command history (persisted across sessions)
- Automatic daemon startup and connection management
- Auto-reconnect on daemon disconnect

**Session Recording & Replay**
- Record browser interactions to `.pw` files (plain text, one command per line)
- Replay recorded sessions at full speed or step-by-step
- Pause/resume recording mid-session
- Start recording from CLI (`--record`) or inside the REPL (`.record`)

**Assertions**
- `verify-text` — assert text is visible on the page
- `verify-element` — assert element exists by role and accessible name
- `verify-value` — assert input/select/checkbox value
- `verify-list` — assert list contains expected items

**Browser Commands**
- Navigation: `goto`, `go-back`, `go-forward`, `reload`
- Interaction: `click`, `dblclick`, `fill`, `type`, `press`, `hover`, `select`, `check`, `uncheck`, `upload`, `drag`
- Inspection: `snapshot`, `screenshot`, `eval`, `console`, `network`, `run-code`
- Tabs: `tab-list`, `tab-new`, `tab-close`, `tab-select`
- Storage: cookies, localStorage, sessionStorage (list/get/set/delete/clear)
- Auth state: `state-save`, `state-load`
- Network: `route`, `route-list`, `unroute`
- Dialogs: `dialog-accept`, `dialog-dismiss`
- Layout: `resize`, `pdf`
- Sessions: `list`, `close`, `close-all`, `kill-all`

**CLI Options**
- `--headed` — visible browser mode
- `--browser` — choose chrome, firefox, webkit, or msedge
- `--session` — named sessions for parallel workflows
- `--persistent` / `--profile` — persistent browser profiles
- `--replay` / `--step` — session replay from CLI
- `--record` — start with recording enabled
- `--silent` — quiet mode for scripting

**Cross-Platform**
- Linux, macOS, Windows
- Unix sockets (Linux/macOS) and named pipes (Windows)

### Technical Details

- Pure ESM JavaScript (no build step, no TypeScript)
- Connects to Playwright's MCP terminal daemon over Unix socket / named pipe
- Wire-compatible with `playwright-cli` — produces identical JSON messages
- Requires `playwright >= 1.59.0-alpha` (daemon code in `lib/mcp/terminal/`)
- 218 tests at initial release

### Known Limitations

- Low-level keyboard commands (`keydown`, `keyup`) not yet mapped
- Low-level mouse commands (`mousemove`, `mousedown`, `mouseup`, `mousewheel`) not yet mapped
- Tracing (`tracing-start`, `tracing-stop`) not yet mapped
- Video recording (`video-start`, `video-stop`) not yet mapped
- Element refs (e.g., `e5`) are ephemeral — they change between snapshots
