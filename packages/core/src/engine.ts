/**
 * Engine — in-process Playwright backend.
 *
 * Wraps BrowserServerBackend directly, eliminating the daemon process.
 * Provides the same interface as DaemonConnection: run(args), connected, close().
 *
 * Three connection modes:
 *   - launch:    new browser via Playwright (default)
 *   - connect:   existing Chrome via CDP port (--connect [port])
 *   - extension: DevTools extension CDP relay (--extension)
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import { replVersion } from './resolve.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EngineOpts {
  headed?: boolean;
  browser?: string;
  connect?: number | boolean;
  extension?: boolean;
  spawn?: boolean;
  port?: number;
  cdpPort?: number;
  persistent?: boolean;
  profile?: string;
  cwd?: string;
  [key: string]: unknown;
}

export interface EngineResult {
  text?: string;
  image?: string;
  isError?: boolean;
}

export interface ParsedArgs {
  _: string[];
  cwd?: string;
  nth?: string | number;
  [key: string]: unknown;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
interface PlaywrightDeps {
  BrowserServerBackend: new (config: any, factory: any, opts: any) => any;
  contextFactory: (config: any) => { createContext: (info: any, signal: AbortSignal, opts: any) => Promise<{ browserContext: any; close: () => Promise<void> }> };
  playwright: any;
  registry: { findExecutable: (name: string) => { executablePath: () => string | undefined } | undefined };
  resolveConfig: (config: any) => Promise<any> | any;
  commands: Record<string, any>;
  parseCommand: (command: any, args: any) => { toolName: string; toolParams: Record<string, any> };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ─── Lazy-loaded Playwright dependencies ────────────────────────────────────

let _deps: PlaywrightDeps | undefined;

function loadDeps(): PlaywrightDeps {
  if (_deps) return _deps;
  const require = createRequire(import.meta.url);
  // Resolve absolute paths to bypass Playwright's exports map.
  const pwDir = path.dirname(require.resolve('playwright/package.json'));
  const pwReq = (sub: string) => require(path.join(pwDir, sub));
  const pwCoreDir = path.dirname(require.resolve('playwright-core/package.json'));
  const pwCoreReq = (sub: string) => require(path.join(pwCoreDir, sub));
  _deps = {
    BrowserServerBackend:     pwReq('lib/mcp/browser/browserServerBackend.js').BrowserServerBackend,
    contextFactory:           pwReq('lib/mcp/browser/browserContextFactory.js').contextFactory,
    playwright:               require('playwright-core'),
    registry:                 pwCoreReq('lib/server/registry/index.js').registry,
    resolveConfig:            pwReq('lib/mcp/browser/config.js').resolveConfig,
    commands:                 pwReq('lib/cli/daemon/commands.js').commands,
    parseCommand:             pwReq('lib/cli/daemon/command.js').parseCommand,
  };
  return _deps;
}

// ─── Engine ─────────────────────────────────────────────────────────────────

export class Engine {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  private _deps: PlaywrightDeps | undefined;
  private _backend: any = null;
  private _browserContext: any = null;
  private _close: (() => Promise<void>) | null = null;
  private _connected = false;
  private _commandServer: { close: () => Promise<void> } | null = null;
  private _chromeProc: { kill: () => void; unref: () => void } | null = null;
  private _isReconnecting = false;
  private _reconnectInfo: { opts: EngineOpts; config: any; clientInfo: any } | null = null;
  /* eslint-enable @typescript-eslint/no-explicit-any */

  constructor(deps?: PlaywrightDeps) {
    this._deps = deps;
  }

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Start the engine with given options.
   */
  async start(opts: EngineOpts = {}): Promise<void> {
    const deps = this._deps || loadDeps();
    const config = await this._buildConfig(opts, deps);

    const cwd = url.pathToFileURL(process.cwd()).href;
    const clientInfo = {
      name: 'playwright-repl',
      version: replVersion,
      roots: [{ uri: cwd, name: 'cwd' }],
      timestamp: Date.now(),
    };

    // Choose context factory based on mode.
    if (opts.extension) {
      const serverPort = opts.port || 6781;
      const cdpPort = opts.cdpPort || 9222;

      // 1. Start CommandServer for panel HTTP commands.
      const { CommandServer } = await import('./extension-server.js');
      const cmdServer = new CommandServer(this);
      await cmdServer.start(serverPort);
      this._commandServer = cmdServer;
      console.log(`CommandServer listening on http://localhost:${serverPort}`);

      // 2. Spawn Chrome (only with --spawn).
      if (opts.spawn) {
        const extPath = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '../../extension/dist');
        const execInfo = deps.registry.findExecutable(opts.browser || 'chrome');
        const execPath = execInfo?.executablePath();
        if (!execPath)
          throw new Error('Chrome executable not found. Make sure Chrome is installed.');

        // Chrome 136+ requires --user-data-dir for CDP. Use a dedicated profile dir.
        const os = await import('node:os');
        const fs = await import('node:fs');
        const userDataDir = opts.profile || path.join(os.default.homedir(), '.playwright-repl', 'chrome-profile');
        fs.default.mkdirSync(userDataDir, { recursive: true });

        const chromeArgs = [
          `--remote-debugging-port=${cdpPort}`,
          `--user-data-dir=${userDataDir}`,
          `--load-extension=${extPath}`,
          '--no-first-run',
          '--no-default-browser-check',
        ];

        const { spawn } = await import('node:child_process');
        const chromeProc = spawn(execPath, chromeArgs, {
          detached: true, stdio: 'ignore',
        });
        chromeProc.unref();
        this._chromeProc = chromeProc;
        console.log(`Chrome profile: ${userDataDir}`);
      } else {
        console.log('Connecting to existing Chrome on port ' + cdpPort + ' (use --spawn to launch Chrome automatically)');
      }

      // 3. Wait for Chrome CDP to be ready (no timeout — waits until available).
      console.log('Waiting for Chrome CDP...');
      const cdpUrl = `http://localhost:${cdpPort}`;
      while (true) {
        try {
          const res = await fetch(`${cdpUrl}/json/version`);
          if (res.ok) break;
        } catch { /* retry */ }
        await new Promise(r => setTimeout(r, 500));
      }
      console.log('Chrome CDP ready. Connecting Playwright...');

      // 4. Connect Playwright via CDP.
      (config as any).browser.cdpEndpoint = cdpUrl;
      this._reconnectInfo = { opts, config, clientInfo };
      await this._connectToCdp(deps, config, clientInfo);

      console.log('Ready! Side panel can send commands.');
    } else {
      // Launch/connect mode: eagerly create context for immediate feedback.
      const factory = deps.contextFactory(config);
      const { browserContext, close } = await factory.createContext(
        clientInfo, new AbortController().signal, {},
      );
      this._browserContext = browserContext;
      this._close = close;

      const existingContextFactory = {
        createContext: () => Promise.resolve({ browserContext, close }),
      };
      this._backend = new deps.BrowserServerBackend(config, existingContextFactory, { allTools: true });
      await this._backend.initialize?.(clientInfo);
      this._connected = true;

      browserContext.on('close', () => {
        this._connected = false;
      });
    }
  }

  /**
   * Run a command given minimist-parsed args.
   * Returns { text, isError } matching DaemonConnection.run() shape.
   */
  async run(args: ParsedArgs): Promise<EngineResult> {
    if (!this._backend)
      throw new Error('Engine not started');

    // ── highlight → run-code translation ──
    if (args._[0] === 'highlight') {
      if (args.clear) {
        args = { _: ['run-code', `async (page) => { await page.locator('#__pw_clear__').highlight().catch(() => {}); return "Cleared"; }`] };
      } else {
        const parts = args._.slice(1);
        if (!parts.length) return { text: 'Usage: highlight <locator>', isError: true };
        const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
        let locExpr: string;
        // highlight <role> "<name>" → getByRole(role, { name })
        if (parts.length >= 2 && /^[a-z]+$/.test(parts[0])) {
          const role = parts[0];
          const name = parts.slice(1).join(' ');
          locExpr = `page.getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(name)}, exact: true })`;
        } else {
          const loc = parts.join(' ');
          const isSelector = /[.#\[\]>:=]/.test(loc);
          locExpr = isSelector
            ? `page.locator(${JSON.stringify(loc)})`
            : `page.getByText(${JSON.stringify(loc)})`;
        }
        if (nth !== undefined) locExpr += `.nth(${nth})`;
        args = { _: ['run-code', `async (page) => { await ${locExpr}.highlight(); return "Highlighted"; }`] };
      }
    }

    // ── >> chaining → run-code translation ──
    const LOCATOR_ACTIONS: Record<string, string> = {
      click: 'click', dblclick: 'dblclick', hover: 'hover',
      check: 'check', uncheck: 'uncheck',
      fill: 'fill', select: 'selectOption',
    };
    if (LOCATOR_ACTIONS[args._[0]] && args._.some(a => a.includes('>>'))) {
      const action = LOCATOR_ACTIONS[args._[0]];
      const positional = args._.slice(1);

      // Find last >> — everything up to the token after it is the selector,
      // everything after that is the action argument (e.g., value for fill).
      let lastChainIdx = -1;
      for (let i = 0; i < positional.length; i++) {
        if (positional[i] === '>>' || positional[i].includes('>>')) lastChainIdx = i;
      }
      const selectorEnd = positional[lastChainIdx] !== '>>' && positional[lastChainIdx]?.includes('>>')
        ? lastChainIdx     // >> inside quoted token like ".nav >> button"
        : lastChainIdx + 1;
      const selector = positional.slice(0, selectorEnd + 1).join(' ');
      const rest = positional.slice(selectorEnd + 1).join(' ');

      const locExpr = `page.locator(${JSON.stringify(selector)})`;
      const actionCall = rest
        ? `${locExpr}.${action}(${JSON.stringify(rest)})`
        : `${locExpr}.${action}()`;
      args = { _: ['run-code', `async (page) => { await ${actionCall}; return "Done"; }`] };
    }

    const deps = this._deps || loadDeps();
    const command = deps.commands[args._[0]];
    if (!command)
      throw new Error(`Unknown command: ${args._[0]}`);

    const { toolName, toolParams } = deps.parseCommand(command, args);

    // Commands like "close", "list", "kill-all" have empty toolName.
    if (!toolName)
      return { text: `Command "${args._[0]}" is not supported in engine mode.`, isError: true };

    toolParams._meta = { cwd: args.cwd || process.cwd() };

    const response = await this._backend.callTool(toolName, toolParams);
    return formatResult(response);
  }

  /**
   * Select the Playwright page matching the given URL.
   * Uses backend.callTool('browser_tabs') to properly update the tab tracker.
   */
  async selectPageByUrl(targetUrl: string): Promise<void> {
    if (!this._browserContext || !this._backend || !targetUrl) return;
    const pages = this._browserContext.pages();
    const normalize = (u: string) => {
      try {
        const p = new URL(u);
        return (p.origin + p.pathname).replace(/\/+$/, '');
      } catch { return u.replace(/\/+$/, ''); }
    };
    const target = normalize(targetUrl);
    for (let i = 0; i < pages.length; i++) {
      if (normalize(pages[i].url()) === target) {
        try {
          await this._backend.callTool('browser_tabs', { action: 'select', index: i });
        } catch { /* ignore */ }
        return;
      }
    }
  }

  /**
   * Shut down the browser and backend.
   */
  async close(): Promise<void> {
    this._connected = false;
    if (this._commandServer) {
      await this._commandServer.close();
      this._commandServer = null;
    }
    if (this._backend) {
      this._backend.serverClosed();
      this._backend = null;
    }
    if (this._close) {
      await this._close();
      this._close = null;
    }
    if (this._chromeProc) {
      try { this._chromeProc.kill(); } catch { /* ignore */ }
      this._chromeProc = null;
    }
  }

  // ─── CDP connect / reconnect ─────────────────────────────────────────────

  /* eslint-disable @typescript-eslint/no-explicit-any */
  private async _connectToCdp(deps: PlaywrightDeps, config: any, clientInfo: any): Promise<void> {
    const factory = deps.contextFactory(config);
    const { browserContext, close } = await factory.createContext(
      clientInfo, new AbortController().signal, {},
    );
    this._browserContext = browserContext;
    this._close = close;

    const existingContextFactory = {
      createContext: () => Promise.resolve({ browserContext, close }),
    };
    this._backend = new deps.BrowserServerBackend(config, existingContextFactory, { allTools: true });
    await this._backend.initialize?.(clientInfo);
    this._connected = true;

    // Auto-select the first visible web page.
    const pages = browserContext.pages();
    const INTERNAL = /^(chrome|devtools|chrome-extension|about):/;
    let selectedIdx = -1;
    for (let i = 0; i < pages.length; i++) {
      const pageUrl = pages[i].url();
      if (!pageUrl || INTERNAL.test(pageUrl)) continue;
      try {
        const state = await pages[i].evaluate(() => document.visibilityState);
        if (state === 'visible' && selectedIdx === -1) {
          selectedIdx = i;
        }
      } catch { /* skip */ }
    }
    if (selectedIdx > 0) {
      await this._backend.callTool('browser_tabs', { action: 'select', index: selectedIdx });
    }

    browserContext.on('close', () => {
      this._connected = false;
      if (this._reconnectInfo) this._scheduleReconnect();
    });
  }

  private _scheduleReconnect(): void {
    if (this._isReconnecting) return;
    this._isReconnecting = true;
    this._doReconnect().catch(() => {});
  }

  private async _doReconnect(): Promise<void> {
    if (!this._reconnectInfo) return;
    const { opts, config, clientInfo } = this._reconnectInfo;
    const deps = this._deps || loadDeps();
    const cdpPort = (opts.cdpPort as number | undefined) || 9222;
    const cdpUrl = `http://localhost:${cdpPort}`;

    console.log('Browser context closed. Waiting for Chrome to reconnect...');

    while (!this._connected) {
      await new Promise(r => setTimeout(r, 1500));

      try {
        const res = await fetch(`${cdpUrl}/json/version`);
        if (!res.ok) continue;
      } catch { continue; }

      // CDP is responding — reconnect
      try {
        // Clean up old backend before reconnecting
        if (this._backend) { try { this._backend.serverClosed(); } catch { /* ignore */ } }
        if (this._close) { try { await this._close(); } catch { /* ignore */ } }
        this._backend = null;
        this._browserContext = null;
        this._close = null;

        (config as any).browser.cdpEndpoint = cdpUrl;
        await this._connectToCdp(deps, config, clientInfo);
        console.log('Reconnected to Chrome CDP.');
      } catch { /* retry next iteration */ }
    }

    this._isReconnecting = false;
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  // ─── Config builder ───────────────────────────────────────────────────────

  private async _buildConfig(opts: EngineOpts, deps: PlaywrightDeps) {
    const config = {
      browser: {
        browserName: 'chromium',
        launchOptions: {
          channel: 'chrome' as string | undefined,
          headless: !opts.headed,
        },
        contextOptions: {
          viewport: null as null,
        },
        isolated: false,
        userDataDir: undefined as string | undefined,
        cdpEndpoint: undefined as string | undefined,
      },
      server: {},
      network: {},
      timeouts: {
        action: 5000,
        navigation: 15000,
      },
    };

    // Browser selection
    if (opts.browser) {
      switch (opts.browser) {
        case 'firefox':
          config.browser.browserName = 'firefox';
          config.browser.launchOptions.channel = undefined;
          break;
        case 'webkit':
          config.browser.browserName = 'webkit';
          config.browser.launchOptions.channel = undefined;
          break;
        default:
          // chrome, msedge, chrome-beta, etc.
          config.browser.browserName = 'chromium';
          config.browser.launchOptions.channel = opts.browser;
          break;
      }
    }

    // Persistent profile
    if (opts.persistent || opts.profile) {
      config.browser.userDataDir = opts.profile || undefined;
    } else if (!opts.extension) {
      config.browser.isolated = true;
    }

    // CDP connect mode
    if (opts.connect) {
      const port = typeof opts.connect === 'number' ? opts.connect : 9222;
      config.browser.cdpEndpoint = `http://localhost:${port}`;
      config.browser.isolated = false;
    }

    return await deps.resolveConfig(config);
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface ToolResult {
  content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
  isError?: boolean;
}

function formatResult(result: ToolResult): EngineResult {
  const isError = result.isError;
  let text: string | undefined;
  let image: string | undefined;
  for (const item of result.content) {
    if (item.type === 'text' && !text) text = item.text;
    if (item.type === 'image' && !image) image = `data:${item.mimeType || 'image/png'};base64,${item.data}`;
  }
  return { isError, text, image };
}
