/**
 * EvaluateConnection — execute commands in Dramaturg extension
 * via serviceWorker.evaluate(). No WebSocket bridge needed.
 *
 * Same interface as BridgeServer: run(), connected, close().
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Types from playwright (avoid importing to keep dependencies light)
/* eslint-disable @typescript-eslint/no-explicit-any */
type BrowserContext = any;
type Worker = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface EvaluateResult {
  text?: string;
  isError?: boolean;
  image?: string;
}

export class EvaluateConnection {
  private _context: BrowserContext | null = null;
  private _sw: Worker | null = null;
  private _connected = false;

  get connected(): boolean { return this._connected; }
  get port(): number { return 0; } // No port needed

  /**
   * Launch Chromium with the Dramaturg extension and connect.
   * @param extensionPath Path to the built Chrome extension (dist/)
   * @param opts.chromium Playwright's chromium object (caller must provide — avoids dependency issues)
   */
  async start(extensionPath: string, opts: { headed?: boolean; chromium?: any } = {}): Promise<void> {
    const chromium = opts.chromium;
    if (!chromium) throw new Error('opts.chromium is required — pass the chromium object from playwright');

    this._context = await chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless: opts.headed === false,  // default headed for REPL; --headless → headed:false
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });

    // Get the extension's service worker
    let sw = this._context.serviceWorkers()[0];
    if (!sw) sw = await this._context.waitForEvent('serviceworker');
    this._sw = sw;

    // Navigate to blank page so the extension can attach to a tab
    const page = this._context.pages()[0] || await this._context.newPage();
    await page.goto('about:blank');
    await new Promise(r => setTimeout(r, 500));

    this._connected = true;
  }

  /**
   * Execute a command in the extension's service worker.
   */
  async run(command: string, opts?: { includeSnapshot?: boolean }): Promise<EvaluateResult> {
    if (!this._sw) throw new Error('Not connected');
    return await this._sw.evaluate(
      async ({ command, includeSnapshot }: { command: string; includeSnapshot?: boolean }) => {
        return await (self as any).handleBridgeCommand({
          command,
          scriptType: 'command',
          includeSnapshot,
        });
      },
      { command, includeSnapshot: opts?.includeSnapshot }
    );
  }

  /**
   * Execute a script (multi-line pw or JavaScript).
   */
  async runScript(script: string, language: 'pw' | 'javascript' = 'javascript'): Promise<EvaluateResult> {
    if (!this._sw) throw new Error('Not connected');
    return await this._sw.evaluate(
      async ({ command, language }: { command: string; language: string }) => {
        return await (self as any).handleBridgeCommand({
          command,
          scriptType: 'script',
          language,
        });
      },
      { command: script, language }
    );
  }

  /**
   * Close the browser context.
   */
  async close(): Promise<void> {
    this._connected = false;
    this._sw = null;
    if (this._context) {
      await this._context.close().catch(() => {});
      this._context = null;
    }
  }

  // Stubs for BridgeServer compatibility
  onConnect(_fn: () => void) {}
  onDisconnect(_fn: () => void) {}
  onEvent(_fn: (event: Record<string, unknown>) => void) {}
  async waitForConnection(_timeoutMs?: number) {}
}
