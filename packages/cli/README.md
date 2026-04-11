# playwright-repl

Interactive terminal REPL for browser automation powered by Playwright. Supports keyword commands and JavaScript.

```bash
npm install -g playwright-repl
playwright-repl
```

```
pw> goto https://demo.playwright.dev/todomvc/
pw> fill "What needs to be done?" Buy groceries
pw> press Enter
pw> await page.title()
pw> verify text 1 item left
pw> screenshot
```

## Install

```bash
npm install -g playwright-repl

# Install Chromium (needed for standalone mode)
npx playwright install chromium
```

## Connection Modes

| Mode | Flag | How it works |
|------|------|--------------|
| **Standalone** | *(default)* | Launches Chromium with Dramaturg extension — keyword + JS |
| **Bridge** | `--bridge` | Connects to your real Chrome via Dramaturg extension — cookies and logins intact |

### Standalone

Launches Chromium with the Dramaturg extension pre-installed. Headed by default — use `--headless` for CI/scripting. Supports both keyword commands and JavaScript.

```bash
playwright-repl                # headed (default)
playwright-repl --headless     # headless for CI/scripting
```

### Bridge

The bridge mode turns your terminal into a remote console for the Chrome extension. Commands run inside your real Chrome with your existing cookies and logins.

```bash
playwright-repl --bridge                      # start bridge server, wait for extension
playwright-repl --bridge --replay script.pw   # replay a script via bridge
playwright-repl --bridge --replay examples/   # replay all .pw files
playwright-repl --bridge --bridge-port 9877   # custom port (default 9876)
playwright-repl --bridge --command "snapshot"  # run one command and exit
```

The extension connects automatically — no need to open the side panel.

> Requires the [Dramaturg Chrome extension](../extension/README.md).

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

# Run a single command and exit
playwright-repl --bridge --command "snapshot"

# Pipe commands
echo -e "goto https://example.com\nsnapshot" | playwright-repl
```

## Input Modes

| Mode | Standalone | Bridge |
|------|:---:|:---:|
| **Keyword** — `click "Sign in"`, `goto https://...` | Yes | Yes |
| **Playwright API / JS** — `await page.title()`, `1 + 1` | Yes | Yes |

Both modes auto-detect keyword commands and JavaScript expressions. For DOM access use `await page.evaluate(() => document.title)`. For keyword commands, see [Command Reference](#command-reference).

## CLI Options

| Option | Description |
|--------|-------------|
| `--headless` | Run browser in headless mode (default: headed) |
| `--bridge` | Connect to existing Chrome via WebSocket bridge |
| `--bridge-port <port>` | Bridge server port (default: `9876`) |
| `--command <cmd>` | Run a single command, print output, and exit |
| `--config <file>` | Path to config file |
| `--replay <files...>` | Replay `.pw` or `.js` file(s) or folder(s) |
| `--record <file>` | Start REPL with recording to file |
| `--step` | Pause between commands during replay |
| `-q, --silent` | Suppress banner and status messages |
| `-h, --help` | Show help |

## REPL Meta-Commands

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
| `.history` | Show session command history |
| `.clear` | Clear the console output |
| `.exit` | Exit REPL (also Ctrl+D) |

## Recording & Replay

Record browser interactions and replay them later — great for regression tests, onboarding demos, or CI smoke tests.

### Record

```bash
# From CLI flag
playwright-repl --record my-test.pw --headed

# Or inside the REPL
pw> .record my-test
⏺ Recording to my-test.pw
pw> goto https://demo.playwright.dev/todomvc/
pw> fill "What needs to be done?" Buy groceries
pw> press Enter
pw> verify text 1 item left
pw> .save
✓ Saved 4 commands to my-test.pw
```

### Replay

```bash
# Full speed
playwright-repl --replay my-test.pw

# Step-through (press Enter between commands)
playwright-repl --replay my-test.pw --step --headed

# Replay all .pw files in a folder
playwright-repl --replay examples/ --silent

# Inside the REPL
pw> .replay my-test.pw
```

Multi-file replay runs all files sequentially, writes a `replay-<timestamp>.log`, and prints a pass/fail summary. Exit code 0 if all pass, 1 if any fail.

### .pw File Format

Plain text — human-readable, diffable, version-controllable:

```
# CI smoke test
# App: https://demo.playwright.dev/todomvc/

goto https://demo.playwright.dev/todomvc/
fill "What needs to be done?" Buy groceries
press Enter
verify text Buy groceries
verify text 1 item left
```

## Examples

| File | Description |
|------|-------------|
| [01-add-todos.pw](examples/01-add-todos.pw) | Add todos and verify with assertions |
| [02-complete-and-filter.pw](examples/02-complete-and-filter.pw) | Complete todos, use filters |
| [03-record-session.pw](examples/03-record-session.pw) | Record a test session |
| [04-replay-session.pw](examples/04-replay-session.pw) | Replay with step-through |
| [05-ci-pipe.pw](examples/05-ci-pipe.pw) | CI smoke test |
| [06-edit-todo.pw](examples/06-edit-todo.pw) | Double-click to edit a todo |
| [07-test-click-nth.pw](examples/07-test-click-nth.pw) | `--nth` disambiguation |
| [08-localstorage.pw](examples/08-localstorage.pw) | localStorage commands |
| [09-inspection-commands.pw](examples/09-inspection-commands.pw) | Inspection commands |
| [10-video-recording.pw](examples/10-video-recording.pw) | Video recording with chapters |

```bash
playwright-repl --replay examples/01-add-todos.pw --headed
playwright-repl --replay examples/ --silent
```

## Requirements

- Node.js >= 20
- `playwright` >= 1.59

---

## Command Reference

Short aliases are CLI-only.

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

### Locator Flags

All text-based interaction commands support `--nth` and `--exact`:

| Flag | Description |
|------|-------------|
| `--nth <n>` | Select the nth visible match (0-indexed) |
| `--exact` | Exact text match only — skip the fallback chain |

```
pw> click "Submit" --nth 0           # click the first "Submit"
pw> click "Submit" --exact           # only exact text match, no fuzzy fallback
pw> fill "Email" "test" --exact      # fill only if label is exactly "Email"
pw> highlight "npm"                  # show all matches (returns count)
→ Highlighted 24 elements
pw> highlight "npm" --exact          # only exact "npm", not "pnpm"
→ Highlighted 2 elements
pw> highlight "npm" --nth 0          # highlight just the first match
→ Highlighted 1 of 24
pw> highlight --clear                # dismiss the highlight overlay
→ Cleared
```

### Inspection

| Command | Alias | Description |
|---------|-------|-------------|
| `snapshot` | `s` | Accessibility tree with element refs |
| `screenshot` | `ss` | Take a screenshot (saved to file) |
| `highlight <text\|selector>` | `hl` | Highlight matching elements on page |
| `eval <expr>` | `e` | Evaluate JavaScript in browser context |
| `console` | `con` | Browser console messages |
| `network` | `net` | Network requests log |
| `run-code <code>` | — | Run Playwright code with `page` object |

### Assertions

| Command | Alias | Description |
|---------|-------|-------------|
| `verify text <text>` | `vt` | Verify text is visible on page |
| `verify no-text <text>` | `vnt` | Verify text is not visible |
| `verify element <role> <name>` | `ve` | Verify element exists by role and name |
| `verify value <ref> <value>` | `vv` | Verify input/select/checkbox value |
| `verify list <ref> <items>` | `vl` | Verify list contains expected items |

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

### Video Recording

| Command | Description |
|---------|-------------|
| `video-start [--size WxH]` | Start video recording |
| `video-stop` | Stop recording and save video |
| `video-chapter <title>` | Add chapter marker to recording |

In **standalone mode**, video uses Playwright's screencast API and saves to `~/pw-videos/`.
In **bridge mode**, video uses Chrome's tab capture and saves to `Downloads/pw-videos/`.

### Browser Control

| Command | Alias | Description |
|---------|-------|-------------|
| `close` | `q` | Close the browser |
| `config-print` | — | Print browser config |
