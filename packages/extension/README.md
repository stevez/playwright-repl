# <img src="public/icons/dramaturg_icon_128.png" width="48" height="48" align="center"> Dramaturg (@playwright-repl/extension)

Chrome side panel extension that runs the full Playwright API directly inside your browser — no Node.js backend, no external server required. Use it as a standalone automation console, or connect it to the CLI for terminal-driven control.

| Feature | Description |
|---------|-------------|
| 🧠 **Mode Detection** | Console auto-detects input type — `.pw` keyword or Playwright API / JavaScript (`await page.*`, `1 + 1`) — no prefix needed |
| 🎬 **Record** | Capture clicks, fills, and navigations — generates `.pw` commands and JS Playwright code, inserted into the editor live |
| ▶ **Run** | Run scripts line-by-line with pass/fail gutter indicators |
| 🐛 **Debug** | Step Over / Step Into / Step Out / Continue with breakpoints, inline variable values, and a Variables tab showing scope variables |
| 📂 **Load / Save** | Open `.pw` or `.js` files from disk; save editor content with one click |
| 🔗 **Auto-attach** | Automatically attaches to the active tab when the panel opens |
| 🗂 **Tab Switcher** | Switch the active browser target to any open tab from the toolbar dropdown |
| 🌳 **Object Tree** | Console results render as an expandable object tree with lazy property loading |
| 🖼 **Screenshot Preview** | Screenshot commands display the image inline; click to expand full-size |
| 🌳 **Snapshot Tree** | `snapshot` renders as an expandable accessibility tree — click nodes to expand/collapse |
| ✨ **Autocomplete** | `.pw` keyword and Playwright API (`page.*`, `expect()`) ghost-text suggestions in both console and editor |
| 📖 **Help** | `help` shows categorized commands; `help click` for per-command help; `help js` for Playwright API reference |
| ⚙️ **Preferences** | Default language mode (`.pw` or JS), bridge port, and open mode — configurable in Options |
| 🌗 **Light / Dark Mode** | Toggle between light and dark themes from the toolbar, persisted across sessions |
| 🪟 **Side Panel & Popup** | Opens as a Chrome side panel by default; switch to a standalone popup window in Options |
| ⚡ **Fast** | Commands execute directly via CDP in the service worker — no Node.js roundtrip, near-instant response |

## Setup

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa), or build from source:
   ```bash
   npm run build   # from packages/extension/
   ```
   Then open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `packages/extension/dist/`
3. Click the **Dramaturg** icon to open the side panel (or popup — configure in Options)

## Features

### Console — two input modes, one input

The Console tab auto-detects what you type and routes it to the right executor:

| What you type | Mode | Runs in |
|---|---|---|
| `goto`, `click`, `snapshot`, ... | **Keyword** | Playwright via service worker |
| `await page.title()`, `1 + 1`, `fetch(...)` | **Playwright API / JS** | Service worker (`page`, `context`, `expect` available) |

```
> snapshot                                    ← keyword command
→ ### Page ...

> await page.locator('h1').textContent()      ← Playwright API
→ "Fast and reliable end-to-end testing"

> await page.evaluate(() => document.title)   ← DOM access via page.evaluate
→ "Playwright"
```

JS mode runs in an async context, so top-level `await` works naturally — along with promises, template literals, variables, and more:

```
> const title = await page.title()               ← top-level await + const
→ "Playwright"

> `The title is: ${title}`                        ← template literals
→ "The title is: Playwright"

> await fetch('https://api.example.com').then(r => r.json())   ← promises
→ { status: "ok" }

> let items = await page.locator('li').all()      ← let (scoped per input)
> items.length
→ 5

> (() => { let sum = 0; for (let i = 0; i < 10; i++) sum += i; return sum })()   ← IIFE
→ 45

> (async () => {                                  ← async IIFE (multi-line)
    const el = await page.locator('h1');
    return (await el.textContent()).toUpperCase();
  })()
→ "PLAYWRIGHT"
```

Results are rendered as an **expandable object tree** — click any object to lazily fetch its properties, just like Chrome DevTools.

- **Command history** — Up/Down arrows cycle through previous commands
- **Autocomplete** — `.pw` keyword and Playwright API (`page.*`, `expect()`) ghost-text suggestions
- **Screenshot preview** — inline image with click-to-expand lightbox
- **Ctrl+L / `.clear`** — clear console output

### Script Editor

Write and run multi-line `.pw` scripts or JavaScript (Playwright API, DOM) directly in the panel:

- **Syntax highlighting** — `.pw` keywords, strings, comments; full JS highlighting in JS mode
- **Autocomplete** — Playwright API ghost-text suggestions in JS mode; `.pw` keyword suggestions in keyword mode
- **Auto-closing brackets** — parentheses, brackets, and quotes close automatically
- **Pass/fail gutter** — ✓/✗ markers per line after execution
- **Run / Step / Stop** — run all lines, step through one at a time, or abort
- **JS step debugger** — pauses at each line with inline variable values, resumes on Step
- **Open / Save** — load `.pw` or `.js` files from disk; save with timestamp filename
- **Ctrl+Enter** — run the script from keyboard

### Recording

Click **Record**, interact with the page — clicks, hovers, fills, and navigations are captured automatically and inserted into the editor at the cursor in two formats:

- **`.pw` commands** — `goto`, `click`, `fill`, `press` — ready to replay with the CLI or extension
- **JS Playwright code** — `await page.click(...)` — ready to paste into a Playwright test

Ambiguous elements are automatically disambiguated with ancestor context (e.g. `click "Save" --in "Settings"`).

> Recording captures only human interactions — not AI-driven or programmatic commands.

### Tab Management

- **Tab switcher dropdown** — lists all open tabs; switch active target without leaving the panel
- **Auto-attach** — attaches to the active tab automatically when the panel opens
- **Connection status** — color-coded indicator (green / yellow / red) with tooltip
- **Attach button** — manually re-attach after tab navigation or detach

### Preferences

- **Bridge port** — configure the WebSocket port for CLI / MCP server connection (default `9876`)
- **Open mode** — side panel (default) or popup window
- **Dark mode toggle** — sun/moon button in toolbar, persisted across sessions

## Connect to CLI (Bridge Mode)

The extension can act as the browser end of a CLI terminal session:

```bash
playwright-repl --bridge   # start the CLI bridge server
```

The extension connects automatically — no need to open the side panel. Your terminal becomes a remote console for the browser — type commands in the CLI, they execute in your real Chrome session.

See [packages/cli/README.md](../cli/README.md) for CLI setup.

## Connect to MCP Server (AI Browser Agent)

The extension also connects to the `@playwright-repl/mcp` server, letting AI agents like Claude control your real browser:

```bash
npm install -g @playwright-repl/mcp
playwright-repl-mcp   # starts the MCP bridge server
```

The extension connects automatically — no side panel needed. The AI agent can then call `run_command` to execute single commands, or `run_script` to run multi-line scripts in your real Chrome session.

See [packages/mcp/README.md](../mcp/README.md) for full MCP setup and Claude Desktop / Claude Code configuration.

## What Makes This Unique

Most browser automation tools require a Node.js backend. This extension runs the full Playwright API — `page`, `context`, `expect`, locators, assertions — entirely inside Chrome, with zero backend.

| | Node + Playwright | Chrome DevTools | **Dramaturg** |
|---|---|---|---|
| Runs Playwright | ✅ Node process | ❌ | ✅ Service worker |
| Full `page.*` API | ✅ | ❌ | ✅ |
| `expect()` in console | ✅ (test runner only) | ❌ | ✅ interactively |
| JS in page context | via `page.evaluate` | ✅ | ✅ |
| CDP object tree | ❌ | ✅ | ✅ |
| Real attached tab | ❌ (separate launch) | ✅ | ✅ |

### Performance

Commands execute directly via CDP in the service worker — no Node.js roundtrip. Enable `log time on` in the console to see execution times.

| Command | Time |
|---------|------|
| `goto https://demo.playwright.dev/todomvc` | 305ms |
| `snapshot` | 6ms |
| `fill "What needs to be done?" "Buy milk"` | 14ms |
| `press Enter` | 12ms |
| `screenshot` | 87ms |
| `hover "What needs to be done?"` | 38ms |
| `click "Walk dog"` | 33ms |
| `console` | 4ms |
| `network` | 4ms |
| `tab-list` | 4ms |
| `go-back` | 196ms |

---

## Architecture

### How it works

Two technologies make Playwright run inside the browser:

**1. playwright-crx** — replaces Playwright's CDP WebSocket with `chrome.debugger`, allowing the full Playwright API to run inside a Chrome extension's service worker. When you open the panel, `crxApp.attach(tabId)` connects to the active tab and sets `page`, `context`, and `expect` as live globals in the service worker.

**2. swDebugEval** — the panel and service worker are separate JS contexts. To call Playwright objects, the panel uses `chrome.debugger` a second time — attaching to the service worker itself and evaluating expressions in its runtime, where the live Playwright globals exist.

### Command Execution Pipeline

```
Side Panel (React)
  CommandInput → runAndDispatch()
        │  string: e.g. "click Submit"
        ▼
  commands.ts — parseReplCommand()
  Compiles keyword → jsExpr string
  "click Submit" → "return await refAction(page, 'Submit', 'click')"
        │
        ▼
  bridge.ts — executeCommand()
  Calls swDebugEval(jsExpr)
        │  chrome.debugger.sendCommand('Runtime.evaluate')
        ▼
  Service Worker (background.ts)
  Live globals: page, context, crxApp, expect
        │  playwright-crx (CDP)
        ▼
  Chrome tab
```

### background.ts — Lifecycle + Bridge

| Message type | Action |
|---|---|
| `bridge-command` | Parses and executes CLI/MCP commands via self-debug eval |
| `attach` | `crxApp.attach(tabId)` — connects playwright-crx to the tab |
| `record-start` | Injects recorder into the active tab |
| `record-stop` | Disconnects recorder port |
| `health` | Returns `{ ok: !!crxApp }` |
| `get-bridge-port` | Returns bridge port from `chrome.storage` (for offscreen doc) |

### File Structure

```
src/
├── background.ts           # Service worker — lifecycle (attach, record, health, CDP)
├── commands.ts             # Keyword → jsExpr compiler
├── page-scripts.ts         # Serializable helper functions (locators, assertions, tabs)
└── panel/
    ├── panel.html
    ├── panel.tsx           # React root
    ├── App.tsx             # Root component — auto-attach, tab listener
    ├── reducer.ts          # useReducer — console lines, loading state
    ├── components/
    │   ├── Toolbar.tsx     # Record button, attach status, tab switcher
    │   ├── CommandInput.tsx # CodeMirror 6 REPL input with autocomplete + history
    │   ├── ConsolePane.tsx  # Output lines
    │   ├── EditorPane.tsx   # Multi-line script editor
    │   └── Console/        # Object tree renderer
    └── lib/
        ├── bridge.ts       # executeCommand — parses + calls swDebugEval
        ├── run.ts          # runAndDispatch — local commands + bridge + dispatch
        ├── sw-debugger.ts  # swDebugEval — chrome.debugger evaluation in SW context
        ├── cm-input-setup.ts # CodeMirror 6 extensions (autocomplete, keymaps, history)
        ├── command-history.ts # Persistent localStorage command history
        └── filter.ts       # Response filtering
```

## Build & Test

```bash
# Build
cd packages/extension
npm run build

# Unit tests (Vitest browser mode)
npm run test

# E2E tests (Playwright — loads real extension in Chromium)
npm run test:e2e
npx playwright test e2e/panel
npx playwright test e2e/commands
npx playwright test e2e/recording
```
