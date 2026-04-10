/**
 * Copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { describe, it, expect } from 'vitest';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import fs from 'fs';
import { activate } from './mock-activate';
import { expectTestTree, expectConnectionLog } from './expect-helpers';

const escapedPathSep = path.sep.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('list tests', () => {
  it('should list tests on expand', async () => {
    const { vscode, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);
    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);
  });

  it('should list tests for visible editors', async () => {
    const { vscode, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test1.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
      'tests/test2.spec.ts': `
      import { test } from '@playwright/test';
      test('two', async () => {});
    `,
    });

    await vscode.openEditors('**/test*.spec.ts');
    await new Promise(f => testController.onDidChangeTestItem(f));

    await expectTestTree(testController, `
    -   tests
      -   test1.spec.ts
        -   one [2:0]
      -   test2.spec.ts
        -   two [2:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [
            expect.stringContaining(`tests${escapedPathSep}test1\\.spec\\.ts`),
            expect.stringContaining(`tests${escapedPathSep}test2\\.spec\\.ts`),
          ]
        }
      },
    ]);
  });

  it('should list suits', async () => {
    const { testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
      test('two', async () => {});
      test.describe('group 1', () => {
        test('one', async () => {});
        test('two', async () => {});
      });
      test.describe('group 2', () => {
        test.describe('group 2.1', () => {
          test('one', async () => {});
          test('two', async () => {});
        });
        test('one', async () => {});
        test('two', async () => {});
      });
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);
    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
        -   two [3:0]
        -   group 1 [4:0]
          -   one [5:0]
          -   two [6:0]
        -   group 2 [8:0]
          -   group 2.1 [9:0]
            -   one [10:0]
            -   two [11:0]
          -   one [13:0]
          -   two [14:0]
  `);
  });

  it('should discover new tests', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.changeFile('tests/test.spec.ts', `
      import { test } from '@playwright/test';
      test('one', async () => {});
      test('two', async () => {});
    `)
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
        -   two [3:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);
  });

  it('should discover new tests with active editor', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test1.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
    });

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
    ]);
    await workspaceFolder.addFile('tests/test2.spec.ts', `
    import { test } from '@playwright/test';
    test('two', async () => {});
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      { method: 'listFiles', params: {} },
    ]);
    await Promise.all([
      new Promise<void>(f => {
        testController.onDidChangeTestItem(ti => {
          if (ti.label.includes('test2.spec'))
            f();
        });
      }),
      vscode.openEditors('**/test2.spec.ts'),
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test1.spec.ts
      -   test2.spec.ts
        -   two [2:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test2\\.spec\\.ts`)]
        }
      },
    ]);
  });

  it('should discover tests on add + change', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: './' }`,
    });

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.addFile('test.spec.ts', ``)
    ]);

    await expectTestTree(testController, `
    -   test.spec.ts
  `);

    await testController.expandTestItems(/test.spec.ts/);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.changeFile('test.spec.ts', `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `)
    ]);

    await expectTestTree(testController, `
    -   test.spec.ts
      -   one [2:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`test\\.spec\\.ts`)]
        }
      },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`test\\.spec\\.ts`)]
        }
      },
    ]);
  });

  it('should discover new test at existing location', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.changeFile('tests/test.spec.ts', `
      import { test } from '@playwright/test';
      test('two', async () => {});
    `)
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   two [2:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);
  });

  it('should remove deleted tests', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
      test('two', async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
        -   two [3:0]
  `);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.changeFile('tests/test.spec.ts', `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `)
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);
  });

  it('should forget tests after error before first test', async () => {
    const { testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
      test('two', async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
        -   two [3:0]
  `);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.changeFile('tests/test.spec.ts', `
      import { test } from '@playwright/test';
      test('one', async () => {});
      throw new Error('Uncaught');
      test('two', async () => {});
    `)
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
  `);
  });

  it('should regain tests after error is fixed', async () => {
    const { vscode, testController, workspaceFolder } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      throw new Error('Uncaught');
      test('one', async () => {});
      test('two', async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
  `);

    await Promise.all([
      new Promise(f => testController.onDidChangeTestItem(f)),
      workspaceFolder.changeFile('tests/test.spec.ts', `
      import { test } from '@playwright/test';
      test('one', async () => {});
      test('two', async () => {});
    `)
    ]);

    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
        -   two [3:0]
  `);

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
      {
        method: 'listTests',
        params: {
          locations: [expect.stringContaining(`tests${escapedPathSep}test\\.spec\\.ts`)]
        }
      },
    ]);
  });

  it('should list parametrized tests', async () => {
    const { testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      for (const name of ['one', 'two', 'three'])
        test(name, async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);
    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [3:0]
        -   three [3:0]
        -   two [3:0]
  `);
  });

  it('should list tests in parametrized groups', async () => {
    const { testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      for (const foo of [1, 2]) {
        test.describe('level ' + foo, () => {
          test('should work', async () => {});
        });
      }
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);
    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   level 1 [3:0]
          -   should work [4:0]
        -   level 2 [3:0]
          -   should work [4:0]
  `);
  });

  it('should not run config reporters', async () => {
    const tmpDir = path.join(os.tmpdir(), 'pw-test-' + crypto.randomBytes(8).toString('hex'));
    const { testController } = await activate({
      'playwright.config.js': `module.exports = {
      testDir: 'tests',
      reporter: 'html',
    }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
    }, { rootDir: tmpDir });

    await testController.expandTestItems(/test.spec.ts/);
    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
        -   one [2:0]
  `);

    expect(fs.existsSync(path.join(tmpDir, 'playwright-report'))).toBeFalsy();
  });

  it('should not keep empty workspace-folders in a workspace', async () => {
    const folder1 = path.join(os.tmpdir(), 'pw-test-' + crypto.randomBytes(8).toString('hex'), 'folder1');
    const folder2 = path.join(os.tmpdir(), 'pw-test-' + crypto.randomBytes(8).toString('hex'), 'folder2');
    const { testController } = await activate({}, {
      workspaceFolders: [
        [folder1, {}],
        [folder2, {
          'playwright.config.js': `module.exports = { testDir: './' }`,
          'test.spec.ts': `
          import { test } from '@playwright/test';
          test('two', async () => {});
        `,
        }]
      ]
    });

    // Make sure folder1 is not listed.
    await expectTestTree(testController, `
    -   folder2
      -   test.spec.ts
  `);

    await testController.expandTestItems(/test.spec.ts/);
    // Make sure folder1 is not listed.
    await expectTestTree(testController, `
    -   folder2
      -   test.spec.ts
        -   two [2:0]
  `);
  });
});
