# Changelog

## 0.21.6

**2026-04-02**

### Features

- Bridge-mode now works on all platforms — bundles `esbuild-wasm` as fallback when native esbuild is unavailable

### Fixes

- Fix duplicate `[Content_Types].xml` in VSIX packaging

## 0.21.5

**2026-04-01**

### Features

- VSIX reduced from 26 MB to 12.7 MB using @vercel/nft dependency tracing
- Bridge-mode falls back to standard test runner when esbuild is unavailable
- Static imports for `ws` and `bridge-utils.cjs` — cleaner dependency resolution

## 0.21.4

**2026-04-01**

### Fixes

- Bundle runtime dependencies (`esbuild`, `@playwright-repl/core`, `@playwright-repl/runner`) into VSIX — bridge-mode tests now work for marketplace users
- Move `@babel/*`, `stack-utils`, `which` to devDependencies (already bundled by esbuild)
- Add `publish.mjs` script for automated VSIX packaging

## 0.21.2

**2026-04-01**

### Fixes

- Bundle `@playwright-repl/core` and `@playwright-repl/runner` as npm dependencies
- Use absolute GitHub URLs for marketplace images
- Light gallery banner to match icon background

### Docs

- Added GIF demos for REPL, Locator, Assert Builder, Recorder, and Browser REPL
- Added Browser REPL section with Dramaturg Chrome extension features
- Documented `.clear` and `.history` commands

## 0.21.0

**2026-03-31**

### Features

- **DevTools REPL panel**: Chrome DevTools now has a "Playwright" tab — re-attaches when switching back to the inspected tab, shows attached URL indicator. (#505, #506)
- **about:blank support**: Side panel and tab dropdown support `about:blank` pages; `tab-new` opens `about:blank` by default. (#507)
- **Test Explorer**: Run individual tests or files with a persistent browser — bridge-eligible tests bypass the test runner entirely for near-instant feedback.
- **REPL Panel**: Interactive command panel with keyword commands and JavaScript, command history, inline screenshots, PDF save, and execution timing.
- **Locator Panel**: Pick elements from the browser, inspect locators and ARIA snapshots, highlight elements.
- **Assert Builder**: Build and verify 13 Playwright assertion matchers interactively against the live page.
- **Recorder**: Record browser interactions as `.pw` keyword commands or Playwright JavaScript.
- **Browser reuse**: REPL, Test Explorer, Recorder, and Picker share the same headed browser via CDP — no extra browser windows.
- **pw CLI**: `pw` command replaces `npx playwright test` with bridge-based execution — up to 35% faster on Linux/Windows. (#361–#368)

### Fixes

- **Browser close detection**: Detect browser close and clean up immediately. (#495, #496, #499)
- **Headless hang**: Remove pw-preload to fix headless mode hang. (#483)
- **Folder click**: Fix Test Explorer folder click skipping tests via bridge. (#482)
- **Node tests**: Node tests reuse browser via CDP, fix crash when browser not running. (#480)
- **Playwright resolution**: Resolve playwright-core from user's project, not bundled copy. (#487)

## 0.20.0

**2026-03-22**

Initial release of the VS Code extension.
