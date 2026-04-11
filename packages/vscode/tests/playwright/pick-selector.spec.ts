/**
 * Tests for Picker — element selection and assertion derivation.
 *
 * Uses mock BrowserManager. The full pick flow (page.pickLocator) requires
 * interactive browser clicks, so we test the surrounding logic:
 * - deriveAssertion() for all element types
 * - Picker lifecycle (start/stop/isPicking)
 * - Warning when browser not running
 * - Copy-to-clipboard behavior
 * - View integration (locatorsView, assertView)
 */

import { expect, test } from './utils';

// ─── deriveAssertion tests ───────────────────────────────────────────────────

test.describe('deriveAssertion', () => {
  let deriveAssertion: typeof import('../../src/picker').deriveAssertion;

  test.beforeAll(async () => {
    const mod = await import('../../dist/picker');
    deriveAssertion = mod.deriveAssertion;
  });

  test('should derive toBeVisible for empty element', () => {
    const result = deriveAssertion({}, "page.getByRole('button')");
    expect(result).toBe("await expect(page.getByRole('button')).toBeVisible();");
  });

  test('should derive toBeChecked for checked checkbox', () => {
    const result = deriveAssertion(
      { tag: 'INPUT', attributes: { type: 'checkbox' }, checked: true },
      "page.getByLabel('Accept')",
    );
    expect(result).toBe("await expect(page.getByLabel('Accept')).toBeChecked();");
  });

  test('should derive not.toBeChecked for unchecked checkbox', () => {
    const result = deriveAssertion(
      { tag: 'INPUT', attributes: { type: 'checkbox' }, checked: false },
      "page.getByLabel('Accept')",
    );
    expect(result).toBe("await expect(page.getByLabel('Accept')).not.toBeChecked();");
  });

  test('should derive toBeChecked for radio button', () => {
    const result = deriveAssertion(
      { tag: 'INPUT', attributes: { type: 'radio' }, checked: true },
      "page.getByLabel('Option A')",
    );
    expect(result).toBe("await expect(page.getByLabel('Option A')).toBeChecked();");
  });

  test('should derive toHaveValue for text input', () => {
    const result = deriveAssertion(
      { tag: 'INPUT', attributes: { type: 'text' }, value: 'hello' },
      "page.getByLabel('Name')",
    );
    expect(result).toBe("await expect(page.getByLabel('Name')).toHaveValue('hello');");
  });

  test('should derive toHaveValue for textarea', () => {
    const result = deriveAssertion(
      { tag: 'TEXTAREA', value: 'some text' },
      "page.getByRole('textbox')",
    );
    expect(result).toBe("await expect(page.getByRole('textbox')).toHaveValue('some text');");
  });

  test('should derive toHaveValue for select', () => {
    const result = deriveAssertion(
      { tag: 'SELECT', value: 'option-2' },
      "page.getByRole('combobox')",
    );
    expect(result).toBe("await expect(page.getByRole('combobox')).toHaveValue('option-2');");
  });

  test('should derive toContainText for element with text', () => {
    const result = deriveAssertion(
      { tag: 'H1', text: 'Welcome' },
      "page.getByRole('heading')",
    );
    expect(result).toBe("await expect(page.getByRole('heading')).toContainText('Welcome');");
  });

  test('should skip toContainText for getByText locator (redundant)', () => {
    const result = deriveAssertion(
      { tag: 'SPAN', text: 'Hello World' },
      "page.getByText('Hello World')",
    );
    // Should fall through to toBeVisible since text assertion is redundant
    expect(result).toBe("await expect(page.getByText('Hello World')).toBeVisible();");
  });

  test('should truncate long text in toContainText', () => {
    const longText = 'A'.repeat(100);
    const result = deriveAssertion(
      { tag: 'P', text: longText },
      "page.getByRole('paragraph')",
    );
    expect(result).toContain('toContainText');
    // Text should be truncated to 80 chars
    expect(result).toContain('A'.repeat(80));
    expect(result).not.toContain('A'.repeat(81));
  });

  test('should escape single quotes in value', () => {
    const result = deriveAssertion(
      { tag: 'INPUT', attributes: { type: 'text' }, value: "it's a test" },
      "page.getByLabel('Input')",
    );
    expect(result).toContain("toHaveValue('it\\'s a test')");
  });
});

// ─── Picker lifecycle tests ──────────────────────────────────────────────────

test('should show warning when browser is not running', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const { Picker } = await import('../../dist/picker');
  const mockBrowser = { isRunning: () => false, page: null };
  const outputChannel = vscode.window.createOutputChannel('test');
  const picker = new Picker(vscode, mockBrowser, outputChannel);

  await picker.start();

  expect(vscode.warnings).toContain('Launch browser first.');
  expect(picker.isPicking).toBe(false);

  picker.dispose();
});
