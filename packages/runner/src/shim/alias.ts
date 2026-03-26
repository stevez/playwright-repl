/**
 * Thin alias for @playwright/test
 *
 * esbuild aliases '@playwright/test' to this file.
 * Re-exports test/expect from globalThis (installed by framework.ts).
 * This file is tiny — bundled per test but adds negligible size.
 */

const _g = globalThis as any;

// Dynamic lookup — reads globalThis.__test at call time, not import time.
// This ensures test() inside describe uses the wrapped version.
function _test(...args: any[]) { return _g.__test(...args); }
Object.defineProperty(_test, 'describe', { get: () => _g.__test?.describe });
Object.defineProperty(_test, 'beforeEach', { get: () => _g.__test?.beforeEach });
Object.defineProperty(_test, 'afterEach', { get: () => _g.__test?.afterEach });
Object.defineProperty(_test, 'beforeAll', { get: () => _g.__test?.beforeAll });
Object.defineProperty(_test, 'afterAll', { get: () => _g.__test?.afterAll });
Object.defineProperty(_test, 'skip', { get: () => _g.__test?.skip });
Object.defineProperty(_test, 'only', { get: () => _g.__test?.only });
Object.defineProperty(_test, 'extend', { get: () => _g.__test?.extend });
Object.defineProperty(_test, 'use', { get: () => _g.__test?.use });

export const test = _test as any;
export const it = _test as any;
export const expect = _g.__expect;
