// ─── CLI Bridge (offscreen document) ���─────────────────��───────────────────────
// Maintains WebSocket connections to:
// 1. Bridge server (command relay) — port from chrome.storage
// 2. CDP relay server (CDP protocol relay) — port from chrome.storage
// This runs independently of the side panel — MCP works without the panel open.

// ─── Bridge WebSocket (command relay) ──────────��────────────────────────────

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

async function reconnect() {
    try {
        const port: number = await chrome.runtime.sendMessage({ type: 'get-bridge-port' });
        connect(port || 9876);
    } catch {
        reconnectTimer = setTimeout(() => reconnect(), 3000);
    }
}

function connect(port: number) {
    try {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);

        ws.onmessage = async (e) => {
            const msg = JSON.parse(e.data as string) as {
                id: string;
                command: string;
                type?: 'command' | 'script';
                language?: 'pw' | 'javascript';
                includeSnapshot?: boolean;
            };

            try {
                const runtimeMsg: Record<string, unknown> = {
                    type: 'bridge-command',
                    command: msg.command,
                    scriptType: msg.type,
                    language: msg.language,
                };
                if (msg.includeSnapshot) runtimeMsg.includeSnapshot = true;
                const result = await chrome.runtime.sendMessage(runtimeMsg);

                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ id: msg.id, ...result }));
                }
            } catch (err) {
                if (ws?.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ id: msg.id, text: String(err), isError: true }));
                }
            }
        };

        ws.onclose = () => {
            reconnectTimer = setTimeout(() => reconnect(), 3000);
        };

        ws.onerror = () => {};
    } catch {
        reconnectTimer = setTimeout(() => reconnect(), 3000);
    }
}

chrome.runtime.sendMessage({ type: 'get-bridge-port' }).then((port: number) => {
    connect(port || 9876);
});

// ─── CDP Relay WebSocket ───────────��────────────────────────────────────────

let cdpWs: WebSocket | null = null;
let cdpReconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connectCdpRelay(port: number) {
    try {
        cdpWs = new WebSocket(`ws://127.0.0.1:${port}/extension`);

        cdpWs.onmessage = async (e) => {
            const msg = JSON.parse(e.data as string);
            // Request from Node relay → forward to background SW, send response back
            if (msg.id && msg.method) {
                try {
                    console.log('[offscreen] → SW:', msg.method, JSON.stringify(msg.params || {}).slice(0, 150));
                    const response = await chrome.runtime.sendMessage({ type: 'cdp-command', ...msg });
                    if (cdpWs?.readyState === WebSocket.OPEN) {
                        cdpWs.send(JSON.stringify({ id: msg.id, ...response }));
                    }
                } catch (err) {
                    if (cdpWs?.readyState === WebSocket.OPEN) {
                        cdpWs.send(JSON.stringify({ id: msg.id, error: String(err) }));
                    }
                }
            }
        };

        cdpWs.onclose = () => {
            cdpWs = null;
            cdpReconnectTimer = setTimeout(() => tryConnectCdpRelay(), 3000);
        };

        cdpWs.onerror = () => {};
    } catch {
        cdpReconnectTimer = setTimeout(() => tryConnectCdpRelay(), 3000);
    }
}

async function tryConnectCdpRelay() {
    try {
        const port: number = await chrome.runtime.sendMessage({ type: 'get-cdp-relay-port' });
        if (port) connectCdpRelay(port);
        else connectCdpRelay(9877); // Default CDP relay port — always try
    } catch {
        cdpReconnectTimer = setTimeout(() => tryConnectCdpRelay(), 5000);
    }
}

// Try to connect to CDP relay on startup
tryConnectCdpRelay();

// ─── Message routing from background SW ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'bridge-port-changed') {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) { ws.onclose = null; ws.close(); }
        connect(msg.port as number);
    }

    if (msg.type === 'cdp-relay-port-changed') {
        if (cdpReconnectTimer) clearTimeout(cdpReconnectTimer);
        if (cdpWs) { cdpWs.onclose = null; cdpWs.close(); }
        connectCdpRelay(msg.port as number);
    }

    // CDP relay events from background → forward to CDP relay Node server
    if (msg.method === 'forwardCDPEvent') {
        console.log('[offscreen] ← SW event:', (msg.params as any)?.method);
        if (cdpWs?.readyState === WebSocket.OPEN) {
            cdpWs.send(JSON.stringify(msg));
        }
        return;
    }

    // Forward recording/picker events to the bridge client (VS Code)
    if (msg.type === 'recorded-action' || msg.type === 'recorded-fill-update' ||
        msg.type === 'element-picked-raw' || msg.type === 'pick-cancelled') {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ _event: true, ...msg }));
        }
    }
});

export {};
