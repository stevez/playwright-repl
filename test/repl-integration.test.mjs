/**
 * Integration-level tests for repl.mjs functions that need mocking
 * (execSync, process.exit, etc.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionManager } from '../src/recorder.mjs';

// Mock child_process — used by handleKillAll
vi.mock('node:child_process', () => ({
  execSync: vi.fn(() => ''),
}));

import { execSync } from 'node:child_process';
import {
  handleKillAll,
  handleClose,
  startCommandLoop,
  runReplayMode,
} from '../src/repl.mjs';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCtx(overrides = {}) {
  return {
    conn: {
      connected: true,
      close: vi.fn(),
      connect: vi.fn().mockResolvedValue(true),
      send: vi.fn().mockResolvedValue({}),
      run: vi.fn().mockResolvedValue({ text: '### Result\nOK' }),
    },
    session: new SessionManager(),
    rl: null,
    sessionName: 'test',
    log: vi.fn(),
    historyFile: path.join(os.tmpdir(), 'pw-test-history-' + Date.now()),
    commandCount: 0,
    ...overrides,
  };
}

function makeRl() {
  const rl = new EventEmitter();
  rl.prompt = vi.fn();
  rl.setPrompt = vi.fn();
  rl.close = vi.fn();
  return rl;
}

// ─── handleKillAll ──────────────────────────────────────────────────────────

describe('handleKillAll', () => {
  let logSpy, errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(execSync).mockReset();
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('reports no daemons found when none running', async () => {
    vi.mocked(execSync).mockReturnValue('');
    const ctx = makeCtx();
    await handleKillAll(ctx);
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('No daemon processes found');
    expect(ctx.conn.close).toHaveBeenCalled();
  });

  if (process.platform === 'win32') {
    it('parses powershell output for PIDs on windows', async () => {
      vi.mocked(execSync).mockReturnValue('12345\r\n67890\r\n');
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {});
      const ctx = makeCtx();
      await handleKillAll(ctx);
      expect(killSpy).toHaveBeenCalledWith(12345);
      expect(killSpy).toHaveBeenCalledWith(67890);
      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Killed 2');
      killSpy.mockRestore();
    });

    it('handles powershell failure gracefully', async () => {
      const err = new Error('powershell failed');
      err.stdout = '';
      vi.mocked(execSync).mockImplementation(() => { throw err; });
      const ctx = makeCtx();
      await handleKillAll(ctx);
      // Should not crash
      expect(ctx.conn.close).toHaveBeenCalled();
    });
  } else {
    it('parses ps aux output for PIDs on unix', async () => {
      vi.mocked(execSync).mockReturnValue(
        'user  1234 0.0 node run-mcp-server --daemon-session=config.json\n' +
        'user  5678 0.0 node run-mcp-server --daemon-session=other.json\n' +
        'user  9999 0.0 node some-other-process\n'
      );
      const killSpy = vi.spyOn(process, 'kill').mockImplementation(() => {});
      const ctx = makeCtx();
      await handleKillAll(ctx);
      expect(killSpy).toHaveBeenCalledWith(1234, 'SIGKILL');
      expect(killSpy).toHaveBeenCalledWith(5678, 'SIGKILL');
      expect(killSpy).not.toHaveBeenCalledWith(9999, expect.anything());
      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('Killed 2');
      killSpy.mockRestore();
    });
  }

  it('handles execSync error gracefully', async () => {
    vi.mocked(execSync).mockImplementation(() => { throw new Error('exec failed'); });
    const ctx = makeCtx();
    await handleKillAll(ctx);
    // Should not throw — catches internally
    if (process.platform === 'win32') {
      // On Windows the inner try/catch handles the error; code falls through to "No daemon processes found"
      const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
      expect(output).toContain('No daemon processes found');
    } else {
      // On Unix the outer catch fires
      expect(errorSpy).toHaveBeenCalled();
    }
  });
});

// ─── handleClose ────────────────────────────────────────────────────────────

describe('handleClose', () => {
  let logSpy, errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('sends stop and closes connection', async () => {
    const ctx = makeCtx();
    await handleClose(ctx);
    expect(ctx.conn.send).toHaveBeenCalledWith('stop', {});
    expect(ctx.conn.close).toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Daemon stopped');
  });

  it('handles send error gracefully', async () => {
    const ctx = makeCtx();
    ctx.conn.send = vi.fn().mockRejectedValue(new Error('not connected'));
    await handleClose(ctx);
    expect(errorSpy).toHaveBeenCalled();
  });
});

// ─── startCommandLoop ───────────────────────────────────────────────────────

describe('startCommandLoop', () => {
  let logSpy, errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('prompts immediately', () => {
    const rl = makeRl();
    const ctx = makeCtx({ rl });
    startCommandLoop(ctx);
    expect(rl.prompt).toHaveBeenCalled();
  });

  it('processes commands from rl line events', async () => {
    const rl = makeRl();
    const ctx = makeCtx({ rl });
    startCommandLoop(ctx);

    // Emit a command
    rl.emit('line', 'snapshot');

    // Wait for async processing
    await new Promise(r => setTimeout(r, 50));

    expect(ctx.conn.run).toHaveBeenCalled();
    expect(ctx.commandCount).toBe(1);
  });

  it('processes multiple queued commands sequentially', async () => {
    const rl = makeRl();
    const callOrder = [];
    const ctx = makeCtx({ rl });
    ctx.conn.run = vi.fn().mockImplementation(async (args) => {
      callOrder.push(args._[0]);
      return { text: '### Result\nOK' };
    });

    startCommandLoop(ctx);
    rl.emit('line', 'snapshot');
    rl.emit('line', 'click e5');

    await new Promise(r => setTimeout(r, 100));

    expect(callOrder).toEqual(['snapshot', 'click']);
    expect(ctx.commandCount).toBe(2);
  });

  it('saves commands to history file', async () => {
    const rl = makeRl();
    const historyFile = path.join(os.tmpdir(), `pw-hist-${Date.now()}`);
    const ctx = makeCtx({ rl, historyFile });
    startCommandLoop(ctx);

    rl.emit('line', 'snapshot');
    await new Promise(r => setTimeout(r, 50));

    const content = fs.readFileSync(historyFile, 'utf-8');
    expect(content).toContain('snapshot');

    // Cleanup
    fs.unlinkSync(historyFile);
  });

  it('handles rl close during active processing', async () => {
    const rl = makeRl();
    const ctx = makeCtx({ rl });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    // Make conn.run slow so processing is active when close fires
    ctx.conn.run = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 100));
      return { text: '### Result\nOK' };
    });
    startCommandLoop(ctx);

    // Emit a command then immediately close
    rl.emit('line', 'snapshot');
    rl.emit('close');

    // Wait for both processing and close handler
    await new Promise(r => setTimeout(r, 300));

    expect(ctx.conn.run).toHaveBeenCalled();
    expect(ctx.conn.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('does not save empty lines to history', async () => {
    const rl = makeRl();
    const historyFile = path.join(os.tmpdir(), `pw-hist-empty-${Date.now()}`);
    const ctx = makeCtx({ rl, historyFile });
    startCommandLoop(ctx);

    rl.emit('line', '');
    rl.emit('line', '   ');
    await new Promise(r => setTimeout(r, 50));

    // File should not exist since no non-empty lines were emitted
    expect(fs.existsSync(historyFile)).toBe(false);
  });

  it('handles rl close — disconnects and exits', async () => {
    const rl = makeRl();
    const ctx = makeCtx({ rl });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    startCommandLoop(ctx);

    rl.emit('close');
    // Wait for the async close handler
    await new Promise(r => setTimeout(r, 100));

    expect(ctx.log).toHaveBeenCalled();
    expect(ctx.conn.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('handles SIGINT — prints message on first, exits on double', async () => {
    const rl = makeRl();
    const ctx = makeCtx({ rl });
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    startCommandLoop(ctx);

    rl.emit('SIGINT');
    expect(ctx.log).toHaveBeenCalled();
    expect(exitSpy).not.toHaveBeenCalled();

    // Second SIGINT within 500ms
    rl.emit('SIGINT');
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });
});

// ─── runReplayMode ──────────────────────────────────────────────────────────

describe('runReplayMode', () => {
  let tmpDir, logSpy, errorSpy, exitSpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-replay-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('replays commands from file and exits with 0', async () => {
    const filePath = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(filePath, 'snapshot\nclick e5\n', 'utf-8');

    const ctx = makeCtx();
    await runReplayMode(ctx, filePath, false);

    expect(ctx.conn.run).toHaveBeenCalledTimes(2);
    expect(logSpy.mock.calls.map(c => c.join(' ')).join('\n')).toContain('Replay complete');
    expect(ctx.conn.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('exits with 1 on error', async () => {
    const ctx = makeCtx();
    await runReplayMode(ctx, '/nonexistent/file.pw', false);

    expect(errorSpy).toHaveBeenCalled();
    expect(ctx.conn.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('step-through mode waits for stdin between commands', async () => {
    const filePath = path.join(tmpDir, 'step.pw');
    fs.writeFileSync(filePath, 'snapshot\nclick e5\n', 'utf-8');

    const ctx = makeCtx();
    const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    // Simulate stdin data arriving after a short delay
    const origOnce = process.stdin.once.bind(process.stdin);
    vi.spyOn(process.stdin, 'once').mockImplementation((event, cb) => {
      if (event === 'data') {
        setTimeout(() => cb(Buffer.from('\n')), 30);
      } else {
        origOnce(event, cb);
      }
    });

    await runReplayMode(ctx, filePath, true);

    expect(ctx.conn.run).toHaveBeenCalledTimes(2);
    // Should have prompted "Press Enter to continue" between commands
    const writes = stdoutSpy.mock.calls.map(c => c[0]).join('');
    expect(writes).toContain('Press Enter');
    expect(exitSpy).toHaveBeenCalledWith(0);

    stdoutSpy.mockRestore();
    process.stdin.once.mockRestore?.();
  });

  it('records session mode as replaying during replay', async () => {
    const filePath = path.join(tmpDir, 'test.pw');
    // Need 2+ commands so the player isn't done when the first command runs
    fs.writeFileSync(filePath, 'snapshot\nclick e5\n', 'utf-8');

    let modesDuringReplay = [];
    const ctx = makeCtx();
    ctx.conn.run = vi.fn().mockImplementation(async () => {
      modesDuringReplay.push(ctx.session.mode);
      return { text: '### Result\nOK' };
    });

    await runReplayMode(ctx, filePath, false);
    expect(modesDuringReplay).toContain('replaying');
  });
});
