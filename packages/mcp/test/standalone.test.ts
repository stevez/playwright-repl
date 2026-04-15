// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @playwright-repl/core
vi.mock('@playwright-repl/core', () => ({
  parseInput: vi.fn((cmd) => {
    if (!cmd || !cmd.trim()) return null;
    const parts = cmd.trim().split(/\s+/);
    return { _: parts };
  }),
  resolveArgs: vi.fn((args) => args),
  filterResponse: vi.fn((text) => text),
}));

// Mock playwright-repl Engine — must use `function` for `new` calls
const mockEngine = {
  start: vi.fn().mockResolvedValue(undefined),
  run: vi.fn().mockResolvedValue({ text: 'Clicked', isError: false }),
};
vi.mock('playwright-repl', () => ({
  Engine: vi.fn(function() { return mockEngine; }),
}));

import { createStandaloneRunner } from '../src/standalone.js';

describe('createStandaloneRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockEngine.start.mockResolvedValue(undefined);
    mockEngine.run.mockResolvedValue({ text: 'Clicked', isError: false });
  });

  it('creates a runner with descriptions', () => {
    const { runner, descriptions } = createStandaloneRunner(false);
    expect(runner).toBeDefined();
    expect(descriptions.runCommand).toContain('KEYWORD');
    expect(descriptions.scriptOnly).toBe(true);
  });

  // ─── runCommand ─────────────────────────────────────────────────────

  it('runs a single command', async () => {
    const { runner } = createStandaloneRunner(false);
    const result = await runner.runCommand('click e5');
    expect(result.text).toBe('Clicked');
    expect(result.isError).toBeFalsy();
  });

  it('returns error for empty command', async () => {
    const { parseInput } = await import('@playwright-repl/core');
    parseInput.mockReturnValueOnce(null);
    const { runner } = createStandaloneRunner(false);
    const result = await runner.runCommand('');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('Unknown command');
  });

  it('lazy-initializes the engine on first command', async () => {
    const { Engine } = await import('playwright-repl');
    const { runner } = createStandaloneRunner(true);
    expect(Engine).not.toHaveBeenCalled();
    await runner.runCommand('snapshot');
    expect(Engine).toHaveBeenCalled();
    expect(mockEngine.start).toHaveBeenCalledWith({ headed: true });
  });

  // ─── runScript ──────────────────────────────────────────────────────

  it('rejects JavaScript mode', async () => {
    const { runner } = createStandaloneRunner(false);
    const result = await runner.runScript('page.click()', 'javascript');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('not supported');
  });

  it('runs multi-line pw script', async () => {
    const { runner } = createStandaloneRunner(false);
    const result = await runner.runScript('snapshot\nclick e5', 'pw');
    expect(result.text).toContain('✓ snapshot');
    expect(result.text).toContain('✓ click e5');
    expect(result.isError).toBe(false);
  });

  it('skips comment lines in scripts', async () => {
    const { runner } = createStandaloneRunner(false);
    const result = await runner.runScript('# comment\nsnapshot', 'pw');
    expect(result.text).not.toContain('# comment');
    expect(result.text).toContain('✓ snapshot');
  });

  it('stops on first error in script', async () => {
    mockEngine.run
      .mockResolvedValueOnce({ text: 'OK', isError: false })
      .mockResolvedValueOnce({ text: 'Element not found', isError: true });
    const { runner } = createStandaloneRunner(false);
    const result = await runner.runScript('snapshot\nclick e5\nfill e6 hello', 'pw');
    expect(result.isError).toBe(true);
    expect(result.text).toContain('✓ snapshot');
    expect(result.text).toContain('✗ click e5');
    expect(result.text).not.toContain('fill');
  });

  it('skips blank lines in scripts', async () => {
    const { runner } = createStandaloneRunner(false);
    const result = await runner.runScript('snapshot\n\n\nclick e5', 'pw');
    expect(result.text).toContain('✓ snapshot');
    expect(result.text).toContain('✓ click e5');
    expect(mockEngine.run).toHaveBeenCalledTimes(2);
  });
});
