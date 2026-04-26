import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Mock WebSocket ──────────────────────────────────────────────────────────

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e?: { code?: number; reason?: string }) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockWebSocket.OPEN;
  sent: string[] = [];
  url: string;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string) { this.sent.push(data); }
  close() { this.readyState = MockWebSocket.CLOSED; this.onclose?.({ code: 1000, reason: '' }); }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('offscreen bridge', () => {
  let onMessageListener: (msg: Record<string, unknown>) => void;
  let OriginalWebSocket: typeof WebSocket;
  let sendMessage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    OriginalWebSocket = globalThis.WebSocket;

    sendMessage = vi.fn().mockResolvedValue(9876);

    // Mock chrome.runtime
    const g = globalThis as unknown as Record<string, unknown>;
    g.chrome = {
      runtime: {
        sendMessage,
        onMessage: {
          addListener: vi.fn((fn: (msg: Record<string, unknown>) => void) => { onMessageListener = fn; }),
        },
      },
    };

    // Replace WebSocket
    g.WebSocket = MockWebSocket;

    // Import module (triggers side effects: get-bridge-port → connect)
    vi.resetModules();
    await import('../src/offscreen/offscreen');

    // Let the sendMessage promise resolve
    await vi.advanceTimersByTimeAsync(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.WebSocket = OriginalWebSocket;
  });

  it('requests bridge port and connects WebSocket on init', () => {
    expect(sendMessage).toHaveBeenCalledWith({ type: 'get-bridge-port' });
    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://127.0.0.1:9876');
  });

  it('uses default port 9876 when get-bridge-port returns falsy', async () => {
    MockWebSocket.instances = [];
    sendMessage.mockResolvedValue(0);

    vi.resetModules();
    await import('../src/offscreen/offscreen');
    await vi.advanceTimersByTimeAsync(0);

    expect(MockWebSocket.instances[0].url).toBe('ws://127.0.0.1:9876');
  });

  it('relays command to service worker and sends result back', async () => {
    const ws = MockWebSocket.instances[0];
    sendMessage.mockResolvedValueOnce({ text: 'Clicked', isError: false });

    ws.onmessage!({
      data: JSON.stringify({ id: '1', command: 'click e5', type: 'command', language: 'pw' }),
    });

    // Let the async handler resolve
    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'bridge-command',
      command: 'click e5',
      scriptType: 'command',
      language: 'pw',
    });

    expect(ws.sent).toHaveLength(1);
    const response = JSON.parse(ws.sent[0]);
    expect(response.id).toBe('1');
    expect(response.text).toBe('Clicked');
    expect(response.isError).toBe(false);
  });

  it('sends error response when sendMessage rejects', async () => {
    const ws = MockWebSocket.instances[0];
    sendMessage.mockRejectedValueOnce(new Error('SW crashed'));

    ws.onmessage!({
      data: JSON.stringify({ id: '2', command: 'bad' }),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(ws.sent).toHaveLength(1);
    const response = JSON.parse(ws.sent[0]);
    expect(response.id).toBe('2');
    expect(response.text).toContain('SW crashed');
    expect(response.isError).toBe(true);
  });

  it('does not send result if WebSocket is closed', async () => {
    const ws = MockWebSocket.instances[0];
    sendMessage.mockResolvedValueOnce({ text: 'Done', isError: false });

    ws.readyState = MockWebSocket.CLOSED;
    ws.onmessage!({
      data: JSON.stringify({ id: '3', command: 'click e1' }),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(ws.sent).toHaveLength(0);
  });

  it('does not send error if WebSocket is closed', async () => {
    const ws = MockWebSocket.instances[0];
    sendMessage.mockRejectedValueOnce(new Error('fail'));

    ws.readyState = MockWebSocket.CLOSED;
    ws.onmessage!({
      data: JSON.stringify({ id: '4', command: 'bad' }),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(ws.sent).toHaveLength(0);
  });

  it('reconnects after WebSocket closes', async () => {
    const ws = MockWebSocket.instances[0];
    ws.onclose!({ code: 1000, reason: '' });

    expect(MockWebSocket.instances).toHaveLength(1); // no new WS yet

    await vi.advanceTimersByTimeAsync(3000);

    expect(MockWebSocket.instances).toHaveLength(2);
    expect(MockWebSocket.instances[1].url).toBe('ws://127.0.0.1:9876');
  });

  it('reconnects after WebSocket constructor throws', async () => {
    MockWebSocket.instances = [];
    sendMessage.mockResolvedValue(9999);

    let callCount = 0;
    (globalThis as unknown as Record<string, unknown>).WebSocket = class ThrowingWS {
      constructor() {
        callCount++;
        if (callCount === 1) throw new Error('connection refused');
        // Second call succeeds — use MockWebSocket
        const inst = new MockWebSocket('ws://127.0.0.1:9999');
        return inst as unknown as ThrowingWS;
      }
    };

    vi.resetModules();
    await import('../src/offscreen/offscreen');
    await vi.advanceTimersByTimeAsync(0);

    // First connect() threw — should schedule reconnect
    await vi.advanceTimersByTimeAsync(3000);

    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('handles bridge-port-changed by reconnecting to new port', async () => {
    const ws = MockWebSocket.instances[0];

    onMessageListener({ type: 'bridge-port-changed', port: 1234 });

    // Old WS should be closed
    expect(ws.readyState).toBe(MockWebSocket.CLOSED);

    // Wait for reconnect timer from onclose callback
    await vi.advanceTimersByTimeAsync(0);

    // New WS on new port
    const newWs = MockWebSocket.instances[MockWebSocket.instances.length - 1];
    expect(newWs.url).toBe('ws://127.0.0.1:1234');
  });

  it('clears pending reconnect timer on port change', async () => {
    const ws = MockWebSocket.instances[0];

    // Trigger onclose to start a reconnect timer (to port 9876)
    ws.onclose!({ code: 1000, reason: '' });

    // Before the 3s timer fires, change port
    const countBefore = MockWebSocket.instances.length;
    onMessageListener({ type: 'bridge-port-changed', port: 5555 });

    // Advance past original 3s timer — should NOT reconnect to old port
    await vi.advanceTimersByTimeAsync(3000);

    // All new connections should be to the new port only
    const newConnections = MockWebSocket.instances.slice(countBefore);
    expect(newConnections.length).toBeGreaterThanOrEqual(1);
    expect(newConnections.every(ws => ws.url === 'ws://127.0.0.1:5555')).toBe(true);
  });

  it('handles bridge-port-changed when ws is null (constructor threw)', async () => {
    MockWebSocket.instances = [];
    sendMessage.mockResolvedValue(0);

    let callCount = 0;
    (globalThis as unknown as Record<string, unknown>).WebSocket = class ThrowingWS {
      constructor() {
        callCount++;
        if (callCount === 1) throw new Error('connection refused');
        const inst = new MockWebSocket('ws://127.0.0.1:7777');
        return inst as unknown as ThrowingWS;
      }
    };

    vi.resetModules();
    await import('../src/offscreen/offscreen');
    await vi.advanceTimersByTimeAsync(0);

    // ws is null because constructor threw. Send port change — should not throw
    onMessageListener({ type: 'bridge-port-changed', port: 7777 });

    expect(MockWebSocket.instances).toHaveLength(1);
    expect(MockWebSocket.instances[0].url).toBe('ws://127.0.0.1:7777');
  });

  it('onerror handler is a no-op', () => {
    const ws = MockWebSocket.instances[0];
    // Should not throw
    ws.onerror!();
  });

  it('ignores non-bridge-port-changed messages', () => {
    const wsBefore = MockWebSocket.instances.length;
    onMessageListener({ type: 'something-else' });
    expect(MockWebSocket.instances).toHaveLength(wsBefore);
  });

  it('forwards includeSnapshot flag to service worker', async () => {
    const ws = MockWebSocket.instances[0];
    sendMessage.mockResolvedValueOnce({ text: 'Clicked\n### Snapshot\n- button', isError: false });

    ws.onmessage!({
      data: JSON.stringify({ id: '5', command: 'click e5', type: 'command', includeSnapshot: true }),
    });

    await vi.advanceTimersByTimeAsync(0);

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'bridge-command',
      command: 'click e5',
      scriptType: 'command',
      language: undefined,
      includeSnapshot: true,
    });
  });

  it('omits includeSnapshot when not set in WebSocket message', async () => {
    const ws = MockWebSocket.instances[0];
    sendMessage.mockResolvedValueOnce({ text: 'Clicked', isError: false });

    ws.onmessage!({
      data: JSON.stringify({ id: '6', command: 'click e5', type: 'command' }),
    });

    await vi.advanceTimersByTimeAsync(0);

    const call = sendMessage.mock.calls.find(
      (c: unknown[]) => (c[0] as Record<string, unknown>)?.type === 'bridge-command' && (c[0] as Record<string, unknown>)?.command === 'click e5'
    );
    expect(call).toBeDefined();
    expect(call![0]).not.toHaveProperty('includeSnapshot');
  });
});
