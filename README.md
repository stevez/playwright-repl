# playwright-repl

![playwright-repl](cover-image.png)

Keyword-driven browser automation powered by Playwright. Use it from **VS Code**, your **terminal**, as a **Chrome extension**, or let an **AI agent** drive it via MCP.

```
pw> goto https://demo.playwright.dev/todomvc/
pw> fill "What needs to be done?" Buy groceries
pw> press Enter
pw> snapshot
pw> click e5
pw> verify text 1 item left
```

Instead of writing `page.locator('[placeholder="What needs to be done?"]').fill('Buy groceries')`, you type `fill "What needs to be done?" Buy groceries`. Same Playwright engine, simpler syntax.

---

## Packages

| Package | Description |
|---------|-------------|
| [Playwright REPL](packages/vscode/README.md) | VS Code extension — Test Explorer, REPL panel, assert builder, element picker |
| [`playwright-repl`](packages/cli/README.md) | CLI — terminal REPL with keyword commands, recording, replay, and piping |
| [Dramaturg](packages/extension/README.md) | Chrome extension — console, script editor, recorder, JS debugger |
| [`@playwright-repl/runner`](packages/runner/README.md) | Test runner — drop-in replacement for `npx playwright test` with context reuse |
| [`@playwright-repl/mcp`](packages/mcp/README.md) | MCP server — AI agents control your real Chrome browser |
| [`@playwright-repl/core`](packages/core/README.md) | Shared parser, servers, and utilities |

---

## VS Code Extension

Test Explorer, interactive REPL, assert builder, and element picker — all inside VS Code.

| Feature | Description |
|---------|-------------|
| **Test Explorer** | Run Playwright tests with persistent browser and context reuse |
| **REPL Panel** | Interactive commands, inline screenshots, execution timing |
| **Locator Panel** | Pick elements visually, highlight toggle, ARIA snapshot |
| **Assert Builder** | 13 matchers, smart filtering by element type, verify against live page |
| **Recorder** | Capture interactions as `.pw` keyword commands or Playwright JavaScript |

**Workflow:** Record → Pick Locator → Assert → Run Test

> **[Full VS Code extension docs](packages/vscode/README.md)**

---

## CLI

Terminal REPL for Playwright. Type a command, see the result.

```bash
npm install -g playwright-repl
playwright-repl --headed
```

```
pw> goto https://demo.playwright.dev/todomvc/
pw> fill "What needs to be done?" Buy groceries
pw> press Enter
pw> verify text 1 item left
pw> screenshot
```

**Two modes:**

| Mode | Flag | How it works |
|------|------|--------------|
| **Standalone** | *(default)* | Launches Chromium via Playwright |
| **Bridge** | `--bridge` | Connects to your real Chrome via Dramaturg extension |

> **[Full CLI docs](packages/cli/README.md)**

---

## pw Commands

The `@playwright-repl/runner` package provides the `pw` CLI:

```bash
npm install -D @playwright-repl/runner
```

```bash
pw test                              # run Playwright tests with context reuse
pw launch --port 9222                # launch Chrome with extension + CDP port
pw repl --port 9222                  # Node REPL with Playwright globals (page, context, browser, expect)
pw repl-extension --bridge-port 9877 # REPL via extension bridge
pw close --port 9222                 # close browser
```

> **[Full runner docs](packages/runner/README.md)**

---

## Dramaturg — Chrome Extension

Chrome side panel extension that runs Playwright directly inside your browser.

Install from the [Chrome Web Store](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa), or build from source.

| Feature | |
|---------|---|
| Console | `.pw` keywords and Playwright JavaScript — auto-detected |
| Script editor | Syntax highlighting, pass/fail gutter, autocompletion |
| JS debugger | Breakpoints, step over/into/out, variables with scope inspection |
| Recorder | Captures interactions as `.pw` commands and Playwright code |
| Object tree | Expandable CDP object tree |

> **[Full extension docs](packages/extension/README.md)**

---

## MCP Server — AI Browser Agent

AI agents control your **real** Chrome session — already logged in, cookies intact.

```bash
npm install -g @playwright-repl/mcp
playwright-repl-mcp
```

| | `@playwright-repl/mcp` | Playwright MCP | Playwriter |
|---|:---:|:---:|:---:|
| Uses your real session | Yes | No | Yes |
| `expect()` assertions | Yes | No | No |
| Full Playwright API | Yes | Yes | Yes |
| JS eval (`page.evaluate`) | Yes | No | Yes |

> **[Full MCP docs](packages/mcp/README.md)**

---

## Monorepo Structure

```
packages/
├── vscode/         # Playwright REPL — VS Code extension
├── cli/            # playwright-repl — terminal REPL
├── runner/         # @playwright-repl/runner — test runner (pw CLI)
├── extension/      # Dramaturg — Chrome side panel extension
├── mcp/            # @playwright-repl/mcp — MCP server for AI agents
└── core/           # @playwright-repl/core — shared parser, servers, utilities
```

## Requirements

- **Node.js** >= 20
- **Playwright** >= 1.59

## License

MIT
