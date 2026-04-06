/**
 * CDP Relay Handler — simple CDP proxy for chrome.debugger.
 *
 * The extension is a dumb relay:
 * - Receives { method, params } from Node → calls chrome.debugger.sendCommand
 * - Forwards chrome.debugger.onEvent back to Node
 *
 * Returns results directly — the offscreen doc sends them back to the relay.
 * CDP events are pushed via sendToNode callback.
 */

type SendFn = (msg: Record<string, unknown>) => void;

let sendToNode: SendFn | null = null;
let attachedTabId: number | null = null;

// ─── Public API ─────────────────────────────────────────────────────────────

export function initCdpRelay(send: SendFn): void {
  sendToNode = send;
  setupEventForwarding();
}

export function disposeCdpRelay(): void {
  sendToNode = null;
  if (attachedTabId !== null) {
    chrome.debugger.detach({ tabId: attachedTabId }).catch(() => {});
    attachedTabId = null;
  }
}

/**
 * Handle a request from the Node CDP relay server.
 * Returns { result } or { error } — caller sends it back.
 */
export async function handleCdpCommand(msg: { method: string; params?: Record<string, unknown> }): Promise<{ result?: unknown; error?: string }> {
  const { method, params } = msg;

  try {
    if (method === 'attachToTab') {
      const result = await doAttachToTab();
      return { result };
    }

    if (method === 'forwardCDPCommand') {
      const cdpMethod = (params as any)?.method as string;
      const cdpParams = (params as any)?.params;
      const sessionId = (params as any)?.sessionId;
      const result = await doForwardCommand(cdpMethod, cdpParams, sessionId);
      // chrome.debugger.sendCommand returns undefined for commands with empty results
      // (e.g. Page.enable, Runtime.enable). Ensure result is at least {} so it
      // survives JSON serialization — without this, the { result } field is dropped
      // and Playwright's callback never resolves.
      return { result: result ?? {} };
    }

    return { error: `Unknown method: ${method}` };
  } catch (err: unknown) {
    return { error: (err as Error).message };
  }
}

// ─── Internals ──────────────────────────────────────────────────────────────

async function doAttachToTab(): Promise<{ targetInfo: Record<string, unknown> }> {
  // Try active tab first, fall back to any non-extension tab
  let [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
    const tabs = await chrome.tabs.query({});
    tab = tabs.find((t: any) => t.id && t.url && !t.url.startsWith('chrome://') && !t.url.startsWith('chrome-extension://'))!;
  }
  if (!tab?.id) throw new Error('No suitable tab found');

  const tabId = tab.id;

  // Always detach first — ensures a fresh debugger session so Runtime.enable etc.
  // re-send events (executionContextCreated). Without this, reconnecting to the
  // same tab reuses a stale session where domains are already enabled.
  if (attachedTabId !== null && attachedTabId !== tabId)
    await chrome.debugger.detach({ tabId: attachedTabId }).catch(() => {});
  await chrome.debugger.detach({ tabId }).catch(() => {});
  attachedTabId = null;

  await new Promise<void>((resolve, reject) => {
    chrome.debugger.attach({ tabId }, '1.3', () => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve();
    });
  });
  attachedTabId = tabId;

  // Get targetInfo from CDP (matches Playwright MCP extension approach)
  const result: any = await new Promise((resolve, reject) => {
    chrome.debugger.sendCommand({ tabId }, 'Target.getTargetInfo', {}, (r: unknown) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(r);
    });
  });
  return { targetInfo: result?.targetInfo };
}

async function doForwardCommand(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown> {
  if (attachedTabId === null) throw new Error('No tab attached');

  // Must include tabId alongside sessionId — chrome.debugger needs both.
  const debuggee: Record<string, unknown> = { tabId: attachedTabId };
  if (sessionId) debuggee.sessionId = sessionId;

  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, params || {}, (result: unknown) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

function setupEventForwarding(): void {
  chrome.debugger.onEvent.addListener((source: any, method: string, params: any) => {
    if (!sendToNode) return;
    if (source.tabId !== attachedTabId) return;
    sendToNode({
      method: 'forwardCDPEvent',
      params: {
        method,
        params,
        sessionId: source.sessionId,
      },
    });
  });

  chrome.debugger.onDetach.addListener((source: any) => {
    if (source.tabId === attachedTabId) attachedTabId = null;
  });
}
