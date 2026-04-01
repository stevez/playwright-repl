# Playwright REPL for VS Code

Interactive browser automation inside VS Code — Test Explorer, live REPL, assertion builder, and element picker.

<img src="images/hero.png" width="75%">

## Built on Playwright Test for VS Code

This extension is built upon Microsoft's official [Playwright Test for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright) extension (Apache 2.0). Both extensions can coexist — you can keep the official one installed and use this alongside it. They share the same `playwright.config.ts` and test files.

**What's new:**
- REPL panel — interactive command execution with keyword commands and JavaScript
- Locator panel — pick elements, inspect locators and ARIA snapshots
- Assert Builder — build and verify 13 Playwright assertion matchers interactively
- Recorder — capture browser interactions as test commands
- Bridge execution — browser-only tests bypass the test runner for near-instant feedback

**What's the same:**
- Test Explorer — same familiar interface for discovering and running tests
- Debugger — step through tests with breakpoints
- Trace Viewer — inspect test traces and screenshots

## Performance

With Show Browser enabled, browser-only tests bypass the Playwright test runner entirely — the script is sent directly to the browser via the extension bridge, eliminating the per-run overhead (worker startup, TypeScript compilation, fixture setup). This gives near-instant feedback when iterating on individual tests.

Node tests that need `fs`, `net`, etc. fall back to the standard Playwright test runner with CDP browser reuse. Headless mode uses standard Playwright with parallel workers.

## Features

### Test Explorer

Run Playwright tests with a persistent browser and context reuse. Works with individual tests and files. Folders fall back to the standard multi-worker path.

<img src="images/test-explorer.png" width="50%">

### REPL Panel

Interactive command panel in the bottom bar. Type keyword commands (`snapshot`, `click`, `fill`, `goto`) or JavaScript (`await page.title()`, `page.locator('h1').click()`).

- Command history (up/down arrows)
- `.clear` or `Ctrl+L` to clear console output
- `.history` to show command history, `.history clear` to reset
- Inline screenshot display
- PDF save
- Execution timing
- Local commands: `help`, `.aliases`, `.status`, `.history`, `locator`, `page`

<img src="images/repl.gif" width="75%">

### Locator Panel

Pick elements from the browser and inspect their locator and ARIA snapshot.

- **Pick arrow** — click to enter pick mode, click an element in the browser
- **Highlight toggle** — highlight the picked element
- **Editable locator** — modify and experiment
- **ARIA snapshot** — accessibility tree for the picked element

<img src="images/locator.gif" width="75%">

### Assert Builder

Build and verify Playwright assertions interactively:

1. **Pick Locator** — pick an element or type a locator manually
2. **Select Matcher** — 13 matchers, smart-filtered by element type
3. **Verify** — run the assertion against the live page, see pass/fail instantly

Matchers: `toContainText`, `toHaveText`, `toBeVisible`, `toBeHidden`, `toBeAttached`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, `toHaveValue`, `toHaveAttribute`, `toHaveCount`, `toHaveURL`, `toHaveTitle`

Supports negation (`not` checkbox) and editable assertions.

<img src="images/assert.gif" width="75%">

### Recorder

Record browser interactions as Playwright JavaScript. Click elements, fill forms, navigate — the recorder captures each action as executable test code.

<img src="images/recording.gif" width="75%">

### Browser REPL

The [Dramaturg](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa) Chrome extension adds an interactive REPL directly in the browser — available as a side panel or a DevTools tab.

- Auto-detects keyword commands (`.pw`) or Playwright API / JavaScript
- Expandable object tree — inspect results like Chrome DevTools
- Auto-attach to the active page — switch tabs and the REPL follows
- Inline screenshot preview and YAML accessibility tree viewer
- Command history and autocomplete
- Available as a side panel or a DevTools tab

The VS Code extension automatically installs Dramaturg in the launched browser. For standalone use or more features, install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa).

<img src="images/browser-repl.gif" width="75%">

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
