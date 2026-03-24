import { describe, it, expect } from 'vitest';

// Test the line transform logic directly
function transformLine(line: string): string {
  const trimmed = line.trim();
  const indent = line.match(/^(\s*)/)?.[1] || '';

  if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('import ') || trimmed.startsWith('export ')) {
    return line;
  }

  // await page.method(...)
  if (/^\s*await\s+page\./.test(line)) {
    const clean = trimmed.replace(/;?\s*$/, '');
    return `${indent}await bridge.run(${JSON.stringify(clean)});`;
  }

  // await expect(...)
  if (/^\s*await\s+expect\s*\(/.test(line)) {
    const clean = trimmed.replace(/;?\s*$/, '');
    return `${indent}await bridge.run(${JSON.stringify(clean)});`;
  }

  return line;
}

describe('compiler transform', () => {
  describe('page.* calls', () => {
    it('transforms page.goto', () => {
      const result = transformLine("    await page.goto('/login');");
      expect(result).toBe(`    await bridge.run("await page.goto('/login')");`);
    });

    it('transforms page.click', () => {
      const result = transformLine("    await page.click('#btn');");
      expect(result).toBe(`    await bridge.run("await page.click('#btn')");`);
    });

    it('transforms page.fill', () => {
      const result = transformLine("    await page.fill('#email', 'admin');");
      expect(result).toBe(`    await bridge.run("await page.fill('#email', 'admin')");`);
    });

    it('transforms locator chains', () => {
      const result = transformLine("    await page.locator('.list').locator('.item').click();");
      expect(result).toBe(`    await bridge.run("await page.locator('.list').locator('.item').click()");`);
    });

    it('transforms page.locator().nth().click()', () => {
      const result = transformLine("    await page.locator('li').nth(2).click();");
      expect(result).toBe(`    await bridge.run("await page.locator('li').nth(2).click()");`);
    });

    it('transforms page.getByRole', () => {
      const result = transformLine("    await page.getByRole('button', { name: 'Submit' }).click();");
      expect(result).toBe(`    await bridge.run("await page.getByRole('button', { name: 'Submit' }).click()");`);
    });

    it('transforms page.goto with URL', () => {
      const result = transformLine("    await page.goto('https://example.com');");
      expect(result).toBe(`    await bridge.run("await page.goto('https://example.com')");`);
    });

    it('preserves indentation', () => {
      const result = transformLine("        await page.click('button');");
      expect(result.startsWith('        await bridge.run(')).toBe(true);
    });

    it('strips trailing semicolon', () => {
      const result = transformLine("    await page.click('button');");
      expect(result).toContain("await page.click('button')");
      expect(result).not.toContain("await page.click('button');\"");
    });
  });

  describe('expect calls', () => {
    it('transforms expect(page).toHaveTitle', () => {
      const result = transformLine("    await expect(page).toHaveTitle('Hello');");
      expect(result).toBe(`    await bridge.run("await expect(page).toHaveTitle('Hello')");`);
    });

    it('transforms expect(page).toHaveURL', () => {
      const result = transformLine("    await expect(page).toHaveURL('/dashboard');");
      expect(result).toBe(`    await bridge.run("await expect(page).toHaveURL('/dashboard')");`);
    });

    it('transforms expect(locator).toBeVisible', () => {
      const result = transformLine("    await expect(page.locator('h1')).toBeVisible();");
      expect(result).toBe(`    await bridge.run("await expect(page.locator('h1')).toBeVisible()");`);
    });

    it('transforms expect(locator).toHaveText', () => {
      const result = transformLine("    await expect(page.locator('h1')).toHaveText('Hello');");
      expect(result).toBe(`    await bridge.run("await expect(page.locator('h1')).toHaveText('Hello')");`);
    });

    it('transforms expect with getByRole', () => {
      const result = transformLine("    await expect(page.getByRole('heading')).toHaveText('Title');");
      expect(result).toBe(`    await bridge.run("await expect(page.getByRole('heading')).toHaveText('Title')");`);
    });
  });

  describe('non-browser lines (untouched)', () => {
    it('leaves Node.js code alone', () => {
      const line = "    const data = fs.readFileSync('file.json');";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves variable declarations alone', () => {
      const line = "    const name = 'test';";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves console.log alone', () => {
      const line = "    console.log('hello');";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves JSON.parse alone', () => {
      const line = "    const parsed = JSON.parse(data);";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves empty lines alone', () => {
      expect(transformLine('')).toBe('');
      expect(transformLine('    ')).toBe('    ');
    });

    it('leaves comments alone', () => {
      const line = "    // this is a comment";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves import statements alone', () => {
      const line = "import { test } from '@playwright/test';";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves process.env access alone (Node.js code)', () => {
      const line = "    const url = process.env.BASE_URL;";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves for loops alone', () => {
      const line = "    for (const item of items) {";
      expect(transformLine(line)).toBe(line);
    });

    it('leaves if statements alone', () => {
      const line = "    if (data.length > 0) {";
      expect(transformLine(line)).toBe(line);
    });
  });

  describe('edge cases', () => {
    it('handles page reference in non-await context', () => {
      // const locator = page.locator(...) — Phase 3 (return values)
      const line = "    const locator = page.locator('.btn');";
      // Phase 1: not transformed (no await prefix)
      expect(transformLine(line)).toBe(line);
    });

    it('handles expect without page (non-browser)', () => {
      // expect(5).toBe(5) — pure assertion, no browser
      const line = "    expect(value).toBe(5);";
      // No await prefix, not transformed
      expect(transformLine(line)).toBe(line);
    });

    it('handles multiline expressions (takes first line only)', () => {
      // Phase 1 limitation: multiline expressions not handled
      const line = "    await page.fill(";
      expect(transformLine(line)).toBe(`    await bridge.run("await page.fill(");`);
      // This will break — multiline support is a future phase
    });
  });
});
