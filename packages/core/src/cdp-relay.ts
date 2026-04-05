/**
 * CdpRelay — WebSocket server that bridges Playwright's connectOverCDP
 * and the Dramaturg extension's chrome.debugger.
 *
 * Follows the same pattern as Playwright's official MCP CDPRelayServer:
 * - Extension is a dumb CDP proxy (attachToTab, forwardCDPCommand, forwardCDPEvent)
 * - All CDP protocol translation happens here on the Node side
 * - Single tab at a time
 *
 * Two WebSocket paths on the same port:
 * - /extension — Dramaturg extension connects here
 * - /devtools/browser/<guid> — Playwright connectOverCDP connects here
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createHttpServer } from 'node:http';
import type { Server as HttpServer } from 'node:http';

// ─── Types ──────────────────────────────────────────────────────────────────

interface CdpMessage {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  sessionId?: string;
  result?: unknown;
  error?: { code?: number; message: string };
}

// ─── CdpRelay ───────────────────────────────────────────────────────────────

export class CdpRelay {
  private httpServer!: HttpServer;
  private wss!: WebSocketServer;
  private playwrightSocket: WebSocket | null = null;
  private extensionSocket: WebSocket | null = null;
  private _port = 0;
  private _guid = crypto.randomUUID();
  private _connected = false;
  private _onExtensionConnect?: () => void;

  // Extension request/response tracking
  private _extCallbacks = new Map<number, { resolve: (r: unknown) => void; reject: (e: Error) => void }>();
  private _extNextId = 1;

  // Connected tab info
  private _tabSessionId: string | null = null;
  private _tabTargetInfo: Record<string, unknown> | null = null;
  private _nextSessionId = 1;

  get port() { return this._port; }
  get wsUrl() { return `ws://127.0.0.1:${this._port}/devtools/browser/${this._guid}`; }
  get connected() { return this._connected; }

  async start(port = 9877): Promise<void> {
    this.httpServer = createHttpServer((req, res) => {
      if (req.url === '/json/version' || req.url === '/json/version/') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          'Browser': 'Chrome (Dramaturg CDP Relay)',
          'Protocol-Version': '1.3',
          'webSocketDebuggerUrl': this.wsUrl,
        }));
        return;
      }
      if (req.url?.startsWith('/json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    this.wss = new WebSocketServer({ noServer: true });

    this.httpServer.on('upgrade', (req, socket, head) => {
      const url = req.url || '/';
      if (url.startsWith('/devtools/')) {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onPlaywrightConnect(ws));
        return;
      }
      if (url === '/extension' || url.startsWith('/extension')) {
        this.wss.handleUpgrade(req, socket, head, (ws) => this.onExtensionConnect(ws));
        return;
      }
      socket.destroy();
    });

    await new Promise<void>((resolve, reject) => {
      this.httpServer.on('listening', resolve);
      this.httpServer.on('error', reject);
      this.httpServer.listen(port, '127.0.0.1');
    });
    this._port = (this.httpServer.address() as { port: number }).port;
  }

  async waitForExtension(timeoutMs = 30000): Promise<void> {
    if (this._connected) return;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timed out waiting for extension')), timeoutMs);
      this._onExtensionConnect = () => {
        clearTimeout(timer);
        this._onExtensionConnect = undefined;
        resolve();
      };
    });
  }

  // ─── Extension connection ─────────────────────────────────────────────────

  private onExtensionConnect(ws: WebSocket): void {
    if (this.extensionSocket) {
      ws.close(1000, 'Another extension already connected');
      return;
    }
    console.error('[cdp-relay] Extension connected');
    this.extensionSocket = ws;
    this._connected = true;
    this._onExtensionConnect?.();

    ws.on('message', (data) => {
      const msg = JSON.parse(String(data));
      this.onExtensionMessage(msg);
    });

    ws.on('close', () => {
      console.error('[cdp-relay] Extension disconnected');
      this.extensionSocket = null;
      this._connected = false;
      this._tabSessionId = null;
      this._tabTargetInfo = null;
      // Reject pending extension calls
      for (const [, cb] of this._extCallbacks) cb.reject(new Error('Extension disconnected'));
      this._extCallbacks.clear();
    });
  }

  /** Send a request to the extension and wait for response. */
  private sendToExtension(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.extensionSocket || this.extensionSocket.readyState !== WebSocket.OPEN)
      return Promise.reject(new Error('Extension not connected'));
    const id = this._extNextId++;
    const msg = { id, method, params };
    console.error(`[cdp-relay] → ext: ${method} (id=${id})`, JSON.stringify(params).slice(0, 150));
    this.extensionSocket.send(JSON.stringify(msg));
    return new Promise((resolve, reject) => {
      this._extCallbacks.set(id, { resolve, reject });
    });
  }

  /** Handle messages from the extension (responses and events). */
  private onExtensionMessage(msg: Record<string, unknown>): void {
    // Response to a pending request
    if (typeof msg.id === 'number' && this._extCallbacks.has(msg.id)) {
      const cb = this._extCallbacks.get(msg.id)!;
      this._extCallbacks.delete(msg.id);
      const resultStr = JSON.stringify(msg.result);
      console.error(`[cdp-relay] ← ext: resp id=${msg.id}`, msg.error ? `ERROR: ${msg.error}` : `OK ${resultStr?.slice(0, 500)}`);
      if (msg.error) cb.reject(new Error(msg.error as string));
      else cb.resolve(msg.result);
      return;
    }

    // Event from extension (forwardCDPEvent)
    console.error(`[cdp-relay] ← ext event:`, JSON.stringify(msg).slice(0, 200));
    if (msg.method === 'forwardCDPEvent') {
      const params = msg.params as { method: string; params?: unknown; sessionId?: string };
      const sessionId = params.sessionId || this._tabSessionId;
      this.sendToPlaywright({
        sessionId: sessionId ?? undefined,
        method: params.method,
        params: params.params as Record<string, unknown>,
      });
    }
  }

  // ─── Playwright connection ────────────────────────────────────────────────

  private onPlaywrightConnect(ws: WebSocket): void {
    if (this.playwrightSocket) {
      ws.close(1000, 'Another Playwright client already connected');
      return;
    }
    console.error('[cdp-relay] Playwright connected');
    this.playwrightSocket = ws;

    ws.on('message', async (data) => {
      const msg: CdpMessage = JSON.parse(String(data));
      await this.handlePlaywrightMessage(msg);
    });

    ws.on('close', () => {
      console.error('[cdp-relay] Playwright disconnected');
      this.playwrightSocket = null;
    });
  }

  /** Handle CDP messages from Playwright. */
  private async handlePlaywrightMessage(msg: CdpMessage): Promise<void> {
    const { id, sessionId, method, params } = msg;
    console.error(`[cdp-relay] ← PW: ${sessionId ? `[${sessionId}] ` : ''}${method} (id=${id})`);

    try {
      const result = await this.handleCDPCommand(method!, params, sessionId);
      this.sendToPlaywright({ id, sessionId, result });
    } catch (e: unknown) {
      this.sendToPlaywright({
        id,
        sessionId,
        error: { message: (e as Error).message },
      });
    }
  }

  /** Route CDP commands — synthesize browser-level, forward session-level. */
  private async handleCDPCommand(method: string, params: Record<string, unknown> | undefined, sessionId: string | undefined): Promise<unknown> {
    // Browser-level commands (no sessionId)
    switch (method) {
      case 'Browser.getVersion':
        return {
          protocolVersion: '1.3',
          product: 'Chrome (Dramaturg CDP Relay)',
          userAgent: '',
        };
      case 'Browser.setDownloadBehavior':
        return {};
      case 'Target.setAutoAttach': {
        // Session-level Target.setAutoAttach → forward to extension
        if (sessionId) break;
        // Browser-level → attach to the active tab
        const { targetInfo } = await this.sendToExtension('attachToTab', {}) as { targetInfo: Record<string, unknown> };
        this._tabTargetInfo = targetInfo;
        this._tabSessionId = `pw-tab-${this._nextSessionId++}`;
        // Send Target.attachedToTarget event to Playwright
        this.sendToPlaywright({
          method: 'Target.attachedToTarget',
          params: {
            sessionId: this._tabSessionId,
            targetInfo: { ...targetInfo, attached: true },
            waitingForDebugger: false,
          },
        });
        return {};
      }
      case 'Target.getTargetInfo':
        if (!params?.targetId) {
          return { targetInfo: { targetId: 'browser', type: 'browser', title: '', url: '' } };
        }
        return { targetInfo: this._tabTargetInfo || {} };
      case 'Target.setDiscoverTargets':
        return {};
      case 'Target.getBrowserContexts':
        return { browserContextIds: ['default'] };
      case 'Target.getTargets':
        return { targetInfos: this._tabTargetInfo ? [this._tabTargetInfo] : [] };
    }

    // Forward to extension — strip top-level sessionId
    const forwardSessionId = (this._tabSessionId === sessionId) ? undefined : sessionId;
    return await this.sendToExtension('forwardCDPCommand', {
      method,
      params,
      sessionId: forwardSessionId,
    });
  }

  private sendToPlaywright(msg: CdpMessage): void {
    if (this.playwrightSocket?.readyState === WebSocket.OPEN) {
      const data = JSON.stringify(msg);
      console.error(`[cdp-relay] → PW: ${data.slice(0, 250)}`);
      this.playwrightSocket.send(data);
    }
  }

  // ─── Cleanup ──────────────────────────────────────────────────────────────

  async close(): Promise<void> {
    this.playwrightSocket?.close();
    this.extensionSocket?.close();
    this.wss.close();
    await new Promise<void>(r => this.httpServer.close(() => r()));
  }
}
