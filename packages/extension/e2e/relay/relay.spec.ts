/**
 * Relay E2E tests — verify every command returns meaningful results via direct Playwright.
 *
 * Commands flow: resolveCommand → AsyncFunction('page','context','expect', jsExpr) → result.
 * Same execution path as CLI relay mode and VS Code relay mode.
 *
 * Every test is self-contained — beforeEach navigates to a fresh page.
 */

import { test, expect } from './fixtures.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Result = { text?: string; isError?: boolean; image?: string };

function expectOk(r: Result) {
  expect(r.isError, `Expected OK but got error: ${r.text}`).toBeFalsy();
}

function expectText(r: Result, substring: string) {
  expectOk(r);
  expect(r.text).toContain(substring);
}

// ─── Navigation & Page ───────────────────────────────────────────────────────

test.describe("Relay command tests", () => {
  test.describe('Navigation & Page', () => {
    test('goto navigates to URL', async ({ relay, testUrl }) => {
      const r = await relay.run(`goto ${testUrl}`);
      expectOk(r);
    });

    test('snapshot returns accessibility tree with refs', async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
      const r = await relay.run('snapshot');
      expectOk(r);
      expect(r.text).toMatch(/\[ref=e\d+\]/);
      expect(r.text).toContain('todos');
    });

    test('screenshot returns base64 image', async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
      const r = await relay.run('screenshot');
      expectOk(r);
      expect(r.image).toMatch(/^data:image\/(jpeg|png);base64,/);
    });

    test('go-back and go-forward navigate history', async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}?page=1`);
      await relay.run(`goto ${testUrl}?page=2`);
      const r1 = await relay.run('go-back');
      expectOk(r1);
      const r2 = await relay.run('go-forward');
      expectOk(r2);
    });

    test('reload reloads page', async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
      const r = await relay.run('reload');
      expectOk(r);
    });
  });

  // ─── Help ───────────────────────────────────────────────────────────────────

  test.describe('Help', () => {
    test('help returns command categories', async ({ relay }) => {
      const r = await relay.run('help');
      expectOk(r);
      expect(r.text).toContain('Navigation');
      expect(r.text).toContain('Interaction');
      expect(r.text).toContain('Assertions');
    });

    test('help <command> returns command details', async ({ relay }) => {
      const r = await relay.run('help click');
      expectOk(r);
      expect(r.text).toContain('click');
      expect(r.text).toContain('Click');
    });

    test('help <unknown> returns error', async ({ relay }) => {
      const r = await relay.run('help nonexistent_cmd');
      expect(r.isError).toBe(true);
      expect(r.text).toContain('Unknown command');
    });
  });

  // ─── Interaction ─────────────────────────────────────────────────────────────

  test.describe('Interaction', () => {
    test.beforeEach(async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
    });

    test('fill types into input field', async ({ relay }) => {
      const r = await relay.run('fill "What needs to be done?" "Relay todo"');
      expectOk(r);
    });

    test('press submits with Enter', async ({ relay }) => {
      await relay.run('fill "What needs to be done?" "press test"');
      const r = await relay.run('press Enter');
      expectOk(r);
    });

    test('click clicks an element by text', async ({ relay }) => {
      await relay.run('fill "What needs to be done?" "click me"');
      await relay.run('press Enter');
      const r = await relay.run('click "click me"');
      expectOk(r);
    });

    test('hover hovers over element', async ({ relay }) => {
      await relay.run('fill "What needs to be done?" "hover me"');
      await relay.run('press Enter');
      const r = await relay.run('hover "hover me"');
      expectOk(r);
    });

    test('type types text key by key', async ({ relay }) => {
      await relay.run('click "What needs to be done?"');
      const r = await relay.run('type "hello world"');
      expectOk(r);
    });

    test('eval executes JavaScript and returns result', async ({ relay }) => {
      const r = await relay.run('eval document.title');
      expectText(r, 'Relay Test');
    });
  });

  // ─── Verification ────────────────────────────────────────────────────────────

  test.describe('Verification', () => {
    test.beforeEach(async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
    });

    test('verify-text passes for visible text', async ({ relay }) => {
      await relay.run('fill "What needs to be done?" "verify item"');
      await relay.run('press Enter');
      const r = await relay.run('verify-text "verify item"');
      expectOk(r);
      expect(r.text).toBeTruthy();
    });

    test('verify-no-text passes for absent text', async ({ relay }) => {
      const r = await relay.run('verify-no-text "nonexistent xyz text"');
      expectOk(r);
    });

    test('verify-title passes when title matches', async ({ relay }) => {
      const r = await relay.run('verify-title "Relay Test"');
      expectOk(r);
    });

    test('verify-url passes when URL matches', async ({ relay }) => {
      const r = await relay.run('verify-url "localhost"');
      expectOk(r);
    });

    test('verify-element passes when element exists', async ({ relay }) => {
      const r = await relay.run('verify-element heading "todos"');
      expectOk(r);
    });

    test('toMatchAriaSnapshot passes for matching snapshot', async ({ relay }) => {
      const r = await relay.run(`await expect(page.locator('h1')).toMatchAriaSnapshot(\`- heading "todos" [level=1]\`)`);
      expectOk(r);
    });

    test('toMatchAriaSnapshot fails for non-matching snapshot', async ({ relay }) => {
      const r = await relay.run(`await expect(page.locator('h1')).toMatchAriaSnapshot(\`- heading "wrong"\`, { timeout: 1000 })`);
      expect(r.isError).toBe(true);
      expect(r.text).toContain('toMatchAriaSnapshot');
    });

    test('not.toMatchAriaSnapshot passes for non-matching snapshot', async ({ relay }) => {
      const r = await relay.run(`await expect(page.locator('h1')).not.toMatchAriaSnapshot(\`- heading "wrong"\`)`);
      expectOk(r);
    });

    test('not.toMatchAriaSnapshot fails for matching snapshot', async ({ relay }) => {
      const r = await relay.run(`await expect(page.locator('h1')).not.toMatchAriaSnapshot(\`- heading "todos" [level=1]\`, { timeout: 1000 })`);
      expect(r.isError).toBe(true);
      expect(r.text).toContain('toMatchAriaSnapshot');
    });
  });

  // ─── Script execution ─────────────────────────────────────────────────────

  test.describe('Script execution', () => {
    test('runScript executes multi-line pw commands with checkmarks', async ({ relay, testUrl }) => {
      const script = [
        `goto ${testUrl}`,
        'fill "What needs to be done?" "Script todo"',
        'press Enter',
        'verify-text "Script todo"',
      ].join('\n');
      const r = await relay.runScript(script, 'pw');
      expectOk(r);
      expect(r.text).toContain('\u2713'); // ✓ checkmark
    });

    test('runScript with javascript language executes JS', async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
      const r = await relay.runScript('return await page.title()', 'javascript');
      expectOk(r);
      expect(r.text).toContain('Relay Test');
    });
  });

  // ─── JavaScript expressions ─────────────────────────────────────────────────

  test.describe('JavaScript expressions', () => {
    test.beforeEach(async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
    });

    test('page.title() returns title string', async ({ relay }) => {
      const r = await relay.run('await page.title()');
      expectOk(r);
      expect(r.text).toContain('Relay Test');
    });

    test('page.url() returns URL string', async ({ relay }) => {
      const r = await relay.run('await page.url()');
      expectOk(r);
      expect(r.text).toContain('localhost');
    });

    test('page.locator().textContent() returns element text', async ({ relay }) => {
      const r = await relay.run("await page.locator('h1').textContent()");
      expectOk(r);
      expect(r.text).toContain('todos');
    });

    test('page.locator().count() returns a number', async ({ relay }) => {
      await relay.run('fill "What needs to be done?" "JS test item"');
      await relay.run('press Enter');
      const r = await relay.run("await page.locator('.todo-list li').count()");
      expectOk(r);
      expect(Number(r.text)).toBeGreaterThan(0);
    });

    test('page.locator().getAttribute() returns attribute value', async ({ relay }) => {
      const r = await relay.run("await page.locator('input.new-todo').getAttribute('placeholder')");
      expectOk(r);
      expect(r.text).toContain('What needs to be done?');
    });

    test('page.locator().isVisible() returns boolean', async ({ relay }) => {
      const r = await relay.run("await page.locator('h1').isVisible()");
      expectOk(r);
      expect(r.text).toMatch(/true|false/);
    });

    test('page.evaluate() returns evaluated result', async ({ relay }) => {
      const r = await relay.run("await page.evaluate(() => window.location.hostname)");
      expectOk(r);
      expect(r.text).toContain('localhost');
    });

    test('page.locator().click() executes without error', async ({ relay }) => {
      const r = await relay.run("await page.locator('h1').click()");
      expectOk(r);
    });

    test('arithmetic expression returns result', async ({ relay }) => {
      const r = await relay.run('1 + 2 + 3');
      expectOk(r);
      expect(r.text).toContain('6');
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────────

  test.describe('Error handling', () => {
    test('unknown command returns error', async ({ relay, testUrl }) => {
      await relay.run(`goto ${testUrl}`);
      const r = await relay.run('nonexistent_cmd_xyz');
      expect(r.isError).toBe(true);
      expect(r.text).toBeTruthy();
    });
  });
});
