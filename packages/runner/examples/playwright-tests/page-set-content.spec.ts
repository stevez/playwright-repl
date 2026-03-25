/**
 * Copyright 2017 Google Inc. All rights reserved.
 * Modifications copyright (c) Microsoft Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { test as it, expect } from './pageTest';

const expectedOutput = '<html><head></head><body><div>hello</div></body></html>';

it('should work @smoke', async ({ page, server }) => {
  await page.setContent('<div>hello</div>');
  const result = await page.content();
  expect(result).toBe(expectedOutput);
});

it('should work with domcontentloaded', async ({ page, server }) => {
  await page.setContent('<div>hello</div>', { waitUntil: 'domcontentloaded' });
  const result = await page.content();
  expect(result).toBe(expectedOutput);
});

it('should work with commit', async ({ page }) => {
  await page.setContent('<div>hello</div>', { waitUntil: 'commit' });
  const result = await page.content();
  expect(result).toBe(expectedOutput);
});

it('should work with doctype', async ({ page, server }) => {
  const doctype = '<!DOCTYPE html>';
  await page.setContent(`${doctype}<div>hello</div>`);
  const result = await page.content();
  expect(result).toBe(`${doctype}${expectedOutput}`);
});

it('should work with HTML 4 doctype', async ({ page, server }) => {
  const doctype = '<!DOCTYPE html PUBLIC "-//W3C//DTD HTML 4.01//EN" ' +
    '"http://www.w3.org/TR/html4/strict.dtd">';
  await page.setContent(`${doctype}<div>hello</div>`);
  const result = await page.content();
  expect(result).toBe(`${doctype}${expectedOutput}`);
});

it('should work fast enough', async ({ page, server }) => {
  for (let i = 0; i < 20; ++i)
    await page.setContent('<div>yo</div>');
});

it('should work with tricky content', async ({ page, server }) => {
  await page.setContent('<div>hello world</div>' + '\x7F');
  expect(await page.$eval('div', div => div.textContent)).toBe('hello world');
});

it('should work with accents', async ({ page, server }) => {
  await page.setContent('<div>aberración</div>');
  expect(await page.$eval('div', div => div.textContent)).toBe('aberración');
});

it('should work with emojis', async ({ page, server }) => {
  await page.setContent('<div>🐥</div>');
  expect(await page.$eval('div', div => div.textContent)).toBe('🐥');
});

it('should work with newline', async ({ page, server }) => {
  await page.setContent('<div>\n</div>');
  expect(await page.$eval('div', div => div.textContent)).toBe('\n');
});

