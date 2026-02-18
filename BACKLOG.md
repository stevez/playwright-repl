# Backlog

## High Priority

- [ ] **History loads in wrong order** — `src/repl.mjs:664`: `.reverse()` before `.push()` means Up arrow shows oldest commands first instead of most recent
- [ ] **String escaping misses newlines** — `src/repl.mjs:28`: `esc()` for verify commands doesn't escape `\n`, `\r`, `\t` — multiline user input breaks generated code
- [ ] **Ghost completion crash on empty array** — `src/repl.mjs:592`: `renderGhost(matches[0])` has no guard if `cmds` is empty

## Medium Priority

- [ ] **Failed commands not recorded** — `src/repl.mjs:408`: `session.record(line)` only runs after success; replay files miss failed commands
- [ ] **History write errors silently swallowed** — `src/repl.mjs:473`: `catch {}` hides disk-full or permission errors
- [ ] **Playwright version too loose** — `package.json:47`: `>=1.59.0-alpha` accepts any future version; pin to `<1.60.0` or similar
- [ ] **README lists commands that don't exist** — storage commands like `cookie-set`, `cookie-delete`, `localstorage-set` etc. are documented but not in COMMANDS

## Low Priority

- [ ] **killAll process filter too broad** — matches any process containing `run-mcp-server`, could hit unrelated processes
- [ ] **Redundant empty-line check in processQueue** — the queue only contains non-empty lines
