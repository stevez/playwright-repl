/**
 * Tests for startRepl() — the main orchestrator.
 * Mocks workspace, connection, and readline modules.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
}));

vi.mock('../src/workspace.mjs', () => ({
  socketPath: vi.fn(() => '/tmp/test.sock'),
  daemonProfilesDir: '/tmp/pw-profiles',
  isDaemonRunning: vi.fn(),
  startDaemon: vi.fn(),
  findWorkspaceDir: vi.fn(() => '/tmp'),
}));

let lastMockConn;
vi.mock('../src/connection.mjs', () => {
  const MockConn = vi.fn(function () {
    this.connect = vi.fn().mockResolvedValue(true);
    this.close = vi.fn();
    this.send = vi.fn().mockResolvedValue({});
    this.run = vi.fn().mockResolvedValue({ text: '### Result\nOK' });
    this.connected = true;
    lastMockConn = this;
  });
  return { DaemonConnection: MockConn };
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

import { isDaemonRunning, startDaemon } from '../src/workspace.mjs';
import { DaemonConnection } from '../src/connection.mjs';
import { startRepl } from '../src/repl.mjs';

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('startRepl', () => {
  let logSpy, errorSpy, exitSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    vi.mocked(isDaemonRunning).mockResolvedValue(true);
    // Reset DaemonConnection to default constructor
    DaemonConnection.mockImplementation(function () {
      this.connect = vi.fn().mockResolvedValue(true);
      this.close = vi.fn();
      this.send = vi.fn().mockResolvedValue({});
      this.run = vi.fn().mockResolvedValue({ text: '### Result\nOK' });
      this.connected = true;
      lastMockConn = this;
    });
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('connects to existing daemon without starting a new one', async () => {
    vi.mocked(isDaemonRunning).mockResolvedValue(true);
    await startRepl({ session: 'test-session', silent: true });
    expect(startDaemon).not.toHaveBeenCalled();
    expect(DaemonConnection).toHaveBeenCalled();
  });

  it('starts daemon when not running', async () => {
    vi.mocked(isDaemonRunning).mockResolvedValue(false);
    await startRepl({ session: 'test-session', silent: true });
    expect(startDaemon).toHaveBeenCalledWith('test-session', expect.any(Object));
  });

  it('uses default session name when not specified', async () => {
    await startRepl({ silent: true });
    expect(isDaemonRunning).toHaveBeenCalledWith('default');
  });

  it('exits with 1 when connection fails', async () => {
    DaemonConnection.mockImplementation(function () {
      this.connect = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
      this.close = vi.fn();
      this.connected = false;
      lastMockConn = this;
    });

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

  it('auto-starts recording when --record is passed', async () => {
    await startRepl({ silent: true, record: '/tmp/my-session.pw' });
    // The session should have started recording (no error thrown)
    // We can't easily inspect the ctx, but we verify no error
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
