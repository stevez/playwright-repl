# @playwright-repl/mcp

MCP server that lets AI agents (Claude Desktop, Claude Code, or any MCP client) automate a browser using playwright-repl keyword commands and JavaScript.

Two modes:
- **Standalone mode** (default) — launches Chromium directly, full Playwright API
- **Relay mode** (`--relay`) — connects to your existing Chrome via CDP relay

## Why

Most browser MCP servers launch a separate browser instance — a clean context with no history, no cookies, no authentication.

**`@playwright-repl/mcp` is different in relay mode.** It connects to your real Chrome — your sessions, cookies, and logins are already there.

### vs. other browser MCP servers

| | `@playwright-repl/mcp` | Playwright MCP | Playwriter |
|---|:---:|:---:|:---:|
| MCP tools exposed | **2** (`run_command` + `run_script`) | ~70 tools | **1** `execute` |
| Uses your real session | ✅ (relay) | ❌ | ✅ |
| `expect()` assertions | ✅ | ❌ | ❌ |
| Full Playwright API | ✅ | ✅ | ✅ |
| JS/DOM eval | ✅ | ❌ | ✅ |

## Architecture

### Standalone mode (default)

```
Claude Desktop / Claude Code (or any MCP client)
  ↕ MCP (stdio)
playwright-repl MCP server
  ↕ direct Playwright API
Chromium (launched by server)
```

### Relay mode (`--relay`)

```
Claude Desktop / Claude Code (or any MCP client)
  ↕ MCP (stdio)
playwright-repl MCP server
  ↕ CDP relay
Your existing Chrome browser
```

## Setup

### 1. Install the MCP server

```bash
npm install -g @playwright-repl/mcp
```

### 2. Configure your MCP client

**Claude Desktop** — add to `claude_desktop_config.json`:

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Standalone mode (launches browser):

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

**Claude Code** — run once:

```bash
claude mcp add playwright-repl playwright-repl-mcp -- --standalone --headed
```

## Tool: `run_command`

### Keyword commands (`.pw` syntax)

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

### Playwright API / JavaScript

```
await page.url()
await page.title()
await page.locator('button').count()
await page.getByRole('link', { name: 'Get started', exact: true }).click()
await page.evaluate(() => document.title)
```

## Tool: `run_script`

Batch execution for multi-line scripts.

### Keyword script (`language="pw"`)

```
goto https://demo.playwright.dev/todomvc/
fill "What needs to be done?" "Buy groceries"
press Enter
verify-text "Buy groceries"
```

### JavaScript (`language="javascript"`)

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

### Setup

```bash
mkdir -p .claude/agents
cp node_modules/@playwright-repl/mcp/agents/*.agent.md .claude/agents/
```

## HTTP Server

The MCP server also starts an HTTP server on port `9223` for fast CLI command access:

```bash
curl -X POST http://localhost:9223/run -d '{"command":"snapshot"}'
```

## Tips for AI agents

- **Call `snapshot` to understand the page** — it returns the accessibility tree with element refs (`e1`, `e5`, …)
- **Use `screenshot` to verify state** — especially after navigation
- **Prefer keyword commands** for common actions — shorter and more reliable
- **Fall back to Playwright API** when keywords are ambiguous
