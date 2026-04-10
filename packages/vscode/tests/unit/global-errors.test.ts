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
import { activate } from './mock-activate';
import { expectTestTree, expectConnectionLog } from './expect-helpers';

async function pollExpect<T>(fn: () => T | Promise<T>, check: (v: T) => void, timeout = 10000) {
  const start = Date.now();
  let lastError: any;
  while (Date.now() - start < timeout) {
    try {
      const v = await fn();
      check(v);
      return;
    } catch (e) {
      lastError = e;
      await new Promise(r => setTimeout(r, 100));
    }
  }
  const v = await fn();
  check(v);
}

describe('global errors', () => {
  it('should report duplicate test title', async () => {
    const { vscode, testController } = await activate({
      'playwright.config.js': `module.exports = { testDir: 'tests' }`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('one', async () => {});
      test('two', async () => {});
      test('one', async () => {});
    `,
    });

    await testController.expandTestItems(/test.spec.ts/);
    await expectTestTree(testController, `
    -   tests
      -   test.spec.ts
  `);
    await pollExpect(
      () => vscode.languages.getDiagnostics(),
      (diagnostics) => expect(diagnostics).toEqual([
        {
          message: 'Error: duplicate test title "one", first declared in test.spec.ts:3',
          range: { start: { line: 4, character: 10 }, end: { line: 5, character: 0 } },
          severity: 'Error',
          source: 'playwright',
        }
      ])
    );
  });

  it('should report error in global setup (explicit)', async () => {
    const { vscode, testController } = await activate({
      'playwright.config.js': `module.exports = {
      testDir: 'tests',
      globalSetup: 'globalSetup.ts',
    }`,
      'globalSetup.ts': `
      import { expect } from '@playwright/test';
      async function globalSetup(config) {
        expect(true).toBe(false);
      }
      export default globalSetup;`,
      'tests/test.spec.ts': `
      import { test } from '@playwright/test';
      test('should pass', async () => {});
    `,
    });

    const testRun = await testController.run();
    await pollExpect(
      () => testRun.renderOutput(),
      (output) => expect(output).toMatch(/Running global setup if any…/)
    );
    await pollExpect(
      () => testRun.renderOutput(),
      (output) => expect(output).toMatch(/Error: expect\(received\)\.toBe\(expected\)/)
    );

    await expectConnectionLog(vscode, [
      { method: 'listFiles', params: {} },
      { method: 'runGlobalSetup', params: {} },
    ]);
  });
});
