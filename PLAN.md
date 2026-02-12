# PLAN.md — Roadmap

## Phase 1: Core REPL (Done)

The foundation is built and working. A persistent REPL that connects to the Playwright MCP daemon over Unix socket.

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

## Phase 2: Modularize + Repo Setup (Done)

Refactored into clean modules for maintainability and extensibility.

- [x] Split into `src/` modules: connection, parser, workspace, repl, recorder, resolve, colors, index
- [x] Create `bin/playwright-repl.mjs` CLI entry point
- [x] Create `package.json` with proper metadata and bin field
- [x] Add verify commands (verify-text, verify-element, verify-value, verify-list) via run-code translation
- [x] Text-based locators — click/fill/check/etc. accept text args, auto-resolved to Playwright native locators (getByText, getByLabel, getByPlaceholder, getByRole) with fallback chains
- [x] README.md with usage, examples, command reference, architecture

## Phase 3: Session Record & Replay (Done)

- [x] SessionRecorder class (captures commands, writes .pw files)
- [x] SessionPlayer class (reads .pw files, strips comments/blanks)
- [x] SessionManager state machine (idle/recording/paused/replaying)
- [x] .record / .save / .replay / .pause / .discard meta-commands
- [x] --replay CLI flag for headless execution
- [x] --step flag for interactive step-through
- [x] Error handling during replay (stop on error)
- [x] 6 example .pw files in examples/ (TodoMVC)
- [ ] Variable substitution in .pw files (e.g., `${URL}`, `${USER}`)

## Phase 4: Testing (Done)

- [x] Unit tests with vitest — 218 tests, 96% coverage
- [x] Tests for parser, connection, recorder, repl helpers, workspace
- [x] Cross-platform support (Windows named pipes)

## Phase 5: Chrome Extension / DevTools Panel (Future)

Two approaches to explore:

### Option A: Injected Overlay (no extension needed)
- Daemon adds WebSocket server alongside Unix socket
- `page.addInitScript()` injects floating REPL panel into controlled page
- Pros: works immediately, no install, any browser
- Cons: modifies page DOM (shadow DOM mitigates)

### Option B: Chrome DevTools Panel (extension)
- Chrome extension adds "REPL" tab in DevTools
- Uses Chrome Native Messaging to communicate with daemon
- Pros: clean separation, native DevTools integration
- Cons: Chrome-only, requires extension install + native host

### Shared concerns
- Record/replay UI (record button, step controls)
- Snapshot visualization (highlight elements on page)
- Command history and autocomplete in browser

## Backlog

- [ ] Create PR to Playwright repo to add `declareCommand()` entries for verify commands in `commands.ts` — so verify-text/element/value/list work natively through the CLI wire protocol without our run-code workaround
- [ ] Add missing commands: keydown, keyup, mousemove, mousedown, mouseup, mousewheel, tracing-start, tracing-stop, video-start, video-stop, delete-data
- [ ] Integration tests with actual daemon
- [ ] npx support (`npx playwright-repl`)
- [ ] Config file support (.playwright-repl.json)
- [ ] Plugin system for custom commands
