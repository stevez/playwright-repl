# <img src="public/icons/dramaturg_icon_128.png" width="48" height="48" align="center"> Dramaturg

Chrome side panel extension that runs the full Playwright API directly inside your browser — no Node.js backend required. Use it as a standalone console, or connect it to the CLI / MCP server.

| Feature | Description |
|---------|-------------|
| **Console** | Auto-detects input type — `.pw` keywords or Playwright API / JavaScript |
| **Script Editor** | Syntax highlighting, pass/fail gutter, autocomplete, run/step/stop |
| **JS Debugger** | Breakpoints, step over/into/out, variables with scope inspection |
| **Element Picker** | Pick elements visually, get locators, assertions, and ARIA snapshots |
| **Recorder** | Captures clicks, fills, navigations as `.pw` commands and Playwright code |
| **Object Tree** | Expandable CDP object tree, like Chrome DevTools |
| **Tab Switcher** | Switch active target to any open tab from the toolbar |
| **Preferences** | Language mode, bridge port, open mode — configurable in Options |
| **Light / Dark** | Toggle themes from toolbar, persisted across sessions |
| **DevTools REPL** | Console-only tab in Chrome DevTools for quick debugging |

## Setup

1. Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa), or build from source:
   ```bash
   npm run build   # from packages/extension/
   ```
   Then open `chrome://extensions` → enable **Developer mode** → **Load unpacked** → select `packages/extension/dist/`
2. Click the **Dramaturg** icon to open the side panel

## Console

Auto-detects what you type and routes it to the right executor:

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

JS mode runs in an async context — top-level `await`, promises, template literals, variables, and IIFEs all work naturally.

Results render as an **expandable object tree** — click any object to lazily fetch its properties.

- **Command history** — Up/Down arrows
- **Autocomplete** — `.pw` keyword and Playwright API ghost-text suggestions
- **Screenshot preview** — inline image with click-to-expand lightbox
- **Ctrl+L / `.clear`** — clear console output

## Script Editor

Write and run multi-line `.pw` scripts or JavaScript directly in the panel:

- **Syntax highlighting** — `.pw` keywords, strings, comments; full JS highlighting in JS mode
- **Autocomplete** — Playwright API and keyword ghost-text suggestions
- **Pass/fail gutter** — check/cross markers per line after execution
- **Run / Step / Stop** — run all lines, step through one at a time, or abort
- **JS debugger** — pauses at each line with inline variable values
- **Open / Save** — load `.pw` or `.js` files from disk; save with timestamp filename
- **Ctrl+Enter** — run the script from keyboard

## Recording

Click **Record**, interact with the page — clicks, hovers, fills, and navigations are captured and inserted into the editor at the cursor:

- **`.pw` commands** — `goto`, `click`, `fill`, `press` — ready to replay
- **JS Playwright code** — `await page.click(...)` — ready to paste into a test

Ambiguous elements are disambiguated with ancestor context (e.g. `click "Save" --in "Settings"`). Iframe elements use the `--frame` flag (e.g. `click "Submit" --frame "#my-iframe"`).

## Tab Management

- **Tab switcher dropdown** — lists all open tabs; switch active target without leaving the panel
- **Auto-attach** — attaches to the active tab automatically when the panel opens
- **Connection status** — color-coded indicator (green / yellow / red)
- **Attach button** — manually re-attach after tab navigation

## Connect to CLI (Bridge Mode)

The extension connects to the CLI bridge server automatically:

```bash
playwright-repl --bridge   # start the CLI bridge server
```

Your terminal becomes a remote console for the browser — commands execute in your real Chrome session.

See [packages/cli/README.md](../cli/README.md) for CLI setup.

## Connect to MCP Server (AI Browser Agent)

The extension connects to the `@playwright-repl/mcp` server for AI-driven automation:

```bash
npm install -g @playwright-repl/mcp
playwright-repl-mcp   # starts the MCP bridge server
```

See [packages/mcp/README.md](../mcp/README.md) for MCP setup.

## What Makes This Unique

Most browser automation tools require a Node.js backend. This extension runs Playwright — `page`, `context`, `expect`, locators, assertions — entirely inside Chrome.

| | Node + Playwright | Chrome DevTools | **Dramaturg** |
|---|---|---|---|
| Runs Playwright | Node process | No | Service worker |
| Full `page.*` API | Yes | No | Yes |
| `expect()` in console | Test runner only | No | Yes, interactively |
| JS in page context | via `page.evaluate` | Yes | Yes |
| CDP object tree | No | Yes | Yes |
| Real attached tab | No (separate launch) | Yes | Yes |

## Architecture

Two technologies make Playwright run inside the browser:

**1. playwright-crx** — replaces Playwright's CDP WebSocket with `chrome.debugger`, enabling the full Playwright API inside a Chrome extension's service worker.

**2. swDebugEval** — the panel evaluates expressions in the service worker's runtime via `chrome.debugger`, where live Playwright globals (`page`, `context`, `expect`) exist.

### Command Execution Pipeline

```
Side Panel (React)
  CommandInput → runAndDispatch()
        │  string: e.g. "click Submit"
        ▼
  commands.ts — parseReplCommand()
  Compiles keyword → jsExpr string
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

### background.ts — Message Types

| Message type | Action |
|---|---|
| `bridge-command` | Parses and executes CLI/MCP commands |
| `attach` | `crxApp.attach(tabId)` — connects to tab |
| `record-start` | Injects recorder into active tab |
| `record-stop` | Disconnects recorder |
| `health` | Returns `{ ok: !!crxApp }` |
| `get-bridge-port` | Returns bridge port from `chrome.storage` |

## Build & Test

```bash
cd packages/extension

# Build
npm run build

# Unit tests (Vitest browser mode)
npm run test

# E2E tests (Playwright)
npm run test:e2e
npx playwright test e2e/panel
npx playwright test e2e/commands
npx playwright test e2e/recording
```
