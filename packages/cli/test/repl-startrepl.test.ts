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
  let logSpy, errorSpy, exitSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    // Reset Engine mock to default
    mockStart.mockReset().mockResolvedValue(undefined);
    mockClose.mockReset();
    mockRun.mockReset().mockResolvedValue({ text: '### Result\nOK' });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
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
});
