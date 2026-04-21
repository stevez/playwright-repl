/**
 * Engine — in-process Playwright backend.
 *
 * Wraps BrowserBackend directly, eliminating the daemon process.
 * Provides the same interface as DaemonConnection: run(args), connected, close().
 *
 * Three connection modes:
 *   - launch:    new browser via Playwright (default)
 *   - connect:   existing Chrome via CDP port (--connect [port])
 *   - extension: DevTools extension via serviceWorker.evaluate (--extension)
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import url from 'node:url';
import { replVersion } from '@playwright-repl/core';
import type { EngineOpts, EngineResult, ParsedArgs } from '@playwright-repl/core';

export type { EngineOpts, EngineResult, ParsedArgs };

/* eslint-disable @typescript-eslint/no-explicit-any */
interface PlaywrightDeps {
  BrowserBackend: new (config: any, browserContext: any, tools: any[]) => any;
  createBrowser: (config: any, clientInfo: any) => Promise<any>;
  browserTools: any[];
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
  const pwCoreDir = path.dirname(require.resolve('playwright-core/package.json'));
  const pwCoreReq = (sub: string) => require(path.join(pwCoreDir, sub));
  _deps = {
    BrowserBackend:           pwCoreReq('lib/tools/backend/browserBackend.js').BrowserBackend,
    createBrowser:            pwCoreReq('lib/tools/mcp/browserFactory.js').createBrowser,
    browserTools:             pwCoreReq('lib/tools/backend/tools.js').browserTools,
    playwright:               require('playwright-core'),
    registry:                 pwCoreReq('lib/server/registry/index.js').registry,
    resolveConfig:            pwCoreReq('lib/tools/mcp/config.js').resolveConfig,
    commands:                 pwCoreReq('lib/tools/cli-daemon/commands.js').commands,
    parseCommand:             pwCoreReq('lib/tools/cli-daemon/command.js').parseCommand,
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

    const cwd = process.cwd();
    const clientInfo = {
      name: 'playwright-repl',
      version: replVersion,
      cwd,
      roots: [{ uri: url.pathToFileURL(cwd).href, name: 'cwd' }],
      timestamp: Date.now(),
    };

    // Launch/connect mode.
    {
      // Launch/connect mode: eagerly create context for immediate feedback.
      const browser = await Promise.race([
        deps.createBrowser(config, clientInfo),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Browser launch timed out after 30s')), 30000)),
      ]);
      const browserContext = browser.contexts()[0] || await browser.newContext();
      this._browserContext = browserContext;
      this._close = () => browser.close();

      this._backend = new deps.BrowserBackend(config, browserContext, deps.browserTools);
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

    // ── locator → run-code translation ──
    if (args._[0] === 'locator') {
      const ref = args._[1];
      if (!ref) return { text: 'Usage: locator <ref>', isError: true };
      args = { _: ['run-code', `async (page) => { return (await page.locator('aria-ref=${ref}').normalize()).toString(); }`] };
    }

    // ── highlight → run-code translation ──
    if (args._[0] === 'highlight') {
      if (args.clear) {
        args = { _: ['run-code', `async (page) => { await page.locator('#__pw_clear__').highlight().catch(() => {}); return "Cleared"; }`] };
      } else {
        const parts = args._.slice(1);
        if (!parts.length) return { text: 'Usage: highlight <locator>', isError: true };
        // highlight <ref> → use aria-ref selector
        if (parts.length === 1 && /^e\d+$/.test(parts[0])) {
          args = { _: ['run-code', `async (page) => { await page.locator('aria-ref=${parts[0]}').highlight(); return "Highlighted"; }`] };
        } else {
          const nth = args.nth !== undefined ? parseInt(String(args.nth), 10) : undefined;
          let locExpr: string;
          // highlight css <selector> → explicit CSS selector
          if (parts[0] === 'css') {
            const selector = parts.slice(1).join(' ');
            locExpr = `page.locator(${JSON.stringify(selector)})`;
          // highlight <role> "<name>" → getByRole(role, { name })
          } else if (parts.length >= 2 && /^[a-z]+$/.test(parts[0])) {
            const role = parts[0];
            const name = parts.slice(1).join(' ');
            locExpr = `page.getByRole(${JSON.stringify(role)}, { name: ${JSON.stringify(name)}, exact: true })`;
          } else {
            const loc = parts.join(' ');
            locExpr = `page.getByText(${JSON.stringify(loc)})`;
          }
          if (nth !== undefined) locExpr += `.nth(${nth})`;
          args = { _: ['run-code', `async (page) => { await ${locExpr}.highlight(); return "Highlighted"; }`] };
        }
      }
    }

    // ── css subcommand → run-code translation ──
    const CSS_ACTIONS: Record<string, string> = {
      click: 'click', dblclick: 'dblclick', hover: 'hover',
      check: 'check', uncheck: 'uncheck',
      fill: 'fill', select: 'selectOption',
    };
    if (CSS_ACTIONS[args._[0]] && args._[1] === 'css') {
      const action = CSS_ACTIONS[args._[0]];
      const needsValue = action === 'fill' || action === 'selectOption';
      const selectorParts = needsValue ? args._.slice(2, -1) : args._.slice(2);
      const selector = selectorParts.join(' ');
      if (selector) {
        const locExpr = `page.locator(${JSON.stringify(selector)})`;
        const value = needsValue ? args._[args._.length - 1] : undefined;
        const actionCall = value
          ? `${locExpr}.${action}(${JSON.stringify(value)})`
          : `${locExpr}.${action}()`;
        args = { _: ['run-code', `async (page) => { await ${actionCall}; return "Done"; }`] };
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
      await this._backend.dispose();
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
    const browser = await deps.createBrowser(config, clientInfo);
    const browserContext = browser.contexts()[0] || await browser.newContext();
    this._browserContext = browserContext;
    this._close = () => browser.close();

    this._backend = new deps.BrowserBackend(config, browserContext, deps.browserTools);
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
    this._doReconnect().catch((e) => {
      console.warn('Reconnection failed:', e instanceof Error ? e.message : String(e));
    });
  }

  private async _doReconnect(): Promise<void> {
    if (!this._reconnectInfo) return;
    const { opts, config, clientInfo } = this._reconnectInfo;
    const deps = this._deps || loadDeps();
    const cdpPort = (opts.cdpPort as number | undefined) || 9222;
    const cdpUrl = `http://localhost:${cdpPort}`;

    console.log('Browser context closed. Waiting for Chrome to reconnect...');

    let attempt = 0;
    while (!this._connected) {
      attempt++;
      await new Promise(r => setTimeout(r, 1500));

      // Check if engine was closed during reconnect
      if (!this._reconnectInfo) {
        console.log('Reconnection cancelled (engine closed).');
        break;
      }

      try {
        const res = await fetch(`${cdpUrl}/json/version`, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) {
          console.warn(`Reconnect attempt ${attempt}: CDP responded with status ${res.status}`);
          continue;
        }
      } catch (e) {
        console.warn(`Reconnect attempt ${attempt}: CDP not available (${e instanceof Error ? e.message : String(e)})`);
        continue;
      }

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
        console.log(`Reconnected to Chrome CDP after ${attempt} attempt(s).`);
      } catch (e) {
        console.warn(`Reconnect attempt ${attempt}: connection failed (${e instanceof Error ? e.message : String(e)})`);
      }
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
