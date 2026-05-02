import type * as vscode from 'vscode';
import { createRequire } from 'node:module';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import path from 'node:path';
import { resolveCommand, UPDATE_COMMANDS } from '@playwright-repl/core';
import { recorderInit } from './relay-recorder.js';

// __filename is available at runtime in esbuild's CJS output
declare const __filename: string;

// ─── Types ─────────────────────────────────────────────────────────────────

export type CommandResult = { text?: string; isError?: boolean; image?: string };

export interface LaunchOptions {
  browser: string;
  headless?: boolean;
  workspaceFolder?: string;
}

export interface IBrowserManager {
  isRunning(): boolean;
  get page(): any;
  get bridge(): { connected: boolean; run(cmd: string, opts?: any): Promise<CommandResult>; runScript(s: string, l: string): Promise<CommandResult> } | undefined;
  get httpPort(): number | null;
  get cdpUrl(): string | undefined;
  launch(opts: LaunchOptions): Promise<void>;
  stop(): Promise<void>;
  runCommand(raw: string, opts?: { includeSnapshot?: boolean }): Promise<CommandResult>;
  runScript(script: string, language?: 'pw' | 'javascript'): Promise<CommandResult>;
  onEvent(fn: ((event: Record<string, unknown>) => void) | null): void;
  onClose(fn: (() => void) | null): void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function isSingleExpression(code: string): boolean {
  const trimmed = code.trim();
  if (trimmed.includes('\n')) return false;
  const withoutTrailing = trimmed.replace(/;$/, '');
  if (withoutTrailing.includes(';')) return false;
  if (/^(const |let |var |if |for |while |switch |try |class |function )/.test(trimmed)) return false;
  return true;
}

function formatResult(value: unknown): CommandResult {
  if (value === undefined || value === null) return { text: 'Done', isError: false };

  if (typeof value === 'string') {
    try {
      const obj = JSON.parse(value);
      if (obj && typeof obj === 'object' && '__image' in obj) {
        return { text: '', isError: false, image: `data:${obj.mimeType};base64,${obj.__image}` };
      }
    } catch { /* not JSON */ }
    return { text: value, isError: false };
  }
  if (typeof value === 'object' && value !== null && '__image' in value) {
    const img = value as { __image: string; mimeType: string };
    return { text: '', isError: false, image: `data:${img.mimeType};base64,${img.__image}` };
  }
  if (typeof value === 'number' || typeof value === 'boolean') return { text: String(value), isError: false };
  try { return { text: JSON.stringify(value, null, 2), isError: false }; }
  catch { return { text: String(value), isError: false }; }
}

// ─── BrowserManager ────────────────────────────────────────────────────────

export class BrowserManager implements IBrowserManager {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _browserServer: any = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _browser: any = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _context: any = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _page: any = undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _expect: any = undefined;
  private _running = false;
  private _log: vscode.OutputChannel;
  private _httpServer: Server | null = null;
  private _httpPort: number | null = null;
  private _cdpUrl: string | undefined;
  private _eventCallback: ((event: Record<string, unknown>) => void) | null = null;
  private _closeCallback: (() => void) | null = null;
  private _recording = false;

  constructor(outputChannel: vscode.OutputChannel) {
    this._log = outputChannel;
  }

  isRunning() { return this._running; }
  get bridge() { return this._page ? { connected: true, run: (cmd: string, opts?: any) => this.runCommand(cmd, opts), runScript: (s: string, l: string) => this.runScript(s, l as any) } : undefined; }
  get page() { return this._page; }
  get httpPort() { return this._httpPort; }
  get cdpUrl() { return this._cdpUrl; }

  async launch(opts: LaunchOptions) {
    const _extRequire = createRequire(__filename);
    const _require = opts.workspaceFolder
      ? createRequire(path.join(opts.workspaceFolder, 'package.json'))
      : _extRequire;

    // 1. Load Playwright
    const pw = _require('@playwright/test');
    this._expect = pw.expect;
    const headless = opts.headless ?? false;
    this._log.appendLine(`Launching Chromium (${headless ? 'headless' : 'headed'}, relay mode)...`);

    // 2. Launch browser directly — CDP pipe, no server proxy hop.
    //    This gives the fastest possible connection: Node.js → CDP pipe → Chrome.
    //    (launchServer + connect adds an extra WebSocket proxy layer)
    this._browser = await pw.chromium.launch({
      headless,
      args: [
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-background-timer-throttling',
      ],
    });
    this._context = await this._browser.newContext();
    this._page = await this._context.newPage();
    this._log.appendLine(`Chromium launched (relay mode, direct CDP pipe).`);

    this._browser.on('disconnected', () => {
      this._log.appendLine('Browser disconnected.');
      this._running = false;
      this._browser = undefined;
      this._context = undefined;
      this._page = undefined;
      this.stop().catch(() => {});
    });

    this._page.on('close', () => {
      this._log.appendLine('Page closed.');
      this._page = undefined;
      // If no more pages, stop the browser
      if (this._context && this._context.pages().length === 0) {
        this._log.appendLine('Last page closed — stopping browser.');
        this.stop().catch(() => {});
      }
    });

    // 3. Set up event listeners for recording/pick (relay-style)
    this._setupPageListeners();

    // 4. Start HTTP proxy for test workers
    await this._startHttpProxy();
    this._log.appendLine(`HTTP proxy on port ${this._httpPort}`);

    this._running = true;
    this._log.appendLine('Browser ready (relay mode).');
  }

  async stop() {
    const onClose = this._closeCallback;
    this._eventCallback = null;
    this._closeCallback = null;
    if (this._httpServer) {
      await new Promise<void>(r => this._httpServer!.close(() => r()));
      this._httpServer = null;
      this._httpPort = null;
    }
    this._page = undefined;
    this._context = undefined;
    if (this._browser) {
      await this._browser.close().catch(() => {});
      this._browser = undefined;
    }
    if (this._browserServer) {
      await this._browserServer.close().catch(() => {});
      this._browserServer = undefined;
    }
    this._cdpUrl = undefined;
    this._running = false;
    if (onClose) onClose();
  }

  async runCommand(raw: string, opts?: { includeSnapshot?: boolean }): Promise<CommandResult> {
    if (!this._page) return { text: 'Not connected', isError: true };

    const trimmed = raw.trim();

    // Recording commands — handled before resolveCommand
    if (trimmed === 'record-start') return this._startRecording();
    if (trimmed === 'record-stop') return this._stopRecording();

    // Keyword command → resolveCommand → jsExpr
    const resolved = resolveCommand(trimmed);
    if (resolved) {
      const result = await this._execExpr(resolved.jsExpr);
      if (result.isError) return result;

      // Auto-append snapshot for update commands
      const cmdName = trimmed.split(/\s+/)[0].toLowerCase();
      if (opts?.includeSnapshot && UPDATE_COMMANDS.has(cmdName)) {
        const snapResolved = resolveCommand('snapshot');
        if (snapResolved) {
          const snap = await this._execExpr(snapResolved.jsExpr).catch(() => null);
          if (snap && !snap.isError && snap.text) {
            const resultText = result.text?.trim() || '';
            result.text = resultText
              ? `### Result\n${resultText}\n### Snapshot\n${snap.text}`
              : `### Snapshot\n${snap.text}`;
          }
        }
      }
      return result;
    }

    // JavaScript → AsyncFunction
    const script = isSingleExpression(trimmed)
      ? `return ${trimmed.replace(/;$/, '')}`
      : trimmed;
    return this._execExpr(script);
  }

  async runScript(script: string, language: 'pw' | 'javascript' = 'javascript'): Promise<CommandResult> {
    if (!this._page) return { text: 'Not connected', isError: true };

    if (language === 'pw') {
      const lines = script.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      const output: string[] = [];
      for (const line of lines) {
        const resolved = resolveCommand(line);
        if (!resolved) {
          output.push(`\u2717 ${line}\n  Unknown command`);
          return { text: output.join('\n'), isError: true };
        }
        const result = await this._execExpr(resolved.jsExpr);
        const mark = result.isError ? '\u2717' : '\u2713';
        output.push(`${mark} ${line}${result.text ? `\n  ${result.text}` : ''}`);
        if (result.isError) return { text: output.join('\n'), isError: true };
      }
      return { text: output.join('\n'), isError: false };
    }

    return this._execExpr(script);
  }

  onEvent(fn: ((event: Record<string, unknown>) => void) | null) {
    this._eventCallback = fn;
  }

  onClose(fn: (() => void) | null) {
    this._closeCallback = fn;
  }

  // ─── Recording ───────────────────────────────────────────────────────────

  private async _startRecording(): Promise<CommandResult> {
    if (this._recording) return { text: 'Already recording', isError: true };
    if (!this._page) return { text: 'Not connected', isError: true };

    try {
      // Expose callback for recorder script to send events to Node.js
      await this._page.exposeFunction('__pwRecordAction', (data: string) => {
        try {
          const msg = JSON.parse(data);
          if (this._eventCallback) this._eventCallback(msg);
        } catch {}
      }).catch(() => {
        // Already exposed from previous recording session — that's fine
      });

      // Inject recorder script via fn.toString()
      await this._page.evaluate(`(${recorderInit.toString()})()`);

      this._recording = true;
      const url = this._page.url();
      return { text: `Recording started${url ? ': ' + url : ''}`, isError: false };
    } catch (e: unknown) {
      return { text: e instanceof Error ? e.message : String(e), isError: true };
    }
  }

  private async _stopRecording(): Promise<CommandResult> {
    if (!this._recording) return { text: 'Not recording', isError: false };

    try {
      // Call cleanup function injected by recorder script
      await this._page.evaluate('if (window.__pwRecordCleanup) window.__pwRecordCleanup()');
    } catch {}

    this._recording = false;
    return { text: 'Recording stopped', isError: false };
  }

  // ─── Internal execution ──────────────────────────────────────────────────

  private async _execExpr(jsExpr: string): Promise<CommandResult> {
    try {
      const fn = new AsyncFunction('page', 'context', 'expect', jsExpr);
      const result = await fn(this._page, this._context, this._expect);
      return formatResult(result);
    } catch (e: unknown) {
      return { text: e instanceof Error ? e.message : String(e), isError: true };
    }
  }

  // ─── Page event listeners (replace SW polling) ───────────────────────────

  private _setupPageListeners() {
    if (!this._page) return;

    // Set up relay state for console/network/dialog commands
    this._page.__relay = { console: [], network: [], dialogMode: null, routes: [] };
    this._page.on('console', (msg: any) => {
      this._page.__relay.console.push('[' + msg.type() + '] ' + msg.text());
    });
    this._page.on('response', (resp: any) => {
      const url = resp.url();
      if (url.startsWith('chrome-extension://')) return;
      const req = resp.request();
      this._page.__relay.network.push({ status: resp.status(), method: req.method(), url, type: req.resourceType() });
    });
    this._page.on('dialog', async (dialog: any) => {
      if (this._page.__relay.dialogMode === 'accept') await dialog.accept();
      else if (this._page.__relay.dialogMode === 'dismiss') await dialog.dismiss();
    });
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
      res.end(JSON.stringify({ status: 'ok', bridge: !!this._page }));
      return;
    }

    if (req.method === 'POST' && req.url === '/run-script') {
      if (!this._page) {
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
      if (!this._page) {
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
