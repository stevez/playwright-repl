# Backlog

## High Priority

- [x] **Unified `verify` command** — Single `verify` command with sub-types: `verify title "Hello"`, `verify url "/about"`, `verify text "Welcome"`, `verify no-text "Gone"`, `verify element button "Submit"`, `verify no-element button "Submit"`, `verify value e5 "hello"`, `verify list e3 "a" "b"`. Uses `String.includes()` for title/url. Old `verify-*` commands kept as aliases. `query` dropped — `eval` covers the same use cases.
- [x] **History loads in wrong order** — Investigated: current `.reverse()` + `.push()` logic is actually correct (newest at index 0). Not a bug.
- [x] **Dark mode toggle** — Sun/moon SVG toggle in Toolbar, `useEffect` toggles `.theme-dark` class on `<html>`, persisted via `localStorage`.
- [x] **Extension spawn path bug** — `engine.ts:133` resolves `--load-extension` to `packages/extension` instead of `packages/extension/dist`. Chrome needs the folder containing `manifest.json`, which is in `dist/`. Fix: append `/dist` to the resolved path.
- [x] **Auto-inject `expect` in `run-code`** — Not feasible: Playwright's `browser_run_code` uses `vm.createContext()` with only `page` in scope; `require()` is not available in the sandbox.

## Medium Priority
- [ ] **Upgrade editor to CodeMirror 6** — Replace plain `<textarea>` in `EditorPane.tsx` with CodeMirror 6 (~30KB gzipped). Gains: syntax highlighting, proper selections, undo/redo, search. Potential custom `.pw` syntax mode later.
- [ ] **Toolbar icons** — Replace text buttons (Open, Save, Export) with SVG icons in `Toolbar.tsx`, similar to existing sun/moon toggle in `Icons.tsx`.
- [ ] **Editor context menu** — Right-click menu in the editor with: Run line, Copy, Export to TypeScript, Copy to clipboard.
- [ ] **Capture locator** — "Pick element" mode: user clicks on the page, extension captures a Playwright locator string (`getByRole(...)`, `getByText(...)`) via `chrome.scripting.executeScript` overlay, similar to recorder.
- [ ] **Extract shared `resolveArgs`** — The verify-command translation, text-locator resolution, and run-code auto-wrap logic is duplicated between `extension-server.ts` and `repl.ts`. Extract to a shared `core` utility.
- [ ] **Failed commands not recorded** — `packages/cli/src/repl.ts`: `session.record(line)` only runs after success; replay files miss failed commands
- [ ] **History write errors silently swallowed** — `packages/cli/src/repl.ts`: `catch {}` hides disk-full or permission errors
- [ ] **Playwright version too loose** — `packages/cli/package.json`: `>=1.59.0-alpha` accepts any future version; pin to `<1.60.0` or similar
- [ ] **Publish CLI to npm** — Requires fixing `file:../core` dependency (bundle core into CLI or publish core separately) and waiting for Playwright 1.59 stable.

## Low Priority

- [ ] **Improve README structure** — Consider splitting README into per-package docs (`packages/cli/README.md`, `packages/extension/README.md`) with a concise root README linking to both.
- [x] **Convert to TypeScript** — All packages migrated to TypeScript.
- [x] **Extension server (Phase 8)** — `playwright-repl --extension` starts HTTP server; extension connects as thin CDP relay.
- [x] **Restructure the extension code structure** — Extension has `src/` folder with React components, Vite build step.
- [x] **Tailwind CSS migration** — Extension panel styles migrated from custom CSS to Tailwind v4 utility classes.
