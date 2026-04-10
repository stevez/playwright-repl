/**
 * Tests for AssertView — assertion builder panel.
 *
 * Uses the mock VSCode infrastructure to test webview interactions.
 */

import { expect, test } from './utils';

test.beforeEach(async ({ showBrowser }) => {
  test.skip(showBrowser);
});

test('should show pick button and assertion type dropdown on activate', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const assertView = vscode.webViews.get('playwright-repl.assertView')!;
  await expect(assertView.locator('#pickBtn')).toBeVisible();
  await expect(assertView.locator('#assertType')).toBeVisible();
  await expect(assertView.locator('#assertType option')).not.toHaveCount(0);
});

test('should populate locator and assertion when showAssertion is called', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const assertView = vscode.webViews.get('playwright-repl.assertView')!;
  const extension = vscode.extensions[0];

  // Simulate picking an element — call showAssertion on the assert view
  const assertViewInstance = (extension as any)._assertView;
  await assertViewInstance.showAssertion(
    "page.getByRole('button', { name: 'Submit' })",
    "await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();",
    { tag: 'BUTTON' },
    '- button "Submit"',
  );

  await expect(assertView.locator('#locator')).toHaveValue("page.getByRole('button', { name: 'Submit' })");
  await expect(assertView.locator('#assertion')).toHaveValue(/toBeVisible/);
  await expect(assertView.locator('#ariaPreview')).toHaveValue('- button "Submit"');
});

test('should rebuild assertion when type changes', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const assertView = vscode.webViews.get('playwright-repl.assertView')!;
  const extension = vscode.extensions[0];

  const assertViewInstance = (extension as any)._assertView;
  await assertViewInstance.showAssertion(
    "page.getByRole('heading')",
    "await expect(page.getByRole('heading')).toBeVisible();",
    { tag: 'H1' },
  );

  // Change assertion type to toBeHidden
  await assertView.locator('#assertType').selectOption('toBeHidden');
  await expect(assertView.locator('#assertion')).toHaveValue(/toBeHidden/);
});

test('should toggle negate checkbox to add .not.', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const assertView = vscode.webViews.get('playwright-repl.assertView')!;
  const extension = vscode.extensions[0];

  const assertViewInstance = (extension as any)._assertView;
  await assertViewInstance.showAssertion(
    "page.getByText('Hello')",
    "await expect(page.getByText('Hello')).toBeVisible();",
    { tag: 'SPAN' },
  );

  // Check negate
  await assertView.locator('#negateCheckbox').check();
  await expect(assertView.locator('#assertion')).toHaveValue(/\.not\.toBeVisible/);
});

test('should switch to snapshot mode', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const assertView = vscode.webViews.get('playwright-repl.assertView')!;
  const extension = vscode.extensions[0];

  const assertViewInstance = (extension as any)._assertView;
  await assertViewInstance.showAssertion(
    "page.getByRole('list')",
    "await expect(page.getByRole('list')).toBeVisible();",
    { tag: 'UL' },
    '- list:\n  - listitem "Item 1"',
  );

  // Switch to snapshot mode
  await assertView.locator('input[name="assertMode"][value="snapshot"]').check();
  await expect(assertView.locator('#assertion')).toHaveValue(/toMatchAriaSnapshot/);
});

test('should show arg input for types that need arguments', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const assertView = vscode.webViews.get('playwright-repl.assertView')!;
  const extension = vscode.extensions[0];

  const assertViewInstance = (extension as any)._assertView;
  await assertViewInstance.showAssertion(
    "page.getByRole('textbox')",
    "await expect(page.getByRole('textbox')).toBeVisible();",
    { tag: 'INPUT', attributes: { type: 'text' } },
  );

  // toBeVisible doesn't need arg — input should be hidden
  await expect(assertView.locator('#argInput')).toBeHidden();

  // Switch to toContainText — needs arg
  await assertView.locator('#assertType').selectOption('toContainText');
  await expect(assertView.locator('#argInput')).toBeVisible();

  // Type expected value
  await assertView.locator('#argInput').fill('Hello');
  await expect(assertView.locator('#assertion')).toHaveValue(/toContainText\('Hello'\)/);
});
