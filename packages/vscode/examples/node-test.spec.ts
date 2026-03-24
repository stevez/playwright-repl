import { test, expect } from '@playwright/test';
import path from 'path';

test('uses Node.js path module', async ({ page }) => {
  const dir = path.resolve('.');
  console.log('Working directory:', dir);
  await page.goto('https://example.com');
  await expect(page).toHaveTitle('Example Domain');
});
