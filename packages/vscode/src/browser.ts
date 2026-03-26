import type * as vscode from 'vscode';
import { BridgeServer } from '@playwright-repl/core';
import { createRequire } from 'node:module';
import path from 'node:path';
import fs from 'node:fs';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LaunchOptions {
  browser: string;
  bridgePort?: number;
  headless?: boolean;
}

// ─── BrowserManager ────────────────────────────────────────────────────────

export class BrowserManager {
  private _bridge: BridgeServer | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _browserContext: any = undefined;
  private _running = false;
  private _log: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this._log = outputChannel;
  }

  isRunning() { return this._running; }
  get bridge() { return this._bridge; }
  get page() { return this._browserContext?.pages()[0]; }

  async launch(opts: LaunchOptions) {
    const _require = createRequire(__filename);

    // 1. Find the extension dist path (sibling package in monorepo)
    const coreMain = _require.resolve('@playwright-repl/core');
    const coreDir = coreMain.replace(/[\\/]dist[\\/].*$/, '');
    const extPath = path.resolve(coreDir, '../extension/dist');
    if (!fs.existsSync(path.join(extPath, 'manifest.json')))
      throw new Error(`Extension not built. Run "pnpm run build" first. Expected: ${extPath}`);
    this._log.appendLine(`Extension: ${extPath}`);

    // 2. Start BridgeServer (WebSocket)
    const bridge = new BridgeServer();
    await bridge.start(opts.bridgePort || 0);
    this._bridge = bridge;
    this._log.appendLine(`BridgeServer on port ${bridge.port}`);

    // 3. Launch Chromium with extension via Playwright
    const pw = _require('playwright-core');
    const headless = opts.headless ?? false;
    this._log.appendLine(`Launching Chromium (${headless ? 'headless' : 'headed'})...`);

    // Clean env: strip Electron/VS Code vars that interfere with Chromium
    const cleanEnv = Object.fromEntries(
      Object.entries(process.env).filter(([k]) =>
        !k.startsWith('ELECTRON_') && !k.startsWith('VSCODE_') && k !== 'ORIGINAL_XDG_CURRENT_DESKTOP'
      ),
    );

    this._browserContext = await pw.chromium.launchPersistentContext('', {
      channel: 'chromium',
      headless,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-infobars',
        '--remote-debugging-port=9222',
      ],
      env: cleanEnv,
    });
    this._log.appendLine('Chromium launched.');

    // 4. Set bridge port via service worker so extension knows where to connect
    let sw = this._browserContext.serviceWorkers()[0];
    if (!sw) sw = await this._browserContext.waitForEvent('serviceworker', { timeout: 10000 });
    await sw.evaluate((port: number) => {
      chrome.storage.local.set({ bridgePort: port });
    }, bridge.port);
    this._log.appendLine(`Bridge port ${bridge.port} set via service worker.`);

    // 5. Navigate initial page so extension can attach
    const page = this._browserContext.pages()[0];
    if (page) await page.goto('https://www.google.com');

    // 6. Wait for offscreen document to connect via WebSocket
    this._log.appendLine('Waiting for extension to connect...');
    await bridge.waitForConnection(30000);
    this._running = true;
    this._log.appendLine('Extension connected. Bridge ready.');
  }

  async stop() {
    if (this._bridge) {
      await this._bridge.close().catch(() => {});
      this._bridge = undefined;
    }
    if (this._browserContext) {
      await this._browserContext.close().catch(() => {});
      this._browserContext = undefined;
    }
    this._running = false;
  }

  async runCommand(raw: string): Promise<{ text?: string; isError?: boolean }> {
    if (!this._bridge) {
      return { text: 'Bridge not started', isError: true };
    }
    return this._bridge.run(raw);
  }

  async runScript(script: string, language: 'pw' | 'javascript' = 'javascript'): Promise<{ text?: string; isError?: boolean }> {
    if (!this._bridge) {
      return { text: 'Bridge not started', isError: true };
    }
    return this._bridge.runScript(script, language);
  }

  onEvent(fn: ((event: Record<string, unknown>) => void) | null) {
    if (this._bridge) {
      this._bridge.onEvent(fn || (() => {}));
    }
  }
}
