import { describe, it, expect } from 'vitest';
import { McpBridge, listTools } from '../src/mcp-bridge.mjs';

class FakeConnection {
  static instances = [];

  constructor() {
    this.connected = false;
    this.closed = false;
    this.calls = [];
    this.nextResult = { text: '### Result\nok' };
    this.runImpl = null;
    FakeConnection.instances.push(this);
  }

  async connect() {
    this.connected = true;
    return true;
  }

  async run(args) {
    this.calls.push(args);
    if (this.runImpl)
      return this.runImpl(args);
    return this.nextResult;
  }

  close() {
    this.closed = true;
    this.connected = false;
  }
}

function createBridge(overrides = {}) {
  FakeConnection.instances = [];

  const deps = {
    DaemonConnection: FakeConnection,
    version: '0.1.1',
    socketPath: () => '/tmp/fake.sock',
    isDaemonRunning: async () => true,
    startDaemon: async () => {},
    verifyToRunCode: (cmd, args) => ({ _: ['run-code', `${cmd}:${args.join('|')}`] }),
    textToRunCode: (cmd, text, extra) => ({ _: ['run-code', `${cmd}:${text}:${extra.join('|')}`] }),
    filterResponse: (text) => text,
    ...(overrides.deps || {}),
  };

  const config = {
    session: 'default',
    autoStartDaemon: true,
    toolTimeoutMs: 30,
    ...(overrides.config || {}),
  };

  return new McpBridge(config, deps);
}

describe('listTools', () => {
  it('returns all tools by default', () => {
    const tools = listTools();
    expect(tools.some((tool) => tool.name === 'open')).toBe(true);
    expect(tools.some((tool) => tool.name === 'verify-list')).toBe(true);
  });

  it('filters tools by allowlist', () => {
    const tools = listTools({ allowedTools: ['open', 'goto'] });
    expect(tools.map((tool) => tool.name)).toEqual(['open', 'goto']);
  });
});

describe('McpBridge', () => {
  it('runs a simple tool call through daemon connection', async () => {
    const bridge = createBridge();
    const result = await bridge.callTool('goto', { url: 'https://example.com' });

    expect(result.isError).toBe(false);
    const conn = FakeConnection.instances[0];
    expect(conn.calls[0]).toEqual({ _: ['goto', 'https://example.com'] });
  });

  it('translates verify-* tools using run-code transform', async () => {
    const bridge = createBridge();
    const result = await bridge.callTool('verify-text', { text: 'hello' });

    expect(result.isError).toBe(false);
    const conn = FakeConnection.instances[0];
    expect(conn.calls[0]).toEqual({ _: ['run-code', 'verify-text:hello'] });
  });

  it('translates non-ref click target to run-code', async () => {
    const bridge = createBridge();
    await bridge.callTool('click', { target: 'Submit' });

    const conn = FakeConnection.instances[0];
    expect(conn.calls[0]).toEqual({ _: ['run-code', 'click:Submit:'] });
  });

  it('passes ref click target directly', async () => {
    const bridge = createBridge();
    await bridge.callTool('click', { target: 'e5' });

    const conn = FakeConnection.instances[0];
    expect(conn.calls[0]).toEqual({ _: ['click', 'e5'] });
  });

  it('returns INVALID_ARGUMENT for unknown tool', async () => {
    const bridge = createBridge();
    const result = await bridge.callTool('does-not-exist', {});

    expect(result.isError).toBe(true);
    expect(result.structuredContent.errorCode).toBe('INVALID_ARGUMENT');
  });

  it('returns POLICY_DENIED for disallowed tool', async () => {
    const bridge = createBridge({ config: { allowedTools: ['open'] } });
    const result = await bridge.callTool('goto', { url: 'https://example.com' });

    expect(result.isError).toBe(true);
    expect(result.structuredContent.errorCode).toBe('POLICY_DENIED');
  });

  it('returns DAEMON_UNAVAILABLE when daemon is down and auto start is disabled', async () => {
    const bridge = createBridge({
      config: { autoStartDaemon: false },
      deps: { isDaemonRunning: async () => false },
    });

    const result = await bridge.callTool('snapshot', {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent.errorCode).toBe('DAEMON_UNAVAILABLE');
  });

  it('returns DAEMON_TIMEOUT when tool execution exceeds timeout', async () => {
    const bridge = createBridge({ config: { toolTimeoutMs: 5 } });
    const conn = new FakeConnection();
    conn.connected = true;
    conn.runImpl = () => new Promise(() => {});
    bridge.conn = conn;

    const result = await bridge.callTool('snapshot', {});
    expect(result.isError).toBe(true);
    expect(result.structuredContent.errorCode).toBe('DAEMON_TIMEOUT');
  });

  it('closes connection', async () => {
    const bridge = createBridge();
    await bridge.callTool('snapshot', {});

    const conn = FakeConnection.instances[0];
    await bridge.close();
    expect(conn.closed).toBe(true);
  });
});
