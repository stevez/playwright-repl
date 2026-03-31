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
  workspaceFolder?: string;
}

// ─── BrowserManager ────────────────────────────────────────────────────────

export class BrowserManager {
  private _bridge: BridgeServer | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _browserServer: any = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _browser: any = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _browserContext: any = undefined;
  private _running = false;
  private _log: vscode.OutputChannel;
  private _httpServer: Server | null = null;
  private _httpPort: number | null = null;
  private _cdpUrl: string | undefined;

  constructor(outputChannel: vscode.OutputChannel) {
    this._log = outputChannel;
  }

  isRunning() { return this._running; }
  get bridge() { return this._bridge; }
  get page() { return this._browserContext?.pages()[0]; }
  get httpPort() { return this._httpPort; }
  get wsEndpoint() { return this._browserServer?.wsEndpoint(); }
  get cdpUrl() { return this._cdpUrl; }

  async launch(opts: LaunchOptions) {
    const _extRequire = createRequire(__filename);
    // Resolve playwright from the user's project when possible, falling back to bundled
    const _require = opts.workspaceFolder
      ? createRequire(path.join(opts.workspaceFolder, 'package.json'))
      : _extRequire;

    // 1. Find Chrome extension: bundled (VSIX) first, then monorepo fallback
    const bundledExt = path.resolve(path.dirname(__filename), '..', 'chrome-extension');
    const coreMain = _extRequire.resolve('@playwright-repl/core');
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

    // 3. Launch Chrome with extension via launchServer + _userDataDir
    //    This gives us both persistent context (extensions work) AND wsEndpoint (tests can connect)
    const pwPath = _require.resolve('@playwright/test');
    const pw = _require('@playwright/test');
    const headless = opts.headless ?? false;
    this._log.appendLine(`@playwright/test: ${pwPath}`);
    this._log.appendLine(`Launching Chromium (${headless ? 'headless' : 'headed'})...`);

    // Create user data dir with DevTools prefs (dock to bottom)
    const os = await import('node:os');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-repl-'));
    const defaultDir = path.join(userDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(path.join(defaultDir, 'Preferences'), JSON.stringify({
      devtools: { preferences: { currentDockState: '"bottom"' } },
    }));

    this._browserServer = await pw.chromium.launchServer({
      channel: 'chromium',
      headless,
      _userDataDir: userDataDir,
      _sharedBrowser: true,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-infobars',
        '--remote-debugging-port=9222',
      ],
    } as any);
    this._log.appendLine(`Chromium launched. wsEndpoint: ${this._browserServer.wsEndpoint()}`);

    this._browserServer.on('close', () => {
      this._log.appendLine('Browser closed by user.');
      this._running = false;
      this._browserServer = undefined;
      this._browserContext = undefined;
      // Clean up bridge and HTTP proxy in background
      this.stop().catch(() => {});
    });

    // 4. Connect to get browser context for REPL
    // Store browser ref to prevent GC from dropping the connection
    // (launchServer kills Chrome when no clients are connected)
    this._browser = await pw.chromium.connect(this._browserServer.wsEndpoint());
    this._browserContext = this._browser.contexts()[0];

    // 5. Set bridge port via CDP on the extension's service worker
    await new Promise<void>(resolve => setTimeout(resolve, 2000));
    try {
      const http = await import('node:http');
      const targets = await new Promise<any[]>((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json', res => {
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
        }).on('error', reject);
      });
      const swTarget = targets.find((t: any) => t.type === 'service_worker' && t.url.includes('chrome-extension://'));
      if (swTarget) {
        this._log.appendLine(`Found service worker: ${swTarget.url}`);
        const WebSocket = _extRequire('ws') as any;
        const cdpWs = new WebSocket(swTarget.webSocketDebuggerUrl);
        await new Promise<void>((res, rej) => {
          cdpWs.on('open', () => {
            cdpWs.send(JSON.stringify({
              id: 1,
              method: 'Runtime.evaluate',
              params: { expression: `chrome.storage.local.set({ bridgePort: ${bridge.port} })` }
            }));
            cdpWs.on('message', () => { cdpWs.close(); res(); });
          });
          cdpWs.on('error', rej);
          setTimeout(() => { cdpWs.close(); rej(new Error('CDP timeout')); }, 5000);
        });
        this._log.appendLine(`Bridge port ${bridge.port} set via CDP.`);
      }
      // Also fetch the CDP WebSocket URL for test runner
      const versionData = await new Promise<any>((resolve, reject) => {
        http.get('http://127.0.0.1:9222/json/version', res => {
          let data = '';
          res.on('data', (chunk: string) => data += chunk);
          res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
        }).on('error', reject);
      });
      if (versionData.webSocketDebuggerUrl) {
        this._cdpUrl = versionData.webSocketDebuggerUrl;
        this._log.appendLine(`CDP URL: ${this._cdpUrl}`);
      }
    } catch (e: unknown) {
      this._log.appendLine('CDP bridge port injection failed: ' + (e as Error).message);
    }

    // 6. Wait for extension to connect
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
    if (this._browser) {
      this._browser = undefined;
    }
    if (this._browserContext) {
      this._browserContext = undefined;
    }
    if (this._browserServer) {
      await this._browserServer.close().catch(() => {});
      this._browserServer = undefined;
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
