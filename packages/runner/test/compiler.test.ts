// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { compileWithRouting } from '../src/compiler/index.js';

describe('compileWithRouting', () => {
  // ─── All bridge ─────────────────────────────────────────────────────

  it('transforms all bridge-eligible calls', () => {
    const code = `await page.click('#btn');\nawait page.fill('#input', 'text');`;
    const result = compileWithRouting(code);
    expect(result.bridgeCallCount).toBe(2);
    expect(result.nodeCallCount).toBe(0);
    expect(result.code).toContain('__bridge(');
  });

  // ─── All node ───────────────────────────────────────────────────────

  it('returns unchanged code when all calls are node-only', () => {
    const code = `const el = '#btn';\nawait page.click(el);`;
    const result = compileWithRouting(code);
    expect(result.bridgeCallCount).toBe(0);
    expect(result.nodeCallCount).toBe(1);
    expect(result.code).toBe(code);
  });

  // ─── Mixed ──────────────────────────────────────────────────────────

  it('handles mixed bridge and node calls', () => {
    const code = `await page.click('#btn');\nconst sel = '.x';\nawait page.click(sel);`;
    const result = compileWithRouting(code);
    expect(result.bridgeCallCount).toBe(1);
    expect(result.nodeCallCount).toBe(1);
    expect(result.code).toContain('__bridge(');
    // The node call should remain unchanged
    expect(result.code).toContain('await page.click(sel)');
  });

  // ─── No page calls ─────────────────────────────────────────────────

  it('returns unchanged code when there are no page calls', () => {
    const code = `console.log('hello');\nconst x = 1 + 2;`;
    const result = compileWithRouting(code);
    expect(result.bridgeCallCount).toBe(0);
    expect(result.nodeCallCount).toBe(0);
    expect(result.code).toBe(code);
  });

  // ─── Expect calls ──────────────────────────────────────────────────

  it('routes expect(page.*) calls to node (non-literal args)', () => {
    const code = `await expect(page.locator('.btn')).toBeVisible();`;
    const result = compileWithRouting(code);
    expect(result.bridgeCallCount).toBe(0);
    expect(result.nodeCallCount).toBe(1);
    expect(result.code).toBe(code);
  });

  // ─── Complex scenarios ─────────────────────────────────────────────

  it('handles a realistic test with mixed code', () => {
    const code = `
      await page.goto('https://example.com');
      await page.click('#login');
      await page.fill('#user', 'admin');
      await page.fill('#pass', 'secret');
      await page.click('#submit');
      await expect(page.locator('.welcome')).toBeVisible();
    `;
    const result = compileWithRouting(code);
    // 5 page.* calls go to bridge, expect() goes to node (non-literal args)
    expect(result.bridgeCallCount).toBe(5);
    expect(result.nodeCallCount).toBe(1);
  });
});
