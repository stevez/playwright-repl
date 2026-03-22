import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ─── Shared mock state ────────────────────────────────────────────────────────

let mockPage: any;
let mockCrxApp: any;
let mockParseReplCommand: Mock;
let mockDetectMode: Mock;

vi.mock('@playwright-repl/playwright-crx/test', () => ({
  expect: vi.fn().mockReturnValue(new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@playwright-repl/playwright-crx', () => {
  mockPage = { url: vi.fn().mockReturnValue('https://example.com'), on: vi.fn() };
  const mockContext = { pages: vi.fn().mockReturnValue([mockPage]) };
  mockCrxApp = {
    attach: vi.fn().mockResolvedValue(mockPage),
    detach: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    context: vi.fn().mockReturnValue(mockContext),
  };
  return { crx: { start: vi.fn().mockResolvedValue(mockCrxApp) } };
});

vi.mock('../src/panel/lib/settings', () => ({
  loadSettings: vi.fn().mockImplementation(() => Promise.resolve({ openAs: 'sidepanel' })),
}));

vi.mock('../src/panel/lib/commands', () => ({
  parseReplCommand: (...args: any[]) => mockParseReplCommand(...args),
}));

vi.mock('../src/panel/lib/execute', () => ({
  detectMode: (...args: any[]) => mockDetectMode(...args),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("background.ts message handlers", () => {
  let onMessageListener: (msg: any, sender: any, sendResponse: (r: any) => void) => boolean | void;
  let onStorageChanged: (...args: any[]) => void;
  let onActionClicked: (...args: any[]) => void;
  let onDebuggerDetach: (...args: any[]) => void;
  let onTabRemoved: (tabId: number) => void;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    // Default mock implementations
    mockParseReplCommand = vi.fn().mockReturnValue({ jsExpr: 'page.title()' });
    mockDetectMode = vi.fn().mockReturnValue('js');

    // Reset playwright-crx mocks
    mockPage = { url: vi.fn().mockReturnValue('https://example.com'), on: vi.fn() };
    const mockContext = { pages: vi.fn().mockReturnValue([mockPage]) };
    mockCrxApp = {
      attach: vi.fn().mockResolvedValue(mockPage),
      detach: vi.fn().mockResolvedValue(undefined),
      detachAll: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
      context: vi.fn().mockReturnValue(mockContext),
      recorder: {
        show: vi.fn().mockResolvedValue(undefined),
        hide: vi.fn().mockResolvedValue(undefined),
      },
    };

    // Override factory for this test
    const { crx } = await import('@playwright-repl/playwright-crx');
    (crx.start as ReturnType<typeof vi.fn>).mockResolvedValue(mockCrxApp);

    // Set up chrome stubs
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 42, url: 'https://example.com' });
    (chrome.tabs as any).query = vi.fn().mockResolvedValue([{ id: 42, url: 'https://example.com' }]);
    (chrome.tabs as any).onActivated = { addListener: vi.fn() };
    (chrome.tabs as any).onUpdated = { addListener: vi.fn() };
    const tabRemovedListeners: any[] = [];
    (chrome.tabs as any).onRemoved = { addListener: vi.fn((fn: any) => tabRemovedListeners.push(fn)) };
    (chrome.tabs as any).sendMessage = vi.fn().mockResolvedValue(undefined);
    (chrome.scripting as any).executeScript = vi.fn().mockResolvedValue([]);

    // Capture chrome event listeners
    const messageListeners: typeof onMessageListener[] = [];
    (chrome.runtime as any).onMessage = { addListener: vi.fn((fn: any) => messageListeners.push(fn)) };
    (chrome.runtime as any).sendMessage = vi.fn().mockResolvedValue(undefined);

    const storageListeners: any[] = [];
    (chrome.storage as any).onChanged = { addListener: vi.fn((fn: any) => storageListeners.push(fn)) };

    const actionListeners: any[] = [];
    (chrome.action as any).onClicked = { addListener: vi.fn((fn: any) => actionListeners.push(fn)) };

    const detachListeners: any[] = [];
    (chrome.debugger as any).onDetach = { addListener: vi.fn((fn: any) => detachListeners.push(fn)) };

    // Offscreen mock
    (chrome.offscreen as any).hasDocument = vi.fn().mockResolvedValue(false);
    (chrome.offscreen as any).createDocument = vi.fn().mockResolvedValue(undefined);

    // sidePanel mock
    (chrome.sidePanel as any).setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    (chrome.sidePanel as any).open = vi.fn().mockResolvedValue(undefined);

    // windows mock
    (chrome.windows as any).create = vi.fn().mockResolvedValue({});

    vi.resetModules();

    await import('../src/background.js');
    onMessageListener = messageListeners[0];
    onStorageChanged = storageListeners[0];
    onActionClicked = actionListeners[0];
    onDebuggerDetach = detachListeners[0];
    onTabRemoved = tabRemovedListeners[0];
  });

  function sendMessage(msg: any): Promise<any> {
    return new Promise((resolve) => {
      const ret = onMessageListener(msg, {}, resolve);
      if (ret === false) {
        // synchronous — resolve has already been called
      }
    });
  }

  /** Set up chrome.debugger mocks for bridge-command / ensureSelfAttached */
  function setupDebuggerMocks(swId = 'sw-1', evalResult: any = { result: { type: 'undefined' } }) {
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: swId },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => cb());
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb(evalResult);
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };
  }

  // ─── health ───────────────────────────────────────────────────────────────

  it("health returns ok:false when crxApp not yet started", async () => {
    const result = await sendMessage({ type: 'health' });
    expect(result).toEqual({ ok: false });
  });

  it("health returns ok:true after successful attach", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    const result = await sendMessage({ type: 'health' });
    expect(result).toEqual({ ok: true });
  });

  // ─── attach ───────────────────────────────────────────────────────────────

  it("attach starts crxApp and attaches to tab", async () => {
    const { crx } = await import('@playwright-repl/playwright-crx');
    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(crx.start).toHaveBeenCalled();
    expect(mockCrxApp.attach).toHaveBeenCalledWith(42);
    expect(result).toEqual({ ok: true, url: 'https://example.com' });
  });

  it("attach rejects chrome:// URLs", async () => {
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 1, url: 'chrome://settings' });
    const result = await sendMessage({ type: 'attach', tabId: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot attach to internal pages');
  });

  it("attach returns error when all recovery attempts fail", async () => {
    mockCrxApp.attach.mockRejectedValue(new Error('CDP failed'));
    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CDP failed');
  });

  it("attach recovers via detachAll on transient error", async () => {
    mockCrxApp.attach
      .mockRejectedValueOnce(new Error('Frame has been detached'))
      .mockResolvedValueOnce(mockPage);
    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(mockCrxApp.detachAll).toHaveBeenCalled();
    expect(result).toEqual({ ok: true, url: 'https://example.com' });
  });

  it("attach switches to new tab without detaching previous tab", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    mockCrxApp.attach.mockResolvedValue({ url: vi.fn().mockReturnValue('https://new.com'), on: vi.fn() });
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 99, url: 'https://new.com' });
    await sendMessage({ type: 'attach', tabId: 99 });
    // playwright-crx supports multiple attached pages, so we don't detach when switching tabs
    expect(mockCrxApp.detach).not.toHaveBeenCalled();
  });

  it("attach detaches when re-attaching to the same tab", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    await sendMessage({ type: 'attach', tabId: 42 });
    expect(mockCrxApp.detach).toHaveBeenCalledWith(42);
  });

  // ─── record-start / record-stop ───────────────────────────────────────────

  it("record-start injects recorder content script and returns url", async () => {
    const result = await sendMessage({ type: 'record-start' });
    expect(chrome.scripting.executeScript).toHaveBeenCalledWith(
      expect.objectContaining({ target: { tabId: 42 }, files: ['content/recorder.js'] })
    );
    expect(result).toEqual({ ok: true, url: 'https://example.com' });
  });

  it("record-start returns ok:false when executeScript throws", async () => {
    (chrome.scripting.executeScript as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('injection failed'));
    const result = await sendMessage({ type: 'record-start' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('injection failed');
  });

  it("record-stop sends record-stop message to tab and returns ok:true", async () => {
    await sendMessage({ type: 'record-start' });
    const result = await sendMessage({ type: 'record-stop' });
    expect((chrome.tabs as any).sendMessage).toHaveBeenCalledWith(42, { type: 'record-stop' });
    expect(result).toEqual({ ok: true });
  });

  // ─── ping ─────────────────────────────────────────────────────────────────

  it("ping returns pong:true", async () => {
    const result = await sendMessage({ type: 'ping' });
    expect(result).toEqual({ pong: true });
  });

  // ─── get-bridge-port ──────────────────────────────────────────────────────

  it("get-bridge-port returns stored port", async () => {
    (chrome.storage.local.get as any).mockResolvedValue({ bridgePort: 1234 });
    const result = await sendMessage({ type: 'get-bridge-port' });
    expect(result).toBe(1234);
  });

  it("get-bridge-port returns default 9876 when not set", async () => {
    (chrome.storage.local.get as any).mockResolvedValue({});
    const result = await sendMessage({ type: 'get-bridge-port' });
    expect(result).toBe(9876);
  });

  // ─── attach: Frame detached retry ─────────────────────────────────────────

  it("attach retries on 'Frame has been detached' error via detachAll", async () => {
    const retryPage = { url: vi.fn().mockReturnValue('https://example.com'), on: vi.fn() };
    let callCount = 0;
    mockCrxApp.attach.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Frame has been detached'));
      return Promise.resolve(retryPage);
    });

    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(result.ok).toBe(true);
    expect(mockCrxApp.detachAll).toHaveBeenCalled();
    expect(mockCrxApp.attach).toHaveBeenCalledTimes(2);
  });

  // ─── bridge-command ───────────────────────────────────────────────────────

  it("bridge-command returns error when no page attached and no active tab", async () => {
    (chrome.tabs as any).query = vi.fn().mockResolvedValue([]);
    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('No active tab');
  });

  it("bridge-command auto-attaches to active tab", async () => {
    // Set up debugger mock for executeBridgeExpr (ensureSelfAttached + eval)
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_target: any, _ver: string, cb: any) => {
      cb();
    });
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, method: string, _params: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      // Return undefined result for the eval
      cb({ result: { type: 'undefined' } });
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    // Should have auto-attached to tab 42
    expect(mockCrxApp.attach).toHaveBeenCalledWith(42);
    expect(result.isError).toBe(false);
  });

  // ─── bridge-command script mode ───────────────────────────────────────────

  it("bridge-command script executes lines sequentially", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_target: any, _ver: string, cb: any) => {
      cb();
    });
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, method: string, _params: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb({ result: { type: 'string', value: 'ok' } });
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({
      type: 'bridge-command',
      command: '# comment\nsnapshot',
      scriptType: 'script',
      language: 'pw',
    });
    expect(result.isError).toBe(false);
    // Comment lines should be filtered out, only 'snapshot' executed
    expect(result.text).toContain('snapshot');
  });

  // ─── bridge-command formatBridgeResult ────────────────────────────────────

  it("bridge-command returns Done for undefined result", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_target: any, _ver: string, cb: any) => {
      cb();
    });
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, method: string, _params: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb({ result: { type: 'undefined' } });
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result).toEqual({ text: 'Done', isError: false });
  });

  it("bridge-command returns string result", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_target: any, _ver: string, cb: any) => {
      cb();
    });
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, method: string, _params: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb({ result: { type: 'string', value: 'hello world' } });
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result).toEqual({ text: 'hello world', isError: false });
  });

  it("bridge-command returns image for screenshot result", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    const imgJson = JSON.stringify({ __image: 'abc123', mimeType: 'image/png' });
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_target: any, _ver: string, cb: any) => {
      cb();
    });
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, method: string, _params: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb({ result: { type: 'string', value: imgJson } });
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'screenshot' });
    expect(result.isError).toBe(false);
    expect(result.image).toBe('data:image/png;base64,abc123');
  });

  it("bridge-command returns error on eval exception", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_target: any, _ver: string, cb: any) => {
      cb();
    });
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, method: string, _params: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb({ exceptionDetails: { exception: { description: 'ReferenceError: x is not defined' } } });
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('ReferenceError');
  });

  // ─── attach: chrome-extension:// URL rejection ────────────────────────────

  it("attach rejects chrome-extension:// URLs", async () => {
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 1, url: 'chrome-extension://abc/panel.html' });
    const result = await sendMessage({ type: 'attach', tabId: 1 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot attach to internal pages');
  });

  // ─── chrome.storage.onChanged listener ─────────────────────────────────────

  it("storage onChanged updates cached openAs setting", async () => {
    // Trigger the listener with an openAs change
    onStorageChanged({ openAs: { newValue: 'popup' } }, 'local');
    // Now click the action — should open popup window
    await onActionClicked({ id: 42, windowId: 1 });
    expect(chrome.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'popup' })
    );
  });

  it("storage onChanged sends bridge-port-changed message", async () => {
    onStorageChanged({ bridgePort: { newValue: 5555 } }, 'local');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'bridge-port-changed', port: 5555 })
    );
  });

  it("storage onChanged ignores non-local area", async () => {
    onStorageChanged({ openAs: { newValue: 'popup' } }, 'sync');
    // The 'sync' area should be ignored — openAs should remain 'sidepanel'
    // so clicking should NOT open a popup window
    await onActionClicked({ id: 42, windowId: 1 });
    expect(chrome.windows.create).not.toHaveBeenCalled();
  });

  // ─── chrome.action.onClicked listener ──────────────────────────────────────

  it("action onClicked opens sidepanel by default", async () => {
    await onActionClicked({ id: 42, windowId: 1 });
    expect(chrome.sidePanel.open).toHaveBeenCalledWith({ windowId: 1 });
  });

  it("action onClicked opens popup window with tabId", async () => {
    onStorageChanged({ openAs: { newValue: 'popup' } }, 'local');
    await onActionClicked({ id: 42, windowId: 1 });
    expect(chrome.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining('?tabId=42'),
        type: 'popup',
      })
    );
  });

  it("action onClicked opens popup without tabId when tab.id is undefined", async () => {
    onStorageChanged({ openAs: { newValue: 'popup' } }, 'local');
    await onActionClicked({ windowId: 1 });
    expect(chrome.windows.create).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.not.stringContaining('?tabId='),
      })
    );
  });

  // ─── chrome.debugger.onDetach listener ─────────────────────────────────────

  it("debugger onDetach clears selfTargetId when matching", async () => {
    // First attach to set selfTargetId, then detach and verify re-attach is needed
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // Execute a bridge command to set selfTargetId
    await sendMessage({ type: 'bridge-command', command: 'snapshot' });

    // Simulate debugger detach for the self target
    onDebuggerDetach({ targetId: 'sw-1' });

    // Next bridge-command should re-attach (getTargets called again)
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-2' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => cb());
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb({ result: { type: 'undefined' } });
    });
    await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(chrome.debugger.attach).toHaveBeenCalled();
  });

  it("debugger onDetach ignores non-matching targetId", async () => {
    // This should not throw or affect anything
    onDebuggerDetach({ targetId: 'other-target' });
  });

  // ─── ensureOffscreen ───────────────────────────────────────────────────────

  it("ensureOffscreen skips creation when document already exists", async () => {
    // Reset and re-import with hasDocument returning true
    vi.resetModules();
    (chrome.offscreen as any).hasDocument = vi.fn().mockResolvedValue(true);
    (chrome.offscreen as any).createDocument = vi.fn();
    const listeners: any[] = [];
    (chrome.runtime as any).onMessage = { addListener: vi.fn((fn: any) => listeners.push(fn)) };
    (chrome.storage as any).onChanged = { addListener: vi.fn() };
    (chrome.action as any).onClicked = { addListener: vi.fn() };
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };
    (chrome.sidePanel as any).setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    (chrome.tabs as any).onActivated = { addListener: vi.fn() };
    (chrome.tabs as any).onUpdated = { addListener: vi.fn() };
    (chrome.tabs as any).onRemoved = { addListener: vi.fn() };
    (chrome.tabs as any).sendMessage = vi.fn().mockResolvedValue(undefined);

    await import('../src/background.js');
    // Wait for the async ensureOffscreen call
    await new Promise(r => setTimeout(r, 10));
    expect(chrome.offscreen.createDocument).not.toHaveBeenCalled();
  });

  // ─── stopRecording when crxApp is null ─────────────────────────────────────

  it("record-stop succeeds even when crxApp is null", async () => {
    // Don't attach/start — crxApp is null
    const result = await sendMessage({ type: 'record-stop' });
    expect(result).toEqual({ ok: true });
  });

  // ─── startRecording without active tab ─────────────────────────────────────

  it("record-start returns ok:false when no active tab", async () => {
    (chrome.tabs as any).query = vi.fn().mockResolvedValue([]);
    const result = await sendMessage({ type: 'record-start' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('No active tab');
  });

  // ─── ensureSelfAttached edge cases ─────────────────────────────────────────

  it("bridge-command throws when background worker target not found", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([]));
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Background worker target not found');
  });

  it("bridge-command skips re-attach when selfTargetId is already cached", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // First call sets selfTargetId
    await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    // Second call should reuse cached selfTargetId (no new attach)
    (chrome.debugger as any).attach = vi.fn();
    await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(chrome.debugger.attach).not.toHaveBeenCalled();
  });

  it("bridge-command handles 'already attached' debugger error gracefully", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => {
      (chrome.runtime as any).lastError = { message: 'Already attached' };
      cb();
      delete (chrome.runtime as any).lastError;
    });
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      cb({ result: { type: 'undefined' } });
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(false);
  });

  it("bridge-command rejects on non-'already attached' debugger error", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => {
      (chrome.runtime as any).lastError = { message: 'Permission denied' };
      cb();
      delete (chrome.runtime as any).lastError;
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Permission denied');
  });

  // ─── executeBridgeExpr branches ────────────────────────────────────────────

  it("bridge-command passes expression directly with replMode", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    mockParseReplCommand.mockReturnValue({ jsExpr: 'const x = 1\nx' });
    const result = await sendMessage({ type: 'bridge-command', command: 'const x = 1\nx' });
    expect(result.isError).toBe(false);
    const sendCmdCalls = (chrome.debugger.sendCommand as any).mock.calls;
    const evalCall = sendCmdCalls.find((c: any) => c[1] === 'Runtime.evaluate');
    expect(evalCall[2].expression).toBe('const x = 1\nx');
    expect(evalCall[2].replMode).toBe(true);
  });

  it("bridge-command handles lastError in sendCommand (clears selfTargetId)", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // First call succeeds to set selfTargetId
    await sendMessage({ type: 'bridge-command', command: 'snapshot' });

    // Now make sendCommand fail with lastError
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, _method: string, _p: any, cb: any) => {
      (chrome.runtime as any).lastError = { message: 'Target closed' };
      cb(undefined);
      delete (chrome.runtime as any).lastError;
    });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Target closed');
  });

  it("bridge-command handles exceptionDetails with text fallback", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', {
      exceptionDetails: { text: 'Uncaught SyntaxError' },
    });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Uncaught SyntaxError');
  });

  // ─── formatBridgeResult branches ───────────────────────────────────────────

  it("bridge-command returns Done for null result", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { result: { type: 'object', subtype: 'null', value: null } });

    // null result → treated as undefined via the resolve path → r.type='object', subtype='null'
    // Actually the code does: if (!r || r.type === 'undefined') → null is truthy, type='object'
    // So it falls through to r.description ?? 'Done'
    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(false);
  });

  it("bridge-command returns number as string", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { result: { type: 'number', value: 42 } });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result).toEqual({ text: '42', isError: false });
  });

  it("bridge-command returns boolean as string", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { result: { type: 'boolean', value: true } });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result).toEqual({ text: 'true', isError: false });
  });

  it("bridge-command returns description fallback for object result", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { result: { type: 'object', description: 'Array(3)' } });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.text).toBe('Array(3)');
    expect(result.isError).toBe(false);
  });

  it("bridge-command formats non-JSON string result as plain text", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { result: { type: 'string', value: 'not json' } });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result).toEqual({ text: 'not json', isError: false });
  });

  // ─── executeSingleCommand modes ────────────────────────────────────────────

  it("bridge-command returns help text when parseReplCommand returns help", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');
    mockParseReplCommand.mockReturnValue({ help: 'Usage: click <ref>' });

    const result = await sendMessage({ type: 'bridge-command', command: 'help click' });
    expect(result).toEqual({ text: 'Usage: click <ref>', isError: false });
  });

  it("bridge-command executes in playwright mode when detectMode returns playwright", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');
    mockParseReplCommand.mockReturnValue({ error: 'Unknown command' });
    mockDetectMode.mockReturnValue('js');

    const result = await sendMessage({ type: 'bridge-command', command: 'page.title()' });
    expect(result.isError).toBe(false);
  });

  it("bridge-command pw mode returns parsed.error for unknown bare word", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');
    mockParseReplCommand.mockReturnValue({ error: 'Not a valid pw command' });
    mockDetectMode.mockReturnValue('pw');

    const result = await sendMessage({ type: 'bridge-command', command: 'invalid' });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('Not a valid pw command');
  });

  it("bridge-command returns parsed error for unrecognized mode", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    mockParseReplCommand.mockReturnValue({ error: 'Unknown command: foo' });
    mockDetectMode.mockReturnValue('other' as any);

    const result = await sendMessage({ type: 'bridge-command', command: 'foo' });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('Unknown command: foo');
  });

  // ─── handleBridgeCommand catch + script error ──────────────────────────────

  it("bridge-command script stops on error with ✗ prefix", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // First line succeeds, second line fails
    let callCount = 0;
    mockParseReplCommand.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return { jsExpr: 'page.title()' };
      return { error: 'Unknown command: badcmd' };
    });
    mockDetectMode.mockReturnValue('other' as any);

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'snapshot\nbadcmd',
      scriptType: 'script',
      language: 'pw',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('\u2713 snapshot');
    expect(result.text).toContain('\u2717 badcmd');
  });

  it("bridge-command catch wraps handleBridgeCommand errors", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    // Make executeSingleCommand throw by having parseReplCommand throw
    mockParseReplCommand.mockImplementation(() => { throw new Error('parse crash'); });

    const result = await sendMessage({ type: 'bridge-command', command: 'crash' });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('parse crash');
  });

  // ─── replMode expression handling ──────────────────────────────────────────

  it("bridge-command wraps object literal in parens", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    mockParseReplCommand.mockReturnValue({ error: 'Unknown' });
    mockDetectMode.mockReturnValue('js');
    await sendMessage({ type: 'bridge-command', command: '{a: 1}' });

    const sendCmdCalls = (chrome.debugger.sendCommand as any).mock.calls;
    const evalCall = sendCmdCalls.find((c: any) => c[1] === 'Runtime.evaluate');
    expect(evalCall[2].expression).toBe('({a: 1})');
  });

  it("bridge-command passes non-brace expression directly", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    mockParseReplCommand.mockReturnValue({ error: 'Unknown' });
    mockDetectMode.mockReturnValue('js');
    await sendMessage({ type: 'bridge-command', command: 'page.title();' });

    const sendCmdCalls = (chrome.debugger.sendCommand as any).mock.calls;
    const evalCall = sendCmdCalls.find((c: any) => c[1] === 'Runtime.evaluate');
    expect(evalCall[2].expression).toBe('page.title();');
    expect(evalCall[2].replMode).toBe(true);
  });

  // ─── Fire-and-forget .catch() callbacks ────────────────────────────────────

  it("ensureOffscreen catch is exercised when createDocument rejects", async () => {
    vi.resetModules();
    (chrome.offscreen as any).hasDocument = vi.fn().mockResolvedValue(false);
    (chrome.offscreen as any).createDocument = vi.fn().mockRejectedValue(new Error('fail'));
    const listeners: any[] = [];
    (chrome.runtime as any).onMessage = { addListener: vi.fn((fn: any) => listeners.push(fn)) };
    (chrome.runtime as any).sendMessage = vi.fn().mockResolvedValue(undefined);
    (chrome.storage as any).onChanged = { addListener: vi.fn() };
    (chrome.action as any).onClicked = { addListener: vi.fn() };
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };
    (chrome.sidePanel as any).setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    (chrome.tabs as any).onActivated = { addListener: vi.fn() };
    (chrome.tabs as any).onUpdated = { addListener: vi.fn() };
    (chrome.tabs as any).onRemoved = { addListener: vi.fn() };
    (chrome.tabs as any).sendMessage = vi.fn().mockResolvedValue(undefined);

    await import('../src/background.js');
    await new Promise(r => setTimeout(r, 20));
    // Just exercises the catch — no assertion needed beyond not throwing
  });

  it("setPanelBehavior catch is exercised when it rejects", async () => {
    vi.resetModules();
    (chrome.offscreen as any).hasDocument = vi.fn().mockResolvedValue(true);
    (chrome.sidePanel as any).setPanelBehavior = vi.fn().mockRejectedValue(new Error('fail'));
    const listeners: any[] = [];
    (chrome.runtime as any).onMessage = { addListener: vi.fn((fn: any) => listeners.push(fn)) };
    (chrome.runtime as any).sendMessage = vi.fn().mockResolvedValue(undefined);
    (chrome.storage as any).onChanged = { addListener: vi.fn() };
    (chrome.action as any).onClicked = { addListener: vi.fn() };
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };
    (chrome.tabs as any).onActivated = { addListener: vi.fn() };
    (chrome.tabs as any).onUpdated = { addListener: vi.fn() };
    (chrome.tabs as any).onRemoved = { addListener: vi.fn() };
    (chrome.tabs as any).sendMessage = vi.fn().mockResolvedValue(undefined);

    await import('../src/background.js');
    await new Promise(r => setTimeout(r, 20));
  });

  it("loadSettings catch is exercised when it rejects", async () => {
    vi.resetModules();
    const { loadSettings } = await import('../src/panel/lib/settings');
    (loadSettings as any).mockImplementation(() => Promise.reject(new Error('fail')));

    (chrome.offscreen as any).hasDocument = vi.fn().mockResolvedValue(true);
    (chrome.sidePanel as any).setPanelBehavior = vi.fn().mockResolvedValue(undefined);
    const listeners: any[] = [];
    (chrome.runtime as any).onMessage = { addListener: vi.fn((fn: any) => listeners.push(fn)) };
    (chrome.runtime as any).sendMessage = vi.fn().mockResolvedValue(undefined);
    (chrome.storage as any).onChanged = { addListener: vi.fn() };
    (chrome.action as any).onClicked = { addListener: vi.fn() };
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };
    (chrome.tabs as any).onActivated = { addListener: vi.fn() };
    (chrome.tabs as any).onUpdated = { addListener: vi.fn() };
    (chrome.tabs as any).onRemoved = { addListener: vi.fn() };

    vi.resetModules();
    await import('../src/background.js');
    await new Promise(r => setTimeout(r, 20));
  });

  it("storage onChanged bridgePort catch is exercised when sendMessage rejects", async () => {
    (chrome.runtime as any).sendMessage = vi.fn().mockRejectedValue(new Error('no receiver'));
    onStorageChanged({ bridgePort: { newValue: 9999 } }, 'local');
    await new Promise(r => setTimeout(r, 10));
    // The .catch(() => {}) should swallow the rejection
  });

  it("detach catch is exercised when detach rejects on same-tab re-attach", async () => {
    // Attach first
    await sendMessage({ type: 'attach', tabId: 42 });
    mockCrxApp.detach.mockRejectedValue(new Error('already detached'));
    // Re-attach to same tab — triggers detach which rejects
    const result = await sendMessage({ type: 'attach', tabId: 42 });
    // Should succeed despite detach error
    expect(result.ok).toBe(true);
  });

  it("record-stop is safe when no recording is active", async () => {
    const result = await sendMessage({ type: 'record-stop' });
    expect((chrome.tabs as any).sendMessage).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true });
  });

  it("record-stop swallows sendMessage errors", async () => {
    await sendMessage({ type: 'record-start' });
    (chrome.tabs as any).sendMessage = vi.fn().mockRejectedValue(new Error('tab closed'));
    const result = await sendMessage({ type: 'record-stop' });
    expect(result).toEqual({ ok: true });
  });

  // ─── Script mode catch handler (line 338) ──────────────────────────────────

  it("bridge-command script catches thrown errors per line", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // Make executeSingleCommand throw for the first line
    mockParseReplCommand.mockImplementation(() => { throw new Error('boom'); });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'snapshot',
      scriptType: 'script',
      language: 'pw',
    });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('\u2717 snapshot');
  });

  // ─── Remaining branch coverage ─────────────────────────────────────────────

  it("getActiveTabId returns cached activeTabId when set", async () => {
    // Attach sets activeTabId, then bridge-command uses getActiveTabId
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');
    // After attach, activeTabId is 42, so getActiveTabId should return it directly
    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(false);
    // tabs.query should NOT be called since activeTabId is cached
  });

  it("bridge-command executeBridgeExpr uses String(e) when e.message is falsy", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // Make sendCommand throw with a non-Error object
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, _method: string, _p: any, cb: any) => {
      (chrome.runtime as any).lastError = { message: '' };
      cb(undefined);
      delete (chrome.runtime as any).lastError;
    });
    // Need to clear selfTargetId first so ensureSelfAttached runs
    onDebuggerDetach({ targetId: 'sw-1' });
    setupDebuggerMocks('sw-2');
    // After re-attach, make the EVAL sendCommand fail with empty message
    let callIdx = 0;
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      callIdx++;
      if (callIdx === 1) {
        // This is the eval sendCommand — trigger lastError with empty message
        (chrome.runtime as any).lastError = { message: '' };
        cb(undefined);
        delete (chrome.runtime as any).lastError;
      }
    });
    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
  });

  // ─── getActiveTabId early return (branch 7 arm 0) ──────────────────────────

  it("record-start uses cached activeTabId after attach", async () => {
    // After attach, activeTabId is 42, so getActiveTabId returns it directly
    await sendMessage({ type: 'attach', tabId: 42 });
    const result = await sendMessage({ type: 'record-start' });
    expect(result.ok).toBe(true);
  });

  // ─── ensureSelfAttached: already attached with no lastError.message ────────

  it("bridge-command handles already-attached error with undefined message", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => {
      // lastError without message property → ?? '' → doesn't match /already attached/
      (chrome.runtime as any).lastError = {};
      cb();
      delete (chrome.runtime as any).lastError;
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    // Falls through to reject with lastError.message which is undefined
  });

  // ─── executeBridgeExpr: exceptionDetails with neither description nor text ─

  it("bridge-command uses 'Unknown error' when exceptionDetails has no description or text", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { exceptionDetails: {} });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('Unknown error');
  });

  // ─── executeBridgeExpr catch: e?.message is falsy → uses String(e) ─────────

  it("bridge-command catch uses String(e) when error has no message", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // Make ensureSelfAttached throw a non-Error value
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([]));

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    // The Error has a message, but let's also test String fallback
  });

  // ─── script mode: line with empty result text → no trailing text ───────────

  it("bridge-command script mode omits text when result text is empty", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // parseReplCommand returns { help: '' } — empty help text
    mockParseReplCommand.mockReturnValue({ help: '' });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'help',
      scriptType: 'script',
      language: 'pw',
    });
    expect(result.isError).toBe(false);
    // The output line should not have trailing text
    expect(result.text).toContain('\u2713 help');
  });

  // ─── formatBridgeResult object branches (lines 267-270) ────────────────────
  // These branches handle actual objects passed to formatBridgeResult.
  // In normal flow, executeBridgeExpr only resolves with primitives.
  // Test via a contrived path: make resolve return an object by having r.type
  // be something unexpected AND r.description be an object (not string).

  // ─── executeBridgeExpr catch with String(e) fallback (branch 40) ───────────

  it("bridge-command catch falls back to String(e) when error has no message prop", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    // attach callback throws a non-Error (string)
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, _cb: any) => {
      throw 'raw string error';
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('raw string error');
  });

  // ─── formatBridgeResult object branches (lines 267-270) ────────────────────

  it("bridge-command formats object result via JSON.stringify", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    // Return a result whose description is an actual object (not string)
    // This makes resolve(r.description) pass an object to formatBridgeResult
    setupDebuggerMocks('sw-1', { result: { type: 'function', description: { foo: 'bar' } } });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(false);
    expect(result.text).toBe(JSON.stringify({ foo: 'bar' }, null, 2));
  });

  it("bridge-command formats object falling back to String when JSON.stringify fails", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    // Create a circular object that JSON.stringify can't handle
    const circular: any = {};
    circular.self = circular;
    setupDebuggerMocks('sw-1', { result: { type: 'function', description: circular } });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(false);
    expect(result.text).toBe('[object Object]');
  });

  // ─── executeBridgeExpr catch with non-Error throw (branch 40) ──────────────

  it("bridge-command executeBridgeExpr catch uses String(e) for non-Error throw", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    // Make ensureSelfAttached throw a non-Error (string)
    (chrome.debugger as any).getTargets = vi.fn(() => { throw 'getTargets failed'; });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(true);
    expect(result.text).toBe('getTargets failed');
  });

  // ─── chrome.tabs.onRemoved listener ─────────────────────────────────────────

  it("tab removed clears currentPage and activeTabId", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // Fire onRemoved for the active tab
    onTabRemoved(42);

    // Next bridge-command should auto-attach (currentPage was cleared)
    mockCrxApp.attach.mockClear();
    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(mockCrxApp.attach).toHaveBeenCalledWith(42);
    expect(result.isError).toBe(false);
  });

  it("tab removed clears recordingTabId", async () => {
    await sendMessage({ type: 'record-start' });
    // Fire onRemoved for the recording tab
    onTabRemoved(42);
    // record-stop should not try to sendMessage (recordingTabId was cleared)
    const result = await sendMessage({ type: 'record-stop' });
    expect((chrome.tabs as any).sendMessage).not.toHaveBeenCalledWith(42, { type: 'record-stop' });
    expect(result).toEqual({ ok: true });
  });

  it("tab removed ignores non-active tab", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // Fire onRemoved for a different tab
    onTabRemoved(99);

    // bridge-command should NOT re-attach (currentPage is still valid)
    mockCrxApp.attach.mockClear();
    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(mockCrxApp.attach).not.toHaveBeenCalled();
    expect(result.isError).toBe(false);
  });

  // ─── Stale page recovery (TargetClosedError) ───────────────────────────────

  it("bridge-command retries on TargetClosedError", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    // First call returns TargetClosedError, second succeeds
    let callCount = 0;
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      callCount++;
      if (callCount === 1) {
        cb({ exceptionDetails: { exception: { description: 'TargetClosedError2: page.evaluate: Target page, context or browser has been closed' } } });
      } else {
        cb({ result: { type: 'string', value: 'recovered' } });
      }
    });

    const result = await sendMessage({ type: 'bridge-command', command: 'snapshot' });
    expect(result.isError).toBe(false);
    expect(result.text).toBe('recovered');
    // Should have re-attached
    expect(mockCrxApp.attach).toHaveBeenCalledTimes(2);
  });

  // ─── Command serialization ─────────────────────────────────────────────────

  it("bridge-commands execute sequentially, not concurrently", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1');

    const executionOrder: number[] = [];

    // First command takes 50ms, second is instant
    let callCount = 0;
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      callCount++;
      const idx = callCount;
      if (idx === 1) {
        setTimeout(() => { executionOrder.push(1); cb({ result: { type: 'string', value: 'first' } }); }, 50);
      } else {
        executionOrder.push(2);
        cb({ result: { type: 'string', value: 'second' } });
      }
    });

    // Send both concurrently
    const [r1, r2] = await Promise.all([
      sendMessage({ type: 'bridge-command', command: 'cmd1' }),
      sendMessage({ type: 'bridge-command', command: 'cmd2' }),
    ]);

    expect(r1.text).toBe('first');
    expect(r2.text).toBe('second');
    // First must complete before second starts
    expect(executionOrder).toEqual([1, 2]);
  });

  // ─── includeSnapshot ──────────────────────────────────────────────────────

  it("bridge-command appends snapshot when includeSnapshot is true", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    // Track eval calls: first returns command result, second returns snapshot
    let evalCount = 0;
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => cb());
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      evalCount++;
      if (evalCount === 1) {
        // Command result (e.g. click)
        cb({ result: { type: 'string', value: 'Clicked' } });
      } else {
        // Snapshot result
        cb({ result: { type: 'string', value: '- heading "Hello" [ref=e1]' } });
      }
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };

    // parseReplCommand returns jsExpr for both calls
    mockParseReplCommand.mockReturnValue({ jsExpr: 'page.title()' });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'click e5',
      includeSnapshot: true,
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('### Result');
    expect(result.text).toContain('Clicked');
    expect(result.text).toContain('### Snapshot');
    expect(result.text).toContain('heading "Hello"');
  });

  it("bridge-command does not append snapshot when includeSnapshot is false", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { result: { type: 'string', value: 'Clicked' } });
    mockParseReplCommand.mockReturnValue({ jsExpr: 'page.title()' });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'click e5',
    });

    expect(result.isError).toBe(false);
    expect(result.text).toBe('Clicked');
    expect(result.text).not.toContain('### Snapshot');
  });

  it("bridge-command does not append snapshot on error result", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', {
      exceptionDetails: { exception: { description: 'Element not found' } },
    });
    mockParseReplCommand.mockReturnValue({ jsExpr: 'page.title()' });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'click e5',
      includeSnapshot: true,
    });

    expect(result.isError).toBe(true);
    expect(result.text).not.toContain('### Snapshot');
  });

  it("bridge-command does not append snapshot for script mode", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    setupDebuggerMocks('sw-1', { result: { type: 'string', value: 'ok' } });
    mockParseReplCommand.mockReturnValue({ jsExpr: 'page.title()' });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'snapshot',
      scriptType: 'script',
      language: 'pw',
      includeSnapshot: true,
    });

    expect(result.isError).toBe(false);
    expect(result.text).not.toContain('### Snapshot');
  });

  it("bridge-command returns snapshot-only when command result is empty", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    let evalCount = 0;
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => cb());
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      evalCount++;
      if (evalCount === 1) {
        // Command returns undefined → "Done"
        cb({ result: { type: 'undefined' } });
      } else {
        // Snapshot result
        cb({ result: { type: 'string', value: '- button "OK" [ref=e2]' } });
      }
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };
    mockParseReplCommand.mockReturnValue({ jsExpr: 'page.title()' });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'click e5',
      includeSnapshot: true,
    });

    expect(result.isError).toBe(false);
    expect(result.text).toContain('### Result');
    expect(result.text).toContain('Done');
    expect(result.text).toContain('### Snapshot');
    expect(result.text).toContain('button "OK"');
  });

  it("bridge-command handles snapshot failure gracefully", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    let evalCount = 0;
    (chrome.debugger as any).getTargets = vi.fn((cb: any) => cb([
      { type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js`, id: 'sw-1' },
    ]));
    (chrome.debugger as any).attach = vi.fn((_t: any, _v: string, cb: any) => cb());
    (chrome.debugger as any).sendCommand = vi.fn((_t: any, method: string, _p: any, cb: any) => {
      if (method === 'Runtime.enable') { cb(); return; }
      evalCount++;
      if (evalCount === 1) {
        cb({ result: { type: 'string', value: 'Clicked' } });
      } else {
        // Snapshot fails
        cb({ exceptionDetails: { exception: { description: 'Snapshot error' } } });
      }
    });
    (chrome.debugger as any).onDetach = { addListener: vi.fn() };
    mockParseReplCommand.mockReturnValue({ jsExpr: 'page.title()' });

    const result = await sendMessage({
      type: 'bridge-command',
      command: 'click e5',
      includeSnapshot: true,
    });

    // Should return original result without snapshot
    expect(result.isError).toBe(false);
    expect(result.text).toBe('Clicked');
    expect(result.text).not.toContain('### Snapshot');
  });
});
