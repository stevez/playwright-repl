import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SessionManager } from '../src/recorder.mjs';
import {
  processLine,
  handleSessionCommand,
  showHelp,
  showAliases,
  showStatus,
  promptStr,
  completer,
} from '../src/repl.mjs';

// ─── Mock ctx factory ───────────────────────────────────────────────────────

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
    rl: {
      setPrompt: vi.fn(),
      prompt: vi.fn(),
    },
    sessionName: 'test-session',
    log: vi.fn(),
    historyFile: '/tmp/test-history',
    commandCount: 0,
    ...overrides,
  };
}

// ─── promptStr ──────────────────────────────────────────────────────────────

describe('promptStr', () => {
  it('shows plain prompt when idle', () => {
    const ctx = makeCtx();
    const prompt = promptStr(ctx);
    expect(prompt).toContain('pw>');
    expect(prompt).not.toContain('⏺');
    expect(prompt).not.toContain('⏸');
  });

  it('shows recording indicator when recording', () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    const prompt = promptStr(ctx);
    expect(prompt).toContain('⏺');
  });

  it('shows pause indicator when paused', () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    ctx.session.togglePause();
    const prompt = promptStr(ctx);
    expect(prompt).toContain('⏸');
  });
});

// ─── completer ──────────────────────────────────────────────────────────────

describe('completer', () => {
  it('completes command names', () => {
    const [hits, prefix] = completer('sn');
    expect(prefix).toBe('sn');
    expect(hits).toContain('snapshot');
  });

  it('completes meta-commands', () => {
    const [hits, prefix] = completer('.he');
    expect(prefix).toBe('.he');
    expect(hits).toContain('.help');
  });

  it('completes aliases', () => {
    const [hits, prefix] = completer('sna');
    expect(hits).toContain('snap');
  });

  it('returns all commands when no match', () => {
    const [hits, prefix] = completer('');
    expect(hits.length).toBeGreaterThan(10);
  });

  it('completes options after command', () => {
    const [hits, lastPart] = completer('screenshot --fu');
    expect(lastPart).toBe('--fu');
    // screenshot has --fullPage and --filename options
    expect(hits).toContain('--fullPage');
  });

  it('returns empty for non-option second args', () => {
    const [hits] = completer('click e5');
    expect(hits).toEqual([]);
  });
});

// ─── showHelp / showAliases ─────────────────────────────────────────────────

describe('showHelp', () => {
  it('prints without throwing', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    showHelp();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it('mentions key command categories', () => {
    const output = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));
    showHelp();
    const text = output.join('\n');
    expect(text).toContain('Navigation');
    expect(text).toContain('Interaction');
    expect(text).toContain('Inspection');
    expect(text).toContain('.record');
    expect(text).toContain('.replay');
    spy.mockRestore();
  });
});

describe('showAliases', () => {
  it('prints alias mappings', () => {
    const output = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));
    showAliases();
    const text = output.join('\n');
    expect(text).toContain('click');
    expect(text).toContain('snapshot');
    spy.mockRestore();
  });
});

// ─── showStatus ─────────────────────────────────────────────────────────────

describe('showStatus', () => {
  it('shows connected status', () => {
    const output = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));
    const ctx = makeCtx();
    showStatus(ctx);
    const text = output.join('\n');
    expect(text).toContain('yes');
    expect(text).toContain('test-session');
    expect(text).toContain('Mode: idle');
    spy.mockRestore();
  });

  it('shows disconnected status', () => {
    const output = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));
    const ctx = makeCtx({ conn: { connected: false } });
    showStatus(ctx);
    const text = output.join('\n');
    expect(text).toContain('no');
    spy.mockRestore();
  });

  it('shows recording info when recording', () => {
    const output = [];
    const spy = vi.spyOn(console, 'log').mockImplementation((...args) => output.push(args.join(' ')));
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    showStatus(ctx);
    const text = output.join('\n');
    expect(text).toContain('Mode: recording');
    expect(text).toContain('Recording:');
    spy.mockRestore();
  });
});

// ─── handleSessionCommand ───────────────────────────────────────────────────

describe('handleSessionCommand', () => {
  let logSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy?.mockRestore();
  });

  it('.record starts recording', () => {
    const ctx = makeCtx();
    const result = handleSessionCommand(ctx, '.record /tmp/test.pw');
    expect(result).toBe(true);
    expect(ctx.session.mode).toBe('recording');
    expect(ctx.rl.setPrompt).toHaveBeenCalled();
  });

  it('.save saves recording', () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    ctx.session.record('click e5');
    const result = handleSessionCommand(ctx, '.save');
    expect(result).toBe(true);
    expect(ctx.session.mode).toBe('idle');
  });

  it('.pause toggles pause', () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    handleSessionCommand(ctx, '.pause');
    expect(ctx.session.mode).toBe('paused');
    handleSessionCommand(ctx, '.pause');
    expect(ctx.session.mode).toBe('recording');
  });

  it('.discard discards recording', () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    const result = handleSessionCommand(ctx, '.discard');
    expect(result).toBe(true);
    expect(ctx.session.mode).toBe('idle');
  });

  it('returns false for unknown dot-commands', () => {
    const ctx = makeCtx();
    const result = handleSessionCommand(ctx, '.unknown');
    expect(result).toBe(false);
  });

  it('.save throws when not recording (caught by processLine)', () => {
    const ctx = makeCtx();
    expect(() => handleSessionCommand(ctx, '.save')).toThrow('Not recording');
  });
});

// ─── processLine ────────────────────────────────────────────────────────────

describe('processLine', () => {
  let logSpy, errorSpy;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy?.mockRestore();
    errorSpy?.mockRestore();
  });

  it('ignores empty lines', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '');
    await processLine(ctx, '   ');
    expect(ctx.conn.run).not.toHaveBeenCalled();
  });

  it('.help prints help', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.help');
    expect(logSpy).toHaveBeenCalled();
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Navigation');
  });

  it('? prints help', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '?');
    expect(logSpy).toHaveBeenCalled();
  });

  it('.aliases prints aliases', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.aliases');
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('click');
  });

  it('.status prints status', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.status');
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('test-session');
  });

  it('.reconnect closes and reconnects', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.reconnect');
    expect(ctx.conn.close).toHaveBeenCalled();
    expect(ctx.conn.connect).toHaveBeenCalled();
  });

  it('.reconnect handles failure', async () => {
    const ctx = makeCtx();
    ctx.conn.connect = vi.fn().mockRejectedValue(new Error('refused'));
    await processLine(ctx, '.reconnect');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('sends regular command to daemon and increments count', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'snapshot');
    expect(ctx.conn.run).toHaveBeenCalledWith(expect.objectContaining({ _: ['snapshot'] }));
    expect(ctx.commandCount).toBe(1);
  });

  it('prints filtered daemon response', async () => {
    const ctx = makeCtx();
    ctx.conn.run = vi.fn().mockResolvedValue({ text: '### Result\nClicked element' });
    await processLine(ctx, 'click e5');
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Clicked element');
  });

  it('prints unknown command warning', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'notacommand');
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Unknown command');
  });

  it('auto-resolves text to run-code for click', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'click "Submit"');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('run-code');
    expect(call._[1]).toContain('getByText("Submit").click()');
  });

  it('auto-resolves text to run-code for fill', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'fill "Email" test@x.com');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('run-code');
    expect(call._[1]).toContain('getByLabel("Email").fill("test@x.com")');
  });

  it('does NOT auto-resolve ref-style args (e5)', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'click e5');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('click');
    expect(call._[1]).toBe('e5');
  });

  it('records command when recording', async () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    await processLine(ctx, 'snapshot');
    expect(ctx.session.recordedCount).toBe(1);
  });

  it('handles daemon error and attempts reconnect', async () => {
    const ctx = makeCtx();
    ctx.conn.run = vi.fn().mockRejectedValue(new Error('timeout'));
    ctx.conn.connected = false;
    await processLine(ctx, 'snapshot');
    expect(errorSpy).toHaveBeenCalled();
    expect(ctx.conn.connect).toHaveBeenCalled();
  });

  it('handles .record/.save via session command flow', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.record /tmp/session.pw');
    expect(ctx.session.mode).toBe('recording');
    await processLine(ctx, 'snapshot');
    await processLine(ctx, '.save');
    expect(ctx.session.mode).toBe('idle');
  });

  it('shows error for .save when not recording', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.save');
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Not recording');
  });

  it('close sends stop to daemon', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'close');
    expect(ctx.conn.send).toHaveBeenCalledWith('stop', {});
  });

  it('.exit closes connection and exits', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const ctx = makeCtx();
    await processLine(ctx, '.exit');
    expect(ctx.conn.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('.quit closes connection and exits', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
    const ctx = makeCtx();
    await processLine(ctx, '.quit');
    expect(ctx.conn.close).toHaveBeenCalled();
    expect(exitSpy).toHaveBeenCalledWith(0);
    exitSpy.mockRestore();
  });

  it('.replay without filename shows usage', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.replay');
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Usage: .replay');
  });

  it('.replay replays commands from file', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-replay-test-'));
    const filePath = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(filePath, 'snapshot\nclick e5\n', 'utf-8');

    const ctx = makeCtx();
    await processLine(ctx, `.replay ${filePath}`);

    expect(ctx.conn.run).toHaveBeenCalledTimes(2);
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Replay complete');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('.replay handles errors gracefully', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.replay /nonexistent/file.pw');
    expect(errorSpy).toHaveBeenCalled();
  });

  it('logs elapsed time for slow commands', async () => {
    const ctx = makeCtx();
    // Mock conn.run to take >500ms
    ctx.conn.run = vi.fn().mockImplementation(async () => {
      await new Promise(r => setTimeout(r, 600));
      return { text: '### Result\nOK' };
    });
    await processLine(ctx, 'snapshot');
    // ctx.log should have been called with elapsed time
    const logCalls = ctx.log.mock.calls.map(c => c.join(' ')).join('\n');
    expect(logCalls).toMatch(/\d+ms/);
  });

  it('shows reconnect failure message when both run and reconnect fail', async () => {
    const ctx = makeCtx();
    ctx.conn.run = vi.fn().mockRejectedValue(new Error('timeout'));
    ctx.conn.connected = false;
    ctx.conn.connect = vi.fn().mockRejectedValue(new Error('refused'));
    await processLine(ctx, 'snapshot');
    expect(errorSpy).toHaveBeenCalled();
    const allOutput = [
      ...errorSpy.mock.calls.map(c => c.join(' ')),
      ...logSpy.mock.calls.map(c => c.join(' ')),
    ].join('\n');
    expect(allOutput).toContain('Could not reconnect');
  });

  it('kill-all dispatches to handleKillAll', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'kill-all');
    // handleKillAll calls conn.close
    expect(ctx.conn.close).toHaveBeenCalled();
  });

  it('close-all dispatches to handleClose', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'close-all');
    expect(ctx.conn.send).toHaveBeenCalledWith('stop', {});
  });

  it('handles null result from daemon gracefully', async () => {
    const ctx = makeCtx();
    ctx.conn.run = vi.fn().mockResolvedValue(null);
    await processLine(ctx, 'snapshot');
    expect(ctx.commandCount).toBe(1);
  });

  it('handles result with no text field', async () => {
    const ctx = makeCtx();
    ctx.conn.run = vi.fn().mockResolvedValue({ data: 'something' });
    await processLine(ctx, 'snapshot');
    expect(ctx.commandCount).toBe(1);
  });

  it('accepts verify-text as a known extra command', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'verify-text "Hello"');
    expect(ctx.conn.run).toHaveBeenCalled();
  });

  it('accepts verify-element as a known extra command', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'verify-element button Submit');
    expect(ctx.conn.run).toHaveBeenCalled();
  });

  it('auto-resolves text for dblclick', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'dblclick "Item"');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('run-code');
    expect(call._[1]).toContain('getByText("Item").dblclick()');
  });

  it('auto-resolves text for hover', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'hover "Menu"');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('run-code');
    expect(call._[1]).toContain('getByText("Menu").hover()');
  });

  it('auto-resolves text for select (uses getByLabel)', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'select "Country" US');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('run-code');
    expect(call._[1]).toContain('getByLabel("Country").selectOption("US")');
  });

  it('auto-resolves text for check (uses getByLabel)', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'check "Agree"');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('run-code');
    expect(call._[1]).toContain('getByLabel("Agree").check()');
  });

  it('auto-resolves text for uncheck (uses getByLabel)', async () => {
    const ctx = makeCtx();
    await processLine(ctx, 'uncheck "Agree"');
    const call = ctx.conn.run.mock.calls[0][0];
    expect(call._[0]).toBe('run-code');
    expect(call._[1]).toContain('getByLabel("Agree").uncheck()');
  });

  it('does not record when session is paused', async () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    ctx.session.togglePause();
    await processLine(ctx, 'snapshot');
    expect(ctx.session.recordedCount).toBe(0);
  });

  it('daemon error without disconnect does not attempt reconnect', async () => {
    const ctx = makeCtx();
    ctx.conn.run = vi.fn().mockRejectedValue(new Error('bad args'));
    // conn.connected stays true
    await processLine(ctx, 'snapshot');
    expect(errorSpy).toHaveBeenCalled();
    expect(ctx.conn.connect).not.toHaveBeenCalled();
  });

  it('.discard via processLine shows message', async () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    await processLine(ctx, '.discard');
    expect(ctx.session.mode).toBe('idle');
    const output = logSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('discarded');
  });

  it('.pause via processLine toggles recording pause', async () => {
    const ctx = makeCtx();
    ctx.session.startRecording('/tmp/test.pw');
    await processLine(ctx, '.pause');
    expect(ctx.session.mode).toBe('paused');
  });

  it('.record via processLine starts recording with default filename', async () => {
    const ctx = makeCtx();
    await processLine(ctx, '.record');
    expect(ctx.session.mode).toBe('recording');
  });
});
