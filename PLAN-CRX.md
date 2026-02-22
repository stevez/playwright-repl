# New Package: `packages/repl-ext` — playwright-crx REPL Extension

## How playwright-crx Works

### The Problem It Solves

Normal Playwright runs in **Node.js** and talks to Chrome via a **WebSocket CDP connection**
(either by launching Chrome with `--remote-debugging-port` or via `connectOverCDP()`).
A Chrome extension can't do this — it has no Node.js, no WebSocket server, no TCP port.
But it **does** have `chrome.debugger`, which is a direct CDP API built into the extension platform.

playwright-crx bridges this gap: it bundles the entire Playwright runtime into a single JS
file that runs inside a Chrome extension's **service worker**, replacing the WebSocket
transport with direct `chrome.debugger` API calls.

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Extension Service Worker (background.js)                │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  index.ts (entry point)                                  │   │
│  │                                                          │   │
│  │  ┌─────────────┐    sync dispatch    ┌───────────────┐   │   │
│  │  │   CLIENT    │ ◄════════════════► │    SERVER     │   │   │
│  │  │             │                     │              │   │   │
│  │  │ CrxConnect- │  message ──────►   │ Dispatcher-  │   │   │
│  │  │ ion         │                     │ Connection   │   │   │
│  │  │             │  ◄────── message   │              │   │   │
│  │  │ Crx         │                     │ RootDispatch │   │   │
│  │  │ CrxApp      │                     │ CrxPlaywright│   │   │
│  │  │ Page        │                     │ Crx          │   │   │
│  │  │ BrowserCtx  │                     │ CrxApp       │   │   │
│  │  └─────────────┘                     └──────┬───────┘   │   │
│  │                                              │           │   │
│  │  Exported API:                               │           │   │
│  │  export const { crx } = playwrightAPI;       │           │   │
│  │  crx.start() → CrxApplication                │           │   │
│  │  crxApp.attach(tabId) → Page                  │           │   │
│  └──────────────────────────────────────────────┼───────────┘   │
│                                                  │               │
│  ┌──────────────────────────────────────────────┼───────────┐   │
│  │  CrxTransport (implements ConnectionTransport)│           │   │
│  │                                              ▼           │   │
│  │  send(message) ──────────────────────────────────────►   │   │
│  │    ├─ Target.setAutoAttach → add filters, sendCommand    │   │
│  │    ├─ Target.createTarget  → chrome.tabs.create          │   │
│  │    ├─ Target.closeTarget   → chrome.tabs.remove          │   │
│  │    ├─ Browser.getVersion   → navigator.userAgent         │   │
│  │    ├─ Emulation.setMedia   → no-op (avoid crash)        │   │
│  │    └─ everything else      → chrome.debugger.sendCommand │   │
│  │                                                          │   │
│  │  chrome.debugger.onEvent ──────────────────────────────► │   │
│  │    → onmessage(response) → back to Playwright server     │   │
│  │                                                          │   │
│  │  attach(tabId):                                          │   │
│  │    1. chrome.debugger.attach({tabId}, '1.3')             │   │
│  │    2. Target.getTargetInfo → get targetId, contextId     │   │
│  │    3. emit Target.attachedToTarget → Playwright creates  │   │
│  │       CRPage internally                                  │   │
│  │    4. Map: tabId ↔ targetId ↔ sessionId(crx-tab-N)      │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
│  chrome.debugger.sendCommand({tabId}, method, params)           │
│         │                              ▲                        │
└─────────┼──────────────────────────────┼────────────────────────┘
          ▼                              │
┌─────────────────────────────────────────────────────────────────┐
│  Chrome Browser Tab                                             │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Page DOM, JavaScript runtime, network, etc.              │  │
│  │  CDP protocol exposed via chrome.debugger privilege       │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Key Components

**1. Entry Point (`src/index.ts`)**

The magic: client and server run **in the same process** (the service worker),
connected by synchronous in-memory dispatch — no WebSocket, no IPC:

```ts
const playwright = new CrxPlaywright();                    // Server-side
const clientConnection = new CrxConnection();              // Client-side
const dispatcherConnection = new DispatcherConnection();   // Server dispatcher

// Wire them together — messages pass in-memory
dispatcherConnection.onmessage = msg => clientConnection.dispatch(msg);
clientConnection.onmessage = msg => dispatcherConnection.dispatch(msg);

// Export the client API
export const { crx } = playwrightAPI;
```

**2. CrxTransport (`src/server/transport/crxTransport.ts`)**

Implements Playwright's `ConnectionTransport` interface using `chrome.debugger`:

| Normal Playwright | playwright-crx |
|---|---|
| `WebSocketTransport.send()` | `chrome.debugger.sendCommand()` |
| WebSocket `onmessage` | `chrome.debugger.onEvent` listener |
| TCP connection to `localhost:9222` | Extension `"debugger"` permission |
| Session IDs from Chrome | Synthetic `crx-tab-{tabId}` session IDs |

It also handles CDP commands that `chrome.debugger` doesn't support:
- `Target.setAutoAttach` → forwards with filter (excludes service workers)
- `Target.createTarget` → `chrome.tabs.create()` + attach
- `Target.closeTarget` → `chrome.tabs.remove()`
- `Browser.getVersion` → `navigator.userAgent`
- `Emulation.setEmulatedMedia` → no-op (avoids detach crash)
- `Storage.getCookies` → `Network.getCookies` per-page (chrome.debugger bug)

**3. Crx + CrxApplication (`src/server/crx.ts`)**

```ts
crx.start()
  → creates CrxTransport
  → CRBrowser.connect(transport)     // Playwright's browser object
  → returns CrxApplication

crxApp.attach(tabId)
  → transport.attach(tabId)          // chrome.debugger.attach + Target.getTargetInfo
  → emits Target.attachedToTarget    // Playwright creates CRPage
  → page.waitForInitializedOrError() // waits for page to be ready
  → returns Page                     // full Playwright Page object!
```

**4. Vite Build**

The entire Playwright core (~5MB) is bundled via Vite with Node.js shims:
- `fs` → in-memory filesystem (memfs)
- `child_process`, `net`, `tls` → stubs (no spawning in extensions)
- `crypto` → crypto-browserify
- `buffer`, `stream`, `path`, `os` → browserified versions

Result: a single `background.js` file that runs in a Chrome service worker.

### Why This Fixes Our Timeout Problem

Our old CDP relay approach:
```
Node.js Playwright → WebSocket → CDPRelayServer → WebSocket → Extension → chrome.debugger
                     ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                     Translation layer: drops events, mishandles sessions,
                     swallows Target.setAutoAttach, misses lifecycle events
```

playwright-crx approach:
```
Playwright (in service worker) → CrxTransport → chrome.debugger
                                 ^^^^^^^^^^^^^
                                 Direct call, no translation,
                                 handles all CDP edge cases
```

The timeout happened because our relay didn't properly handle:
1. `Target.setAutoAttach` filtering (service workers interfered)
2. Synthetic session ID mapping
3. Page lifecycle events for already-loaded pages

CrxTransport handles all of these because it was built specifically for `chrome.debugger`.

### Comparison: Three Approaches

```
LAUNCH MODE (works):
  Node.js → Playwright → launch Chrome → WebSocket CDP → new browser
  ✓ Playwright controls entire browser lifecycle

RELAY MODE (broken):
  Node.js → Playwright → connectOverCDP → WS → relay → WS → ext → chrome.debugger
  ✗ Too many translation layers, events get lost

PLAYWRIGHT-CRX MODE (new):
  Extension service worker → Playwright (bundled) → chrome.debugger → existing tab
  ✓ Direct connection, no relay, designed for chrome.debugger
```

## Context

The current extension mode uses a CDP relay (WebSocket bridge between Node.js Playwright
and `chrome.debugger`). This fails because Playwright never sees page lifecycle events
for already-loaded pages, causing snapshot timeouts.

**playwright-crx** solves this by running Playwright directly inside the extension's
service worker via `CrxTransport` (implements Playwright's `ConnectionTransport` using
`chrome.debugger`). No relay, no WebSocket bridge, no `connectOverCDP`.

The existing launch/connect modes (Engine + BrowserServerBackend + MCP API) remain
unchanged. This new package is extension-mode only.

## Architecture

```
packages/repl-ext/                    (NEW — Vite-built extension)
  src/
    background.ts                     Service worker: playwright-crx + command handler
    commands.ts                       Thin layer: REPL commands → Playwright Page API
    snapshot.ts                       Accessibility tree walker + ref assignment
    panel/
      panel.ts                        Side panel UI (adapted from packages/extension/panel/)
      panel.html
      panel.css
  public/
    manifest.json                     Manifest V3 with sidePanel
  dist/                               Vite build output (loadable as extension)
  vite.config.ts
  tsconfig.json
  package.json

Flow:
  Side Panel (panel.ts)
    ↓ chrome.runtime.sendMessage({ type: 'run', command: 'click e5' })
  Service Worker (background.ts)
    ↓ import { crx } from 'playwright-crx'
    ↓ commandHandler.execute('click e5')
  commands.ts
    ↓ parse command → resolve ref → page.getByRole(role, {name}).click()
  CrxTransport → chrome.debugger → tab
```

## Steps

### Step 1: Scaffold package + Vite build

Create `packages/repl-ext/` with:

- `package.json`: depends on `playwright-crx` (file: reference to local fork)
- `tsconfig.json`: ES2020, bundler moduleResolution
- `vite.config.ts`: background.ts entry + panel HTML entry, no minify, sourcemaps
- `public/manifest.json`: Manifest V3, permissions: debugger, tabs, sidePanel, activeTab

**Verify**: `npm run build` in packages/repl-ext produces `dist/background.js` + `dist/panel.html`

### Step 2: background.ts — playwright-crx lifecycle

Implement service worker:

```ts
import { crx } from 'playwright-crx';
import type { CrxApplication, Page } from 'playwright-crx';

let crxApp: CrxApplication | null = null;
let activePage: Page | null = null;

// Click extension icon → open side panel
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Handle commands from panel
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'run') handleCommand(msg.command).then(sendResponse);
  if (msg.type === 'attach') attachToTab(msg.tabId).then(sendResponse);
  return true; // async
});

async function attachToTab(tabId: number) {
  if (!crxApp) crxApp = await crx.start();
  activePage = await crxApp.attach(tabId);
  return { ok: true, url: activePage.url() };
}
```

**Verify**: Load extension → click icon → side panel opens → no errors in service worker console

### Step 3: commands.ts — thin command layer

Map REPL keywords to Playwright Page API calls:

```ts
export async function execute(command: string, page: Page): Promise<Result> {
  const [keyword, ...args] = command.trim().split(/\s+/);
  switch (keyword) {
    case 'snapshot': return snapshot(page);
    case 'goto':     return goto(page, args.join(' '));
    case 'click':    return click(page, args[0]);
    case 'fill':     return fill(page, args[0], args.slice(1).join(' '));
    case 'type':     return type(page, args[0], args.slice(1).join(' '));
    case 'press':    return press(page, args[0], args.slice(1).join(' '));
    case 'hover':    return hover(page, args[0]);
    case 'screenshot': return screenshot(page);
    case 'back':     return goBack(page);
    case 'forward':  return goForward(page);
    case 'reload':   return reload(page);
    // ... more commands
  }
}
```

**Verify**: `snapshot` and `goto` work from panel

### Step 4: snapshot.ts — ref system

Walk `page.accessibility.snapshot()` tree, assign refs (e1, e2, ...), format output:

```ts
let refMap = new Map<string, AXNode>();
let refCounter = 0;

export async function snapshot(page: Page): Promise<Result> {
  const tree = await page.accessibility.snapshot();
  refMap.clear();
  refCounter = 0;
  const formatted = formatNode(tree, 0);
  return { text: formatted, isError: false };
}

function formatNode(node: AXNode, indent: number): string {
  // Assign ref to interactive elements
  if (isInteractive(node)) {
    const ref = `e${++refCounter}`;
    refMap.set(ref, node);
    // Format: "- role "name" [ref=e5]"
  }
  // Recurse children
}

export function resolveRef(ref: string): AXNode {
  const node = refMap.get(ref);
  if (!node) throw new Error(`Unknown ref: ${ref}`);
  return node;
}
```

For ref → locator resolution, use `page.getByRole(role, { name, exact: true })`.
If ambiguous (multiple matches), fall back to nth() or more specific selectors.

**Verify**: `snapshot` shows tree with refs → `click e5` clicks the right element

### Step 5: panel.html/ts/css — side panel UI

Adapt from existing `packages/extension/panel/`:
- Remove `chrome.devtools` dependencies
- Use `chrome.tabs.query({ active: true, currentWindow: true })` for tab ID
- Use `chrome.runtime.sendMessage()` to send commands to background.ts
- Keep: editor, console output, toolbar (run/step/record/open/save/export/copy)
- Add: connected tab indicator

**Verify**: Full panel UI works — type commands, see results, run editor scripts

### Step 6: Add to monorepo workspace

- Add `"packages/repl-ext"` to root package.json workspaces
- `npm install` to link

**Verify**: `npm run build -w packages/repl-ext` works from root

## Key files

| File | Purpose |
|------|---------|
| `packages/repl-ext/package.json` | Package config, playwright-crx dependency |
| `packages/repl-ext/vite.config.ts` | Vite build: background.ts + panel entry |
| `packages/repl-ext/tsconfig.json` | TypeScript config |
| `packages/repl-ext/public/manifest.json` | Manifest V3 with sidePanel |
| `packages/repl-ext/src/background.ts` | Service worker: crx lifecycle + message handler |
| `packages/repl-ext/src/commands.ts` | Command → Playwright API mapping |
| `packages/repl-ext/src/snapshot.ts` | Accessibility tree + ref system |
| `packages/repl-ext/src/panel/panel.ts` | Side panel UI logic |
| `packages/repl-ext/src/panel/panel.html` | Side panel HTML |
| `packages/repl-ext/src/panel/panel.css` | Side panel styles |

## Verification

1. `cd packages/repl-ext && npm run build` → produces `dist/` with all files
2. Load `dist/` as unpacked extension in Chrome
3. Navigate to https://example.com
4. Click extension icon → side panel opens
5. Type `snapshot` → shows accessibility tree with refs
6. Type `click e1` → clicks the element
7. Type `goto https://playwright.dev` → tab navigates
8. Type `screenshot` → shows screenshot in panel
9. Existing CLI modes (`playwright-repl`, `playwright-repl --connect`) still work unchanged
