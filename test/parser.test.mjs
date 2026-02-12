import { describe, it, expect } from 'vitest';
import { parseInput, ALIASES, ALL_COMMANDS, booleanOptions } from '../src/parser.mjs';

describe('parseInput', () => {
  it('parses a basic command', () => {
    const args = parseInput('click e5');
    expect(args._).toEqual(['click', 'e5']);
  });

  it('returns null for empty input', () => {
    expect(parseInput('')).toBeNull();
    expect(parseInput('   ')).toBeNull();
  });

  it('resolves single-letter aliases', () => {
    const args = parseInput('c e5');
    expect(args._[0]).toBe('click');
    expect(args._[1]).toBe('e5');
  });

  it('resolves multi-letter aliases', () => {
    expect(parseInput('snap')._[0]).toBe('snapshot');
    expect(parseInput('back')._[0]).toBe('go-back');
    expect(parseInput('fwd')._[0]).toBe('go-forward');
  });

  it('handles quoted strings with single quotes', () => {
    const args = parseInput("fill e7 'hello world'");
    expect(args._).toEqual(['fill', 'e7', 'hello world']);
  });

  it('handles quoted strings with double quotes', () => {
    const args = parseInput('fill e7 "hello world"');
    expect(args._).toEqual(['fill', 'e7', 'hello world']);
  });

  it('parses boolean options', () => {
    const args = parseInput('screenshot --fullPage');
    expect(args.fullPage).toBe(true);
    expect(args._[0]).toBe('screenshot');
  });

  it('strips false-valued booleans not explicitly passed', () => {
    const args = parseInput('click e5');
    expect(args).not.toHaveProperty('headed');
    expect(args).not.toHaveProperty('fullPage');
    expect(args).not.toHaveProperty('persistent');
  });

  it('keeps explicit --no- booleans', () => {
    const args = parseInput('open --no-headed');
    expect(args.headed).toBe(false);
  });

  it('coerces all args to strings', () => {
    const args = parseInput('tab-select 3');
    expect(args._[1]).toBe('3');
    expect(typeof args._[1]).toBe('string');
  });

  it('parses string options', () => {
    const args = parseInput('screenshot --filename test.png');
    expect(args._[0]).toBe('screenshot');
    expect(args.filename).toBe('test.png');
  });

  it('lowercases command for alias lookup', () => {
    const args = parseInput('C e5');
    expect(args._[0]).toBe('click');
  });

  it('handles command with no arguments', () => {
    const args = parseInput('snapshot');
    expect(args._).toEqual(['snapshot']);
  });
});

describe('ALIASES', () => {
  it('maps most aliases to known commands', () => {
    // verify-* aliases map to commands handled as knownExtras in repl.mjs,
    // not in the COMMANDS vocabulary — that's intentional.
    const extras = ['verify-text', 'verify-element', 'verify-value', 'verify-list'];
    for (const [alias, cmd] of Object.entries(ALIASES)) {
      if (extras.includes(cmd)) continue;
      expect(ALL_COMMANDS, `alias "${alias}" → "${cmd}"`).toContain(cmd);
    }
  });
});

describe('booleanOptions', () => {
  it('includes expected options', () => {
    expect(booleanOptions.has('headed')).toBe(true);
    expect(booleanOptions.has('fullPage')).toBe(true);
    expect(booleanOptions.has('persistent')).toBe(true);
  });
});
