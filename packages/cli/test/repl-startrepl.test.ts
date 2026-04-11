// @ts-nocheck
/**
 * Tests for startRepl() — the main orchestrator.
 * Mocks Engine (from core) and readline.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockStart = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockRun = vi.fn().mockResolvedValue({ text: '### Result\nOK' });

vi.mock('../src/engine.js', () => ({
  Engine: vi.fn(function () {
    this.start = mockStart;
    this.close = mockClose;
    this.run = mockRun;
    this.connected = true;
  }),
}));

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

import { Engine } from '../src/engine.js';
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
    // Reset Engine mock to default
    mockStart.mockReset().mockResolvedValue(undefined);
    mockClose.mockReset();
    mockRun.mockReset().mockResolvedValue({ text: '### Result\nOK' });
    // Reset BridgeServer mock to default
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

  it('creates Engine and calls start', async () => {
    await startRepl({ silent: true });
    expect(Engine).toHaveBeenCalled();
    expect(mockStart).toHaveBeenCalled();
  });

  it('passes opts to engine.start', async () => {
    await startRepl({ silent: true, headed: true, browser: 'firefox' });
    expect(mockStart).toHaveBeenCalledWith(
      expect.objectContaining({ headed: true, browser: 'firefox' }),
    );
  });

  it('exits with 1 when engine start fails', async () => {
    mockStart.mockRejectedValue(new Error('Browser launch failed'));
    await startRepl({ silent: true });
    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints banner when not silent', async () => {
    await startRepl({});
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Playwright REPL');
  });

  it('suppresses banner in silent mode', async () => {
    await startRepl({ silent: true });
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).not.toContain('Playwright REPL');
  });

  it('shows ready message on successful start', async () => {
    await startRepl({});
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Browser ready');
  });

  it('auto-starts recording when --record is passed', async () => {
    await startRepl({ silent: true, record: '/tmp/my-session.pw' });
    // The session should have started recording (no error thrown)
    expect(errorSpy).not.toHaveBeenCalled();
  });

  // ─── --command flag (engine fallback) ──────────────────────────

  it('--command runs command via engine, writes output, and exits 0', async () => {
    mockRun.mockResolvedValue({ text: 'Page snapshot', isError: false });
    await startRepl({ silent: true, command: 'snapshot' });
    expect(mockStart).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ _: ['snapshot'] }));
    expect(stdoutSpy).toHaveBeenCalledWith('Page snapshot\n');
    expect(mockClose).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('--command exits 1 when engine returns isError', async () => {
    mockRun.mockResolvedValue({ text: 'Error: element not found', isError: true });
    await startRepl({ silent: true, command: 'click e99' });
    expect(stdoutSpy).toHaveBeenCalledWith('Error: element not found\n');
    expect(mockClose).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('--command writes empty line when result text is null', async () => {
    mockRun.mockResolvedValue({ text: null, isError: false });
    await startRepl({ silent: true, command: 'snapshot' });
    expect(stdoutSpy).toHaveBeenCalledWith('\n');
    expect(exitSpy).toHaveBeenCalledWith(0);
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
    // Should run and exit, not fall through to startBridgeLoop
    expect(mockBridgeRun).toHaveBeenCalledWith('snapshot');
    expect(exitSpy).toHaveBeenCalled();
  });
});
