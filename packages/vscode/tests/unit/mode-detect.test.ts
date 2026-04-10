import { describe, it, expect } from 'vitest';

// We can't import the async version directly (it needs esbuild + __filename),
// so test the detection patterns inline.

const NODE_BUILTINS = new Set([
  'fs', 'path', 'child_process', 'os', 'crypto', 'util',
  'stream', 'events', 'net', 'http', 'https', 'url',
  'worker_threads', 'cluster', 'dgram', 'dns', 'tls',
  'readline', 'zlib', 'buffer', 'assert', 'vm', 'perf_hooks',
]);

function detectFromSource(source: string): 'browser' | 'compiler' {
  // Check imports
  for (const mod of NODE_BUILTINS) {
    if (new RegExp(`from\\s+['"]${mod}['"]`).test(source)) return 'compiler';
    if (new RegExp(`from\\s+['"]node:${mod}['"]`).test(source)) return 'compiler';
    if (new RegExp(`require\\s*\\(\\s*['"]${mod}['"]`).test(source)) return 'compiler';
    if (new RegExp(`require\\s*\\(\\s*['"]node:${mod}['"]`).test(source)) return 'compiler';
  }
  // Check globals
  if (/process\.env\b|process\.cwd\b|process\.argv\b|__dirname\b|__filename\b/.test(source)) {
    return 'compiler';
  }
  return 'browser';
}

describe('mode detection', () => {
  describe('browser mode (pure browser tests)', () => {
    it('simple page test', () => {
      const source = `
        import { test, expect } from '@playwright/test';
        test('login', async ({ page }) => {
          await page.goto('/login');
          await page.click('button');
        });
      `;
      expect(detectFromSource(source)).toBe('browser');
    });

    it('test with expect assertions', () => {
      const source = `
        import { test, expect } from '@playwright/test';
        test('title', async ({ page }) => {
          await expect(page).toHaveTitle('Hello');
          await expect(page.locator('h1')).toHaveText('World');
        });
      `;
      expect(detectFromSource(source)).toBe('browser');
    });

    it('test with locator chains', () => {
      const source = `
        import { test, expect } from '@playwright/test';
        test('chain', async ({ page }) => {
          await page.locator('.list').locator('.item').first().click();
        });
      `;
      expect(detectFromSource(source)).toBe('browser');
    });

    it('test with describe and hooks', () => {
      const source = `
        import { test, expect } from '@playwright/test';
        test.describe('suite', () => {
          test.beforeEach(async ({ page }) => {
            await page.goto('/');
          });
          test('works', async ({ page }) => {
            await page.click('button');
          });
        });
      `;
      expect(detectFromSource(source)).toBe('browser');
    });

    it('test with browser-compatible npm package', () => {
      const source = `
        import { test } from '@playwright/test';
        import axios from 'axios';
        test('api', async ({ page }) => {
          await page.goto('/');
        });
      `;
      expect(detectFromSource(source)).toBe('browser');
    });

    it('test with relative imports', () => {
      const source = `
        import { test } from '@playwright/test';
        import { loginPage } from './pages/login';
        test('login', async ({ page }) => {
          await page.goto('/login');
        });
      `;
      expect(detectFromSource(source)).toBe('browser');
    });

    it('test with string containing node module name', () => {
      const source = `
        import { test } from '@playwright/test';
        test('shows path', async ({ page }) => {
          await page.fill('#input', 'some/path/to/file');
        });
      `;
      expect(detectFromSource(source)).toBe('browser');
    });
  });

  describe('compiler mode (Node.js required)', () => {
    it('imports fs', () => {
      const source = `
        import { test } from '@playwright/test';
        import fs from 'fs';
        test('upload', async ({ page }) => {
          const data = fs.readFileSync('fixture.json', 'utf-8');
          await page.fill('#data', data);
        });
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('imports node:fs', () => {
      const source = `
        import { test } from '@playwright/test';
        import { readFileSync } from 'node:fs';
        test('upload', async ({ page }) => {
          const data = readFileSync('fixture.json', 'utf-8');
        });
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('imports path', () => {
      const source = `
        import { test } from '@playwright/test';
        import path from 'path';
        test('resolve', async ({ page }) => {
          const p = path.resolve('fixtures', 'data.json');
        });
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('imports child_process', () => {
      const source = `
        import { test } from '@playwright/test';
        import { execSync } from 'child_process';
        test('seed', async ({ page }) => {
          execSync('node seed.js');
        });
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('uses require()', () => {
      const source = `
        const { test } = require('@playwright/test');
        const fs = require('fs');
        test('upload', async ({ page }) => {});
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('uses require with node: prefix', () => {
      const source = `
        const fs = require('node:fs');
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('uses process.env', () => {
      const source = `
        import { test } from '@playwright/test';
        test('env', async ({ page }) => {
          await page.goto(process.env.BASE_URL + '/login');
        });
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('uses process.cwd', () => {
      const source = `
        import { test } from '@playwright/test';
        test('cwd', async ({ page }) => {
          console.log(process.cwd());
        });
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('uses __dirname', () => {
      const source = `
        import { test } from '@playwright/test';
        import path from 'path';
        const fixture = path.join(__dirname, 'fixtures');
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('uses __filename', () => {
      const source = `
        console.log(__filename);
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('imports crypto', () => {
      const source = `
        import { test } from '@playwright/test';
        import crypto from 'crypto';
        test('token', async ({ page }) => {
          const token = crypto.randomUUID();
        });
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });

    it('imports http', () => {
      const source = `
        import { test } from '@playwright/test';
        import http from 'http';
      `;
      expect(detectFromSource(source)).toBe('compiler');
    });
  });
});
