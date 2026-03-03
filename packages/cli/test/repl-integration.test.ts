// @ts-nocheck
/**
 * Integration-level tests for repl.ts functions that need mocking
 * (execSync, process.exit, etc.)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionManager } from '../src/recorder.js';

import {
  handleKillAll,
  handleClose,
  startCommandLoop,
  runReplayMode,
  resolveReplayFiles,
  runMultiReplayMode,
} from '../src/repl.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeCtx(overrides = {}) {
  return {
    conn: {
      connected: true,
      close: vi.fn(),
      start: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({ text: '### Result\nOK' }),
    },
    session: new SessionManager(),
    rl: null,
    opts: {},
    log: vi.fn(),
    historyFile: path.join(os.tmpdir(), 'pw-test-history-' + Date.now()),
    sessionHistory: [],
    commandCount: 0,
    errors: 0,
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
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('closes the engine', async () => {
    const ctx = makeCtx();
    await handleKillAll(ctx);
    expect(ctx.conn.close).toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Browser closed');
  });

  it('handles close error gracefully', async () => {
    const ctx = makeCtx();
    ctx.conn.close = vi.fn().mockRejectedValue(new Error('close failed'));
    await handleKillAll(ctx);
    expect(errorSpy).toHaveBeenCalled();
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

  it('closes the engine and reports success', async () => {
    const ctx = makeCtx();
    await handleClose(ctx);
    expect(ctx.conn.close).toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Browser closed');
  });

  it('handles close error gracefully', async () => {
    const ctx = makeCtx();
    ctx.conn.close = vi.fn().mockRejectedValue(new Error('close failed'));
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

// ─── resolveReplayFiles ────────────────────────────────────────────────────

describe('resolveReplayFiles', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-resolve-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns single file as-is', () => {
    const file = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(file, 'snapshot\n');
    expect(resolveReplayFiles([file])).toEqual([file]);
  });

  it('expands directory to sorted .pw files', () => {
    fs.writeFileSync(path.join(tmpDir, '02-b.pw'), 'click e5\n');
    fs.writeFileSync(path.join(tmpDir, '01-a.pw'), 'snapshot\n');
    fs.writeFileSync(path.join(tmpDir, 'readme.txt'), 'not a pw file\n');

    const result = resolveReplayFiles([tmpDir]);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('01-a.pw');
    expect(result[1]).toContain('02-b.pw');
  });

  it('handles mix of files and directories', () => {
    const file = path.join(tmpDir, 'extra.pw');
    fs.writeFileSync(file, 'snapshot\n');
    const subdir = path.join(tmpDir, 'sub');
    fs.mkdirSync(subdir);
    fs.writeFileSync(path.join(subdir, 'test.pw'), 'click e5\n');

    const result = resolveReplayFiles([file, subdir]);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(file);
    expect(result[1]).toContain('test.pw');
  });

  it('returns empty array for directory with no .pw files', () => {
    expect(resolveReplayFiles([tmpDir])).toEqual([]);
  });
});

// ─── runMultiReplayMode ────────────────────────────────────────────────────

describe('runMultiReplayMode', () => {
  let tmpDir, logSpy, errorSpy, exitSpy;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-multi-'));
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    // Clean up any replay log files
    for (const f of fs.readdirSync(process.cwd())) {
      if (f.startsWith('replay-') && f.endsWith('.log')) {
        fs.unlinkSync(f);
      }
    }
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it('delegates to runReplayMode for single file', async () => {
    const file = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(file, 'snapshot\n');

    const ctx = makeCtx();
    await runMultiReplayMode(ctx, [file], false);

    expect(ctx.conn.run).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.calls.map(c => c.join(' ')).join('\n')).toContain('Replay complete');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('runs multiple files and reports pass/fail', async () => {
    fs.writeFileSync(path.join(tmpDir, '01.pw'), 'snapshot\n');
    fs.writeFileSync(path.join(tmpDir, '02.pw'), 'click e5\n');

    const ctx = makeCtx();
    await runMultiReplayMode(ctx, [tmpDir], false);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('2 passed');
    expect(output).toContain('Results');
    expect(exitSpy).toHaveBeenCalledWith(0);
  });

  it('detects errors and marks file as failed', async () => {
    fs.writeFileSync(path.join(tmpDir, '01.pw'), 'snapshot\n');
    fs.writeFileSync(path.join(tmpDir, '02.pw'), 'snapshot\n');

    const ctx = makeCtx();
    let callCount = 0;
    ctx.conn.run = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 2) return { text: '### Error\nfailed', isError: true };
      return { text: '### Result\nOK' };
    });

    await runMultiReplayMode(ctx, [tmpDir], false);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('1 passed');
    expect(output).toContain('1 failed');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('writes a log file', async () => {
    fs.writeFileSync(path.join(tmpDir, '01.pw'), 'snapshot\n');
    fs.writeFileSync(path.join(tmpDir, '02.pw'), 'click e5\n');

    const ctx = makeCtx();
    await runMultiReplayMode(ctx, [tmpDir], false);

    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Log:');

    // Find the log file
    const logFiles = fs.readdirSync(process.cwd()).filter(f => f.startsWith('replay-') && f.endsWith('.log'));
    expect(logFiles.length).toBeGreaterThan(0);

    const logContent = fs.readFileSync(logFiles[0], 'utf-8');
    expect(logContent).toContain('Summary');
    expect(logContent).toContain('PASS');
  });

  it('exits with 1 when no .pw files found', async () => {
    const emptyDir = path.join(tmpDir, 'empty');
    fs.mkdirSync(emptyDir);

    const ctx = makeCtx();
    await runMultiReplayMode(ctx, [emptyDir], false);

    expect(errorSpy).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
