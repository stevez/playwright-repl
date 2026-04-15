// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.hoisted runs before vi.mock hoisting — safe to reference in mock factories
const { mockConn, mockReplInstance, fakeMinimist } = vi.hoisted(() => {
  const mockConn = {
    start: vi.fn(),
    run: vi.fn().mockResolvedValue({ text: 'OK', isError: false }),
    runScript: vi.fn().mockResolvedValue({ text: 'script result', isError: false }),
    close: vi.fn(),
  };
  const mockReplInstance = {
    context: {},
    on: vi.fn((event, cb) => {
      if (event === 'exit') setTimeout(cb, 0);
      return mockReplInstance;
    }),
  };
  function fakeMinimist(argv, opts = {}) {
    const result = { _: [] };
    const booleans = new Set(opts.boolean || []);
    const strings = new Set(opts.string || []);
    Object.assign(result, opts.default || {});
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg.startsWith('--')) {
        const key = arg.slice(2);
        if (booleans.has(key)) { result[key] = true; continue; }
        if (strings.has(key) && i + 1 < argv.length) { result[key] = argv[++i]; continue; }
        result[key] = true;
      } else {
        result._.push(arg);
      }
    }
    return result;
  }
  return { mockConn, mockReplInstance, fakeMinimist };
});

vi.mock('@playwright-repl/core', () => ({
  EvaluateConnection: vi.fn(function() { return mockConn; }),
  findExtensionPath: vi.fn(() => '/fake/extension'),
  minimist: fakeMinimist,
}));

vi.mock('node:repl', () => ({
  default: {
    start: vi.fn(() => mockReplInstance),
  },
}));

vi.mock('node:fs', () => ({
  default: {
    readFileSync: vi.fn(() => 'await page.goto("https://example.com");'),
    existsSync: vi.fn(() => true),
  },
}));

// Mock process.exit to prevent test runner from exiting
const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => { throw new Error('EXIT'); });

import { handleRepl } from '../src/pw-repl.js';

describe('handleRepl', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExit.mockImplementation(() => { throw new Error('EXIT'); });
    mockConn.start.mockResolvedValue(undefined);
    mockConn.close.mockResolvedValue(undefined);
    mockConn.runScript.mockResolvedValue({ text: 'done', isError: false });
    mockReplInstance.on.mockImplementation((event, cb) => {
      if (event === 'exit') setTimeout(cb, 0);
      return mockReplInstance;
    });
  });

  // ─── Evaluate mode (default) ──────────────────────────────────────

  it('launches in headed evaluate mode by default', async () => {
    // handleRepl ends with process.exit(0) after REPL exits
    await expect(handleRepl([])).rejects.toThrow('EXIT');
    expect(mockConn.start).toHaveBeenCalledWith(
      '/fake/extension',
      expect.objectContaining({ headed: true }),
    );
  });

  it('launches in headless mode with --headless', async () => {
    await expect(handleRepl(['--headless'])).rejects.toThrow('EXIT');
    expect(mockConn.start).toHaveBeenCalledWith(
      '/fake/extension',
      expect.objectContaining({ headed: false }),
    );
  });

  it('runs a script file and exits in evaluate mode', async () => {
    await expect(handleRepl(['test.js'])).rejects.toThrow('EXIT');
    expect(mockConn.runScript).toHaveBeenCalledWith(
      'await page.goto("https://example.com");',
      'javascript',
    );
    expect(mockConn.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('starts interactive REPL in evaluate mode when no script given', async () => {
    const repl = (await import('node:repl')).default;
    await expect(handleRepl([])).rejects.toThrow('EXIT');
    expect(repl.start).toHaveBeenCalledWith(expect.objectContaining({
      prompt: 'pw> ',
    }));
  });

  // ─── Error handling ────────────────────────────────────────────────

  it('handles script error in evaluate mode', async () => {
    mockConn.runScript.mockResolvedValue({ text: 'timeout', isError: true });
    await expect(handleRepl(['test.js'])).rejects.toThrow('EXIT');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('handles thrown error in evaluate mode script', async () => {
    mockConn.runScript.mockRejectedValue(new Error('connection lost'));
    await expect(handleRepl(['test.js'])).rejects.toThrow('EXIT');
    expect(mockConn.close).toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(0);
  });
});
