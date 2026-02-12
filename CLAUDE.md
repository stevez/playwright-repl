# CLAUDE.md — Context for Claude Code

## Project Overview

**playwright-repl** is an interactive REPL (Read-Eval-Print Loop) for browser automation that connects directly to the Playwright MCP daemon over a Unix socket. It replaces the `playwright-cli` client with a persistent, low-latency alternative while producing identical wire messages.

Think of it as a **keyword-driven test runner** (like Robot Framework) backed by Playwright instead of Selenium.

## Architecture

### How Playwright CLI Works (what we're replacing the client half of)

```
┌─────────────────────────────────────────────────────────────────────┐
│ CLI approach (per command):                                        │
│   spawn Node.js → require modules → parse argv → connect socket → │
│   send message → receive → disconnect → exit                      │
│   Cost: ~50-100ms overhead per command                             │
│                                                                    │
│ REPL approach (once at startup):                                   │
│   spawn Node.js → require modules → connect socket                │
│   Then per command: readline → parse → send → receive → print     │
│   Cost: ~0ms overhead (socket stays open)                          │
└─────────────────────────────────────────────────────────────────────┘
```

### The Three Layers

```
Layer 1: CLI keyword → MCP tool name (commands.js)
  "click"     → "browser_click"
  "goto"      → "browser_navigate"
  "press"     → "browser_press_key"
  "fill"      → "browser_type"
  "snapshot"  → "browser_snapshot"

Layer 2: MCP tool name → handle() function (tools/*.js)
  backend.callTool("browser_click", { ref: "e5" })
  → looks up tool in registry → calls handle()

Layer 3: handle() → Playwright API
  browser_click  → locator.click()
  browser_navigate → page.goto()
  browser_press_key → page.keyboard.press()
  browser_snapshot → accessibility tree walk via CDP
```

### Wire Protocol (Unix Socket)

Newline-delimited JSON over Unix socket:

```
Send:    {"id":1,"method":"run","params":{"args":{"_":["click","e5"]},"cwd":"/"},"version":"0.1.0"}\n
Receive: {"id":1,"result":{"text":"..."},"version":"0.1.0"}\n
```

The `args` field is a **minimist-parsed object**, not a raw string. Both CLI and REPL do minimist parsing client-side. The daemon receives identical messages from both.

### Full Command Flow Example

```
User types:  "click e5"
  ↓ alias resolution (REPL layer)
tokens:      ["click", "e5"]
  ↓ minimist parsing (client-side)
args:        { _: ["click", "e5"] }
  ↓ JSON over Unix socket
daemon:      parseCliCommand({ _: ["click", "e5"] })
  ↓ commands.js mapping
toolName:    "browser_click"
toolParams:  { ref: "e5" }
  ↓ backend.callTool()
tool handler: click.handle(tab, { ref: "e5" }, response)
  ↓ tab.refLocator({ ref: "e5" })
locator:     page.locator('aria-ref=e5')
  ↓ Playwright API
browser:     locator.click()
  ↓ CDP WebSocket
Chrome:      actual DOM click event
```

### Element Refs (e1, e5, etc.)

When you run `snapshot`, the daemon walks the page's accessibility tree via CDP, assigns short refs like `e1`, `e2`, `e5` to interactive elements. When you later say `click e5`, it resolves back:

```js
// tab.js
async refLocators(params) {
  let locator = this.page.locator(`aria-ref=${param.ref}`);
}
```

### Socket Path Computation

The daemon socket path includes a hash of the workspace directory:

```
/tmp/playwright-cli/{workspaceHash}/{sessionName}.sock  (Linux/macOS)
\\.\pipe\{workspaceHash}-{sessionName}.sock              (Windows)

workspaceHash = sha1(workspaceDir || packageLocation).slice(0, 16) in hex
workspaceDir  = walk up from cwd looking for `.playwright/` directory
packageLocation = our package.json path (from require.resolve('../package.json'))
```

**Critical**: The workspace detection looks for `.playwright` directory specifically — NOT `package.json` or `.git`. When no `.playwright/` dir exists, it falls back to `packageLocation`. Both REPL and daemon must hash the same value — since both use our `package.json`, they always agree.

### Daemon Startup

The REPL starts the daemon via:

```
execSync('node bin/daemon-launcher.cjs open --headed')
```

Where `daemon-launcher.cjs` is our 3-line replacement for `@playwright/cli`:

```js
const { program } = require('playwright/lib/mcp/terminal/program');
const packageLocation = require.resolve('../package.json');
program(packageLocation);
```

Inside `program()`, the `open` command spawns the daemon as a detached child.
The daemon process then:
1. Reads/creates session config
2. Creates a `BrowserServerBackend` with `{ allTools: true }`
3. Creates a `contextFactory` → launches browser via `playwright-core`
4. Starts a `net.Server` listening on the Unix socket
5. Routes incoming messages: `parseCliCommand(args)` → `backend.callTool(toolName, toolParams)`

### Daemon Dependencies

The daemon uses only:
- `playwright-core` — browser launch + API
- `browserContextFactory.js` — wraps playwright-core launch/connect
- `BrowserServerBackend.js` — tool registry
- `daemon.js` — Unix socket server + message routing

**All importable from `playwright@>=1.59.0-alpha`** via `playwright/lib/mcp/terminal/program`.

## Command Vocabulary

### Action Commands
| Keyword | MCP Tool | Playwright API |
|---------|----------|----------------|
| open [url] | browser_navigate | page.goto() |
| goto \<url\> | browser_navigate | page.goto() |
| click \<ref\> | browser_click | locator.click() |
| dblclick \<ref\> | browser_click | locator.dblclick() |
| fill \<ref\> \<text\> | browser_type | locator.fill() |
| type \<text\> | browser_press_sequentially | page.keyboard.type() |
| press \<key\> | browser_press_key | page.keyboard.press() |
| hover \<ref\> | browser_hover | locator.hover() |
| select \<ref\> \<values\> | browser_select_option | locator.selectOption() |
| check \<ref\> | browser_check | locator.check() |
| uncheck \<ref\> | browser_uncheck | locator.uncheck() |
| upload \<ref\> \<files\> | browser_file_upload | locator.setInputFiles() |
| drag \<startRef\> \<endRef\> | browser_drag | locator.dragTo() |

### Read Commands
| Keyword | MCP Tool | Returns |
|---------|----------|---------|
| snapshot | browser_snapshot | Accessibility tree with refs |
| screenshot | browser_take_screenshot | PNG image |
| eval \<expr\> [ref] | browser_evaluate | JS evaluation result |
| console | browser_console_messages | Browser console output |
| network | browser_network_requests | HTTP requests log |
| cookie-list | browser_cookie_list | All cookies |
| cookie-get \<name\> | browser_cookie_get | Single cookie |
| localstorage-list | browser_localstorage_list | All localStorage |
| localstorage-get \<key\> | browser_localstorage_get | Single value |
| sessionstorage-list | browser_sessionstorage_list | All sessionStorage |
| sessionstorage-get \<key\> | browser_sessionstorage_get | Single value |
| tab-list | browser_tabs | Open tabs |
| config-print | browser_get_config | Daemon config |
| state-save | browser_storage_state | Auth state (cookies+storage) |

### Assertion Commands (exist in daemon but NO CLI keywords mapped)
| MCP Tool | What it asserts |
|----------|----------------|
| browser_verify_element_visible | Element exists by role + accessible name |
| browser_verify_text_visible | Text is visible on page |
| browser_verify_list_visible | List contains expected items |
| browser_verify_value | Input/checkbox/radio/select value |

These are a key area to add — the daemon has them (`{ allTools: true }`) but the CLI never wired them up. We need to create keyword mappings for them.

### Navigation
| Keyword | MCP Tool |
|---------|----------|
| go-back | browser_navigate_back |
| go-forward | browser_navigate_forward |
| reload | browser_reload |

### Advanced
| Keyword | MCP Tool |
|---------|----------|
| run-code \<code\> | browser_run_code |
| dialog-accept [text] | browser_handle_dialog |
| dialog-dismiss | browser_handle_dialog |
| resize \<w\> \<h\> | browser_resize |
| route \<pattern\> | browser_route |
| route-list | browser_route_list |
| unroute [pattern] | browser_unroute |

## Key Implementation Details

### Boolean Option Handling

minimist sets all declared boolean options to `false` by default. The daemon rejects unknown options like `--headed false`. Solution: strip false-valued booleans not explicitly passed by user:

```js
for (const opt of booleanOptions) {
  if (args[opt] === false) {
    const hasExplicitNo = tokens.some(t => t === `--no-${opt}`);
    if (!hasExplicitNo) delete args[opt];
  }
}
```

### Async Command Serialization

When piping commands or replaying, readline emits all 'line' events immediately. Async handlers overlap, causing race conditions. Solution: command queue:

```js
let processing = false;
const commandQueue = [];
async function processQueue() {
  if (processing) return;
  processing = true;
  while (commandQueue.length > 0) {
    await processLine(commandQueue.shift());
  }
  processing = false;
}
```

### Package Resolution

The REPL starts the daemon via `bin/daemon-launcher.cjs`, which is a 3-line CJS file:

```js
const { program } = require('playwright/lib/mcp/terminal/program');
const packageLocation = require.resolve('../package.json');
program(packageLocation);
```

This is identical to what `@playwright/cli`'s `playwright-cli.js` does, except
`packageLocation` points to **our** `package.json`. The daemon uses this path for:
1. Socket hash computation (`sha1(workspaceDir || packageLocation)`)
2. Wire protocol version (from `package.json` version field)

Both the REPL and daemon hash the same path → same socket → they find each other.

## Tech Stack

- **Runtime**: Node.js (ESM modules, `.mjs`)
- **Dependencies**: `minimist` (command parsing), `playwright@>=1.59.0-alpha` (daemon + browser)
- **No `@playwright/cli`** — we start the daemon ourselves via `bin/daemon-launcher.cjs`
- **`daemon-launcher.cjs`** is 3 lines of CJS that call `require('playwright/lib/mcp/terminal/program')`
  with our own `package.json` as the `packageLocation`. This makes the socket hash
  deterministic based on our package, not a separate CLI tool.
- **Key insight**: `playwright@1.59.0-alpha` includes `lib/mcp/terminal/` (daemon, commands, socket).
  The stable `playwright@1.58` does NOT — that code was exclusive to `@playwright/cli`'s bundled copy.
  Once 1.59 goes stable, the alpha pin can be removed.
- No build step — plain ESM JavaScript

## Code Style

- ESM imports (`import ... from`)
- Async/await throughout
- No TypeScript (keep it simple, scripting-oriented)
- Sections separated by `// ─── Section Name ───` comments
