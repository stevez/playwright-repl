import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, RenderResult } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import { Console } from '@/components/Console';
import type { OutputLine } from '@/types';

vi.mock('@/lib/bridge', () => ({
    attachToTab: vi.fn(),
    executeCommandForConsole: vi.fn(),
    cdpEvaluate: vi.fn(),
    cdpGetProperties: vi.fn(),
}));

vi.mock('@/lib/sw-debugger', () => ({
    swDebugEval: vi.fn(),
    swGetProperties: vi.fn(),
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
        const screen = await render(<Console outputLines={lines} />);

        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
        await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
        await expect.element(screen.getByText('Element not found')).toBeInTheDocument();
    });

    it('should render prompt input', async () => {
        const screen = await render(<Console />);
        expect(getEditor(screen.container)).toBeTruthy();
    });

    it('should submit command on Enter and display result', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: 'Clicked' });
        const screen = await render(<Console />);

        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
        await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
    });

    it('should submit command on Enter and display error message', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: 'element e5 not found' });
        const screen = await render(<Console />);

        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
        await expect.element(screen.getByText('element e5 not found')).toBeInTheDocument();
    });

    it('should render error message when server fails to respond', async () => {
        vi.mocked(executeCommandForConsole).mockRejectedValue(new Error('Network error'));
        const screen = await render(<Console />);

        await typeInEditor(screen, 'click e5');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('Network error')).toBeInTheDocument();
    });

    it('should not submit empty input on Enter', async () => {
        const screen = await render(<Console />);

        getEditor(screen.container).focus();
        await userEvent.keyboard('{Enter}');

        expect(executeCommandForConsole).not.toHaveBeenCalled();
    });

    it('should not submit for comment', async () => {
        const screen = await render(<Console />);

        await typeInEditor(screen, '# this is a comment');
        await userEvent.keyboard('{Enter}');

        expect(executeCommandForConsole).not.toHaveBeenCalled();
        await expect.element(screen.getByText('# this is a comment')).toBeInTheDocument();
    });

    it('should not submit for clear command', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: 'Clicked' });
        const screen = await render(<Console />);

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
        const screen = await render(<Console outputLines={lines} />);
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
        const screen = await render(<Console outputLines={lines} />);

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
        const screen = await render(<Console outputLines={lines} />);
        await screen.getByRole('button', { name: 'Copy' }).click();

        expect(writeText).toHaveBeenCalledWith(codeBlock);
    });

    it('should render screenshot image from outputLines', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<Console outputLines={lines} />);

        await expect.element(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should show lightbox when clicking screenshot image', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<Console outputLines={lines} />);
        (screen.container.querySelector('img') as HTMLElement).click();

        await expect.element(screen.getByRole('button', { name: '×' })).toBeInTheDocument();
    });

    it('should close lightbox when clicking the close button', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<Console outputLines={lines} />);
        (screen.container.querySelector('img') as HTMLElement).click();
        await screen.getByRole('button', { name: '×' }).click();

        await expect.element(screen.getByRole('button', { name: '×' })).not.toBeInTheDocument();
    });

    it('should save image when clicking Save in lightbox', async () => {
        const lines: OutputLine[] = [
            { text: 'screenshot', type: 'command' },
            { text: '', type: 'screenshot', image: testImage },
        ];
        const screen = await render(<Console outputLines={lines} />);
        (screen.container.querySelector('img') as HTMLElement).click();
        await screen.getByRole('button', { name: 'Save' }).click();

        expect(saveImageToFile).toHaveBeenCalledWith(testImage);
    });

    it('should render screenshot image when command returns image', async () => {
        vi.mocked(executeCommandForConsole).mockResolvedValue({ text: '', image: testImage });
        const screen = await render(<Console />);

        await typeInEditor(screen, 'screenshot');
        await userEvent.keyboard('{Escape}');
        await userEvent.keyboard('{Enter}');

        await expect.element(screen.getByText('screenshot')).toBeInTheDocument();
        await expect.element(screen.getByRole('img')).toBeInTheDocument();
    });

});
