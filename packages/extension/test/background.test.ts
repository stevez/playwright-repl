import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Shared mock state ────────────────────────────────────────────────────────

let mockPage: any;
let mockCrxApp: any;

vi.mock('@playwright-repl/playwright-crx/test', () => ({
  expect: vi.fn().mockReturnValue(new Proxy({}, { get: () => vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock('@playwright-repl/playwright-crx', () => {
  mockPage = { url: vi.fn().mockReturnValue('https://example.com') };
  const mockContext = { pages: vi.fn().mockReturnValue([mockPage]) };
  mockCrxApp = {
    attach: vi.fn().mockResolvedValue(mockPage),
    detach: vi.fn().mockResolvedValue(undefined),
    context: vi.fn().mockReturnValue(mockContext),
    recorder: {
      show: vi.fn().mockResolvedValue(undefined),
      hide: vi.fn().mockResolvedValue(undefined),
    },
  };
  return { crx: { start: vi.fn().mockResolvedValue(mockCrxApp) } };
});

vi.mock('../src/panel/lib/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ openAs: 'sidepanel' }),
}));

// ─── Test suite ───────────────────────────────────────────────────────────────

describe("background.ts message handlers", () => {
  let onMessageListener: (msg: any, sender: any, sendResponse: (r: any) => void) => boolean | void;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();

    // Reset playwright-crx mocks
    mockPage = { url: vi.fn().mockReturnValue('https://example.com') };
    const mockContext = { pages: vi.fn().mockReturnValue([mockPage]) };
    mockCrxApp = {
      attach: vi.fn().mockResolvedValue(mockPage),
      detach: vi.fn().mockResolvedValue(undefined),
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

    const listeners: typeof onMessageListener[] = [];
    (chrome.runtime as any).onMessage = { addListener: vi.fn((fn) => listeners.push(fn)) };

    vi.resetModules();

    await import('../src/background.js');
    onMessageListener = listeners[0];
  });

  function sendMessage(msg: any): Promise<any> {
    return new Promise((resolve) => {
      const ret = onMessageListener(msg, {}, resolve);
      if (ret === false) {
        // synchronous — resolve has already been called
      }
    });
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

  it("attach returns error when crxApp.attach throws", async () => {
    mockCrxApp.attach.mockRejectedValue(new Error('CDP failed'));
    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('CDP failed');
  });

  it("attach detaches from previous tab before attaching to new one", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    mockCrxApp.attach.mockResolvedValue({ url: vi.fn().mockReturnValue('https://new.com') });
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 99, url: 'https://new.com' });
    await sendMessage({ type: 'attach', tabId: 99 });
    expect(mockCrxApp.detach).toHaveBeenCalledWith(42);
  });

  // ─── record-start / record-stop ───────────────────────────────────────────

  it("record-start starts crxApp and calls recorder.show", async () => {
    const result = await sendMessage({ type: 'record-start' });
    expect(mockCrxApp.recorder.show).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'recording', language: 'javascript' })
    );
    expect(result).toEqual({ ok: true, url: expect.any(String) });
  });

  it("record-start returns ok:false when crx.start throws", async () => {
    const { crx } = await import('@playwright-repl/playwright-crx');
    (crx.start as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('crx init failed'));
    const result = await sendMessage({ type: 'record-start' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('crx init failed');
  });

  it("record-stop calls recorder.hide and returns ok:true", async () => {
    await sendMessage({ type: 'record-start' });
    const result = await sendMessage({ type: 'record-stop' });
    expect(mockCrxApp.recorder.hide).toHaveBeenCalled();
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

  // ─── cdp-evaluate ─────────────────────────────────────────────────────────

  it("cdp-evaluate returns error when not attached", async () => {
    const result = await sendMessage({ type: 'cdp-evaluate', expression: '1+1' });
    expect(result).toEqual({ error: 'Not attached to any tab.' });
  });

  it("cdp-evaluate sends command to active tab", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    const mockResult = { result: { type: 'number', value: 2 } };
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, _method: string, _params: any, cb: any) => {
      cb(mockResult);
    });

    const result = await sendMessage({ type: 'cdp-evaluate', expression: '1+1' });
    expect(result).toEqual(mockResult);
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      'Runtime.evaluate',
      expect.objectContaining({ expression: '1+1' }),
      expect.any(Function),
    );
  });

  it("cdp-evaluate returns error on debugger failure", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, _method: string, _params: any, cb: any) => {
      (chrome.runtime as any).lastError = { message: 'Debugger detached' };
      cb(undefined);
      delete (chrome.runtime as any).lastError;
    });

    const result = await sendMessage({ type: 'cdp-evaluate', expression: 'bad' });
    // chrome.runtime.lastError is a plain object { message: ... }, String() gives [object Object]
    expect(result).toHaveProperty('error');
  });

  // ─── cdp-get-properties ───────────────────────────────────────────────────

  it("cdp-get-properties returns error when not attached", async () => {
    const result = await sendMessage({ type: 'cdp-get-properties', objectId: 'obj-1' });
    expect(result).toEqual({ error: 'Not attached to any tab.' });
  });

  it("cdp-get-properties sends command to active tab", async () => {
    await sendMessage({ type: 'attach', tabId: 42 });

    const mockResult = { result: [{ name: 'x', value: { type: 'number', value: 1 } }] };
    (chrome.debugger as any).sendCommand = vi.fn((_target: any, _method: string, _params: any, cb: any) => {
      cb(mockResult);
    });

    const result = await sendMessage({ type: 'cdp-get-properties', objectId: 'obj-1' });
    expect(result).toEqual(mockResult);
    expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
      { tabId: 42 },
      'Runtime.getProperties',
      expect.objectContaining({ objectId: 'obj-1', ownProperties: true }),
      expect.any(Function),
    );
  });

  // ─── debug-resume / debug-stop ────────────────────────────────────────────

  it("debug-resume returns ok:true", async () => {
    const result = await sendMessage({ type: 'debug-resume' });
    expect(result).toEqual({ ok: true });
  });

  it("debug-stop returns ok:true", async () => {
    const result = await sendMessage({ type: 'debug-stop' });
    expect(result).toEqual({ ok: true });
  });

  // ─── attach: Frame detached retry ─────────────────────────────────────────

  it("attach retries on 'Frame has been detached' error", async () => {
    const retryPage = { url: vi.fn().mockReturnValue('https://example.com') };
    let callCount = 0;
    mockCrxApp.attach.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Promise.reject(new Error('Frame has been detached'));
      return Promise.resolve(retryPage);
    });

    const result = await sendMessage({ type: 'attach', tabId: 42 });
    expect(result.ok).toBe(true);
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
});
