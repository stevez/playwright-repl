/**
 * MS Forms record → replay E2E.
 *
 * Microsoft Forms folds decorative text into every field's accessible name
 * (a required-star role="note", hidden aria-labelledby hints). The recorder
 * records a readable prefix of Playwright's name; both the .pw commands and
 * the generated JS must replay against the same page.
 */

import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Page } from '@playwright/test';
import { test, expect } from './fixtures.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MS_FORMS_URL = pathToFileURL(path.resolve(__dirname, 'ms-forms-fixture.html')).href;

/** Fill both questions and open the second dropdown, like a user would. */
async function interact(testPage: Page) {
  await testPage.bringToFront();
  await testPage.locator('#q1-input').fill('Acme');
  await testPage.locator('#q1-input').press('Tab');
  await testPage.locator('#q5-input').fill('CI123');
  await testPage.locator('#q5-input').press('Tab');
  await testPage.locator('#dd2 span').click();
}

async function expectReplayed(testPage: Page) {
  await expect(testPage.locator('#q1-input')).toHaveValue('Acme');
  await expect(testPage.locator('#q5-input')).toHaveValue('CI123');
  await expect(testPage.locator('#dd2')).toHaveAttribute('data-clicked', '1');
  await expect(testPage.locator('#dd1')).not.toHaveAttribute('data-clicked');
}

test.describe('MS Forms record → replay', () => {
  test.beforeEach(async ({ sidePanel, extensionId, testPage }) => {
    await testPage.goto(MS_FORMS_URL);
    await sidePanel.goto(extensionId);
    await sidePanel.clearEditor();
    await testPage.bringToFront();
    await sidePanel.attachToActiveTab();
  });

  test.afterEach(async ({ sidePanel }) => {
    if (await sidePanel.isRecording()) await sidePanel.stopRecording();
  });

  test('JS output replays in plain Playwright', async ({ sidePanel, testPage }) => {
    await sidePanel.switchMode('js');
    await sidePanel.startRecording('await page.goto(');
    await interact(testPage);
    await sidePanel.waitForEditorText('.click()');
    await sidePanel.stopRecording();

    const lines = await sidePanel.editor.locator('.cm-line').allTextContents();
    const actions = lines.map(l => l.trim()).filter(l => l.startsWith('await page.') && !l.includes('page.goto('));
    // Readable prefix names, matched by Playwright's substring semantics (no exact).
    expect(actions).toContain("await page.getByRole('textbox', { name: '1. Application Name' }).fill('Acme');");
    expect(actions).toContain("await page.getByRole('textbox', { name: '5. Application CI:' }).fill('CI123');");

    // Replay the recorded JS directly against Playwright — no playwright-repl fallback involved.
    await testPage.reload();
    const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
    for (const stmt of actions) await new AsyncFunction('page', stmt)(testPage);
    await expectReplayed(testPage);
  });

  test('.pw output replays through the panel', async ({ sidePanel, testPage }) => {
    await sidePanel.switchMode('pw');
    await sidePanel.startRecording();
    await interact(testPage);
    await sidePanel.waitForEditorText('click');
    await sidePanel.stopRecording();

    const lines = await sidePanel.editor.locator('.cm-line').allTextContents();
    const commands = lines.map(l => l.trim()).filter(l => l && !l.startsWith('goto '));
    expect(commands).toContain('fill textbox "1. Application Name" "Acme"');
    expect(commands).toContain('fill textbox "5. Application CI:" "CI123"');

    await testPage.reload();
    for (const cmd of commands) {
      await sidePanel.submitInput(cmd);
      await sidePanel.page.waitForTimeout(300);
    }
    await expectReplayed(testPage);
  });
});
