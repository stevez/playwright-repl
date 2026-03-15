import { crx } from '@playwright-repl/playwright-crx';
import type { CrxApplication } from '@playwright-repl/playwright-crx';
import { expect } from '@playwright-repl/playwright-crx/test';
import type { Page } from '@playwright-repl/playwright-crx/test';
import { loadSettings } from './panel/lib/settings';
import type { PwReplSettings } from './panel/lib/settings';
import { parseReplCommand } from './panel/lib/commands';
import { detectMode } from './panel/lib/execute';

// ─── Offscreen Document (CLI Bridge) ─────────────────────────────────────────

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: [chrome.offscreen.Reason.BLOBS],
    justification: 'Maintains WebSocket connection to CLI/MCP bridge server',
  });
}
ensureOffscreen().catch(() => {});

// ─── Settings + Action (sidepanel / popup) ───────────────────────────────────

// Disable auto-open so action.onClicked fires (Chrome persists this across reloads)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

let cachedSettings: Partial<PwReplSettings> = { openAs: 'sidepanel' };
loadSettings().then(s => cachedSettings = s).catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.openAs) {
    cachedSettings.openAs = changes.openAs.newValue;
  }
  if (area === 'local' && changes.bridgePort) {
    chrome.runtime.sendMessage({ type: 'bridge-port-changed', port: changes.bridgePort.newValue }).catch(() => {});
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

    if (!crxApp) crxApp = await crx.start();

    // Always detach first — stale frame connections cause "Frame has been detached" errors
    // (e.g. GitHub SPA navigation replaces frames within the same tab)
    if (activeTabId !== null) {
      await crxApp.detach(activeTabId).catch(() => {});
      currentPage = null;
      activeTabId = null;
    }

    // Retry once on "Frame has been detached" — can happen with SPA navigation
    try {
      currentPage = await crxApp.attach(tabId);
    } catch (e) {
      if (String(e).includes('Frame') && String(e).includes('detached')) {
        await new Promise(r => setTimeout(r, 500));
        currentPage = await crxApp.attach(tabId);
      } else {
        throw e;
      }
    }
    activeTabId = tabId;
    Object.assign(globalThis, { page: currentPage, context: crxApp.context(), crxApp, activeTabId, expect });
    return { ok: true, url: currentPage.url() };
  } catch (e) {
    activeTabId = null;
    currentPage = null;
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
    await chrome.tabs.sendMessage(recordingTabId, { type: 'record-stop' }).catch(() => {});
    recordingTabId = null;
  }
  return { ok: true };
}

// Re-inject recorder after navigation (page reload / SPA navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === recordingTabId && changeInfo.status === 'complete') {
    chrome.scripting.executeScript({ target: { tabId }, files: ['content/recorder.js'] }).catch(() => {});
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
  if (tabId) await chrome.tabs.sendMessage(tabId, { type: 'pick-stop' }).catch(() => {});
  return { ok: true };
}

// ─── Bridge Command Execution ────────────────────────────────────────────────

/** Attempt to insert `return` before the last expression line so the caller gets the value. */
function tryReturnLastExpr(code: string): string {
  const lines = code.split('\n');
  let i = lines.length - 1;
  while (i >= 0 && !lines[i].trim()) i--;
  if (i < 0) return code;
  const trimmed = lines[i].trimStart();
  if (/^(const |let |var |function |class |if |for |while |do |switch |try |throw |import |export |return |})/.test(trimmed)) return code;
  const leading = lines[i].slice(0, lines[i].length - trimmed.length);
  lines[i] = leading + 'return ' + trimmed;
  return lines.join('\n');
}

// ─── Self-debug eval (chrome.debugger → own SW target, bypasses MV3 CSP) ────

let selfTargetId: string | null = null;

async function ensureSelfAttached(): Promise<string> {
  const swUrl = `chrome-extension://${chrome.runtime.id}/background.js`;
  const targets = await new Promise<chrome.debugger.TargetInfo[]>(resolve =>
    chrome.debugger.getTargets(resolve)
  );
  const sw = targets.find(t => t.type === 'worker' && t.url === swUrl);
  if (!sw) throw new Error('Background worker target not found.');
  if (selfTargetId === sw.id) return sw.id;
  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach({ targetId: sw.id }, '1.3', () => {
      if (chrome.runtime.lastError) {
        if (/already attached/i.test(chrome.runtime.lastError.message ?? '')) {
          selfTargetId = sw.id; resolve();
        } else reject(new Error(chrome.runtime.lastError.message));
      } else {
        chrome.debugger.sendCommand({ targetId: sw.id }, 'Runtime.enable', {}, () => {});
        selfTargetId = sw.id; resolve();
      }
    });
  });
  return sw.id;
}

chrome.debugger.onDetach.addListener((source) => {
  if (source.targetId === selfTargetId) selfTargetId = null;
});

async function executeBridgeExpr(jsExpr: string): Promise<{ text: string; isError: boolean; image?: string }> {
  try {
    const targetId = await ensureSelfAttached();
    const isMultiLine = jsExpr.includes('\n');
    const isStatement = isMultiLine || jsExpr.trimEnd().endsWith(';');
    const wrapped = isStatement
      ? `(new (Object.getPrototypeOf(async function(){}).constructor)(${JSON.stringify(tryReturnLastExpr(jsExpr))}))()`
      : `(async () => { ${jsExpr} })()`;

    const result = await new Promise<any>((resolve, reject) => {
      chrome.debugger.sendCommand(
        { targetId },
        'Runtime.evaluate',
        { expression: wrapped, awaitPromise: true, returnByValue: false, generatePreview: false, objectGroup: 'bridge' },
        (res: any) => {
          if (chrome.runtime.lastError) {
            selfTargetId = null;
            reject(new Error(chrome.runtime.lastError.message));
          } else if (res?.exceptionDetails) {
            const msg = res.exceptionDetails.exception?.description
              ?? res.exceptionDetails.text ?? 'Unknown error';
            reject(new Error(msg));
          } else {
            const r = res?.result;
            if (!r || r.type === 'undefined') resolve(undefined);
            else if (r.type === 'string' || r.type === 'number' || r.type === 'boolean') resolve(r.value);
            else resolve(r.description ?? 'Done');
          }
        }
      );
    });

    return formatBridgeResult(result);
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

    if (mode === 'playwright' || command.includes('\n')) {
      const isMultiLine = command.includes('\n');
      const isStatement = isMultiLine || command.trimEnd().endsWith(';');
      const body = isStatement ? tryReturnLastExpr(command.trim()) : `return (${command.trim()})`;
      return executeBridgeExpr(body);
    }

    // mode === 'pw' — bare word that looks like a command but isn't recognized
    return { text: parsed.error, isError: true };
  }

  // Known keyword command — evaluate jsExpr directly in SW scope
  return executeBridgeExpr(parsed.jsExpr);
}

async function handleBridgeCommand(msg: {
  command: string;
  scriptType?: 'command' | 'script';
  language?: 'pw' | 'javascript';
}): Promise<{ text: string; isError: boolean; image?: string }> {
  if (!currentPage) {
    const tabId = await getActiveTabId();
    if (tabId) await attachToTab(tabId);
    if (!currentPage) return { text: 'No active tab to attach to.', isError: true };
  }

  const { command, scriptType, language } = msg;

  // Script mode: execute each line as a separate pw command
  if (scriptType === 'script' && language !== 'javascript') {
    const lines = command.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const output: string[] = [];
    let isError = false;
    for (const line of lines) {
      const r = await executeSingleCommand(line).catch((err: unknown) => ({ text: String(err), isError: true }));
      output.push(`${r.isError ? '\u2717' : '\u2713'} ${line}${r.text ? `\n  ${r.text}` : ''}`);
      if (r.isError) { isError = true; break; }
    }
    return { text: output.join('\n'), isError };
  }

  // Single command or JS script
  return executeSingleCommand(command);
}

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'bridge-command') {
    handleBridgeCommand(msg).then(sendResponse).catch(e =>
      sendResponse({ text: String(e), isError: true })
    );
    return true;
  }
  if (msg.type === 'attach')        { attachToTab(msg.tabId).then(sendResponse); return true; }
  if (msg.type === 'detach')        {
    if (activeTabId !== null && crxApp) {
      crxApp.detach(activeTabId).catch(() => {});
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
  if (msg.type === 'ping') { sendResponse({ pong: true }); return false; }
  if (msg.type === 'debug-resume') { if (__dbgResolve) __dbgResolve(false); sendResponse({ ok: true }); return false; }
  if (msg.type === 'debug-stop')   { if (__dbgResolve) __dbgResolve(true);  sendResponse({ ok: true }); return false; }
});

// Expose stable globals for swDebugEval — functions that never change go here, not inside attachToTab
(globalThis as any).attachToTab = attachToTab;

// ─── JS Step Debugger ─────────────────────────────────────────────────────────

let __dbgResolve: ((stop: boolean) => void) | null = null;

(globalThis as any).__breakpoint__ = async function __breakpoint__(lineIndex: number): Promise<void> {
    chrome.runtime.sendMessage({ type: 'debug-paused', line: lineIndex }).catch(() => {});
    const stop = await new Promise<boolean>(resolve => { __dbgResolve = resolve; });
    __dbgResolve = null;
    if (stop) throw new Error('__debug_stopped__');
};
