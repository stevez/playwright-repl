# Playwright REPL for VS Code

Interactive browser automation with **faster test execution**, a live REPL, and an assertion builder — all inside VS Code.

![Playwright REPL](images/hero.png)

## Features

### Test Explorer with Bridge Execution
Run Playwright tests directly through the bridge — **66ms per test** instead of 3+ seconds through the standard test runner. Works with individual tests and files. Folders fall back to the standard multi-worker path.

![Test Explorer](images/test-explorer.png)

### REPL Panel
Interactive command panel in the bottom bar. Type Playwright keyword commands (`snapshot`, `click`, `fill`, `goto`) or JavaScript (`await page.title()`, `page.locator('h1').click()`).

- Command history (up/down arrows)
- Inline screenshot display
- PDF save
- Execution timing
- Local commands: `help`, `.aliases`, `.status`, `.history`, `locator`, `page`

![REPL](images/repl.png)

### Locator Panel
Pick elements from the browser and inspect their locator and ARIA snapshot.

- **Pick arrow** — click to enter pick mode, click an element in the browser
- **Highlight toggle** — highlight the picked element in the browser
- **Editable locator** — modify and experiment
- **ARIA snapshot** — accessibility tree for the picked element

![Locator](images/locator.png)

### Assert Builder
Build and verify Playwright assertions interactively. Three-step workflow:

1. **Pick Locator** — pick an element or type a locator manually
2. **Select Matcher** — dropdown with 13 matchers, smart-filtered by element type
3. **Verify** — run the assertion against the live page, see pass/fail instantly

Matchers: `toContainText`, `toHaveText`, `toBeVisible`, `toBeHidden`, `toBeAttached`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, `toHaveValue`, `toHaveAttribute`, `toHaveCount`, `toHaveURL`, `toHaveTitle`

Supports negation (`not` checkbox) and editable assertions for tweaking.

![Assert Builder](images/assert-builder.png)

### Recorder
Record browser interactions as Playwright commands. Click elements, fill forms, navigate — the recorder captures each action.

### Browser Reuse
REPL, Test Explorer, Recorder, and Picker all share the same headed browser. No extra browser windows. The browser stays open between test runs.

## Commands

| Command | Description |
|---------|-------------|
| `Playwright REPL: Launch Browser` | Launch Chromium with bridge |
| `Playwright REPL: Stop Browser` | Close browser and bridge |
| `Playwright REPL: Open REPL` | Open the REPL terminal |
| `Playwright REPL: Pick Locator` | Enter pick mode |
| `Playwright REPL: Start Recording` | Start recording actions |
| `Playwright REPL: Stop Recording` | Stop recording |
| `Playwright REPL: Assert Builder` | Open Assert Builder and start pick |

## Getting Started

1. Install the extension
2. Open a project with a `playwright.config.ts`
3. Click **Launch Browser** or run a test (browser auto-launches if Show Browser is enabled)
4. Use the **REPL**, **Locator**, and **Assert** panels in the bottom bar

## Requirements

- VS Code 1.86+
- Node.js 18+
- `@playwright/test` 1.59+ in your project

## Panels

The extension adds three panels to the bottom bar:

| Panel | Purpose |
|-------|---------|
| **REPL** | Interactive command execution |
| **Locator** | Element inspection + highlight |
| **Assert** | Assertion building + verification |

## Performance

Bridge execution skips the test-server subprocess entirely — compiles the test with esbuild and sends it directly to the browser. No `newPage()` overhead per test.

| Scenario | Standard Playwright | Bridge (direct) |
|----------|----------|-------------|
| Single test | ~300ms (Linux), ~800ms (Windows) | **~100ms** |
| todomvc (26 tests) | 8-10s (Linux), 31s (Windows) | **4-5s** |

The speedup varies by platform because Playwright creates a new browser context per test. On Windows, `newPage()` takes ~525ms (OS process creation overhead); on Linux ~150ms. Bridge mode reuses the same page, so performance is consistent across platforms.

## Development

```bash
# Build
cd packages/vscode
pnpm run build

# Watch mode
node build.mjs --watch

# Run (F5 in VS Code with the repo open)
```

## License

Apache 2.0
