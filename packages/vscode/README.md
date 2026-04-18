# The fastest way to write and debug Playwright tests

Run commands live in the browser, pick locators, build assertions interactively, and run tests with near-instant feedback — all without leaving VS Code.

<img src="https://raw.githubusercontent.com/stevez/playwright-repl/main/packages/vscode/images/hero.gif" width="75%">

## Built on Playwright Test for VS Code

This extension is built upon Microsoft's official [Playwright Test for VS Code](https://marketplace.visualstudio.com/items?itemName=ms-playwright.playwright) extension (Apache 2.0). Both extensions can coexist — you can keep the official one installed and use this alongside it. They share the same `playwright.config.ts` and test files.

**Added on top of Playwright Test for VS Code:**
- REPL panel — interactive command execution with keyword commands and JavaScript
- Locator panel — pick elements, inspect locators and ARIA snapshots
- Assert Builder — build and verify 13 Playwright assertion matchers interactively
- Recorder — capture browser interactions as test commands
- Bridge execution — browser-only tests bypass the test runner for near-instant feedback

**Everything you already know still works:**
- Test Explorer, Debugger, and Trace Viewer — unchanged, same familiar interface

## Performance

With Show Browser enabled, browser-only tests bypass the Playwright test runner entirely — the script is sent directly to the browser via the extension bridge, eliminating per-run overhead (worker startup, TypeScript compilation, fixture setup). In benchmarks on Windows, this saves ~2.4s per run, giving near-instant feedback when iterating on individual tests.

Node tests that need `fs`, `net`, etc. fall back to the standard Playwright test runner with CDP browser reuse. Headless mode uses standard Playwright with parallel workers.

## Features

### Test Explorer

Run Playwright tests with a persistent browser and context reuse. Works with individual tests and files. Folders fall back to the standard multi-worker path.

<img src="https://raw.githubusercontent.com/stevez/playwright-repl/main/packages/vscode/images/test-explorer.png" width="50%">

### REPL Panel

Interactive command panel in the bottom bar. Type keyword commands (`snapshot`, `click`, `fill`, `goto`) or JavaScript (`await page.title()`, `page.locator('h1').click()`).

- Command history (up/down arrows)
- `.clear` or `Ctrl+L` to clear console output
- `.history` to show command history, `.history clear` to reset
- Inline screenshot display
- PDF save
- Execution timing
- Local commands: `video-start`, `video-stop`, `video-chapter`, `tracing-start`, `tracing-stop`
- `--in` flag for scoping commands to containers, `--frame` for iframe elements

<img src="https://raw.githubusercontent.com/stevez/playwright-repl/main/packages/vscode/images/repl.gif" width="75%">

### Locator Panel

Pick elements from the browser and inspect their locator and ARIA snapshot.

- **Pick arrow** — click to enter pick mode, click an element in the browser
- **Highlight toggle** — highlight the picked element
- **Editable locator** — modify and experiment
- **ARIA snapshot** — accessibility tree for the picked element

<img src="https://raw.githubusercontent.com/stevez/playwright-repl/main/packages/vscode/images/locator.gif" width="75%">

### Assert Builder

Build and verify Playwright assertions interactively:

1. **Pick Locator** — pick an element or type a locator manually
2. **Select Matcher** — 13 matchers, smart-filtered by element type
3. **Verify** — run the assertion against the live page, see pass/fail instantly
4. **AI Suggest** — get AI-suggested assertions based on the picked element

Matchers: `toContainText`, `toHaveText`, `toBeVisible`, `toBeHidden`, `toBeAttached`, `toBeEnabled`, `toBeDisabled`, `toBeChecked`, `toHaveValue`, `toHaveAttribute`, `toHaveCount`, `toHaveURL`, `toHaveTitle`

Supports negation (`not` checkbox), editable assertions, and AI-suggested assertions.

<img src="https://raw.githubusercontent.com/stevez/playwright-repl/main/packages/vscode/images/assert.gif" width="75%">

### Recorder

Record browser interactions as Playwright JavaScript. Click elements, fill forms, navigate — the recorder captures each action as executable test code.

<img src="https://raw.githubusercontent.com/stevez/playwright-repl/main/packages/vscode/images/recording.gif" width="75%">

### Browser REPL

The [Dramaturg](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa) Chrome extension adds an interactive REPL directly in the browser — available as a side panel or a DevTools tab.

- Auto-detects keyword commands (`.pw`) or Playwright API / JavaScript
- Expandable object tree — inspect results like Chrome DevTools
- Auto-attach to the active page — switch tabs and the REPL follows
- Inline screenshot preview and YAML accessibility tree viewer
- Command history and autocomplete
- Available as a side panel or a DevTools tab

The VS Code extension automatically installs Dramaturg in the launched browser. For standalone use or more features, install it from the [Chrome Web Store](https://chromewebstore.google.com/detail/dramaturg/ppbkmncnmjkfppilnmplpokdfagobipa).

<img src="https://raw.githubusercontent.com/stevez/playwright-repl/main/packages/vscode/images/browser-repl.gif" width="75%">

### Browser Reuse

REPL, Test Explorer, Recorder, and Picker all share the same headed browser via CDP. No extra browser windows — tests run in the persistent context where the Chrome extension lives. The browser stays open between test runs with zero context setup overhead.

- **Bridge tests** — script sent directly to browser, no test runner overhead
- **Node tests** — reuse browser via `connectOverCDP`, no separate browser launch

## Test Authoring Workflow

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
2. Open a project with a `playwright.config.ts` — or clone the [demo repo](https://github.com/stevez/playwright-examples) to try it immediately
3. Click **Launch Browser** in the Testing sidebar — the browser launches with the Dramaturg extension pre-installed
4. Open the **REPL** panel in the bottom bar and type `goto https://example.com` to get started
5. Use **Pick Locator** to inspect elements, **Assert Builder** to verify values, and **Record** to capture interactions as test code

## Requirements

- VS Code 1.93+
- Node.js 18+
- `@playwright/test` 1.59+ in your project
- `esbuild` in your project for bridge execution (`npm install -D esbuild`) — without it, falls back to `esbuild-wasm` (bundled), which is slower but requires no installation

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
