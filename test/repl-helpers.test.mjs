import { describe, it, expect } from 'vitest';
import { filterResponse, getGhostMatches } from '../src/repl.mjs';
import { c } from '../src/colors.mjs';
import {
  buildRunCode, actionByText,
  fillByText, selectByText, checkByText, uncheckByText,
} from '../src/page-scripts.mjs';

// ─── buildRunCode for text locator actions ──────────────────────────────────

describe('text locator buildRunCode output', () => {
  it('click includes findByText fallback chain', () => {
    const result = buildRunCode(actionByText, 'Submit', 'click');
    expect(result._[0]).toBe('run-code');
    expect(result._[1]).toContain('getByText(text, { exact: true })');
    expect(result._[1]).toContain("getByRole('button'");
    expect(result._[1]).toContain("getByRole('link'");
    expect(result._[1]).toContain('loc[action]()');
  });

  it('dblclick includes findByText fallback chain', () => {
    const result = buildRunCode(actionByText, 'Edit', 'dblclick');
    expect(result._[1]).toContain('getByText(text, { exact: true })');
    expect(result._[1]).toContain('loc[action]()');
  });

  it('hover includes findByText fallback chain', () => {
    const result = buildRunCode(actionByText, 'Menu', 'hover');
    expect(result._[1]).toContain('getByText(text, { exact: true })');
    expect(result._[1]).toContain('loc[action]()');
  });

  it('fill includes getByLabel with fallback chain', () => {
    const result = buildRunCode(fillByText, 'Email', 'test@example.com');
    expect(result._[1]).toContain('getByLabel(text)');
    expect(result._[1]).toContain('getByPlaceholder(text)');
    expect(result._[1]).toContain('loc.fill(value)');
  });

  it('select includes getByLabel with fallback chain', () => {
    const result = buildRunCode(selectByText, 'Country', 'US');
    expect(result._[1]).toContain('getByLabel(text)');
    expect(result._[1]).toContain("getByRole('combobox'");
    expect(result._[1]).toContain('loc.selectOption(value)');
  });

  it('check includes listitem fallback then getByLabel', () => {
    const result = buildRunCode(checkByText, 'Terms');
    expect(result._[1]).toContain("getByRole('listitem')");
    expect(result._[1]).toContain('getByLabel(text)');
    expect(result._[1]).toContain('loc.check()');
  });

  it('uncheck includes listitem fallback then getByLabel', () => {
    const result = buildRunCode(uncheckByText, 'Newsletter');
    expect(result._[1]).toContain("getByRole('listitem')");
    expect(result._[1]).toContain('getByLabel(text)');
    expect(result._[1]).toContain('loc.uncheck()');
  });

  it('escapes special characters via JSON.stringify', () => {
    const result = buildRunCode(actionByText, "Say 'hello'", 'click');
    expect(result._[1]).toContain("Say 'hello'");
  });

  it('escapes backslashes via JSON.stringify', () => {
    const result = buildRunCode(actionByText, 'path\\to\\file', 'click');
    expect(result._[1]).toContain('path\\\\to\\\\file');
  });

  it('escapes quotes in fill value via JSON.stringify', () => {
    const result = buildRunCode(fillByText, 'Name', "O'Brien");
    expect(result._[1]).toContain("O'Brien");
  });

  it('wraps code as arrow function for daemon', () => {
    const result = buildRunCode(actionByText, 'OK', 'click');
    expect(result._[1]).toMatch(/^async \(page\) =>/);
    expect(result._[1]).toContain('(page, "OK", "click")');
  });
});

// ─── filterResponse ─────────────────────────────────────────────────────────

describe('filterResponse', () => {
  it('extracts Result section', () => {
    const text = '### Page\nhttp://example.com\n### Result\nClicked element';
    expect(filterResponse(text)).toBe('Clicked element');
  });

  it('extracts Error section in red', () => {
    const text = '### Page\nhttp://example.com\n### Error\nElement not found';
    expect(filterResponse(text)).toBe(`${c.red}Element not found${c.reset}`);
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

// ─── getGhostMatches ─────────────────────────────────────────────────────────

describe('getGhostMatches', () => {
  const cmds = ['close', 'close-all', 'click', 'check', 'config-print'];

  it('returns longer matches for partial input', () => {
    expect(getGhostMatches(cmds, 'cl')).toEqual(['close', 'close-all', 'click']);
  });

  it('includes exact match when longer matches exist', () => {
    const matches = getGhostMatches(cmds, 'close');
    expect(matches).toContain('close-all');
    expect(matches).toContain('close');
  });

  it('returns empty when input is an exact match with no longer variants', () => {
    expect(getGhostMatches(cmds, 'click')).toEqual([]);
  });

  it('returns empty for empty input', () => {
    expect(getGhostMatches(cmds, '')).toEqual([]);
  });

  it('returns empty when input contains a space', () => {
    expect(getGhostMatches(cmds, 'close ')).toEqual([]);
  });

  it('returns empty when no commands match', () => {
    expect(getGhostMatches(cmds, 'xyz')).toEqual([]);
  });
});
