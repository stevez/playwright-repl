import { describe, it, expect, vi } from 'vitest';
import { render } from 'vitest-browser-react';

vi.mock('@/lib/sw-debugger', () => ({
    swDebugEval: vi.fn(),
}));

import { ObjectTree } from '@/components/Console/ObjectTree';
import { pickResultToSerialized } from '@/lib/pick-info';
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

function renderPick(overrides: Partial<PickResultData> = {}) {
    return render(<ObjectTree data={pickResultToSerialized(makeData(overrides))} noQuote />);
}

/** Click the toggle for a named section (locator, assert, element) to expand it. */
function expandSection(container: Element, name: string) {
    // Find the .ot-node whose .ot-key text matches, then click its .ot-toggle
    const nodes = container.querySelectorAll('.ot-node');
    for (const node of nodes) {
        const key = node.querySelector(':scope > .ot-key');
        if (key?.textContent === name) {
            const toggle = node.querySelector(':scope > .ot-toggle');
            if (toggle) (toggle as HTMLElement).click();
            return;
        }
    }
}

describe('PickResult via ObjectTree', () => {
    // ─── Locator section ──────────────────────────────────────────────────

    it('renders locator section header', async () => {
        const screen = await renderPick();
        await expect.element(screen.getByText('locator')).toBeInTheDocument();
    });

    it('renders locator collapsed summary with keys', async () => {
        const screen = await renderPick();
        // Both locator and assert show {js, pw} — just check at least one exists
        const allText = screen.container.textContent ?? '';
        expect(allText).toContain('{js, pw}');
    });

    it('renders js sub-row when locator section is expanded', async () => {
        const screen = await renderPick();
        expandSection(screen.container, 'locator');
        await expect.element(screen.getByText("await page.getByRole('button', { name: 'Submit' }).highlight();")).toBeInTheDocument();
    });

    it('renders pw sub-row when locator section is expanded', async () => {
        const screen = await renderPick();
        expandSection(screen.container, 'locator');
        await expect.element(screen.getByText('highlight button "Submit"')).toBeInTheDocument();
    });

    it('hides pw sub-row when pwCommand is null', async () => {
        const screen = await renderPick({ pwCommand: null });
        expandSection(screen.container, 'locator');
        // Wait for the js expression to appear after expand
        await expect.element(screen.getByText(/highlight\(\);/)).toBeInTheDocument();
        const allText = screen.container.textContent ?? '';
        expect(allText).not.toContain('highlight button');
    });

    // ─── Assert section ───────────────────────────────────────────────────

    it('renders assert section header', async () => {
        const screen = await renderPick();
        await expect.element(screen.getByText('assert')).toBeInTheDocument();
    });

    it('renders assert js sub-row when expanded', async () => {
        const screen = await renderPick();
        expandSection(screen.container, 'assert');
        await expect.element(screen.getByText("await expect(page.getByRole('button', { name: 'Submit' })).toContainText('Submit');")).toBeInTheDocument();
    });

    it('renders assert pw sub-row when expanded', async () => {
        const screen = await renderPick();
        expandSection(screen.container, 'assert');
        await expect.element(screen.getByText('verify-text "Submit"')).toBeInTheDocument();
    });

    it('hides assert section when assertJs is undefined', async () => {
        const screen = await renderPick({ assertJs: undefined, assertPw: undefined });
        const allText = screen.container.textContent ?? '';
        expect(allText).not.toContain('assert');
        expect(allText).not.toContain('verify-');
    });

    it('hides assert pw row when assertPw is undefined', async () => {
        const screen = await renderPick({ assertPw: undefined });
        expandSection(screen.container, 'assert');
        await expect.element(screen.getByText('assert')).toBeInTheDocument();
        const allText = screen.container.textContent ?? '';
        expect(allText).not.toContain('verify-');
    });

    // ─── Checkbox assertion ───────────────────────────────────────────────

    it('renders checked assertion for checkbox', async () => {
        const screen = await renderPick({
            assertJs: "await expect(page.getByRole('checkbox', { name: 'Accept' })).toBeChecked();",
            assertPw: 'verify-value "Accept" "on"',
        });
        expandSection(screen.container, 'assert');
        await expect.element(screen.getByText(/toBeChecked/)).toBeInTheDocument();
        await expect.element(screen.getByText('verify-value "Accept" "on"')).toBeInTheDocument();
    });

    // ─── Value assertion ──────────────────────────────────────────────────

    it('renders value assertion for input', async () => {
        const screen = await renderPick({
            assertJs: "await expect(page.getByLabel('Email')).toHaveValue('alice@test.com');",
            assertPw: 'verify-value "Email" "alice@test.com"',
        });
        expandSection(screen.container, 'assert');
        await expect.element(screen.getByText(/toHaveValue/)).toBeInTheDocument();
        await expect.element(screen.getByText('verify-value "Email" "alice@test.com"')).toBeInTheDocument();
    });

    // ─── Element details ──────────────────────────────────────────────────

    it('renders element section header', async () => {
        const screen = await renderPick();
        await expect.element(screen.getByText('element')).toBeInTheDocument();
    });

    it('expands element details on toggle click', async () => {
        const screen = await renderPick();
        expandSection(screen.container, 'element');
        await expect.element(screen.getByText('<button>Submit</button>')).toBeInTheDocument();
        await expect.element(screen.getByText('button', { exact: true })).toBeInTheDocument();
    });

    // ─── Sections order ──────────────────────────────────────────────────

    it('renders sections in order: locator, assert, element', async () => {
        const screen = await renderPick();
        const text = screen.container.textContent ?? '';
        const locatorIdx = text.indexOf('locator');
        const assertIdx = text.indexOf('assert');
        const elementIdx = text.indexOf('element');
        expect(locatorIdx).toBeLessThan(assertIdx);
        expect(assertIdx).toBeLessThan(elementIdx);
    });
});
