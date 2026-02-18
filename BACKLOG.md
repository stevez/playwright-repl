# Backlog

## High Priority

- [ ] **History loads in wrong order** — `packages/cli/src/repl.mjs`: `.reverse()` before `.push()` means Up arrow shows oldest commands first instead of most recent
- [ ] **String escaping misses newlines** — `packages/cli/src/repl.mjs`: `esc()` for verify commands doesn't escape `\n`, `\r`, `\t` — multiline user input breaks generated code
- [ ] **Ghost completion crash on empty array** — `packages/cli/src/repl.mjs`: `renderGhost(matches[0])` has no guard if `cmds` is empty

## Medium Priority

- [ ] **Failed commands not recorded** — `packages/cli/src/repl.mjs`: `session.record(line)` only runs after success; replay files miss failed commands
- [ ] **History write errors silently swallowed** — `packages/cli/src/repl.mjs`: `catch {}` hides disk-full or permission errors
- [ ] **Playwright version too loose** — `packages/cli/package.json`: `>=1.59.0-alpha` accepts any future version; pin to `<1.60.0` or similar
- [ ] **README lists commands that don't exist** — storage commands like `cookie-set`, `cookie-delete`, `localstorage-set` etc. are documented but not in COMMANDS

## Low Priority

- [ ] **Convert to TypeScript** — migrate `.mjs` files to `.ts` across `packages/core` and `packages/cli` for type safety and better IDE support
- [ ] **Extension server (Phase 8)** — `playwright-repl --extension` starts a WebSocket server; extension connects as thin CDP relay instead of reimplementing all commands
