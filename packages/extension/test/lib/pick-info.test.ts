import { describe, it, expect, vi } from 'vitest';
import { buildPickResult } from '@/lib/pick-info';
import type { ElementPickInfo } from '@/types';

vi.mock('@/lib/sw-debugger', () => ({
    swDebugEval: vi.fn(),
}));

function makeInfo(overrides: Partial<ElementPickInfo> = {}): ElementPickInfo {
    return {
        locator: "getByRole('button', { name: 'Submit' })",
        tag: 'button',
        text: 'Submit',
        html: '<button>Submit</button>',
        attributes: {},
        visible: true,
        enabled: true,
        box: { x: 0, y: 0, width: 100, height: 40 },
        ...overrides,
    };
}

describe('buildPickResult', () => {
    // ─── Locator section ──────────────────────────────────────────────────

    it('builds locator and jsExpression from element info', () => {
        const result = buildPickResult(makeInfo());
        expect(result.locator).toBe("page.getByRole('button', { name: 'Submit' })");
        expect(result.jsExpression).toBe("await page.getByRole('button', { name: 'Submit' }).highlight();");
    });

    it('prefers content script locator over pwLocator for getByRole', () => {
        const result = buildPickResult(makeInfo({ pwLocator: "getByRole('button', { name: 'Submit' }).first()" }));
        expect(result.locator).toBe("page.getByRole('button', { name: 'Submit' })");
    });

    it('uses pwLocator when content script locator is CSS fallback', () => {
        const result = buildPickResult(makeInfo({
            locator: "locator('div.content')",
            pwLocator: "getByText('Cross-browser')",
        }));
        expect(result.locator).toBe("page.getByText('Cross-browser')");
    });

    it('derives pw command from role + name', () => {
        const result = buildPickResult(makeInfo());
        expect(result.pwCommand).toBe('highlight button "Submit"');
    });

    // ─── Assert: text (default for elements with text) ────────────────────

    it('derives text assertion for button', () => {
        const result = buildPickResult(makeInfo());
        expect(result.assertJs).toBe("await expect(page.getByRole('button', { name: 'Submit' })).toContainText('Submit');");
        expect(result.assertPw).toBe('verify-element button "Submit"');
    });

    it('derives text assertion for link', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('link', { name: 'Home' })",
            tag: 'a',
            text: 'Home',
            attributes: { href: '/' },
        }));
        expect(result.assertJs).toContain("toContainText('Home')");
        expect(result.assertPw).toBe('verify-element link "Home"');
    });

    it('derives pw command from Playwright locator when content script locator is CSS', () => {
        const result = buildPickResult(makeInfo({
            locator: "locator('p.hero')",
            pwLocator: "getByText('Cross-browser. Playwright')",
            tag: 'p',
            text: 'Cross-browser. Playwright supports all modern rendering engines including Chromium, WebKit, and Firefox.',
        }));
        // pw command should come from Playwright's locator, not the CSS fallback
        expect(result.pwCommand).toBe('highlight "Cross-browser. Playwright"');
        // getByText locator → toBeVisible (toContainText would be redundant)
        expect(result.assertJs).toBe("await expect(page.getByText('Cross-browser. Playwright')).toBeVisible();");
        expect(result.assertPw).toBe('verify-text "Cross-browser. Playwright"');
    });

    it('uses full text when no locator name can be extracted', () => {
        const longText = 'A'.repeat(100);
        const result = buildPickResult(makeInfo({
            locator: "locator('div.content')",
            tag: 'div',
            text: longText,
        }));
        // No truncation — uses the full info.text
        expect(result.assertJs).toContain(`toContainText('${longText}')`);
        expect(result.assertPw).toContain(`verify-text "${longText}"`);
    });

    // ─── Assert: value (input/textarea/select) ───────────────────────────

    it('derives value assertion for text input', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByLabel('Email')",
            tag: 'input',
            text: '',
            attributes: { type: 'text' },
            value: 'alice@test.com',
        }));
        expect(result.assertJs).toBe("await expect(page.getByLabel('Email')).toHaveValue('alice@test.com');");
        expect(result.assertPw).toBe('verify-value "Email" "alice@test.com"');
    });

    it('derives value assertion for textarea', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByLabel('Bio')",
            tag: 'textarea',
            text: 'Hello world',
            attributes: {},
            value: 'Hello world',
        }));
        expect(result.assertJs).toContain("toHaveValue('Hello world')");
        expect(result.assertPw).toContain('verify-value "Bio"');
    });

    it('derives value assertion for select', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByLabel('Country')",
            tag: 'select',
            text: 'US',
            attributes: {},
            value: 'US',
        }));
        expect(result.assertJs).toContain("toHaveValue('US')");
        expect(result.assertPw).toBe('verify-value "Country" "US"');
    });

    it('derives value assertion for date input', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByLabel('Birthday')",
            tag: 'input',
            text: '',
            attributes: { type: 'date' },
            value: '2026-01-01',
        }));
        expect(result.assertJs).toContain("toHaveValue('2026-01-01')");
        expect(result.assertPw).toBe('verify-value "Birthday" "2026-01-01"');
    });

    it('falls back to text assertion when input has no value', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByLabel('Search')",
            tag: 'input',
            text: 'Search',
            attributes: { type: 'text' },
            value: undefined,
        }));
        expect(result.assertJs).toContain('toContainText');
    });

    // ─── Assert: checked (checkbox/radio) ─────────────────────────────────

    it('derives checked assertion for checked checkbox', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('checkbox', { name: 'Accept' })",
            tag: 'input',
            text: '',
            attributes: { type: 'checkbox' },
            checked: true,
        }));
        expect(result.assertJs).toBe("await expect(page.getByRole('checkbox', { name: 'Accept' })).toBeChecked();");
        expect(result.assertPw).toBe('verify-value "Accept" "on"');
    });

    it('derives not-checked assertion for unchecked checkbox', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('checkbox', { name: 'Accept' })",
            tag: 'input',
            text: '',
            attributes: { type: 'checkbox' },
            checked: false,
        }));
        expect(result.assertJs).toBe("await expect(page.getByRole('checkbox', { name: 'Accept' })).not.toBeChecked();");
        expect(result.assertPw).toBe('verify-value "Accept" "off"');
    });

    it('derives checked assertion for radio button', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('radio', { name: 'Yes' })",
            tag: 'input',
            text: '',
            attributes: { type: 'radio' },
            checked: true,
        }));
        expect(result.assertJs).toContain('toBeChecked()');
        expect(result.assertPw).toContain('verify-value "Yes" "on"');
    });

    // ─── Assert: visible (fallback) ───────────────────────────────────────

    it('derives visible assertion when no text/value/checked', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('img')",
            tag: 'img',
            text: '',
            attributes: {},
        }));
        expect(result.assertJs).toBe("await expect(page.getByRole('img')).toBeVisible();");
        expect(result.assertPw).toBe('verify-text');
    });

    it('derives verify-element with role + name for image with alt', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('img', { name: 'Logo' })",
            tag: 'img',
            text: '',
            attributes: { alt: 'Logo' },
        }));
        expect(result.assertJs).toBe("await expect(page.getByRole('img', { name: 'Logo' })).toBeVisible();");
        expect(result.assertPw).toBe('verify-element img "Logo"');
    });

    it('derives verify-text for named element without role', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByTestId('icon')",
            tag: 'span',
            text: '',
            attributes: { 'data-testid': 'icon' },
        }));
        expect(result.assertJs).toContain('toBeVisible()');
        expect(result.assertPw).toBe('verify-text "icon"');
    });

    // ─── Priority: checked > value > text > visible ───────────────────────

    it('prefers checked over value for checkbox', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('checkbox', { name: 'Accept' })",
            tag: 'input',
            text: 'Accept terms',
            attributes: { type: 'checkbox' },
            value: 'on',
            checked: true,
        }));
        expect(result.assertJs).toContain('toBeChecked()');
    });

    it('prefers value over text for input', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByLabel('Name')",
            tag: 'input',
            text: 'Some label text',
            attributes: { type: 'text' },
            value: 'Alice',
        }));
        expect(result.assertJs).toContain("toHaveValue('Alice')");
    });

    // ─── Details passthrough ──────────────────────────────────────────────

    it('passes value and checked into details', () => {
        const result = buildPickResult(makeInfo({
            tag: 'input',
            attributes: { type: 'checkbox' },
            value: 'on',
            checked: true,
        }));
        expect(result.details?.value).toBe('on');
        expect(result.details?.checked).toBe(true);
    });

    // ─── Exact match + nth disambiguation ──────────────────────────────────

    it('handles locator with exact: true and .first()', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('tab', { name: 'npm', exact: true }).first()",
            tag: 'div',
            text: 'npm',
            attributes: { role: 'tab' },
        }));
        expect(result.locator).toBe("page.getByRole('tab', { name: 'npm', exact: true }).first()");
        expect(result.pwCommand).toBe('highlight tab "npm" --nth 0');
        expect(result.assertJs).toBe("await expect(page.getByRole('tab', { name: 'npm', exact: true }).first()).toContainText('npm');");
        expect(result.assertPw).toBe('verify-element tab "npm" --nth 0');
    });

    it('handles locator with exact: true and .nth(1)', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('tab', { name: 'npm', exact: true }).nth(1)",
            tag: 'div',
            text: 'npm',
            attributes: { role: 'tab' },
        }));
        expect(result.pwCommand).toBe('highlight tab "npm" --nth 1');
        expect(result.assertPw).toBe('verify-element tab "npm" --nth 1');
    });

    it('handles role without exact (no disambiguation)', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByRole('tab', { name: 'Getting Started' })",
            tag: 'div',
            text: 'Getting Started',
            attributes: { role: 'tab' },
        }));
        expect(result.pwCommand).toBe('highlight tab "Getting Started"');
        expect(result.assertPw).toBe('verify-element tab "Getting Started"');
    });

    it('uses verify-text (not verify-element) when locator has no role', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByText('Hello world')",
            tag: 'p',
            text: 'Hello world',
            attributes: {},
        }));
        // getByText → toBeVisible (toContainText would be redundant)
        expect(result.assertJs).toContain('toBeVisible()');
        expect(result.assertPw).toBe('verify-text "Hello world"');
    });

    // ─── Escaping ─────────────────────────────────────────────────────────

    it('escapes single quotes in value assertion', () => {
        const result = buildPickResult(makeInfo({
            locator: "getByLabel('Note')",
            tag: 'input',
            text: '',
            attributes: { type: 'text' },
            value: "it's a test",
        }));
        expect(result.assertJs).toContain("toHaveValue('it\\'s a test')");
    });

    it('escapes single quotes in text assertion', () => {
        const result = buildPickResult(makeInfo({
            locator: "locator('div.content')",
            tag: 'div',
            text: "it's a button",
        }));
        expect(result.assertJs).toContain("toContainText('it\\'s a button')");
    });
});
