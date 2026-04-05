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
      return { result };
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

  if (attachedTabId !== null && attachedTabId !== tabId) {
    chrome.debugger.detach({ tabId: attachedTabId }).catch(() => {});
  }

  if (attachedTabId !== tabId) {
    await new Promise<void>((resolve, reject) => {
      chrome.debugger.attach({ tabId }, '1.3', () => {
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve();
      });
    });
    attachedTabId = tabId;
  }

  return {
    targetInfo: {
      targetId: String(tabId),
      type: 'page',
      title: tab.title || '',
      url: tab.url || '',
      attached: true,
      browserContextId: 'default',
      canAccessOpener: false,
    },
  };
}

async function doForwardCommand(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<unknown> {
  if (attachedTabId === null) throw new Error('No tab attached');

  const debuggee = sessionId
    ? { targetId: sessionId }
    : { tabId: attachedTabId };

  return new Promise((resolve, reject) => {
    chrome.debugger.sendCommand(debuggee, method, params || {}, (result: unknown) => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(result);
    });
  });
}

function setupEventForwarding(): void {
  chrome.debugger.onEvent.addListener((source: any, method: string, params: any) => {
    console.log('[cdp-relay] debugger event:', method, 'sendToNode:', !!sendToNode);
    if (!sendToNode) return;
    sendToNode({
      method: 'forwardCDPEvent',
      params: {
        method,
        params,
        sessionId: source.targetId !== undefined ? String(source.targetId) : undefined,
      },
    });
  });

  chrome.debugger.onDetach.addListener((source: any) => {
    if (source.tabId === attachedTabId) attachedTabId = null;
  });
}
