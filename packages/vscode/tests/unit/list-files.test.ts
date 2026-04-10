/**
 * Tests for file discovery — converted from Playwright to vitest (no browser needed).
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { activate } from './mock-activate';
import { expectTestTree, expectConnectionLog } from './expect-helpers';

describe('list files', () => {
  it('should list files', async () => {
    const { vscode, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
        import { test } from '@playwright/test';
        test('one', async () => {});
      `,
    });

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
  `);
    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} }
    ]);
  });

  it('should list only test files', async () => {
    const { testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'model.ts': `export const a = 1;`,
      'tests/test.spec.ts': `
        import { test } from '@playwright/test';
        test('one', async () => {});
      `,
    });

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
  `);
  });

  it('should list folders', async () => {
    const { vscode, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/foo/test-a.spec.ts': ``,
      'tests/foo/test-b.spec.ts': ``,
      'tests/bar/test-a.spec.ts': ``,
      'tests/a/b/c/d/test-c.spec.ts': ``,
    });

    await expectTestTree(testController, `
    -   tests
      -   a
        -   b
          -   c
            -   d
              -   test-c.spec.ts
      -   bar
        -   test-a.spec.ts
      -   foo
        -   test-a.spec.ts
        -   test-b.spec.ts
  `);
    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} }
    ]);
  });

  it('should support multiple projects', async () => {
    const { vscode, testController } = await activate({
      'playwright.config.js': `module.exports = {
        testDir: './tests',
        projects: [
          { name: 'project 1' },
          { name: 'project 2' },
        ]
      }`,
      'tests/test1.spec.ts': `
        import { test } from '@playwright/test';
        test('one', async () => {});
      `,
      'tests/test2.spec.ts': `
        import { test } from '@playwright/test';
        test('two', async () => {});
      `,
    });

    await expectTestTree(testController, `
    -   tests
      -   test1.spec.ts
      -   test2.spec.ts
  `);
    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} }
    ]);
  });

  it('should list files in relative folder', async () => {
    const { vscode, testController } = await activate({
      'foo/bar/playwright.config.js': `module.exports = { testDir: '../../tests' }`,
      'tests/test.spec.ts': `
        import { test } from '@playwright/test';
        test('one', async () => {});
      `,
    });

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
  `);
    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} }
    ]);
  });

  it('should list files top level if no testDir', async () => {
    const rootDir = path.join(os.tmpdir(), 'pw-test-' + crypto.randomBytes(8).toString('hex'), 'myWorkspace');
    const { vscode, testController } = await activate({
      'playwright.config.js': `{}`,
      'test.spec.ts': `
        import { test } from '@playwright/test';
        test('one', async () => {});
      `,
    }, { rootDir });

    await expectTestTree(testController, `
    -   test.spec.ts
  `);
    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} }
    ]);
  });

  it('should pick new files', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test-1.spec.ts': ``
    });

    await expectTestTree(testController, `
    -   tests
      -   test-1.spec.ts
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} }
    ]);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.addFile('tests/test-2.spec.ts', '')
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test-1.spec.ts
      -   test-2.spec.ts
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      { method: 'listFiles', params: {} }
    ]);
  });

  it('should not pick non-test files', async () => {
    const { workspaceFolder, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test-1.spec.ts': ``
    });

    await expectTestTree(testController, `
    -   tests
      -   test-1.spec.ts
  `);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.addFile('tests/model.ts', ''),
      workspaceFolder.addFile('tests/test-2.spec.ts', ''),
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test-1.spec.ts
      -   test-2.spec.ts
  `);
  });

  it('should tolerate missing testDir', async () => {
    const { workspaceFolder, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
    });

    await expectTestTree(testController, `
  `);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.addFile('tests/test.spec.ts', '')
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
  `);
  });

  it('should remove deleted files', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test-1.spec.ts': ``,
      'tests/test-2.spec.ts': ``,
      'tests/test-3.spec.ts': ``,
    });

    await expectTestTree(testController, `
    -   tests
      -   test-1.spec.ts
      -   test-2.spec.ts
      -   test-3.spec.ts
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} }
    ]);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.removeFile('tests/test-2.spec.ts')
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test-1.spec.ts
      -   test-3.spec.ts
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      { method: 'listFiles', params: {} }
    ]);
  });

  it('should do nothing for not loaded changed file', async () => {
    const { workspaceFolder, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test-1.spec.ts': ``,
      'tests/test-2.spec.ts': ``,
      'tests/test-3.spec.ts': ``,
    });

    await expectTestTree(testController, `
    -   tests
      -   test-1.spec.ts
      -   test-2.spec.ts
      -   test-3.spec.ts
  `);

    let changed = false;
    testController.onDidChangeTestItem(() => changed = true);
    await workspaceFolder.changeFile('tests/test-2.spec.ts', '// new content');
    await new Promise(f => setTimeout(f, 2000));
    expect(changed).toBeFalsy();
  });
});
