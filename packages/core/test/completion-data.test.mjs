import { describe, it, expect } from 'vitest';
import { buildCompletionItems } from '../src/completion-data.mjs';
import { COMMANDS } from '../src/resolve.mjs';

describe('buildCompletionItems', () => {
  const items = buildCompletionItems();

  it('returns an array of { cmd, desc } objects', () => {
    expect(Array.isArray(items)).toBe(true);
    for (const item of items) {
      expect(item).toHaveProperty('cmd');
      expect(item).toHaveProperty('desc');
      expect(typeof item.cmd).toBe('string');
      expect(typeof item.desc).toBe('string');
    }
  });

  it('includes all primary commands', () => {
    const cmds = new Set(items.map(i => i.cmd));
    for (const name of Object.keys(COMMANDS)) {
      expect(cmds.has(name)).toBe(true);
    }
  });

  it('includes meta-commands', () => {
    const cmds = new Set(items.map(i => i.cmd));
    expect(cmds.has('.help')).toBe(true);
    expect(cmds.has('.exit')).toBe(true);
    expect(cmds.has('.record')).toBe(true);
    expect(cmds.has('.save')).toBe(true);
  });

  it('does not include aliases', () => {
    const cmds = new Set(items.map(i => i.cmd));
    expect(cmds.has('g')).toBe(false);
    expect(cmds.has('f')).toBe(false);
    expect(cmds.has('snap')).toBe(false);
  });

  it('is sorted alphabetically by cmd', () => {
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].cmd.localeCompare(items[i].cmd)).toBeLessThanOrEqual(0);
    }
  });

  it('has correct count (commands + extra + meta-commands)', () => {
    const expected = Object.keys(COMMANDS).length + 4 + 10;
    expect(items.length).toBe(expected);
  });
});
