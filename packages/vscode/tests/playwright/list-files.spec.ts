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

// Tests that don't need webviews have been moved to tests/unit/list-files.test.ts.
// Only tests that use enableConfigs/enableProjects (webview interaction) remain here.

import { enableConfigs, enableProjects, expect, test } from './utils';
import path from 'path';

test('should switch between multiple projects with filter', async ({ activate }) => {
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
    'tests/test3.spec.ts': `
      import { test } from '@playwright/test';
      test('three', async () => {});
    `,
  });
  await enableProjects(vscode, ['project 1']);
  await expect(testController).toHaveTestTree(`
    -   tests
      -   test1.spec.ts
    -    [playwright.config.js [project 2] — disabled]
  `);

  await expect(vscode).toHaveConnectionLog([
    { method: 'listFiles', params: {} }
  ]);

  await expect(vscode).toHaveProjectTree(`
    config: playwright.config.js
    [x] project 1
    [ ] project 2
  `);

  await enableProjects(vscode, ['project 2']);

  await expect(testController).toHaveTestTree(`
    -   tests
      -   test2.spec.ts
    -    [playwright.config.js [project 1] — disabled]
  `);

  await expect(vscode).toHaveProjectTree(`
    config: playwright.config.js
    [ ] project 1
    [x] project 2
  `);

  await expect(vscode).toHaveConnectionLog([
    { method: 'listFiles', params: {} }
  ]);
});

test('should list files in multi-folder workspace with project switching', async ({ activate }, testInfo) => {
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
      }],
    ]
  });

  await expect(testController).toHaveTestTree(`
    -   folder1
      -   test.spec.ts
  `);

  await enableConfigs(vscode, [`folder2${path.sep}playwright.config.js`]);

  await expect(testController).toHaveTestTree(`
    -   folder2
      -   test.spec.ts
  `);
});

test('should ignore errors when listing files', async ({ activate }) => {
  const { vscode, testController } = await activate({
    'playwright.config.js': `module.exports = { testDir: 'tests' }`,
    'playwright.config.ts': `throw new Error('oh my')`,
    'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
    `,
  });

  await enableConfigs(vscode, ['playwright.config.ts', 'playwright.config.js']);

  await expect(testController).toHaveTestTree(`
    -   tests
      -   test.spec.ts
  `);

  await expect(vscode).toHaveConnectionLog([
    { method: 'listFiles', params: {} },
    { method: 'listFiles', params: {} }
  ]);

  await new Promise(f => setTimeout(f, 2000));
  await expect.poll(() => vscode.languages.getDiagnostics()).toEqual([
    {
      message: 'Error: oh my',
      range: { start: { line: 0, character: 6 }, end: { line: 1, character: 0 } },
      severity: 'Error',
      source: 'playwright',
    }
  ]);
});
