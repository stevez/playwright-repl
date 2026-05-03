---
name: playwright-repl
description: Automate browser interactions using playwright-repl keyword commands and JavaScript.
allowed-tools: Bash(pw-cli:*) Bash(playwright-repl:*)
---

# Browser Automation with playwright-repl

## Quick start

```bash
# Start the HTTP server (keeps browser session alive)
playwright-repl --http

# In another terminal, send commands via pw-cli:
pw-cli "goto https://example.com"
pw-cli snapshot
pw-cli "click e15"
pw-cli "fill e5 user@example.com"
pw-cli screenshot
```

## Prerequisites

The `pw-cli` shorthand sends commands via HTTP to a running playwright-repl session. Start one first:

**Standalone mode** — launch own browser:
```bash
playwright-repl --http                    # headed (default)
playwright-repl --http --headless         # headless
```

**Connect mode** — attach to your real Chrome (cookies, sessions intact):
```bash
playwright-repl --connect --http          # requires Dramaturg Chrome extension
```

Both modes support `--http-port <port>` (default: 9223).

When using a custom port, pass it to pw-cli:
```bash
pw-cli --http-port 9224 "snapshot"
```

## Commands

### Core

```bash
pw-cli "goto https://example.com"
pw-cli snapshot
pw-cli "click e3"
pw-cli "click Submit"
pw-cli "dblclick e7"
pw-cli "fill e5 user@example.com"
pw-cli "type search query"
pw-cli "press Enter"
pw-cli "hover e4"
pw-cli "select e9 option-value"
pw-cli "check e12"
pw-cli "uncheck e12"
pw-cli "drag e2 e8"
pw-cli "upload e10 ./document.pdf"
pw-cli screenshot
pw-cli "pdf"
pw-cli "close"
```

### Navigation

```bash
pw-cli "goto https://example.com"
pw-cli "go-back"
pw-cli "go-forward"
pw-cli "reload"
```

### Keyboard

```bash
pw-cli "press Enter"
pw-cli "press Tab"
pw-cli "press Escape"
pw-cli "press ArrowDown"
```

### Inspection

```bash
pw-cli snapshot
pw-cli screenshot
pw-cli "highlight Submit"
pw-cli "eval document.title"
pw-cli "eval el => el.textContent e5"
pw-cli "console"
pw-cli "network"
# Convert snapshot ref to Playwright locator
pw-cli "locator e5"
# → getByRole('button', { name: 'Submit' })
# Under the hood: (await page.locator('aria-ref=e5').normalize()).toString()
```

### Assertions

```bash
pw-cli "verify-text Welcome"
pw-cli "verify-no-text Error"
pw-cli "verify-element button Submit"
pw-cli "verify-value e5 user@example.com"
pw-cli "verify-list e10 Item 1, Item 2"
pw-cli "verify-title My Page"
pw-cli "verify-url /dashboard"
```

### Tabs

```bash
pw-cli "tab-list"
pw-cli "tab-new https://example.com"
pw-cli "tab-select 0"
pw-cli "tab-close"
```

### Storage

```bash
# Cookies
pw-cli "cookie-list"
pw-cli "cookie-get session_id"
pw-cli "cookie-set session_id abc123"
pw-cli "cookie-delete session_id"
pw-cli "cookie-clear"

# localStorage
pw-cli "localstorage-list"
pw-cli "localstorage-get theme"
pw-cli "localstorage-set theme dark"
pw-cli "localstorage-delete theme"
pw-cli "localstorage-clear"

# sessionStorage
pw-cli "sessionstorage-list"
pw-cli "sessionstorage-get step"
pw-cli "sessionstorage-set step 3"
pw-cli "sessionstorage-delete step"
pw-cli "sessionstorage-clear"

# Auth state
pw-cli "state-save auth.json"
pw-cli "state-load auth.json"
```

### Network

```bash
pw-cli "route **/*.jpg --status 404"
pw-cli "route-list"
pw-cli "unroute **/*.jpg"
pw-cli "unroute"
```

### Video Recording

```bash
pw-cli "video-start"
pw-cli "video-chapter Login flow"
pw-cli "video-stop"
```

### DevTools

```bash
pw-cli "console"
pw-cli "network"
pw-cli "tracing-start"
pw-cli "tracing-stop"
```

### Layout

```bash
pw-cli "resize 1920 1080"
pw-cli "dialog-accept"
pw-cli "dialog-dismiss"
```

## Playwright JavaScript

For complex interactions, use the full Playwright API:

```bash
pw-cli "await page.url()"
pw-cli "await page.title()"
pw-cli "await page.locator('button').count()"
pw-cli "await page.getByRole('link', { name: 'Get started' }).click()"
pw-cli "await page.evaluate(() => document.title)"
pw-cli "await expect(page.getByText('Welcome')).toBeVisible()"
```

## Targeting elements

Use refs from the snapshot to interact with elements:

```bash
# Get snapshot with refs
pw-cli snapshot
# Output includes refs like e1, e5, e15...

# Interact using a ref
pw-cli "click e15"
pw-cli "fill e5 hello"
```

Or use text/label matching:

```bash
pw-cli "click Submit"
pw-cli "fill Email user@example.com"
pw-cli "click Submit --nth 0"
pw-cli "click Submit --exact"
```

## Screenshots

Screenshots are automatically saved to `~/pw-screenshots/` and the file path is returned:

```bash
pw-cli screenshot
# → Screenshot saved to /home/user/pw-screenshots/pw-screenshot-1712876400000.png
```

## Best practices

1. **Always snapshot first** to understand page structure before interacting
2. **Use refs from snapshot** for precise element targeting
3. **Verify after actions** with `verify-text` or `screenshot` to confirm state
4. **Use keyword commands** for common actions — shorter and more reliable
5. **Fall back to JavaScript** when keywords are ambiguous (e.g., multiple matching elements)

## Example: Form submission

```bash
pw-cli "goto https://example.com/form"
pw-cli snapshot
pw-cli "fill e1 user@example.com"
pw-cli "fill e2 password123"
pw-cli "click e3"
pw-cli "verify-text Welcome"
```

## Example: Navigate and verify

```bash
pw-cli "goto https://demo.playwright.dev/todomvc/"
pw-cli "fill \"What needs to be done?\" Buy groceries"
pw-cli "press Enter"
pw-cli "verify-text Buy groceries"
pw-cli "verify-text 1 item left"
pw-cli screenshot
```

## Example: Multi-tab workflow

```bash
pw-cli "goto https://example.com"
pw-cli "tab-new https://example.com/other"
pw-cli "tab-list"
pw-cli "tab-select 0"
pw-cli snapshot
```
