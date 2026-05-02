// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@playwright-repl/core', () => ({
  resolveCommand: vi.fn((cmd) => {
    if (!cmd || !cmd.trim()) return null;
    const name = cmd.trim().split(/\s+/)[0];
    if (name === 'snapshot') return { jsExpr: 'return "Page snapshot"' };
    if (name === 'click') return { jsExpr: 'return "Clicked"' };
    if (name === 'fill') return { jsExpr: 'return "Filled"' };
    return null;
  }),
  UPDATE_COMMANDS: new Set(['click', 'fill', 'goto', 'press']),
}));

import { createStandaloneRunner, descriptions } from '../src/standalone.js';

describe('createStandaloneRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a runner with descriptions', () => {
    const { runner, descriptions: desc } = createStandaloneRunner(false);
    expect(runner).toBeDefined();
    expect(runner.runCommand).toBeTypeOf('function');
    expect(runner.runScript).toBeTypeOf('function');
    expect(desc.runCommand).toContain('KEYWORD');
  });

  it('descriptions include JavaScript support', () => {
    expect(descriptions.scriptOnly).toBe(false);
    expect(descriptions.runCommand).toContain('JavaScript');
  });

  it('descriptions include keyword commands', () => {
    expect(descriptions.runCommand).toContain('snapshot');
    expect(descriptions.runCommand).toContain('click');
    expect(descriptions.runCommand).toContain('fill');
  });
});
