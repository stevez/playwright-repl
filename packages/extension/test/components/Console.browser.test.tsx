import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, RenderResult } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { useReducer } from 'react';

import { Console } from '@/components/Console';
import { panelReducer, initialState } from '@/reducer';
import type { OutputLine } from '@/types';

vi.mock('@/lib/bridge', () => ({
    attachToTab: vi.fn(),
    executeCommand: vi.fn(),
    executeCommandForConsole: vi.fn(),
}));

vi.mock('@/lib/sw-debugger', () => ({
    swDebugEval: vi.fn(),
    swDebugEvalRaw: vi.fn().mockResolvedValue({ result: { type: 'undefined' } }),
    swGetProperties: vi.fn(),
    swDebuggerEnable: vi.fn().mockResolvedValue(undefined),
    swDebuggerDisable: vi.fn().mockResolvedValue(undefined),
    swDebugPause: vi.fn().mockResolvedValue(undefined),
    swRemoveBreakpoint: vi.fn().mockResolvedValue(undefined),
    swDebugResume: vi.fn().mockResolvedValue(undefined),
    swDebugStepOver: vi.fn().mockResolvedValue(undefined),
    swDebugStepInto: vi.fn().mockResolvedValue(undefined),
    swDebugStepOut: vi.fn().mockResolvedValue(undefined),
    swTerminateExecution: vi.fn().mockResolvedValue(undefined),
    swSetBreakpointByUrl: vi.fn().mockResolvedValue('bp-1'),
    swTrackBreakpoint: vi.fn(),
    swRemoveAllBreakpoints: vi.fn().mockResolvedValue(undefined),
    onDebugPaused: vi.fn(),
}));

vi.mock('@/lib/file-utils', () => ({
    saveImageToFile: vi.fn(),
}));

import { executeCommandForConsole } from '@/lib/bridge';
import { saveImageToFile } from '@/lib/file-utils';

const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const codeBlock = `
import { test, expect } from '@playwright/test';

test('recorded session', async ({ page }) => {
  await page.goto("https://example.com");
});`.trim();

// Wrapper that wires Console to a real reducer so dispatched actions update outputLines
function ConsoleWithReducer({ initialLines = [] as OutputLine[] } = {}) {
    const [state, dispatch] = useReducer(panelReducer, {
        ...initialState,
        outputLines: initialLines,
    });
    return <Console outputLines={state.outputLines} dispatch={dispatch} />;
}

function getEditor(container: Element) {
    return container.querySelector('.cm-content') as HTMLElement;
}

async function typeInEditor(screen: RenderResult, text: string) {
    getEditor(screen.container).focus();
    await userEvent.keyboard(text);
}

describe('Console component tests', () => {

    beforeEach(() => {
        vi.mocked(executeCommandForConsole).mockClear();
    });

    it('should render output lines from outputLines prop', async () => {
        const lines: OutputLine[] = [
            { text: 'click e5', type: 'command' },
            { text: 'Clicked', type: 'success' },
            { text: 'click e99', type: 'command' },
            { text: 'Element not found', type: 'error' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
        await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
        await expect.element(screen.getByText('Element not found')).toBeInTheDocument();
    });

    it('should render prompt input', async () => {
        const screen = await render(<ConsoleWithReducer />);
        expect(getEditor(screen.container)).toBeTruthy();
    });

    it('should submit command on Enter and display result', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: 'Clicked' });
        const screen = await render(<ConsoleWithReducer />);

        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
        await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
    });

    it('should submit command on Enter and display error message', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: 'element e5 not found' });
        const screen = await render(<ConsoleWithReducer />);

        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
        await expect.element(screen.getByText('element e5 not found')).toBeInTheDocument();
    });

    it('should render error message when server fails to respond', async () => {
        vi.mocked(executeCommandForConsole).mockRejectedValue(new Error('Network error'));
        const screen = await render(<ConsoleWithReducer />);

        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('should not submit empty input on Enter', async () => {
        const screen = await render(<ConsoleWithReducer />);

        getEditor(screen.container).focus();
        await userEvent.keyboard('{Enter}');

        expect(executeCommandForConsole).not.toHaveBeenCalled();
    });

    it('should not submit for comment', async () => {
        const screen = await render(<ConsoleWithReducer />);

        await typeInEditor(screen, '# this is a comment');
        await userEvent.keyboard('{Enter}');

        expect(executeCommandForConsole).not.toHaveBeenCalled();
        await expect.element(screen.getByText('# this is a comment')).toBeInTheDocument();
    });

    it('should not submit for clear command', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: 'Clicked' });
        const screen = await render(<ConsoleWithReducer />);

        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');
        await expect.element(screen.getByText('click e5')).toBeInTheDocument();

        await typeInEditor(screen, 'clear');
        await userEvent.keyboard('{Enter}');

        expect(executeCommandForConsole).toHaveBeenCalledTimes(1);
        await expect.element(screen.getByText('click e5')).not.toBeInTheDocument();
    });

    it('should clear outputLines entries when clear command is typed', async () => {
        const lines: OutputLine[] = [
            { text: 'click e5', type: 'command' },
            { text: 'Clicked', type: 'success' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);
        await expect.element(screen.getByText('click e5')).toBeInTheDocument();

        await typeInEditor(screen, 'clear');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('click e5')).not.toBeInTheDocument();
    });

    it('should render code-block from outputLines', async () => {
        const lines: OutputLine[] = [
            { text: 'snapshot', type: 'command' },
            { text: codeBlock, type: 'snapshot' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('@playwright/test', { exact: false })).toBeInTheDocument();
        await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    });

    it('should copy code-block to clipboard', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            writable: true,
            configurable: true,
        });

        const lines: OutputLine[] = [
            { text: 'snapshot', type: 'command' },
            { text: codeBlock, type: 'snapshot' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);
        await screen.getByRole('button', { name: 'Copy' }).click();

        expect(writeText).toHaveBeenCalledWith(codeBlock);
    });

    it('should render screenshot image from outputLines', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should show lightbox when clicking screenshot image', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);
        (screen.container.querySelector('img') as HTMLElement).click();

        await expect.element(screen.getByRole('button', { name: '×' })).toBeInTheDocument();
    });

    it('should close lightbox when clicking the close button', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);
        (screen.container.querySelector('img') as HTMLElement).click();
        await screen.getByRole('button', { name: '×' }).click();

        await expect.element(screen.getByRole('button', { name: '×' })).not.toBeInTheDocument();
    });

    it('should save image when clicking Save in lightbox', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);
        (screen.container.querySelector('img') as HTMLElement).click();
        await screen.getByRole('button', { name: 'Save' }).click();

        expect(saveImageToFile).toHaveBeenCalledWith(testImage);
    });

    it('should render screenshot image when command returns image', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: '', image: testImage });
        const screen = await render(<ConsoleWithReducer />);

        await typeInEditor(screen, 'screenshot');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('screenshot')).toBeInTheDocument();
        await expect.element(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should render ObjectTree for outputLine with a value field', async () => {
        const lines: OutputLine[] = [
            { text: 'eval document.title', type: 'command' },
            { text: '', type: 'success', value: { __type: 'string', v: 'My Page Title' } },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('"My Page Title"', { exact: false })).toBeInTheDocument();
    });

    // ─── outputLinesToEntries branch coverage ──────────────────────────────

    it('should render standalone comment line', async () => {
        const lines: OutputLine[] = [
            { text: '# this is a comment', type: 'comment' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('# this is a comment')).toBeInTheDocument();
    });

    it('should render standalone info line with text', async () => {
        const lines: OutputLine[] = [
            { text: 'Info message', type: 'info' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('Info message')).toBeInTheDocument();
    });

    it('should render standalone info line with value', async () => {
        const lines: OutputLine[] = [
            { text: '', type: 'info', value: { __type: 'number', v: 42 } },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('42')).toBeInTheDocument();
    });

    it('should render standalone code-block line', async () => {
        const lines: OutputLine[] = [
            { text: 'const x = 1;', type: 'code-block' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('const x = 1;', { exact: false })).toBeInTheDocument();
    });

    it('should render standalone error line with text', async () => {
        const lines: OutputLine[] = [
            { text: 'Something went wrong', type: 'error' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('should render standalone error line with value', async () => {
        const lines: OutputLine[] = [
            { text: '', type: 'error', value: { __type: 'string', v: 'Error object' } },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('"Error object"', { exact: false })).toBeInTheDocument();
    });

    it('should render standalone success line with text', async () => {
        const lines: OutputLine[] = [
            { text: 'Done successfully', type: 'success' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('Done successfully')).toBeInTheDocument();
    });

    it('should render standalone success line with value', async () => {
        const lines: OutputLine[] = [
            { text: '', type: 'success', value: { __type: 'boolean', v: true } },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('true')).toBeInTheDocument();
    });

    it('should render command followed by code-block result', async () => {
        const lines: OutputLine[] = [
            { text: 'snapshot', type: 'command' },
            { text: 'const a = 1;', type: 'code-block' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('snapshot')).toBeInTheDocument();
        await expect.element(screen.getByText('const a = 1;', { exact: false })).toBeInTheDocument();
    });

    it('should render command with no following result as pending', async () => {
        const lines: OutputLine[] = [
            { text: 'click e5', type: 'command' },
            { text: 'goto url', type: 'command' },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        // Both commands should render (first is pending since next is also a command)
        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
        await expect.element(screen.getByText('goto url')).toBeInTheDocument();
    });

    it('should render command with success value (ObjectTree)', async () => {
        const lines: OutputLine[] = [
            { text: 'eval obj', type: 'command' },
            { text: '', type: 'success', value: { __type: 'number', v: 99 } },
        ];
        const screen = await render(<ConsoleWithReducer initialLines={lines} />);

        await expect.element(screen.getByText('eval obj')).toBeInTheDocument();
        await expect.element(screen.getByText('99')).toBeInTheDocument();
    });

});
