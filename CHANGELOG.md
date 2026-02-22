# Changelog

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
