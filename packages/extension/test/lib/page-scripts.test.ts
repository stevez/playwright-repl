import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    verifyText, verifyElement, verifyValue, verifyList, verifyTitle, verifyUrl,
    verifyNoText, verifyNoElement, verifyVisible, verifyInputValue,
    actionByText, fillByText, selectByText, checkByText, uncheckByText,
    highlightByText, highlightBySelector,
    chainAction,
    goBack, goForward, gotoUrl, reloadPage,
    waitMs,
    getTitle, getUrl,
    evalCode, runCode,
    takeScreenshot, takeSnapshot,
    refAction,
    pressKey, typeText,
    localStorageGet, localStorageSet, localStorageDelete, localStorageClear, localStorageList,
    sessionStorageGet, sessionStorageSet, sessionStorageDelete, sessionStorageClear, sessionStorageList,
    cookieList, cookieGet, cookieClear,
    tabList, tabNew, tabClose, tabSelect,
} from '@/lib/page-scripts';

// ─── Locator mock factory ─────────────────────────────────────────────────

function createLocator(overrides: Record<string, any> = {}) {
    const loc: any = {
        count: vi.fn().mockResolvedValue(1),
        click: vi.fn().mockResolvedValue(undefined),
        fill: vi.fn().mockResolvedValue(undefined),
        check: vi.fn().mockResolvedValue(undefined),
        uncheck: vi.fn().mockResolvedValue(undefined),
        press: vi.fn().mockResolvedValue(undefined),
        selectOption: vi.fn().mockResolvedValue(undefined),
        highlight: vi.fn().mockResolvedValue(undefined),
        inputValue: vi.fn().mockResolvedValue(''),
        isVisible: vi.fn().mockResolvedValue(true),
        isChecked: vi.fn().mockResolvedValue(false),
        evaluate: vi.fn().mockResolvedValue(''),
        textContent: vi.fn().mockResolvedValue(''),
        filter: vi.fn(),
        first: vi.fn(),
        nth: vi.fn(),
        locator: vi.fn(),
        getByText: vi.fn(),
        getByRole: vi.fn(),
        ...overrides,
    };
    // By default, chainable methods return the same locator
    loc.filter.mockReturnValue(loc);
    loc.first.mockReturnValue(loc);
    loc.nth.mockReturnValue(loc);
    loc.locator.mockReturnValue(loc);
    loc.getByText.mockReturnValue(loc);
    loc.getByRole.mockReturnValue(loc);
    return loc;
}

// ─── Page mock factory ────────────────────────────────────────────────────

function createPage(overrides: Record<string, any> = {}) {
    const defaultLocator = createLocator();
    const page: any = {
        getByText: vi.fn().mockReturnValue(defaultLocator),
        getByRole: vi.fn().mockReturnValue(defaultLocator),
        getByLabel: vi.fn().mockReturnValue(defaultLocator),
        getByPlaceholder: vi.fn().mockReturnValue(defaultLocator),
        locator: vi.fn().mockReturnValue(defaultLocator),
        title: vi.fn().mockResolvedValue('Test Page'),
        url: vi.fn().mockReturnValue('https://example.com'),
        goBack: vi.fn().mockResolvedValue(undefined),
        goForward: vi.fn().mockResolvedValue(undefined),
        goto: vi.fn().mockResolvedValue(undefined),
        reload: vi.fn().mockResolvedValue(undefined),
        waitForTimeout: vi.fn().mockResolvedValue(undefined),
        evaluate: vi.fn().mockResolvedValue(undefined),
        screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-image')),
        ariaSnapshot: vi.fn().mockResolvedValue('- heading "Test" [ref=e1]'),
        keyboard: {
            press: vi.fn().mockResolvedValue(undefined),
            type: vi.fn().mockResolvedValue(undefined),
        },
        context: vi.fn().mockReturnValue({
            cookies: vi.fn().mockResolvedValue([]),
            clearCookies: vi.fn().mockResolvedValue(undefined),
        }),
        ...overrides,
    };
    return page;
}

// ─── Verify functions ─────────────────────────────────────────────────────

describe('verifyText', () => {
    it('passes when text is found', async () => {
        const page = createPage();
        await expect(verifyText(page, 'hello')).resolves.toBeUndefined();
        expect(page.getByText).toHaveBeenCalledWith('hello');
    });

    it('throws when text is not found', async () => {
        const loc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const page = createPage({ getByText: vi.fn().mockReturnValue(loc) });
        await expect(verifyText(page, 'missing')).rejects.toThrow('Text not found: missing');
    });
});

describe('verifyElement', () => {
    it('passes when element exists', async () => {
        const page = createPage();
        await expect(verifyElement(page, 'button', 'Submit')).resolves.toBeUndefined();
        expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Submit' });
    });

    it('throws when element is missing', async () => {
        const loc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const page = createPage({ getByRole: vi.fn().mockReturnValue(loc) });
        await expect(verifyElement(page, 'button', 'Submit')).rejects.toThrow('Element not found: button "Submit"');
    });
});

describe('verifyValue', () => {
    it('passes when value matches', async () => {
        const loc = createLocator({ inputValue: vi.fn().mockResolvedValue('hello') });
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        await expect(verifyValue(page, 'e1', 'hello')).resolves.toBeUndefined();
    });

    it('throws when value does not match', async () => {
        const loc = createLocator({ inputValue: vi.fn().mockResolvedValue('wrong') });
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        await expect(verifyValue(page, 'e1', 'expected')).rejects.toThrow('Expected "expected", got "wrong"');
    });
});

describe('verifyList', () => {
    it('passes when all items are found', async () => {
        const loc = createLocator();
        loc.getByText.mockReturnValue(createLocator());
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        await expect(verifyList(page, 'e1', ['a', 'b'])).resolves.toBeUndefined();
    });

    it('throws when an item is missing', async () => {
        const loc = createLocator();
        loc.getByText.mockReturnValue(createLocator({ count: vi.fn().mockResolvedValue(0) }));
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        await expect(verifyList(page, 'e1', ['missing'])).rejects.toThrow('Item not found: missing');
    });
});

describe('verifyTitle', () => {
    it('passes when title contains text', async () => {
        const page = createPage({ title: vi.fn().mockResolvedValue('My Test Page') });
        await expect(verifyTitle(page, 'Test')).resolves.toBeUndefined();
    });

    it('throws when title does not contain text', async () => {
        const page = createPage({ title: vi.fn().mockResolvedValue('My Page') });
        await expect(verifyTitle(page, 'Other')).rejects.toThrow('does not contain');
    });
});

describe('verifyUrl', () => {
    it('passes when URL contains text', async () => {
        const page = createPage({ url: vi.fn().mockReturnValue('https://example.com/test') });
        await expect(verifyUrl(page, 'test')).resolves.toBeUndefined();
    });

    it('throws when URL does not contain text', async () => {
        const page = createPage({ url: vi.fn().mockReturnValue('https://example.com') });
        await expect(verifyUrl(page, 'other')).rejects.toThrow('does not contain');
    });
});

describe('verifyNoText', () => {
    it('passes when text is absent', async () => {
        const loc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const page = createPage({ getByText: vi.fn().mockReturnValue(loc) });
        await expect(verifyNoText(page, 'gone')).resolves.toBeUndefined();
    });

    it('throws when text is still visible', async () => {
        const page = createPage();
        await expect(verifyNoText(page, 'visible')).rejects.toThrow('Text still visible: visible');
    });
});

describe('verifyNoElement', () => {
    it('passes when element is absent', async () => {
        const loc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const page = createPage({ getByRole: vi.fn().mockReturnValue(loc) });
        await expect(verifyNoElement(page, 'button', 'Gone')).resolves.toBeUndefined();
    });

    it('throws when element still exists', async () => {
        const page = createPage();
        await expect(verifyNoElement(page, 'button', 'Still here')).rejects.toThrow('Element still exists');
    });
});

describe('verifyVisible', () => {
    it('passes when element is visible', async () => {
        const page = createPage();
        await expect(verifyVisible(page, 'button', 'Submit')).resolves.toBeUndefined();
    });

    it('throws when element is not visible', async () => {
        const loc = createLocator({ isVisible: vi.fn().mockResolvedValue(false) });
        const page = createPage({ getByRole: vi.fn().mockReturnValue(loc) });
        await expect(verifyVisible(page, 'button', 'Hidden')).rejects.toThrow('Element not visible');
    });
});

describe('verifyInputValue', () => {
    it('passes for matching text input (spy evaluate)', async () => {
        const mockEl = document.createElement('input');
        mockEl.type = 'text';
        const loc = createLocator({
            inputValue: vi.fn().mockResolvedValue('hello'),
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn(mockEl))),
        });
        loc.first.mockReturnValue(loc);
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await expect(verifyInputValue(page, 'Name', 'hello')).resolves.toBeUndefined();
    });

    it('throws for mismatched text input', async () => {
        const mockEl = document.createElement('input');
        mockEl.type = 'text';
        const loc = createLocator({
            inputValue: vi.fn().mockResolvedValue('wrong'),
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn(mockEl))),
        });
        loc.first.mockReturnValue(loc);
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await expect(verifyInputValue(page, 'Name', 'expected')).rejects.toThrow('Expected "expected", got "wrong"');
    });

    it('verifies checkbox checked state (spy evaluate)', async () => {
        const mockEl = document.createElement('input');
        mockEl.type = 'checkbox';
        const loc = createLocator({
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn(mockEl))),
            isChecked: vi.fn().mockResolvedValue(true),
        });
        loc.first.mockReturnValue(loc);
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await expect(verifyInputValue(page, 'Accept', 'checked')).resolves.toBeUndefined();
    });

    it('throws when checkbox state does not match', async () => {
        const mockEl = document.createElement('input');
        mockEl.type = 'checkbox';
        const loc = createLocator({
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn(mockEl))),
            isChecked: vi.fn().mockResolvedValue(false),
        });
        loc.first.mockReturnValue(loc);
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await expect(verifyInputValue(page, 'Accept', 'checked')).rejects.toThrow('to be checked');
    });

    it('throws when checkbox is checked but expected unchecked', async () => {
        const mockEl = document.createElement('input');
        mockEl.type = 'checkbox';
        const loc = createLocator({
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn(mockEl))),
            isChecked: vi.fn().mockResolvedValue(true),
        });
        loc.first.mockReturnValue(loc);
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await expect(verifyInputValue(page, 'Accept', 'unchecked')).rejects.toThrow('was checked');
    });

    it('evaluate returns empty string for non-input element', async () => {
        const mockEl = document.createElement('div');
        const loc = createLocator({
            inputValue: vi.fn().mockResolvedValue('some-val'),
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn(mockEl))),
        });
        loc.first.mockReturnValue(loc);
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await expect(verifyInputValue(page, 'Field', 'some-val')).resolves.toBeUndefined();
    });

    it('falls back to spinbutton then textbox then combobox', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const foundLoc = createLocator({
            inputValue: vi.fn().mockResolvedValue('42'),
            evaluate: vi.fn().mockResolvedValue('number'),
        });
        foundLoc.first.mockReturnValue(foundLoc);
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn()
                .mockReturnValueOnce(noLoc) // spinbutton
                .mockReturnValueOnce(foundLoc) // textbox
        });
        await expect(verifyInputValue(page, 'Amount', '42')).resolves.toBeUndefined();
    });

    it('checks radio group when no direct input found', async () => {
        // Mock document.querySelector so the evaluate closure actually runs
        const origDoc = globalThis.document;
        globalThis.document = { querySelector: vi.fn().mockReturnValue({ textContent: '  Option A  ' }) } as any;

        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const checkedRadio = createLocator({
            count: vi.fn().mockResolvedValue(1),
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn({ id: 'r1', value: 'a' }))),
        });
        const group = createLocator();
        group.locator.mockReturnValue(checkedRadio);
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn().mockImplementation((role: string) => {
                if (role === 'group') return group;
                return noLoc;
            }),
        });
        await expect(verifyInputValue(page, 'Choice', 'Option A')).resolves.toBeUndefined();

        globalThis.document = origDoc;
    });

    it('throws when radio group value does not match', async () => {
        const origDoc = globalThis.document;
        globalThis.document = { querySelector: vi.fn().mockReturnValue(null) } as any;

        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const checkedRadio = createLocator({
            count: vi.fn().mockResolvedValue(1),
            evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn({ id: 'r1', value: 'red' }))),
        });
        const group = createLocator();
        group.locator.mockReturnValue(checkedRadio);
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn().mockImplementation((role: string) => {
                if (role === 'group') return group;
                return noLoc;
            }),
        });
        await expect(verifyInputValue(page, 'Color', 'blue')).rejects.toThrow('Expected "blue" selected, got "red"');

        globalThis.document = origDoc;
    });

    it('throws when no radio selected in group', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const noRadio = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const group = createLocator();
        group.locator.mockReturnValue(noRadio);
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn().mockImplementation((role: string) => {
                if (role === 'group') return group;
                return noLoc;
            }),
        });
        await expect(verifyInputValue(page, 'Choice', 'A')).rejects.toThrow('No radio button selected');
    });

    it('throws when no element found at all', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn().mockReturnValue(noLoc),
        });
        await expect(verifyInputValue(page, 'Missing', 'val')).rejects.toThrow('Element not found for label');
    });
});

// ─── Text locator actions ─────────────────────────────────────────────────

describe('actionByText', () => {
    it('clicks by exact text match', async () => {
        const loc = createLocator();
        const page = createPage({ getByText: vi.fn().mockReturnValue(loc) });
        await actionByText(page, 'Submit', 'click', undefined);
        expect(loc.click).toHaveBeenCalled();
    });

    it('falls back to button role', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const btnLoc = createLocator();
        const page = createPage({
            getByText: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn().mockReturnValueOnce(btnLoc),
            getByPlaceholder: vi.fn().mockReturnValue(noLoc),
        });
        await actionByText(page, 'Submit', 'click', undefined);
        expect(btnLoc.click).toHaveBeenCalled();
    });

    it('falls back through link, textbox, combobox, placeholder, fuzzy text', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const fuzzyLoc = createLocator();
        const page = createPage({
            // First getByText (exact) returns 0
            getByText: vi.fn()
                .mockReturnValueOnce(noLoc)  // exact
                .mockReturnValueOnce(fuzzyLoc), // fuzzy fallback
            getByRole: vi.fn().mockReturnValue(noLoc),
            getByPlaceholder: vi.fn().mockReturnValue(noLoc),
        });
        await actionByText(page, 'Submit', 'click', undefined);
        expect(fuzzyLoc.click).toHaveBeenCalled();
    });

    it('uses nth when provided', async () => {
        const loc = createLocator();
        const page = createPage({ getByText: vi.fn().mockReturnValue(loc) });
        await actionByText(page, 'Item', 'click', 2);
        expect(loc.filter).toHaveBeenCalledWith({ visible: true });
        expect(loc.nth).toHaveBeenCalledWith(2);
    });
});

describe('fillByText', () => {
    it('fills by label', async () => {
        const loc = createLocator();
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await fillByText(page, 'Name', 'John', undefined);
        expect(loc.fill).toHaveBeenCalledWith('John');
    });

    it('fills by label with nth', async () => {
        const loc = createLocator();
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await fillByText(page, 'Name', 'John', 0);
        expect(loc.filter).toHaveBeenCalledWith({ visible: true });
        expect(loc.nth).toHaveBeenCalledWith(0);
        expect(loc.fill).toHaveBeenCalledWith('John');
    });

    it('falls back to placeholder then textbox', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const phLoc = createLocator();
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByPlaceholder: vi.fn().mockReturnValue(phLoc),
            getByRole: vi.fn().mockReturnValue(noLoc),
        });
        await fillByText(page, 'Search', 'query', undefined);
        expect(phLoc.fill).toHaveBeenCalledWith('query');
    });

    it('falls back to textbox role', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const tbLoc = createLocator();
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByPlaceholder: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn().mockReturnValue(tbLoc),
        });
        await fillByText(page, 'Search', 'query', undefined);
        expect(tbLoc.fill).toHaveBeenCalledWith('query');
    });
});

describe('selectByText', () => {
    it('selects option by label', async () => {
        const loc = createLocator();
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await selectByText(page, 'Color', 'red', undefined);
        expect(loc.selectOption).toHaveBeenCalledWith('red');
    });

    it('selects option with nth', async () => {
        const loc = createLocator();
        const page = createPage({ getByLabel: vi.fn().mockReturnValue(loc) });
        await selectByText(page, 'Color', 'red', 1);
        expect(loc.filter).toHaveBeenCalledWith({ visible: true });
        expect(loc.nth).toHaveBeenCalledWith(1);
        expect(loc.selectOption).toHaveBeenCalledWith('red');
    });

    it('falls back to combobox role', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const cbLoc = createLocator();
        const page = createPage({
            getByLabel: vi.fn().mockReturnValue(noLoc),
            getByRole: vi.fn().mockReturnValue(cbLoc),
        });
        await selectByText(page, 'Color', 'red', undefined);
        expect(cbLoc.selectOption).toHaveBeenCalledWith('red');
    });
});

describe('checkByText', () => {
    it('checks checkbox inside list item', async () => {
        const cbLoc = createLocator();
        const itemLoc = createLocator();
        // filter returns self (default), then getByRole('checkbox') returns cbLoc
        itemLoc.getByRole.mockReturnValue(cbLoc);
        const page = createPage({
            getByRole: vi.fn().mockReturnValue(itemLoc),
        });
        await checkByText(page, 'Buy milk', undefined);
        expect(cbLoc.check).toHaveBeenCalled();
    });

    it('checks checkbox inside list item with nth', async () => {
        const cbLoc = createLocator();
        const itemLoc = createLocator();
        itemLoc.getByRole.mockReturnValue(cbLoc);
        const page = createPage({
            getByRole: vi.fn().mockReturnValue(itemLoc),
        });
        await checkByText(page, 'Buy milk', 1);
        expect(itemLoc.filter).toHaveBeenCalledWith({ visible: true });
        expect(itemLoc.nth).toHaveBeenCalledWith(1);
        expect(cbLoc.check).toHaveBeenCalled();
    });

    it('checks checkbox by label when no list item', async () => {
        // listitem.filter().count() returns 0 so it falls through
        const noItemLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const noLabelLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const cbLoc = createLocator();
        const page = createPage({
            getByRole: vi.fn()
                .mockReturnValueOnce(noItemLoc)  // listitem
                .mockReturnValueOnce(cbLoc),     // checkbox
            getByLabel: vi.fn().mockReturnValue(noLabelLoc),
        });
        await checkByText(page, 'Accept', undefined);
        expect(cbLoc.check).toHaveBeenCalled();
    });

    it('checks checkbox by label with nth', async () => {
        const noItemLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const loc = createLocator();
        const page = createPage({
            getByRole: vi.fn().mockReturnValueOnce(noItemLoc),
            getByLabel: vi.fn().mockReturnValue(loc),
        });
        await checkByText(page, 'Accept', 0);
        expect(loc.filter).toHaveBeenCalledWith({ visible: true });
        expect(loc.nth).toHaveBeenCalledWith(0);
        expect(loc.check).toHaveBeenCalled();
    });
});

describe('uncheckByText', () => {
    it('unchecks checkbox inside list item', async () => {
        const cbLoc = createLocator();
        const itemLoc = createLocator();
        itemLoc.getByRole.mockReturnValue(cbLoc);
        const page = createPage({
            getByRole: vi.fn().mockReturnValue(itemLoc),
        });
        await uncheckByText(page, 'Buy milk', undefined);
        expect(cbLoc.uncheck).toHaveBeenCalled();
    });

    it('unchecks checkbox inside list item with nth', async () => {
        const cbLoc = createLocator();
        const itemLoc = createLocator();
        itemLoc.getByRole.mockReturnValue(cbLoc);
        const page = createPage({
            getByRole: vi.fn().mockReturnValue(itemLoc),
        });
        await uncheckByText(page, 'Buy milk', 2);
        expect(itemLoc.filter).toHaveBeenCalledWith({ visible: true });
        expect(itemLoc.nth).toHaveBeenCalledWith(2);
        expect(cbLoc.uncheck).toHaveBeenCalled();
    });

    it('unchecks checkbox by label when no list item', async () => {
        const noItemLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const noLabelLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const cbLoc = createLocator();
        const page = createPage({
            getByRole: vi.fn()
                .mockReturnValueOnce(noItemLoc)  // listitem
                .mockReturnValueOnce(cbLoc),     // checkbox
            getByLabel: vi.fn().mockReturnValue(noLabelLoc),
        });
        await uncheckByText(page, 'Accept', undefined);
        expect(cbLoc.uncheck).toHaveBeenCalled();
    });

    it('unchecks checkbox by label with nth', async () => {
        const noItemLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const loc = createLocator();
        const page = createPage({
            getByRole: vi.fn().mockReturnValueOnce(noItemLoc),
            getByLabel: vi.fn().mockReturnValue(loc),
        });
        await uncheckByText(page, 'Accept', 1);
        expect(loc.filter).toHaveBeenCalledWith({ visible: true });
        expect(loc.nth).toHaveBeenCalledWith(1);
        expect(loc.uncheck).toHaveBeenCalled();
    });
});

// ─── Highlight ────────────────────────────────────────────────────────────

describe('highlightByText', () => {
    it('highlights element and returns count', async () => {
        const loc = createLocator();
        const page = createPage({ getByText: vi.fn().mockReturnValue(loc) });
        const result = await highlightByText(page, 'hello');
        expect(loc.highlight).toHaveBeenCalled();
        expect(result).toBe('Highlighted 1 element');
    });
});

describe('highlightBySelector', () => {
    it('highlights by CSS selector and returns count', async () => {
        const loc = createLocator();
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        const result = await highlightBySelector(page, '.my-class');
        expect(loc.highlight).toHaveBeenCalled();
        expect(result).toBe('Highlighted 1 element');
    });
});

// ─── Chaining ─────────────────────────────────────────────────────────────

describe('chainAction', () => {
    it('calls action without value', async () => {
        const loc = createLocator();
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        const result = await chainAction(page, 'text=Submit', 'click', undefined);
        expect(loc.click).toHaveBeenCalled();
        expect(result).toBe('Done');
    });

    it('calls action with value', async () => {
        const loc = createLocator();
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        const result = await chainAction(page, 'input[name=q]', 'fill', 'hello');
        expect(loc.fill).toHaveBeenCalledWith('hello');
        expect(result).toBe('Done');
    });
});

// ─── Navigation ───────────────────────────────────────────────────────────

describe('goBack', () => {
    it('navigates back and returns URL', async () => {
        const page = createPage({ url: vi.fn().mockReturnValue('https://example.com/prev') });
        const result = await goBack(page);
        expect(page.goBack).toHaveBeenCalled();
        expect(result).toBe('https://example.com/prev');
    });
});

describe('goForward', () => {
    it('navigates forward and returns URL', async () => {
        const page = createPage({ url: vi.fn().mockReturnValue('https://example.com/next') });
        const result = await goForward(page);
        expect(page.goForward).toHaveBeenCalled();
        expect(result).toBe('https://example.com/next');
    });
});

describe('gotoUrl', () => {
    it('navigates to URL and returns message', async () => {
        const page = createPage();
        const result = await gotoUrl(page, 'https://example.com');
        expect(page.goto).toHaveBeenCalledWith('https://example.com');
        expect(result).toBe('Navigated to https://example.com');
    });
});

describe('reloadPage', () => {
    it('reloads and returns message', async () => {
        const page = createPage();
        const result = await reloadPage(page);
        expect(page.reload).toHaveBeenCalled();
        expect(result).toBe('Reloaded');
    });
});

// ─── Timing ───────────────────────────────────────────────────────────────

describe('waitMs', () => {
    it('waits and returns message', async () => {
        const page = createPage();
        const result = await waitMs(page, 500);
        expect(page.waitForTimeout).toHaveBeenCalledWith(500);
        expect(result).toBe('Waited 500ms');
    });
});

// ─── Page info ────────────────────────────────────────────────────────────

describe('getTitle', () => {
    it('returns page title', async () => {
        const page = createPage({ title: vi.fn().mockResolvedValue('Hello') });
        expect(await getTitle(page)).toBe('Hello');
    });
});

describe('getUrl', () => {
    it('returns page URL', async () => {
        const page = createPage({ url: vi.fn().mockReturnValue('https://example.com') });
        expect(await getUrl(page)).toBe('https://example.com');
    });
});

// ─── Eval ─────────────────────────────────────────────────────────────────

describe('evalCode', () => {
    it('returns stringified result', async () => {
        const page = createPage({ evaluate: vi.fn().mockResolvedValue({ a: 1 }) });
        const result = await evalCode(page, 'document.title');
        expect(result).toBe('{"a":1}');
    });

    it('returns "undefined" for undefined result', async () => {
        const page = createPage({ evaluate: vi.fn().mockResolvedValue(undefined) });
        expect(await evalCode(page, 'void 0')).toBe('undefined');
    });
});

// ─── Run Code ─────────────────────────────────────────────────────────────

describe('runCode', () => {
    it('returns string result', async () => {
        // runCode constructs an AsyncFunction — we test via page mock
        // For simple expressions like "42", it creates: return 42
        // The AsyncFunction runs with page as arg
        const page = createPage();
        // runCode creates `new AsyncFunction('page', 'return 42')` and calls it
        const result = await runCode(page, '42');
        expect(result).toBe('42');
    });

    it('returns "Done" for null/object result', async () => {
        const page = createPage();
        const result = await runCode(page, 'null');
        expect(result).toBe('Done');
    });

    it('returns "Done" for undefined result', async () => {
        const page = createPage();
        const result = await runCode(page, 'undefined');
        expect(result).toBe('Done');
    });

    it('handles function expression form', async () => {
        const page = createPage();
        // Function expressions get wrapped as `return (async (page) => ...)(page)`
        const result = await runCode(page, 'async (page) => page.url()');
        expect(result).toBe('https://example.com');
    });
});

// ─── Screenshot ───────────────────────────────────────────────────────────

describe('takeScreenshot', () => {
    it('returns base64 image data', async () => {
        const buf = Buffer.from('img-data');
        const page = createPage({ screenshot: vi.fn().mockResolvedValue(buf) });
        const result = await takeScreenshot(page, false);
        expect(page.screenshot).toHaveBeenCalledWith({ type: 'jpeg', fullPage: false });
        expect(result).toEqual({ __image: buf.toString('base64'), mimeType: 'image/jpeg' });
    });

    it('supports fullPage option', async () => {
        const buf = Buffer.from('img');
        const page = createPage({ screenshot: vi.fn().mockResolvedValue(buf) });
        await takeScreenshot(page, true);
        expect(page.screenshot).toHaveBeenCalledWith({ type: 'jpeg', fullPage: true });
    });
});

// ─── Snapshot ──────────────────────────────────────────────────────────────

describe('takeSnapshot', () => {
    it('returns ariaSnapshot result', async () => {
        const page = createPage();
        const result = await takeSnapshot(page);
        expect(result).toBe('- heading "Test" [ref=e1]');
    });

    it('falls back to _snapshotForAI for older Playwright versions', async () => {
        const page = createPage({
            ariaSnapshot: undefined,
            _snapshotForAI: vi.fn().mockResolvedValue({ full: '- heading "Legacy" [ref=e1]' }),
        });
        const result = await takeSnapshot(page);
        expect(result).toBe('- heading "Legacy" [ref=e1]');
    });

    it('falls back to title+URL when neither API is available', async () => {
        const page = createPage({
            ariaSnapshot: undefined,
            title: vi.fn().mockResolvedValue('Fallback'),
            url: vi.fn().mockReturnValue('https://fb.com'),
        });
        const result = await takeSnapshot(page);
        expect(result).toBe('Title: Fallback\nURL: https://fb.com');
    });
});

// ─── Ref-based actions ────────────────────────────────────────────────────

describe('refAction', () => {
    it('clicks element by ref', async () => {
        const loc = createLocator();
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        const result = await refAction(page, 'e5', 'click', undefined);
        expect(page.locator).toHaveBeenCalledWith('aria-ref=e5');
        expect(loc.click).toHaveBeenCalled();
        expect(result).toBe('Done');
    });

    it('fills element by ref with value', async () => {
        const loc = createLocator();
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        const result = await refAction(page, 'e3', 'fill', 'hello');
        expect(loc.fill).toHaveBeenCalledWith('hello');
        expect(result).toBe('Done');
    });

    it('throws when ref not found', async () => {
        const loc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        await expect(refAction(page, 'e99', 'click', undefined)).rejects.toThrow('Element e99 not found');
    });
});

// ─── Press / Type ─────────────────────────────────────────────────────────

describe('pressKey', () => {
    it('presses global key when no target', async () => {
        const page = createPage();
        const result = await pressKey(page, 'Enter', 'Enter');
        expect(page.keyboard.press).toHaveBeenCalledWith('Enter');
        expect(result).toBe('Pressed Enter');
    });

    it('presses global key when target is empty', async () => {
        const page = createPage();
        const result = await pressKey(page, '', 'Tab');
        expect(page.keyboard.press).toHaveBeenCalledWith('');
        expect(result).toContain('Pressed');
    });

    it('presses key on ref element', async () => {
        const loc = createLocator();
        const page = createPage({ locator: vi.fn().mockReturnValue(loc) });
        const result = await pressKey(page, 'e5', 'Enter');
        expect(page.locator).toHaveBeenCalledWith('aria-ref=e5');
        expect(loc.press).toHaveBeenCalledWith('Enter');
        expect(result).toBe('Pressed Enter');
    });

    it('presses key on text-matched element', async () => {
        const loc = createLocator();
        const page = createPage({ getByText: vi.fn().mockReturnValue(loc) });
        const result = await pressKey(page, 'Search', 'Enter');
        expect(loc.press).toHaveBeenCalledWith('Enter');
        expect(result).toBe('Pressed Enter');
    });

    it('falls back through textbox, combobox, placeholder, fuzzy text', async () => {
        const noLoc = createLocator({ count: vi.fn().mockResolvedValue(0) });
        const phLoc = createLocator();
        const page = createPage({
            getByText: vi.fn()
                .mockReturnValueOnce(noLoc)   // exact
                .mockReturnValueOnce(phLoc),  // fuzzy
            getByRole: vi.fn().mockReturnValue(noLoc),
            getByPlaceholder: vi.fn().mockReturnValue(noLoc),
        });
        const result = await pressKey(page, 'Query', 'Enter');
        expect(phLoc.press).toHaveBeenCalledWith('Enter');
        expect(result).toBe('Pressed Enter');
    });
});

describe('typeText', () => {
    it('types text via keyboard', async () => {
        const page = createPage();
        const result = await typeText(page, 'hello world');
        expect(page.keyboard.type).toHaveBeenCalledWith('hello world');
        expect(result).toBe('Typed');
    });
});

// ─── Storage ──────────────────────────────────────────────────────────────

describe('localStorage', () => {
    let origLS: Storage;
    const mockStore: Record<string, string> = {};
    const mockLS = {
        length: 0,
        getItem: vi.fn((k: string) => mockStore[k] ?? null),
        setItem: vi.fn((k: string, v: string) => { mockStore[k] = v; }),
        removeItem: vi.fn((k: string) => { delete mockStore[k]; }),
        clear: vi.fn(() => { for (const k in mockStore) delete mockStore[k]; }),
        key: vi.fn((i: number) => Object.keys(mockStore)[i]),
    } as any;

    beforeEach(() => {
        origLS = globalThis.localStorage;
        globalThis.localStorage = mockLS;
        for (const k in mockStore) delete mockStore[k];
        mockLS.length = 0;
    });

    afterEach(() => {
        globalThis.localStorage = origLS;
    });

    it('get calls evaluate closure with key', async () => {
        mockStore['foo'] = 'bar';
        const page = createPage({ evaluate: vi.fn().mockImplementation((fn, arg) => Promise.resolve(fn(arg))) });
        expect(await localStorageGet(page, 'foo')).toBe('bar');
        expect(mockLS.getItem).toHaveBeenCalledWith('foo');
    });

    it('set calls evaluate closure with [key, value]', async () => {
        const page = createPage({ evaluate: vi.fn().mockImplementation((fn, arg) => Promise.resolve(fn(arg))) });
        expect(await localStorageSet(page, 'k', 'v')).toBe('Set');
        expect(mockLS.setItem).toHaveBeenCalledWith('k', 'v');
    });

    it('delete calls evaluate closure with key', async () => {
        const page = createPage({ evaluate: vi.fn().mockImplementation((fn, arg) => Promise.resolve(fn(arg))) });
        expect(await localStorageDelete(page, 'k')).toBe('Deleted');
        expect(mockLS.removeItem).toHaveBeenCalledWith('k');
    });

    it('clear calls evaluate closure', async () => {
        const page = createPage({ evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn())) });
        expect(await localStorageClear(page)).toBe('Cleared');
        expect(mockLS.clear).toHaveBeenCalled();
    });

    it('list calls evaluate closure to iterate storage', async () => {
        mockStore['a'] = '1';
        mockStore['b'] = '2';
        mockLS.length = 2;
        const page = createPage({ evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn())) });
        const result = await localStorageList(page);
        expect(JSON.parse(result)).toEqual({ a: '1', b: '2' });
    });
});

describe('sessionStorage', () => {
    let origSS: Storage;
    const mockStore: Record<string, string> = {};
    const mockSS = {
        length: 0,
        getItem: vi.fn((k: string) => mockStore[k] ?? null),
        setItem: vi.fn((k: string, v: string) => { mockStore[k] = v; }),
        removeItem: vi.fn((k: string) => { delete mockStore[k]; }),
        clear: vi.fn(() => { for (const k in mockStore) delete mockStore[k]; }),
        key: vi.fn((i: number) => Object.keys(mockStore)[i]),
    } as any;

    beforeEach(() => {
        origSS = globalThis.sessionStorage;
        globalThis.sessionStorage = mockSS;
        for (const k in mockStore) delete mockStore[k];
        mockSS.length = 0;
    });

    afterEach(() => {
        globalThis.sessionStorage = origSS;
    });

    it('get calls evaluate closure with key', async () => {
        mockStore['foo'] = 'bar';
        const page = createPage({ evaluate: vi.fn().mockImplementation((fn, arg) => Promise.resolve(fn(arg))) });
        expect(await sessionStorageGet(page, 'foo')).toBe('bar');
        expect(mockSS.getItem).toHaveBeenCalledWith('foo');
    });

    it('set calls evaluate closure with [key, value]', async () => {
        const page = createPage({ evaluate: vi.fn().mockImplementation((fn, arg) => Promise.resolve(fn(arg))) });
        expect(await sessionStorageSet(page, 'k', 'v')).toBe('Set');
        expect(mockSS.setItem).toHaveBeenCalledWith('k', 'v');
    });

    it('delete calls evaluate closure with key', async () => {
        const page = createPage({ evaluate: vi.fn().mockImplementation((fn, arg) => Promise.resolve(fn(arg))) });
        expect(await sessionStorageDelete(page, 'k')).toBe('Deleted');
        expect(mockSS.removeItem).toHaveBeenCalledWith('k');
    });

    it('clear calls evaluate closure', async () => {
        const page = createPage({ evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn())) });
        expect(await sessionStorageClear(page)).toBe('Cleared');
        expect(mockSS.clear).toHaveBeenCalled();
    });

    it('list calls evaluate closure to iterate storage', async () => {
        mockStore['x'] = 'y';
        mockSS.length = 1;
        const page = createPage({ evaluate: vi.fn().mockImplementation(fn => Promise.resolve(fn())) });
        const result = await sessionStorageList(page);
        expect(JSON.parse(result)).toEqual({ x: 'y' });
    });
});

// ─── Cookies ──────────────────────────────────────────────────────────────

describe('cookies', () => {
    it('cookieList returns JSON of all cookies', async () => {
        const cookies = [{ name: 'sid', value: '123' }];
        const page = createPage({
            context: vi.fn().mockReturnValue({ cookies: vi.fn().mockResolvedValue(cookies), clearCookies: vi.fn() }),
        });
        const result = await cookieList(page);
        expect(JSON.parse(result)).toEqual(cookies);
    });

    it('cookieGet returns matching cookie', async () => {
        const cookies = [{ name: 'sid', value: '123' }, { name: 'lang', value: 'en' }];
        const page = createPage({
            context: vi.fn().mockReturnValue({ cookies: vi.fn().mockResolvedValue(cookies), clearCookies: vi.fn() }),
        });
        const result = await cookieGet(page, 'sid');
        expect(JSON.parse(result)).toEqual({ name: 'sid', value: '123' });
    });

    it('cookieGet returns message when not found', async () => {
        const page = createPage({
            context: vi.fn().mockReturnValue({ cookies: vi.fn().mockResolvedValue([]), clearCookies: vi.fn() }),
        });
        expect(await cookieGet(page, 'missing')).toBe('Cookie not found: missing');
    });

    it('cookieClear clears all cookies', async () => {
        const clearFn = vi.fn().mockResolvedValue(undefined);
        const page = createPage({
            context: vi.fn().mockReturnValue({ cookies: vi.fn(), clearCookies: clearFn }),
        });
        expect(await cookieClear(page)).toBe('Cleared');
        expect(clearFn).toHaveBeenCalled();
    });
});

// ─── Tab operations ───────────────────────────────────────────────────────

describe('tab operations', () => {
    beforeEach(() => {
        (globalThis as any).activeTabId = 1;
        (globalThis as any).chrome = {
            runtime: {
                getURL: vi.fn((path: string) => `chrome-extension://test-id/${path}`),
            },
            tabs: {
                get: vi.fn().mockResolvedValue({ windowId: 10 }),
                query: vi.fn().mockResolvedValue([
                    { id: 1, title: 'Tab 1', url: 'https://a.com' },
                    { id: 2, title: 'Tab 2', url: 'https://b.com' },
                ]),
                create: vi.fn().mockResolvedValue({ id: 3 }),
                remove: vi.fn().mockResolvedValue(undefined),
            },
        };
        (globalThis as any).attachToTab = vi.fn().mockResolvedValue({ ok: true, url: 'https://b.com' });
    });

    it('tabList returns tab info with current marker', async () => {
        const result = await tabList({});
        const tabs = JSON.parse(result);
        expect(tabs).toHaveLength(2);
        expect(tabs[0].current).toBe(true);
        expect(tabs[1].current).toBe(false);
    });

    it('tabNew creates tab in same window', async () => {
        const result = await tabNew({}, 'https://new.com');
        expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://new.com', windowId: 10 });
        expect(result).toContain('https://new.com');
    });

    it('tabNew without URL', async () => {
        const result = await tabNew({}, undefined);
        expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({
            url: 'about:blank',
            windowId: 10,
        });
        expect(result).toBe('Opened new tab');
    });

    it('tabClose closes tab by index', async () => {
        const result = await tabClose({}, 1);
        expect((globalThis as any).chrome.tabs.remove).toHaveBeenCalledWith(2);
        expect(result).toContain('https://b.com');
    });

    it('tabClose closes current tab when no index', async () => {
        const result = await tabClose({}, undefined);
        expect((globalThis as any).chrome.tabs.remove).toHaveBeenCalledWith(1);
        expect(result).toContain('https://a.com');
    });

    it('tabClose throws when tab not found', async () => {
        await expect(tabClose({}, 99)).rejects.toThrow('Tab 99 not found');
    });

    it('tabSelect attaches to tab by index', async () => {
        const result = await tabSelect({}, 1);
        expect((globalThis as any).attachToTab).toHaveBeenCalledWith(2);
        expect(result).toContain('Selected tab 1');
    });

    it('tabSelect throws when tab not found', async () => {
        await expect(tabSelect({}, 99)).rejects.toThrow('Tab 99 not found');
    });

    it('tabSelect throws when attach fails', async () => {
        (globalThis as any).attachToTab = vi.fn().mockResolvedValue({ ok: false, error: 'denied' });
        await expect(tabSelect({}, 0)).rejects.toThrow('denied');
    });

    it('tabList works without activeTabId', async () => {
        (globalThis as any).activeTabId = undefined;
        const result = await tabList({});
        const tabs = JSON.parse(result);
        expect(tabs.every((t: any) => t.current === false)).toBe(true);
    });

    it('tabClose without activeTabId closes by index', async () => {
        (globalThis as any).activeTabId = undefined;
        const result = await tabClose({}, 0);
        expect((globalThis as any).chrome.tabs.query).toHaveBeenCalledWith({});
        expect(result).toContain('https://a.com');
    });

    it('tabClose throws for current tab when no activeTabId', async () => {
        (globalThis as any).activeTabId = undefined;
        await expect(tabClose({}, undefined)).rejects.toThrow('Tab current not found');
    });

    it('tabSelect without activeTabId selects by index', async () => {
        (globalThis as any).activeTabId = undefined;
        const result = await tabSelect({}, 0);
        expect((globalThis as any).chrome.tabs.query).toHaveBeenCalledWith({});
        expect(result).toContain('Selected tab 0');
    });

    it('tabClose handles tab with no url', async () => {
        (globalThis as any).chrome.tabs.query = vi.fn().mockResolvedValue([
            { id: 10, title: 'No URL' },
        ]);
        const result = await tabClose({}, 0);
        expect(result).toBe('Closed: ');
    });

    it('tabSelect handles attach with no url in response', async () => {
        (globalThis as any).attachToTab = vi.fn().mockResolvedValue({ ok: true });
        const result = await tabSelect({}, 0);
        expect(result).toBe('Selected tab 0: ');
    });

    it('tabSelect throws with default error when no error message', async () => {
        (globalThis as any).attachToTab = vi.fn().mockResolvedValue({ ok: false });
        await expect(tabSelect({}, 0)).rejects.toThrow('Attach failed');
    });

    it('tabList handles tabs with no title or url', async () => {
        (globalThis as any).chrome.tabs.query = vi.fn().mockResolvedValue([
            { id: 1 },
        ]);
        const result = await tabList({});
        const tabs = JSON.parse(result);
        expect(tabs[0].title).toBe('');
        expect(tabs[0].url).toBe('');
    });

    it('tabNew without activeTabId', async () => {
        (globalThis as any).activeTabId = undefined;
        const result = await tabNew({}, 'https://new.com');
        expect((globalThis as any).chrome.tabs.create).toHaveBeenCalledWith({ url: 'https://new.com' });
        expect(result).toContain('https://new.com');
    });
});
