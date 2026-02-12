# Releases

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
- 218 tests, 96% statement coverage

### Known Limitations

- Low-level keyboard commands (`keydown`, `keyup`) not yet mapped
- Low-level mouse commands (`mousemove`, `mousedown`, `mouseup`, `mousewheel`) not yet mapped
- Tracing (`tracing-start`, `tracing-stop`) not yet mapped
- Video recording (`video-start`, `video-stop`) not yet mapped
- Element refs (e.g., `e5`) are ephemeral — they change between snapshots
