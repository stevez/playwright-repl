import { describe, it, expect } from 'vitest';
import { detectMode, resolveConsoleMode } from '@/lib/execute';

describe('detectMode', () => {

    // ─── PW commands ──────────────────────────────────────────────────────────

    it('returns pw for known command names', () => {
        expect(detectMode('click e5')).toBe('pw');
        expect(detectMode('goto https://example.com')).toBe('pw');
        expect(detectMode('snapshot')).toBe('pw');
        expect(detectMode('fill e1 hello')).toBe('pw');
        expect(detectMode('verify-text Hello')).toBe('pw');
        expect(detectMode('reload')).toBe('pw');
        expect(detectMode('screenshot')).toBe('pw');
    });

    // ─── Everything else is JS ─────────────────────────────────────────────

    it('returns js for anything that is not a known pw command', () => {
        expect(detectMode('true')).toBe('js');
        expect(detectMode('document')).toBe('js');
        expect(detectMode('window')).toBe('js');
        expect(detectMode('typeof page')).toBe('js');
        expect(detectMode('void 0')).toBe('js');
        expect(detectMode('new Date()')).toBe('js');
        expect(detectMode('await page.title()')).toBe('js');
        expect(detectMode('page')).toBe('js');
        expect(detectMode('page.title()')).toBe('js');
        expect(detectMode('context')).toBe('js');
        expect(detectMode('expect')).toBe('js');
        expect(detectMode('crxApp')).toBe('js');
        expect(detectMode('activeTabId')).toBe('js');
        expect(detectMode('Object.keys(page)')).toBe('js');
        expect(detectMode('document.title')).toBe('js');
        expect(detectMode('1 + 1')).toBe('js');
        expect(detectMode('a = [1, 2, 3]')).toBe('js');
        expect(detectMode('let n = 42')).toBe('js');
        expect(detectMode('fetch("https://api.example.com")')).toBe('js');
        expect(detectMode('`hello`')).toBe('js');
        expect(detectMode('"hello"')).toBe('js');
    });

});

describe('resolveConsoleMode', () => {

    it('returns js for multi-line input', () => {
        expect(resolveConsoleMode('const el = await page.$(\'a\');\nawait el._generateLocatorString()')).toBe('js');
    });

    it('returns js for multi-line input even without playwright globals', () => {
        expect(resolveConsoleMode('const x = 1;\nconsole.log(x)')).toBe('js');
    });

    it('delegates to detectMode for single-line input', () => {
        expect(resolveConsoleMode('page.title()')).toBe('js');
        expect(resolveConsoleMode('click e5')).toBe('pw');
        expect(resolveConsoleMode('document.title')).toBe('js');
    });
});
