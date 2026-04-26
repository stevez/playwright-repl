/**
 * Page Object Model for the extension side panel.
 *
 * Encapsulates all panel interactions — toolbar, editor, mode toggle,
 * console input, and recording controls.
 */

import { expect, type Page } from '@playwright/test';

export class SidePanelPage {
  constructor(private page: Page) {}

  // ─── Locators ──────────────────────────────────────────────────────────────

  get editor() { return this.page.getByTestId('editor').getByRole('textbox'); }
  get output() { return this.page.getByTestId('output'); }
  get commandInput() { return this.page.getByTestId('command-input'); }
  get recordBtn() { return this.page.getByTestId('record-btn'); }
  get runBtn() { return this.page.getByTestId('run-btn'); }
  get modeToggle() { return this.page.getByTestId('mode-toggle'); }

  // ─── Editor ────────────────────────────────────────────────────────────────

  /** Type text into the CodeMirror 6 editor. */
  async fillEditor(text: string) {
    await this.editor.click();
    if (text) await this.page.keyboard.type(text, { delay: 0 });
  }

  /** Get the text content of the editor. */
  async getEditorText(): Promise<string> {
    return (await this.editor.textContent()) ?? '';
  }

  /** Wait until the editor contains the expected substring. */
  async waitForEditorText(substring: string, timeout = 10000) {
     await expect(this.editor).toContainText(substring, { timeout, useInnerText: false });
  }

  // ─── Console Input ─────────────────────────────────────────────────────────

  /** Type text into the CodeMirror command input. */
  async fillInput(text: string) {
    await this.commandInput.locator('.cm-content').click();
    if (text) await this.page.keyboard.type(text, { delay: 0 });
  }

  // ─── Mode Toggle ───────────────────────────────────────────────────────────

  /** Switch editor mode to 'pw' or 'js'. */
  async switchMode(mode: 'pw' | 'js') {
    const label = mode === 'pw' ? '.pw' : 'JS';
    await this.modeToggle.getByText(label).click();
    await expect(this.modeToggle.getByText(label)).toHaveAttribute('data-active', '');
  }

  // ─── Recording ─────────────────────────────────────────────────────────────

  /** Click Record and wait for recording state + goto to appear. */
  async startRecording(gotoText = 'goto "') {
    await this.recordBtn.click();
    await expect(this.recordBtn).toHaveClass(/recording/, { timeout: 10000 });
    await this.waitForEditorText(gotoText);
  }

  /** Click Record to stop and verify state resets. */
  async stopRecording() {
    await this.recordBtn.click();
    await expect(this.recordBtn).not.toHaveClass(/recording/);
  }

  /** Check if currently recording. */
  async isRecording(): Promise<boolean> {
    return this.recordBtn.evaluate(el => el.classList.contains('recording'));
  }

  // ─── Attach ────────────────────────────────────────────────────────────────

  /** Attach the extension to the currently active tab. */
  async attachToActiveTab() {
    await this.page.evaluate(() =>
      new Promise(resolve =>
        chrome.tabs.query({ active: true, lastFocusedWindow: true }, ([tab]) =>
          tab?.id
            ? chrome.runtime.sendMessage({ type: 'attach', tabId: tab.id }, resolve)
            : resolve({ ok: false })
        )
      )
    );
  }

  /** Navigate to the panel HTML page. */
  async goto(extensionId: string) {
    await this.page.goto(`chrome-extension://${extensionId}/panel/panel.html`);
    // Clear session state after load so restored content doesn't leak between tests.
    // The panel may have already restored — clearEditor below resets it.
    await this.page.evaluate(() => (globalThis as unknown as Record<string, { storage?: { session?: { remove: (key: string) => void } } }>).chrome?.storage?.session?.remove('panelSessionState'));
  }

  /** Select all editor content and delete it. */
  async clearEditor() {
    await this.editor.click();
    await this.page.keyboard.press('ControlOrMeta+a');
    await this.page.keyboard.press('Backspace');
  }

  // ─── Console Submit ──────────────────────────────────────────────────────

  /** Type into command input, dismiss autocomplete, and press Enter. */
  async submitInput(text: string) {
    await this.fillInput(text);
    await this.page.keyboard.press('Escape');
    await this.page.keyboard.press('Enter');
  }

  // ─── Mocking (for panel-only tests with mocked background) ────────────────

  /** Stub record-start, record-stop, health, and attach messages. */
  async mockRecordingApis() {
    await this.page.evaluate(() => {
      const chromeObj = chrome as unknown as { runtime: Record<string, unknown> };
      const cr = chromeObj.runtime;
      const orig = (cr.sendMessage as (...args: unknown[]) => unknown).bind(chromeObj.runtime);
      cr.sendMessage = async (msg: unknown) => {
        const m = msg as { type: string };
        if (m.type === 'health') return { ok: true };
        if (m.type === 'attach') return { ok: true, url: 'https://example.com' };
        if (m.type === 'record-start') return { ok: true, url: 'https://example.com' };
        if (m.type === 'record-stop') return { ok: true };
        return orig(msg);
      };
    });
  }

  /** Fire a recorded-action message to the Toolbar's onMessage listener. */
  async fireRecordedAction(action: { pw: string; js: string }) {
    await this.page.evaluate(
      (a) => (window as unknown as Record<string, (msg: unknown) => void>).__fireRecorderMsg({ type: 'recorded-action', action: a }),
      action,
    );
  }

  /**
   * Mock recording APIs, click Record, and wait for recording state.
   * For panel tests that use mocked background (not real recorder).
   */
  async startMockRecording() {
    await this.mockRecordingApis();
    await this.recordBtn.click();
    await expect(this.recordBtn).toHaveClass(/recording/);
  }

  /** The underlying Playwright Page (for cases that need raw access). */
  get raw() { return this.page; }
}
