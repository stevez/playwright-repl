import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getOuterHtml,
    gatherInfo,
    highlight,
    onMouseMove,
    onClick,
    onKeyDown,
    cleanup,
} from '../../src/content/picker';

describe('picker', () => {
    beforeEach(() => {
        document.body.innerHTML = '';
        cleanup();
        vi.mocked(chrome.runtime.sendMessage).mockClear();
        vi.restoreAllMocks();
    });

    // ─── getOuterHtml ────────────────────────────────────────────────────

    describe('getOuterHtml', () => {
        it('returns full outerHTML for short elements', () => {
            const el = document.createElement('button');
            el.textContent = 'OK';
            expect(getOuterHtml(el)).toBe('<button>OK</button>');
        });

        it('truncates long outerHTML', () => {
            const el = document.createElement('div');
            el.textContent = 'x'.repeat(300);
            const result = getOuterHtml(el);
            expect(result).toContain('<div>');
            expect(result).toContain('...</div>');
            expect(result.length).toBeLessThan(250);
        });

        it('preserves attributes in truncated output', () => {
            const el = document.createElement('div');
            el.id = 'main';
            el.className = 'container';
            el.textContent = 'x'.repeat(300);
            const result = getOuterHtml(el);
            expect(result).toContain('id="main"');
            expect(result).toContain('class="container"');
            expect(result).toMatch(/\.\.\.<\/div>$/);
        });

        it('handles self-closing-style elements', () => {
            const el = document.createElement('img');
            el.setAttribute('src', 'logo.png');
            el.setAttribute('alt', 'Logo');
            const result = getOuterHtml(el);
            expect(result).toContain('src="logo.png"');
        });
    });

    // ─── gatherInfo ──────────────────────────────────────────────────────

    describe('gatherInfo', () => {
        it('returns basic element info', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            const info = gatherInfo(btn);
            expect(info.tag).toBe('button');
            expect(info.text).toBe('Submit');
            expect(info.locator).toContain('Submit');
            expect(info.html).toContain('<button>');
        });

        it('collects attributes', () => {
            document.body.innerHTML = '<input type="text" id="name" placeholder="Enter name">';
            const input = document.querySelector('input')!;
            const info = gatherInfo(input);
            expect(info.attributes.type).toBe('text');
            expect(info.attributes.id).toBe('name');
            expect(info.attributes.placeholder).toBe('Enter name');
        });

        it('returns value for input elements', () => {
            document.body.innerHTML = '<input type="text" value="hello">';
            const input = document.querySelector('input')! as HTMLInputElement;
            const info = gatherInfo(input);
            expect(info.value).toBe('hello');
        });

        it('returns undefined value for non-input elements', () => {
            document.body.innerHTML = '<div>text</div>';
            const div = document.querySelector('div')!;
            const info = gatherInfo(div);
            expect(info.value).toBeUndefined();
        });

        it('returns checked state for checkbox', () => {
            document.body.innerHTML = '<input type="checkbox" checked>';
            const input = document.querySelector('input')! as HTMLInputElement;
            const info = gatherInfo(input);
            expect(info.checked).toBe(true);
        });

        it('returns undefined checked for non-checkable', () => {
            document.body.innerHTML = '<input type="text">';
            const input = document.querySelector('input')!;
            const info = gatherInfo(input);
            expect(info.checked).toBeUndefined();
        });

        it('includes enabled state', () => {
            document.body.innerHTML = '<button disabled>No</button>';
            const btn = document.querySelector('button')!;
            const info = gatherInfo(btn);
            expect(info.enabled).toBe(false);
        });

        it('includes bounding box', () => {
            document.body.innerHTML = '<div>test</div>';
            const div = document.querySelector('div')!;
            const info = gatherInfo(div);
            expect(info.box).toHaveProperty('x');
            expect(info.box).toHaveProperty('y');
            expect(info.box).toHaveProperty('width');
            expect(info.box).toHaveProperty('height');
        });

        it('truncates long text content', () => {
            document.body.innerHTML = `<div>${'x'.repeat(300)}</div>`;
            const div = document.querySelector('div')!;
            const info = gatherInfo(div);
            expect(info.text.length).toBe(200);
        });
    });

    // ─── onMouseMove ──────────────────────────────────────────────────────

    describe('onMouseMove', () => {
        it('updates highlight style for target element', () => {
            document.body.innerHTML = '<button>Click me</button>';
            const btn = document.querySelector('button')!;
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn);

            onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));

            expect(highlight.style.display).toBe('block');
        });

        it('skips when elementFromPoint returns null', () => {
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(null);
            highlight.style.display = 'none';

            onMouseMove(new MouseEvent('mousemove', { clientX: 0, clientY: 0 }));

            expect(highlight.style.display).toBe('none');
        });

        it('skips when target is the highlight overlay', () => {
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(highlight);
            highlight.style.display = 'none';

            onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));

            expect(highlight.style.display).toBe('none');
        });

        it('skips when target is same as current element', () => {
            document.body.innerHTML = '<button>Click me</button>';
            const btn = document.querySelector('button')!;
            const rectSpy = vi.spyOn(btn, 'getBoundingClientRect');
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn);

            // First call sets currentElement
            onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
            expect(rectSpy).toHaveBeenCalledTimes(1);

            // Second call with same element — should skip (no getBoundingClientRect)
            onMouseMove(new MouseEvent('mousemove', { clientX: 60, clientY: 60 }));
            expect(rectSpy).toHaveBeenCalledTimes(1);
        });
    });

    // ─── onClick ────────────────────────────────────────────────────────

    describe('onClick', () => {
        it('does nothing when currentElement is null', () => {
            const event = new MouseEvent('click', { bubbles: true });
            onClick(event);

            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });

        it('sends element-picked-raw message', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn);
            onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));
            vi.mocked(chrome.runtime.sendMessage).mockClear();

            onClick(new MouseEvent('click', { bubbles: true }));

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'element-picked-raw',
                    pickId: expect.any(String),
                    info: expect.objectContaining({ tag: 'button' }),
                })
            );
        });

        it('sets data-pw-pick-id on the picked element', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn);
            onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));

            onClick(new MouseEvent('click', { bubbles: true }));

            expect(btn.hasAttribute('data-pw-pick-id')).toBe(true);
        });

        it('calls preventDefault, stopPropagation, stopImmediatePropagation', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn);
            onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));

            const event = new MouseEvent('click', { bubbles: true, cancelable: true });
            const preventSpy = vi.spyOn(event, 'preventDefault');
            const stopSpy = vi.spyOn(event, 'stopPropagation');
            const stopImmSpy = vi.spyOn(event, 'stopImmediatePropagation');

            onClick(event);

            expect(preventSpy).toHaveBeenCalled();
            expect(stopSpy).toHaveBeenCalled();
            expect(stopImmSpy).toHaveBeenCalled();
        });

        it('calls cleanup after picking', () => {
            document.body.innerHTML = '<button>Submit</button>';
            const btn = document.querySelector('button')!;
            vi.spyOn(document, 'elementFromPoint').mockReturnValue(btn);
            onMouseMove(new MouseEvent('mousemove', { clientX: 50, clientY: 50 }));

            (window as any).__pw_picker_active = true;
            onClick(new MouseEvent('click', { bubbles: true }));

            expect((window as any).__pw_picker_active).toBe(false);
        });
    });

    // ─── onKeyDown ──────────────────────────────────────────────────────

    describe('onKeyDown', () => {
        it('sends pick-cancelled on Escape', () => {
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            onKeyDown(event);

            expect(chrome.runtime.sendMessage).toHaveBeenCalledWith(
                expect.objectContaining({ type: 'pick-cancelled' })
            );
        });

        it('calls preventDefault and stopImmediatePropagation on Escape', () => {
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
            const preventSpy = vi.spyOn(event, 'preventDefault');
            const stopImmSpy = vi.spyOn(event, 'stopImmediatePropagation');

            onKeyDown(event);

            expect(preventSpy).toHaveBeenCalled();
            expect(stopImmSpy).toHaveBeenCalled();
        });

        it('calls cleanup on Escape', () => {
            (window as any).__pw_picker_active = true;
            const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });

            onKeyDown(event);

            expect((window as any).__pw_picker_active).toBe(false);
        });

        it('ignores non-Escape keys', () => {
            onKeyDown(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });

        it('ignores regular character keys', () => {
            onKeyDown(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
            expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
        });
    });

    // ─── cleanup ────────────────────────────────────────────────────────

    describe('cleanup', () => {
        it('sets __pw_picker_active to false', () => {
            (window as any).__pw_picker_active = true;
            cleanup();
            expect((window as any).__pw_picker_active).toBe(false);
        });

        it('removes highlight from DOM', () => {
            document.body.appendChild(highlight);
            expect(document.body.contains(highlight)).toBe(true);

            cleanup();

            expect(document.body.contains(highlight)).toBe(false);
        });
    });
});
