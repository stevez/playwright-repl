# Stagecraft Plan — T2 Tax Return Use Case

Issue: https://github.com/stevez/playwright-repl/issues/829

## Use Case

Automate T2 tax return preparation: download bills from various websites, extract into Excel, compile for filing. This is repeated annual work with many different bill sources. Use Stagecraft to generate .pw files, create skills, manage them, and expose to Claude Cowork.

## What .pw Skills Can and Can't Do

`.pw` files are browser keyword commands (`goto`, `click`, `fill`, `snapshot`, `press`, etc.). They **only navigate and interact** with the browser — they cannot download files, read PDFs, write Excel, or do computation.

A `.pw` skill can navigate to a billing page, click through menus, and click the "Download" button — but the actual file download is a browser/OS-level action outside `.pw` scope.

```
.pw skills (browser navigation):     Agent responsibilities (everything else):
├── navigate-to-bell-bill.pw         ├── Handle file downloads
├── navigate-to-hydro-bill.pw        ├── Read downloaded PDFs
├── navigate-to-insurance-bill.pw    ├── Extract fields (date, amount, vendor, category)
└── ...                              ├── Compile into Excel
                                     └── Categorize for T2 filing
```

The agent **orchestrates**: calls .pw skills to navigate the browser to the right place, then handles downloads, extraction, and processing with its own capabilities.

## Skills Structure

```
skills/
├── tax/
│   ├── download-bell-bill/
│   │   ├── SKILL.md
│   │   └── download-bell-bill.pw
│   ├── download-hydro-bill/
│   │   ├── SKILL.md
│   │   └── download-hydro-bill.pw
│   └── download-insurance-bill/
│       ├── SKILL.md
│       └── download-insurance-bill.pw
```

Each skill = `SKILL.md` (metadata) + `.pw` recipe (browser automation steps only).

### SKILL.md Format

```markdown
name: download-bell-bill
description: Download latest Bell Canada bill as PDF
preconditions: Must be logged into bell.ca (or have credentials in vault)
parameters:
  - billing_period: "2025-Q4" (optional, defaults to latest)
output: PDF file path
category: tax/bills/telecom
```

## Design Decisions

### Authentication / Session Reuse

Two approaches:

1. **Bridge mode** (primary) — connect to user's real Chrome session via Dramaturg bridge. User is already logged into bill sites. Cowork runs skills against existing cookies/sessions.
2. **Headless with credential vault** (future) — skills carry auth steps, credentials stored securely. For unattended/scheduled runs.

Bridge mode is the natural starting point for this use case.

### Skill Authoring Flow

1. Open bill site in Chrome with Dramaturg installed
2. Record the navigation flow (login, find billing page, download PDF)
3. Dramaturg produces a `.pw` file
4. Run `stagecraft skill create download-bell-bill` — wraps .pw with SKILL.md
5. Test: `stagecraft skill run download-bell-bill`
6. Repeat for each bill source

### Consumption by Agents (Cowork)

The agent (Cowork/Claude) is the orchestrator. It uses the existing `run_command` MCP tool for everything — navigation, recording, replay. No new MCP tools needed.

The agent's knowledge of how to record and use skills comes from a **skill file / agent.md** — instructions, not code:

```markdown
# Skill: Record a browser workflow

When asked to create a .pw script for a repeated task:
1. run_command("start-recording <name>.pw")
2. Navigate the site using run_command (goto, click, fill, etc.)
3. run_command("stop-recording")

The recorder converts ref IDs to stable text locators automatically.

To replay a saved skill:
1. run_command("replay <name>.pw")
```

The agent decides which bills to fetch, records reusable .pw scripts, then handles downloads, PDF parsing, and Excel compilation with its own capabilities.

### Stagecraft Components (Driven by Use Case)

No new MCP tools needed. Recording and replay are `.pw` commands exposed through the existing `run_command` tool. Agent knowledge lives in skill files / agent.md.

| Need | How |
|------|-----|
| Record a workflow | `start-recording` / `stop-recording` commands (via `run_command`) |
| Replay a workflow | `replay <name>.pw` command (via `run_command`) |
| Agent knows how to use them | Skill file / agent.md with instructions |
| Store .pw files + metadata | Skills library (filesystem) |
| List / manage skills | CLI `stagecraft list` (future) |
| See what's happening | Web dashboard (nice-to-have, future) |

## Implementation Phases

### Phase 1: Recording Commands

- Add `start-recording` / `stop-recording` as .pw commands in `packages/core`
- Move `SessionRecorder` from `packages/cli` to `packages/core` (shared by CLI + MCP)
- Add ref-to-locator resolution using snapshot data at record time
- Both CLI and MCP get recording for free through existing `run_command`

### Phase 2: Prove the Loop

- Write a skill file (agent.md) with recording instructions
- Have Cowork record 2-3 bill navigation flows via MCP
- Verify the output .pw files use stable text locators
- Replay them — confirm they work across sessions
- Document friction

### Phase 3: Skill Library

- Define SKILL.md schema (metadata + parameters)
- Skills directory convention (where skills live on disk)
- CLI `stagecraft list` / `stagecraft run <skill>`

### Phase 4: Dashboard (future)

- Web dashboard: execution log, skills catalog
- Error handling: session expired, element not found, retry logic

## Ref-to-Locator Conversion

### Problem

When an AI agent navigates via MCP, it uses ephemeral ref IDs (`click e5`). These break on replay because refs are reassigned each `snapshot`. Human recording via Dramaturg captures stable DOM locators, but AI-side recording does not.

### Solution: Resolve at Record Time Using Snapshot

The snapshot already maps every ref to its accessible name and role. Conversion is just a lookup — must happen at record time because the mapping only exists during the session.

```
Snapshot contains:   e5 → "Download Bill" (button)
                     e12 → "View Statement" (link)

Agent runs:          click e5        → recorder writes: click "Download Bill"
                     click e12       → recorder writes: click "View Statement"
```

No post-processing needed. The recorder intercepts each command, looks up the ref in the current snapshot, and writes the stable locator directly.

### Where it lives

- `packages/core` — recorder + ref-to-locator resolution (shared by CLI and MCP)
- Automatic: every recorded command uses stable locators
- Edge case: if a ref has no accessible name, flag for manual review

## Template Variables in .pw Files

`.pw` files support `{{variable}}` placeholders, substituted at replay time via `--variable key=value`:

```pw
goto https://www.rogers.com/consumer/self-serve/overview
click "View your bill"
click "Save PDF"
check "{{billing_period}}"
click "Download bills"
```

```
replay skills/rogers/download-bill.pw --variable billing_period="January 24, 2026"
```

### How it works

- `replay` reads the .pw file, replaces `{{key}}` with the `--variable key=value` arg, then runs each line
- Multiple variables: `--variable a="x" --variable b="y"`
- No loops, no conditionals — just string replacement
- For complex logic (loops, conditionals), use `.js` skills instead

### Agent workflow

The agent:
1. Reads SKILL.md to know what variables are needed
2. Reads the page (snapshot) to discover available values
3. Calls `replay` with the right `--variable` args
4. For multiple values (e.g. 3 billing periods), calls `replay` 3 times or generates the script itself

### .pw vs .js skills

- `.pw` — simple, replayable, parameterized with `{{variables}}`
- `.js` — full Playwright API, loops, conditionals, complex logic
- Both live in the skills directory, SKILL.md describes which to use

## Open Questions

- Where do skills live on disk? Per-project? Global `~/.stagecraft/skills/`?
- How does output pass between skills? (e.g., downloaded PDF path -> extract step)
- How to handle sites that require 2FA during automation?
- Should SKILL.md support versioning/changelog?
- How much intelligence goes in the skill vs. the agent? (e.g., does the skill handle "bill not found" or does the agent?)
