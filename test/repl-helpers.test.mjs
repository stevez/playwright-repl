import { describe, it, expect } from 'vitest';
import { textToRunCode, filterResponse } from '../src/repl.mjs';

// ─── textToRunCode ──────────────────────────────────────────────────────────

describe('textToRunCode', () => {
  it('click generates fallback chain with getByText exact, role, then getByText', () => {
    const result = textToRunCode('click', 'Submit', []);
    expect(result._[0]).toBe('run-code');
    expect(result._[1]).toContain("page.getByText('Submit', { exact: true })");
    expect(result._[1]).toContain("page.getByRole('button', { name: 'Submit' })");
    expect(result._[1]).toContain("page.getByRole('link', { name: 'Submit' })");
    expect(result._[1]).toContain("loc.click()");
  });

  it('dblclick generates fallback chain with getByText exact, role, then getByText', () => {
    const result = textToRunCode('dblclick', 'Edit', []);
    expect(result._[1]).toContain("page.getByText('Edit', { exact: true })");
    expect(result._[1]).toContain("page.getByRole('button', { name: 'Edit' })");
    expect(result._[1]).toContain("loc.dblclick()");
  });

  it('hover generates fallback chain with getByText exact, role, then getByText', () => {
    const result = textToRunCode('hover', 'Menu', []);
    expect(result._[1]).toContain("page.getByText('Menu', { exact: true })");
    expect(result._[1]).toContain("page.getByRole('button', { name: 'Menu' })");
    expect(result._[1]).toContain("loc.hover()");
  });

  it('fill generates getByLabel with fallback chain', () => {
    const result = textToRunCode('fill', 'Email', ['test@example.com']);
    expect(result._[1]).toContain("page.getByLabel('Email')");
    expect(result._[1]).toContain("page.getByPlaceholder('Email')");
    expect(result._[1]).toContain("loc.fill('test@example.com')");
  });

  it('select generates getByLabel with fallback chain', () => {
    const result = textToRunCode('select', 'Country', ['US']);
    expect(result._[1]).toContain("page.getByLabel('Country')");
    expect(result._[1]).toContain("loc.selectOption('US')");
  });

  it('check generates listitem fallback then getByLabel', () => {
    const result = textToRunCode('check', 'Terms', []);
    expect(result._[1]).toContain("page.getByRole('listitem').filter({ hasText: 'Terms' })");
    expect(result._[1]).toContain("page.getByLabel('Terms')");
  });

  it('uncheck generates listitem fallback then getByLabel', () => {
    const result = textToRunCode('uncheck', 'Newsletter', []);
    expect(result._[1]).toContain("page.getByRole('listitem').filter({ hasText: 'Newsletter' })");
    expect(result._[1]).toContain("page.getByLabel('Newsletter')");
  });

  it('escapes single quotes in text arg', () => {
    const result = textToRunCode('click', "Say 'hello'", []);
    expect(result._[1]).toContain("Say \\'hello\\'");
  });

  it('escapes backslashes in text arg', () => {
    const result = textToRunCode('click', 'path\\to\\file', []);
    expect(result._[1]).toContain("path\\\\to\\\\file");
  });

  it('escapes single quotes in fill value', () => {
    const result = textToRunCode('fill', 'Name', ["O'Brien"]);
    expect(result._[1]).toContain("O\\'Brien");
  });

  it('returns null for unknown command', () => {
    expect(textToRunCode('snapshot', 'test', [])).toBeNull();
    expect(textToRunCode('press', 'Enter', [])).toBeNull();
  });

  it('wraps code in async function', () => {
    const result = textToRunCode('click', 'OK', []);
    expect(result._[1]).toMatch(/^async \(page\) => \{[\s\S]*\}$/);
  });

  it('fill with empty value', () => {
    const result = textToRunCode('fill', 'Name', []);
    expect(result._[1]).toContain("loc.fill('')");
  });
});

// ─── filterResponse ─────────────────────────────────────────────────────────

describe('filterResponse', () => {
  it('extracts Result section', () => {
    const text = '### Page\nhttp://example.com\n### Result\nClicked element';
    expect(filterResponse(text)).toBe('Clicked element');
  });

  it('extracts Error section', () => {
    const text = '### Page\nhttp://example.com\n### Error\nElement not found';
    expect(filterResponse(text)).toBe('Element not found');
  });

  it('extracts Modal state section', () => {
    const text = '### Modal state\n[Alert] Are you sure?';
    expect(filterResponse(text)).toBe('[Alert] Are you sure?');
  });

  it('strips Page and Snapshot sections', () => {
    const text = '### Page\nhttp://example.com\n### Snapshot\n- element tree\n### Result\nDone';
    expect(filterResponse(text)).toBe('Done');
  });

  it('returns null when no matching sections', () => {
    const text = '### Page\nhttp://example.com\n### Snapshot\n- tree';
    expect(filterResponse(text)).toBeNull();
  });

  it('returns null for text with no sections', () => {
    expect(filterResponse('just plain text')).toBeNull();
  });

  it('joins multiple kept sections with newline', () => {
    const text = '### Result\nClicked\n### Modal state\n[Alert] Sure?';
    expect(filterResponse(text)).toBe('Clicked\n[Alert] Sure?');
  });

  it('handles multiline section content', () => {
    const text = '### Result\nLine 1\nLine 2\nLine 3';
    expect(filterResponse(text)).toBe('Line 1\nLine 2\nLine 3');
  });

  it('strips Ran Playwright code section', () => {
    const text = '### Ran Playwright code\nasync (page) => {...}\n### Result\nOK';
    expect(filterResponse(text)).toBe('OK');
  });
});
