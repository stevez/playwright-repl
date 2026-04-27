// @ts-nocheck
import { describe, it, expect, vi } from 'vitest';
import {
  buildRunCode, buildRunCodeScoped, verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  actionByText, fillByText, selectByText,
  checkByText, uncheckByText,
  actionByRole, fillByRole, selectByRole, pressKeyByRole,
} from '../src/page-scripts.js';

// ─── buildRunCode ───────────────────────────────────────────────────────────

describe('buildRunCode', () => {
  it('wraps function as arrow calling inner function with page', () => {
    const result = buildRunCode(verifyText, 'hello');
    expect(result._[0]).toBe('run-code');
    expect(result._[1]).toMatch(/^async \(page\) =>/);
    expect(result._[1]).toContain('(page, "hello")');
  });

  it('serializes multiple args with JSON.stringify', () => {
    const result = buildRunCode(verifyElement, 'button', 'Submit');
    expect(result._[1]).toContain('(page, "button", "Submit")');
  });

  it('escapes special characters via JSON.stringify', () => {
    const result = buildRunCode(verifyText, "O'Brien");
    expect(result._[1]).toContain('"O\'Brien"');
  });

  it('handles backslashes', () => {
    const result = buildRunCode(verifyText, 'path\\to\\file');
    expect(result._[1]).toContain('"path\\\\to\\\\file"');
  });

  it('handles array arguments', () => {
    const result = buildRunCode(verifyList, 'e1', ['item1', 'item2']);
    expect(result._[1]).toContain('["item1","item2"]');
  });

  it('filters out undefined args', () => {
    const result = buildRunCode(actionByText, 'Submit', 'click', undefined);
    expect(result._[1]).toContain('(page, "Submit", "click")');
    // Args should end with just the three values, no trailing undefined/comma
    expect(result._[1]).toMatch(/\(page, "Submit", "click"\)$/);
  });

  it('includes nth arg when defined', () => {
    const result = buildRunCode(actionByText, 'Submit', 'click', 2);
    expect(result._[1]).toContain('(page, "Submit", "click", 2)');
  });

  it('produces code callable as (code)(page) by daemon', async () => {
    const result = buildRunCode(verifyText, 'hello');
    const code = result._[1];
    // Daemon does: await (code)(page)
    // Verify the code is a valid function expression
    expect(code).toMatch(/^async \(page\) =>/);
    // Verify it can be evaluated and called
    const fn = eval(`(${code})`);
    expect(typeof fn).toBe('function');
  });
});

// ─── Mock page helpers ──────────────────────────────────────────────────────

function mockLocator(count = 1) {
  const loc = {
    count: vi.fn().mockResolvedValue(count),
    filter: vi.fn().mockReturnThis(),
    click: vi.fn().mockResolvedValue(undefined),
    dblclick: vi.fn().mockResolvedValue(undefined),
    hover: vi.fn().mockResolvedValue(undefined),
    fill: vi.fn().mockResolvedValue(undefined),
    selectOption: vi.fn().mockResolvedValue(undefined),
    check: vi.fn().mockResolvedValue(undefined),
    uncheck: vi.fn().mockResolvedValue(undefined),
    inputValue: vi.fn().mockResolvedValue(''),
    getByText: vi.fn().mockReturnThis(),
    getByRole: vi.fn().mockReturnThis(),
  };
  return loc;
}

function mockPage(locatorCount = 1) {
  const loc = mockLocator(locatorCount);
  return {
    _loc: loc,
    title: vi.fn().mockResolvedValue('Test Page Title'),
    url: vi.fn().mockReturnValue('https://example.com/dashboard'),
    getByText: vi.fn().mockReturnValue(loc),
    getByRole: vi.fn().mockReturnValue(loc),
    getByLabel: vi.fn().mockReturnValue(loc),
    getByPlaceholder: vi.fn().mockReturnValue(loc),
    locator: vi.fn().mockReturnValue(loc),
  };
}

// ─── buildRunCodeScoped ────────────────────────────────────────────────────

describe('buildRunCodeScoped', () => {
  it('scopes to narrowest role element containing --in text (#734)', async () => {
    // Simulate: a <form> wraps two <fieldset> (group) sections.
    // "E-Scooter" fieldset does NOT contain "Bis 45 km/h".
    // "Moped" fieldset DOES contain "Bis 45 km/h".
    // The old code required both texts in scope, so it matched the broad <form>.
    // The fix scopes to the narrowest element with the --in text (the fieldset),
    // and the action naturally fails if the target isn't there.

    const targetText = 'Bis 45 km/h';
    const scopedTo = [];

    // narrow fieldset for "E-Scooter" — does NOT contain target
    const escooterFieldset = {
      _name: 'escooter-fieldset',
      getByText: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
      getByRole: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
      getByPlaceholder: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
    };

    const page = {
      getByRole: vi.fn().mockImplementation((role) => {
        if (role === 'group') {
          return {
            filter: vi.fn().mockReturnValue({
              count: vi.fn().mockResolvedValue(1),
              first: vi.fn().mockReturnValue(escooterFieldset),
            }),
          };
        }
        // Other roles: no matches
        return {
          filter: vi.fn().mockReturnValue({
            count: vi.fn().mockResolvedValue(0),
          }),
        };
      }),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    const dummy = async function dummyAction(scope, text, action) {
      scopedTo.push(scope._name || 'page');
    };
    const result = buildRunCodeScoped(dummy, 'E-Scooter', targetText, targetText, 'click');
    const fn = eval(`(${result._[1]})`);
    await fn(page);

    // Should scope to the narrow E-Scooter fieldset, NOT the broad form
    expect(scopedTo).toEqual(['escooter-fieldset']);
  });
});

// ─── Verify functions ───────────────────────────────────────────────────────

describe('verifyText', () => {
  it('succeeds when text is visible', async () => {
    const page = mockPage(1);
    await expect(verifyText(page, 'hello')).resolves.toBeUndefined();
    expect(page.getByText).toHaveBeenCalledWith('hello');
  });

  it('throws when text is not found', async () => {
    const page = mockPage(0);
    await expect(verifyText(page, 'missing')).rejects.toThrow('Text not found: missing');
  });
});

describe('verifyElement', () => {
  it('succeeds when element exists', async () => {
    const page = mockPage(1);
    await expect(verifyElement(page, 'button', 'Submit')).resolves.toBeUndefined();
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Submit' });
  });

  it('throws when element is not found', async () => {
    const page = mockPage(0);
    await expect(verifyElement(page, 'button', 'Submit')).rejects.toThrow('Element not found');
  });
});

describe('verifyValue', () => {
  it('succeeds when value matches', async () => {
    const page = mockPage(1);
    page._loc.inputValue.mockResolvedValue('test');
    await expect(verifyValue(page, 'e1', 'test')).resolves.toBeUndefined();
  });

  it('throws when value does not match', async () => {
    const page = mockPage(1);
    page._loc.inputValue.mockResolvedValue('wrong');
    await expect(verifyValue(page, 'e1', 'expected')).rejects.toThrow('Expected "expected", got "wrong"');
  });
});

describe('verifyList', () => {
  it('succeeds when all items found', async () => {
    const page = mockPage(1);
    await expect(verifyList(page, 'e1', ['a', 'b'])).resolves.toBeUndefined();
  });

  it('throws when item is not found', async () => {
    const loc = mockLocator(0);
    const page = mockPage(1);
    page._loc.getByText = vi.fn().mockReturnValue(loc);
    await expect(verifyList(page, 'e1', ['missing'])).rejects.toThrow('Item not found: missing');
  });
});

describe('verifyTitle', () => {
  it('succeeds when title contains text', async () => {
    const page = mockPage(1);
    page.title.mockResolvedValue('My App — Dashboard');
    await expect(verifyTitle(page, 'Dashboard')).resolves.toBeUndefined();
  });

  it('throws when title does not contain text', async () => {
    const page = mockPage(1);
    page.title.mockResolvedValue('My App — Home');
    await expect(verifyTitle(page, 'Dashboard')).rejects.toThrow(
      'Title "My App — Home" does not contain "Dashboard"'
    );
  });
});

describe('verifyUrl', () => {
  it('succeeds when URL contains text', async () => {
    const page = mockPage(1);
    page.url.mockReturnValue('https://example.com/about');
    await expect(verifyUrl(page, '/about')).resolves.toBeUndefined();
  });

  it('throws when URL does not contain text', async () => {
    const page = mockPage(1);
    page.url.mockReturnValue('https://example.com/home');
    await expect(verifyUrl(page, '/about')).rejects.toThrow(
      'URL "https://example.com/home" does not contain "/about"'
    );
  });
});

describe('verifyNoText', () => {
  it('succeeds when text is not visible', async () => {
    const page = mockPage(0);  // count = 0 → not visible
    await expect(verifyNoText(page, 'Gone')).resolves.toBeUndefined();
  });

  it('throws when text is still visible', async () => {
    const page = mockPage(1);  // count = 1 → visible
    await expect(verifyNoText(page, 'Still here')).rejects.toThrow(
      'Text still visible: Still here'
    );
  });
});

describe('verifyNoElement', () => {
  it('succeeds when element does not exist', async () => {
    const page = mockPage(0);  // count = 0 → not found
    await expect(verifyNoElement(page, 'button', 'Delete')).resolves.toBeUndefined();
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Delete' });
  });

  it('throws when element still exists', async () => {
    const page = mockPage(1);  // count = 1 → exists
    await expect(verifyNoElement(page, 'link', 'Remove')).rejects.toThrow(
      'Element still exists: link "Remove"'
    );
  });
});

// ─── Text locator actions ───────────────────────────────────────────────────

describe('actionByText', () => {
  it('clicks the located element', async () => {
    const page = mockPage(1);
    await actionByText(page, 'Submit', 'click');
    expect(page._loc.click).toHaveBeenCalled();
  });

  it('double-clicks the located element', async () => {
    const page = mockPage(1);
    await actionByText(page, 'Edit', 'dblclick');
    expect(page._loc.dblclick).toHaveBeenCalled();
  });

  it('hovers over the located element', async () => {
    const page = mockPage(1);
    await actionByText(page, 'Menu', 'hover');
    expect(page._loc.hover).toHaveBeenCalled();
  });

  it('chains .nth() when nth is provided', async () => {
    const nthLoc = mockLocator(1);
    const loc = mockLocator(3);
    loc.nth = vi.fn().mockReturnValue(nthLoc);
    const page = {
      getByText: vi.fn().mockReturnValue(loc),
      getByRole: vi.fn().mockReturnValue(loc),
    };
    await actionByText(page, 'Learn more', 'click', 1);
    expect(loc.nth).toHaveBeenCalledWith(1);
    expect(nthLoc.click).toHaveBeenCalled();
  });

  it('does not chain .nth() when nth is undefined', async () => {
    const loc = mockLocator(1);
    loc.nth = vi.fn();
    const page = {
      getByText: vi.fn().mockReturnValue(loc),
      getByRole: vi.fn().mockReturnValue(loc),
    };
    await actionByText(page, 'Submit', 'click');
    expect(loc.nth).not.toHaveBeenCalled();
    expect(loc.click).toHaveBeenCalled();
  });
});

describe('fillByText', () => {
  it('fills the labeled input', async () => {
    const page = mockPage(1);
    await fillByText(page, 'Email', 'test@example.com');
    expect(page._loc.fill).toHaveBeenCalledWith('test@example.com');
  });

  it('fills via informal label fallback when no formal label (#768)', async () => {
    // Simulate: <tr><td>Benutzerkennung:*</td><td><input></td></tr>
    // No <label for> association, so getByLabel/getByPlaceholder/getByRole all return count=0.
    const filledWith = [];
    const inputLoc = {
      fill: vi.fn().mockImplementation((v) => { filledWith.push(v); }),
    };
    const noMatch = { count: vi.fn().mockResolvedValue(0) };
    const page = {
      getByLabel: vi.fn().mockReturnValue(noMatch),
      getByPlaceholder: vi.fn().mockReturnValue(noMatch),
      getByRole: vi.fn().mockReturnValue(noMatch),
      getByText: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          evaluate: vi.fn().mockResolvedValue('[data-pw-fill="test123"]'),
        }),
      }),
      locator: vi.fn().mockReturnValue(inputLoc),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    await fillByText(page, 'Benutzerkennung:*', 'user');
    expect(page.getByText).toHaveBeenCalledWith('Benutzerkennung:*');
    expect(page.locator).toHaveBeenCalledWith('[data-pw-fill="test123"]');
    expect(filledWith).toEqual(['user']);
  });
});

describe('selectByText', () => {
  it('selects the labeled option', async () => {
    const page = mockPage(1);
    await selectByText(page, 'Country', 'US');
    expect(page._loc.selectOption).toHaveBeenCalledWith('US');
  });

  it('selects via informal label fallback for same-cell select (#800)', async () => {
    // Simulate: two selects in the same row, each in its own cell with a label:
    //   <tr class="Attribut1">
    //     <td><span>Select*</span><select name="select1">…</select></td>
    //     <td><span>Select/Type*</span><select name="select2">…</select></td>
    //   </tr>
    // The runtime must find select2 (same cell as "Select/Type*"), not select1.
    const selectedWith = [];
    const selectLoc = {
      selectOption: vi.fn().mockImplementation((v) => { selectedWith.push(v); }),
    };
    const noMatch = { count: vi.fn().mockResolvedValue(0) };
    const page = {
      getByLabel: vi.fn().mockReturnValue(noMatch),
      getByRole: vi.fn().mockReturnValue(noMatch),
      getByText: vi.fn().mockReturnValue({
        first: vi.fn().mockReturnValue({
          evaluate: vi.fn().mockResolvedValue('[data-pw-fill="sel2"]'),
        }),
      }),
      locator: vi.fn().mockReturnValue(selectLoc),
      evaluate: vi.fn().mockResolvedValue(undefined),
    };

    await selectByText(page, 'Select/Type*', 'Type 2');
    expect(page.getByText).toHaveBeenCalledWith('Select/Type*');
    expect(page.locator).toHaveBeenCalledWith('[data-pw-fill="sel2"]');
    expect(selectedWith).toEqual(['Type 2']);
  });
});

describe('checkByText', () => {
  it('checks a checkbox', async () => {
    const page = mockPage(1);
    await checkByText(page, 'Terms');
    expect(page._loc.check).toHaveBeenCalled();
  });
});

describe('uncheckByText', () => {
  it('unchecks a checkbox', async () => {
    const page = mockPage(1);
    await uncheckByText(page, 'Newsletter');
    expect(page._loc.uncheck).toHaveBeenCalled();
  });
});

// ─── Role-based actions ─────────────────────────────────────────────────────

describe('actionByRole', () => {
  it('clicks by role and name', async () => {
    const page = mockPage(1);
    await actionByRole(page, 'button', 'Submit', 'click');
    expect(page.getByRole).toHaveBeenCalledWith('button', { name: 'Submit', exact: true });
    expect(page._loc.click).toHaveBeenCalled();
  });

  it('supports nth parameter', async () => {
    const nthLoc = mockLocator(1);
    const loc = mockLocator(1);
    loc.nth = vi.fn().mockReturnValue(nthLoc);
    const page = { getByRole: vi.fn().mockReturnValue(loc) };
    await actionByRole(page, 'tab', 'npm', 'click', 0);
    expect(loc.nth).toHaveBeenCalledWith(0);
    expect(nthLoc.click).toHaveBeenCalled();
  });

  it('supports --in container context', async () => {
    const innerLoc = mockLocator(1);
    const filterLoc = { ...mockLocator(1), getByRole: vi.fn().mockReturnValue(innerLoc) };
    const loc = mockLocator(1);
    loc.filter = vi.fn().mockReturnValue(filterLoc);
    const page = { getByRole: vi.fn().mockReturnValue(loc) };
    await actionByRole(page, 'button', 'Save', 'click', undefined, 'dialog', 'Settings');
    expect(page.getByRole).toHaveBeenCalledWith('dialog');
    expect(loc.filter).toHaveBeenCalledWith({ hasText: 'Settings' });
    expect(filterLoc.getByRole).toHaveBeenCalledWith('button', { name: 'Save', exact: true });
    expect(innerLoc.click).toHaveBeenCalled();
  });

  it('maps list to listitem for --in', async () => {
    const innerLoc = mockLocator(1);
    const filterLoc = { ...mockLocator(1), getByRole: vi.fn().mockReturnValue(innerLoc) };
    const loc = mockLocator(1);
    loc.filter = vi.fn().mockReturnValue(filterLoc);
    const page = { getByRole: vi.fn().mockReturnValue(loc) };
    await actionByRole(page, 'checkbox', 'Done', 'check', undefined, 'list', 'Tasks');
    expect(page.getByRole).toHaveBeenCalledWith('listitem');
  });
});

describe('fillByRole', () => {
  it('fills by role and name', async () => {
    const page = mockPage(1);
    await fillByRole(page, 'textbox', 'Email', 'test@example.com');
    expect(page.getByRole).toHaveBeenCalledWith('textbox', { name: 'Email', exact: true });
    expect(page._loc.fill).toHaveBeenCalledWith('test@example.com');
  });
});

describe('selectByRole', () => {
  it('selects by role and name', async () => {
    const page = mockPage(1);
    await selectByRole(page, 'combobox', 'Country', 'US');
    expect(page.getByRole).toHaveBeenCalledWith('combobox', { name: 'Country', exact: true });
    expect(page._loc.selectOption).toHaveBeenCalledWith('US');
  });
});

describe('pressKeyByRole', () => {
  it('presses key on element by role', async () => {
    const page = mockPage(1);
    page._loc.press = vi.fn().mockResolvedValue(undefined);
    await pressKeyByRole(page, 'textbox', 'Search', 'Enter');
    expect(page.getByRole).toHaveBeenCalledWith('textbox', { name: 'Search', exact: true });
    expect(page._loc.press).toHaveBeenCalledWith('Enter');
  });
});
