# Backlog

## High Priority

- [ ] **History loads in wrong order** — `packages/cli/src/repl.ts`: `.reverse()` before `.push()` means Up arrow shows oldest commands first instead of most recent
- [ ] **Dark mode toggle** — Add a toggle button to the extension toolbar to switch between light/dark themes. The `.theme-dark` CSS variables already exist in `panel.css` but nothing applies them. Plan: `useState` in `App.tsx`, pass `isDark`/`onToggleTheme` to `Toolbar`, wrap children in a div with `theme-dark` class, move `background`/`color` from `html,body` to `#root` in CSS, persist with `localStorage`.
- [x] **Extension spawn path bug** — `engine.ts:133` resolves `--load-extension` to `packages/extension` instead of `packages/extension/dist`. Chrome needs the folder containing `manifest.json`, which is in `dist/`. Fix: append `/dist` to the resolved path.
- [ ] **Auto-inject `expect` in `run-code`** — auto-prepend `const { expect } = require('@playwright/test')` in the `run-code` auto-wrap so users can write `run-code await expect(page).toHaveTitle('Todo')` without manual imports

## Medium Priority

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
