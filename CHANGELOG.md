# Changelog

## v0.26.0

**2026-04-17**

### Features

- **Iframe support**: Record and replay with `--frame` flag — interact with elements inside iframes. ([#737](https://github.com/stevez/playwright-repl/pull/737))
- **`--in` scoping**: Text-based `--in` flag scopes commands to containers (e.g., `click "Delete" --in listitem "reading"`). ([#741](https://github.com/stevez/playwright-repl/pull/741))
- **Auto-generate `--in`**: Picker replaces `--nth` with `--in` using nearby heading context for more readable commands. ([#743](https://github.com/stevez/playwright-repl/pull/743))
- **Polish with AI**: AI-powered command to improve test code quality. ([#729](https://github.com/stevez/playwright-repl/pull/729))
- **AI-suggested assertions**: AssertBuilder suggests assertions using AI. ([#728](https://github.com/stevez/playwright-repl/pull/728))
- **Fix with AI**: AI context for bridge-mode test failures. ([#725](https://github.com/stevez/playwright-repl/pull/725))

### Fixes

- **Picker**: Stale page detection, `--frame` and `--exact` in pick results. ([#739](https://github.com/stevez/playwright-repl/pull/739))
- **Picker**: Full accessible name used for PW commands (aria snapshot name over JS locator substring). ([#744](https://github.com/stevez/playwright-repl/pull/744))
- **Picker**: Heading context captures full element text for `--in` matching. ([#744](https://github.com/stevez/playwright-repl/pull/744))
- **CSS tokenizer**: Preserve quotes and spaces inside parens for CSS pseudo-class locators. ([#727](https://github.com/stevez/playwright-repl/pull/727))
- **Timeouts**: Prevent silent hangs in bridge, service worker, and HTTP endpoints. ([#717](https://github.com/stevez/playwright-repl/pull/717))
- **Child process**: Use `close` instead of `exit` to prevent truncated output. ([#716](https://github.com/stevez/playwright-repl/pull/716))
- **VS Code**: Dedupe concurrent browser launches. ([#711](https://github.com/stevez/playwright-repl/pull/711))
- **VS Code**: Route pick/recording through BrowserController when showBrowser is on. ([#713](https://github.com/stevez/playwright-repl/pull/713))
- **Video**: Remove in-page REC overlay from video capture. ([#709](https://github.com/stevez/playwright-repl/pull/709))

### Refactors

- **Picker**: Derive PW commands by parsing JS locator as single source of truth, replacing dual-path aria+regex approach. ([#744](https://github.com/stevez/playwright-repl/pull/744))

### Tests

- Unit tests for MCP, bridge-server, and runner packages. ([#718](https://github.com/stevez/playwright-repl/pull/718), [#719](https://github.com/stevez/playwright-repl/pull/719), [#720](https://github.com/stevez/playwright-repl/pull/720))

## v0.25.0

**2026-04-11**

### Features

- **VS Code REPL autocomplete**: Command dropdown filters `.pw` commands as you type, with keyboard navigation and highlighted prefix. ([#691](https://github.com/stevez/playwright-repl/pull/691))
- **VS Code REPL object tree**: JSON objects/arrays render as expandable `<details>/<summary>` trees with colored primitives (matching debug console style). ([#694](https://github.com/stevez/playwright-repl/pull/694))
- **VS Code REPL toolbar**: Native clear, filter (All/Commands/Output/Errors/Info), and search icons in the panel title bar. Search with highlight, prev/next navigation, Escape to close. ([#695](https://github.com/stevez/playwright-repl/pull/695))
- **CLI `--http` mode**: Start an HTTP server (port 9223) alongside the REPL for fast external command access. Works with standalone and bridge modes. ([#696](https://github.com/stevez/playwright-repl/pull/696))
- **MCP HTTP server**: MCP server automatically starts HTTP server on port 9223 for `pw-cli` / `--command --http` access. Request logging to `~/.playwright-repl/http.log`. ([#698](https://github.com/stevez/playwright-repl/pull/698))
- **`pw-cli` shorthand**: New binary — `pw-cli "snapshot"` sends commands via HTTP to a running session. No flags needed. ([#699](https://github.com/stevez/playwright-repl/pull/699))
- **CLI `--command` flag**: Run a single command and exit — works in standalone, bridge, and HTTP modes. ([#670](https://github.com/stevez/playwright-repl/issues/670))
- **AI skill (SKILL.md)**: Teach AI agents (Claude Code, Cursor) to use `pw-cli` via Bash — no MCP needed. Full command reference and workflow examples. ([#702](https://github.com/stevez/playwright-repl/pull/702))
- **Lifecycle logging**: MCP server and extension logging across startup, tool calls, and connection events. ([#668](https://github.com/stevez/playwright-repl/issues/668))

### Fixes

- **Bridge mode single test skip**: Fix index-based result mapping in Test Explorer — use `findResultByName()` so clicking a single test runs correctly. ([#693](https://github.com/stevez/playwright-repl/pull/693))
- **Offscreen bridge**: Skip offscreen bridge for development installs, improve reconnection. ([#667](https://github.com/stevez/playwright-repl/issues/667))
- **Windows test workers**: Fix repl-view mock tests failing on Windows with multiple workers. ([#684](https://github.com/stevez/playwright-repl/issues/684))

### Refactors

- **VS Code extension**: Extract `IBrowserManager` interface, `WebviewBase` abstract class, and `BrowserController` from Extension god class. ([#671](https://github.com/stevez/playwright-repl/issues/671), [#676](https://github.com/stevez/playwright-repl/issues/676), [#678](https://github.com/stevez/playwright-repl/issues/678))
- **VS Code test infrastructure**: Upstream mock test framework with `WebviewPagePool`, server-side V8 coverage collection, and headless picker/recorder tests. ([#669](https://github.com/stevez/playwright-repl/issues/669), [#681](https://github.com/stevez/playwright-repl/issues/681), [#687](https://github.com/stevez/playwright-repl/issues/687), [#689](https://github.com/stevez/playwright-repl/pull/689))

## v0.24.1

**2026-04-09**

### Build

- **Disable sourcemaps** — disable sourcemap generation across all packages (tsconfig, Vite, esbuild). ([#656](https://github.com/stevez/playwright-repl/issues/656))
- **playwright-crx 1.21.4** — ESM only, no sourcemaps. npm package reduced from 37MB to 8.7MB.
- **VS Code publish** — `publish.mjs` now installs `@playwright-repl/browser-extension` from npm instead of copying locally.

## v0.24.0

**2026-04-09**

### Features

- **Video capture**: Record tab video in the Chrome extension via `tabCapture` + `MediaRecorder`. Toolbar button with timer and recording indicator overlay on the page. ([#588](https://github.com/stevez/playwright-repl/issues/588), [#594](https://github.com/stevez/playwright-repl/issues/594), [#595](https://github.com/stevez/playwright-repl/issues/595))
- **Video via CLI/MCP**: `video-start` / `video-stop` commands available through the bridge. ([#601](https://github.com/stevez/playwright-repl/issues/601))
- **Tracing**: `tracing-start` / `tracing-stop` commands in extension, CLI, and MCP. Open trace files directly in the browser from the extension. ([#604](https://github.com/stevez/playwright-repl/issues/604), [#606](https://github.com/stevez/playwright-repl/issues/606), [#612](https://github.com/stevez/playwright-repl/issues/612))
- **Element picker**: Use Playwright's native `page.pickLocator()` API in both VS Code and Chrome extension. Derive `.pw` locators from `ariaSnapshot()`. ([#615](https://github.com/stevez/playwright-repl/issues/615), [#617](https://github.com/stevez/playwright-repl/issues/617), [#625](https://github.com/stevez/playwright-repl/issues/625), [#631](https://github.com/stevez/playwright-repl/issues/631))
- **Response formatting**: Playwright `Response` objects now display as `Response: 200 https://...` instead of raw object representation.
- **Tracing/Video keyword commands**: `tracing-start`, `tracing-stop`, `video-start`, `video-stop`, `video-chapter` registered in the command map with help text and completions.
- **CLI `--engine` flag**: Force standalone engine mode (no extension, keyword commands only).
- **Browser extension package**: Publish extension dist as `@playwright-repl/browser-extension`. ([#652](https://github.com/stevez/playwright-repl/issues/652))

### Fixes

- **Bridge reconnection**: Bridge server reconnects after extension WebSocket drops, with relaxed heartbeat (30s) and dead connection detection. ([#642](https://github.com/stevez/playwright-repl/issues/642), [#643](https://github.com/stevez/playwright-repl/issues/643), [#650](https://github.com/stevez/playwright-repl/issues/650))
- **Tab attach**: Auto-attach tab on bridge connect with robust tab discovery. ([#636](https://github.com/stevez/playwright-repl/issues/636))
- **Chrome Web Store detachment**: Handle forced extension detachment gracefully. ([#645](https://github.com/stevez/playwright-repl/issues/645))
- **Attach failure**: Reset `crxApp` on attach failure instead of detach-only retry. ([#628](https://github.com/stevez/playwright-repl/issues/628))
- **pickLocator**: Prevent `pickLocator()` from blocking the bridge command queue.
- **playwright-crx**: Bump to 1.21.2 with simplified attach logic. ([#609](https://github.com/stevez/playwright-repl/issues/609))
- **CDP relay removed**: Remove CDP relay to avoid `chrome.debugger` conflict with bridge mode. ([#600](https://github.com/stevez/playwright-repl/issues/600))
- **CI**: Stabilize flaky history ArrowUp/ArrowDown test on macOS. ([#637](https://github.com/stevez/playwright-repl/issues/637))

### Refactors

- **Locator command**: Use `locator.normalize()` instead of YAML snapshot cache. ([#624](https://github.com/stevez/playwright-repl/issues/624))

## v0.23.1

**2026-04-05**

### Fixes

- **Element picker**: Fix locator generation for `<p>` and other long-text elements — use `getByText()` with a truncated substring instead of falling back to a generic CSS selector like `locator('p')`. ([#579](https://github.com/stevez/playwright-repl/issues/579))
- **ARIA roles**: Add `paragraph` implicit role for `<p>` elements.
- **Element picker**: Retarget to nearest interactive ancestor (link, button, etc.) before generating locators — matches Playwright codegen behavior. ([#580](https://github.com/stevez/playwright-repl/issues/580))

## v0.23.0 — Upgrade to Playwright 1.59.1

**2026-04-05**

### Breaking Changes

- **Playwright 1.59.1**: Upgraded `@playwright-repl/playwright-crx` from 0.15.3 to 1.21.1, bringing the underlying Playwright engine from 1.53 to 1.59.1.

### Changes

- **Snapshot API**: Replaced deprecated `_snapshotForAI()` with `ariaSnapshot({ mode: 'ai' })`. ([#573](https://github.com/stevez/playwright-repl/pull/573))
- **Element picker**: Replaced removed `_generateLocatorString()` with `locator.normalize()` for resolving Playwright locators from picked elements.
- **Expect matchers**: Full Playwright assertion matchers (`toBeVisible()`, `toHaveText()`, `toContainText()`, `toMatchAriaSnapshot()`, etc.) now available in the extension service worker.
- **Completions**: Regenerated `pw-completions.json` from Playwright 1.59.1 type declarations (374 completions).
- **Build**: Updated `extract-completions.mjs` to resolve `playwright-core` types via pnpm workspace path.

## v0.22.0 — serviceWorker.evaluate() Architecture

**2026-04-03**

### Architecture

- **New default execution mode**: all packages now use `serviceWorker.evaluate()` instead of the WebSocket bridge. Launches Chromium with the Dramaturg extension and talks directly to the service worker — no bridge server, no port management, no offscreen relay.
- **2.8x faster test runner**: `pw test` compiles tests and sends them to the service worker via `serviceWorker.evaluate()`. 24 todomvc tests in 5.9s (was 16.3s). ([#561](https://github.com/stevez/playwright-repl/pull/561))
- **JavaScript support everywhere**: standalone mode now supports both keyword commands and Playwright API / JavaScript in all packages (CLI, MCP, runner). ([#559](https://github.com/stevez/playwright-repl/pull/559))

### Features

- **CLI**: `playwright-repl` now launches Chromium with extension by default (headed). `--headless` for CI/scripting. `--bridge` for connecting to existing Chrome. ([#559](https://github.com/stevez/playwright-repl/pull/559))
- **MCP**: `--standalone` mode uses `serviceWorker.evaluate()` with full JS support. Falls back to Engine for npm users without bundled extension. ([#562](https://github.com/stevez/playwright-repl/pull/562))
- **VS Code**: `BrowserManager` uses `launchPersistentContext` + `serviceWorker.evaluate()` instead of bridge. ([#563](https://github.com/stevez/playwright-repl/pull/563))
- **VS Code REPL**: `pw>` prompt added. ([#554](https://github.com/stevez/playwright-repl/pull/554))
- **VS Code E2E tests**: real VS Code tests via `connectOverCDP` — spawn VS Code, connect Playwright, test UI. ([#556](https://github.com/stevez/playwright-repl/pull/556))
- **Core**: `EvaluateConnection` class and `findExtensionPath()` shared across all packages. ([#564](https://github.com/stevez/playwright-repl/pull/564))

### Removed

- `--extension` mode (CLI) — replaced by evaluate mode
- `--server` mode (CLI) — replaced by `@playwright-repl/mcp`
- `CommandServer` / `extension-server.ts` (core) — no longer needed
- `pw launch`, `pw close`, `pw repl-extension` subcommands (runner)
- CI benchmarks (bridge vs CDP — no longer relevant)
- ~1000 lines of dead code

## v0.21.9 — Mac Bridge Fix

**2026-04-02**

### Fixes

- **Mac bridge timeout**: Use `127.0.0.1` instead of `localhost`, dynamic CDP port, SW fallback bridge port injection. ([#550](https://github.com/stevez/playwright-repl/pull/550))

## v0.21.8 — VSIX Packaging Fix

**2026-04-02**

### Fixes

- **VSIX packaging**: Restore legacy `npm install --production` in temp dir — nft/yauzl append was stripped by marketplace. ([#549](https://github.com/stevez/playwright-repl/pull/549))
- **Remove platform esbuild**: Remove `esbuild` from runner deps, keep portable `esbuild-wasm` only — VSIX now works cross-platform.
- **npm publish**: Use `pnpm publish` to correctly resolve `workspace:*` refs.

## v0.21.7 — VSIX Marketplace Fix

**2026-04-02**

### Fixes

- **VSIX missing node_modules**: Marketplace VSIX was 12.7 MB (missing deps) vs 34 MB locally — `vsce publish -i` stripped appended node_modules. Restored legacy temp-dir packaging. ([#549](https://github.com/stevez/playwright-repl/pull/549))

## v0.21.6 — esbuild-wasm & Publish Script

**2026-04-02**

### Features

- **esbuild-wasm fallback**: Bridge-mode now bundles `esbuild-wasm` — works on all platforms without requiring users to install esbuild. Native esbuild used when available for best performance. ([#538](https://github.com/stevez/playwright-repl/pull/538))

### Fixes

- **Publish script**: Replace Python zip with `adm-zip` for VSIX packaging. Fixes duplicate `[Content_Types].xml` that blocked marketplace publish. ([#535](https://github.com/stevez/playwright-repl/pull/535))

## v0.21.5 — nft Packaging & Bridge Fallback

**2026-04-01**

### Features

- **nft-based VSIX packaging**: Use @vercel/nft to trace runtime dependencies — VSIX reduced from 26 MB to 12.7 MB. Key insight: `readlink: null` prevents nft from following pnpm symlinks. ([#530](https://github.com/stevez/playwright-repl/pull/530))
- **esbuild fallback**: Bridge-mode gracefully falls back to standard Playwright test runner when esbuild platform binary is not available. ([#530](https://github.com/stevez/playwright-repl/pull/530))

### Fixes

- **Static imports**: Changed `createRequire` calls for `ws` and `bridge-utils.cjs` to static imports — esbuild bundles ws inline, nft traces bridge-utils automatically.

## v0.21.4 — VS Code Extension Fix

**2026-04-01**

### Fixes

- **VS Code extension**: Bundle runtime dependencies (`@playwright-repl/core`, `@playwright-repl/runner`, `esbuild`) into VSIX so bridge-mode tests work for marketplace users. ([#524](https://github.com/stevez/playwright-repl/issues/524))
- **Publish script**: Added `packages/vscode/publish.mjs` to automate VSIX packaging via temp directory (avoids pnpm/vsce symlink conflict). ([#524](https://github.com/stevez/playwright-repl/issues/524))
- **Dependencies**: Moved `@babel/*`, `stack-utils`, `which` to devDependencies — already bundled by esbuild at build time.

## v0.21.2 — npm Publish & VS Code Marketplace

**2026-04-01**

### Features

- **VS Code Marketplace**: Published to the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=playwright-repl.playwright-repl-vscode). ([#510](https://github.com/stevez/playwright-repl/issues/510))
- **npm publish**: Published `@playwright-repl/core` and `@playwright-repl/runner` to npm.

### Docs

- **GIF demos**: Added animated GIFs for REPL, Locator, Assert Builder, Recorder, and Browser REPL. ([#514](https://github.com/stevez/playwright-repl/pull/514))
- **VS Code README**: Screenshots, GIFs, Browser REPL section with Dramaturg link. ([#511](https://github.com/stevez/playwright-repl/pull/511), [#513](https://github.com/stevez/playwright-repl/pull/513), [#516](https://github.com/stevez/playwright-repl/pull/516))
- **VS Code CHANGELOG**: Created for marketplace Changelog tab.

### Fixes

- **Recorder empty line**: Fixed recorder leaving an empty line gap when cursor is on a blank line. ([#514](https://github.com/stevez/playwright-repl/pull/514))
- **Marketplace images**: Use absolute GitHub URLs for marketplace rendering. ([#517](https://github.com/stevez/playwright-repl/pull/517))

## v0.21.0 — VS Code Extension, DevTools REPL & Runner

**2026-03-31**

### Features

- **VS Code extension**: Full-featured Test Explorer integration with REPL, recorder, locator picker, and assert builder panels. ([#404](https://github.com/stevez/playwright-repl/pull/404)–[#439](https://github.com/stevez/playwright-repl/pull/439))
- **pw CLI**: Drop-in `pw` command replaces `npx playwright test` with bridge-based execution — up to 35% faster on Linux/Windows. ([#361](https://github.com/stevez/playwright-repl/pull/361)–[#368](https://github.com/stevez/playwright-repl/pull/368))
- **DevTools REPL panel**: Chrome DevTools now has a "Playwright" tab with re-attach on tab switch and attached URL indicator. ([#439](https://github.com/stevez/playwright-repl/pull/439), [#505](https://github.com/stevez/playwright-repl/pull/505), [#506](https://github.com/stevez/playwright-repl/pull/506))
- **about:blank support**: Side panel and tab dropdown now support `about:blank` pages; `tab-new` opens `about:blank` by default. ([#507](https://github.com/stevez/playwright-repl/pull/507))
- **CI benchmarks**: Automated Playwright vs pw-cli benchmark comparison in CI. ([#445](https://github.com/stevez/playwright-repl/pull/445))

### Fixes

- **Browser close detection**: Detect browser close and clean up immediately, handle CDP context reuse. ([#495](https://github.com/stevez/playwright-repl/pull/495), [#496](https://github.com/stevez/playwright-repl/pull/496), [#499](https://github.com/stevez/playwright-repl/pull/499))
- **pw-cli outside monorepo**: Fix `pw` CLI to work outside the monorepo without Module._load hooks. ([#490](https://github.com/stevez/playwright-repl/pull/490))
- **Playwright resolution**: Resolve playwright-core from user's project, not bundled copy. ([#487](https://github.com/stevez/playwright-repl/pull/487))
- **VS Code headless hang**: Remove pw-preload from VS Code extension to fix headless hang. ([#483](https://github.com/stevez/playwright-repl/pull/483))
- **Test Explorer folder click**: Fix folder click skipping tests via bridge. ([#482](https://github.com/stevez/playwright-repl/pull/482))
- **Node tests browser reuse**: Node tests reuse browser via CDP, fix crash when browser not running. ([#480](https://github.com/stevez/playwright-repl/pull/480))
- **Remove google.com default**: Remove hardcoded google.com navigation from pw-launch. ([#508](https://github.com/stevez/playwright-repl/pull/508))

### Refactoring

- **Simplify runner**: Remove pw-preload and pw-worker from runner package. ([#492](https://github.com/stevez/playwright-repl/pull/492))
- **Engine to CLI**: Move Engine from core to cli, make core Playwright-free. ([#463](https://github.com/stevez/playwright-repl/pull/463))
- **CDP_PORT constant**: Replace hardcoded port 9222 with CDP_PORT constant. ([#500](https://github.com/stevez/playwright-repl/pull/500))
- **Shared sw-debugger-core**: Extract shared service worker debugger core for background.ts and panel. ([#442](https://github.com/stevez/playwright-repl/pull/442))

### Docs

- **README rewrite**: Rewrite all READMEs, remove speed claims, focus on DX. ([#471](https://github.com/stevez/playwright-repl/pull/471))

## v0.20.0 — MCP & Standalone Mode

**2026-03-22**

### Features

- **MCP standalone mode**: New `--standalone` flag launches an in-process Playwright engine — no Chrome extension needed. ([#316](https://github.com/stevez/playwright-repl/pull/316))
- **MCP snapshot in responses**: Update commands (click, fill, goto, etc.) automatically include accessibility snapshots in MCP responses, reducing round-trips. ([#319](https://github.com/stevez/playwright-repl/issues/319), [#320](https://github.com/stevez/playwright-repl/pull/320))
- **MCP file-based logging**: Tool calls, results, and lifecycle events are written to `~/.playwright-repl/mcp.log` for debugging in any MCP host. ([#322](https://github.com/stevez/playwright-repl/issues/322), [#324](https://github.com/stevez/playwright-repl/pull/324))
- **Role-based commands in standalone mode**: CLI standalone now supports role prefixes like `click button "Submit"`. ([#267](https://github.com/stevez/playwright-repl/issues/267), [#313](https://github.com/stevez/playwright-repl/pull/313))
- **wait-for-text in standalone mode**: Added missing `wait-for-text` command to standalone. ([#317](https://github.com/stevez/playwright-repl/pull/317))

### Fixes

- **CLI standalone command alignment**: Standalone commands now match bridge mode behavior. ([#302](https://github.com/stevez/playwright-repl/issues/302), [#315](https://github.com/stevez/playwright-repl/pull/315))
- **Snapshot values inline**: Fixed snapshot values to show inline with refs kept in text. ([#310](https://github.com/stevez/playwright-repl/pull/310))
- **Complex chained locators**: Fixed picker derivation for complex chained locators. ([#306](https://github.com/stevez/playwright-repl/pull/306))
- **Recording selector injection**: Removed pw-selector.js injection, switched to custom locator. ([#308](https://github.com/stevez/playwright-repl/issues/308), [#309](https://github.com/stevez/playwright-repl/pull/309))
- **Pick result rendering**: Element pick results now render as an expandable ObjectTree instead of raw text. ([#295](https://github.com/stevez/playwright-repl/issues/295), [#300](https://github.com/stevez/playwright-repl/pull/300))

### Docs

- **Help role syntax**: Added `[role]` prefix to help usage for interaction commands (click, fill, check, etc.). ([#323](https://github.com/stevez/playwright-repl/pull/323))

### Tests

- **Bridge replay E2E**: Added bridge replay E2E test to CI. ([#318](https://github.com/stevez/playwright-repl/pull/318))

---

## v0.19.0 — Playwright Selector Integration

**2026-03-21**

### Features

- **Playwright-quality locators for recording**: Recorder now uses Playwright's `InjectedScript` for locator generation via `extendInjectedScript`, producing high-quality selectors like `getByRole('button', { name: 'Submit' })` instead of the custom fallback. ([#294](https://github.com/stevez/playwright-repl/issues/294))

### Fixes

- **Attach race condition**: Fixed "Another debugger is already attached" error after stopping recording by properly awaiting `detach()` before re-attaching.

---

## v0.18.1

**2026-03-17**

### Fixes

- **Popup tab filter**: Tab switcher dropdown no longer shows the extension's own popup window URL. ([#251](https://github.com/stevez/playwright-repl/pull/251))

---

## v0.18.0 — Stability & Recording

**2026-03-17**

### Features

- **Ancestor context disambiguation**: Recorder and PW mode now use ancestor context to disambiguate ambiguous locators (e.g. `click "Save" --in "Settings"`). ([#187](https://github.com/stevez/playwright-repl/issues/187), [#240](https://github.com/stevez/playwright-repl/pull/240), [#243](https://github.com/stevez/playwright-repl/pull/243))
- **Inline variable values**: Debug mode shows inline variable values on the paused line. ([#224](https://github.com/stevez/playwright-repl/issues/224), [#231](https://github.com/stevez/playwright-repl/pull/231))

### Fixes

- **Tab close stability**: Added `chrome.tabs.onRemoved` listener to clear stale `currentPage` when a tab is closed. ([#247](https://github.com/stevez/playwright-repl/issues/247), [#249](https://github.com/stevez/playwright-repl/pull/249))
- **Stale page recovery**: Commands that hit `TargetClosedError` now auto-reattach and retry. ([#247](https://github.com/stevez/playwright-repl/issues/247), [#249](https://github.com/stevez/playwright-repl/pull/249))
- **Command serialization**: Bridge commands now execute sequentially via a promise queue, preventing concurrent race conditions. ([#248](https://github.com/stevez/playwright-repl/issues/248), [#249](https://github.com/stevez/playwright-repl/pull/249))
- **Attach reliability**: Fixed attach failing after tab switching by using `playwright-crx` 0.15.2. ([#242](https://github.com/stevez/playwright-repl/issues/242), [#245](https://github.com/stevez/playwright-repl/pull/245))
- **Auto-stop recording**: Recording now auto-stops when run/debug starts. ([#234](https://github.com/stevez/playwright-repl/issues/234), [#237](https://github.com/stevez/playwright-repl/pull/237))
- **Record hover before click**: Hover is now recorded before click on hover-revealed elements. ([#235](https://github.com/stevez/playwright-repl/pull/235))
- **Record Enter as press command**: Enter is now recorded as a separate `press Enter` instead of `--submit` flag. ([#232](https://github.com/stevez/playwright-repl/pull/232))
- **Skip noise keys in recorder**: Backspace, Tab, arrows, and other noise keys are no longer recorded. ([#239](https://github.com/stevez/playwright-repl/pull/239))

---

## v0.17.0 — JS Debugger

**2026-03-16**

### Features

- **JS step debugger**: Debug JS scripts with Step Over, Step Into, Step Out, and Continue. Set breakpoints by clicking the gutter, then click Debug to run. ([#217](https://github.com/stevez/playwright-repl/issues/217), [#218](https://github.com/stevez/playwright-repl/issues/218), [#220](https://github.com/stevez/playwright-repl/pull/220), [#222](https://github.com/stevez/playwright-repl/issues/222), [#226](https://github.com/stevez/playwright-repl/pull/226))
- **Floating debug toolbar**: Step Over / Step Into / Step Out / Continue buttons appear during debug sessions. ([#221](https://github.com/stevez/playwright-repl/issues/221), [#225](https://github.com/stevez/playwright-repl/pull/225))
- **Variables tab**: Auto-displays scope variables (Local, Block, Closure, Script) when the debugger pauses. Expandable tree view using the existing CDP object tree. ([#223](https://github.com/stevez/playwright-repl/issues/223), [#227](https://github.com/stevez/playwright-repl/pull/227))
- **Contextual assertions**: Pick element now includes contextual assertions (`verify-text`, `verify-visible`). ([#181](https://github.com/stevez/playwright-repl/issues/181), [#182](https://github.com/stevez/playwright-repl/pull/182))
- **Custom recorder**: Replaced Playwright's built-in recorder with a custom content script for cleaner output. ([#183](https://github.com/stevez/playwright-repl/pull/183))
- **New tab support**: Static newtab page allows the extension to work with newly opened tabs. ([#179](https://github.com/stevez/playwright-repl/pull/179))
- **Only prepend goto on empty editor**: Recording start only adds `goto` when the editor is empty. ([#189](https://github.com/stevez/playwright-repl/issues/189), [#191](https://github.com/stevez/playwright-repl/pull/191))

### Fixes

- **Trailing empty line debugger crash**: Fixed debugger failing when editor content ends with empty lines. ([#228](https://github.com/stevez/playwright-repl/issues/228), [#229](https://github.com/stevez/playwright-repl/pull/229))
- **Console object rendering**: Improved display for Promise, Map/Set, arrays, and object literals. ([#203](https://github.com/stevez/playwright-repl/issues/203), [#204](https://github.com/stevez/playwright-repl/pull/204), [#212](https://github.com/stevez/playwright-repl/pull/212))
- **JS eval with replMode**: Simplified JS evaluation with `replMode` and block scoping. ([#201](https://github.com/stevez/playwright-repl/issues/201), [#202](https://github.com/stevez/playwright-repl/pull/202))
- **Tab switch activation**: Browser tab now activates when switching via the dropdown. ([#190](https://github.com/stevez/playwright-repl/pull/190))
- **Bridge eval alignment**: Bridge mode eval now matches panel behavior. ([#215](https://github.com/stevez/playwright-repl/pull/215))

### Refactoring

- **Unified JS mode**: Dropped CDP JS mode — console now has 2 modes (`.pw` and JS). ([#196](https://github.com/stevez/playwright-repl/pull/196))
- **Renamed console mode**: Renamed `playwright` mode to `js` for consistency. ([#197](https://github.com/stevez/playwright-repl/pull/197))

### Tests

- Unit tests for content scripts (locator, picker, recorder). ([#184](https://github.com/stevez/playwright-repl/pull/184))
- Resolved all TypeScript type-check errors in extension tests. ([#192](https://github.com/stevez/playwright-repl/pull/192))

---

## v0.16.2 — Pick Element & Recording Fix

**2026-03-13**

### Features

- **Pick element**: Replaced Playwright's recorder-based picker with a custom content script. Hover shows a blue highlight overlay + locator tooltip; click picks the element instantly with clean cleanup. ([#166](https://github.com/stevez/playwright-repl/issues/166), [#175](https://github.com/stevez/playwright-repl/pull/175))
- **Pick element pw output**: Picked elements now show role + name + nth in the `.pw` command row (e.g. `highlight tab "npm" --nth 2`). ([#176](https://github.com/stevez/playwright-repl/pull/176))

### Fixes

- **Recording regression**: Fixed recording producing unexecutable bare-role commands (e.g. `click tab --nth 0` instead of CSS selectors). Nameless roles now fall back to CSS selector from `a.selector`. ([#176](https://github.com/stevez/playwright-repl/pull/176))
- **Remove `host_permissions`**: Removed `<all_urls>` host permission again — `activeTab` is sufficient and avoids the scary Chrome Web Store warning.
- **Pick element icon**: Replaced the browser-window-with-pointer icon with a crosshair/target icon for the pick element toolbar button.

---

## v0.16.1 — Exact Match & Highlight Improvements

**2026-03-13**

### Features

- **`--exact` flag**: All text locator commands (`click`, `fill`, `hover`, `check`, `uncheck`, `select`, `highlight`) now support `--exact` to skip the fallback chain and use only the primary locator match. ([#156](https://github.com/stevez/playwright-repl/issues/156), [#165](https://github.com/stevez/playwright-repl/pull/165))
- **Highlight match count**: `highlight` now returns the number of matched elements (e.g. `Highlighted 5 elements`, `Highlighted 1 of 24`). ([#165](https://github.com/stevez/playwright-repl/pull/165))
- **`highlight --clear`**: Dismiss Playwright's highlight overlay with `highlight --clear`. ([#165](https://github.com/stevez/playwright-repl/pull/165))
- **`highlight --nth`**: Highlight a single element by index using CSS outline (Playwright's `.highlight()` ignores `.nth()`). ([#165](https://github.com/stevez/playwright-repl/pull/165))

### Fixes

- **Bare `document`/`window` in console**: Fixed mode detection so `document` and `window` are correctly routed to JS mode instead of being treated as `.pw` keywords. ([#168](https://github.com/stevez/playwright-repl/pull/168))
- **Remove `host_permissions`**: Removed unnecessary `<all_urls>` host permission from the extension manifest — the `debugger` and `activeTab` permissions are sufficient. ([#169](https://github.com/stevez/playwright-repl/issues/169), [#170](https://github.com/stevez/playwright-repl/pull/170))

---

## v0.16.0 — Autocompletion, Snapshot Tree & Recording Fixes

**2026-03-12**

### Features

- **Playwright API autocompletion**: JS mode now offers ghost-text autocompletion for Playwright API methods (`page.goto()`, `page.locator()`, `expect()`, etc.). ([#137](https://github.com/stevez/playwright-repl/issues/137), [#147](https://github.com/stevez/playwright-repl/pull/147))
- **Snapshot tree view**: `snapshot` output now renders as an expandable accessibility tree in the console — click to expand/collapse nodes instead of scrolling through raw text. ([#88](https://github.com/stevez/playwright-repl/issues/88), [#151](https://github.com/stevez/playwright-repl/pull/151))
- **Categorized help**: `help` command groups commands by category (navigation, interaction, assertion, etc.) with per-command help (`help click`, `help fill`) and `help js` for Playwright API reference. ([#146](https://github.com/stevez/playwright-repl/pull/146))
- **Language mode preference**: Choose default language mode (`.pw` or JS) in the Options page. Persisted via `chrome.storage`. ([#149](https://github.com/stevez/playwright-repl/pull/149))
- **Segmented control**: Replaced the pw/js toggle button with a segmented control for clearer mode switching. ([#145](https://github.com/stevez/playwright-repl/pull/145))
- **Auto-closing brackets**: Editor and console input now auto-close parentheses, brackets, and quotes. ([#150](https://github.com/stevez/playwright-repl/pull/150))

### Fixes

- **Recording captures full fill text**: Fill commands now record the complete input text instead of only the first character. ([#154](https://github.com/stevez/playwright-repl/pull/154))
- **Recorder merges fill + Enter**: Sequential `fill` followed by `Enter` is merged into a single command; noise clicks on already-focused inputs are filtered. ([#154](https://github.com/stevez/playwright-repl/pull/154))
- **Recording noise removed from console**: Duplicate and internal recorder output no longer appears in the console. ([#144](https://github.com/stevez/playwright-repl/pull/144))
- **Failed commands recorded in history**: Commands that error are now saved to session history so you can arrow-up to fix and retry. ([#163](https://github.com/stevez/playwright-repl/pull/163))

### Tests

- Extension test coverage increased to 90%+ with new unit, component, and E2E tests. ([#157](https://github.com/stevez/playwright-repl/pull/157)–[#162](https://github.com/stevez/playwright-repl/pull/162))
- E2E coverage collection via nextcov — merged unit + component + E2E coverage reports. ([#148](https://github.com/stevez/playwright-repl/issues/148), [#157](https://github.com/stevez/playwright-repl/pull/157))
- Bridge E2E tests verify all commands return meaningful results via WebSocket.
- E2E recording flow tests added. ([#160](https://github.com/stevez/playwright-repl/pull/160))

---

## v0.15.1 — WebSocket Origin Check

**2026-03-09**

### Security

- **Block cross-origin WebSocket connections**: The bridge server now rejects WebSocket upgrade requests from web page origins (`http://`, `https://`). Only `chrome-extension://` origins and Node.js clients (no origin header) are accepted. Prevents malicious websites from connecting to `ws://localhost:9876` to control the browser. ([#130](https://github.com/stevez/playwright-repl/issues/130), [#131](https://github.com/stevez/playwright-repl/pull/131))

---

## v0.15.0 — Panel-Free MCP Bridge

**2026-03-09**

### Features

- **MCP works without the side panel**: The CLI/MCP bridge WebSocket now lives in a persistent offscreen document instead of the panel. The extension auto-connects to the bridge server and auto-attaches to the active tab on the first command — no need to open the side panel at all. ([#127](https://github.com/stevez/playwright-repl/issues/127), [#129](https://github.com/stevez/playwright-repl/pull/129))
- **Console.log capture**: `console.log()` and `console.warn()` calls from JS editor scripts now appear in the panel console with object tree expansion. ([#116](https://github.com/stevez/playwright-repl/issues/116), [#126](https://github.com/stevez/playwright-repl/pull/126))

### Internal

- Bridge command execution uses `chrome.debugger` self-targeting (`Runtime.evaluate` on the SW's own target) to bypass MV3 CSP `unsafe-eval` restriction.
- Offscreen document uses `chrome.runtime.sendMessage` to relay commands and fetch bridge port (offscreen docs cannot access `chrome.storage`).

---

## v0.14.0 — AI Test Generation

**2026-03-09**

### New: `run_script` MCP tool

- **Batch script execution**: `run_script` sends multi-line scripts to the extension in a single call. Supports two languages:
  - `language="pw"` — splits by line, runs each keyword command sequentially, returns ✓/✗ per line
  - `language="javascript"` — runs the entire block as one `swDebugEval` call (for `await page.*`, `expect()`, etc.)

### New: `generate-test` MCP prompt

- **AI-driven test generation**: `/generate-test` prompt template in Claude Desktop and Claude Code. Provide a test scenario description (and optional URL), and the AI navigates the page, takes snapshots, writes Playwright assertions, runs them via `run_script`, and iterates until all pass. Works with both natural language steps and pasted `.pw` scripts.

### Features

- **Pick locator**: Click elements in the page to insert their locator into the editor. ([#121](https://github.com/stevez/playwright-repl/pull/121))
- **JS mode assertion recording**: Recording in JS mode now correctly generates `expect()` assertions. ([#121](https://github.com/stevez/playwright-repl/pull/121))

### Internal

- Consolidated `commands.ts` and `page-scripts.ts` into `src/panel/lib/`.

---

## v0.13.0 — MCP Server + Dramaturg

**2026-03-09**

### New: `@playwright-repl/mcp`

- **MCP server for AI browser control**: `playwright-repl-mcp` exposes a single `run_command` tool that lets Claude Desktop, Claude Code, or any MCP client drive your real Chrome session via the Dramaturg extension. Supports keyword commands, Playwright API, and JavaScript — no extra glue code needed.
- **One tool, three input modes**: keyword (`.pw`), Playwright API (`await page.*`), JavaScript (`document.*`) — same as the extension console.
- **Custom port**: `--port` arg or `BRIDGE_PORT` env var (default `9876`).

### Features

- **Dramaturg**: Extension renamed to **Dramaturg** in the Chrome manifest — preparation for Chrome Web Store publishing.

### Documentation

- Full README rewrite across all packages — root README is now a high-level landing page; each package has a dedicated README.
- New `packages/core/README.md` — documents `Engine`, `BridgeServer`, `parseInput`, `buildCompletionItems`.

---

## v0.12.0 — WebSocket CLI Bridge

**2026-03-08**

### Features

- **`--bridge` mode**: The CLI can now remote-control a running Chrome that has the extension installed — no `--remote-debugging-port` required. Run `playwright-repl --bridge`; the extension connects out via WebSocket and the CLI becomes a full remote console. ([#69](https://github.com/stevez/playwright-repl/issues/69), [#112](https://github.com/stevez/playwright-repl/pull/112))
- **`--bridge --replay`**: Run `.pw` or `.js` script files through the bridge — `playwright-repl --bridge --replay script.pw`. Supports single files and directories (all `.pw`/`.js` files run in order). Exits with code 0/1 for CI use.
- **JSON pretty-print**: Object results from `run-code` / `swDebugEval` are printed as colorized JSON in the terminal.
- **Screenshot to file**: `screenshot` results are saved to `~/pw-screenshots/` and the path is printed.

---

## v0.11.0 — JS Mode, Step Debugger

**2026-03-08**

### Features

- **JS mode in script editor**: Toggle between `.pw` (keyword) and `JS` (JavaScript) modes in the toolbar. In JS mode the editor gains JavaScript syntax highlighting and executes lines via `swDebugEval` directly. ([#91](https://github.com/stevez/playwright-repl/pull/91), [#107](https://github.com/stevez/playwright-repl/pull/107))
- **JS mode recording**: When recording in JS mode, the recorder inserts JS syntax — `await page.goto(...)`, `await page.click(...)` — instead of `.pw` keywords. ([#108](https://github.com/stevez/playwright-repl/pull/108))
- **JS step debugger**: Step through JS scripts line-by-line with the Step button. The current line is highlighted in the editor. A debug session is created per run; clicking Stop cancels mid-run. ([#109](https://github.com/stevez/playwright-repl/pull/109), closes [#73](https://github.com/stevez/playwright-repl/issues/73))

### Removed

- **Export to Playwright**: The `.pw` → TypeScript export feature has been removed. The converter was unreliable for complex commands and covered only a subset of the command set. ([#110](https://github.com/stevez/playwright-repl/pull/110))

### Fixes

- **Recording cursor order**: Recorded actions no longer land before the initial `goto` line. The goto command now uses `insertAtCursor` directly — same code path as subsequent actions — so ordering is always correct. ([#111](https://github.com/stevez/playwright-repl/pull/111))

---

## v0.10.0 — Console Pane (Chrome DevTools Style)

**2026-03-07**

### Features

- **Console replaces Terminal tab**: The Terminal tab is gone. The Console is now the sole bottom pane — command input flows inline with output, Chrome DevTools style. Commands, results, errors, and code blocks all appear in a single scrollable history. ([#93](https://github.com/stevez/playwright-repl/issues/93), [#105](https://github.com/stevez/playwright-repl/pull/105))
- **CodeMirror 6 in Console input**: The Console input uses CodeMirror 6 — `.pw` syntax highlighting, command autocomplete with ghost text, and shared command history with the script editor (arrow up/down).
- **Three execution modes**: Input is auto-routed to the right executor:
  - `pw` — Playwright keyword commands (`click`, `fill`, `goto`, `snapshot`, …)
  - `playwright` — Playwright API expressions (`page.title()`, `expect(page.locator('h1')).toBeVisible()`)
  - `js` — Any other JavaScript, evaluated in the browser page via CDP
- **CDP object inspection**: `tab-list`, JS expressions, and Playwright API calls return expandable live objects — click arrays and objects to expand nested properties, just like Chrome DevTools.
- **Console output parity**: Editor runs and recording output render in the Console with full fidelity — accessibility tree snapshots (code block + Copy button), screenshots (lightbox + Save), error messages, success text.
- **Local Console commands**: `help`, `history`, `history clear`, `clear`, and `# comments` are handled locally — no server round-trip.
- **Clear button**: ⊘ in the Console header clears both output and the input field. Ctrl+L does the same.

### Removed

- **Aliases removed from extension**: Short aliases (`g`, `s`, `c`, `e`, `tl`, etc.) have been removed from the extension. They remain in the CLI. The Console's `detectMode` cannot reliably identify single-letter aliases — routing them to the wrong executor caused silent failures. Use full command names in the extension.
- **`run-code` sandbox iframe**: Removed. `run-code` now routes through `swDebugEval` like all Playwright commands.

### Fixes

- **`run-code` return value**: `run-code page.url()` now correctly returns the URL string instead of `"Done"`.
- **Standalone error lines**: Error `OutputLine`s dispatched by the Toolbar (e.g., recording failures) now render in the Console with `data-type="error"` styling.

---

## v0.9.0 — run-code Sandbox, Improved Recording & pnpm

**2026-03-05**

### Features

- **`run-code` sandbox iframe**: Commands now execute in an isolated `<iframe>` sandbox inside the panel page. Avoids CSP restrictions from the background service worker and enables direct access to `page`, `crxApp`, `expect`, and `activeTabId` on `globalThis` ([#50](https://github.com/stevez/playwright-repl/pull/50), [#53](https://github.com/stevez/playwright-repl/pull/53))
- **`expect()` in run-code**: Playwright's `expect` is now available inside `run-code` commands — `run-code await expect(page.locator('h1')).toBeVisible()` ([#52](https://github.com/stevez/playwright-repl/pull/52))
- **`verify-visible` command**: Assert an element is visible — `verify-visible "Submit"` / `verify-visible e5` ([#47](https://github.com/stevez/playwright-repl/pull/47))
- **`verify-value` improvements**: Ref-based value assertions now work with checkboxes, selects, and text inputs ([#47](https://github.com/stevez/playwright-repl/pull/47))
- **Attach button**: Toolbar now includes a manual **Attach** button to re-attach to the current tab without reopening the panel ([#49](https://github.com/stevez/playwright-repl/pull/49))
- **JSONL recording improvements**: CSS selector fallback for elements without accessible names; `verify-visible` and `verify-value` assertions are now recorded; better locator priority order ([#48](https://github.com/stevez/playwright-repl/pull/48))

### Internal

- **pnpm migration**: Switched from npm to pnpm workspaces. `workspace:*` protocol links local packages without hitting the registry ([#56](https://github.com/stevez/playwright-repl/pull/56))
- **playwright-crx 0.15.1**: Fixes service worker crash on attach ([#45](https://github.com/stevez/playwright-repl/pull/45))

### Fixes

- **README on npm**: Added `README.md` to `packages/cli/` so it is included in the published npm package (was empty on the registry)

---

## v0.8.0 — playwright-crx Migration (No External Server)

**2026-03-04**

### Breaking Changes

- **Extension no longer requires `playwright-repl --extension`** — The Chrome extension is now fully self-contained. It attaches directly to any Chrome tab via the `chrome.debugger` API using [`playwright-crx`](https://github.com/ruifigueiredo19/playwright-crx), with no external server or port needed. Load the extension in Chrome and start typing commands immediately.
- **Content-script recorder removed** — Recording now uses playwright-crx's built-in recorder (CDP-based), delivering more reliable capture with fewer injected scripts.

### Features

- **Self-contained extension** — Commands execute inside the service worker via `playwright-crx`. No `playwright-repl --extension` process needed.
- **Auto-attach** — Panel auto-attaches to the active tab when opened. Switching tabs automatically re-attaches.
- **Attach status indicator** — Toolbar shows a colored status dot and hostname (e.g. `example.com`) or "Not attached" / "Connecting…".
- **Tab switcher** — Dropdown lists all open tabs and re-attaches on selection, dispatching `ATTACH_START` / `ATTACH_SUCCESS` / `ATTACH_FAIL` through the reducer.
- **playwright-crx recorder** — Recording connects via a Chrome runtime port and receives JSONL actions from playwright-crx's built-in recorder; commands are translated to `.pw` syntax and appended to the editor in real time.
- **`"debugger"` permission** — Added to `manifest.json`; required for `chrome.debugger.attach()` used internally by playwright-crx.

### Architecture

Replaced the HTTP server IPC layer with `chrome.runtime.sendMessage`:

| Message type | Handler |
|---|---|
| `attach` | `crxApp.attach(tabId)` — attach to tab via CDP |
| `run` | `parseReplCommand(command)` → page function |
| `health` | Returns `{ ok: !!crxApp }` |
| `record-start` | `crxApp.recorder.show(...)` |
| `record-stop` | `crxApp.recorder.hide()` |

New source files: `commands.ts`, `page-scripts.ts` (ported from playwright-repl-crx), `panel/lib/bridge.ts`.
Deleted: `panel/lib/server.ts`, `content/recorder.ts`.

### Tests

- Rewrote `test/background.test.ts` — 19 tests covering all 5 message handlers
- Replaced `test/lib/server.test.ts` with `test/lib/bridge.test.ts` — 7 tests for `executeCommand`, `attachToTab`, `connectWithRetry`
- Updated `test/components/Toolbar.browser.test.tsx` — replaced server/health/port tests with attach-status and port-based recording tests
- Added 4 ATTACH\_\* tests to `test/reducer.test.ts`
- Updated E2E fixtures to intercept `chrome.runtime.sendMessage` instead of HTTP routes
- Deleted `e2e/recording/` (content-script recorder gone)

---

## v0.7.16 — Tab Switch Recording

**2026-03-04**

### Features

- **Tab switch recording**: Switching Chrome tabs during a recording session now automatically records a `tab-select N` command. The panel resolves the Playwright tab index by calling `tab-list` on the server (which sets the tab as current), parsing the `(current)` marker, and appending the command to the editor.

### Tests

- 3 new unit tests for `onActivated` handler in `background.test.ts` (sends `pw-tab-activated` with URL, skips when not recording, skips when tab has no URL)
- 5 new browser component tests for `pw-tab-activated` handling in `Toolbar.browser.test.tsx` (calls `tab-list` with correct URL, records `tab-select 0`, records `tab-select 2`, no-op when no `(current)` marker, no-op on server error)

---

## v0.7.15 — Popup Window Mode + Tab Switcher

**2026-03-04**

### Features

- **Popup window mode**: Right-click the extension icon → Options to choose "Side Panel" or "Popup Window". In popup mode, clicking the icon opens a standalone 450×700 popup with the REPL panel attached to the current tab (closes [#34](https://github.com/stevez/playwright-repl/issues/34))
- **Tab switcher**: Toolbar dropdown lets you re-attach the panel to any open browser tab — works in both side panel and popup modes
- **Preferences page**: New Options UI (right-click icon → Options) saves the open-as preference via `chrome.storage.local`

### Improvements

- **URL normalization in tab switching**: `selectPageByUrl` strips query params and hash fragments before comparing URLs, fixing mismatches caused by Chrome's internal params (e.g. `?zx=...&no_sw_cr=1`)
- **`/select-tab` HTTP endpoint**: New `CommandServer` endpoint lets the panel notify the engine when the active tab changes

### Tests

- 7 new unit tests for `Engine.selectPageByUrl` (exact match, query params, trailing slash, hash, multi-page index, no-op)
- 4 new unit tests for `POST /select-tab` in `CommandServer` (200 response, deduplication, URL change)
- 5 new browser component tests for the Toolbar tab switcher

---

## v0.7.14 — Focus Fix + Command Timeout

**2026-03-03**

### Bug Fixes

- **Focus restored after commands**: Removed `chrome.tabs.query()` IPC from the command path — it was the root cause of focus loss on every command. Active tab URL is now cached via `onActivated` listener only
- **Navigation focus**: `cmdInputRef.current?.focus()` called after `await runAndDispatch()` restores focus after `goto` and other navigation commands
- **Clear button**: Added `onMouseDown preventDefault` so the Clear button no longer steals focus from the input
- **First-command focus**: Removed initial `chrome.tabs.query` in `App.tsx` useEffect that caused focus loss on the very first command via async IPC timing

### Improvements

- **30s command timeout**: `executeCommand` now uses `AbortController` to abort hung fetch requests after 30 seconds, preventing the extension from locking up when a Playwright command hangs (e.g. `goto` with "Frame was detached")
- **React 19 ref**: Simplified `CommandInput` from `forwardRef` to a plain function component using React 19's native `ref` prop

## v0.7.8 — CodeMirror 6 Editor

**2026-03-02**

### Features

- **CodeMirror 6 editor**: Replaced plain `<textarea>` with CodeMirror 6 for a proper code editing experience
  - Built-in undo/redo (Ctrl+Z / Ctrl+Y)
  - Search & replace (Ctrl+F)
  - Line numbers via CM6 gutter
  - Active line highlighting
  - Bracket matching
  - Pass/fail gutter markers (✓/✗) for run results
  - Current run line highlighting
  - Placeholder text when empty

### Improvements

- **E2E test selectors**: Replaced brittle CSS ID selectors with `getByTestId` and `getByRole` locators
- Added `data-testid` attributes to editor pane, output, prompt, run button, and record button

## v0.7.7 — Toolbar Icons

**2026-03-01**

### Improvements

- **Toolbar icons**: Replaced text labels (Open, Save, Record/Stop, Export) with SVG icons for a cleaner, more compact toolbar
- Added `FolderOpenIcon`, `SaveIcon`, `RecordIcon`, `StopIcon`, `ExportIcon` components
- Adjusted button padding and centering for icon-only buttons

## v0.7.6 — Chaining Selectors with >>

**2026-03-01**

### Features

- **`>>` chaining**: Use Playwright's chained selector syntax with any interaction command (closes [#16](https://github.com/stevez/playwright-repl/issues/16))
  - `click ".nav >> button"` → `page.locator(".nav >> button").click()`
  - `fill ".form >> input" "hello"` → `page.locator(".form >> input").fill("hello")`
  - Works with: click, dblclick, hover, check, uncheck, fill, select
  - Supports both quoted (`click ".nav >> button"`) and unquoted (`click .nav >> button`) syntax

## v0.7.5 — Highlight Command

**2026-03-01**

### Features

- **`highlight` command**: Visualize which elements a locator matches with `highlight <locator>` (closes [#14](https://github.com/stevez/playwright-repl/issues/14))
  - CSS selectors: `highlight .btn` → `page.locator(".btn").highlight()`
  - Text matching: `highlight Submit` → `page.getByText("Submit").highlight()`
  - Auto-detects selector vs text based on CSS-like characters (`.#[]>:=`)
- **`hl` alias**: Short alias for `highlight` (e.g., `hl .btn`)
- **Autocomplete**: `highlight` appears in ghost text suggestions

## v0.7.4 — CLI .clear and .history Commands

**2026-03-01**

### Features

- **`.clear` command**: Clears terminal output in the CLI REPL (closes [#15](https://github.com/stevez/playwright-repl/issues/15))
- **`.history` command**: Shows commands entered in the current session
- **`.history clear` command**: Clears the current session history
- **Ghost text for new commands**: `.clear`, `.history`, and `.history clear` now appear in autocomplete suggestions
- **Multi-word ghost text**: Ghost text now supports commands with spaces (e.g., typing `.history ` suggests `clear`)

## v0.7.3 — Unified Verify Command

**2026-03-01**

### Features

- **Unified `verify` command**: Single command with sub-types replaces individual `verify-*` commands. All sub-types:
  - `verify title "Hello"` — assert page title contains text
  - `verify url "/about"` — assert page URL contains text
  - `verify text "Welcome"` — assert text is visible
  - `verify no-text "Gone"` — assert text is not visible
  - `verify element button "Submit"` — assert element exists by role and name
  - `verify no-element link "Delete"` — assert element does not exist
  - `verify value e5 "hello"` — assert input value (ref-based)
  - `verify list e3 "a" "b"` — assert list contains items (ref-based)
- **`v` alias**: Short alias for `verify` (e.g., `v title "Hello"`)
- **Legacy compatibility**: Old `verify-*` commands (`verify-text`, `verify-element`, `verify-title`, `verify-url`, `verify-no-text`, `verify-no-element`) continue to work as aliases

### New page-script functions

- `verifyTitle(page, text)` — throws if `page.title()` does not contain text
- `verifyUrl(page, text)` — throws if `page.url()` does not contain text
- `verifyNoText(page, text)` — throws if text is still visible on page
- `verifyNoElement(page, role, name)` — throws if element still exists

### Fixed

- **`verify-element` / `verify-no-element` converter**: Now correctly exports `getByRole("button", { name: "Submit" })` instead of incorrect `getByText("Submit")` for Playwright test export

### Tests

- 38 new tests across all packages:
  - 8 page-script function tests (`verifyTitle`, `verifyUrl`, `verifyNoText`, `verifyNoElement`)
  - 9 processline routing tests (unified verify sub-type dispatch)
  - 10 converter export tests (Playwright `expect` assertions)
  - 3 completion-data tests (verify entries present)
  - 5 autocomplete tests (ghost text and match filtering)
  - 11 E2E command tests (real browser, full stack)
- Total: ~470 tests across all packages

---

## v0.7.2 — Command History & Ghost Text Fix

**2026-03-01**

### Features

- **`history` command**: Type `history` in the extension prompt to view command history. `history clear` clears it. Both are local commands — no server connection needed.
- **Command history module**: Refactored from React hook (`useCommandHistory`) to plain module-level store (`lib/command-history.ts`). No React dependencies, shared via ES module singleton.

### Fixed

- **Ghost text persists on complete commands**: Typing a complete command name (e.g., `history`) no longer shows ghost suggestions for longer matches (e.g., `history clear`). Ghost text now stops when input exactly matches a known command.
- **`history clear` leaking into history**: Local commands (`help`, `clear`, `history`, `history clear`) are no longer recorded in command history. Only server commands appear in arrow-up recall.

---

## v0.7.1 — Dark Mode & Bug Fixes

**2026-03-01**

### Features

- **Dark mode toggle**: Sun/moon SVG button in the extension toolbar. Toggles `.theme-dark` CSS class on the document root, switching all CSS variables instantly. Preference persisted via `localStorage`.

### Fixed

- **Extension spawn path**: `--load-extension` now correctly points to `packages/extension/dist` (where `manifest.json` lives) instead of `packages/extension`.

---

## v0.7.0 — Extension React & Tailwind Migration

**2026-02-28**

### Extension — Complete Rewrite

- **React migration**: Rewrote the extension side panel from vanilla TypeScript (1,066-line `panel.ts`) to React with `useReducer` state management. Six components: `Toolbar`, `EditorPane`, `ConsolePane`, `CommandInput`, `Splitter`, `Lightbox`.
- **Tailwind CSS v4**: Migrated ~750 lines of custom CSS to Tailwind utility classes. `panel.css` reduced to ~211 lines (theme variables, toolbar buttons, pseudo-elements, scrollbars).
- **Connection status indicator**: Live status dot (green/red) with 30-second health polling and editable port number.
- **Improved tab targeting**: Each command now sends the active tab URL for correct tab targeting.
- **Unified timeouts**: Action and navigation timeouts standardized to 5s/15s.
- **Command list cleanup**: Removed CLI-only commands from extension, show raw text for non-sectioned responses.
- **Help command**: Added `help` command synced with core command list.

### Technical Details

- **Component architecture**: `App` → `Toolbar` + `Splitter(EditorPane, ConsolePane(CommandInput))` + `Lightbox`
- **State**: Single `useReducer` with actions: `EDIT_EDITOR_CONTENT`, `ADD_LINE`, `RUN_START/STOP`, `SET_LINE_RESULT`, `STEP_INIT/ADVANCE`, `CLEAR_CONSOLE`, etc.
- **Testing**: `data-testid` and `data-type` attributes for test selectors instead of CSS class selectors. Browser-based component tests via `vitest-browser-react`.
- **Build**: Vite with `@tailwindcss/vite` and `@vitejs/plugin-react` plugins.

### Tests

- 535 total tests across all packages (157 CLI + 82 core + 158 extension unit + 80 extension component + 58 extension E2E).

---

## v0.6.0 — Multi-file Replay & Log Reports

**2026-02-22**

### Features

- **Multi-file replay**: `--replay` now accepts multiple files and/or folders. Files run sequentially in a shared browser session; on failure, continues to the next file and reports a summary at the end.
  ```bash
  playwright-repl --replay examples/             # all .pw files in folder
  playwright-repl --replay a.pw b.pw c.pw        # specific files
  playwright-repl --replay examples/ extra.pw    # mix folders and files
  ```
- **Replay log file**: Every multi-file replay writes a `replay-<timestamp>.log` with per-command OK/FAIL results and a summary. The log file is the test report.
- **Error tracking**: `isError` results from the engine (e.g., `verify-text` failures) are now correctly counted. Previously only thrown exceptions were tracked.

### Examples

- Added `localstorage-clear` cleanup to all TodoMVC examples (01–06) so they work in multi-file replay without state leaking between files.
- New `07-test-click-nth.pw` — tests `--nth` disambiguation on playwright.dev.
- New `08-localstorage.pw` — tests `localstorage-list`, `localstorage-clear`, and `reload` to verify storage commands work correctly.

### CI

- Added CLI E2E step to GitHub Actions: runs `playwright-repl --replay examples/` alongside unit tests.

### Tests

- 9 new unit tests for `resolveReplayFiles` and `runMultiReplayMode` (157 CLI tests total).
- 399 total tests across all packages (157 CLI + 82 core + 160 extension).

---

## v0.5.0 — Extension Mode & TypeScript

**2026-02-22**

### Breaking Changes

- **Requires Node.js >= 20** (was >= 18)
- **TypeScript throughout** — all three packages now compiled from TypeScript

### Features

- **Extension mode** (`--extension`): Chrome side panel extension with REPL input, script editor, visual recorder, and export to Playwright tests. Uses direct CDP connection — Engine connects to Chrome via `--remote-debugging-port`.
- **CommandServer**: HTTP server (`POST /run`, `GET /health`) relays commands from the extension panel to the Engine.
- **Recording**: Extension-side recorder captures clicks, form input, selections, checkboxes, and key presses with automatic `--nth` disambiguation for ambiguous text locators.
- **Suppress snapshot for non-snapshot commands**: `goto` now shows only URL and title instead of the full accessibility tree.
- **Text locator `--nth` support**: `click "npm" --nth 1` to target a specific match when multiple elements share the same text.

### Technical Details

- **TypeScript migration**: `packages/core` and `packages/cli` compiled via `tsc --build` with project references; `packages/extension` compiled via Vite.
- **`tsc --build`** handles dependency ordering (core before cli) automatically.
- **Module resolution**: `NodeNext` (tracks latest Node.js module behavior).
- **Testing**: 390+ unit tests (vitest) + 59 E2E tests (Playwright Test) across 3 packages.
- **Extension E2E**: Launches Chrome with the extension loaded, tests panel rendering, command execution, recording, and theme switching.

### Removed

- Stale planning docs (PLAN-CRX.md, PLAN-RECORDING.md, PLAN-TYPESCRIPT.md, MIGRATION_PLAN.md)
- Architecture diagram PNGs (outdated after extension mode redesign)
- `packages/repl-ext/` (moved to separate `playwright-repl-crx` repo)

---

## v0.4.0 — In-Process Engine & Monorepo

**2026-02-18**

### Breaking Changes

- **No more daemon**: The Playwright MCP daemon is replaced by an in-process `Engine` class. No socket, no background process — commands execute directly via `BrowserServerBackend`.
- **Removed `playwright-mcp-server` binary**: The MCP server is no longer bundled. Use Playwright's own MCP server instead.
- **Removed session commands**: `list`, `close-all`, `kill-all` are no longer needed (no daemon to manage).

### Features

- **In-process Engine** (`packages/core/src/engine.ts`): Wraps Playwright's `BrowserServerBackend` directly — faster startup, simpler architecture, no IPC overhead.
- **Connect mode** (`--connect [port]`): Attach to an existing Chrome instance via CDP. Start Chrome with `--remote-debugging-port=9222`, then `playwright-repl --connect`.
- **Monorepo structure**: Restructured into `packages/core` (engine + utilities) and `packages/cli` (REPL + recorder) using npm workspaces.

### Removed

- `src/connection.mjs` — DaemonConnection (Unix socket client)
- `src/workspace.mjs` — daemon startup, socket paths
- `bin/daemon-launcher.cjs` — daemon launcher
- `bin/mcp-server.cjs` — MCP server binary

### Technical Details

- Engine uses dependency injection for testability — Playwright internals loaded lazily via absolute path resolution to bypass the `exports` map
- 214 tests (147 cli + 67 core) across 10 test files

---

## v0.3.0 — Page Scripts & run-code

**2026-02-17**

### Features

- **`run-code` auto-wrap**: Type Playwright code directly — no boilerplate needed
  - `run-code page.title()` → auto-wraps as `async (page) => { return await page.title() }`
  - `run-code await page.click('a')` → wraps without `return` for statement keywords
  - `run-code async (page) => ...` → pass-through for full function expressions
- **Raw parsing for `run-code` / `eval`**: Expressions are preserved as a single raw string — parentheses, braces, quotes, and operators no longer get split by the tokenizer
- **Red error messages**: Daemon errors (`### Error` sections) now display in red
- **Verify commands**: `verify-text`, `verify-element`, `verify-value`, `verify-list` now use real functions via `buildRunCode` instead of template strings

### Refactored

- **Page scripts module** (`src/page-scripts.mjs`): Extracted all run-code templates into real async functions (`verifyText`, `actionByText`, `fillByText`, etc.) — testable, readable, no manual escaping
- **`buildRunCode` helper**: Converts real functions to daemon-compatible code strings using `fn.toString()` + `JSON.stringify()`
- **Consolidated `actionByText`**: Merged `clickByText`, `dblclickByText`, `hoverByText` into a single function with dynamic dispatch via `loc[action]()`
- **Removed `esc()` helper and ~150 lines of template strings** from `repl.mjs`

### Fixed

- **Ghost completion for prefix commands**: Typing "close" now correctly cycles to both "close" and "close-all" (previously only showed "close-all")
- **Removed Tab-on-empty-line**: No longer shows all commands when pressing Tab on empty input

### Tests

- 100 new tests (154 → 254 total across 13 test files)
- New `test/page-scripts.test.mjs` — 21 tests for page-script functions and `buildRunCode`
- Daemon-compatibility test: verifies generated code is a valid function expression

---

## v0.2.1 — Ghost Completion

**2026-02-17**

### Features

- **Ghost completion**: Fish-shell style inline suggestions — type a prefix and see dimmed suggestion text after the cursor
  - **Tab** cycles through matches (e.g., `go` → goto, go-back, go-forward)
  - **Right Arrow** accepts the current suggestion
- Aliases excluded from ghost suggestions (still work when typed)

### Removed

- Removed readline's built-in Tab completer (replaced entirely by ghost completion)

---

## v0.2.0 — MCP Server

**2026-02-16**

### Features

- **MCP Server**: Ships a stdio MCP server (`playwright-mcp-server`) that exposes Playwright's full browser automation toolkit to AI agents (Claude, Cursor, etc.)
- Supports `--headed` flag for visible browser mode

### Configuration

VS Code / Cursor — add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["-p", "playwright-repl", "playwright-mcp-server", "--headed"]
    }
  }
}
```

---

## v0.1.1 — Bug Fixes

**2026-02-12**

### Fixes

- **`kill-all` on Windows 11**: Replace deprecated `wmic` with PowerShell `Get-CimInstance` — fixes `'wmic' is not recognized` error on modern Windows
- **Text locator case sensitivity**: `click`, `dblclick`, and `hover` now use a fallback chain (exact text → button role → link role → substring match) so `click "GET STARTED"` works even when the DOM text is "Get Started"

### Tests

- Updated tests for new text locator fallback chain and PowerShell kill-all

---

## v0.1.0 — Initial Release

**2026-02-09**

First public release of playwright-repl — an interactive REPL for Playwright browser automation.

### Features

**Interactive REPL**
- Persistent socket connection to the Playwright daemon (zero overhead per command)
- 50+ browser commands with short aliases (`c` for click, `s` for snapshot, etc.)
- Tab completion for commands, aliases, and meta-commands
- Command history (persisted across sessions)
- Automatic daemon startup and connection management
- Auto-reconnect on daemon disconnect

**Session Recording & Replay**
- Record browser interactions to `.pw` files (plain text, one command per line)
- Replay recorded sessions at full speed or step-by-step
- Pause/resume recording mid-session
- Start recording from CLI (`--record`) or inside the REPL (`.record`)

**Assertions**
- `verify-text` — assert text is visible on the page
- `verify-element` — assert element exists by role and accessible name
- `verify-value` — assert input/select/checkbox value
- `verify-list` — assert list contains expected items

**Browser Commands**
- Navigation: `goto`, `go-back`, `go-forward`, `reload`
- Interaction: `click`, `dblclick`, `fill`, `type`, `press`, `hover`, `select`, `check`, `uncheck`, `upload`, `drag`
- Inspection: `snapshot`, `screenshot`, `eval`, `console`, `network`, `run-code`
- Tabs: `tab-list`, `tab-new`, `tab-close`, `tab-select`
- Storage: cookies, localStorage, sessionStorage (list/get/set/delete/clear)
- Auth state: `state-save`, `state-load`
- Network: `route`, `route-list`, `unroute`
- Dialogs: `dialog-accept`, `dialog-dismiss`
- Layout: `resize`, `pdf`
- Sessions: `list`, `close`, `close-all`, `kill-all`

**CLI Options**
- `--headed` — visible browser mode
- `--browser` — choose chrome, firefox, webkit, or msedge
- `--session` — named sessions for parallel workflows
- `--persistent` / `--profile` — persistent browser profiles
- `--replay` / `--step` — session replay from CLI
- `--record` — start with recording enabled
- `--silent` — quiet mode for scripting

**Cross-Platform**
- Linux, macOS, Windows
- Unix sockets (Linux/macOS) and named pipes (Windows)

### Technical Details

- Pure ESM JavaScript (no build step, no TypeScript)
- Connects to Playwright's MCP terminal daemon over Unix socket / named pipe
- Wire-compatible with `playwright-cli` — produces identical JSON messages
- Requires `playwright >= 1.59.0-alpha` (daemon code in `lib/mcp/terminal/`)
- 218 tests at initial release

### Known Limitations

- Low-level keyboard commands (`keydown`, `keyup`) not yet mapped
- Low-level mouse commands (`mousemove`, `mousedown`, `mouseup`, `mousewheel`) not yet mapped
- Tracing (`tracing-start`, `tracing-stop`) not yet mapped
- Video recording (`video-start`, `video-stop`) not yet mapped
- Element refs (e.g., `e5`) are ephemeral — they change between snapshots
