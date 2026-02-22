# Re-implement Recording for Extension v3

## Context

Recording was deferred when the extension was rewritten from v1/v2 (CDP relay via `chrome.debugger`) to v3 (side panel + direct CDP). The old approach used `chrome.debugger` to inject `recorder.js` via CDP `Runtime.evaluate` and captured events via `console.debug("__pw:")` — requiring the `debugger` permission which shows a scary yellow "being controlled" banner.

v3 replaces this with the modern MV3 approach: `chrome.scripting.executeScript` + `chrome.runtime.sendMessage`. No debugger permission, no banner, simpler code.

## Architecture

```
panel.js  ──sendMessage({ type: 'pw-record-start', tabId })──►  background.js
                                                                    │
                                                    chrome.scripting.executeScript()
                                                                    │
                                                                    ▼
                                                             recorder.js (content script)
                                                                    │
                                                    chrome.runtime.sendMessage()
                                                                    │
panel.js  ◄──onMessage({ type: 'pw-recorded-command', command })────┘
```

Key simplification: `pw-recorded-command` messages go directly from content script → panel.js (side panel pages receive content script messages in MV3). No background relay needed for the data path.

## What Changes

| v1/v2 (old) | v3 (new) |
|---|---|
| `chrome.debugger.attach` + CDP `Runtime.evaluate` | `chrome.scripting.executeScript({ files: [...] })` |
| `console.debug("__pw:" + cmd)` | `chrome.runtime.sendMessage({ type, command })` |
| CDP `Runtime.consoleAPICalled` event listener | `chrome.runtime.onMessage` in panel.js |
| `debugger` permission (yellow banner) | `scripting` permission (no banner) |
| `Page.addScriptToEvaluateOnNewDocument` | `chrome.tabs.onUpdated` listener re-injects |

## Steps

### Step 1: Create `packages/extension/content/recorder.js`

Restore from git commit `d11ae61` with these changes:
- Replace `console.debug("__pw:" + command)` → `chrome.runtime.sendMessage({ type: 'pw-recorded-command', command })`
- Replace `window.__pwRecorderActive` → `document.documentElement.dataset.pwRecorderActive` (survives across worlds)
- Keep ALL DOM event logic unchanged: `handleClick`, `handleInput`, `handleChange`, `handleKeydown`, `getLocator`, `getItemContext`, `findCheckbox`, `flushFill`

### Step 2: Add `scripting` permission to `packages/extension/manifest.json`

Add `"scripting"` to the permissions array. No `web_accessible_resources` needed (files injected via `chrome.scripting.executeScript` don't need it).

### Step 3: Expand `packages/extension/background.js`

From 2 lines → ~60 lines. Add:
- `chrome.runtime.onMessage` listener for `pw-record-start` / `pw-record-stop`
- `startRecording(tabId)`: inject `recorder.js` via `chrome.scripting.executeScript`, add `tabs.onUpdated` listener
- `stopRecording(tabId)`: execute cleanup function on tab, remove listener
- `onTabUpdated(tabId, changeInfo)`: re-inject `recorder.js` when recording tab navigates (status `complete`)
- Export `startRecording`, `stopRecording`, `onTabUpdated` for testing

### Step 4: Update `packages/extension/panel/panel.js`

Replace lines 886-889 (disabled button) with:
- Record button click handler: toggles `isRecording` state
  - Start: `chrome.tabs.query` for active tab → `sendMessage({ type: 'pw-record-start', tabId })` → add `.recording` class → change text to "Stop"
  - Stop: `sendMessage({ type: 'pw-record-stop', tabId })` → remove `.recording` class → change text to "Record"
- `chrome.runtime.onMessage` listener: on `pw-recorded-command`, call `addCommand(command)` + `appendToEditor(command)` (both functions already exist at lines 183 and 338)
- Use `addInfo()` (line 195) and `addError()` (line 191) for status messages

### Step 5: Create `packages/extension/test/recorder.test.js`

Unit tests for recorder.js (~25 tests). Mock `chrome.runtime.sendMessage`. Key tests:
- Sets `dataset.pwRecorderActive` on load, provides cleanup function
- Idempotency (doesn't run twice)
- Click → `sendMessage({ type: 'pw-recorded-command', command: 'click "Submit"' })`
- Checkbox → `check`/`uncheck` commands
- Input → debounced `fill` command
- Select → `select` command
- Enter/Tab/Escape → `press` command
- Locator resolution: aria-label, label[for], placeholder, text, title fallbacks
- Action button with item context
- Click flushes pending fill
- Cleanup removes listeners and dataset

### Step 6: Create `packages/extension/test/background.test.js`

Unit tests for background.js recording handlers. Mock `chrome.scripting.executeScript`, `chrome.tabs.onUpdated`. Key tests:
- `startRecording` injects recorder.js, adds `onUpdated` listener
- `startRecording` returns error on injection failure (chrome:// pages)
- `stopRecording` runs cleanup, removes listener
- `stopRecording` handles cleanup failure gracefully
- `onTabUpdated` re-injects on `status: complete` for recording tab only

### Step 7: Update existing tests

- `test/panel.test.js` line 130-133: change "record button is disabled" → "record button is enabled"
- `test/setup.js`: add `chrome.scripting` mock (vitest-chrome doesn't include it)
- `e2e/panel/panel.test.mjs` line 22-25: change `isDisabled()` → `isEnabled()`

### Step 8: Run all tests and verify

1. `npm test` — unit tests pass (recorder, background, panel)
2. `npx playwright test --project=panel` — E2E panel tests pass
3. Manual: load extension → click Record → interact with page → commands appear in editor

## Files

| File | Action |
|------|--------|
| `packages/extension/content/recorder.js` | Create — restored from d11ae61 + sendMessage |
| `packages/extension/manifest.json` | Modify — add `scripting` permission |
| `packages/extension/background.js` | Modify — add recording handlers (~60 lines) |
| `packages/extension/panel/panel.js` | Modify — enable record button + onMessage listener |
| `packages/extension/test/recorder.test.js` | Create — ~25 unit tests |
| `packages/extension/test/background.test.js` | Create — ~9 unit tests |
| `packages/extension/test/panel.test.js` | Modify — update disabled → enabled test |
| `packages/extension/test/setup.js` | Modify — add chrome.scripting mock |
| `packages/extension/e2e/panel/panel.test.mjs` | Modify — update disabled → enabled assertion |

## No changes needed

- `panel/panel.html` — record button HTML already exists
- `panel/panel.css` — `.recording` styles already exist (line 175-179, red highlight)
- `packages/core/` — recording is entirely extension-side
- `packages/cli/` — CLI recording is separate and already works
