import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { ConsoleEntry } from '@/components/Console/ConsoleEntry';
import type { ConsoleEntry as Entry } from '@/components/Console/types';

vi.mock('@/lib/file-utils', () => ({
    saveImageToFile: vi.fn(),
}));
import { saveImageToFile } from '@/lib/file-utils';

vi.mock('@/lib/bridge', () => ({
    cdpGetProperties: vi.fn().mockResolvedValue({ result: [] }),
}));

const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

const codeBlock = `import { test, expect } from '@playwright/test';

test('recorded session', async ({ page }) => {
  await page.goto("https://example.com");
});`.trim();

function makeEntry(overrides: Partial<Entry>): Entry {
    return { id: '1', input: 'snapshot', status: 'done', ...overrides };
}

describe('ConsoleEntry component tests', () => {

    it('should render the input command', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ input: 'click e5' })} />);
        await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    });

    it('should render pending indicator', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ status: 'pending' })} />);
        await expect.element(screen.getByText('…')).toBeInTheDocument();
    });

    it('should render success text', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ text: 'Done' })} />);
        await expect.element(screen.getByText('Done')).toBeInTheDocument();
    });

    it('should render error text', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ status: 'error', errorText: 'Element not found' })} />);
        await expect.element(screen.getByText('Element not found')).toBeInTheDocument();
    });

    it('should render code-block with pre content', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ codeBlock })} />);
        await expect.element(screen.getByText('@playwright/test', { exact: false })).toBeInTheDocument();
        await expect.element(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    });

    it('should copy code-block content to clipboard on Copy click', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined);
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            writable: true,
            configurable: true,
        });

        const screen = await render(<ConsoleEntry entry={makeEntry({ codeBlock })} />);
        await screen.getByRole('button', { name: 'Copy' }).click();

        expect(writeText).toHaveBeenCalledWith(codeBlock);
    });

    it('should render screenshot image as thumbnail', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ image: testImage })} />);
        await expect.element(screen.getByRole('img')).toBeInTheDocument();
    });

    it('should open lightbox when clicking the thumbnail image', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ image: testImage })} />);
        (screen.container.querySelector('img') as HTMLElement).click();
        await expect.element(screen.getByRole('button', { name: '×' })).toBeInTheDocument();
    });

    it('should close lightbox when clicking the close button', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ image: testImage })} />);
        (screen.container.querySelector('img') as HTMLElement).click();
        await screen.getByRole('button', { name: '×' }).click();
        await expect.element(screen.getByRole('button', { name: '×' })).not.toBeInTheDocument();
    });

    it('should call saveImageToFile when clicking Save in lightbox', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ image: testImage })} />);
        (screen.container.querySelector('img') as HTMLElement).click();
        await screen.getByRole('button', { name: 'Save' }).click();
        expect(saveImageToFile).toHaveBeenCalledWith(testImage);
    });

    // ─── ObjectTree rendering ─────────────────────────────────────────────────

    it('should render ObjectTree for a string value', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ value: { __type: 'string', v: 'hello' } })} />);
        await expect.element(screen.getByText('"hello"', { exact: false })).toBeInTheDocument();
    });

    it('should render ObjectTree for a number value', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ value: { __type: 'number', v: 42 } })} />);
        await expect.element(screen.getByText('42')).toBeInTheDocument();
    });

    it('should render ObjectTree summary for an empty object value', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ value: { __type: 'object', cls: 'Object', props: {} } })} />);
        await expect.element(screen.getByText('Object {}')).toBeInTheDocument();
    });

    it('should render ObjectTree summary header for an array value', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({
            value: {
                __type: 'array', cls: 'Array', len: 3,
                props: {
                    '0': { __type: 'number', v: 1 },
                    '1': { __type: 'number', v: 2 },
                    '2': { __type: 'number', v: 3 },
                }
            }
        })} />);
        await expect.element(screen.getByText('Array(3)', { exact: false })).toBeInTheDocument();
    });

    it('should set data-type="success" on ObjectTree container', async () => {
        const screen = await render(<ConsoleEntry entry={makeEntry({ value: { __type: 'string', v: 'ok' } })} />);
        expect(screen.container.querySelector('[data-type="success"]')).toBeTruthy();
    });

});
