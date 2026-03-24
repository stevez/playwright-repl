# @playwright-repl/runner

Playwright test runner with 10x faster execution via bridge mode (playwright-crx).

## Quick Start

```bash
cd your-playwright-project
playwright-ide test
```

## Benchmark

| | Standard Playwright | playwright-ide |
|---|---|---|
| 23 todomvc tests | 26.1s | ~2s |
| Per test avg | ~1.1s | ~60ms |
| Speed | baseline | **~10x faster** |

## How It Works

Standard Playwright sends each browser command over CDP (Chrome DevTools Protocol) — one round-trip per action. playwright-ide uses playwright-crx running inside Chrome, executing commands in-process with zero round-trips.

```
Standard Playwright:
  Node.js ──CDP──CDP──CDP──→ Chrome    (many round-trips)

playwright-ide:
  Node.js ──bridge──→ playwright-crx    (one message, executes in-process)
```

## CLI Usage

```bash
playwright-ide test [options] [test-filter...]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <file>` | Playwright config file | `playwright.config.ts` |
| `-g, --grep <pattern>` | Filter tests by name | |
| `--headed` | Run with visible browser | headless |
| `--workers <n>` | Number of workers | 1 |
| `--timeout <ms>` | Per-test timeout | 30000 |
| `--retries <n>` | Retry failed tests | 0 |

### Examples

```bash
# Run all tests
playwright-ide test

# Run specific file
playwright-ide test tests/login.spec.ts

# Filter by name
playwright-ide test --grep "login"

# Headed mode (see the browser)
playwright-ide test --headed

# With config
playwright-ide test --config playwright.config.ts
```

## Compatibility

Tests are standard Playwright — same `import { test, expect } from '@playwright/test'`, same API, same config. No code changes needed.

### Supported

- `test`, `test.describe`, `test.only`, `test.skip`
- `test.beforeEach`, `test.afterEach`, `test.beforeAll`, `test.afterAll`
- `test.extend()` — custom fixtures
- `page.*` — all Playwright page methods
- `expect()` — all async matchers
- `playwright.config.ts` — testDir, timeout, retries
- TypeScript

### Not Yet Supported

- Parallel workers (`--workers > 1`)
- `test.use()` — per-test config
- Projects
- Custom reporters (HTML, JSON)
- Global setup/teardown
- Trace recording
- `toMatchAriaSnapshot()` — runs in bridge context

## Development

```bash
# Build
pnpm --filter @playwright-repl/runner run build

# Run examples
cd examples
node ../dist/cli.js test

# Run single test
node ../dist/cli.js test todomvc/adding-todos/should-add-single-todo.spec.ts
```
