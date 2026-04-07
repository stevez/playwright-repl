import type * as vscode from 'vscode';
import { createRequire } from 'node:module';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { handleLocalCommand } from '@playwright-repl/core';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface LaunchOptions {
  browser: string;
  headless?: boolean;
  workspaceFolder?: string;
}

// ─── BrowserManager ────────────────────────────────────────────────────────

export class BrowserManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _context: any = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _sw: any = undefined;
  private _running = false;
  private _log: vscode.OutputChannel;
  private _httpServer: Server | null = null;
  private _httpPort: number | null = null;
  private _cdpUrl: string | undefined;

  constructor(outputChannel: vscode.OutputChannel) {
    this._log = outputChannel;
  }

  isRunning() { return this._running; }
  get bridge() { return this._sw ? { connected: true, run: (cmd: string, opts?: any) => this.runCommand(cmd, opts), runScript: (s: string, l: string) => this.runScript(s, l as any) } : undefined; }
  get page() { return this._context?.pages()[0]; }
  get httpPort() { return this._httpPort; }
  get cdpUrl() { return this._cdpUrl; }

  async launch(opts: LaunchOptions) {
    const _extRequire = createRequire(__filename);
    const _require = opts.workspaceFolder
      ? createRequire(path.join(opts.workspaceFolder, 'package.json'))
      : _extRequire;

    // 1. Find Chrome extension
    const bundledExt = path.resolve(path.dirname(__filename), '..', 'chrome-extension');
    const coreMain = _extRequire.resolve('@playwright-repl/core');
    const coreDir = coreMain.replace(/[\\/]dist[\\/].*$/, '');
    const monorepoExt = path.resolve(coreDir, '../extension/dist');
    const extPath = fs.existsSync(path.join(bundledExt, 'manifest.json')) ? bundledExt : monorepoExt;
    if (!fs.existsSync(path.join(extPath, 'manifest.json')))
      throw new Error(`Chrome extension not found. Run "pnpm run build" first.`);
    this._log.appendLine(`Extension: ${extPath}`);

    // 2. Launch Chrome with extension via launchPersistentContext
    const pw = _require('@playwright/test');
    const headless = opts.headless ?? false;
    this._log.appendLine(`Launching Chromium (${headless ? 'headless' : 'headed'})...`);

    const os = await import('node:os');
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-repl-'));
    const defaultDir = path.join(userDataDir, 'Default');
    fs.mkdirSync(defaultDir, { recursive: true });
    fs.writeFileSync(path.join(defaultDir, 'Preferences'), JSON.stringify({
      devtools: { preferences: { currentDockState: '"bottom"' } },
    }));

    // Find a free port for CDP (so test runner can reuse this browser)
    const net = await import('node:net');
    const cdpPort: number = await new Promise((resolve, reject) => {
      const srv = net.createServer();
      srv.listen(0, '127.0.0.1', () => {
        const port = (srv.address() as import('node:net').AddressInfo).port;
        srv.close(() => resolve(port));
      });
      srv.on('error', reject);
    });

    this._context = await pw.chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless,
      args: [
        `--disable-extensions-except=${extPath}`,
        `--load-extension=${extPath}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
        '--disable-infobars',
        `--remote-debugging-port=${cdpPort}`,
      ],
    });
    this._log.appendLine(`Chromium launched. CDP port: ${cdpPort}`);

    // Discover CDP WebSocket URL for test runner reuse
    try {
      const http = await import('node:http');
      const versionData = await new Promise<any>((resolve, reject) => {
        http.get(`http://127.0.0.1:${cdpPort}/json/version`, res => {
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
      this._log.appendLine(`CDP URL discovery failed: ${(e as Error).message}`);
    }

    this._context.on('close', () => {
      this._log.appendLine('Browser closed by user.');
      this._running = false;
      this._context = undefined;
      this._sw = undefined;
      this.stop().catch(() => {});
    });

    // 3. Get the extension's service worker
    let sw = this._context.serviceWorkers()[0];
    if (!sw) sw = await this._context.waitForEvent('serviceworker');
    this._sw = sw;
    this._log.appendLine(`Service worker: ${sw.url()}`);

    // 4. Wait for handleBridgeCommand and set up event queue
    await sw.evaluate(async () => {
      for (let i = 0; i < 50; i++) {
        if ((self as any).handleBridgeCommand) break;
        await new Promise(r => setTimeout(r, 100));
      }
      // Set up event queue for pick/record events
      (self as any).__eventQueue = [] as any[];
      chrome.runtime.onMessage.addListener((msg: any) => {
        const eventTypes = ['recorded-action', 'recorded-fill-update'];
        if (eventTypes.includes(msg.type)) {
          (self as any).__eventQueue.push(msg);
        }
      });
    });

    // 5. Start HTTP proxy for test workers
    await this._startHttpProxy();
    this._log.appendLine(`HTTP proxy on port ${this._httpPort}`);

    this._running = true;
    this._log.appendLine('Extension ready. serviceWorker.evaluate() mode.');
  }

  async stop() {
    if (this._httpServer) {
      await new Promise<void>(r => this._httpServer!.close(() => r()));
      this._httpServer = null;
      this._httpPort = null;
    }
    this._sw = undefined;
    if (this._context) {
      await this._context.close().catch(() => {});
      this._context = undefined;
    }
    this._running = false;
  }

  async runCommand(raw: string, opts?: { includeSnapshot?: boolean }): Promise<{ text?: string; isError?: boolean; image?: string }> {
    if (!this._sw) return { text: 'Not connected', isError: true };

    // Local commands (video, etc.) — run in Node.js
    const localResult = await handleLocalCommand(raw, this._context);
    if (localResult) return localResult;

    return this._sw.evaluate(
      async (params: { command: string; includeSnapshot?: boolean }) => {
        return await (self as any).handleBridgeCommand({
          command: params.command,
          scriptType: 'command',
          includeSnapshot: params.includeSnapshot,
        });
      },
      { command: raw, includeSnapshot: opts?.includeSnapshot }
    );
  }

  async runScript(script: string, language: 'pw' | 'javascript' = 'javascript'): Promise<{ text?: string; isError?: boolean }> {
    if (!this._sw) return { text: 'Not connected', isError: true };
    return this._sw.evaluate(
      async (params: { command: string; language: string }) => {
        return await (self as any).handleBridgeCommand({
          command: params.command,
          scriptType: 'script',
          language: params.language,
        });
      },
      { command: script, language }
    );
  }

  onEvent(fn: ((event: Record<string, unknown>) => void) | null) {
    if (!this._sw) return;
    if (!fn) {
      this._stopEventPolling();
      return;
    }
    this._startEventPolling(fn);
  }

  private _eventPollTimer: ReturnType<typeof setInterval> | null = null;

  private _startEventPolling(fn: (event: Record<string, unknown>) => void) {
    this._stopEventPolling();
    // Poll for events
    this._eventPollTimer = setInterval(async () => {
      try {
        const events = await this._sw?.evaluate(() => {
          const q = (self as any).__eventQueue || [];
          (self as any).__eventQueue = [];
          return q;
        });
        if (events && Array.isArray(events)) {
          for (const event of events) fn(event);
        }
      } catch {}
    }, 100);
  }

  private _stopEventPolling() {
    if (this._eventPollTimer) {
      clearInterval(this._eventPollTimer);
      this._eventPollTimer = null;
    }
  }

  // ─── HTTP proxy for test workers ──────────────────────────────────────────

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
      res.end(JSON.stringify({ status: 'ok', bridge: !!this._sw }));
      return;
    }

    if (req.method === 'POST' && req.url === '/run-script') {
      if (!this._sw) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: 'Not connected', isError: true }));
        return;
      }
      try {
        const body = await readBody(req);
        const { script, language } = JSON.parse(body);
        const result = await this.runScript(script, language || 'javascript');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e: unknown) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: (e as Error).message, isError: true }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/run') {
      if (!this._sw) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: 'Not connected', isError: true }));
        return;
      }
      try {
        const body = await readBody(req);
        const { command } = JSON.parse(body);
        const result = await this.runCommand(command);
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
