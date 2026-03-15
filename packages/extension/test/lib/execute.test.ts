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

    // ─── Playwright (service worker) context ─────────────────────────────────

    it('returns playwright for page expressions', () => {
        expect(detectMode('page')).toBe('playwright');
        expect(detectMode('page.title()')).toBe('playwright');
        expect(detectMode('page.url()')).toBe('playwright');
        expect(detectMode('page[0]')).toBe('playwright');
        expect(detectMode('await page.goto("https://example.com")')).toBe('playwright');
    });

    it('returns playwright for context expressions', () => {
        expect(detectMode('context')).toBe('playwright');
        expect(detectMode('context.cookies()')).toBe('playwright');
        expect(detectMode('await context.clearCookies()')).toBe('playwright');
    });

    it('returns playwright for expect expressions', () => {
        expect(detectMode('expect')).toBe('playwright');
        expect(detectMode('expect(page).toBeTruthy()')).toBe('playwright');
        expect(detectMode('await expect(locator).toBeVisible()')).toBe('playwright');
    });

    it('returns playwright for crxApp and activeTabId', () => {
        expect(detectMode('crxApp')).toBe('playwright');
        expect(detectMode('crxApp.context()')).toBe('playwright');
        expect(detectMode('activeTabId')).toBe('playwright');
    });

    // ─── Playwright (fallback) — everything else evaluates in SW context ─────

    it('returns playwright for document and window (evaluated via page.evaluate)', () => {
        expect(detectMode('document.title')).toBe('playwright');
        expect(detectMode('window.location.href')).toBe('playwright');
        expect(detectMode('JSON.stringify({})')).toBe('playwright');
    });

    it('returns playwright for numeric and parenthesized expressions', () => {
        expect(detectMode('1 + 1')).toBe('playwright');
        expect(detectMode('6')).toBe('playwright');
        expect(detectMode('({})')).toBe('playwright');
    });

    it('returns playwright for assignment expressions', () => {
        expect(detectMode('a = [1, 2, 3]')).toBe('playwright');
        expect(detectMode('x = {}')).toBe('playwright');
        expect(detectMode('let n = 42')).toBe('playwright');
    });

    it('returns playwright for function calls', () => {
        expect(detectMode('invalid()')).toBe('playwright');
        expect(detectMode('fetch("https://api.example.com")')).toBe('playwright');
        expect(detectMode('await fetch("https://api.example.com")')).toBe('playwright');
    });

    it('returns playwright for template literals and string operations', () => {
        expect(detectMode('`hello`')).toBe('playwright');
        expect(detectMode('"hello"')).toBe('playwright');
    });

    it('returns pw for bare document/window (treated as unknown commands)', () => {
        expect(detectMode('document')).toBe('pw');
        expect(detectMode('window')).toBe('pw');
    });

});

describe('resolveConsoleMode', () => {

    it('returns playwright for multi-line input', () => {
        expect(resolveConsoleMode('const el = await page.$(\'a\');\nawait el._generateLocatorString()')).toBe('playwright');
    });

    it('returns playwright for multi-line input even without playwright globals', () => {
        expect(resolveConsoleMode('const x = 1;\nconsole.log(x)')).toBe('playwright');
    });

    it('delegates to detectMode for single-line input', () => {
        expect(resolveConsoleMode('page.title()')).toBe('playwright');
        expect(resolveConsoleMode('click e5')).toBe('pw');
        expect(resolveConsoleMode('document.title')).toBe('playwright');
    });
});
