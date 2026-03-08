import { crx } from '@playwright-repl/playwright-crx';
import type { CrxApplication } from '@playwright-repl/playwright-crx';
import { expect } from '@playwright-repl/playwright-crx/test';
import type { Page } from '@playwright-repl/playwright-crx/test';
import { loadSettings } from './panel/lib/settings';
import type { PwReplSettings } from './panel/lib/settings';

// ─── Settings + Action (sidepanel / popup) ───────────────────────────────────

// Disable auto-open so action.onClicked fires (Chrome persists this across reloads)
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});

let cachedSettings: PwReplSettings = { openAs: 'sidepanel' };
loadSettings().then(s => cachedSettings = s).catch(() => {});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.openAs) {
    cachedSettings.openAs = changes.openAs.newValue;
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

// ─── CDP Evaluate ────────────────────────────────────────────────────────────

function cdpEvaluate(tabId: number, expression: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      { expression, objectGroup: 'console', returnByValue: false, generatePreview: true, awaitPromise: true },
      (result) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result);
      }
    );
  });
}

function cdpGetProperties(tabId: number, objectId: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(
      { tabId },
      'Runtime.getProperties',
      { objectId, ownProperties: true, generatePreview: true },
      (result) => {
        if (chrome.runtime.lastError) reject(chrome.runtime.lastError);
        else resolve(result);
      }
    );
  });
}

// ─── Message Handler ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'attach')        { attachToTab(msg.tabId).then(sendResponse); return true; }
  if (msg.type === 'health')        { sendResponse({ ok: !!crxApp }); return false; }
  if (msg.type === 'record-start')  { startRecording().then(sendResponse); return true; }
  if (msg.type === 'record-stop')   { stopRecording().then(sendResponse); return true; }
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
