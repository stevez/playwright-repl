import { WebSocketServer, WebSocket } from 'ws';
import { execSync } from 'node:child_process';
import type { EngineResult } from './types.js';

function ts(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export class BridgeServer {
    private wss!: WebSocketServer;
    private socket: WebSocket | null = null;
    private pending = new Map<string, (r: EngineResult) => void>();
    private _onConnect?: () => void;
    private _onDisconnect?: () => void;
    private _onEvent?: (event: Record<string, unknown>) => void;
    private heartbeatTimer?: ReturnType<typeof setInterval>;
    private waiters: Array<{ resolve: () => void; reject: (err: Error) => void; timer: ReturnType<typeof setTimeout> }> = [];
    private _silent = false;

    onConnect(fn: () => void)    { this._onConnect = fn; }
    onDisconnect(fn: () => void) { this._onDisconnect = fn; }
    onEvent(fn: (event: Record<string, unknown>) => void) { this._onEvent = fn; }
    get connected()              { return this.socket?.readyState === WebSocket.OPEN; }
    get port()                   { return (this.wss.address() as { port: number }).port; }

    async start(port = 9876, opts?: { silent?: boolean }): Promise<void> {
        this._silent = opts?.silent ?? false;
        const createServer = () => new WebSocketServer({
            port,
            host: '127.0.0.1',
            verifyClient: ({ origin }: { origin: string }) => {
                // Allow: no origin (Node.js ws clients, curl, tests)
                // Allow: chrome-extension:// (our offscreen document)
                // Block: http://, https:// (web pages)
                if (!origin) return true;
                if (origin.startsWith('chrome-extension://')) return true;
                console.error(`[bridge ${ts()}] rejected connection from origin: ${origin}`);
                return false;
            },
        });

        this.wss = createServer();
        try {
            await new Promise<void>((resolve, reject) => {
                this.wss.on('listening', resolve);
                this.wss.on('error', reject);
            });
        } catch (err: any) {
            if (err?.code !== 'EADDRINUSE') throw err;
            await killProcessOnPort(port);
            this.wss = createServer();
            await new Promise<void>((resolve, reject) => {
                this.wss.on('listening', resolve);
                this.wss.on('error', reject);
            });
        }
        this.wss.on('error', (err) => {
            console.error(`[bridge ${ts()}] server error: ${err.message}`);
        });
        this.wss.on('connection', (ws) => {
            if (!this._silent) console.error(`[bridge ${ts()}] new connection accepted`);
            this.socket = ws;
            (ws as any)._alive = true;

            // Flush all pending waiters
            for (const w of this.waiters) { clearTimeout(w.timer); w.resolve(); }
            this.waiters = [];
            this._onConnect?.();

            ws.on('pong', () => { (ws as any)._alive = true; });
            ws.on('message', (data) => {
                const msg = JSON.parse(String(data));
                // Events from extension (recording, picker) — no request ID
                if (msg._event) {
                    this._onEvent?.(msg);
                    return;
                }
                // Normal request/response
                this.pending.get(msg.id)?.(msg);
                this.pending.delete(msg.id);
            });
            ws.on('close', (code, reason) => {
                console.error(`[bridge ${ts()}] connection closed (code: ${code}, reason: ${reason || 'none'})`);
                this.socket = null;
                // Reject all in-flight commands so tests don't hang
                for (const [, resolve] of this.pending) {
                    resolve({ text: 'WebSocket disconnected', isError: true });
                }
                this.pending.clear();
                this._onDisconnect?.();
            });
        });

        // Heartbeat: detect silent disconnects every 30s
        this.heartbeatTimer = setInterval(() => {
            if (!this.socket) return;
            if ((this.socket as any)._alive === false) {
                console.error(`[bridge ${ts()}] heartbeat: no pong received, terminating socket`);
                this.socket.terminate();
                return;
            }
            (this.socket as any)._alive = false;
            this.socket.ping();
        }, 30000);
    }

    async run(command: string, opts?: { includeSnapshot?: boolean }): Promise<EngineResult> {
        if (!this.connected) {
            try { await this.waitForConnection(10000); }
            catch { return { text: 'Extension not connected', isError: true }; }
        }
        const id = Math.random().toString(36).slice(2);
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
            const msg: Record<string, unknown> = { id, command, type: 'command' };
            if (opts?.includeSnapshot) msg.includeSnapshot = true;
            this.socket!.send(JSON.stringify(msg));
        });
    }

    async runScript(script: string, language: 'pw' | 'javascript' = 'pw'): Promise<EngineResult> {
        if (!this.connected) {
            try { await this.waitForConnection(10000); }
            catch { return { text: 'Extension not connected', isError: true }; }
        }
        const id = Math.random().toString(36).slice(2);
        return new Promise((resolve) => {
            this.pending.set(id, resolve);
            this.socket!.send(JSON.stringify({ id, command: script, type: 'script', language }));
        });
    }

    async waitForConnection(timeoutMs = 30000): Promise<void> {
        if (this.connected) return;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                this.waiters = this.waiters.filter(w => w.resolve !== resolve);
                reject(new Error('Timed out waiting for extension to connect'));
            }, timeoutMs);
            this.waiters.push({ resolve, reject, timer });
        });
    }

    /** Drop the current connection and wait for offscreen doc to reconnect. */
    async reconnect(timeoutMs = 10000): Promise<void> {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.close();
        }
        await this.waitForConnection(timeoutMs);
    }

    async close(): Promise<void> {
        if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
        this.socket?.close();
        await new Promise<void>(r => this.wss.close(() => r()));
    }
}

async function killProcessOnPort(port: number): Promise<void> {
    try {
        if (process.platform === 'win32') {
            const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
            const pid = out.trim().split(/\s+/).pop();
            if (pid) execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        } else {
            execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: 'ignore' });
        }
        await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
        // Process may already be gone
    }
}
