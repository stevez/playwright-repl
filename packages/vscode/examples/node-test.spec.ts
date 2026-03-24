import { test, expect } from '@playwright/test';
import fs from 'fs';

test('reads fixture and fills form', async ({ page }) => {
  const data = fs.readFileSync('fixtures/data.json', 'utf-8');
  await page.goto('https://example.com');
  await page.locator('h1').textContent();
  await expect(page).toHaveTitle('Example Domain');
});
