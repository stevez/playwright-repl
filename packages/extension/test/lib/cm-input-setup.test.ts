import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock CodeMirror modules
vi.mock('@codemirror/view', () => ({
    EditorView: { theme: (spec: unknown) => spec },
    keymap: { of: (bindings: unknown[]) => ({ bindings }) },
    placeholder: (text: string) => ({ placeholder: text }),
    drawSelection: () => ({}),
}));

vi.mock('@codemirror/commands', () => ({
    history: () => ({}),
    historyKeymap: [],
}));

let completionStatusValue: string | null = null;
vi.mock('@codemirror/autocomplete', () => ({
    autocompletion: (opts: unknown) => opts,
    acceptCompletion: 'acceptCompletion',
    completionStatus: () => completionStatusValue,
}));

vi.mock('@/lib/pw-language', () => ({
    pwSyntax: [{ lang: 'pw' }],
}));

vi.mock('@/lib/pw-completion', () => ({
    pwCompletion: () => [],
}));

let goUpValue: string | undefined;
let goDownValue: string | null | undefined;
vi.mock('@/lib/command-history', () => ({
    goUp: () => goUpValue,
    goDown: () => goDownValue,
}));

import { inputExtensions } from '@/lib/cm-input-setup';

/** Create a minimal mock EditorView for keymap handler testing */
function mockView(doc = '') {
    const dispatched: Array<Record<string, unknown>> = [];
    return {
        state: {
            doc: { toString: () => doc, length: doc.length },
        },
        dispatch: (tr: Record<string, unknown>) => dispatched.push(tr),
        _dispatched: dispatched,
    };
}

/** Extract keymap bindings from inputExtensions result */
function getBindings(onSubmit: (cmd: string) => void) {
    const exts = inputExtensions(onSubmit);
    // First item is the custom keymap: { bindings: [...] }
    const km = exts[0] as unknown as { bindings: Array<{ key: string; run: (view: unknown) => boolean }> };
    return km.bindings;
}

describe('cm-input-setup', () => {

    beforeEach(() => {
        completionStatusValue = null;
        goUpValue = undefined;
        goDownValue = undefined;
    });

    it('returns an array of extensions', () => {
        const exts = inputExtensions(vi.fn());
        expect(Array.isArray(exts)).toBe(true);
        expect(exts.length).toBeGreaterThan(0);
    });

    // ─── Enter key ──────────────────────────────────────────────────────────

    describe('Enter key', () => {
        it('calls onSubmit with non-empty content and clears editor', () => {
            const onSubmit = vi.fn();
            const bindings = getBindings(onSubmit);
            const enter = bindings.find(b => b.key === 'Enter')!;
            const view = mockView('click e5');

            const handled = enter.run(view);

            expect(handled).toBe(true);
            expect(onSubmit).toHaveBeenCalledWith('click e5');
            expect(view._dispatched).toHaveLength(1);
            expect(view._dispatched[0].changes).toEqual({ from: 0, to: 8, insert: '' });
        });

        it('clears editor but does not call onSubmit for empty content', () => {
            const onSubmit = vi.fn();
            const bindings = getBindings(onSubmit);
            const enter = bindings.find(b => b.key === 'Enter')!;
            const view = mockView('   ');

            const handled = enter.run(view);

            expect(handled).toBe(true);
            expect(onSubmit).not.toHaveBeenCalled();
        });

        it('returns false when autocomplete is active', () => {
            completionStatusValue = 'active';
            const onSubmit = vi.fn();
            const bindings = getBindings(onSubmit);
            const enter = bindings.find(b => b.key === 'Enter')!;
            const view = mockView('click');

            const handled = enter.run(view);

            expect(handled).toBe(false);
            expect(onSubmit).not.toHaveBeenCalled();
        });
    });

    // ─── Tab key ────────────────────────────────────────────────────────────

    it('Tab binding is acceptCompletion', () => {
        const bindings = getBindings(vi.fn());
        const tab = bindings.find(b => b.key === 'Tab')!;
        expect(tab.run).toBe('acceptCompletion');
    });

    // ─── ArrowUp key ────────────────────────────────────────────────────────

    describe('ArrowUp key', () => {
        it('replaces editor content with history entry from goUp', () => {
            goUpValue = 'snapshot';
            const bindings = getBindings(vi.fn());
            const up = bindings.find(b => b.key === 'ArrowUp')!;
            const view = mockView('click');

            const handled = up.run(view);

            expect(handled).toBe(true);
            expect(view._dispatched).toHaveLength(1);
            expect((view._dispatched[0].changes as Record<string, unknown>).insert).toBe('snapshot');
        });

        it('does nothing when goUp returns undefined', () => {
            goUpValue = undefined;
            const bindings = getBindings(vi.fn());
            const up = bindings.find(b => b.key === 'ArrowUp')!;
            const view = mockView('');

            const handled = up.run(view);

            expect(handled).toBe(true);
            expect(view._dispatched).toHaveLength(0);
        });

        it('returns false when autocomplete is active', () => {
            completionStatusValue = 'active';
            const bindings = getBindings(vi.fn());
            const up = bindings.find(b => b.key === 'ArrowUp')!;
            const view = mockView('');

            expect(up.run(view)).toBe(false);
        });
    });

    // ─── ArrowDown key ──────────────────────────────────────────────────────

    describe('ArrowDown key', () => {
        it('replaces editor content with history entry from goDown', () => {
            goDownValue = 'goto url';
            const bindings = getBindings(vi.fn());
            const down = bindings.find(b => b.key === 'ArrowDown')!;
            const view = mockView('snapshot');

            const handled = down.run(view);

            expect(handled).toBe(true);
            expect(view._dispatched).toHaveLength(1);
            expect((view._dispatched[0].changes as Record<string, unknown>).insert).toBe('goto url');
        });

        it('replaces editor content with empty string from goDown', () => {
            goDownValue = '';
            const bindings = getBindings(vi.fn());
            const down = bindings.find(b => b.key === 'ArrowDown')!;
            const view = mockView('snapshot');

            const handled = down.run(view);

            expect(handled).toBe(true);
            expect(view._dispatched).toHaveLength(1);
            expect((view._dispatched[0].changes as Record<string, unknown>).insert).toBe('');
        });

        it('does nothing when goDown returns null/undefined', () => {
            goDownValue = null;
            const bindings = getBindings(vi.fn());
            const down = bindings.find(b => b.key === 'ArrowDown')!;
            const view = mockView('');

            const handled = down.run(view);

            expect(handled).toBe(true);
            expect(view._dispatched).toHaveLength(0);
        });

        it('returns false when autocomplete is active', () => {
            completionStatusValue = 'active';
            const bindings = getBindings(vi.fn());
            const down = bindings.find(b => b.key === 'ArrowDown')!;
            const view = mockView('');

            expect(down.run(view)).toBe(false);
        });
    });
});
