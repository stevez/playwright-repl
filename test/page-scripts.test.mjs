import { describe, it, expect, vi } from 'vitest';
import {
  buildRunCode, verifyText, verifyElement, verifyValue, verifyList,
  actionByText, fillByText, selectByText,
  checkByText, uncheckByText,
} from '../src/page-scripts.mjs';

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
    getByText: vi.fn().mockReturnValue(loc),
    getByRole: vi.fn().mockReturnValue(loc),
    getByLabel: vi.fn().mockReturnValue(loc),
    getByPlaceholder: vi.fn().mockReturnValue(loc),
    locator: vi.fn().mockReturnValue(loc),
  };
}

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
});

describe('fillByText', () => {
  it('fills the labeled input', async () => {
    const page = mockPage(1);
    await fillByText(page, 'Email', 'test@example.com');
    expect(page._loc.fill).toHaveBeenCalledWith('test@example.com');
  });
});

describe('selectByText', () => {
  it('selects the labeled option', async () => {
    const page = mockPage(1);
    await selectByText(page, 'Country', 'US');
    expect(page._loc.selectOption).toHaveBeenCalledWith('US');
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
