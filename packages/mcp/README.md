# @playwright-repl/mcp

MCP server that lets AI agents (Claude Desktop, Claude Code, or any MCP client) control your real Chrome browser through the **Dramaturg** Chrome extension.

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

```
Claude Desktop / Claude Code (or any MCP client)
  ↕ MCP (stdio)
playwright-repl MCP server
  ↕ WebSocket bridge
Chrome extension (offscreen document → service worker)
  ↕ CDP / chrome.debugger
Playwright running in your real Chrome session
```

## Setup

### 1. Install the MCP server

```bash
npm install -g @playwright-repl/mcp
```

### 2. Install Dramaturg (Chrome extension)

Load `packages/extension/dist/` as an unpacked extension in Chrome (`chrome://extensions` → Enable Developer mode → Load unpacked).

Or install from the Chrome Web Store (coming soon).

### 3. Configure your MCP client

**Claude Desktop** — add to `claude_desktop_config.json`:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "playwright-repl": {
      "command": "playwright-repl-mcp"
    }
  }
}
```

Restart Claude Desktop after saving.

**Claude Code** — run once in a terminal:

```bash
claude mcp add playwright-repl playwright-repl-mcp
```

### 4. Connect

The extension connects to the MCP server automatically — no need to open the side panel. Just make sure Chrome is running with the Dramaturg extension installed.

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

One tool, two input modes:

### Keyword commands (`.pw` syntax)

```
snapshot                              # accessibility tree — always start here
goto https://example.com             # navigate
click Submit                         # click by text/label
fill "Email" user@example.com        # fill a form field
press Enter                          # key press
verify-text Welcome                  # assert text is visible
screenshot                           # capture page (returned as image to AI)
scroll-down                          # scroll
check "Remember me"                  # check a checkbox
select "Country" "United States"     # select dropdown option
localstorage-list                    # list localStorage
```

### Playwright API / JavaScript

```
await page.url()
await page.title()
await page.locator('button').count()
await page.getByRole('link', { name: 'Get started', exact: true }).click()
await page.evaluate(() => document.title)
await page.evaluate(() => document.querySelectorAll('a').length)
```

## Tool: `run_script`

Batch execution for multi-line scripts. Two language modes:

### Keyword script (`language="pw"`)

Splits by line, runs each command sequentially, returns ✓/✗ per line:

```
goto https://demo.playwright.dev/todomvc/
fill "What needs to be done?" "Buy groceries"
press Enter
verify-text "Buy groceries"
```

### JavaScript (`language="javascript"`)

Runs the entire block as one evaluation — use for Playwright API with assertions:

```js
await page.goto('https://demo.playwright.dev/todomvc/');
await page.getByPlaceholder('What needs to be done?').fill('Buy groceries');
await page.keyboard.press('Enter');
await expect(page.getByText('Buy groceries')).toBeVisible();
```

## Prompt: `generate-test`

A prompt template that guides the AI to generate a passing Playwright test from a described scenario.

**Args:**
- `steps` (required) — describe the test scenario, e.g. "log in with email/password, verify the dashboard loads". Also accepts pasted `.pw` scripts.
- `url` (optional) — URL to navigate to first.

**In Claude Desktop:** click "+" → select `generate-test` → fill in the form → send.

**In Claude Code:** `/mcp__playwright-repl__generate-test`

The AI navigates the page, takes snapshots, writes Playwright assertions, runs them via `run_script(language="javascript")`, and iterates until all pass.

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
