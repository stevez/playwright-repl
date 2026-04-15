// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock BridgeServer
const mockBridge = {
  start: vi.fn().mockResolvedValue(undefined),
  onConnect: vi.fn(),
  onDisconnect: vi.fn(),
  run: vi.fn().mockResolvedValue({ text: 'Clicked', isError: false }),
  runScript: vi.fn().mockResolvedValue({ text: 'Script result', isError: false }),
};

vi.mock('@playwright-repl/core', () => ({
  BridgeServer: vi.fn(function() { return mockBridge; }),
  UPDATE_COMMANDS: new Set(['click', 'fill', 'goto', 'press', 'hover', 'select', 'check', 'uncheck']),
  parseInput: vi.fn((cmd) => {
    if (!cmd || !cmd.trim()) return null;
    const parts = cmd.trim().split(/\s+/);
    return { _: parts };
  }),
}));

vi.mock('../src/logger.js', () => ({
  logEvent: vi.fn(),
}));

import { createBridgeRunner } from '../src/bridge.js';

describe('createBridgeRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBridge.start.mockResolvedValue(undefined);
    mockBridge.run.mockResolvedValue({ text: 'Clicked', isError: false });
    mockBridge.runScript.mockResolvedValue({ text: 'Script result', isError: false });
  });

  it('starts bridge on default port', async () => {
    const { runner, descriptions } = await createBridgeRunner([]);
    expect(mockBridge.start).toHaveBeenCalledWith(9876);
    expect(descriptions.scriptOnly).toBe(false);
  });

  it('uses --port argument', async () => {
    await createBridgeRunner(['--port', '1234']);
    expect(mockBridge.start).toHaveBeenCalledWith(1234);
  });

  it('uses BRIDGE_PORT env variable', async () => {
    const original = process.env.BRIDGE_PORT;
    process.env.BRIDGE_PORT = '5555';
    await createBridgeRunner([]);
    expect(mockBridge.start).toHaveBeenCalledWith(5555);
    process.env.BRIDGE_PORT = original;
  });

  it('registers onConnect and onDisconnect callbacks', async () => {
    await createBridgeRunner([]);
    expect(mockBridge.onConnect).toHaveBeenCalled();
    expect(mockBridge.onDisconnect).toHaveBeenCalled();
  });

  // ─── runCommand ─────────────────────────────────────────────────────

  it('runs a command via bridge', async () => {
    const { runner } = await createBridgeRunner([]);
    const result = await runner.runCommand('snapshot');
    expect(result.text).toBe('Clicked');
    expect(mockBridge.run).toHaveBeenCalledWith('snapshot', undefined);
  });

  it('includes snapshot for update commands', async () => {
    const { runner } = await createBridgeRunner([]);
    await runner.runCommand('click e5');
    expect(mockBridge.run).toHaveBeenCalledWith(
      'click e5',
      { includeSnapshot: true },
    );
  });

  it('does not include snapshot for non-update commands', async () => {
    const { runner } = await createBridgeRunner([]);
    await runner.runCommand('snapshot');
    expect(mockBridge.run).toHaveBeenCalledWith('snapshot', undefined);
  });

  it('returns error results as-is', async () => {
    mockBridge.run.mockResolvedValue({ text: 'Not found', isError: true });
    const { runner } = await createBridgeRunner([]);
    const result = await runner.runCommand('click missing');
    expect(result.isError).toBe(true);
    expect(result.text).toBe('Not found');
  });

  // ─── runScript ──────────────────────────────────────────────────────

  it('delegates runScript to bridge', async () => {
    const { runner } = await createBridgeRunner([]);
    const result = await runner.runScript('goto https://example.com', 'pw');
    expect(result.text).toBe('Script result');
    expect(mockBridge.runScript).toHaveBeenCalledWith('goto https://example.com', 'pw');
  });

  it('supports javascript language', async () => {
    const { runner } = await createBridgeRunner([]);
    await runner.runScript('await page.click("#btn")', 'javascript');
    expect(mockBridge.runScript).toHaveBeenCalledWith('await page.click("#btn")', 'javascript');
  });
});
