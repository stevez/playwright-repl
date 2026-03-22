# @playwright-repl/mcp

MCP server that lets AI agents (Claude Desktop, Claude Code, or any MCP client) automate a browser using playwright-repl keyword commands.

Two modes:
- **Bridge mode** (default) — controls your real Chrome browser through the **Dramaturg** Chrome extension
- **Standalone mode** (`--standalone`) — launches its own browser via Playwright, no extension needed

## Why

Most browser MCP servers work by launching a separate browser instance — a clean, isolated context with no history, no cookies, no authentication. They control the browser from the outside using Node.js running Playwright.

**`@playwright-repl/mcp` is different.**

It consists of two parts working together: **Dramaturg** (a Chrome extension that runs Playwright inside your existing Chrome session), and a MCP server that gives AI agents a natural language interface to control it.

**Your real browser. Your real sessions.**

- **No re-authentication** — Gmail, Notion, Salesforce, your banking portal — already logged in, ready to automate
- **No separate browser window** — AI works in the browser you're already using
- **No ephemeral context** — cookies, localStorage, session tokens — all intact

### vs. other browser MCP servers

| | `@playwright-repl/mcp` | Playwright MCP | Playwriter |
|---|:---:|:---:|:---:|
| MCP tools exposed | **2** (`run_command` + `run_script`) | ~70 tools | **1** `execute` |
| Uses your real session | ✅ | ❌ | ✅ |
| Playwright runs inside browser | ✅ | ❌ | ❌ |
| `expect()` assertions | ✅ | ❌ | ❌ |
| Full Playwright API | ✅ | ✅ | ✅ |
| JS/DOM eval | ✅ | ❌ | ✅ |

> Playwright MCP and Playwriter control Chrome from outside via CDP relay. `@playwright-repl/mcp` runs Playwright natively inside Chrome via `playwright-crx` — enabling `expect()`, recording, and a full DevTools panel alongside AI.

## Architecture

### Bridge mode (default)

```
Claude Desktop / Claude Code (or any MCP client)
  ↕ MCP (stdio)
playwright-repl MCP server
  ↕ WebSocket bridge
Chrome extension (offscreen document → service worker)
  ↕ CDP / chrome.debugger
Playwright running in your real Chrome session
```

### Standalone mode (`--standalone`)

```
Claude Desktop / Claude Code (or any MCP client)
  ↕ MCP (stdio)
playwright-repl MCP server
  ↕ Engine.run() (in-process)
Playwright BrowserServerBackend
  ↕ CDP
Browser (launched by Playwright)
```

## Setup

### 1. Install the MCP server

```bash
npm install -g @playwright-repl/mcp
```

### 2. Choose a mode

#### Bridge mode (default) — use your real Chrome session

Install Dramaturg (Chrome extension):

Load `packages/extension/dist/` as an unpacked extension in Chrome (`chrome://extensions` → Enable Developer mode → Load unpacked).

Or install from the [Chrome Web Store](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa).

#### Standalone mode — no extension needed

Add `--standalone` to the MCP server command. The server launches its own browser via Playwright.

- Default: headless. Add `--headed` to show the browser window.
- Only `.pw` keyword commands are supported (no raw Playwright API or JavaScript expressions). Use `run-code` or `eval` keywords within `.pw` mode for Playwright API / JS.

### 3. Configure your MCP client

**Claude Desktop** — add to `claude_desktop_config.json`:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Bridge mode:

```json
{
  "mcpServers": {
    "playwright-repl": {
      "command": "playwright-repl-mcp"
    }
  }
}
```

Standalone mode:

```json
{
  "mcpServers": {
    "playwright-repl": {
      "command": "playwright-repl-mcp",
      "args": ["--standalone", "--headed"]
    }
  }
}
```

Restart Claude Desktop after saving.

**Claude Code** — run once in a terminal:

```bash
# Bridge mode
claude mcp add playwright-repl playwright-repl-mcp

# Standalone mode
claude mcp add playwright-repl playwright-repl-mcp -- --standalone --headed
```

### 4. Connect

**Bridge mode:** The extension connects to the MCP server automatically — no need to open the side panel. Just make sure Chrome is running with the Dramaturg extension installed.

**Standalone mode:** The browser launches automatically on the first command. No extension needed.

## Dramaturg — The Extension

Dramaturg is the other half of the system — it's what gives the MCP server access to your real browser session.

### What the extension does

- **Runs Playwright inside Chrome** — uses `playwright-crx` and `chrome.debugger` to execute commands directly in your existing session, no separate browser needed. Because Playwright runs inside the browser rather than relaying through an external process, the entire AI → command → result loop is faster.
- **Connects automatically** — a persistent offscreen document maintains the WebSocket connection to the MCP server; reconnects if the connection drops. No side panel needed.
- **Auto-attaches** — on the first command, automatically attaches to the active Chrome tab
- **Executes commands** — receives `run_command` calls from the AI and runs them against the active tab

### Using the extension alongside AI

The extension panel is more than just a bridge — it's a full REPL you can use at the same time as the AI:

- **Watch AI commands execute** — the panel stays open while Claude drives the browser; you can see the page react in real time
- **Intervene manually** — type a command in the panel console at any time, e.g. `snapshot` to check state or `goto` to navigate while the AI pauses
- **Script editor** — write and run multi-line `.pw` or JS scripts side-by-side with AI automation; useful for building test flows interactively
- **Tab switcher** — the toolbar dropdown lets you switch the panel (and the MCP server's active target) to any open tab
- **Record your own flows** — stop the AI, click **Record**, interact with the page yourself to capture a `.pw` script, then hand it back to Claude for replay or modification. Recording only captures human interactions, not AI-driven commands.

### Connection status

The extension connects to the MCP server on port `9876` by default. To check or change the port: extension icon → **Options** → **Bridge Port**. Changes take effect after reopening the panel.

When the extension is connected, the MCP server logs `Extension connected` to stderr. When Chrome is not open or the extension is not installed, `run_command` returns: `Browser not connected. Open Chrome with Dramaturg — it connects automatically.`

## Tool: `run_command`

### Keyword commands (`.pw` syntax)

Both modes support `.pw` keyword commands:

```
snapshot                              # accessibility tree — always start here
goto https://example.com             # navigate
click Submit                         # click by text/label
fill "Email" user@example.com        # fill a form field
press Enter                          # key press
verify-text Welcome                  # assert text is visible
screenshot                           # capture page (returned as image to AI)
check "Remember me"                  # check a checkbox
select "Country" "United States"     # select dropdown option
localstorage-list                    # list localStorage
```

### Playwright API / JavaScript (bridge mode only)

In bridge mode, `run_command` also accepts raw Playwright expressions and JavaScript:

```
await page.url()
await page.title()
await page.locator('button').count()
await page.getByRole('link', { name: 'Get started', exact: true }).click()
await page.evaluate(() => document.title)
await page.evaluate(() => document.querySelectorAll('a').length)
```

> In standalone mode, use the `run-code` or `eval` keywords to run Playwright API / JavaScript:
> `run-code await page.url()` or `eval document.title`.

## Tool: `run_script`

Batch execution for multi-line scripts.

### Keyword script (`language="pw"`)

Splits by line, runs each command sequentially, returns ✓/✗ per line. Lines starting with `#` are skipped. Stops on first error.

```
goto https://demo.playwright.dev/todomvc/
fill "What needs to be done?" "Buy groceries"
press Enter
verify-text "Buy groceries"
```

> In standalone mode, `run_script` only accepts `.pw` keyword scripts (no `language` parameter needed).

### JavaScript (`language="javascript"`) — bridge mode only

Runs the entire block as one evaluation — use for Playwright API with assertions:

```js
await page.goto('https://demo.playwright.dev/todomvc/');
await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
await page.keyboard.press('Enter');
await expect(page.getByText('Buy groceries')).toBeVisible();
```

## AI Agents

The MCP package includes four ready-to-use AI agents in `packages/mcp/agents/`:

| Agent | Purpose |
|-------|---------|
| **playwright-repl-planner** | Explore a web page and create a comprehensive workflow plan |
| **playwright-repl-generator** | Turn a plan or description into a working `.pw` or JS script |
| **playwright-repl-healer** | Debug and fix a failing script |
| **playwright-repl-converter** | Convert scripts between `.pw` keyword syntax and JavaScript |

### playwright-repl-planner

Systematically explores a web page — takes snapshots, screenshots, maps out navigation, forms, and interactive elements — and produces a structured workflow plan. Use it as the first step before generating a script: give it a URL and a goal, and it returns a step-by-step plan with the exact text/labels discovered on the page.

### playwright-repl-generator

Takes a workflow plan (from the planner or your own description) and turns it into a working `.pw` keyword script or JavaScript Playwright script. It executes each step in the real browser, assembles the commands, runs the full script via `run_script`, and iterates until it passes. Output is a tested, ready-to-use script.

### playwright-repl-healer

Debugs and fixes a failing `.pw` or JS script. Give it a script that's broken — wrong selectors, timing issues, changed page structure — and it will run it, diagnose failures using snapshots and screenshots, fix the commands, and re-run until all lines pass.

### playwright-repl-converter

Converts scripts between `.pw` keyword syntax and JavaScript Playwright API. Includes a comprehensive conversion reference table and produces idiomatic output — chaining `.press()` to locators instead of `page.keyboard`, extracting repeated locators into variables, and choosing the right locator strategy (`getByRole`, `getByLabel`, `getByText`, etc.) based on the actual page structure.

### Setup

Copy the agent files into your project's `.claude/agents/` folder:

```bash
mkdir -p .claude/agents
cp node_modules/@playwright-repl/mcp/agents/*.agent.md .claude/agents/
```

Then invoke them with `@agent-name`:

```
@playwright-repl-planner explore https://demo.playwright.dev/todomvc and plan a test for adding/completing todos
@playwright-repl-generator create a .pw script from this plan: [paste plan]
@playwright-repl-healer fix this script: [paste failing script]
@playwright-repl-converter convert this .pw script to JavaScript: [paste script]
```

Each agent has access to `run_command` and `run_script` via the MCP server and runs autonomously — exploring the page, executing commands, and iterating until the output is verified.

## Tips for AI agents

- **Call `snapshot` to understand the page** — it returns the accessibility tree with element refs (`e1`, `e5`, …) that you can use with `click`, `fill`, etc. Useful before interacting with an unfamiliar page.
- **Use `screenshot` to verify state** — especially after navigation or complex interactions
- **Prefer keyword commands** for common actions — they're shorter and more reliable than raw Playwright API
- **Fall back to Playwright API** when keyword commands are ambiguous (e.g. two elements match the same text) — use `exact: true` or scope with a locator chain

## Custom port

By default the MCP server listens on port `9876`. To use a different port:

**Claude Desktop** — via args or env in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "playwright-repl": {
      "command": "playwright-repl-mcp",
      "args": ["--port", "9877"]
    }
  }
}
```

```json
{
  "mcpServers": {
    "playwright-repl": {
      "command": "playwright-repl-mcp",
      "env": { "BRIDGE_PORT": "9877" }
    }
  }
}
```

`--port` takes precedence over `BRIDGE_PORT`. Default is `9876`.

Update Dramaturg's Bridge Port setting to match (Dramaturg icon → Options → Bridge Port).

> **Note:** Claude Desktop and Claude Code cannot run simultaneously on the same port — close one before opening the other.
