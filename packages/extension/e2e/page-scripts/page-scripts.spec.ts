/**
 * Integration tests for page-scripts.ts functions using a real Playwright page.
 *
 * These tests run each function against a real DOM, covering the inline
 * closures (page.evaluate callbacks) that unit tests with mocks cannot reach.
 */

import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

import {
    verifyText, verifyElement, verifyValue, verifyList, verifyTitle, verifyUrl,
    verifyNoText, verifyNoElement, verifyVisible, verifyInputValue,
    actionByText, fillByText, selectByText, checkByText, uncheckByText,
    highlightByText, highlightByRole, highlightBySelector,
    chainAction,
    goBack, goForward, gotoUrl, reloadPage,
    waitMs,
    getTitle, getUrl,
    evalCode, runCode,
    takeScreenshot,
    pressKey, typeText,
    localStorageGet, localStorageSet, localStorageDelete, localStorageClear, localStorageList,
    sessionStorageGet, sessionStorageSet, sessionStorageDelete, sessionStorageClear, sessionStorageList,
    cookieList, cookieGet, cookieClear,
} from '../../src/panel/lib/page-scripts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_URL = pathToFileURL(path.resolve(__dirname, 'fixture.html')).href;

test.beforeEach(async ({ page }) => {
    await page.goto(FIXTURE_URL);
});

// ─── Verify functions ─────────────────────────────────────────────────────

test.describe('verifyText', () => {
    test('passes when text is visible', async ({ page }) => {
        await expect(verifyText(page, 'Welcome')).resolves.toBeUndefined();
    });

    test('throws when text is not found', async ({ page }) => {
        await expect(verifyText(page, 'Nonexistent XYZ')).rejects.toThrow('Text not found');
    });
});

test.describe('verifyElement', () => {
    test('passes when element exists', async ({ page }) => {
        await expect(verifyElement(page, 'button', 'Submit')).resolves.toBeUndefined();
    });

    test('throws when element is missing', async ({ page }) => {
        await expect(verifyElement(page, 'button', 'Nonexistent')).rejects.toThrow('Element not found');
    });
});

test.describe('verifyTitle', () => {
    test('passes when title contains text', async ({ page }) => {
        await expect(verifyTitle(page, 'Page Scripts')).resolves.toBeUndefined();
    });

    test('throws when title does not contain text', async ({ page }) => {
        await expect(verifyTitle(page, 'Wrong Title')).rejects.toThrow('does not contain');
    });
});

test.describe('verifyUrl', () => {
    test('passes when URL contains text', async ({ page }) => {
        await expect(verifyUrl(page, 'fixture')).resolves.toBeUndefined();
    });

    test('throws when URL does not contain text', async ({ page }) => {
        await expect(verifyUrl(page, 'nonexistent-path')).rejects.toThrow('does not contain');
    });
});

test.describe('verifyNoText', () => {
    test('passes when text is absent', async ({ page }) => {
        await expect(verifyNoText(page, 'Nonexistent XYZ')).resolves.toBeUndefined();
    });

    test('throws when text is visible', async ({ page }) => {
        await expect(verifyNoText(page, 'Welcome')).rejects.toThrow('Text still visible');
    });
});

test.describe('verifyNoElement', () => {
    test('passes when element is absent', async ({ page }) => {
        await expect(verifyNoElement(page, 'button', 'Nonexistent')).resolves.toBeUndefined();
    });

    test('throws when element exists', async ({ page }) => {
        await expect(verifyNoElement(page, 'button', 'Submit')).rejects.toThrow('Element still exists');
    });
});

test.describe('verifyVisible', () => {
    test('passes when element is visible', async ({ page }) => {
        await expect(verifyVisible(page, 'button', 'Submit')).resolves.toBeUndefined();
    });

    test('throws when element is not visible', async ({ page }) => {
        await expect(verifyVisible(page, 'button', 'Nonexistent')).rejects.toThrow('Element not visible');
    });
});

test.describe('verifyValue', () => {
    test('passes when value matches', async ({ page }) => {
        await expect(verifyValue(page, 'e1', 'hello')).resolves.toBeUndefined();
    });

    test('throws when value does not match', async ({ page }) => {
        await expect(verifyValue(page, 'e1', 'wrong')).rejects.toThrow('Expected "wrong", got "hello"');
    });
});

test.describe('verifyList', () => {
    test('passes when all items are found', async ({ page }) => {
        await expect(verifyList(page, 'e2', ['Apple', 'Banana'])).resolves.toBeUndefined();
    });

    test('throws when an item is missing', async ({ page }) => {
        await expect(verifyList(page, 'e2', ['Apple', 'Mango'])).rejects.toThrow('Item not found: Mango');
    });
});

test.describe('verifyInputValue', () => {
    test('text input matches value', async ({ page }) => {
        await page.fill('#name-input', 'Alice');
        await expect(verifyInputValue(page, 'Name', 'Alice')).resolves.toBeUndefined();
    });

    test('text input throws on mismatch', async ({ page }) => {
        await page.fill('#name-input', 'Bob');
        await expect(verifyInputValue(page, 'Name', 'Alice')).rejects.toThrow('Expected "Alice"');
    });

    test('checkbox checked state', async ({ page }) => {
        await page.check('#accept-cb');
        await expect(verifyInputValue(page, 'Accept terms', 'checked')).resolves.toBeUndefined();
    });

    test('checkbox unchecked state', async ({ page }) => {
        await expect(verifyInputValue(page, 'Accept terms', 'checked')).rejects.toThrow('to be checked');
    });

    test('radio group selected value', async ({ page }) => {
        await page.check('#color-red');
        await expect(verifyInputValue(page, 'Color', 'Red')).resolves.toBeUndefined();
    });

    test('radio group throws on wrong selection', async ({ page }) => {
        await page.check('#color-red');
        await expect(verifyInputValue(page, 'Color', 'Blue')).rejects.toThrow('Expected "Blue"');
    });

    test('radio group throws when none selected', async ({ page }) => {
        await expect(verifyInputValue(page, 'Color', 'Red')).rejects.toThrow('No radio button selected');
    });

    test('throws when label not found', async ({ page }) => {
        await expect(verifyInputValue(page, 'Nonexistent Label', 'x')).rejects.toThrow('Element not found');
    });

    test('number input (spinbutton fallback)', async ({ page }) => {
        await expect(verifyInputValue(page, 'Age', '25')).resolves.toBeUndefined();
    });
});

// ─── Text locator actions ─────────────────────────────────────────────────

test.describe('actionByText', () => {
    test('clicks a button by text', async ({ page }) => {
        await page.evaluate(() => {
            document.querySelector('button')!.addEventListener('click', () => {
                (window as unknown as Record<string, unknown>).__clicked = true;
            });
        });
        await actionByText(page, 'Submit', 'click', undefined);
        const clicked = await page.evaluate(() => (window as unknown as Record<string, unknown>).__clicked);
        expect(clicked).toBe(true);
    });
});

test.describe('fillByText', () => {
    test('fills input by label', async ({ page }) => {
        await fillByText(page, 'Name', 'Alice', undefined);
        expect(await page.inputValue('#name-input')).toBe('Alice');
    });

    test('fills input by placeholder', async ({ page }) => {
        await fillByText(page, 'Enter email', 'a@b.com', undefined);
        expect(await page.inputValue('#email-input')).toBe('a@b.com');
    });
});

test.describe('selectByText', () => {
    test('selects option by label', async ({ page }) => {
        await selectByText(page, 'Size', 'l', undefined);
        expect(await page.inputValue('#size-select')).toBe('l');
    });

    test('informal label picks same-cell select, not first in row (#800)', async ({ page }) => {
        // Two selects in the same <tr>, each in its own <td> with a label span.
        // selectByText("Select/Type*") must find select2 (same cell), not select1.
        await selectByText(page, 'Select/Type*', 'type2', undefined);
        expect(await page.inputValue('#select2')).toBe('type2');
        // select1 must remain unchanged
        expect(await page.inputValue('#select1')).toBe('value1');
    });
});

test.describe('checkByText / uncheckByText', () => {
    test('checks and unchecks checkbox by label', async ({ page }) => {
        await checkByText(page, 'Accept terms', undefined);
        expect(await page.isChecked('#accept-cb')).toBe(true);

        await uncheckByText(page, 'Accept terms', undefined);
        expect(await page.isChecked('#accept-cb')).toBe(false);
    });
});

// ─── Highlight ────────────────────────────────────────────────────────────

test.describe('highlight', () => {
    test('highlightByText returns message', async ({ page }) => {
        const result = await highlightByText(page, 'Welcome');
        expect(result).toMatch(/^Highlighted \d+ element/);
    });

    test('highlightBySelector returns message', async ({ page }) => {
        const result = await highlightBySelector(page, 'h1');
        expect(result).toMatch(/^Highlighted \d+ element/);
    });

    test('highlightByRole with text-only --in scopes to section', async ({ page }) => {
        // "Yes" radio appears 3 times — text-only --in scopes to the right section
        const scopedResult = await highlightByRole(page, 'radio', 'Yes', undefined, undefined, 'Billing Address');
        expect(scopedResult).toBe('Highlighted 1 element');
    });
});

// ─── Chaining ─────────────────────────────────────────────────────────────

test.describe('chainAction', () => {
    test('fills by chained selector', async ({ page }) => {
        const result = await chainAction(page, '#name-input', 'fill', 'Chained');
        expect(result).toBe('Done');
        expect(await page.inputValue('#name-input')).toBe('Chained');
    });

    test('clicks by chained selector', async ({ page }) => {
        const result = await chainAction(page, 'button:has-text("Submit")', 'click', undefined);
        expect(result).toBe('Done');
    });
});

// ─── Navigation ───────────────────────────────────────────────────────────

test.describe('navigation', () => {
    test('gotoUrl navigates and returns message', async ({ page }) => {
        const result = await gotoUrl(page, FIXTURE_URL);
        expect(result).toContain('Navigated to');
    });

    test('goBack and goForward', async ({ page }) => {
        await page.goto('about:blank');
        await page.goto(FIXTURE_URL);
        const backUrl = await goBack(page);
        expect(backUrl).toContain('blank');
        const fwdUrl = await goForward(page);
        expect(fwdUrl).toContain('fixture');
    });

    test('reloadPage returns message', async ({ page }) => {
        const result = await reloadPage(page);
        expect(result).toBe('Reloaded');
    });
});

// ─── Timing ───────────────────────────────────────────────────────────────

test.describe('waitMs', () => {
    test('returns wait message', async ({ page }) => {
        const result = await waitMs(page, 10);
        expect(result).toBe('Waited 10ms');
    });
});

// ─── Page info ────────────────────────────────────────────────────────────

test.describe('page info', () => {
    test('getTitle returns page title', async ({ page }) => {
        expect(await getTitle(page)).toBe('Page Scripts Test Fixture');
    });

    test('getUrl returns current URL', async ({ page }) => {
        expect(await getUrl(page)).toContain('fixture.html');
    });
});

// ─── Eval ─────────────────────────────────────────────────────────────────

test.describe('evalCode', () => {
    test('returns stringified result', async ({ page }) => {
        const result = await evalCode(page, 'document.title');
        expect(result).toContain('Page Scripts');
    });

    test('returns "undefined" for void', async ({ page }) => {
        expect(await evalCode(page, 'void 0')).toBe('undefined');
    });
});

// ─── Run Code ─────────────────────────────────────────────────────────────

test.describe('runCode', () => {
    test('returns string result', async ({ page }) => {
        const result = await runCode(page, 'await page.title()');
        expect(result).toContain('Page Scripts');
    });

    test('returns Done for void actions', async ({ page }) => {
        const result = await runCode(page, "await page.click('button')");
        expect(result).toBe('Done');
    });

    test('handles function expression', async ({ page }) => {
        const result = await runCode(page, 'async (page) => await page.title()');
        expect(result).toContain('Page Scripts');
    });
});

// ─── Screenshot ───────────────────────────────────────────────────────────

test.describe('takeScreenshot', () => {
    test('returns base64 image', async ({ page }) => {
        const result = await takeScreenshot(page, false);
        expect(result.__image).toBeTruthy();
        expect(result.mimeType).toBe('image/jpeg');
    });
});

// ─── Press / Type ─────────────────────────────────────────────────────────

test.describe('pressKey', () => {
    test('presses global key', async ({ page }) => {
        const result = await pressKey(page, 'Tab', 'Tab');
        expect(result).toBe('Pressed Tab');
    });

    test('presses key on text-matched element', async ({ page }) => {
        await page.focus('#name-input');
        await page.keyboard.type('test');
        const result = await pressKey(page, 'Name', 'Backspace');
        expect(result).toBe('Pressed Backspace');
    });
});

test.describe('typeText', () => {
    test('types text via keyboard', async ({ page }) => {
        await page.focus('#name-input');
        const result = await typeText(page, 'hello');
        expect(result).toBe('Typed');
        expect(await page.inputValue('#name-input')).toBe('hello');
    });
});

// ─── localStorage ─────────────────────────────────────────────────────────

test.describe('localStorage', () => {
    test('set, get, list, delete, clear', async ({ page }) => {
        expect(await localStorageSet(page, 'key1', 'val1')).toBe('Set');
        expect(await localStorageSet(page, 'key2', 'val2')).toBe('Set');

        expect(await localStorageGet(page, 'key1')).toBe('val1');

        const list = JSON.parse(await localStorageList(page));
        expect(list).toHaveProperty('key1', 'val1');
        expect(list).toHaveProperty('key2', 'val2');

        expect(await localStorageDelete(page, 'key1')).toBe('Deleted');
        expect(await localStorageGet(page, 'key1')).toBeNull();

        expect(await localStorageClear(page)).toBe('Cleared');
        expect(JSON.parse(await localStorageList(page))).toEqual({});
    });
});

// ─── sessionStorage ───────────────────────────────────────────────────────

test.describe('sessionStorage', () => {
    test('set, get, list, delete, clear', async ({ page }) => {
        expect(await sessionStorageSet(page, 'sk1', 'sv1')).toBe('Set');
        expect(await sessionStorageSet(page, 'sk2', 'sv2')).toBe('Set');

        expect(await sessionStorageGet(page, 'sk1')).toBe('sv1');

        const list = JSON.parse(await sessionStorageList(page));
        expect(list).toHaveProperty('sk1', 'sv1');
        expect(list).toHaveProperty('sk2', 'sv2');

        expect(await sessionStorageDelete(page, 'sk1')).toBe('Deleted');
        expect(await sessionStorageGet(page, 'sk1')).toBeNull();

        expect(await sessionStorageClear(page)).toBe('Cleared');
        expect(JSON.parse(await sessionStorageList(page))).toEqual({});
    });
});

// ─── Cookies ──────────────────────────────────────────────────────────────

test.describe('cookies', () => {
    // Cookies require http(s) origin; file:// URLs don't support cookies.
    // Navigate to a data: URL served via a small local server if needed,
    // or skip if running from file://. For now test the API shape.
    test('cookieList returns array', async ({ page }) => {
        const result = await cookieList(page);
        expect(JSON.parse(result)).toBeInstanceOf(Array);
    });

    test('cookieGet returns not-found for missing cookie', async ({ page }) => {
        const result = await cookieGet(page, 'nonexistent');
        expect(result).toBe('Cookie not found: nonexistent');
    });

    test('cookieClear returns message', async ({ page }) => {
        expect(await cookieClear(page)).toBe('Cleared');
    });
});
