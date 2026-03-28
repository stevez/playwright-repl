/**
 * Tests for shim features: conditional skip/fixme, options object form.
 * These run in bridge mode to verify the shim handles these patterns.
 */

import { test, expect } from '../fixtures';

test.describe('Shim Features', () => {

  // Options object as second argument
  test('options object form', {
    annotation: { type: 'feature', description: 'Test options object support' },
  }, async ({ page }) => {
    await expect(page.getByRole('textbox', { name: 'What needs to be done?' })).toBeVisible();
  });

  // Conditional skip — false condition, test should RUN
  test('conditional skip (false — should run)', async ({ page }) => {
    test.skip(false);
    await expect(page.getByRole('textbox', { name: 'What needs to be done?' })).toBeVisible();
  });

  // Conditional skip — true condition, test should be SKIPPED
  test('conditional skip (true — should skip)', async ({ page }) => {
    test.skip(true, 'Skipping for test');
    await expect(page.getByText('This should not run')).toBeVisible();
  });

  // Conditional fixme — false condition, test should RUN
  test('conditional fixme (false — should run)', async ({ page }) => {
    test.fixme(false);
    await expect(page.getByRole('textbox', { name: 'What needs to be done?' })).toBeVisible();
  });

  // Conditional fixme — true condition, test should be SKIPPED
  test('conditional fixme (true — should skip)', async ({ page }) => {
    test.fixme(true, 'Known issue');
    await expect(page.getByText('This should not run')).toBeVisible();
  });

});
