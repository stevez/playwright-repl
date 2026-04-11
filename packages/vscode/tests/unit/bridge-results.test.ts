import { describe, it, expect } from 'vitest';

// Import bridge-utils directly (CJS module)
const bridgeUtils = require('@playwright-repl/runner/dist/bridge-utils.cjs') as {
  parseAllResults: (text: string) => { status: string; duration: number; errors: { message: string }[] }[];
  findResultByName: (lines: string[], testName: string) => { status: string; duration: number; errors: { message: string }[] };
};

describe('parseAllResults', () => {
  it('should parse passed, failed, and skipped tests', () => {
    const output = [
      '  ✓ should add todo (12ms)',
      '  ✗ should delete todo (5ms)',
      '    Expected true, got false',
      '  - should edit todo (skipped)',
    ].join('\n');

    const results = bridgeUtils.parseAllResults(output);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({ status: 'passed', duration: 12, errors: [] });
    expect(results[1]).toEqual({ status: 'failed', duration: 5, errors: [{ message: 'Expected true, got false' }] });
    expect(results[2]).toEqual({ status: 'skipped', duration: 0, errors: [] });
  });

  it('should return empty array for no results', () => {
    const results = bridgeUtils.parseAllResults('some random output\nno tests here');
    expect(results).toEqual([]);
  });
});

describe('findResultByName', () => {
  const output = [
    '  - should add todo (skipped)',
    '  ✓ should delete todo (8ms)',
    '  - should edit todo (skipped)',
  ];

  it('should find passed test by name', () => {
    const result = bridgeUtils.findResultByName(output, 'should delete todo');
    expect(result.status).toBe('passed');
    expect(result.duration).toBe(8);
  });

  it('should find skipped test by name', () => {
    const result = bridgeUtils.findResultByName(output, 'should add todo');
    expect(result.status).toBe('skipped');
  });

  it('should return failed for unknown test name', () => {
    const result = bridgeUtils.findResultByName(output, 'nonexistent test');
    expect(result.status).toBe('failed');
    expect(result.errors[0].message).toContain('not found');
  });

  it('should not confuse index with name — the bug scenario', () => {
    // Bug: when clicking "should delete todo" (the 2nd test), index-based
    // mapping returns results[0] which is "should add todo (skipped)".
    // Name-based mapping correctly returns the passed result.

    const allResults = bridgeUtils.parseAllResults(output.join('\n'));

    // Index-based (WRONG): testItems[0] maps to results[0] = skipped
    expect(allResults[0].status).toBe('skipped'); // this is the bug

    // Name-based (CORRECT): find by name returns passed
    const result = bridgeUtils.findResultByName(output, 'should delete todo');
    expect(result.status).toBe('passed');
  });
});
