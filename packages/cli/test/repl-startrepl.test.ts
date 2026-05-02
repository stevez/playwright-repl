// @ts-nocheck
/**
 * Tests for startRepl() — bridge mode orchestration.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockBridgeStart = vi.fn().mockResolvedValue(undefined);
const mockBridgeClose = vi.fn();
const mockBridgeRun = vi.fn().mockResolvedValue({ text: 'Snapshot result', isError: false });
const mockBridgeWaitForConnection = vi.fn().mockResolvedValue(undefined);

vi.mock('@playwright-repl/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@playwright-repl/core')>();
  return {
    ...actual,
    BridgeServer: vi.fn(function () {
      this.start = mockBridgeStart;
      this.close = mockBridgeClose;
      this.run = mockBridgeRun;
      this.waitForConnection = mockBridgeWaitForConnection;
    }),
  };
});

vi.mock('node:readline', () => ({
  default: {
    createInterface: vi.fn(() => {
      const rl = new EventEmitter();
      rl.prompt = vi.fn();
      rl.setPrompt = vi.fn();
      rl.close = vi.fn();
      rl.history = [];
      return rl;
    }),
  },
}));

import { startRepl } from '../src/repl.js';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('startRepl', () => {
  let logSpy, errorSpy, exitSpy, stdoutSpy, stderrSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    mockBridgeStart.mockReset().mockResolvedValue(undefined);
    mockBridgeClose.mockReset();
    mockBridgeRun.mockReset().mockResolvedValue({ text: 'Snapshot result', isError: false });
    mockBridgeWaitForConnection.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    vi.restoreAllMocks();
  });

  // ─── --command flag (bridge mode) ──────────────────────────────

  it('--command --bridge runs command via BridgeServer and exits 0', async () => {
    mockBridgeRun.mockResolvedValue({ text: 'Bridge snapshot', isError: false });
    await startRepl({ silent: true, command: 'snapshot', bridge: true });
    expect(mockBridgeStart).toHaveBeenCalled();
    expect(mockBridgeWaitForConnection).toHaveBeenCalledWith(30000);
    expect(mockBridgeRun).toHaveBeenCalledWith('snapshot');
    expect(stdoutSpy).toHaveBeenCalledWith('Bridge snapshot\n');
    expect(mockBridgeClose).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('--command --bridge exits 1 on error result', async () => {
    mockBridgeRun.mockResolvedValue({ text: 'Command failed', isError: true });
    await startRepl({ silent: true, command: 'click e99', bridge: true });
    expect(stdoutSpy).toHaveBeenCalledWith('Command failed\n');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('--command --bridge uses custom bridge port', async () => {
    await startRepl({ silent: true, command: 'snapshot', bridge: true, bridgePort: 9877 });
    expect(mockBridgeStart).toHaveBeenCalledWith(9877, { silent: true });
  });

  it('--command --bridge does not start interactive loop', async () => {
    await startRepl({ silent: true, command: 'snapshot', bridge: true });
    expect(mockBridgeRun).toHaveBeenCalledWith('snapshot');
    expect(exitSpy).toHaveBeenCalled();
  });
});
