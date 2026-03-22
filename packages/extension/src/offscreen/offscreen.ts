// ─── CLI Bridge (offscreen document) ──────────────────────────────────────────
// Maintains a WebSocket connection to the MCP/CLI bridge server.
// Relays commands to the service worker for execution via chrome.runtime messaging.
// This runs independently of the side panel — MCP works without the panel open.

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect(port: number) {
    try {
        ws = new WebSocket(`ws://localhost:${port}`);

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
            reconnectTimer = setTimeout(() => connect(port), 3000);
        };

        ws.onerror = () => {};
    } catch {
        reconnectTimer = setTimeout(() => connect(port), 3000);
    }
}

// Ask the SW for the bridge port (offscreen docs can't access chrome.storage)
chrome.runtime.sendMessage({ type: 'get-bridge-port' }).then((port: number) => {
    connect(port || 9876);
});

// Listen for port changes relayed from the SW
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'bridge-port-changed') {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) { ws.onclose = null; ws.close(); }
        connect(msg.port as number);
    }
});

export {};
