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
    if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
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

async function startRecording(): Promise<{ ok: boolean; url?: string; error?: string }> {
  try {
    if (!crxApp) crxApp = await crx.start();

    const tabId = await getActiveTabId();
    if (tabId && crxApp.context().pages().length === 0) await attachToTab(tabId);

    const url = crxApp.context().pages()[0]?.url();

    // Fire without await — recorder.show() waits for the panel to connect back via port,
    // but the panel only calls connectWithRetry() after receiving { ok: true } here.
    // Awaiting would create a deadlock.
    crxApp.recorder.show({
      mode: 'recording',
      language: 'javascript',
      window: { type: 'sidepanel', url: 'panel/panel.html' },
    }).catch((e: unknown) => console.error('[record] recorder.show error:', e));

    return { ok: true, url };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function stopRecording(): Promise<{ ok: boolean }> {
  await crxApp?.recorder.hide().catch(() => {});
  return { ok: true };
}

// ─── Pick Element (experimental) ─────────────────────────────────────────────

async function startPicking(): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!crxApp) crxApp = await crx.start();

    const tabId = await getActiveTabId();
    if (tabId && crxApp.context().pages().length === 0) await attachToTab(tabId);

    crxApp.recorder.show({
      mode: 'inspecting',
      language: 'javascript',
      window: { type: 'sidepanel', url: 'panel/panel.html' },
    }).catch((e: unknown) => console.error('[pick] recorder.show error:', e));

    // Disable overlay toolbar buttons (runs in background, don't block response)
    disableOverlayToolbar().catch(() => {});

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function stopPicking(): Promise<{ ok: boolean }> {
  // Remove injected style before hiding recorder (so recording still shows overlay)
  if (activeTabId) {
    removeOverlayHide(activeTabId).catch(() => {});
  }
  await crxApp?.recorder.hide().catch(() => {});
  return { ok: true };
}

async function removeOverlayHide(tabId: number): Promise<void> {
  try {
    const doc = await cdpCommand(tabId, 'DOM.getDocument', { depth: 0 });
    const { nodeId: glassId } = await cdpCommand(tabId, 'DOM.querySelector', {
      nodeId: doc.root.nodeId, selector: 'x-pw-glass',
    });
    if (!glassId) return;
    const desc = await cdpCommand(tabId, 'DOM.describeNode', {
      nodeId: glassId, depth: 1, pierce: true,
    });
    const shadowId = desc?.node?.shadowRoots?.[0]?.nodeId;
    if (!shadowId) return;
    const { object } = await cdpCommand(tabId, 'DOM.resolveNode', { nodeId: shadowId });
    if (!object?.objectId) return;
    await cdpCommand(tabId, 'Runtime.callFunctionOn', {
      objectId: object.objectId,
      functionDeclaration: `function() {
        var s = this.querySelector('#pw-repl-hide-overlay');
        if (s) s.remove();
      }`,
    });
  } catch { /* best-effort cleanup */ }
}

// ─── CDP Helpers ─────────────────────────────────────────────────────────────

function cdpCommand(tabId: number, method: string, params: Record<string, unknown> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, method, params, (result) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message ?? ''));
      else resolve(result);
    });
  });
}

function cdpEvaluate(tabId: number, expression: string): Promise<unknown> {
  return cdpCommand(tabId, 'Runtime.evaluate', {
    expression, objectGroup: 'console', returnByValue: false, generatePreview: true, awaitPromise: true,
  });
}

function cdpGetProperties(tabId: number, objectId: string): Promise<unknown> {
  return cdpCommand(tabId, 'Runtime.getProperties', {
    objectId, ownProperties: true, generatePreview: true,
  });
}

/**
 * Hide the recorder's overlay toolbar via CDP.
 *
 * The overlay (x-pw-overlay) lives inside x-pw-glass's CLOSED shadow root,
 * so normal CSS/JS can't reach it. We use CDP DOM domain to pierce the
 * shadow boundary, resolve the shadow root to a JS reference, and inject
 * a <style> with !important — this beats the recorder's inline style
 * updates (e.g. `element.style.display = 'flex'` from _showOverlay).
 */
async function disableOverlayToolbar(): Promise<void> {
  if (!activeTabId) return;
  const tabId = activeTabId;

  for (let i = 0; i < 15; i++) {
    await new Promise(r => setTimeout(r, 200));
    try {
      const doc = await cdpCommand(tabId, 'DOM.getDocument', { depth: 0 });
      const { nodeId: glassId } = await cdpCommand(tabId, 'DOM.querySelector', {
        nodeId: doc.root.nodeId, selector: 'x-pw-glass',
      });
      if (!glassId) continue;

      const desc = await cdpCommand(tabId, 'DOM.describeNode', {
        nodeId: glassId, depth: 1, pierce: true,
      });
      const shadowId = desc?.node?.shadowRoots?.[0]?.nodeId;
      if (!shadowId) continue;

      // Verify overlay exists before injecting
      const { nodeId: overlayId } = await cdpCommand(tabId, 'DOM.querySelector', {
        nodeId: shadowId, selector: 'x-pw-overlay',
      });
      if (!overlayId) continue;

      // Resolve shadow root to JS reference and inject a <style> tag
      // CSS !important in stylesheet beats inline styles without !important,
      // so this persists even when recorder JS sets element.style.display = 'flex'
      const { object } = await cdpCommand(tabId, 'DOM.resolveNode', { nodeId: shadowId });
      if (!object?.objectId) continue;

      await cdpCommand(tabId, 'Runtime.callFunctionOn', {
        objectId: object.objectId,
        functionDeclaration: `function() {
          if (this.querySelector('#pw-repl-hide-overlay')) return;
          var s = document.createElement('style');
          s.id = 'pw-repl-hide-overlay';
          s.textContent = 'x-pw-overlay { display: none !important; }';
          this.appendChild(s);
        }`,
      });

      console.log('[pick] Overlay toolbar hidden');
      return;
    } catch (e) {
      console.error('[pick] attempt', i, e);
    }
  }
  console.warn('[pick] Failed to hide overlay after 15 attempts');
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

    if (mode === 'playwright') {
      const isMultiLine = command.includes('\n');
      const isStatement = isMultiLine || command.trimEnd().endsWith(';');
      const body = isStatement ? tryReturnLastExpr(command.trim()) : `return (${command.trim()})`;
      return executeBridgeExpr(body);
    }

    if (mode === 'js' || mode === 'pw') {
      try {
        const expr = command.trim();
        const wrapped = `(function(){try{var __v=(${expr});`
          + `if(__v===undefined)return undefined;`
          + `try{return JSON.stringify(__v,null,2);}catch(_){return String(__v);}`
          + `}catch(e){throw e;}})()`;
        const raw = await cdpEvaluate(activeTabId!, wrapped) as any;
        if (raw?.exceptionDetails) {
          const errMsg = raw.exceptionDetails.exception?.description ?? raw.exceptionDetails.text ?? 'Unknown error';
          return { text: errMsg, isError: true };
        }
        const r = raw?.result;
        if (!r || r.type === 'undefined') return { text: 'Done', isError: false };
        if (r.type === 'string') return { text: r.value as string, isError: false };
        if (r.type === 'number' || r.type === 'boolean') return { text: String(r.value), isError: false };
        return { text: r.description ?? 'Done', isError: false };
      } catch (e: any) {
        if (mode === 'pw') return { text: parsed.error, isError: true };
        return { text: e?.message ?? String(e), isError: true };
      }
    }

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
  if (msg.type === 'health')        { sendResponse({ ok: !!crxApp }); return false; }
  if (msg.type === 'record-start')  { startRecording().then(sendResponse); return true; }
  if (msg.type === 'record-stop')   { stopRecording().then(sendResponse); return true; }
  if (msg.type === 'pick-start')    { startPicking().then(sendResponse); return true; }
  if (msg.type === 'pick-stop')     { stopPicking().then(sendResponse); return true; }
  if (msg.type === 'cdp-evaluate')  {
    if (!activeTabId) { sendResponse({ error: 'Not attached to any tab.' }); return false; }
    cdpEvaluate(activeTabId, msg.expression).then(sendResponse).catch(e => sendResponse({ error: String(e) }));
    return true;
  }
  if (msg.type === 'cdp-get-properties') {
    if (!activeTabId) { sendResponse({ error: 'Not attached to any tab.' }); return false; }
    cdpGetProperties(activeTabId, msg.objectId).then(sendResponse).catch(e => sendResponse({ error: String(e) }));
    return true;
  }
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
