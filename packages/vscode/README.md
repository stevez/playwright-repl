# Playwright REPL for VS Code

Interactive browser automation inside VS Code — Test Explorer, live REPL, assertion builder, and element picker.

<!-- TODO: hero.png — overview screenshot -->

## Performance

With Show Browser enabled, browser-only tests bypass the Playwright test runner entirely — the script is sent directly to the browser via the extension bridge, eliminating the per-run overhead (worker startup, TypeScript compilation, fixture setup). This gives near-instant feedback when iterating on individual tests.

Node tests that need `fs`, `net`, etc. fall back to the standard Playwright test runner with CDP browser reuse. Headless mode uses standard Playwright with parallel workers.

## Features

### Test Explorer

Run Playwright tests with a persistent browser and context reuse. Works with individual tests and files. Folders fall back to the standard multi-worker path.

<!-- TODO: update test-explorer.png with fresh screenshot -->

### REPL Panel

Interactive command panel in the bottom bar. Type keyword commands (`snapshot`, `click`, `fill`, `goto`) or JavaScript (`await page.title()`, `page.locator('h1').click()`).

- Command history (up/down arrows)
- Inline screenshot display
- PDF save
- Execution timing
- Local commands: `help`, `.aliases`, `.status`, `.history`, `locator`, `page`

<!-- TODO: repl.png -->

### Locator Panel

Pick elements from the browser and inspect their locator and ARIA snapshot.

- **Pick arrow** — click to enter pick mode, click an element in the browser
- **Highlight toggle** — highlight the picked element
- **Editable locator** — modify and experiment
- **ARIA snapshot** — accessibility tree for the picked element

<!-- TODO: locator.png -->

### Assert Builder

Build and verify Playwright assertions interactively:

1. **Pick Locator** — pick an element or type a locator manually
2. **Select Matcher** — 13 matchers, smart-filtered by element type
3. **Verify** — run the assertion against the live page, see pass/fail instantly

Matchers: `toContainText`, `toHaveText`, `toBeVisible`, `toBeHidden`, `toBeAttached`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, `toHaveValue`, `toHaveAttribute`, `toHaveCount`, `toHaveURL`, `toHaveTitle`

Supports negation (`not` checkbox) and editable assertions.

<!-- TODO: assert-builder.png -->

### Recorder

Record browser interactions as Playwright commands. Click elements, fill forms, navigate — the recorder captures each action as `.pw` keyword commands or Playwright JavaScript.

### Browser Reuse

REPL, Test Explorer, Recorder, and Picker all share the same headed browser via CDP. No extra browser windows — tests run in the persistent context where the Chrome extension lives. The browser stays open between test runs with zero context setup overhead.

- **Bridge tests** — script sent directly to browser, no test runner overhead
- **Node tests** — reuse browser via `connectOverCDP`, no separate browser launch

## Workflow

**Record → Pick Locator → Assert → Run Test**

1. **Record** interactions to generate test steps
2. **Pick** elements to get locators
3. **Assert** expected values against the live page
4. **Run** tests through the Test Explorer

## Commands

| Command | Description |
|---------|-------------|
| `Playwright REPL: Launch Browser` | Launch Chromium with extension |
| `Playwright REPL: Stop Browser` | Close browser |
| `Playwright REPL: Open REPL` | Open the REPL panel |
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

- VS Code 1.93+
- Node.js 18+
- `@playwright/test` 1.58+ in your project

## Panels

The extension adds three panels to the bottom bar:

| Panel | Purpose |
|-------|---------|
| **REPL** | Interactive command execution |
| **Locator** | Element inspection and highlight |
| **Assert** | Assertion building and verification |

## Development

```bash
cd packages/vscode
pnpm run build

# Watch mode
node build.mjs --watch

# Run (F5 in VS Code with the repo open)
```

## License

Apache 2.0
