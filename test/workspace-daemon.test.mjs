/**
 * Tests for isDaemonRunning and startDaemon with mocked dependencies.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock net for isDaemonRunning
vi.mock('node:net', () => {
  return {
    default: {
      createConnection: vi.fn(),
    },
    createConnection: vi.fn(),
  };
});

// Mock child_process for startDaemon
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
}));

import net from 'node:net';
import { execSync } from 'node:child_process';
import { isDaemonRunning, startDaemon } from '../src/workspace.mjs';

describe('isDaemonRunning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns true when socket connects', async () => {
    vi.mocked(net.createConnection).mockImplementation((_path, cb) => {
      const sock = new EventEmitter();
      sock.destroy = vi.fn();
      process.nextTick(cb);
      return sock;
    });

    const result = await isDaemonRunning('default');
    expect(result).toBe(true);
  });

  it('returns false when socket errors', async () => {
    vi.mocked(net.createConnection).mockImplementation((_path, _cb) => {
      const sock = new EventEmitter();
      sock.destroy = vi.fn();
      process.nextTick(() => sock.emit('error', new Error('ECONNREFUSED')));
      return sock;
    });

    const result = await isDaemonRunning('default');
    expect(result).toBe(false);
  });
});

describe('startDaemon', () => {
  let logSpy, errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(execSync).mockReset();
    vi.mocked(execSync).mockReturnValue('');
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('runs node with launcher path and open command', async () => {
    await startDaemon('default', { silent: true });
    expect(execSync).toHaveBeenCalled();
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).toContain('daemon-launcher.cjs');
    expect(cmd).toContain('open');
  });

  it('includes session flag for non-default sessions', async () => {
    await startDaemon('my-session', { silent: true });
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).toContain('-s=my-session');
  });

  it('does not include session flag for default session', async () => {
    await startDaemon('default', { silent: true });
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).not.toContain('-s=');
  });

  it('passes --headed flag', async () => {
    await startDaemon('default', { headed: true, silent: true });
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).toContain('--headed');
  });

  it('passes --browser flag', async () => {
    await startDaemon('default', { browser: 'firefox', silent: true });
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).toContain('--browser');
    expect(cmd).toContain('firefox');
  });

  it('passes --persistent flag', async () => {
    await startDaemon('default', { persistent: true, silent: true });
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).toContain('--persistent');
  });

  it('passes --profile flag', async () => {
    await startDaemon('default', { profile: '/tmp/profile', silent: true });
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).toContain('--profile');
  });

  it('passes --config flag', async () => {
    await startDaemon('default', { config: 'my-config.json', silent: true });
    const cmd = vi.mocked(execSync).mock.calls[0][0];
    expect(cmd).toContain('--config');
  });

  it('prints starting message when not silent', async () => {
    await startDaemon('default', {});
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Starting daemon');
  });

  it('handles execSync error gracefully', async () => {
    const err = new Error('spawn failed');
    err.stdout = 'some output';
    err.stderr = 'some error';
    vi.mocked(execSync).mockImplementation(() => { throw err; });
    await startDaemon('default', { silent: true });
    // Should not throw
    expect(logSpy).toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalled();
  });

  it('prints daemon output if any', async () => {
    vi.mocked(execSync).mockReturnValue('Browser launched on port 9222');
    await startDaemon('default', { silent: true });
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Browser launched');
  });
});
