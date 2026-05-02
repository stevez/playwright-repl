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
| [`@playwright-repl/core`](packages/core/README.md) | Shared parser, relay server, and utilities |

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

Terminal REPL for Playwright. Supports keyword commands and JavaScript.

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

Launches Chromium directly with full Playwright API — keyword commands and JavaScript both work. Use `--headless` for CI/scripting, `--connect` to attach to existing Chrome.

**Single-command mode** — run one command and exit, useful for automation tools like Claude Code:

```bash
playwright-repl --command "snapshot"
playwright-repl --command "goto https://example.com"
playwright-repl --command "click \"Interested\""
```

> **[Full CLI docs](packages/cli/README.md)**

---

## pw Commands

The `@playwright-repl/runner` package provides the `pw` CLI:

```bash
npm install -D @playwright-repl/runner
```

```bash
pw test                              # run Playwright tests with context reuse
pw repl                              # interactive REPL with keyword + JS support
pw repl --headless                   # headless mode for scripting
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

AI agents control the browser — standalone or connected to your real Chrome via CDP relay.

```bash
npm install -g @playwright-repl/mcp
playwright-repl-mcp --standalone     # launch fresh browser (keyword + JS)
playwright-repl-mcp --relay          # connect to existing Chrome via CDP relay
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
└── core/           # @playwright-repl/core — shared parser, relay server, utilities
```

## Requirements

- **Node.js** >= 20
- **Playwright** >= 1.59

## License

MIT
