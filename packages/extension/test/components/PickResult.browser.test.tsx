import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { PickResult } from '@/components/Console/PickResult';
import type { PickResultData } from '@/types';

function makeData(overrides: Partial<PickResultData> = {}): PickResultData {
    return {
        locator: "page.getByRole('button', { name: 'Submit' })",
        pwCommand: 'highlight button "Submit"',
        jsExpression: "await page.getByRole('button', { name: 'Submit' }).highlight();",
        assertJs: "await expect(page.getByRole('button', { name: 'Submit' })).toContainText('Submit');",
        assertPw: 'verify-text "Submit"',
        details: {
            tag: 'button',
            text: 'Submit',
            html: '<button>Submit</button>',
            visible: true,
            enabled: true,
            count: 1,
            attributes: {},
        },
        ...overrides,
    };
}

describe('PickResult component', () => {
    // ─── Locator section ──────────────────────────────────────────────────

    it('renders locator section header', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        await expect.element(screen.getByText('locator')).toBeInTheDocument();
    });

    it('renders js sub-row with highlight expression', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        await expect.element(screen.getByText("await page.getByRole('button', { name: 'Submit' }).highlight();")).toBeInTheDocument();
    });

    it('renders pw sub-row with highlight command', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        await expect.element(screen.getByText('highlight button "Submit"')).toBeInTheDocument();
    });

    it('hides pw sub-row when pwCommand is null', async () => {
        const screen = await render(<PickResult data={makeData({ pwCommand: null })} />);
        // Only js row should exist under locator, no pw
        const allText = screen.container.textContent ?? '';
        expect(allText).toContain('highlight();');
        expect(allText).not.toContain('highlight button');
    });

    // ─── Assert section ───────────────────────────────────────────────────

    it('renders assert section header', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        await expect.element(screen.getByText('assert')).toBeInTheDocument();
    });

    it('renders assert js sub-row', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        await expect.element(screen.getByText("await expect(page.getByRole('button', { name: 'Submit' })).toContainText('Submit');")).toBeInTheDocument();
    });

    it('renders assert pw sub-row', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        await expect.element(screen.getByText('verify-text "Submit"')).toBeInTheDocument();
    });

    it('hides assert section when assertJs is undefined', async () => {
        const screen = await render(<PickResult data={makeData({ assertJs: undefined, assertPw: undefined })} />);
        const allText = screen.container.textContent ?? '';
        expect(allText).not.toContain('assert');
        expect(allText).not.toContain('verify-');
    });

    it('hides assert pw row when assertPw is undefined', async () => {
        const screen = await render(<PickResult data={makeData({ assertPw: undefined })} />);
        await expect.element(screen.getByText('assert')).toBeInTheDocument();
        const assertSection = screen.container.textContent ?? '';
        expect(assertSection).not.toContain('verify-');
    });

    // ─── Checkbox assertion ───────────────────────────────────────────────

    it('renders checked assertion for checkbox', async () => {
        const screen = await render(<PickResult data={makeData({
            assertJs: "await expect(page.getByRole('checkbox', { name: 'Accept' })).toBeChecked();",
            assertPw: 'verify-value "Accept" "on"',
        })} />);
        await expect.element(screen.getByText(/toBeChecked/)).toBeInTheDocument();
        await expect.element(screen.getByText('verify-value "Accept" "on"')).toBeInTheDocument();
    });

    // ─── Value assertion ──────────────────────────────────────────────────

    it('renders value assertion for input', async () => {
        const screen = await render(<PickResult data={makeData({
            assertJs: "await expect(page.getByLabel('Email')).toHaveValue('alice@test.com');",
            assertPw: 'verify-value "Email" "alice@test.com"',
        })} />);
        await expect.element(screen.getByText(/toHaveValue/)).toBeInTheDocument();
        await expect.element(screen.getByText('verify-value "Email" "alice@test.com"')).toBeInTheDocument();
    });

    // ─── Element details ──────────────────────────────────────────────────

    it('renders expandable element details', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        await expect.element(screen.getByText('element')).toBeInTheDocument();
        // Details should be collapsed by default
        const allText = screen.container.textContent ?? '';
        expect(allText).not.toContain('<button>Submit</button>');
    });

    it('expands element details on toggle click', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        (screen.container.querySelector('.ot-toggle') as HTMLElement).click();
        await expect.element(screen.getByText('<button>Submit</button>')).toBeInTheDocument();
        await expect.element(screen.getByText('"button"')).toBeInTheDocument();
    });

    // ─── Sections order ──────────────────────────────────────────────────

    it('renders sections in order: locator, assert, element', async () => {
        const screen = await render(<PickResult data={makeData()} />);
        const text = screen.container.textContent ?? '';
        const locatorIdx = text.indexOf('locator');
        const assertIdx = text.indexOf('assert');
        const elementIdx = text.indexOf('element');
        expect(locatorIdx).toBeLessThan(assertIdx);
        expect(assertIdx).toBeLessThan(elementIdx);
    });
});
