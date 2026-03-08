import { describe, it, expect } from 'vitest';
import { detectMode } from '@/lib/execute';

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

    // ─── JS (page) context ────────────────────────────────────────────────────

    it('returns js for property access on globals', () => {
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

});
