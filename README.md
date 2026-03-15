# playwright-repl

![playwright-repl](cover-image.png)

Interactive browser automation powered by Playwright — use it from your **terminal**, as a **Chrome extension**, or let an **AI agent** drive it via MCP.

| Package | Description |
|---------|-------------|
| [`playwright-repl`](https://github.com/stevez/playwright-repl/tree/main/packages/cli/README.md) | CLI — terminal REPL with keyword commands, recording, replay, and piping |
| [Dramaturg](https://github.com/stevez/playwright-repl/tree/main/packages/extension/README.md) | Chrome extension — console, script editor, recorder, CDP object tree |
| [`@playwright-repl/mcp`](https://github.com/stevez/playwright-repl/tree/main/packages/mcp/README.md) | MCP server — AI agents control your real Chrome browser |
| [`@playwright-repl/core`](https://github.com/stevez/playwright-repl/tree/main/packages/core/README.md) | Shared engine, parser, and utilities |

---

## CLI — playwright-repl

Terminal REPL for Playwright automation. Type a command, see the result instantly.

```bash
npm install -g playwright-repl
playwright-repl --headed
```

```
pw> goto https://demo.playwright.dev/todomvc/
pw> fill "What needs to be done?" "Buy groceries"
pw> press Enter
pw> verify-text "1 item left"
pw> screenshot
```

Two modes:

| Mode | Flag | Browser |
|------|------|---------|
| **Standalone** | *(default)* | Launches new Chromium via Playwright |
| **Bridge** | `--bridge` | Your real Chrome via Dramaturg extension |

→ **[Full CLI docs](https://github.com/stevez/playwright-repl/tree/main/packages/cli/README.md)**

---

## Dramaturg — Chrome Extension

Chrome side panel extension that runs the full Playwright API directly inside your browser — no Node.js backend required.

```bash
cd packages/extension && npm run build
# Load in Chrome: chrome://extensions → Developer mode → Load unpacked → dist/
```

| Feature | |
|---------|---|
| Console with 2 input modes | `.pw` keywords, Playwright API / JavaScript — auto-detected |
| Script editor | Syntax highlighting, pass/fail gutter, step debugger |
| Recorder | Captures clicks/fills/navigations as `.pw` commands and JS Playwright code |
| Object tree | Expandable CDP object tree, just like Chrome DevTools |
| Side panel & popup | Opens as side panel by default; switch to popup in Options |

→ **[Full extension docs](https://github.com/stevez/playwright-repl/tree/main/packages/extension/README.md)**

---

## MCP Server — AI Browser Agent

Most browser MCP servers launch a separate, isolated browser — no history, no cookies, no auth.

**`@playwright-repl/mcp` is different.**

The MCP server pairs with the Dramaturg extension to give AI agents access to your **real** Chrome session — already logged in, cookies intact.

```bash
npm install -g @playwright-repl/mcp
playwright-repl-mcp   # extension connects automatically — no side panel needed
```

| | `@playwright-repl/mcp` | Playwright MCP | Playwriter |
|---|:---:|:---:|:---:|
| MCP tools exposed | **2** `run_command`, `run_script` | ~70 tools | **1** `execute` |
| Uses your real session | ✅ | ❌ | ✅ |
| Playwright runs inside browser | ✅ | ❌ | ❌ |
| `expect()` assertions | ✅ | ❌ | ❌ |
| Full Playwright API | ✅ | ✅ | ✅ |
| JS eval (`page.evaluate`) | ✅ | ❌ | ✅ |

> Playwright MCP and Playwriter control Chrome from outside via CDP relay. `@playwright-repl/mcp` runs Playwright natively inside Chrome via `playwright-crx` — enabling `expect()`, recording, and a full DevTools panel alongside AI.

→ **[Full MCP docs](https://github.com/stevez/playwright-repl/tree/main/packages/mcp/README.md)**

---

## Monorepo Structure

```
packages/
├── core/           # @playwright-repl/core — shared Engine, BridgeServer, parser
├── cli/            # playwright-repl — terminal REPL
├── mcp/            # @playwright-repl/mcp — MCP server (run_command, run_script)
└── extension/      # Dramaturg — Chrome side panel extension (React, Vite)
```

```bash
# Build all packages
npm run build

# Build and watch (CLI + core)
npm run dev

# Run extension
cd packages/extension && npm run build
```

## Requirements

- **Node.js** >= 20
- **playwright** >= 1.59.0-alpha

## License

MIT
