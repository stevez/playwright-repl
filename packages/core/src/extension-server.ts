/**
 * CommandServer — HTTP server for the side panel extension.
 *
 * Endpoints:
 *   POST /run     Panel commands → engine.run()
 *   GET  /health  Panel checks if server is running
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { parseInput } from './parser.js';
import { replVersion } from './resolve.js';
import {
  buildRunCode, verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
} from './page-scripts.js';
import type { ParsedArgs, EngineResult } from './engine.js';

// ─── Types ──────────────────────────────────────────────────────────────────

interface EngineInterface {
  run: (args: ParsedArgs) => Promise<EngineResult>;
  selectPageByUrl: (url: string) => Promise<void>;
  connected: boolean;
}

// ─── CommandServer ──────────────────────────────────────────────────────────

export class CommandServer {
  private _engine: EngineInterface;
  private _server: Server | null = null;
  private _port: number | null = null;

  constructor(engine: EngineInterface) {
    this._engine = engine;
  }

  get port(): number | null { return this._port; }

  async start(port = 6781): Promise<void> {
    this._server = createServer((req, res) => this._handleHttp(req, res));

    return new Promise<void>((resolve, reject) => {
      this._server!.listen(port, () => {
        this._port = (this._server!.address() as { port: number }).port;
        resolve();
      });
      this._server!.on('error', reject);
    });
  }

  async close(): Promise<void> {
    if (this._server) {
      await new Promise<void>((resolve) => this._server!.close(() => resolve()));
      this._server = null;
    }
  }

  // ─── HTTP handler ───────────────────────────────────────────────────────

  private async _handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // CORS — allow chrome-extension:// origins
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, GET');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const urlPath = (req.url || '').replace(/\/+$/, '');

    // Health check endpoint
    if (req.method === 'GET' && urlPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', version: replVersion }));
      return;
    }

    // Panel command endpoint
    if (req.method === 'POST' && urlPath === '/run') {
      try {
        const body = await readBody(req);
        const { raw, activeTabUrl } = JSON.parse(body);
        console.log(`[server] ${raw} | ${activeTabUrl || 'no-url'}`);

        // Auto-select the tab matching the panel's active tab.
        if (activeTabUrl) {
          await withTimeout(this._engine.selectPageByUrl(activeTabUrl), 5000).catch(() => {});
        }

        let args = parseInput(raw);
        if (!args) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: `Unknown command: ${raw}`, isError: true }));
          return;
        }
        args = resolveArgs(args);
        const result = await withTimeout(this._engine.run(args), 15000);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ text: message, isError: true }));
      }
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }
}

// ─── REPL-level argument transformations ────────────────────────────────────

type PageScriptFn = (...args: unknown[]) => Promise<void>;

/**
 * Apply the same transformations the CLI REPL does before engine.run():
 *   - Verify commands → run-code with page scripts
 *   - Text locators → run-code with actionByText/fillByText/etc.
 *   - Auto-wrap run-code body with async (page) => { ... }
 */
function resolveArgs(args: ParsedArgs): ParsedArgs {
  const cmdName = args._[0];

  // ── Unified verify command → run-code translation ──────────
  if (cmdName === 'verify') {
    const subType = args._[1];
    const rest = args._.slice(2);
    let translated: ParsedArgs | null = null;
    if (subType === 'title' && rest.length > 0)
      translated = buildRunCode(verifyTitle as PageScriptFn, rest.join(' '));
    else if (subType === 'url' && rest.length > 0)
      translated = buildRunCode(verifyUrl as PageScriptFn, rest.join(' '));
    else if (subType === 'text' && rest.length > 0)
      translated = buildRunCode(verifyText as PageScriptFn, rest.join(' '));
    else if (subType === 'no-text' && rest.length > 0)
      translated = buildRunCode(verifyNoText as PageScriptFn, rest.join(' '));
    else if (subType === 'element' && rest.length >= 2)
      translated = buildRunCode(verifyElement as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'no-element' && rest.length >= 2)
      translated = buildRunCode(verifyNoElement as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'value' && rest.length >= 2)
      translated = buildRunCode(verifyValue as PageScriptFn, rest[0], rest.slice(1).join(' '));
    else if (subType === 'list' && rest.length >= 2)
      translated = buildRunCode(verifyList as PageScriptFn, rest[0], rest.slice(1));
    if (translated) args = translated;
  }

  // ── Legacy verify-* commands (backward compat) ─────────────
  const verifyFns: Record<string, PageScriptFn> = {
    'verify-text': verifyText as PageScriptFn,
    'verify-element': verifyElement as PageScriptFn,
    'verify-value': verifyValue as PageScriptFn,
    'verify-list': verifyList as PageScriptFn,
    'verify-title': verifyTitle as PageScriptFn,
    'verify-url': verifyUrl as PageScriptFn,
    'verify-no-text': verifyNoText as PageScriptFn,
    'verify-no-element': verifyNoElement as PageScriptFn,
  };
  if (verifyFns[cmdName]) {
    const pos = args._.slice(1);
    const fn = verifyFns[cmdName];
    let translated: ParsedArgs | null = null;
    if (cmdName === 'verify-text' || cmdName === 'verify-no-text' || cmdName === 'verify-title' || cmdName === 'verify-url') {
      const text = pos.join(' ');
      if (text) translated = buildRunCode(fn, text);
    } else if (cmdName === 'verify-no-element' || cmdName === 'verify-element') {
      if (pos[0] && pos.length >= 2) translated = buildRunCode(fn, pos[0], pos.slice(1).join(' '));
    } else if (pos[0] && pos.length >= 2) {
      const rest = cmdName === 'verify-list' ? pos.slice(1) : pos.slice(1).join(' ');
      translated = buildRunCode(fn, pos[0], rest);
    }
    if (translated) args = translated;
  }

  // ── Auto-resolve text to native Playwright locator ─────────
  const textFns: Record<string, PageScriptFn> = {
    click: actionByText as PageScriptFn, dblclick: actionByText as PageScriptFn, hover: actionByText as PageScriptFn,
    fill: fillByText as PageScriptFn, select: selectByText as PageScriptFn, check: checkByText as PageScriptFn, uncheck: uncheckByText as PageScriptFn,
  };
  if (textFns[cmdName] && args._[1] && !/^e\d+$/.test(args._[1])) {
    const textArg = args._[1];
    const extraArgs = args._.slice(2);
    const fn = textFns[cmdName];
    const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
    if (fn === actionByText) args = buildRunCode(fn, textArg, cmdName, nth);
    else if (cmdName === 'fill' || cmdName === 'select') args = buildRunCode(fn, textArg, extraArgs[0] || '', nth);
    else args = buildRunCode(fn, textArg, nth);
  }

  // ── go-back / go-forward → evaluate history.back/forward ──
  if (cmdName === 'go-back') {
    args = { _: ['run-code', 'async (page) => { await page.evaluate(() => history.back()); return "Navigated back"; }'] };
  }
  if (cmdName === 'go-forward') {
    args = { _: ['run-code', 'async (page) => { await page.evaluate(() => history.forward()); return "Navigated forward"; }'] };
  }

  // ── Auto-wrap run-code body with async (page) => { ... } ──
  if (cmdName === 'run-code' && args._[1] && !args._[1].startsWith('async')) {
    const STMT = /^(await|return|const|let|var|for|if|while|throw|try)\b/;
    const body = !args._[1].includes(';') && !STMT.test(args._[1])
      ? `return await ${args._[1]}`
      : args._[1];
    args = { _: ['run-code', `async (page) => { ${body} }`] };
  }

  return args;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => data += chunk);
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Command timed out after ${ms / 1000}s`)), ms);
    }),
  ]).finally(() => clearTimeout(timer!));
}
