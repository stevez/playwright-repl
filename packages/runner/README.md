# @playwright-repl/runner

Drop-in replacement for `npx playwright test` with context reuse. Keeps the browser open between tests — no teardown/recreate per test.

## Quick Start

```bash
npm install -D @playwright-repl/runner
```

Replace `npx playwright test` with `pw test`:

```bash
pw test                         # run all tests
pw test todomvc/                # run tests in a folder
pw test --workers 1             # single worker
pw test --reporter list         # custom reporter
```

All Playwright CLI flags work — `pw` passes them through.

## How It Works

Standard Playwright creates a new browser context for every test. `pw test` reuses the same persistent browser context across tests in the same worker.

- **Bridge mode** — compiles the test with esbuild, sends it to the Chrome extension for in-browser execution
- **Node mode** — falls back to standard Playwright for tests that use Node-only APIs (fs, net, etc.)
- **Automatic routing** — static analysis detects which mode each test needs

## pw Commands

```bash
pw test [files...]                       # run Playwright tests with context reuse
pw launch --port 9222                    # launch Chrome with extension + CDP port
pw launch --port 9222 --bridge-port 9877 # custom bridge port
pw launch --port 9222 --headless         # headless mode
pw repl --port 9222                      # Node REPL with Playwright globals
pw repl --port 9222 script.js            # run script, exit (browser stays alive)
pw repl-extension --bridge-port 9877     # REPL via extension bridge
pw close --port 9222                     # close browser
```

### pw repl

Lightweight Node REPL with `page`, `context`, `browser`, and `expect` as globals. Powered by `node:repl` — full JavaScript with tab completion and history.

```bash
pw launch --port 9222
pw repl --port 9222
```

```
pw> await page.goto('https://example.com')
pw> await page.title()
Example Domain
(3.2ms)
pw> await page.locator('a').count()
1
(12.4ms)
pw> 1 + 1
2
```

### pw repl-extension

REPL that routes commands through the Chrome extension bridge. Useful for testing the extension path.

```bash
pw launch --port 9222 --bridge-port 9877
pw repl-extension --bridge-port 9877
```

## Options

| Option | Description |
|--------|-------------|
| `--port <n>` | Chrome CDP port (default: 9222) |
| `--bridge-port <n>` | BridgeServer WebSocket port (default: 9877) |
| `--headless` | Launch browser in headless mode |

All `pw test` options are passed through to Playwright.

## CI Setup

```yaml
- name: Install
  run: npm ci

- name: Install browsers
  run: npx playwright install --with-deps chromium

- name: Run tests
  run: npx pw test
```

## Compatibility

Works with standard `@playwright/test` tests. No changes needed to your test files.

**Supported:** All Playwright test features — fixtures, assertions, test.describe, test.beforeEach, etc.

**Bridge mode limitations:** Tests that use Node-only APIs (`fs`, `net`, `child_process`) automatically fall back to Node mode.

## Development

```bash
cd packages/runner
pnpm run build
pnpm run test
```
