/**
 * Tests for deriveAssertion() — pure function that maps element info to assertions.
 */

import { describe, it, expect } from 'vitest';
import { deriveAssertion, type ElementInfo } from '../src/picker';

describe('deriveAssertion', () => {
  const locator = "page.getByRole('button')";

  it('checkbox checked → toBeChecked()', () => {
    const info: ElementInfo = { tag: 'INPUT', attributes: { type: 'checkbox' }, checked: true };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toBeChecked();`);
  });

  it('checkbox unchecked → not.toBeChecked()', () => {
    const info: ElementInfo = { tag: 'INPUT', attributes: { type: 'checkbox' }, checked: false };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).not.toBeChecked();`);
  });

  it('radio checked → toBeChecked()', () => {
    const info: ElementInfo = { tag: 'INPUT', attributes: { type: 'radio' }, checked: true };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toBeChecked();`);
  });

  it('input with value → toHaveValue()', () => {
    const info: ElementInfo = { tag: 'INPUT', attributes: { type: 'text' }, value: 'hello' };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toHaveValue('hello');`);
  });

  it('textarea with value → toHaveValue()', () => {
    const info: ElementInfo = { tag: 'TEXTAREA', value: 'some text' };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toHaveValue('some text');`);
  });

  it('select with value → toHaveValue()', () => {
    const info: ElementInfo = { tag: 'SELECT', value: 'option1' };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toHaveValue('option1');`);
  });

  it('element with text → toContainText()', () => {
    const info: ElementInfo = { tag: 'DIV', text: 'Hello World' };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toContainText('Hello World');`);
  });

  it('getByText locator with text → skips redundant text assertion → toBeVisible()', () => {
    const info: ElementInfo = { tag: 'SPAN', text: 'Hello' };
    const loc = "page.getByText('Hello')";
    expect(deriveAssertion(info, loc)).toBe(`await expect(${loc}).toBeVisible();`);
  });

  it('long text → truncated to 80 chars', () => {
    const longText = 'A'.repeat(100);
    const info: ElementInfo = { tag: 'P', text: longText };
    const result = deriveAssertion(info, locator);
    expect(result).toContain('A'.repeat(80));
    expect(result).not.toContain('A'.repeat(81));
  });

  it('text with single quotes → escaped', () => {
    const info: ElementInfo = { tag: 'DIV', text: "it's a test" };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toContainText('it\\'s a test');`);
  });

  it('fallback (no text, no value) → toBeVisible()', () => {
    const info: ElementInfo = { tag: 'DIV' };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toBeVisible();`);
  });

  it('empty element info → toBeVisible()', () => {
    const info: ElementInfo = {};
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toBeVisible();`);
  });

  it('input with empty value → toHaveValue()', () => {
    const info: ElementInfo = { tag: 'INPUT', value: '' };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toHaveValue('');`);
  });

  it('value with single quotes → escaped', () => {
    const info: ElementInfo = { tag: 'INPUT', value: "it's" };
    expect(deriveAssertion(info, locator)).toBe(`await expect(${locator}).toHaveValue('it\\'s');`);
  });
});
