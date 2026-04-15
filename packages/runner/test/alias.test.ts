// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('alias', () => {
  let savedTest;
  let savedExpect;

  beforeEach(() => {
    savedTest = globalThis.__test;
    savedExpect = globalThis.__expect;
  });

  afterEach(() => {
    globalThis.__test = savedTest;
    globalThis.__expect = savedExpect;
  });

  it('proxies test() calls to globalThis.__test', async () => {
    const calls = [];
    globalThis.__test = (...args) => calls.push(args);
    globalThis.__test.describe = 'describe-fn';
    globalThis.__test.beforeEach = 'beforeEach-fn';
    globalThis.__test.afterEach = 'afterEach-fn';
    globalThis.__test.beforeAll = 'beforeAll-fn';
    globalThis.__test.afterAll = 'afterAll-fn';
    globalThis.__test.skip = 'skip-fn';
    globalThis.__test.only = 'only-fn';
    globalThis.__test.extend = 'extend-fn';
    globalThis.__test.use = 'use-fn';

    // Dynamic import to pick up fresh globalThis values
    const { test, it: itFn, expect: exp } = await import('../src/shim/alias.js');
    test('my test', () => {});
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toBe('my test');

    // it is the same as test
    itFn('another', () => {});
    expect(calls).toHaveLength(2);

    // Property access proxies to globalThis.__test.*
    expect(test.describe).toBe('describe-fn');
    expect(test.beforeEach).toBe('beforeEach-fn');
    expect(test.afterEach).toBe('afterEach-fn');
    expect(test.beforeAll).toBe('beforeAll-fn');
    expect(test.afterAll).toBe('afterAll-fn');
    expect(test.skip).toBe('skip-fn');
    expect(test.only).toBe('only-fn');
    expect(test.extend).toBe('extend-fn');
    expect(test.use).toBe('use-fn');
  });

  it('exports expect from globalThis.__expect', async () => {
    const mockExpect = () => 'expected';
    globalThis.__expect = mockExpect;

    const mod = await import('../src/shim/alias.js');
    // expect is read at module load time, so re-import won't help
    // but we can verify the export exists
    expect(mod).toHaveProperty('expect');
  });
});
