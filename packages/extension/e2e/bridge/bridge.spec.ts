/**
 * Bridge E2E tests — verify every command returns meaningful results via WebSocket.
 *
 * Commands flow: BridgeServer.run() → WebSocket → offscreen.ts → background.ts
 * → executeSingleCommand → executeBridgeExpr (CDP) → result back via WebSocket.
 *
 * Every test is self-contained — beforeEach navigates to a fresh page,
 * wiping any state from the previous test.
 */

import { test, expect } from './fixtures.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const TODO_URL = 'https://demo.playwright.dev/todomvc/';

type Result = { text?: string; isError?: boolean; image?: string };

function expectOk(r: Result) {
  expect(r.isError, `Expected OK but got error: ${r.text}`).toBeFalsy();
}

function expectText(r: Result, substring: string) {
  expectOk(r);
  expect(r.text).toContain(substring);
}

function expectJSON(r: Result): unknown {
  expectOk(r);
  expect(r.text).toBeTruthy();
  try {
    return JSON.parse(r.text!);
  } catch {
    throw new Error(`Expected valid JSON but got: ${r.text?.slice(0, 200)}`);
  }
}

// ─── Navigation & Page ───────────────────────────────────────────────────────

test.describe("Bridge command tests", () => {
  test.describe('Navigation & Page', () => {
    test('goto navigates to URL', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run(`goto ${TODO_URL}`);
      expectOk(r);
    });

    test('snapshot returns accessibility tree with refs', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
      const r = await bridgeContext.bridge.run('snapshot');
      expectOk(r);
      expect(r.text).toMatch(/\[ref=e\d+\]/);
      expect(r.text).toContain('todos');
    });

    test('screenshot returns base64 image', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
      const r = await bridgeContext.bridge.run('screenshot');
      expectOk(r);
      expect(r.image).toMatch(/^data:image\/(jpeg|png);base64,/);
    });

    test('go-back and go-forward navigate history', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run('goto https://httpbin.org');
      await bridgeContext.bridge.run('goto https://example.com');
      const r1 = await bridgeContext.bridge.run('go-back');
      expectOk(r1);
      const r2 = await bridgeContext.bridge.run('go-forward');
      expectOk(r2);
    });

    test('reload reloads page', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
      const r = await bridgeContext.bridge.run('reload');
      expectOk(r);
    });
  });

  // ─── Interaction ─────────────────────────────────────────────────────────────

  test.describe('Interaction', () => {
    test.beforeEach(async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
    });

    test('fill types into input field', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('fill "What needs to be done?" "Bridge todo"');
      expectOk(r);
    });

    test('press submits with Enter', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run('fill "What needs to be done?" "press test"');
      const r = await bridgeContext.bridge.run('press Enter');
      expectOk(r);
    });

    test('click clicks an element by text', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run('fill "What needs to be done?" "click me"');
      await bridgeContext.bridge.run('press Enter');
      const r = await bridgeContext.bridge.run('click "click me"');
      expectOk(r);
    });

    test('hover hovers over element', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run('fill "What needs to be done?" "hover me"');
      await bridgeContext.bridge.run('press Enter');
      const r = await bridgeContext.bridge.run('hover "hover me"');
      expectOk(r);
    });

    test('type types text key by key', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run('click "What needs to be done?"');
      const r = await bridgeContext.bridge.run('type "hello world"');
      expectOk(r);
    });

    test('eval executes JavaScript and returns result', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('eval document.title');
      expectText(r, 'TodoMVC');
    });
  });

  // ─── Verification ────────────────────────────────────────────────────────────

  test.describe('Verification', () => {
    test.beforeEach(async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
    });

    test('verify-text passes for visible text', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run('fill "What needs to be done?" "verify item"');
      await bridgeContext.bridge.run('press Enter');
      const r = await bridgeContext.bridge.run('verify-text "verify item"');
      expectOk(r);
      expect(r.text).toBeTruthy();
    });

    test('verify-no-text passes for absent text', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('verify-no-text "nonexistent xyz text"');
      expectOk(r);
    });

    test('verify-title passes when title matches', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('verify-title "TodoMVC"');
      expectOk(r);
    });

    test('verify-url passes when URL matches', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('verify-url "todomvc"');
      expectOk(r);
    });

    test('verify-element passes when element exists', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('verify-element heading "todos"');
      expectOk(r);
    });
  });

  // ─── Tab commands ────────────────────────────────────────────────────────────

  test.describe('Tab commands', () => {
    test.beforeEach(async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
    });

    test('tab-list returns valid JSON array with tab details', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('tab-list');
      const tabs = expectJSON(r) as any[];
      expect(Array.isArray(tabs)).toBe(true);
      expect(tabs.length).toBeGreaterThan(0);
      expect(tabs[0]).toHaveProperty('index');
      expect(tabs[0]).toHaveProperty('title');
      expect(tabs[0]).toHaveProperty('url');
    });

    test('tab-new opens a new tab and tab-close closes it', async ({ bridgeContext }) => {
      const r1 = await bridgeContext.bridge.run('tab-list');
      const before = (expectJSON(r1) as any[]).length;

      const r = await bridgeContext.bridge.run('tab-new https://example.com');
      expectOk(r);
      const r2 = await bridgeContext.bridge.run('tab-list');
      const after = (expectJSON(r2) as any[]).length;
      expect(after).toBe(before + 1);

      // Clean up: close the tab we just opened
      const r3 = await bridgeContext.bridge.run(`tab-close ${after - 1}`);
      expectOk(r3);
      const r4 = await bridgeContext.bridge.run('tab-list');
      const final = (expectJSON(r4) as any[]).length;
      expect(final).toBeLessThan(after);
    });

    test('tab-select switches to a tab', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('tab-select 0');
      expectOk(r);
    });
  });

  // ─── Cookie commands ─────────────────────────────────────────────────────────

  test.describe('Cookie commands', () => {
    test.beforeEach(async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
    });

    test('cookie-list returns valid JSON array', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('cookie-list');
      const cookies = expectJSON(r);
      expect(Array.isArray(cookies)).toBe(true);
    });

    test('cookie-get returns cookie value or not-found message', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('cookie-get "nonexistent_cookie"');
      expectOk(r);
      expect(r.text).toBeTruthy();
    });
  });

  // ─── LocalStorage commands ───────────────────────────────────────────────────

  test.describe('LocalStorage commands', () => {
    test.beforeEach(async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
    });

    test('localstorage set, get, list, delete cycle', async ({ bridgeContext }) => {
      const r1 = await bridgeContext.bridge.run('localstorage-set lk_bridge lv_bridge');
      expectOk(r1);

      const r2 = await bridgeContext.bridge.run('localstorage-get lk_bridge');
      expectOk(r2);
      expect(r2.text).toContain('lv_bridge');

      const r3 = await bridgeContext.bridge.run('localstorage-list');
      const data = expectJSON(r3);
      expect(JSON.stringify(data)).toContain('lk_bridge');

      const r4 = await bridgeContext.bridge.run('localstorage-delete lk_bridge');
      expectOk(r4);

      const r5 = await bridgeContext.bridge.run('localstorage-list');
      expect(r5.text ?? '').not.toContain('lk_bridge');
    });
  });

  // ─── SessionStorage commands ─────────────────────────────────────────────────

  test.describe('SessionStorage commands', () => {
    test.beforeEach(async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
    });

    test('sessionstorage set, get, list, delete cycle', async ({ bridgeContext }) => {
      const r1 = await bridgeContext.bridge.run('sessionstorage-set sk_bridge sv_bridge');
      expectOk(r1);

      const r2 = await bridgeContext.bridge.run('sessionstorage-get sk_bridge');
      expectOk(r2);
      expect(r2.text).toContain('sv_bridge');

      const r3 = await bridgeContext.bridge.run('sessionstorage-list');
      const data = expectJSON(r3);
      expect(JSON.stringify(data)).toContain('sk_bridge');

      const r4 = await bridgeContext.bridge.run('sessionstorage-delete sk_bridge');
      expectOk(r4);
    });
  });

  // ─── Script execution (bridge-only) ─────────────────────────────────────────

  test.describe('Script execution', () => {
    test('runScript executes multi-line pw commands with checkmarks', async ({ bridgeContext }) => {
      const script = [
        `goto ${TODO_URL}`,
        'fill "What needs to be done?" "Script todo"',
        'press Enter',
        'verify-text "Script todo"',
      ].join('\n');
      const r = await bridgeContext.bridge.runScript(script, 'pw');
      expectOk(r);
      expect(r.text).toContain('\u2713'); // ✓ checkmark
    });

    test('runScript stops on first error with X mark', async ({ bridgeContext }) => {
      const script = [
        `goto ${TODO_URL}`,
        'click "nonexistent-element-xyz-12345"',
        'fill "What needs to be done?" "Should not reach"',
      ].join('\n');
      const r = await bridgeContext.bridge.runScript(script, 'pw');
      expect(r.isError).toBe(true);
      expect(r.text).toContain('\u2717'); // ✗ X mark
      expect(r.text).not.toContain('Should not reach');
    });

    test('runScript with javascript language executes JS', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
      const r = await bridgeContext.bridge.runScript('await page.title()', 'javascript');
      expectOk(r);
      expect(r.text).toContain('TodoMVC');
    });
  });

  // ─── JavaScript expressions ─────────────────────────────────────────────────

  test.describe('JavaScript expressions', () => {
    test.beforeEach(async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
    });

    test('page.title() returns title string', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('await page.title()');
      expectOk(r);
      expect(r.text).toContain('TodoMVC');
    });

    test('page.url() returns URL string', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('await page.url()');
      expectOk(r);
      expect(r.text).toContain('todomvc');
    });

    test('page.locator().textContent() returns element text', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run("await page.locator('h1').textContent()");
      expectOk(r);
      expect(r.text).toContain('todos');
    });

    test('page.locator().count() returns a number', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run('fill "What needs to be done?" "JS test item"');
      await bridgeContext.bridge.run('press Enter');
      const r = await bridgeContext.bridge.run("await page.locator('.todo-list li').count()");
      expectOk(r);
      expect(Number(r.text)).toBeGreaterThan(0);
    });

    test('page.locator().getAttribute() returns attribute value', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run("await page.locator('input.new-todo').getAttribute('placeholder')");
      expectOk(r);
      expect(r.text).toContain('What needs to be done?');
    });

    test('page.locator().isVisible() returns boolean', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run("await page.locator('h1').isVisible()");
      expectOk(r);
      expect(r.text).toMatch(/true|false/);
    });

    test('page.evaluate() returns evaluated result', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run("await page.evaluate(() => window.location.hostname)");
      expectOk(r);
      expect(r.text).toContain('playwright.dev');
    });

    test('page.locator().click() executes without error', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run("await page.locator('h1').click()");
      expectOk(r);
    });

    test('arithmetic expression returns result', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('1 + 2 + 3');
      expectOk(r);
      expect(r.text).toContain('6');
    });

    test('object literal returns meaningful string', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('({a: 1, b: "hello"})');
      expectOk(r);
      expect(r.text).toBeTruthy();
      expect(r.text).toContain('a');
      expect(r.text).toContain('hello');
    });

    test('invalid JS returns error', async ({ bridgeContext }) => {
      const r = await bridgeContext.bridge.run('await page.locator("nonexistent-selector-xyz").click({timeout: 2000})');
      expect(r.isError).toBe(true);
      expect(r.text).toBeTruthy();
    });
  });

  // ─── Error handling ──────────────────────────────────────────────────────────

  test.describe('Error handling', () => {
    test('unknown command returns error', async ({ bridgeContext }) => {
      await bridgeContext.bridge.run(`goto ${TODO_URL}`);
      const r = await bridgeContext.bridge.run('nonexistent_cmd_xyz');
      expect(r.isError).toBe(true);
      expect(r.text).toBeTruthy();
    });

    test('disconnected bridge returns not-connected error', async () => {
      const { BridgeServer: BS } = await import('../../../core/dist/index.js');
      const standalone = new BS();
      await standalone.start(9877);
      const r = await standalone.run('snapshot');
      expect(r.text).toContain('Extension not connected');
      expect(r.isError).toBe(true);
      await standalone.close();
    });
  });
});
