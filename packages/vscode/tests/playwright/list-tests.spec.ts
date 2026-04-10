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

// Tests that don't need webviews have been moved to tests/unit/list-tests.test.ts.
// Only tests that use enableConfigs/enableProjects (webview interaction) remain here.

import { enableConfigs, enableProjects, escapedPathSep, expect, test } from './utils';
import path from 'path';

test('should support multiple configs', async ({ activate }) => {
  const { vscode, testController } = await activate({
    'tests1/playwright.config.js': `module.exports = { testDir: '.' }`,
    'tests2/playwright.config.js': `module.exports = { testDir: '.' }`,
    'tests1/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
    'tests2/test.spec.ts': `
      import { test } from '@playwright/test';
      test('two', async () => {});
    `,
  });

  await enableConfigs(vscode, [`tests1${path.sep}playwright.config.js`, `tests2${path.sep}playwright.config.js`]);

  await expect(testController).toHaveTestTree(`
    -   tests1
      -   test.spec.ts
    -   tests2
      -   test.spec.ts
  `);

  await testController.expandTestItems(/test.spec/);

  await expect(testController).toHaveTestTree(`
    -   tests1
      -   test.spec.ts
        -   one [2:0]
    -   tests2
      -   test.spec.ts
        -   two [2:0]
  `);

  await expect(vscode).toHaveConnectionLog([
    { method: 'listFiles', params: {} },
    { method: 'listFiles', params: {} },
    {
      method: 'listTests',
      params: {
        locations: [expect.stringContaining(`tests1${escapedPathSep}test\\.spec\\.ts`)]
      }
    },
    {
      method: 'listTests',
      params: {
        locations: [expect.stringContaining(`tests2${escapedPathSep}test\\.spec\\.ts`)]
      }
    },
  ]);
});

test('should support multiple projects', async ({ activate }) => {
  const { vscode, testController } = await activate({
    'playwright.config.js': `module.exports = {
      testDir: './tests',
      projects: [
        { name: 'project 1', testMatch: /test1.spec/ },
        { name: 'project 2', testMatch: /test2.spec/ },
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

  await enableProjects(vscode, ['project 1', 'project 2']);

  await expect(testController).toHaveTestTree(`
    -   tests
      -   test1.spec.ts
      -   test2.spec.ts
  `);

  await testController.expandTestItems(/test1.spec/);

  await expect(testController).toHaveTestTree(`
    -   tests
      -   test1.spec.ts
        -   one [2:0]
      -   test2.spec.ts
  `);

  await expect(vscode).toHaveConnectionLog([
    { method: 'listFiles', params: {} },
    {
      method: 'listTests',
      params: {
        locations: [expect.stringContaining(`tests${escapedPathSep}test1\\.spec\\.ts`)]
      }
    },
  ]);
});

test('should list tests in multi-folder workspace', async ({ activate }, testInfo) => {
  const { vscode, testController } = await activate({}, {
    workspaceFolders: [
      [testInfo.outputPath('folder1'), {
        'playwright.config.js': `module.exports = { testDir: './' }`,
        'test.spec.ts': `
          import { test } from '@playwright/test';
          test('one', async () => {});
        `,
      }],
      [testInfo.outputPath('folder2'), {
        'playwright.config.js': `module.exports = { testDir: './' }`,
        'test.spec.ts': `
          import { test } from '@playwright/test';
          test('two', async () => {});
        `,
      }]
    ]
  });

  await enableConfigs(vscode, [`folder1${path.sep}playwright.config.js`, `folder2${path.sep}playwright.config.js`]);

  await expect(testController).toHaveTestTree(`
    -   folder1
      -   test.spec.ts
    -   folder2
      -   test.spec.ts
  `);

  await testController.expandTestItems(/test.spec.ts/);
  await expect(testController).toHaveTestTree(`
    -   folder1
      -   test.spec.ts
        -   one [2:0]
    -   folder2
      -   test.spec.ts
        -   two [2:0]
  `);
});

test('should merge items from different projects', async ({ activate }, testInfo) => {
  const { vscode, testController } = await activate({
    'playwright.config.ts': `module.exports = {
      projects: [
        { name: 'desktop', grepInvert: /mobile|tablet/ },
        { name: 'mobile', grep: /@mobile/ },
        { name: 'tablet', grep: /@tablet/ },
      ]
    }`,
    'test.spec.ts': `
      import { test } from '@playwright/test';
      test.describe('group', () => {
        test('test 1', async () => {});
        test('test 2 [@mobile]', async () => {});
        test('test 3 [@mobile]', async () => {});
        test('test 4', async () => {});
      });`,
  });

  await enableProjects(vscode, ['desktop', 'mobile', 'tablet']);

  await testController.expandTestItems(/test.spec.ts/);
  await testController.expandTestItems(/group/);
  await expect(testController).toHaveTestTree(`
    -   test.spec.ts
      -   group [2:0]
        -   test 1 [3:0]
        -   test 2 [@mobile] [4:0]
        -   test 3 [@mobile] [5:0]
        -   test 4 [6:0]
  `);
});

test('should show project-specific tests', async ({ activate }, testInfo) => {
  const { vscode, testController } = await activate({
    'playwright.config.ts': `module.exports = {
      projects: [
        { name: 'chromium' },
        { name: 'firefox' },
        { name: 'webkit' },
      ]
    }`,
    'test.spec.ts': `
      import { test } from '@playwright/test';
      test('test', async () => {});
    `
  });

  await expect(testController).toHaveTestTree(`
    -   test.spec.ts
    -    [playwright.config.ts [firefox] — disabled]
    -    [playwright.config.ts [webkit] — disabled]
  `);

  await testController.expandTestItems(/test.spec.ts/);
  await expect(testController).toHaveTestTree(`
    -   test.spec.ts
      -   test [2:0]
    -    [playwright.config.ts [firefox] — disabled]
    -    [playwright.config.ts [webkit] — disabled]
  `);

  await enableProjects(vscode, ['chromium', 'firefox', 'webkit']);
  await expect(testController).toHaveTestTree(`
    -   test.spec.ts
      -   test [2:0]
        -   chromium [2:0]
        -   firefox [2:0]
        -   webkit [2:0]
  `);

  await enableProjects(vscode, ['webkit']);
  await expect(testController).toHaveTestTree(`
    -   test.spec.ts
      -   test [2:0]
    -    [playwright.config.ts [chromium] — disabled]
    -    [playwright.config.ts [firefox] — disabled]
  `);
});

test('should remove top-level items after disabling config', async ({ activate }) => {
  const { vscode, testController } = await activate({
    'tests1/playwright.config.js': `module.exports = { testDir: '.' }`,
    'tests2/playwright.config.js': `module.exports = { testDir: '.' }`,
    'tests1/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
    'tests2/test.spec.ts': `
      import { test } from '@playwright/test';
      test('two', async () => {});
    `,
  });

  await enableConfigs(vscode, [`tests1${path.sep}playwright.config.js`, `tests2${path.sep}playwright.config.js`]);

  await expect(testController).toHaveTestTree(`
    -   tests1
      -   test.spec.ts
    -   tests2
      -   test.spec.ts
  `);

  await enableConfigs(vscode, [`tests1${path.sep}playwright.config.js`]);

  await expect(testController).toHaveTestTree(`
    -   tests1
      -   test.spec.ts
  `);

  await expect(vscode).toHaveConnectionLog([
    { method: 'listFiles', params: {} },
    { method: 'listFiles', params: {} },
  ]);
});
