// @ts-nocheck
import { describe, it, expect, beforeEach } from 'vitest';

// Set up globalThis before importing the shim
const mockPage = { goto: async () => {}, click: async () => {} };
const mockContext = {};
const mockExpect = (val) => ({
  toBe: (expected) => { if (val !== expected) throw new Error(`Expected ${expected} but got ${val}`); },
});
globalThis.page = mockPage;
globalThis.context = mockContext;
globalThis.expect = mockExpect;

// Now import — module reads globalThis.page/context/expect at load time
const { test: testFn } = await import('../src/shim/test-runner.js');

describe('test-runner shim', () => {
  beforeEach(() => {
    globalThis.__resetTestState();
  });

  // ─── Registration ───────────────────────────────────────────────────

  it('registers and runs a passing test', async () => {
    testFn('passes', async () => {});
    const output = await globalThis.__runTests();
    expect(output).toContain('✓ passes');
    expect(output).toContain('1 passed, 0 failed, 0 skipped');
  });

  it('registers and runs a failing test', async () => {
    testFn('fails', async () => { throw new Error('boom'); });
    const output = await globalThis.__runTests();
    expect(output).toContain('✗ fails');
    expect(output).toContain('boom');
    expect(output).toContain('0 passed, 1 failed, 0 skipped');
  });

  it('handles test.skip', async () => {
    testFn.skip('skipped test', async () => {});
    const output = await globalThis.__runTests();
    expect(output).toContain('skipped test (skipped)');
    expect(output).toContain('0 passed, 0 failed, 1 skipped');
  });

  it('handles test.only — runs only marked tests', async () => {
    testFn('regular', async () => {});
    testFn.only('focused', async () => {});
    const output = await globalThis.__runTests();
    expect(output).toContain('✓ focused');
    // The regular test should be skipped
    expect(output).toContain('regular (skipped)');
    expect(output).toContain('1 passed, 0 failed, 1 skipped');
  });

  // ─── Describe blocks ───────────────────────────────────────────────

  it('supports test.describe for grouping', async () => {
    testFn.describe('suite', () => {
      testFn('inner test', async () => {});
    });
    const output = await globalThis.__runTests();
    expect(output).toContain('✓ suite > inner test');
  });

  it('supports nested describe blocks', async () => {
    testFn.describe('outer', () => {
      testFn.describe('inner', () => {
        testFn('deep test', async () => {});
      });
    });
    const output = await globalThis.__runTests();
    expect(output).toContain('✓ outer > inner > deep test');
  });

  // ─── Hooks ──────────────────────────────────────────────────────────

  it('runs beforeAll and afterAll hooks', async () => {
    const order = [];
    testFn.beforeAll(async () => { order.push('beforeAll'); });
    testFn.afterAll(async () => { order.push('afterAll'); });
    testFn('test', async () => { order.push('test'); });
    await globalThis.__runTests();
    expect(order).toEqual(['beforeAll', 'test', 'afterAll']);
  });

  it('runs beforeEach and afterEach around each test', async () => {
    const order = [];
    testFn.beforeEach(async () => { order.push('beforeEach'); });
    testFn.afterEach(async () => { order.push('afterEach'); });
    testFn('test1', async () => { order.push('test1'); });
    testFn('test2', async () => { order.push('test2'); });
    await globalThis.__runTests();
    expect(order).toEqual([
      'beforeEach', 'test1', 'afterEach',
      'beforeEach', 'test2', 'afterEach',
    ]);
  });

  it('inherits parent beforeEach/afterEach in child suites', async () => {
    const order = [];
    testFn.beforeEach(async () => { order.push('parentBefore'); });
    testFn.afterEach(async () => { order.push('parentAfter'); });
    testFn.describe('child', () => {
      testFn.beforeEach(async () => { order.push('childBefore'); });
      testFn.afterEach(async () => { order.push('childAfter'); });
      testFn('test', async () => { order.push('test'); });
    });
    await globalThis.__runTests();
    // Parent beforeEach runs first, then child beforeEach
    // Child afterEach runs first, then parent afterEach
    expect(order).toEqual([
      'parentBefore', 'childBefore', 'test', 'childAfter', 'parentAfter',
    ]);
  });

  // ─── Multiple tests ────────────────────────────────────────────────

  it('runs multiple tests and reports totals', async () => {
    testFn('pass1', async () => {});
    testFn('pass2', async () => {});
    testFn('fail1', async () => { throw new Error('oops'); });
    const output = await globalThis.__runTests();
    expect(output).toContain('2 passed, 1 failed, 0 skipped');
  });

  // ─── Reset state ───────────────────────────────────────────────────

  it('__resetTestState clears all registered tests', async () => {
    testFn('leftover', async () => {});
    globalThis.__resetTestState();
    const output = await globalThis.__runTests();
    expect(output).toContain('0 passed, 0 failed, 0 skipped');
  });

  // ─── Fixtures ───────────────────────────────────────────────────────

  it('test.extend provides custom fixtures', async () => {
    let receivedTodo;
    const myTest = testFn.extend({
      todoItem: async ({}, use) => {
        await use('buy milk');
      },
    });
    myTest('uses fixture', async ({ todoItem }) => {
      receivedTodo = todoItem;
    });
    await globalThis.__runTests();
    expect(receivedTodo).toBe('buy milk');
  });
});
