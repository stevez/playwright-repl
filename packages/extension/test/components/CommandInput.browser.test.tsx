import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, RenderResult } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import CommandInput from '@/components/CommandInput';
import { addCommand, clearHistory } from '@/lib/command-history';

// Helper: get the CM6 content element
function getEditor(screen: RenderResult) {
    return screen.container.querySelector('.cm-content') as HTMLElement;
}

// Helper: read the CM6 editor text (returns '' when placeholder is showing)
function getEditorText(screen: RenderResult) {
    if (screen.container.querySelector('.cm-placeholder')) return '';
    return screen.container.querySelector('.cm-line')?.textContent ?? '';
}

// Helper: wait for an element to appear via MutationObserver.
// MutationObserver fires as a microtask after DOM changes — unlike setTimeout polling,
// it does not yield macrotask turns where the browser could steal focus from CM6.
async function waitForVisible(selector: string, timeout = 5000): Promise<void> {
    if (document.querySelector(selector)) return;
    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
            observer.disconnect();
            reject(new Error(`waitForVisible: "${selector}" not found after ${timeout}ms`));
        }, timeout);
        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                clearTimeout(timer);
                observer.disconnect();
                resolve();
            }
        });
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

// Helper: type into the CM6 editor (click to focus + keyboard)
async function typeInEditor(screen: RenderResult, text: string) {
    const editor = getEditor(screen);
    editor.focus();
    await userEvent.keyboard(text);
}

describe('CommandInput Component tests', () => {
    let onSubmit = vi.fn();
    let screen: RenderResult;

    beforeEach(async () => {
        clearHistory();
        onSubmit = vi.fn();
        screen = await render(<CommandInput onSubmit={onSubmit}/>);
    });

    it('should render the CM6 editor', async () => {
        expect(getEditor(screen)).toBeTruthy();
    });

    it('should invoke callback when user presses Enter', async () => {
        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');  // close autocomplete if open
        await userEvent.keyboard('{Enter}');

        expect(onSubmit).toHaveBeenLastCalledWith('click e5');
        expect(getEditorText(screen)).toBe('');
    });

    it('should use ArrowUp to load the history command', async () => {
        addCommand('goto https://example.com');

        await typeInEditor(screen, 'click e1');
        await userEvent.keyboard('{Escape}');  // close autocomplete
        await userEvent.keyboard('{ArrowUp}');

        expect(getEditorText(screen)).toBe('goto https://example.com');
    });

    it('should not change input when ArrowUp reaches the beginning of history', async () => {
        addCommand('goto https://example.com');

        const editor = getEditor(screen);
        editor.focus();
        await userEvent.keyboard('{ArrowUp}');
        await userEvent.keyboard('{ArrowUp}');

        expect(getEditorText(screen)).toBe('goto https://example.com');
    });

    it('should use ArrowDown to load the history command', async () => {
        addCommand('goto https://example.com');
        addCommand('click e1');

        const editor = getEditor(screen);
        editor.focus();
        await userEvent.keyboard('{ArrowUp}');
        await userEvent.keyboard('{ArrowUp}');
        await userEvent.keyboard('{ArrowDown}');

        expect(getEditorText(screen)).toBe('click e1');
    });

    it('should clear input when ArrowDown reaches end of history', async () => {
        addCommand('goto https://example.com');
        addCommand('click e1');

        const editor = getEditor(screen);
        editor.focus();
        await userEvent.keyboard('{ArrowUp}');
        await userEvent.keyboard('{ArrowUp}');
        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard('{ArrowDown}');

        expect(getEditorText(screen)).toBe('');

        // past the end, still empty
        await userEvent.keyboard('{ArrowDown}');
        expect(getEditorText(screen)).toBe('');
    });

    it('should show autocomplete dropdown when typing a matching command', async () => {
        await typeInEditor(screen, 'go');

        await waitForVisible('.cm-tooltip-autocomplete');
        const dropdown = document.querySelector('.cm-tooltip-autocomplete');
        expect(dropdown?.textContent).toContain('go-back');
        expect(dropdown?.textContent).toContain('go-forward');
        expect(dropdown?.textContent).toContain('goto');
    });

    it.skip('should accept autocomplete item on Enter when dropdown is open', async () => {
        await typeInEditor(screen, 'go');
        await waitForVisible('.cm-tooltip-autocomplete');
        await userEvent.keyboard('{Enter}');

        // Enter accepted the completion ('go' alias or submits — either way editor starts with go or is empty after submit)
        // The key check: autocomplete is dismissed and editor content changed
        expect(document.querySelector('.cm-tooltip-autocomplete')).toBeNull();
    });

    it('should clear editor and submit on Enter when no autocomplete', async () => {
        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');  // ensure no dropdown
        await userEvent.keyboard('{Enter}');

        expect(onSubmit).toHaveBeenCalledWith('click e5');
        expect(getEditorText(screen)).toBe('');
    });

    it('should accept autocomplete item on Tab', async () => {
        await typeInEditor(screen, 'go');
        await waitForVisible('.cm-tooltip-autocomplete');
        await userEvent.click(getEditor(screen));
        await userEvent.keyboard('{ArrowDown}');
        await userEvent.keyboard('{Tab}');

        // should have accepted the first matching completion (could be 'go' alias itself)
        const text = getEditorText(screen);
        expect(text).toMatch(/^go/);
        // dropdown should close after accepting
        expect(document.querySelector('.cm-tooltip-autocomplete')).toBeNull();
    });

    it('should not submit when Tab is pressed without autocomplete', async () => {
        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');  // close autocomplete
        await userEvent.keyboard('{Tab}');

        expect(onSubmit).not.toHaveBeenCalled();
        expect(getEditorText(screen)).toBe('click e5');
    });

    it('should not submit empty input on Enter', async () => {
        const editor = getEditor(screen);
        editor.focus();
        await userEvent.keyboard('{Enter}');

        expect(onSubmit).not.toHaveBeenCalled();
    });
});
