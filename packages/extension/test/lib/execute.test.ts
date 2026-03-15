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

    it('returns pw for plain word expressions (heuristic)', () => {
        expect(detectMode('true')).toBe('pw');
        expect(detectMode('void 0')).toBe('pw');
    });

    // ─── JS (service worker) context ───────────────────────────────────────

    it('returns js for page expressions', () => {
        expect(detectMode('page')).toBe('js');
        expect(detectMode('page.title()')).toBe('js');
        expect(detectMode('page.url()')).toBe('js');
        expect(detectMode('page[0]')).toBe('js');
        expect(detectMode('await page.goto("https://example.com")')).toBe('js');
    });

    it('returns js for context expressions', () => {
        expect(detectMode('context')).toBe('js');
        expect(detectMode('context.cookies()')).toBe('js');
        expect(detectMode('await context.clearCookies()')).toBe('js');
    });

    it('returns js for expect expressions', () => {
        expect(detectMode('expect')).toBe('js');
        expect(detectMode('expect(page).toBeTruthy()')).toBe('js');
        expect(detectMode('await expect(locator).toBeVisible()')).toBe('js');
    });

    it('returns js for crxApp and activeTabId', () => {
        expect(detectMode('crxApp')).toBe('js');
        expect(detectMode('crxApp.context()')).toBe('js');
        expect(detectMode('activeTabId')).toBe('js');
    });

    // ─── JS (fallback) — everything else evaluates in SW context ──────────

    it('returns js for document and window (evaluated via page.evaluate)', () => {
        expect(detectMode('document.title')).toBe('js');
        expect(detectMode('window.location.href')).toBe('js');
        expect(detectMode('JSON.stringify({})')).toBe('js');
    });

    it('returns js for numeric and parenthesized expressions', () => {
        expect(detectMode('1 + 1')).toBe('js');
        expect(detectMode('6')).toBe('js');
        expect(detectMode('({})')).toBe('js');
    });

    it('returns js for assignment expressions', () => {
        expect(detectMode('a = [1, 2, 3]')).toBe('js');
        expect(detectMode('x = {}')).toBe('js');
        expect(detectMode('let n = 42')).toBe('js');
    });

    it('returns js for function calls', () => {
        expect(detectMode('invalid()')).toBe('js');
        expect(detectMode('fetch("https://api.example.com")')).toBe('js');
        expect(detectMode('await fetch("https://api.example.com")')).toBe('js');
    });

    it('returns js for template literals and string operations', () => {
        expect(detectMode('`hello`')).toBe('js');
        expect(detectMode('"hello"')).toBe('js');
    });

    it('returns pw for bare document/window (treated as unknown commands)', () => {
        expect(detectMode('document')).toBe('pw');
        expect(detectMode('window')).toBe('pw');
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
