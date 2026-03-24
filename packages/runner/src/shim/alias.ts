/**
 * Thin alias for @playwright/test
 *
 * esbuild aliases '@playwright/test' to this file.
 * Re-exports test/expect from globalThis (installed by framework.ts).
 * This file is tiny — bundled per test but adds negligible size.
 */

const _g = globalThis as any;
export const test = _g.__test;
export const expect = _g.__expect;
