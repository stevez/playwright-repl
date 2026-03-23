# MVP1 Plan — Playwright IDE (VS Code Extension)

Issue: #326 | Parent: #307

## Goal

Prove the core loop: VS Code launches Chrome with playwright-crx → user runs `.spec.ts` tests or types in REPL → code executes against Chrome → results display in VS Code.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  VS Code                                            │
│  ┌──────────────────────────────────────────────┐   │
│  │ test.spec.ts (native editor + TypeScript)    │   │
│  │                                              │   │
│  │ import { test, expect } from '@playwright/test'│  │
│  │ test('login', async ({ page }) => {          │   │
│  │   await page.goto('http://localhost:3000')   │   │
│  │   await page.click('button')                 │   │
│  │ })                                           │   │
│  ├──────────────────────────────────────────────┤   │
│  │ TERMINAL │ Playwright REPL │ TEST RESULTS    │   │
│  └──────────────────────────────────────────────┘   │
│        ↕                                            │
└─────────────────────────────────────────────────────┘
        ↕
┌─────────────────────────────────────────────────────┐
│  Chrome (launched by VS Code with playwright-crx)   │
│  ├── Side panel (existing Dramaturg UI)             │
│  ├── playwright-crx (in-process, 35x fast)          │
│  └── Page under test                                │
└─────────────────────────────────────────────────────┘
```

## Two Execution Modes

### 1. Test Runner — run `.spec.ts` files

Leverage **Playwright Test's runner** — no custom test framework needed.

VS Code launches Chrome with playwright-crx → Playwright Test connects to the
same browser via `connectOverCDP` → full `describe`/`beforeEach`/`afterAll`/fixtures
work out of the box.

**How it works:**
- VS Code extension generates or uses a `playwright.config.ts` with:
  ```typescript
  export default defineConfig({
    use: {
      connectOptions: { wsEndpoint: 'http://localhost:9222' }
    }
  });
  ```
- Runs `npx playwright test` as a VS Code task or child process
- Playwright Test connects to the already-running Chrome (no browser launch)
- Full test lifecycle: describe, it, beforeEach, afterEach, afterAll, fixtures
- Results displayed in VS Code terminal or test explorer

**What we get for free:**
- All Playwright Test features (parallel, retries, reporters, etc.)
- Familiar `test('name', async ({ page }) => { ... })` syntax
- No custom test framework code to maintain

### 2. REPL — interactive single expressions

For quick exploration and prototyping.

- User types `await page.goto('http://localhost:3000')` in REPL terminal
- Sent to Chrome via CommandServer `POST /run`
- playwright-crx executes in-process (35x fast)
- Result displayed in terminal

## Components

### 1. Extension Scaffold

**Package:** `packages/vscode`

```
packages/vscode/
├── src/
│   ├── extension.ts        # activate/deactivate, register commands
│   ├── browser.ts          # launch Chromium with playwright-crx
│   ├── repl.ts             # Pseudoterminal REPL
│   └── completions.ts      # Playwright API autocomplete
├── package.json            # VS Code extension manifest
├── tsconfig.json
└── vite.config.ts          # bundle extension for VS Code
```

**package.json** (VS Code extension format):
- `name`: `playwright-ide`
- `displayName`: `Playwright IDE`
- `publisher`: TBD
- `engines.vscode`: `^1.100.0`
- `activationEvents`: command-based
- `contributes.commands`:
  - `playwright-ide.launchBrowser` — Launch Chrome with playwright-crx
  - `playwright-ide.openRepl` — Open REPL terminal
  - `playwright-ide.runTest` — Run current .spec.ts file
- `contributes.terminal.profiles`: Playwright REPL
- `main`: `./dist/extension.js`
- `dependencies`: `@playwright-repl/core: workspace:*`
- `private: true` (not published to npm, only VS Code Marketplace)

### 2. Browser Launcher (`browser.ts`)

Launches Chromium with playwright-crx loaded as extension.

**Flow:**
1. Locate playwright-crx extension dist (bundled or path config)
2. Find Chromium (use Playwright's bundled Chromium or system Chrome)
3. Launch with flags:
   - `--load-extension=/path/to/playwright-crx`
   - `--remote-debugging-port=9222`
   - `--no-first-run`
4. Wait for CDP ready (poll `http://localhost:9222/json/version`)
5. Start CommandServer on port 6781 (for REPL mode)

**Headed/headless:**
- Default: headed (developer wants to see the browser)
- Config option for headless (CI use case)

**Reference:** Engine's extension mode in `packages/core/src/engine.ts` already does
this. Use `Engine.start({ extension: true, spawn: true })` directly.

### 3. Test Runner Integration

Thin layer that runs Playwright Test against the launched browser.

**Implementation:**
- Spawn `npx playwright test <file>` with `--config` pointing to a generated
  config that uses `connectOptions` to the running Chrome
- Capture stdout/stderr → display in VS Code terminal
- Parse test results for status bar / test explorer integration (future)

**Config generation:**
```typescript
// Generate temporary playwright.config.ts
const config = `
import { defineConfig } from '@playwright/test';
export default defineConfig({
  use: {
    connectOptions: {
      wsEndpoint: 'http://localhost:${cdpPort}'
    }
  }
});
`;
```

### 4. Pseudoterminal REPL (`repl.ts`)

Custom terminal in VS Code's Terminal panel for interactive exploration.

**Implementation:**
```typescript
const pty: vscode.Pseudoterminal = {
  onDidWrite: writeEmitter.event,
  open() { writeEmitter.fire('Playwright IDE REPL\r\n> ') },
  handleInput(data) {
    // Handle Enter → send command via CommandServer
    // Handle backspace, arrows, history
  }
}
const terminal = vscode.window.createTerminal({ name: 'Playwright REPL', pty })
```

**Features:**
- Line editing (backspace, arrows)
- Command history (up/down arrows)
- ANSI colored output (reuse core's color helpers)
- Show errors in red

### 5. Autocomplete (`completions.ts`)

Basic `CompletionItemProvider` for Playwright API.

**Scope for MVP1:**
- `page.*` methods (goto, click, fill, locator, etc.)
- `page.locator().*` methods
- `expect()` matchers
- Source: Playwright's TypeScript types (already available via `@playwright/test`)

## Integration Flow

```
User: Cmd+Shift+P → "Playwright IDE: Launch Browser"
  ↓
extension.ts → browser.ts
  ↓ Engine.start({ extension: true, spawn: true })
Chrome launches with playwright-crx + side panel
  ↓ CDP on :9222, CommandServer on :6781

--- Test Runner flow ---
User: Cmd+Shift+P → "Playwright IDE: Run Test" (or click ▶ Run)
  ↓
extension.ts → spawn `npx playwright test <file> --config=<generated>`
  ↓ Playwright Test connects to Chrome via connectOverCDP
  ↓ Full test lifecycle (describe/beforeEach/test/afterAll)
  ↓ Results in terminal

--- REPL flow ---
User: Opens "Playwright REPL" terminal
  ↓ Types: await page.goto('http://localhost:3000')
  ↓ POST http://localhost:6781/run
  ↓ playwright-crx executes in Chrome (35x fast)
  ↓ Result displayed in terminal
```

## Build & Development

- **Build:** Vite to bundle `extension.ts` → `dist/extension.js` (CommonJS for VS Code)
- **Dev:** `vite build --watch` for hot reload during development
- **Test:** Launch VS Code Extension Development Host (`F5` in VS Code)
- **Root build script:** Add `pnpm --filter @playwright-repl/vscode run build` to root build

## Open Questions

1. **playwright-crx dist location** — Bundle it inside the VS Code extension, or
   require the user to have the Chrome extension installed? Bundling is simpler for UX.
2. **Chromium binary** — Use Playwright's bundled Chromium or system Chrome?
3. **Port conflicts** — What if 6781 or 9222 are already in use? Need port detection.
4. **connectOverCDP vs connectOptions** — Need to verify which Playwright Test config
   option works with a Chrome instance that has playwright-crx loaded.
5. **VS Code Marketplace publisher** — Need to create one before publishing.

## Estimation

| Component | Effort |
|-----------|--------|
| Extension scaffold + package.json | 1 day |
| Browser launcher (reuse Engine) | 1-2 days |
| Test runner (Playwright Test integration) | 2-3 days |
| Pseudoterminal REPL | 2-3 days |
| Basic autocomplete | 1 day |
| Testing + polish | 2-3 days |
| **Total** | **~2-3 weeks** |
