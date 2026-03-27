import type * as vscode from 'vscode';
import { BridgeServer } from '@playwright-repl/core';
import { createRequire } from 'node:module';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
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
  private _httpServer: Server | null = null;
  private _httpPort: number | null = null;

  constructor(outputChannel: vscode.OutputChannel) {
    this._log = outputChannel;
  }

  isRunning() { return this._running; }
  get bridge() { return this._bridge; }
  get page() { return this._browserContext?.pages()[0]; }
  get httpPort() { return this._httpPort; }

  async launch(opts: LaunchOptions) {
    const _require = createRequire(__filename);

    // 1. Find Chrome extension: bundled (VSIX) first, then monorepo fallback
    const bundledExt = path.resolve(path.dirname(__filename), '..', 'chrome-extension');
    const coreMain = _require.resolve('@playwright-repl/core');
    const coreDir = coreMain.replace(/[\\/]dist[\\/].*$/, '');
    const monorepoExt = path.resolve(coreDir, '../extension/dist');
    const extPath = fs.existsSync(path.join(bundledExt, 'manifest.json')) ? bundledExt : monorepoExt;
    if (!fs.existsSync(path.join(extPath, 'manifest.json')))
      throw new Error(`Chrome extension not found. Run "pnpm run build" first.`);
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

    // 7. Start HTTP proxy so test workers can call bridge from separate processes
    await this._startHttpProxy();
    this._log.appendLine(`HTTP proxy on port ${this._httpPort}`);

    this._running = true;
    this._log.appendLine('Extension connected. Bridge ready.');
  }

  async stop() {
    if (this._httpServer) {
      await new Promise<void>(r => this._httpServer!.close(() => r()));
      this._httpServer = null;
      this._httpPort = null;
    }
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

  // ─── HTTP proxy for test workers (bridge mode) ────────────────────────────

  private async _startHttpProxy(): Promise<void> {
    this._httpServer = createServer((req, res) => this._handleProxy(req, res));
    await new Promise<void>((resolve, reject) => {
      this._httpServer!.listen(0, () => {
        this._httpPort = (this._httpServer!.address() as { port: number }).port;
        resolve();
      });
      this._httpServer!.on('error', reject);
    });
  }

  private async _handleProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');

    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', bridge: !!this._bridge?.connected }));
      return;
    }

    if (req.method === 'POST' && req.url === '/run-script') {
      if (!this._bridge) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: 'Bridge not started', isError: true }));
        return;
      }
      try {
        const body = await readBody(req);
        const { script, language } = JSON.parse(body);
        const result = await this._bridge.runScript(script, language || 'javascript');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e: unknown) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: (e as Error).message, isError: true }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/run') {
      if (!this._bridge) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: 'Bridge not started', isError: true }));
        return;
      }
      try {
        const body = await readBody(req);
        const { command } = JSON.parse(body);
        const result = await this._bridge.run(command);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e: unknown) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: (e as Error).message, isError: true }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}
