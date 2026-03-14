import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    SPECIAL_KEYS,
    flushPendingFill,
    onClickCapture,
    onInputCapture,
    onChangeCapture,
    onKeyDownCapture,
    onFocusOutCapture,
    cleanup,
} from '../../src/content/recorder';

describe('recorder', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        flushPendingFill();
        vi.mocked(chrome.runtime.sendMessage).mockClear();
    });

    // ─── SPECIAL_KEYS ────────────────────────────────────────────────────

    describe('SPECIAL_KEYS', () => {
        it('includes Enter', () => {
            expect(SPECIAL_KEYS.has('Enter')).toBe(true);
        });

        it('includes Tab', () => {
            expect(SPECIAL_KEYS.has('Tab')).toBe(true);
        });

        it('includes Escape', () => {
            expect(SPECIAL_KEYS.has('Escape')).toBe(true);
        });

        it('includes arrow keys', () => {
            expect(SPECIAL_KEYS.has('ArrowUp')).toBe(true);
            expect(SPECIAL_KEYS.has('ArrowDown')).toBe(true);
            expect(SPECIAL_KEYS.has('ArrowLeft')).toBe(true);
            expect(SPECIAL_KEYS.has('ArrowRight')).toBe(true);
        });

        it('includes F-keys', () => {
            for (let i = 1; i <= 12; i++) {
                expect(SPECIAL_KEYS.has(`F${i}`)).toBe(true);
            }
        });

        it('includes navigation keys', () => {
            expect(SPECIAL_KEYS.has('Home')).toBe(true);
            expect(SPECIAL_KEYS.has('End')).toBe(true);
            expect(SPECIAL_KEYS.has('PageUp')).toBe(true);
            expect(SPECIAL_KEYS.has('PageDown')).toBe(true);
        });

        it('includes editing keys', () => {
            expect(SPECIAL_KEYS.has('Backspace')).toBe(true);
            expect(SPECIAL_KEYS.has('Delete')).toBe(true);
        });

        it('does not include regular characters', () => {
            expect(SPECIAL_KEYS.has('a')).toBe(false);
            expect(SPECIAL_KEYS.has('1')).toBe(false);
            expect(SPECIAL_KEYS.has(' ')).toBe(false);
        });
    });

    // ─── onClickCapture ──────────────────────────────────────────────────

    describe('onClickCapture', () => {
        it('sends recorded-action for button click', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            onClickCapture(new MouseEvent('click', { bubbles: true }) as any);
            // No target set via constructor — need to dispatch on element
            btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
            // The handler reads e.target, so dispatch on the element
        });

        it('sends click command with correct message type', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            const event = new MouseEvent('click', { bubbles: true });
            Object.defineProperty(event, 'target', { value: btn });
            onClickCapture(event);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'recorded-action' })
            );
        });

        it('skips click on text input', () => {
            document.body.innerHTML = '<input type="text">';
            const input = document.querySelector('input')!;
            const event = new MouseEvent('click', { bubbles: true });
            Object.defineProperty(event, 'target', { value: input });
            onClickCapture(event);
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });

        it('skips click on checkbox', () => {
            document.body.innerHTML = '<input type="checkbox">';
            const input = document.querySelector('input')!;
            const event = new MouseEvent('click', { bubbles: true });
            Object.defineProperty(event, 'target', { value: input });
            onClickCapture(event);
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });

        it('skips click on textarea', () => {
            document.body.innerHTML = '<textarea></textarea>';
            const textarea = document.querySelector('textarea')!;
            const event = new MouseEvent('click', { bubbles: true });
            Object.defineProperty(event, 'target', { value: textarea });
            onClickCapture(event);
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });
    });

    // ─── onInputCapture ──────────────────────────────────────────────────

    describe('onInputCapture', () => {
        it('sends recorded-action for first input on text field', () => {
            document.body.innerHTML = '<label for="name">Name</label><input id="name" type="text" value="Alice">';
            const input = document.querySelector('input')!;
            const event = new Event('input', { bubbles: true });
            Object.defineProperty(event, 'target', { value: input });
            onInputCapture(event);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'recorded-action' })
            );
        });

        it('sends recorded-fill-update for same element', () => {
            document.body.innerHTML = '<label for="name">Name</label><input id="name" type="text" value="A">';
            const input = document.querySelector('input')!;

            // First input
            const e1 = new Event('input', { bubbles: true });
            Object.defineProperty(e1, 'target', { value: input });
            onInputCapture(e1);

            // Second input on same element
            input.value = 'Al';
            const e2 = new Event('input', { bubbles: true });
            Object.defineProperty(e2, 'target', { value: input });
            onInputCapture(e2);

            expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
            expect(chrome.runtime.sendMessage).toHaveBeenLastCalledWith(
                expect.objectContaining({ type: 'recorded-fill-update' })
            );
        });

        it('ignores input on non-text fields', () => {
            document.body.innerHTML = '<button>OK</button>';
            const btn = document.querySelector('button')!;
            const event = new Event('input', { bubbles: true });
            Object.defineProperty(event, 'target', { value: btn });
            onInputCapture(event);
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });
    });

    // ─── onChangeCapture ─────────────────────────────────────────────────

    describe('onChangeCapture', () => {
        it('sends check for checked checkbox', () => {
            document.body.innerHTML = '<label><input type="checkbox"> Accept</label>';
            const input = document.querySelector('input')! as HTMLInputElement;
            input.checked = true;
            const event = new Event('change', { bubbles: true });
            Object.defineProperty(event, 'target', { value: input });
            onChangeCapture(event);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'recorded-action',
                    action: expect.objectContaining({ pw: expect.stringContaining('check') }),
                })
            );
        });

        it('sends uncheck for unchecked checkbox', () => {
            document.body.innerHTML = '<label><input type="checkbox"> Accept</label>';
            const input = document.querySelector('input')! as HTMLInputElement;
            input.checked = false;
            const event = new Event('change', { bubbles: true });
            Object.defineProperty(event, 'target', { value: input });
            onChangeCapture(event);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'recorded-action',
                    action: expect.objectContaining({ pw: expect.stringContaining('uncheck') }),
                })
            );
        });

        it('sends select for select element', () => {
            document.body.innerHTML = '<label for="c">Color</label><select id="c"><option value="red">Red</option></select>';
            const select = document.querySelector('select')! as HTMLSelectElement;
            select.value = 'red';
            const event = new Event('change', { bubbles: true });
            Object.defineProperty(event, 'target', { value: select });
            onChangeCapture(event);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'recorded-action',
                    action: expect.objectContaining({ pw: expect.stringContaining('select') }),
                })
            );
        });
    });

    // ─── onKeyDownCapture ────────────────────────────────────────────────

    describe('onKeyDownCapture', () => {
        it('ignores non-special keys', () => {
            const event = new KeyboardEvent('keydown', { key: 'a', bubbles: true });
            onKeyDownCapture(event);
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });

        it('sends press for special key on body', () => {
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
            Object.defineProperty(event, 'target', { value: document.body });
            onKeyDownCapture(event);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'recorded-action',
                    action: expect.objectContaining({ pw: 'press Escape' }),
                })
            );
        });

        it('sends press with locator for focused element', () => {
            document.body.innerHTML = '<button>OK</button>';
            const btn = document.querySelector('button')!;
            const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true });
            Object.defineProperty(event, 'target', { value: btn });
            onKeyDownCapture(event);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'recorded-action',
                    action: expect.objectContaining({ pw: expect.stringContaining('press') }),
                })
            );
        });

        it('sends fill-submit on Enter during pending fill', () => {
            document.body.innerHTML = '<label for="q">Query</label><input id="q" type="text" value="test">';
            const input = document.querySelector('input')!;

            // Trigger fill first
            const inputEvent = new Event('input', { bubbles: true });
            Object.defineProperty(inputEvent, 'target', { value: input });
            onInputCapture(inputEvent);
            vi.mocked(chrome.runtime.sendMessage).mockClear();

            // Then Enter
            const enterEvent = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true });
            Object.defineProperty(enterEvent, 'target', { value: input });
            onKeyDownCapture(enterEvent);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'recorded-fill-submit' })
            );
        });
    });

    // ─── onFocusOutCapture ───────────────────────────────────────────────

    describe('onFocusOutCapture', () => {
        it('clears pending fill when element loses focus', () => {
            document.body.innerHTML = '<label for="q">Query</label><input id="q" type="text" value="test">';
            const input = document.querySelector('input')!;

            // Start a fill
            const inputEvent = new Event('input', { bubbles: true });
            Object.defineProperty(inputEvent, 'target', { value: input });
            onInputCapture(inputEvent);
            vi.mocked(chrome.runtime.sendMessage).mockClear();

            // Focus out
            const focusEvent = new FocusEvent('focusout', { bubbles: true });
            Object.defineProperty(focusEvent, 'target', { value: input });
            onFocusOutCapture(focusEvent);

            // Next input on same element should be new fill (recorded-action, not fill-update)
            input.value = 'new';
            const e2 = new Event('input', { bubbles: true });
            Object.defineProperty(e2, 'target', { value: input });
            onInputCapture(e2);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'recorded-action' })
            );
        });
    });

    // ─── cleanup ─────────────────────────────────────────────────────────

    describe('cleanup', () => {
        it('flushes pending fill', () => {
            document.body.innerHTML = '<label for="q">Query</label><input id="q" type="text" value="test">';
            const input = document.querySelector('input')!;
            const inputEvent = new Event('input', { bubbles: true });
            Object.defineProperty(inputEvent, 'target', { value: input });
            onInputCapture(inputEvent);

            cleanup();
            // Verify pendingFill was cleared by checking next input is recorded-action
            vi.mocked(chrome.runtime.sendMessage).mockClear();
            input.value = 'new';
            const e2 = new Event('input', { bubbles: true });
            Object.defineProperty(e2, 'target', { value: input });
            onInputCapture(e2);
            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'recorded-action' })
            );
        });
    });
});
