import { describe, it, expect } from "vitest";
import { filterResponse } from '@/lib/filter';

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

  it('includes Snapshot section for snapshot command', () => {
    const text = '### Page\nhttp://example.com\n### Snapshot\n- element tree\n### Result\nDone';
    expect(filterResponse(text, 'snapshot')).toBe('- element tree\nDone');
  });

  it('suppresses Snapshot section for non-snapshot commands', () => {
    const text = '### Page\nhttp://example.com\n### Snapshot\n- element tree\n### Result\nDone';
    expect(filterResponse(text, 'goto')).toBe('Done');
  });

  it('returns Snapshot content when no Result section', () => {
    const text = '### Page\nhttp://example.com\n### Snapshot\n- tree';
    expect(filterResponse(text, 'snapshot')).toBe('- tree');
  });

  it('returns raw text when no sections found', () => {
    expect(filterResponse('just plain text')).toBe('just plain text');
  });

  it('returns Done for empty text with no sections', () => {
    expect(filterResponse('')).toBe('Done');
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

   it('skip section with no new line', () => {
    const text = '### Result';
    expect(filterResponse(text)).toBe('Done');
  });
});