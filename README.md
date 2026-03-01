# playwright-repl

![playwright-repl](cover-image.png)

Interactive browser automation powered by Playwright — use it from your **terminal** or as a **Chrome side panel**.

Two frontends, one engine: the CLI gives you a terminal REPL with recording and replay; the Chrome extension gives you a DevTools panel with a script editor and visual recorder. Both run the same 35+ Playwright commands through a shared Engine — no command duplication.

## Why?

**playwright-repl** runs Playwright's browser tools in-process. Type a command, see the result instantly. No code, no tokens, no setup.

- **CLI** — terminal REPL with recording, replay, piping, and 50+ aliases
- **Extension** — Chrome DevTools panel with script editor, recorder, and light/dark themes
- **Same commands everywhere** — `click`, `fill`, `snapshot`, `verify-text` work identically in both

Key features:
- **Text locators** — `click "Submit"` or `fill "Email" "test@example.com"` instead of element refs
- **Element refs** — `click e5`, `fill e7 "hello"` from `snapshot` output
- **Assertions** — `verify-text`, `verify-element`, `verify-value`, `verify-list`
- **Record & replay** — capture sessions as `.pw` files (CLI) or record interactions visually (extension)
- **Three connection modes** — launch a new browser, connect to existing Chrome, or use the extension relay

## Architecture

Both CLI and Extension are frontends to the Engine. Neither directly accesses Chrome.

```
┌──────────────┐     ┌──────────────┐
│   CLI (REPL) │     │  Extension   │
│  packages/cli│     │  (Side Panel)│
└──────┬───────┘     └──────┬───────┘
       │                    │ fetch POST /run
       │                    ▼
       │              ┌─────────────┐
       └──────────────►   Engine    │
                      │ (in-process)│
                      └──────┬──────┘
                             │ CDP
                             ▼
                      ┌─────────────┐
                      │   Chrome    │
                      └─────────────┘
```

### Three Connection Modes

| Mode | Flag | Browser Source | Use Case |
|------|------|---------------|----------|
| **Launch** | `--headed` (default) | Launches new Chromium via Playwright | General automation |
| **Connect** | `--connect [port]` | Existing Chrome with `--remote-debugging-port` | Debug running app |
| **Extension** | `--extension` | Chrome launched with CDP port; side panel sends commands via HTTP | DevTools panel REPL |

### Extension Mode

The extension is a Chrome side panel. The CLI starts Chrome with `--remote-debugging-port`, and the Engine connects directly via CDP. The panel sends commands to a local CommandServer (`POST /run`), which routes them through the Engine.

## Quick Start — CLI

```bash
# Install
npm install -g playwright-repl
npx playwright install  # browser binaries (if needed)

# Start the REPL (launches browser automatically)
playwright-repl

# With a visible browser
playwright-repl --headed

# Connect to existing Chrome
playwright-repl --connect 9222
```

```
pw> goto https://demo.playwright.dev/todomvc/
pw> fill "What needs to be done?" "Buy groceries"
pw> press Enter
pw> fill "What needs to be done?" "Write tests"
pw> press Enter
pw> check "Buy groceries"
pw> verify-text "1 item left"
```

## Quick Start — Extension

```bash
# 1. Start in extension mode (launches Chrome with extension loaded)
playwright-repl --extension

# 2. Open any website → click the side panel icon → "Playwright REPL" panel

# 3. Type commands in the panel — same syntax as CLI
```

The extension side panel includes a REPL input, script editor, visual recorder, and export to Playwright tests.

## Install

```bash
npm install -g playwright-repl

# If you don't have browser binaries yet
npx playwright install

# Or install from source
git clone https://github.com/stevez/playwright-repl.git
cd playwright-repl && npm install && npm link
```

## Usage

```bash
# Interactive REPL
playwright-repl [options]

# Replay a recorded session
playwright-repl --replay session.pw

# Replay all .pw files in a folder
playwright-repl --replay examples/

# Replay multiple files
playwright-repl --replay a.pw b.pw c.pw

# Step through replay (pause between commands)
playwright-repl --replay session.pw --step

# Start REPL with recording enabled
playwright-repl --record my-test.pw

# Pipe commands
echo -e "goto https://example.com\nsnapshot" | playwright-repl

# Connect to existing Chrome via CDP
playwright-repl --connect         # default port 9222
playwright-repl --connect 9333    # custom port

# Extension mode (launches Chrome with side panel)
playwright-repl --extension              # default port 3000
playwright-repl --extension --port 4000  # custom command server port
```

### CLI Options

| Option | Description |
|--------|-------------|
| `-b, --browser <type>` | Browser: `chrome`, `firefox`, `webkit`, `msedge` |
| `--headed` | Run browser in headed (visible) mode |
| `--persistent` | Use persistent browser profile |
| `--profile <dir>` | Persistent profile directory |
| `--connect [port]` | Connect to existing Chrome via CDP (default: `9222`) |
| `--extension` | Launch Chrome with side panel extension and command server |
| `--port <number>` | Command server port (default: `3000`) |
| `--config <file>` | Path to config file |
| `--replay <files...>` | Replay `.pw` file(s) or folder(s) |
| `--record <file>` | Start REPL with recording to file |
| `--step` | Pause between commands during replay |
| `-q, --silent` | Suppress banner and status messages |
| `-h, --help` | Show help |

## Commands

All commands work in both CLI and extension. In the CLI, type directly at the `pw>` prompt. In the extension, type in the REPL input or use the script editor.

### Navigation

| Command | Alias | Description |
|---------|-------|-------------|
| `goto <url>` | `g` | Navigate to a URL |
| `open [url]` | `o` | Open browser (optionally navigate) |
| `go-back` | `back` | Go back in history |
| `go-forward` | `fwd` | Go forward in history |
| `reload` | `r` | Reload page |

### Interaction

| Command | Alias | Description |
|---------|-------|-------------|
| `click <ref>` | `c` | Click an element |
| `dblclick <ref>` | `dc` | Double-click an element |
| `fill <ref> <text>` | `f` | Fill a form field |
| `type <text>` | `t` | Type text key by key |
| `press <key>` | `p` | Press a keyboard key |
| `hover <ref>` | `h` | Hover over element |
| `select <ref> <value>` | `sel` | Select dropdown option |
| `check <ref>` | `chk` | Check a checkbox |
| `uncheck <ref>` | `unchk` | Uncheck a checkbox |
| `upload <ref> <file>` | — | Upload a file |
| `drag <from> <to>` | — | Drag and drop |

### Inspection

| Command | Alias | Description |
|---------|-------|-------------|
| `snapshot` | `s` | Accessibility tree with element refs |
| `screenshot` | `ss` | Take a screenshot |
| `eval <expr>` | `e` | Evaluate JavaScript in browser context |
| `console` | `con` | Browser console messages |
| `network` | `net` | Network requests log |
| `run-code <code>` | — | Run Playwright code with `page` object |

### Assertions

| Command | Alias | Description |
|---------|-------|-------------|
| `verify-text <text>` | `vt` | Verify text is visible on page |
| `verify-element <role> <name>` | `ve` | Verify element exists by role and name |
| `verify-value <ref> <value>` | `vv` | Verify input/select/checkbox value |
| `verify-list <ref> <items>` | `vl` | Verify list contains expected items |

### Tabs

| Command | Alias | Description |
|---------|-------|-------------|
| `tab-list` | `tl` | List open tabs |
| `tab-new [url]` | `tn` | Open a new tab |
| `tab-close [index]` | `tc` | Close a tab |
| `tab-select <index>` | `ts` | Switch to a tab |

### Storage & Cookies

| Command | Description |
|---------|-------------|
| `state-save [file]` | Save auth state (cookies + storage) |
| `state-load <file>` | Load auth state |
| `cookie-list` | List all cookies |
| `cookie-get <name>` | Get a specific cookie |
| `cookie-set <name> <value>` | Set a cookie |
| `cookie-delete <name>` | Delete a cookie |
| `cookie-clear` | Clear all cookies |
| `localstorage-list` | List all localStorage |
| `localstorage-get <key>` | Get localStorage value |
| `localstorage-set <key> <value>` | Set localStorage value |
| `localstorage-delete <key>` | Delete localStorage key |
| `localstorage-clear` | Clear all localStorage |
| `sessionstorage-list` | List all sessionStorage |
| `sessionstorage-get <key>` | Get sessionStorage value |
| `sessionstorage-set <key> <value>` | Set sessionStorage value |
| `sessionstorage-delete <key>` | Delete sessionStorage key |
| `sessionstorage-clear` | Clear all sessionStorage |

### Network Routing

| Command | Description |
|---------|-------------|
| `route <pattern>` | Intercept network requests |
| `route-list` | List active routes |
| `unroute [pattern]` | Remove route(s) |

### Dialogs & Layout

| Command | Description |
|---------|-------------|
| `dialog-accept [text]` | Accept a browser dialog |
| `dialog-dismiss` | Dismiss a browser dialog |
| `resize <w> <h>` | Resize browser window |
| `pdf` | Save page as PDF |

### Browser Control

| Command | Alias | Description |
|---------|-------|-------------|
| `close` | `q` | Close the browser |
| `config-print` | — | Print browser config |

## CLI Features

### REPL Meta-Commands

| Command | Description |
|---------|-------------|
| `.help` | Show available commands |
| `.aliases` | Show all command aliases |
| `.status` | Show connection status |
| `.reconnect` | Restart browser |
| `.record [file]` | Start recording commands |
| `.save` | Stop recording and save to file |
| `.pause` | Pause/resume recording |
| `.discard` | Discard current recording |
| `.replay <file>` | Replay a recorded session |
| `.exit` | Exit REPL (also Ctrl+D) |

### Session Recording & Replay

Record your browser interactions and replay them later — great for regression tests, onboarding demos, or sharing reproducible flows.

#### Record

```bash
# From CLI
playwright-repl --record my-test.pw --headed

# Or inside the REPL
pw> .record my-test
⏺ Recording to my-test.pw
pw> goto https://demo.playwright.dev/todomvc/
pw> fill "What needs to be done?" "Buy groceries"
pw> press Enter
pw> verify-text "1 item left"
pw> .save
✓ Saved 4 commands to my-test.pw
```

#### Replay

```bash
# Full speed
playwright-repl --replay my-test.pw

# Step-through (press Enter between commands)
playwright-repl --replay my-test.pw --step --headed

# Replay all .pw files in a folder (multi-file mode)
playwright-repl --replay examples/ --silent

# Or inside the REPL
pw> .replay my-test.pw
```

Multi-file replay runs all files sequentially, writes a `replay-<timestamp>.log` with per-command results, and prints a pass/fail summary. Exit code 0 if all pass, 1 if any fail.

#### File Format

`.pw` files are plain text — human-readable, diffable, version-controllable:

```
# CI smoke test — quick add-and-verify
# App: https://demo.playwright.dev/todomvc/

goto https://demo.playwright.dev/todomvc/
fill "What needs to be done?" "Buy groceries"
press Enter
verify-text "Buy groceries"
verify-text "1 item left"
```

#### Recording Controls

| Command | Description |
|---------|-------------|
| `.record [file]` | Start recording |
| `.pause` | Pause recording (toggle) |
| `.save` | Stop and save to file |
| `.discard` | Discard without saving |

### eval & run-code

Two ways to run custom code from the REPL:

#### eval — Browser Context

Runs JavaScript inside the browser page (via `page.evaluate`). Use browser globals like `document`, `window`, `location`:

```
pw> eval document.title
"Installation | Playwright"

pw> eval window.location.href
"https://playwright.dev/docs/intro"

pw> eval document.querySelectorAll('a').length
42
```

#### run-code — Playwright API

Runs code with full access to the Playwright `page` object. The REPL auto-wraps your code — just write the body:

```
pw> run-code page.url()
→ async (page) => { return await page.url() }
"https://playwright.dev/docs/intro"

pw> run-code page.locator('h1').textContent()
→ async (page) => { return await page.locator('h1').textContent() }
"Installation"
```

For multiple statements, use semicolons:

```
pw> run-code const u = await page.url(); const t = await page.title(); return {u, t}
```

## Extension Features

### Side Panel

The extension adds a "Playwright REPL" side panel in Chrome with:

- **REPL input** — type commands at the bottom, results appear in the console pane
- **Script editor** — write multi-line `.pw` scripts with line numbers, run all or step through
- **Visual recorder** — click Record, interact with the page, recorded commands appear automatically
- **Export** — convert `.pw` commands to Playwright TypeScript test code
- **Light/dark themes** — matches your DevTools theme

### Recording in Extension

Click the Record button in the toolbar, then interact with the page normally. The recorder captures:

- **Clicks** — with text locators and context (e.g., `click "Delete" "Buy groceries"`)
- **Form input** — debounced fill commands (e.g., `fill "Email" "test@example.com"`)
- **Selections** — dropdown changes (e.g., `select "Country" "United States"`)
- **Checkboxes** — check/uncheck with label context
- **Key presses** — Enter, Tab, Escape

### Export to Playwright

The extension can export `.pw` commands to Playwright TypeScript:

```
# .pw commands                    → Playwright TypeScript
goto https://example.com          → await page.goto("https://example.com");
click "Submit"                    → await page.getByText("Submit").click();
fill "Email" "test@example.com"   → await page.getByLabel("Email").fill("test@example.com");
verify-text "Success"             → await expect(page.getByText("Success")).toBeVisible();
```

### Connect Mode

To control an existing Chrome instance from the CLI:

```bash
# Start Chrome with debugging port
chrome --remote-debugging-port=9222

# Connect the REPL
playwright-repl --connect 9222
```

## Examples

Examples use the [TodoMVC demo](https://demo.playwright.dev/todomvc/) and [playwright.dev](https://playwright.dev/). All can be run directly or together via multi-file replay:

| File | Description |
|------|-------------|
| [01-add-todos.pw](packages/cli/examples/01-add-todos.pw) | Add todos and verify with assertions |
| [02-complete-and-filter.pw](packages/cli/examples/02-complete-and-filter.pw) | Complete todos, use filters |
| [03-record-session.pw](packages/cli/examples/03-record-session.pw) | Record a test session |
| [04-replay-session.pw](packages/cli/examples/04-replay-session.pw) | Replay with step-through |
| [05-ci-pipe.pw](packages/cli/examples/05-ci-pipe.pw) | CI smoke test |
| [06-edit-todo.pw](packages/cli/examples/06-edit-todo.pw) | Double-click to edit a todo |
| [07-test-click-nth.pw](packages/cli/examples/07-test-click-nth.pw) | `--nth` disambiguation on playwright.dev |
| [08-localstorage.pw](packages/cli/examples/08-localstorage.pw) | localStorage commands: list, clear, reload |

Try one:

```bash
# Run an example with a visible browser
playwright-repl --replay packages/cli/examples/01-add-todos.pw --headed

# Step through an example interactively
playwright-repl --replay packages/cli/examples/04-replay-session.pw --step --headed

# Run as a CI smoke test (headless, silent)
playwright-repl --replay packages/cli/examples/05-ci-pipe.pw --silent

# Run all examples (multi-file replay with log report)
playwright-repl --replay packages/cli/examples/ --silent
```

## Monorepo Structure

```
packages/
├── core/           # Engine + shared utilities (TypeScript, tsc)
│   └── src/
│       ├── engine.ts             # Wraps BrowserServerBackend in-process
│       ├── extension-server.ts   # HTTP server for extension commands
│       ├── parser.ts             # Command parsing and alias resolution
│       ├── page-scripts.ts       # Text locator and assertion helpers
│       ├── completion-data.ts    # Ghost completion items
│       ├── colors.ts             # ANSI color helpers
│       └── resolve.ts            # COMMANDS map, minimist re-export
├── cli/            # Terminal REPL (TypeScript, tsc)
│   └── src/
│       ├── playwright-repl.ts    # CLI entry point
│       ├── repl.ts               # Interactive readline loop
│       ├── recorder.ts           # Session recording/replay
│       └── index.ts              # Public API exports
└── extension/      # Chrome side panel extension (React, Vite, Tailwind)
    ├── src/
    │   ├── background.ts         # Side panel behavior + recording handlers
    │   ├── panel/                # Side panel UI (React)
    │   │   ├── panel.html
    │   │   ├── panel.tsx         # React entry point
    │   │   ├── panel.css         # Theme variables + residual styles
    │   │   ├── App.tsx           # Root component
    │   │   ├── reducer.ts        # useReducer state management
    │   │   ├── components/       # Toolbar, EditorPane, ConsolePane, etc.
    │   │   ├── hooks/            # useCommandHistory
    │   │   └── lib/              # server, run, autocomplete, filter, etc.
    │   └── content/
    │       └── recorder.ts       # Event recorder injected into pages
    └── public/
        └── manifest.json         # Manifest V3 config
```

## Requirements

- **Node.js** >= 20
- **playwright** >= 1.59.0-alpha (includes `lib/mcp/browser/` engine)

## License

MIT
