/**
 * CDP Relay Server — bridges Playwright MCP and Dramaturg extension.
 *
 * Two WebSocket endpoints on one HTTP server:
 *   /cdp/{uuid}       — Playwright connectOverCDP() connects here
 *   /relay/{uuid}     — Extension connects here (via offscreen document)
 *
 * Protocol (v1): extension receives `attachToTab` and `forwardCDPCommand`,
 * sends back `forwardCDPEvent`. The relay translates between standard CDP
 * (Playwright side) and the wrapped extension protocol.
 */

import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';

// ─── Protocol types (v1, matches Playwright 1.59) ────────────────────────────

export type ExtensionCommand = {
    'attachToTab': { params: Record<string, never> };
    'forwardCDPCommand': { params: { method: string; sessionId?: string; params?: unknown } };
};

export type ExtensionEvents = {
    'forwardCDPEvent': { params: { method: string; sessionId?: string; params?: unknown } };
};

type CDPCommand = { id: number; sessionId?: string; method: string; params?: unknown };
type CDPResponse = { id?: number; sessionId?: string; method?: string; params?: unknown; result?: unknown; error?: { code?: number; message: string } };

// ─── ExtensionConnection ─────────────────────────────────────────────────────

class ExtensionConnection {
    private readonly _ws: WebSocket;
    private readonly _callbacks = new Map<number, { resolve: (o: unknown) => void; reject: (e: Error) => void }>();
    private _lastId = 0;

    onmessage?: <M extends keyof ExtensionEvents>(method: M, params: ExtensionEvents[M]['params']) => void;
    onclose?: (self: ExtensionConnection, reason: string) => void;

    constructor(ws: WebSocket) {
        this._ws = ws;
        this._ws.on('message', (data) => this._onMessage(data));
        this._ws.on('close', (code, reason) => this._onClose(code, String(reason)));
        this._ws.on('error', () => { /* logged by relay */ });
    }

    async send<M extends keyof ExtensionCommand>(method: M, params: ExtensionCommand[M]['params']): Promise<unknown> {
        if (this._ws.readyState !== WebSocket.OPEN)
            throw new Error(`WebSocket not open (state: ${this._ws.readyState})`);
        const id = ++this._lastId;
        this._ws.send(JSON.stringify({ id, method, params }));
        return new Promise((resolve, reject) => {
            this._callbacks.set(id, { resolve, reject });
        });
    }

    close(message: string) {
        if (this._ws.readyState === WebSocket.OPEN)
            this._ws.close(1000, message);
    }

    private _onMessage(data: unknown) {
        let msg: { id?: number; method?: string; params?: unknown; result?: unknown; error?: string };
        try { msg = JSON.parse(String(data)); } catch { this._ws.close(); return; }

        if (msg.id && this._callbacks.has(msg.id)) {
            const cb = this._callbacks.get(msg.id)!;
            this._callbacks.delete(msg.id);
            if (msg.error) cb.reject(new Error(msg.error));
            else cb.resolve(msg.result);
        } else if (!msg.id && msg.method) {
            this.onmessage?.(msg.method as keyof ExtensionEvents, msg.params as ExtensionEvents[keyof ExtensionEvents]['params']);
        }
    }

    private _onClose(_code: number, reason: string) {
        for (const cb of this._callbacks.values()) cb.reject(new Error('WebSocket closed'));
        this._callbacks.clear();
        this.onclose?.(this, reason);
    }
}

// ─── CDPRelayServer ──────────────────────────────────────────────────────────

export class CDPRelayServer {
    private _httpServer: http.Server;
    private _wss: WebSocketServer;
    private _playwrightConnection: WebSocket | null = null;
    private _extensionConnection: ExtensionConnection | null = null;
    private _connectedTabInfo: { targetInfo: unknown; sessionId: string } | undefined;
    private _nextSessionId = 1;
    private _cdpPath: string;
    private _relayPath: string;
    private _extensionWaiters: Array<{ resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];

    constructor() {
        this._cdpPath = '/cdp';
        this._relayPath = '/relay';
        this._httpServer = http.createServer();
        this._wss = new WebSocketServer({ server: this._httpServer });
        this._wss.on('connection', (ws, req) => this._onConnection(ws, req));
    }

    /** Start the HTTP + WebSocket server. Default port 9877. */
    async start(port = 9877): Promise<void> {
        await new Promise<void>((resolve, reject) => {
            this._httpServer.on('listening', resolve);
            this._httpServer.on('error', reject);
            this._httpServer.listen(port, '127.0.0.1');
        });
    }

    get port(): number {
        return (this._httpServer.address() as { port: number }).port;
    }

    /** Endpoint for Playwright connectOverCDP(). */
    cdpEndpoint(): string {
        return `ws://127.0.0.1:${this.port}${this._cdpPath}`;
    }

    /** Endpoint for the extension to connect to. */
    relayEndpoint(): string {
        return `ws://127.0.0.1:${this.port}${this._relayPath}`;
    }

    get extensionConnected(): boolean {
        return this._extensionConnection !== null;
    }

    /** Wait for the extension to connect via the /relay/ endpoint. */
    async waitForExtension(timeoutMs = 10000): Promise<void> {
        if (this._extensionConnection) return;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this._extensionWaiters = this._extensionWaiters.filter(w => w.resolve !== resolve);
                reject(new Error('Extension connection timeout'));
            }, timeoutMs);
            this._extensionWaiters.push({ resolve, reject, timer });
        });
    }

    async close(): Promise<void> {
        this._playwrightConnection?.close();
        this._extensionConnection?.close('Server stopped');
        this._wss.close();
        await new Promise<void>(r => this._httpServer.close(() => r()));
    }

    // ── Connection routing ─────────────────────────────────────────────────

    private _onConnection(ws: WebSocket, req: http.IncomingMessage) {
        const url = new URL(`http://localhost${req.url}`);
        if (url.pathname === this._cdpPath) this._handlePlaywrightConnection(ws);
        else if (url.pathname === this._relayPath) this._handleExtensionConnection(ws);
        else ws.close(4004, 'Invalid path');
    }

    // ── Playwright (CDP client) side ───────────────────────────────────────

    private _handlePlaywrightConnection(ws: WebSocket) {
        if (this._playwrightConnection) { ws.close(1000, 'Another CDP client already connected'); return; }
        this._playwrightConnection = ws;

        ws.on('message', async (data) => {
            try {
                const message: CDPCommand = JSON.parse(String(data));
                await this._handlePlaywrightMessage(message);
            } catch (e) {
                console.error('[cdp-relay] error handling Playwright message:', (e as Error).message);
            }
        });

        ws.on('close', () => {
            if (this._playwrightConnection !== ws) return;
            this._playwrightConnection = null;
            this._extensionConnection?.close('Playwright client disconnected');
            this._resetExtension();
        });
    }

    private async _handlePlaywrightMessage(message: CDPCommand) {
        const { id, sessionId, method, params } = message;
        try {
            const result = await this._handleCDPCommand(method, params, sessionId);
            this._sendToPlaywright({ id, sessionId, result });
        } catch (e) {
            this._sendToPlaywright({ id, sessionId, error: { message: (e as Error).message } });
        }
    }

    private async _handleCDPCommand(method: string, params: unknown, sessionId?: string): Promise<unknown> {
        switch (method) {
            case 'Browser.getVersion':
                return { protocolVersion: '1.3', product: 'Chrome/Dramaturg-Bridge', userAgent: 'CDP-Bridge-Server/1.0.0' };
            case 'Browser.setDownloadBehavior':
                // chrome.debugger is tab-level — can't handle browser-level commands.
                // Downloads use `download-as` / chrome.downloads API instead.
                return {};
            case 'Target.setAutoAttach': {
                // Forward child session handling
                if (sessionId) break;
                // Simulate auto-attach with real target info
                const { targetInfo } = await this._extensionConnection!.send('attachToTab', {}) as { targetInfo: unknown };
                this._connectedTabInfo = {
                    targetInfo,
                    sessionId: `pw-tab-${this._nextSessionId++}`,
                };
                this._sendToPlaywright({
                    method: 'Target.attachedToTarget',
                    params: {
                        sessionId: this._connectedTabInfo.sessionId,
                        targetInfo: { ...(this._connectedTabInfo.targetInfo as Record<string, unknown>), attached: true },
                        waitingForDebugger: false,
                    },
                });
                return {};
            }
            case 'Target.getTargetInfo':
                return this._connectedTabInfo?.targetInfo;
        }
        return await this._forwardToExtension(method, params, sessionId);
    }

    private async _forwardToExtension(method: string, params: unknown, sessionId?: string): Promise<unknown> {
        if (!this._extensionConnection) throw new Error('Extension not connected');
        // Strip top-level sessionId (relay-only concept)
        if (this._connectedTabInfo?.sessionId === sessionId) sessionId = undefined;
        return await this._extensionConnection.send('forwardCDPCommand', { sessionId, method, params });
    }

    private _sendToPlaywright(message: CDPResponse) {
        this._playwrightConnection?.send(JSON.stringify(message));
    }

    // ── Extension side ─────────────────────────────────────────────────────

    private _handleExtensionConnection(ws: WebSocket) {
        if (this._extensionConnection) { ws.close(1000, 'Another extension already connected'); return; }
        this._extensionConnection = new ExtensionConnection(ws);

        this._extensionConnection.onclose = (c, reason) => {
            if (this._extensionConnection !== c) return;
            this._resetExtension();
            if (this._playwrightConnection?.readyState === WebSocket.OPEN)
                this._playwrightConnection.close(1000, `Extension disconnected: ${reason}`);
            this._playwrightConnection = null;
        };

        this._extensionConnection.onmessage = (method, params) => {
            if (method === 'forwardCDPEvent') {
                const p = params as { method: string; sessionId?: string; params?: unknown };
                this._sendToPlaywright({
                    sessionId: p.sessionId || this._connectedTabInfo?.sessionId,
                    method: p.method,
                    params: p.params,
                });
            }
        };

        // Flush waiters
        for (const w of this._extensionWaiters) { clearTimeout(w.timer); w.resolve(); }
        this._extensionWaiters = [];
    }

    private _resetExtension() {
        this._connectedTabInfo = undefined;
        this._extensionConnection = null;
    }
}
