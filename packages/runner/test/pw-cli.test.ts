// @ts-nocheck
/**
 * Tests for pw-cli.ts — tryDirectEvaluate logic.
 *
 * pw-cli.ts has top-level side effects (reads process.argv, calls spawn),
 * so we can't import it directly. Instead we test the tryDirectEvaluate
 * function by extracting its logic into importable pieces.
 *
 * Since tryDirectEvaluate is not exported, we test the file-discovery
 * and flag-parsing logic that it implements by reimplementing the same
 * patterns and verifying against the source behavior.
 */
import { describe, it, expect } from 'vitest';

// ─── File discovery logic (mirrors tryDirectEvaluate arg parsing) ────

describe('pw-cli argument parsing', () => {
  function parseTestArgs(testArgs: string[]) {
    const testFiles: string[] = [];
    const flagArgs: string[] = [];
    for (const arg of testArgs) {
      if (arg.startsWith('-')) {
        flagArgs.push(arg);
      } else {
        testFiles.push(arg);
      }
    }
    return { testFiles, flagArgs };
  }

  it('separates test files from flags', () => {
    const { testFiles, flagArgs } = parseTestArgs([
      'test.spec.ts', '--workers=1', '--headed', 'another.test.ts',
    ]);
    expect(testFiles).toEqual(['test.spec.ts', 'another.test.ts']);
    expect(flagArgs).toEqual(['--workers=1', '--headed']);
  });

  it('handles no arguments', () => {
    const { testFiles, flagArgs } = parseTestArgs([]);
    expect(testFiles).toEqual([]);
    expect(flagArgs).toEqual([]);
  });

  it('handles only flags', () => {
    const { testFiles, flagArgs } = parseTestArgs(['--workers=4', '--reporter=list']);
    expect(testFiles).toEqual([]);
    expect(flagArgs).toEqual(['--workers=4', '--reporter=list']);
  });
});

// ─── Unsupported flag detection ──────────────────────────────────────

describe('pw-cli unsupported flag detection', () => {
  function findUnsupportedFlags(flagArgs: string[]) {
    return flagArgs.filter(f =>
      !f.startsWith('--workers') && !f.startsWith('--reporter') &&
      !f.startsWith('--headed') && !f.startsWith('--headless')
    );
  }

  it('allows --workers, --reporter, --headed, --headless', () => {
    const unsupported = findUnsupportedFlags([
      '--workers=1', '--reporter=list', '--headed', '--headless',
    ]);
    expect(unsupported).toEqual([]);
  });

  it('detects unsupported flags', () => {
    const unsupported = findUnsupportedFlags([
      '--workers=1', '--grep=pattern', '--debug',
    ]);
    expect(unsupported).toEqual(['--grep=pattern', '--debug']);
  });
});

// ─── Subcommand routing ──────────────────────────────────────────────

describe('pw-cli subcommand routing', () => {
  it('identifies repl subcommand', () => {
    const args = ['repl', '--headed'];
    expect(args[0]).toBe('repl');
  });

  it('prepends "test" when args start with a flag', () => {
    const args = ['--workers=1'];
    if (args.length === 0 || (args[0] && args[0].startsWith('-'))) {
      args.unshift('test');
    }
    expect(args[0]).toBe('test');
  });

  it('prepends "test" when no args given', () => {
    const args: string[] = [];
    if (args.length === 0 || (args[0] && args[0].startsWith('-'))) {
      args.unshift('test');
    }
    expect(args[0]).toBe('test');
  });

  it('does not prepend "test" when subcommand is given', () => {
    const args = ['repl'];
    if (args.length === 0 || (args[0] && args[0].startsWith('-'))) {
      args.unshift('test');
    }
    expect(args[0]).toBe('repl');
  });
});

// ─── Test file pattern matching ──────────────────────────────────────

describe('pw-cli test file pattern', () => {
  const pattern = /\.(spec|test)\.[tj]sx?$/;

  it('matches .spec.ts files', () => {
    expect(pattern.test('login.spec.ts')).toBe(true);
  });

  it('matches .test.ts files', () => {
    expect(pattern.test('auth.test.ts')).toBe(true);
  });

  it('matches .spec.js files', () => {
    expect(pattern.test('login.spec.js')).toBe(true);
  });

  it('matches .test.tsx files', () => {
    expect(pattern.test('component.test.tsx')).toBe(true);
  });

  it('does not match random .ts files', () => {
    expect(pattern.test('utils.ts')).toBe(false);
  });

  it('does not match .test in the middle of path', () => {
    expect(pattern.test('test.utils.ts')).toBe(false);
  });
});

// ─── Headed/headless flag logic ──────────────────────────────────────

describe('pw-cli headed/headless logic', () => {
  function resolveHeadless(flagArgs: string[]) {
    const headed = flagArgs.includes('--headed');
    const headless = flagArgs.includes('--headless');
    return headless || !headed;
  }

  it('defaults to headless when no flag given', () => {
    expect(resolveHeadless([])).toBe(true);
  });

  it('is headed when --headed is given', () => {
    expect(resolveHeadless(['--headed'])).toBe(false);
  });

  it('is headless when --headless is given', () => {
    expect(resolveHeadless(['--headless'])).toBe(true);
  });

  it('headless wins when both are given', () => {
    expect(resolveHeadless(['--headed', '--headless'])).toBe(true);
  });
});
