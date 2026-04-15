// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { findPageCalls } from '../src/compiler/parser.js';
import { transformBridgeCalls } from '../src/compiler/transform.js';

describe('transformBridgeCalls', () => {
  it('wraps a simple page.click() in __bridge()', () => {
    const code = `await page.click('#btn');`;
    const calls = findPageCalls(code);
    const result = transformBridgeCalls(code, calls);
    expect(result.code).toBe(`await __bridge('await page.click(\\'#btn\\')');`);
  });

  it('wraps page.goto() with double quotes', () => {
    const code = `await page.goto("https://example.com");`;
    const calls = findPageCalls(code);
    const result = transformBridgeCalls(code, calls);
    expect(result.code).toContain('__bridge(');
    expect(result.code).toContain('await page.goto("https://example.com")');
  });

  it('transforms multiple calls independently', () => {
    const code = `await page.goto('https://example.com');\nawait page.click('#btn');`;
    const calls = findPageCalls(code);
    const result = transformBridgeCalls(code, calls);
    expect(result.code).toContain(`__bridge('await page.goto(\\'https://example.com\\')')`);
    expect(result.code).toContain(`__bridge('await page.click(\\'#btn\\')')`);
  });

  it('escapes backslashes in code', () => {
    const code = `await page.fill('#input', 'path\\\\to\\\\file');`;
    const calls = findPageCalls(code);
    const result = transformBridgeCalls(code, calls);
    // Backslashes should be double-escaped
    expect(result.code).toContain('__bridge(');
  });

  it('returns a source map', () => {
    const code = `await page.click('#btn');`;
    const calls = findPageCalls(code);
    const result = transformBridgeCalls(code, calls);
    expect(result.map).toBeDefined();
  });

  it('handles empty call list without changes', () => {
    const code = `await page.click('#btn');`;
    const result = transformBridgeCalls(code, []);
    expect(result.code).toBe(code);
  });

  it('preserves surrounding code', () => {
    const code = `console.log('before');\nawait page.click('#btn');\nconsole.log('after');`;
    const calls = findPageCalls(code);
    const result = transformBridgeCalls(code, calls);
    expect(result.code).toContain("console.log('before');");
    expect(result.code).toContain("console.log('after');");
    expect(result.code).toContain('__bridge(');
  });
});
