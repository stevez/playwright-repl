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
- [ ] **#5 Convert to Playwright tests** — export `.pw` files as Playwright TypeScript test suites
- [ ] **#4 CSV/Excel/Markdown export** — save session data in tabular formats

### Future Ideas

- [ ] Replace custom recorder with Playwright's recording infrastructure (battle-tested locator generation)
- [ ] Variable substitution in .pw files (e.g., `${URL}`, `${USER}`)
- [ ] CLI strict mode violation hint — suggest `--nth` when multiple elements match
- [ ] CLI replay regression tests — run `.pw` folders as test suites with pass/fail reporting
- [ ] Add missing commands: keydown, keyup, mousemove, mousedown, mouseup, mousewheel, tracing, video
- [ ] npx support (`npx playwright-repl`)
- [ ] Config file support (.playwright-repl.json)
- [ ] Plugin system for custom commands

## Key Risks

1. **Playwright internal imports** (`lib/mcp/browser/*`): Not public API, may break on upgrades. Mitigate by pinning Playwright version and testing on upgrade.
2. **Element refs** require `page._snapshotForAI()` (internal). Same risk — already used by the MCP tools.
