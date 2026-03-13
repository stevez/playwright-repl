# Privacy Policy — Dramaturg

**Last updated:** March 12, 2026

## Data Collection

Dramaturg does not collect, store, transmit, or share any user data. All operations are performed locally within your browser.

## Permissions

- **activeTab** — Attaches the debugger to the current tab for running Playwright commands.
- **debugger** — Interacts with web pages via Chrome DevTools Protocol to execute automation commands. No data is sent externally.
- **tabs** — Lists open tabs in the toolbar dropdown for switching the debugger target.
- **sidePanel** — Provides the extension's primary UI for typing commands, writing scripts, and viewing results.
- **storage** — Persists user preferences (bridge port, language mode, theme) locally via chrome.storage.
- **offscreen** — Maintains a local WebSocket connection to the optional CLI bridge and MCP server.
- **host_permissions (`<all_urls>`)** — Required so the extension can automate any web page the user navigates to. No data is sent externally.

## Third-Party Services

This extension does not communicate with any external servers or third-party services. The optional CLI bridge and MCP server connections are local (localhost) only.

## Changes

If this policy changes, updates will be posted to this page.

## Contact

For questions, open an issue at https://github.com/stevez/playwright-repl/issues
