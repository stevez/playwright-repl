// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { findPageCalls } from '../src/compiler/parser.js';

describe('findPageCalls', () => {
  // ─── Basic page calls ───────────────────────────────────────────────

  it('finds a simple page.click() call', () => {
    const calls = findPageCalls(`await page.click('#btn');`);
    expect(calls).toHaveLength(1);
    expect(calls[0].start).toBe(0);
  });

  it('finds page.goto()', () => {
    const calls = findPageCalls(`await page.goto('https://example.com');`);
    expect(calls).toHaveLength(1);
  });

  it('finds chained page calls like page.locator().click()', () => {
    const calls = findPageCalls(`await page.locator('.btn').click();`);
    expect(calls).toHaveLength(1);
  });

  it('finds multiple page calls', () => {
    const code = `
      await page.goto('https://example.com');
      await page.click('#btn');
      await page.fill('#input', 'hello');
    `;
    const calls = findPageCalls(code);
    expect(calls).toHaveLength(3);
  });

  // ─── expect(page.*) calls ──────────────────────────────────────────

  it('finds expect(page.locator()).toBeVisible()', () => {
    const calls = findPageCalls(`await expect(page.locator('.btn')).toBeVisible();`);
    expect(calls).toHaveLength(1);
  });

  it('does not find expect(page.*).not.toBeVisible() (chained .not unsupported)', () => {
    const calls = findPageCalls(`await expect(page.locator('.btn')).not.toBeVisible();`);
    expect(calls).toHaveLength(0);
  });

  // ─── Non-page calls (should be ignored) ────────────────────────────

  it('ignores non-page await expressions', () => {
    const calls = findPageCalls(`await fetch('https://example.com');`);
    expect(calls).toHaveLength(0);
  });

  it('ignores variable assignments with page calls', () => {
    // This is a VariableDeclaration, not an ExpressionStatement
    const calls = findPageCalls(`const text = await page.textContent('.el');`);
    expect(calls).toHaveLength(0);
  });

  it('ignores non-await page calls', () => {
    // Without await, expression type is not AwaitExpression
    const calls = findPageCalls(`page.click('#btn');`);
    expect(calls).toHaveLength(0);
  });

  it('ignores expect() calls without page argument', () => {
    const calls = findPageCalls(`await expect(someVar).toBe(true);`);
    expect(calls).toHaveLength(0);
  });

  // ─── Position tracking ─────────────────────────────────────────────

  it('tracks correct start/end positions', () => {
    const code = `await page.click('#btn');`;
    const calls = findPageCalls(code);
    expect(calls[0].start).toBe(0);
    expect(calls[0].end).toBe(code.length);
  });

  it('preserves ancestor chain', () => {
    const calls = findPageCalls(`await page.click('#btn');`);
    expect(calls[0].ancestors).toBeDefined();
    expect(calls[0].ancestors.length).toBeGreaterThan(0);
  });

  // ─── Mixed code ────────────────────────────────────────────────────

  it('finds page calls mixed with other code', () => {
    const code = `
      const url = 'https://example.com';
      await page.goto(url);
      console.log('navigated');
      await page.click('#btn');
      const result = await page.textContent('.el');
    `;
    // goto and click are ExpressionStatements with await
    // textContent is a VariableDeclaration — not found
    const calls = findPageCalls(code);
    expect(calls).toHaveLength(2);
  });
});
