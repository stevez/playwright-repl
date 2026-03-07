import { describe, it, expect } from 'vitest';
import { tryReturnLastExpr } from '@/lib/sw-debugger';

describe('tryReturnLastExpr', () => {

    // ─── Adds return ────────────────────────────────────────────────────────

    it('adds return before a simple expression', () => {
        expect(tryReturnLastExpr('1 + 2')).toBe('return 1 + 2');
    });

    it('adds return before a function call', () => {
        expect(tryReturnLastExpr('inc(5)')).toBe('return inc(5)');
    });

    it('adds return to the last line of a multi-line script', () => {
        const input = 'const inc = (a) => a + 1\ninc(5)';
        expect(tryReturnLastExpr(input)).toBe('const inc = (a) => a + 1\nreturn inc(5)');
    });

    it('preserves leading whitespace when inserting return', () => {
        const input = 'function f() {}\n  f()';
        expect(tryReturnLastExpr(input)).toBe('function f() {}\n  return f()');
    });

    it('ignores trailing empty lines and inserts return on last non-empty line', () => {
        const input = 'inc(5)\n\n';
        expect(tryReturnLastExpr(input)).toBe('return inc(5)\n\n');
    });

    // ─── Does NOT add return ─────────────────────────────────────────────────

    it('does not add return before const declaration', () => {
        const input = 'const x = 5';
        expect(tryReturnLastExpr(input)).toBe('const x = 5');
    });

    it('does not add return before let declaration', () => {
        expect(tryReturnLastExpr('let x = 5')).toBe('let x = 5');
    });

    it('does not add return before var declaration', () => {
        expect(tryReturnLastExpr('var x = 5')).toBe('var x = 5');
    });

    it('does not add return before function declaration', () => {
        expect(tryReturnLastExpr('function f() {}')).toBe('function f() {}');
    });

    it('does not add return before if statement', () => {
        expect(tryReturnLastExpr('if (x) {}')).toBe('if (x) {}');
    });

    it('does not add return before for loop', () => {
        expect(tryReturnLastExpr('for (let i=0;i<3;i++) {}')).toBe('for (let i=0;i<3;i++) {}');
    });

    it('does not add return if already has return', () => {
        expect(tryReturnLastExpr('return 42')).toBe('return 42');
    });

    it('does not add return before throw', () => {
        expect(tryReturnLastExpr('throw new Error("x")')).toBe('throw new Error("x")');
    });

    it('returns empty string unchanged', () => {
        expect(tryReturnLastExpr('')).toBe('');
    });
});
