// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WebSocket } from 'ws';
import { BridgeServer } from '../src/bridge-server.js';

/** Connect a ws client to the bridge server */
function connect(port: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Auto-reply to any command with a result */
function autoReply(ws: WebSocket, reply: (msg: any) => any) {
  ws.on('message', (data) => {
    const msg = JSON.parse(String(data));
    const result = reply(msg);
    if (result) ws.send(JSON.stringify({ id: msg.id, ...result }));
  });
}

describe('BridgeServer', () => {
  let bridge: BridgeServer;

  beforeEach(() => {
    bridge = new BridgeServer();
  });

  afterEach(async () => {
    await bridge.close();
  });

  // ─── Lifecycle ──────────────────────────────────────────────────────

  it('starts on a random port when port is 0', async () => {
    await bridge.start(0, { silent: true });
    expect(bridge.port).toBeGreaterThan(0);
  });

  it('reports connected=false before any client connects', async () => {
    await bridge.start(0, { silent: true });
    expect(bridge.connected).toBe(false);
  });

  it('reports connected=true after a client connects', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    // Small delay for connection handler to fire
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.connected).toBe(true);
    ws.close();
  });

  it('calls onConnect callback when client connects', async () => {
    const onConnect = vi.fn();
    bridge.onConnect(onConnect);
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));
    expect(onConnect).toHaveBeenCalledOnce();
    ws.close();
  });

  it('calls onDisconnect callback when client disconnects', async () => {
    const onDisconnect = vi.fn();
    bridge.onDisconnect(onDisconnect);
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));
    ws.close();
    await new Promise(r => setTimeout(r, 50));
    expect(onDisconnect).toHaveBeenCalledOnce();
  });

  // ─── run() ──────────────────────────────────────────────────────────

  it('sends a command and receives a response', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    autoReply(ws, (msg) => ({ text: `clicked ${msg.command}` }));
    await new Promise(r => setTimeout(r, 50));

    const result = await bridge.run('click e5');
    expect(result.text).toBe('clicked click e5');
    expect(result.isError).toBeUndefined();
    ws.close();
  });

  it('includes snapshot flag when requested', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    let receivedMsg;
    autoReply(ws, (msg) => { receivedMsg = msg; return { text: 'ok' }; });
    await new Promise(r => setTimeout(r, 50));

    await bridge.run('click e5', { includeSnapshot: true });
    expect(receivedMsg.includeSnapshot).toBe(true);
    expect(receivedMsg.type).toBe('command');
    ws.close();
  });

  it('times out if no response received', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    // Don't reply — let it time out
    await new Promise(r => setTimeout(r, 50));

    const result = await bridge.run('click e5', { timeout: 100 });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('timed out');
    ws.close();
  });

  it('auto-waits for connection when not connected', async () => {
    await bridge.start(0, { silent: true });
    const port = bridge.port;

    // Start run() before client connects — it will auto-wait internally
    const runPromise = bridge.run('snapshot', { timeout: 10000 });

    // Give run() a moment to enter waitForConnection
    await new Promise(r => setTimeout(r, 100));

    // Connect and set up autoReply — use 'message' event on the ws
    // before run() has a chance to send (autoReply must be ready first)
    const ws = new WebSocket(`ws://127.0.0.1:${port}`);
    autoReply(ws, () => ({ text: 'snapshot ok' }));
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });

    const result = await runPromise;
    expect(result.text).toBe('snapshot ok');
    ws.close();
  }, 15000);

  it('returns error when no client connects within auto-wait timeout', async () => {
    await bridge.start(0, { silent: true });
    // waitForConnection default in run() is 10s — override by testing directly
    // We'll test the "Extension not connected" path
    const original = bridge.waitForConnection.bind(bridge);
    bridge.waitForConnection = () => Promise.reject(new Error('timeout'));

    const result = await bridge.run('click e5');
    expect(result.text).toBe('Extension not connected');
    expect(result.isError).toBe(true);
    bridge.waitForConnection = original;
  });

  // ─── runScript() ────────────────────────────────────────────────────

  it('sends a script with language', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    let receivedMsg;
    autoReply(ws, (msg) => { receivedMsg = msg; return { text: 'script result' }; });
    await new Promise(r => setTimeout(r, 50));

    const result = await bridge.runScript('page.click("#btn")', 'javascript');
    expect(result.text).toBe('script result');
    expect(receivedMsg.type).toBe('script');
    expect(receivedMsg.language).toBe('javascript');
    expect(receivedMsg.command).toBe('page.click("#btn")');
    ws.close();
  });

  it('defaults to pw language', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    let receivedMsg;
    autoReply(ws, (msg) => { receivedMsg = msg; return { text: 'ok' }; });
    await new Promise(r => setTimeout(r, 50));

    await bridge.runScript('click e5');
    expect(receivedMsg.language).toBe('pw');
    ws.close();
  });

  it('times out scripts', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));

    const result = await bridge.runScript('long script', 'pw', { timeout: 100 });
    expect(result.isError).toBe(true);
    expect(result.text).toContain('timed out');
    ws.close();
  });

  // ─── waitForConnection() ────────────────────────────────────────────

  it('resolves immediately if already connected', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));

    await bridge.waitForConnection(100); // Should not timeout
    ws.close();
  });

  it('rejects on timeout when no client connects', async () => {
    await bridge.start(0, { silent: true });
    await expect(bridge.waitForConnection(100)).rejects.toThrow('Timed out');
  });

  it('resolves when client connects within timeout', async () => {
    await bridge.start(0, { silent: true });
    const waitPromise = bridge.waitForConnection(2000);
    // Connect after delay
    await new Promise(r => setTimeout(r, 50));
    const ws = await connect(bridge.port);
    await waitPromise; // Should resolve
    ws.close();
  });

  // ─── reconnect() ───────────────────────────────────────────────────

  it('drops connection and waits for new one', async () => {
    await bridge.start(0, { silent: true });
    const ws1 = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.connected).toBe(true);

    // Start reconnect — it closes ws1 and waits for new connection
    const reconnectPromise = bridge.reconnect(2000);
    await new Promise(r => setTimeout(r, 100));

    // Connect a second client
    const ws2 = await connect(bridge.port);
    await reconnectPromise;
    expect(bridge.connected).toBe(true);
    ws1.close();
    ws2.close();
  });

  // ─── Event handling ─────────────────────────────────────────────────

  it('forwards _event messages to onEvent callback', async () => {
    const onEvent = vi.fn();
    bridge.onEvent(onEvent);
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));

    ws.send(JSON.stringify({ _event: 'recording', data: 'click #btn' }));
    await new Promise(r => setTimeout(r, 50));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ _event: 'recording', data: 'click #btn' }),
    );
    ws.close();
  });

  // ─── Disconnect handling ────────────────────────────────────────────

  it('rejects pending commands when client disconnects', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    // Don't reply to commands — then disconnect
    await new Promise(r => setTimeout(r, 50));

    const runPromise = bridge.run('click e5', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 50));
    ws.close();

    const result = await runPromise;
    expect(result.text).toBe('WebSocket disconnected');
    expect(result.isError).toBe(true);
  });

  // ─── Origin verification ───────────────────────────────────────────

  it('accepts connections with no origin', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.connected).toBe(true);
    ws.close();
  });

  it('rejects connections from http origins', async () => {
    await bridge.start(0, { silent: true });
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, {
      headers: { origin: 'http://evil.com' },
    });
    // The server responds with 401 — ws client emits 'error' then 'close'
    await new Promise<void>((resolve) => {
      ws.on('error', () => {}); // Suppress uncaught error
      ws.on('close', () => resolve());
    });
    expect(bridge.connected).toBe(false);
  });

  it('accepts connections from chrome-extension origins', async () => {
    await bridge.start(0, { silent: true });
    const ws = new WebSocket(`ws://127.0.0.1:${bridge.port}`, {
      headers: { origin: 'chrome-extension://abcdef123456' },
    });
    await new Promise((resolve, reject) => {
      ws.on('open', resolve);
      ws.on('error', reject);
    });
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.connected).toBe(true);
    ws.close();
  });

  // ─── Malformed messages ─────────────────────────────────────────────

  it('handles malformed JSON messages without crashing', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));

    // Send invalid JSON — should log error but not crash
    ws.send('not valid json{{{');
    await new Promise(r => setTimeout(r, 50));
    expect(bridge.connected).toBe(true);
    ws.close();
  });

  // ─── close() ────────────────────────────────────────────────────────

  it('cleans up server and socket on close', async () => {
    await bridge.start(0, { silent: true });
    const ws = await connect(bridge.port);
    await new Promise(r => setTimeout(r, 50));
    await bridge.close();

    // Server should be closed — new connections should fail
    await expect(
      new Promise((resolve, reject) => {
        const ws2 = new WebSocket(`ws://127.0.0.1:${bridge.port}`);
        ws2.on('open', resolve);
        ws2.on('error', reject);
      })
    ).rejects.toThrow();
    ws.close();
  });
});
