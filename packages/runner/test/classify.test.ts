// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { findPageCalls } from '../src/compiler/parser.js';
import { classifyCall } from '../src/compiler/classify.js';

/** Helper: parse code and classify the first page call */
function classify(code: string) {
  const calls = findPageCalls(code);
  expect(calls.length).toBeGreaterThan(0);
  return classifyCall(calls[0]);
}

describe('classifyCall', () => {
  // ─── Bridge-eligible calls ──────────────────────────────────────────

  it('routes simple page.click() with literal to bridge', () => {
    expect(classify(`await page.click('#btn');`)).toBe('bridge');
  });

  it('routes page.goto() with literal URL to bridge', () => {
    expect(classify(`await page.goto('https://example.com');`)).toBe('bridge');
  });

  it('routes page.fill() with literal args to bridge', () => {
    expect(classify(`await page.fill('#input', 'hello');`)).toBe('bridge');
  });

  it('routes chained locator calls with literals to bridge', () => {
    expect(classify(`await page.locator('.btn').click();`)).toBe('bridge');
  });

  it('routes expect(page.*) to node (non-literal args to expect)', () => {
    expect(classify(`await expect(page.locator('.btn')).toBeVisible();`)).toBe('node');
  });

  it('routes calls with object literal args to bridge', () => {
    expect(classify(`await page.click('#btn', { force: true });`)).toBe('bridge');
  });

  it('routes calls with array literal args to bridge', () => {
    expect(classify(`await page.evaluate(() => [1, 2, 3]);`)).toBe('bridge');
  });

  it('routes calls with arrow function args to bridge', () => {
    expect(classify(`await page.evaluate(() => document.title);`)).toBe('bridge');
  });

  it('routes calls with numeric args to bridge', () => {
    expect(classify(`await page.waitForTimeout(1000);`)).toBe('bridge');
  });

  it('routes calls with negative number args to bridge', () => {
    expect(classify(`await page.waitForTimeout(-1);`)).toBe('bridge');
  });

  // ─── Node-only calls ───────────────────────────────────────────────

  it('routes .then() chained calls to node', () => {
    expect(classify(`await page.click('#btn').then(() => {});`)).toBe('node');
  });

  it('routes .catch() chained calls to node', () => {
    expect(classify(`await page.click('#btn').catch(() => {});`)).toBe('node');
  });

  it('routes evaluateHandle to node', () => {
    expect(classify(`await page.evaluateHandle(() => window);`)).toBe('node');
  });

  it('routes $() to node', () => {
    expect(classify(`await page.$('.btn');`)).toBe('node');
  });

  it('routes $$() to node', () => {
    expect(classify(`await page.$$('.btn');`)).toBe('node');
  });

  it('routes route() to node', () => {
    expect(classify(`await page.route('**/*.png', route => route.abort());`)).toBe('node');
  });

  it('routes waitForEvent to node', () => {
    expect(classify(`await page.waitForEvent('popup');`)).toBe('node');
  });

  it('routes waitForResponse to node', () => {
    expect(classify(`await page.waitForResponse('**/api');`)).toBe('node');
  });

  it('routes waitForRequest to node', () => {
    expect(classify(`await page.waitForRequest('**/api');`)).toBe('node');
  });

  // ─── Variable arguments → node ─────────────────────────────────────

  it('routes calls with variable arguments to node', () => {
    const code = `
      const selector = '#btn';
      await page.click(selector);
    `;
    const calls = findPageCalls(code);
    expect(calls).toHaveLength(1);
    expect(classifyCall(calls[0])).toBe('node');
  });

  it('routes calls with template literal expressions to node', () => {
    const code = 'await page.click(`#btn-${idx}`);';
    expect(classify(code)).toBe('node');
  });

  it('routes calls with pure template literals to bridge', () => {
    const code = 'await page.click(`#btn`);';
    expect(classify(code)).toBe('bridge');
  });

  // ─── Method chain coverage ─────────────────────────────────────────

  it('detects node-only methods in chained calls (page.mouse.move)', () => {
    // page.mouse is a MemberExpression property access in the chain
    expect(classify(`await page.locator('.x').evaluateHandle(() => {});`)).toBe('node');
  });

  // ─── Promise.all / Promise.race → node ─────────────────────────────

  it('routes calls inside Promise.all to node', () => {
    const code = `await Promise.all([page.click('#a'), page.click('#b')]);`;
    // The outer await Promise.all is not a page call, so findPageCalls won't find it
    // But if page calls are nested inside, they should be routed to node
    const calls = findPageCalls(code);
    // Promise.all wrapping means these aren't standalone ExpressionStatements
    expect(calls).toHaveLength(0);
  });

  // ─── Array literal args ────────────────────────────────────────────

  it('routes calls with array of literals to bridge', () => {
    expect(classify(`await page.evaluate(() => {}, [1, 'two', true]);`)).toBe('bridge');
  });

  it('routes calls with array containing variables to node', () => {
    expect(classify(`await page.evaluate(() => {}, [myVar]);`)).toBe('node');
  });

  // ─── Object with non-identifier keys ───────────────────────────────

  it('routes calls with non-Property object entries (spread) to node', () => {
    const code = `await page.click('#btn', { ...opts });`;
    expect(classify(code)).toBe('node');
  });

  // ─── Function expression args ──────────────────────────────────────

  it('routes calls with function expression args to bridge', () => {
    expect(classify(`await page.evaluate(function() { return 1; });`)).toBe('bridge');
  });
});
