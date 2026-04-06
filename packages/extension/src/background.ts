import { crx } from '@playwright-repl/playwright-crx';
import type { CrxApplication } from '@playwright-repl/playwright-crx';
import { expect } from '@playwright-repl/playwright-crx/test';
import type { Page } from '@playwright-repl/playwright-crx/test';
import { loadSettings } from './panel/lib/settings';
import type { PwReplSettings } from './panel/lib/settings';
import { parseReplCommand } from './panel/lib/commands';
import { detectMode } from './panel/lib/execute';
import { initCdpRelay, handleCdpCommand } from './lib/cdp-relay-handler';

// ─── Patch toMatchAriaSnapshot ──────────────────────────────────────────────
// toMatchAriaSnapshot requires currentTestInfo() which only exists inside the
// Playwright Test runner. We wrap expect() with a Proxy that intercepts this
// matcher and calls locator._expect() directly, bypassing the test-info check
// while using Playwright's own matching engine.
// Note: _expect() is a private Playwright API — may break on upgrades.

function dedentSnapshot(snapshot: string) {
  const lines = snapshot.split('\n').filter(l => l.trim());
  const prefix = Math.min(...lines.map(l => l.match(/^(\s*)/)![1].length));
  return lines.map(line => line.substring(prefix)).join('\n');
}

function makeAriaSnapshotMatcher(locator: any, isNot: boolean) {
  return async (expected: string, options?: { timeout?: number }) => {
    const timeout = options?.timeout ?? 5000;
    const normalized = dedentSnapshot(expected);
    const { matches: pass, received } = await locator._expect(
      'to.match.aria',
      { expectedValue: normalized, isNot, timeout },
    );
    if (isNot ? pass : !pass) {
      const actual = received?.raw ?? '';
      const expectedOneLine = normalized.replace(/\n/g, ' ↵ ');
      const actualOneLine = actual.replace(/\n/g, ' ↵ ');
      throw new Error(
        isNot
          ? `toMatchAriaSnapshot (not)\nExpected: not to match\nReceived: ${actualOneLine}\n\nFull expected:\n${normalized}\n\nFull received:\n${actual}`
          : `toMatchAriaSnapshot\nExpected: ${expectedOneLine}\nReceived: ${actualOneLine}\n\nFull expected:\n${normalized}\n\nFull received:\n${actual}`
      );
    }
  };
}

function wrapExpectResult(e: any, locator: any, isNot = false) {
  return new Proxy(e, {
    get(obj, prop) {
      if (prop === 'toMatchAriaSnapshot')
        return makeAriaSnapshotMatcher(locator, isNot);
      if (prop === 'not')
        return wrapExpectResult(Reflect.get(obj, prop), locator, !isNot);
      return Reflect.get(obj, prop);
    },
  });
}

const _origExpect = expect;
const patchedExpect: typeof expect = Object.assign(
  (target: any) => wrapExpectResult(_origExpect(target), target),
  _origExpect,
);

// ─── Test Framework (for pw test browser path) ──────────────────────────────

// Install test framework on globalThis so compiled tests can use it directly.
// The runner sends compiled test code via bridge.run() which evaluates here.
import { installFramework } from './test-framework';
installFramework();

// ─── Offscreen Document (CLI Bridge) ─────────────────────────────────────────

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Maintains WebSocket connection to CLI/MCP bridge server',
  });
}
ensureOffscreen().catch(e => console.warn('[pw-repl] offscreen document creation failed:', e));

// ─── Settings + Action (sidepanel / popup) ───────────────────────────────────

// Disable auto-open so action.onClicked fires (Chrome persists this across reloads)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(e => console.debug('[pw-repl] setPanelBehavior:', e));

let cachedSettings: Partial<PwReplSettings> = { openAs: 'sidepanel' };
loadSettings().then(s => cachedSettings = s).catch(e => console.warn('[pw-repl] settings load failed:', e));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.openAs) {
    cachedSettings.openAs = changes.openAs.newValue;
  }
  if (area === 'local' && changes.bridgePort) {
    chrome.runtime.sendMessage({ type: 'bridge-port-changed', port: changes.bridgePort.newValue }).catch(() => { /* panel may not be open */ });
  }
  if (area === 'local' && changes.cdpRelayPort) {
    // Reconnect directly — no need to broadcast to offscreen
    const port = changes.cdpRelayPort.newValue as number;
    if (port) connectCdpRelay(port);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (cachedSettings.openAs === 'sidepanel') {
    await chrome.sidePanel.open({ windowId: tab.windowId! });
  } else {
    const tabId = tab.id;
    await chrome.windows.create({
      url: chrome.runtime.getURL('panel/panel.html') + (tabId ? `?tabId=${tabId}` : ''),
      type: 'popup',
      width: 450,
      height: 700,
    });
  }
});

// ─── playwright-crx State ────────────────────────────────────────────────────

let crxApp: CrxApplication | null = null;
let currentPage: Page | null = null;
let activeTabId: number | null = null;

function resetCrxState() {
  crxApp = null;
  currentPage = null;
  activeTabId = null;
}

async function ensureCrxApp(): Promise<CrxApplication> {
  if (crxApp) return crxApp;
  // Skip playwright-crx when CDP relay is active (avoids chrome.debugger conflict)
  if (cdpRelayWs) throw new Error('playwright-crx disabled — CDP relay mode active');
  crxApp = await crx.start();
  (crxApp as any).on('close', () => resetCrxState());
  return crxApp;
}

async function getActiveTabId(): Promise<number | null> {
  if (activeTabId) return activeTabId;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id ?? null;
}

// ─── Tab Attachment ───────────────────────────────────────────────────────────

async function attachToTab(tabId: number): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const tab = await chrome.tabs.get(tabId);
    const ownOrigin = `chrome-extension://${chrome.runtime.id}/`;
    if (tab.url?.startsWith('chrome://') ||
        (tab.url?.startsWith('chrome-extension://') && !tab.url?.startsWith(ownOrigin))) {
      return { ok: false, error: 'Cannot attach to internal pages. Navigate to a regular webpage first.' };
    }

    const app = await ensureCrxApp();

    // Only detach when re-attaching to the SAME tab (SPA navigation / stale frames).
    // playwright-crx supports multiple attached pages, so switching tabs is safe.
    if (activeTabId === tabId) {
      await app.detach(activeTabId).catch(e => console.debug('[pw-repl] detach before reattach:', e));
      currentPage = null;
      activeTabId = null;
    }

    try {
      currentPage = await app.attach(tabId);
    } catch {
      // Attach failed (stale frames, etc.) — detach all stale sessions and retry.
      // The _doDetach fix in playwright-crx handles broken pages gracefully.
      await app.detachAll().catch(e => console.debug('[pw-repl] detachAll before retry:', e));
      currentPage = await app.attach(tabId);
    }

    activeTabId = tabId;
    Object.assign(globalThis, { page: currentPage, context: app.context(), crxApp: app, activeTabId, expect: patchedExpect });

    // Set up event listeners on globalThis so page-scripts can read them
    (globalThis as any).__consoleMessages = [];
    (globalThis as any).__networkRequests = [];
    (globalThis as any).__activeRoutes = [];
    currentPage.on('console', (msg: any) => {
      (globalThis as any).__consoleMessages.push('[' + msg.type() + '] ' + msg.text());
    });
    currentPage.on('response', (resp: any) => {
      const url = resp.url();
      if (url.startsWith('chrome-extension://')) return;
      const req = resp.request();
      (globalThis as any).__networkRequests.push({ status: resp.status(), method: req.method(), url, type: req.resourceType() });
    });
    currentPage.on('dialog', async (dialog: any) => {
      const mode = (globalThis as any).__dialogMode;
      if (mode === 'accept') await dialog.accept();
      else if (mode === 'dismiss') await dialog.dismiss();
    });

    return { ok: true, url: currentPage.url() };
  } catch (e) {
    // Don't reset crxApp — the browser connection is likely still valid.
    // Only clear the page/tab so the next command triggers a fresh attach.
    currentPage = null;
    activeTabId = null;
    return { ok: false, error: String(e) };
  }
}

// ─── Recording ───────────────────────────────────────────────────────────────

let recordingTabId: number | null = null;
async function startRecording(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    const tabId = await getActiveTabId();
    if (!tabId) return { ok: false, error: 'No active tab' };
    const tab = await chrome.tabs.get(tabId);
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/recorder.js'] });
    recordingTabId = tabId;
    return { ok: true, url: tab.url ?? '' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function stopRecording(): Promise<{ ok: boolean }> {
  if (recordingTabId) {
    await chrome.tabs.sendMessage(recordingTabId, { type: 'record-stop' }).catch(e => console.debug('[pw-repl] record-stop:', e));
    recordingTabId = null;
  }
  return { ok: true };
}

// Re-inject recorder after navigation (page reload / SPA navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === recordingTabId && changeInfo.status === 'complete') {
    chrome.scripting.executeScript({ target: { tabId }, files: ['content/recorder.js'] }).catch(e => console.debug('[pw-repl] recorder re-inject:', e));
  }
});

// Invalidate stale state when a tab is closed (user clicks X, tab-close command, etc.)
chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) {
    currentPage = null;
    activeTabId = null;
  }
  if (tabId === recordingTabId) {
    recordingTabId = null;
  }
});

// ─── Pick Element ────────────────────────────────────────────────────────────

async function startPicking(): Promise<{ ok: boolean; error?: string }> {
  try {
    const tabId = await getActiveTabId();
    if (!tabId) return { ok: false, error: 'No active tab' };
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content/picker.js'] });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function stopPicking(): Promise<{ ok: boolean }> {
  const tabId = await getActiveTabId();
  if (tabId) await chrome.tabs.sendMessage(tabId, { type: 'pick-stop' }).catch(e => console.debug('[pw-repl] pick-stop:', e));
  return { ok: true };
}

// ─── Bridge Command Execution ────────────────────────────────────────────────

import { cdpEval, cdpCallFunctionOn } from './lib/sw-debugger-core';

/** Format a CDP ObjectPreview into a readable string (similar to Node.js REPL output). */
function formatCdpPreview(preview: any, depth = 0): string {
  if (!preview || !preview.properties) return preview?.description ?? '';
  const isArray = preview.subtype === 'array';
  const props: any[] = preview.properties;

  // Promise: show "Promise" for pending, "Promise {<fulfilled>: value}" for resolved
  if (preview.description === 'Promise') {
    const stateP = props.find((p: any) => p.name === '[[PromiseState]]');
    const state = stateP?.value ?? 'pending';
    if (state === 'pending') return 'Promise';
    const resultP = props.find((p: any) => p.name === '[[PromiseResult]]');
    const val = resultP?.type === 'string' ? `'${resultP.value}'`
      : resultP?.value !== undefined ? resultP.value : resultP?.type ?? '';
    return val ? `Promise {<${state}>: ${val}}` : `Promise {<${state}>}`;
  }

  // Map/Set: use entries field (key=>value for Map, value for Set)
  const cdpEntries: any[] = preview.entries;
  if (cdpEntries && cdpEntries.length > 0) {
    const isMap = preview.subtype === 'map';
    const items = cdpEntries.map((e: any) => {
      const val = e.value?.description ?? e.value?.value ?? e.value?.type ?? '';
      if (isMap) {
        const key = e.key?.description ?? e.key?.value ?? e.key?.type ?? '';
        return `${key} => ${val}`;
      }
      return val;
    });
    const suffix = preview.overflow ? ', …' : '';
    return `${preview.description} {${items.join(', ')}${suffix}}`;
  }

  if (props.length === 0) {
    if (isArray) return '[]';
    return preview.description ?? '';
  }

  const entries = props.map((p: any) => {
    let val: string;
    if (p.type === 'string') val = `'${p.value}'`;
    else if (p.valuePreview && depth < 2) val = formatCdpPreview(p.valuePreview, depth + 1);
    else if (p.value !== undefined) val = p.value;
    else val = p.subtype ?? p.type;
    return isArray ? val : `${p.name}: ${val}`;
  });

  const suffix = preview.overflow ? ', …' : '';
  const inner = entries.join(', ') + suffix;
  if (isArray) return `[${inner}]`;
  if (preview.description && preview.description !== 'Object') return `${preview.description} {${inner}}`;
  return `{${inner}}`;
}

async function executeBridgeExpr(jsExpr: string): Promise<{ text: string; isError: boolean; image?: string }> {
  try {
    const r = await cdpEval(jsExpr, 'bridge');
    if (!r || r.type === 'undefined') return formatBridgeResult(undefined);
    if (r.type === 'string' || r.type === 'number' || r.type === 'boolean') return formatBridgeResult(r.value);

    // Map/Set: use callFunctionOn to get entries since preview doesn't include them
    if (r.objectId && /^(Map|Set)\(\d+\)$/.test(r.description ?? '')) {
      const isMap = r.description!.startsWith('Map');
      const fn = isMap
        ? 'function(){return [...this].map(([k,v])=>JSON.stringify(k)+" => "+JSON.stringify(v)).join(", ")}'
        : 'function(){return [...this].map(v=>JSON.stringify(v)).join(", ")}';
      const res = await cdpCallFunctionOn(r.objectId, fn);
      const inner = res?.result?.value ?? null;
      if (inner !== null) return formatBridgeResult(`${r.description} {${inner}}`);
    }

    // Plain objects/arrays: use JSON.stringify for full nested representation
    if (r.objectId && (r.description === 'Object' || /^Array\(\d+\)$/.test(r.description ?? ''))) {
      const res = await cdpCallFunctionOn(r.objectId,
        'function(){try{return JSON.stringify(this)}catch{return null}}');
      const json = res?.result?.value ?? null;
      if (json) return formatBridgeResult(json);
    }

    // Other objects (Date, RegExp, Promise, etc.): use description directly
    if (r.preview) return formatBridgeResult(formatCdpPreview(r.preview));
    return formatBridgeResult(r.description ?? 'Done');
  } catch (e: any) {
    return { text: e?.message ?? String(e), isError: true };
  }
}

function formatBridgeResult(result: unknown): { text: string; isError: boolean; image?: string } {
  if (result === undefined || result === null) return { text: 'Done', isError: false };

  if (typeof result === 'string') {
    try {
      const obj = JSON.parse(result);
      if (obj && typeof obj === 'object' && '__image' in obj) {
        return { text: '', isError: false, image: `data:${obj.mimeType};base64,${obj.__image}` };
      }
    } catch { /* not JSON */ }
    return { text: result, isError: false };
  }

  if (typeof result === 'number' || typeof result === 'boolean') {
    return { text: String(result), isError: false };
  }

  try {
    return { text: JSON.stringify(result, null, 2), isError: false };
  } catch {
    return { text: String(result), isError: false };
  }
}

async function executeSingleCommand(command: string): Promise<{ text: string; isError: boolean; image?: string }> {
  const parsed = parseReplCommand(command);

  if ('help' in parsed) return { text: parsed.help, isError: false };

  if ('error' in parsed) {
    const mode = detectMode(command.trim());

    if (mode === 'js' || command.includes('\n')) {
      return executeBridgeExpr(command.trim());
    }

    // mode === 'pw' — bare word that looks like a command but isn't recognized
    return { text: parsed.error, isError: true };
  }

  // Known keyword command — evaluate jsExpr directly in SW scope
  return executeBridgeExpr(parsed.jsExpr);
}

type BridgeResult = { text: string; isError: boolean; image?: string };

function executeCommandPayload(msg: {
  command: string;
  scriptType?: 'command' | 'script';
  language?: 'pw' | 'javascript';
}): Promise<BridgeResult> {
  const { command, scriptType, language } = msg;

  // Script mode: execute each line as a separate pw command
  if (scriptType === 'script' && language !== 'javascript') {
    return (async () => {
      const lines = command.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      const output: string[] = [];
      let isError = false;
      for (const line of lines) {
        const r = await executeSingleCommand(line).catch((err: unknown) => ({ text: String(err), isError: true }));
        output.push(`${r.isError ? '\u2717' : '\u2713'} ${line}${r.text ? `\n  ${r.text}` : ''}`);
        if (r.isError) { isError = true; break; }
      }
      return { text: output.join('\n'), isError };
    })();
  }

  // Single command or JS script
  return executeSingleCommand(command);
}

async function handleBridgeCommand(msg: {
  command: string;
  scriptType?: 'command' | 'script';
  language?: 'pw' | 'javascript';
  includeSnapshot?: boolean;
}): Promise<BridgeResult> {
  // Recording/picker commands — handled before currentPage check
  const cmd = msg.command.trim();
  console.log('[bridge] command:', JSON.stringify(cmd), 'type:', msg.scriptType);
  if (cmd === 'record-start') {
    const r = await startRecording();
    return { text: r.ok ? `Recording started${r.url ? ': ' + r.url : ''}` : (r.error || 'Failed'), isError: !r.ok };
  }
  if (cmd === 'record-stop') {
    const r = await stopRecording();
    return { text: r.ok ? 'Recording stopped' : 'Failed', isError: !r.ok };
  }
  if (cmd === 'pick-start') {
    const r = await startPicking();
    return { text: r.ok ? 'Pick mode started' : (r.error || 'Failed'), isError: !r.ok };
  }
  if (cmd === 'pick-stop') {
    const r = await stopPicking();
    return { text: r.ok ? 'Pick mode stopped' : 'Failed', isError: !r.ok };
  }

  if (!currentPage) {
    const tabId = await getActiveTabId();
    if (tabId) await attachToTab(tabId);
    if (!currentPage) return { text: 'No active tab to attach to.', isError: true };
  }

  let result = await executeCommandPayload(msg);

  // Stale page recovery: if the command failed because the page/tab was closed,
  // clear state and retry once with a fresh attach.
  if (result.isError && result.text.includes('TargetClosedError')) {
    currentPage = null;
    activeTabId = null;
    const tabId = await getActiveTabId();
    if (tabId) await attachToTab(tabId);
    if (!currentPage) return result;
    result = await executeCommandPayload(msg);
  }

  // Append snapshot when requested (MCP update commands)
  if (msg.includeSnapshot && !result.isError && msg.scriptType !== 'script') {
    const snap = await executeSingleCommand('snapshot').catch(() => null);
    if (snap && !snap.isError && snap.text) {
      const resultText = result.text?.trim() || '';
      result.text = resultText
        ? `### Result\n${resultText}\n### Snapshot\n${snap.text}`
        : `### Snapshot\n${snap.text}`;
    }
  }

  return result;
}

// Expose for serviceWorker.evaluate() and VS Code CDP injection
(self as any).handleBridgeCommand = handleBridgeCommand;

// ─── Message Handler ─────────────────────────────────────────────────────────

// Serialize bridge commands so concurrent messages don't race on currentPage / attachToTab.
let commandQueue: Promise<void> = Promise.resolve();

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'bridge-command') {
    const execute = () => handleBridgeCommand(msg);
    const queued = commandQueue.then(execute, execute);
    commandQueue = queued.then(() => {}, () => {});
    queued.then(sendResponse).catch(e =>
      sendResponse({ text: String(e), isError: true })
    );
    return true;
  }
  if (msg.type === 'attach')        { attachToTab(msg.tabId).then(sendResponse); return true; }
  if (msg.type === 'detach')        {
    if (activeTabId !== null && crxApp) {
      crxApp.detach(activeTabId).catch(e => console.debug('[pw-repl] detach:', e));
      currentPage = null;
      activeTabId = null;
    }
    sendResponse({ ok: true });
    return false;
  }
  if (msg.type === 'health')        { sendResponse({ ok: !!crxApp }); return false; }
  if (msg.type === 'record-start')  { startRecording().then(sendResponse); return true; }
  if (msg.type === 'record-stop')   { stopRecording().then(sendResponse); return true; }
  if (msg.type === 'pick-start')    { startPicking().then(sendResponse); return true; }
  if (msg.type === 'pick-stop')     { stopPicking().then(sendResponse); return true; }
  if (msg.type === 'get-bridge-port') {
    chrome.storage.local.get(['bridgePort']).then(s => sendResponse((s.bridgePort as number) || 9876));
    return true;
  }
  if (msg.type === 'get-cdp-relay-port') {
    chrome.storage.local.get(['cdpRelayPort']).then((s: Record<string, unknown>) => sendResponse((s.cdpRelayPort as number) || 0));
    return true;
  }
  if (msg.type === 'ping') { sendResponse({ pong: true }); return false; }
});

// ─── CDP Relay (direct WS to Node) ─────────────────────────────────────────
// Background SW connects directly to the Node CDP relay server via WebSocket.
// No offscreen intermediary — eliminates chrome.runtime.sendMessage broadcast
// which caused Runtime.exceptionThrown flooding in content scripts.

let cdpRelayWs: WebSocket | null = null;
let cdpRelayReconnectTimer: ReturnType<typeof setTimeout> | null = null;

/** Probe the relay's HTTP endpoint before opening a WebSocket (avoids ERR_CONNECTION_REFUSED in console). */
async function probeRelay(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`);
    return res.ok;
  } catch {
    return false;
  }
}

async function connectCdpRelay(port: number) {
  // Clean up existing connection
  if (cdpRelayReconnectTimer) { clearTimeout(cdpRelayReconnectTimer); cdpRelayReconnectTimer = null; }
  if (cdpRelayWs) { cdpRelayWs.onclose = null; cdpRelayWs.close(); cdpRelayWs = null; }

  // Probe first — don't open WebSocket if relay isn't running
  if (!await probeRelay(port)) {
    cdpRelayReconnectTimer = setTimeout(() => connectCdpRelay(port), 3000);
    return;
  }

  try {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/extension`);

    ws.onopen = () => {
      cdpRelayWs = ws;
    };

    ws.onmessage = async (e) => {
      const msg = JSON.parse(e.data as string);
      if (msg.id && msg.method) {
        try {
          const response = await handleCdpCommand(msg);
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ id: msg.id, ...response }));
        } catch (err) {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(JSON.stringify({ id: msg.id, error: String(err) }));
        }
      }
    };

    ws.onclose = () => {
      if (cdpRelayWs === ws) cdpRelayWs = null;
      cdpRelayReconnectTimer = setTimeout(() => connectCdpRelay(port), 3000);
    };

    ws.onerror = () => {};
  } catch {
    cdpRelayReconnectTimer = setTimeout(() => connectCdpRelay(port), 3000);
  }
}

// Forward chrome.debugger events directly to the relay WS
// Guard: chrome.debugger may not exist in test environment
try {
  initCdpRelay((msg) => {
    if (cdpRelayWs?.readyState === WebSocket.OPEN)
      cdpRelayWs.send(JSON.stringify(msg));
  });

  // Auto-connect on startup if port is configured
  const p = chrome.storage?.local?.get?.(['cdpRelayPort']);
  if (p && typeof p.then === 'function')
    p.then((s: Record<string, unknown>) => {
      const port = s.cdpRelayPort as number;
      if (port) connectCdpRelay(port);
    }).catch(() => {});
} catch { /* test environment — chrome.debugger not available */ }

// Expose stable globals for swDebugEval — functions that never change go here, not inside attachToTab
(globalThis as any).attachToTab = attachToTab;
