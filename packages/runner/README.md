# @playwright-repl/runner

Playwright test runner with faster execution via context reuse and bridge mode.

## Quick Start

```bash
cd your-playwright-project
pw test
```

## Benchmark

CI results (todomvc, 26 tests, 1 worker):

| Runner | Ubuntu | macOS | Windows |
|--------|--------|-------|---------|
| Playwright | 10.6s | 8.1s | 31.3s |
| pw-cli | 5.8s | 6.9s | 6.0s |
| Bridge direct | 4.8s | 4.3s | 3.6s |

The speedup comes from **skipping per-test context creation**. Playwright creates a new browser context + page for each test (for isolation). `pw` reuses the same page across tests, making per-test overhead consistent regardless of OS.

```
Standard Playwright:
  Test runner → new context → new page → CDP commands → close page
  (per-test overhead: 150-525ms depending on OS)

pw:
  Test runner → bridge → reuse page → CDP commands
  (per-test overhead: ~100ms, consistent across OS)
```

## Benefits

- **1.5-2x faster** on all platforms, consistent ~100ms per test (Playwright varies: 150ms Linux → 525ms Windows)
- **No context creation overhead** — reuses the same page, no `newPage()` per test
- **Same test syntax** — standard `import { test, expect } from '@playwright/test'`, no code changes
- **Automatic fallback** — tests using Node APIs (fs, route, etc.) fall back to Playwright's standard runner

### Trade-offs

- **No test isolation** — tests share state (localStorage, cookies). Tests must clean up after themselves
- **Bridge mode limitations** — no `page.route()`, `page.waitForEvent()`, `page.$eval()`

## CLI Usage

```bash
pw test [options] [test-filter...]
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
pw test

# Run specific file
pw test tests/login.spec.ts

# Filter by name
pw test --grep "login"

# Headed mode (see the browser)
pw test --headed

# With config
pw test --config playwright.config.ts
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

### Node Mode (full Playwright compatibility)

Tests that use Node APIs (fs, process.env, .route(), etc.) automatically fall back to Playwright's standard runner with full support for:

- Parallel workers (`--workers > 1`)
- `test.use()` — per-test config
- Projects
- Custom reporters (HTML, JSON)
- Global setup/teardown
- Trace recording

### Bridge Mode Limitations

Bridge-mode tests (simple, no Node APIs) run faster but don't support:

- `page.route()` / `page.waitForEvent()` / `page.waitForResponse()` — non-serializable callbacks
- `page.$eval()` / `page.$$eval()` — callback-based APIs

## CI Setup

The runner needs both **Chromium** and **Chrome** browsers installed:

```bash
# Install browsers (CI)
npx playwright install chromium chrome

# Linux (with system deps)
npx playwright install --with-deps chromium chrome
```

Both are required because `pw-cli` uses playwright-crx which runs inside Chrome with the extension loaded, while standard Playwright tests use Chromium.

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
