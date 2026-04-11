/**
 * Tests for Recorder — code generation via recording.
 *
 * Uses mock BrowserManager to simulate recorded events without a real browser.
 * Tests editor insertion logic, template generation, and start/stop lifecycle.
 */

import { expect, test } from './utils';
import type { IBrowserManager, CommandResult } from '../../src/browser';

// ─── Mock BrowserManager ─────────────────────────────────────────────────────

class MockBrowserManager implements IBrowserManager {
  private _running = true;
  private _eventCallback: ((event: Record<string, unknown>) => void) | null = null;
  private _pageUrl = 'https://example.com';
  recordStartCalled = false;
  recordStopCalled = false;

  isRunning() { return this._running; }
  setRunning(v: boolean) { this._running = v; }

  get page() { return { url: () => this._pageUrl }; }
  get bridge() { return undefined; }
  get httpPort() { return null; }
  get cdpUrl() { return undefined; }
  async launch() {}
  async stop() {}
  async runScript() { return { text: '' }; }

  async runCommand(raw: string): Promise<CommandResult> {
    if (raw === 'record-start') {
      this.recordStartCalled = true;
      return { text: `Recording started: ${this._pageUrl}` };
    }
    if (raw === 'record-stop') {
      this.recordStopCalled = true;
      return { text: 'Recording stopped' };
    }
    return { text: '' };
  }

  onEvent(fn: ((event: Record<string, unknown>) => void) | null) {
    this._eventCallback = fn;
  }

  /** Simulate a recorded action event */
  emitAction(js: string, pw?: string) {
    this._eventCallback?.({ type: 'recorded-action', action: { js, pw: pw ?? js } });
  }

  /** Simulate a fill update event */
  emitFillUpdate(js: string, pw?: string) {
    this._eventCallback?.({ type: 'recorded-fill-update', action: { js, pw: pw ?? js } });
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test('should show warning when browser is not running', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  const mockBrowser = new MockBrowserManager();
  mockBrowser.setRunning(false);

  // @ts-ignore — access internal for test
  const { Recorder } = await import('../../dist/recorder');
  const outputChannel = vscode.window.createOutputChannel('test');
  const recorder = new Recorder(vscode, mockBrowser, outputChannel);

  await recorder.start();

  expect(vscode.warnings).toContain('Launch browser first.');
  expect(recorder.isRecording).toBe(false);

  recorder.dispose();
});

test('should insert test template when cursor is outside test function', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
    'tests/test.spec.ts': [
      "import { test } from '@playwright/test';",
      '',
    ].join('\n'),
  });

  await vscode.openEditors('**/test.spec.ts');
  const editor = vscode.window.activeTextEditor;
  // Place cursor at line 1 (outside any test)
  editor.selection = new vscode.Selection(1, 0, 1, 0);

  const mockBrowser = new MockBrowserManager();
  const { Recorder } = await import('../../dist/recorder');
  const outputChannel = vscode.window.createOutputChannel('test');
  const recorder = new Recorder(vscode, mockBrowser, outputChannel);

  await recorder.start();

  expect(recorder.isRecording).toBe(true);
  expect(mockBrowser.recordStartCalled).toBe(true);

  // Template should have been inserted
  const text = editor.document.text;
  expect(text).toContain("test('new test', async ({ page }) => {");
  expect(text).toContain('});');

  // Goto should have been inserted from the URL returned by record-start
  expect(text).toContain("await page.goto('https://example.com');");

  await recorder.stop();
  recorder.dispose();
});

test('should insert actions at cursor inside test function', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
    'tests/test.spec.ts': [
      "import { test } from '@playwright/test';",
      '',
      "test('my test', async ({ page }) => {",
      '  ',
      '});',
    ].join('\n'),
  });

  await vscode.openEditors('**/test.spec.ts');
  const editor = vscode.window.activeTextEditor;
  // Place cursor inside the test body (line 3)
  editor.selection = new vscode.Selection(3, 0, 3, 0);

  const mockBrowser = new MockBrowserManager();
  const { Recorder } = await import('../../dist/recorder');
  const outputChannel = vscode.window.createOutputChannel('test');
  const recorder = new Recorder(vscode, mockBrowser, outputChannel);

  await recorder.start();
  expect(recorder.isRecording).toBe(true);

  // Simulate clicking a button
  mockBrowser.emitAction("await page.getByRole('button', { name: 'Submit' }).click();");

  // Wait for edit queue to process
  await new Promise(r => setTimeout(r, 50));

  const text = editor.document.text;
  expect(text).toContain("await page.getByRole('button', { name: 'Submit' }).click();");

  await recorder.stop();
  recorder.dispose();
});

test('should replace last line on fill update', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
    'tests/test.spec.ts': [
      "import { test } from '@playwright/test';",
      '',
      "test('my test', async ({ page }) => {",
      '  ',
      '});',
    ].join('\n'),
  });

  await vscode.openEditors('**/test.spec.ts');
  const editor = vscode.window.activeTextEditor;
  editor.selection = new vscode.Selection(3, 0, 3, 0);

  const mockBrowser = new MockBrowserManager();
  const { Recorder } = await import('../../dist/recorder');
  const outputChannel = vscode.window.createOutputChannel('test');
  const recorder = new Recorder(vscode, mockBrowser, outputChannel);

  await recorder.start();

  // Simulate typing — first keystroke is an action, subsequent are fill updates
  mockBrowser.emitAction("await page.getByLabel('Email').fill('h');");
  await new Promise(r => setTimeout(r, 50));
  mockBrowser.emitFillUpdate("await page.getByLabel('Email').fill('he');");
  await new Promise(r => setTimeout(r, 50));
  mockBrowser.emitFillUpdate("await page.getByLabel('Email').fill('hello');");
  await new Promise(r => setTimeout(r, 50));

  const text = editor.document.text;
  // Should have the final fill value, not intermediate ones
  expect(text).toContain("await page.getByLabel('Email').fill('hello');");
  expect(text).not.toContain("fill('h')");
  expect(text).not.toContain("fill('he')");

  await recorder.stop();
  recorder.dispose();
});

test('should stop recording and reset state', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
    'tests/test.spec.ts': [
      "import { test } from '@playwright/test';",
      '',
      "test('my test', async ({ page }) => {",
      '  ',
      '});',
    ].join('\n'),
  });

  await vscode.openEditors('**/test.spec.ts');
  const editor = vscode.window.activeTextEditor;
  editor.selection = new vscode.Selection(3, 0, 3, 0);

  const mockBrowser = new MockBrowserManager();
  const { Recorder } = await import('../../dist/recorder');
  const outputChannel = vscode.window.createOutputChannel('test');
  const recorder = new Recorder(vscode, mockBrowser, outputChannel);

  await recorder.start();
  expect(recorder.isRecording).toBe(true);

  await recorder.stop();
  expect(recorder.isRecording).toBe(false);
  expect(mockBrowser.recordStopCalled).toBe(true);

  // Events after stop should not insert anything
  mockBrowser.emitAction("await page.getByText('Should not appear').click();");
  await new Promise(r => setTimeout(r, 50));

  const text = editor.document.text;
  expect(text).not.toContain('Should not appear');

  recorder.dispose();
});

test('should not start recording twice', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
    'tests/test.spec.ts': [
      "import { test } from '@playwright/test';",
      '',
      "test('my test', async ({ page }) => {",
      '  ',
      '});',
    ].join('\n'),
  });

  await vscode.openEditors('**/test.spec.ts');
  const editor = vscode.window.activeTextEditor;
  editor.selection = new vscode.Selection(3, 0, 3, 0);

  const mockBrowser = new MockBrowserManager();
  const { Recorder } = await import('../../dist/recorder');
  const outputChannel = vscode.window.createOutputChannel('test');
  const recorder = new Recorder(vscode, mockBrowser, outputChannel);

  await recorder.start();
  expect(recorder.isRecording).toBe(true);

  // Second start should be a no-op
  await recorder.start();
  expect(recorder.isRecording).toBe(true);

  await recorder.stop();
  recorder.dispose();
});

test('should show warning when no editor is open', async ({ activate }) => {
  const { vscode } = await activate({
    'playwright.config.js': `module.exports = {}`,
  });

  // No editor open
  vscode.window.activeTextEditor = undefined;

  const mockBrowser = new MockBrowserManager();
  const { Recorder } = await import('../../dist/recorder');
  const outputChannel = vscode.window.createOutputChannel('test');
  const recorder = new Recorder(vscode, mockBrowser, outputChannel);

  await recorder.start();

  expect(vscode.warnings).toContain('Open a test file first.');
  expect(recorder.isRecording).toBe(false);

  recorder.dispose();
});
