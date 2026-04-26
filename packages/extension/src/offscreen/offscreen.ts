// ─── CLI Bridge (offscreen document) ──────────────────────────────────────────
// Maintains WebSocket connection to the bridge server + handles video capture.
// This runs independently of the side panel — MCP works without the panel open.

// ─── Lifecycle logging ──────────────────────────────────────────────────────

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        console.debug(`[pw-repl] offscreen visibility: ${document.visibilityState}`);
    });
    window.addEventListener('beforeunload', () => {
        console.debug('[pw-repl] offscreen beforeunload — document being killed');
    });
}

// ─── Video Capture (tabCapture + MediaRecorder) ─────────────────────────────

let recorder: MediaRecorder | undefined;
let recordedChunks: Blob[] = [];
let lastBlobUrl: string | null = null;

function revokeLastBlob() {
    if (lastBlobUrl) {
        URL.revokeObjectURL(lastBlobUrl);
        lastBlobUrl = null;
    }
}

async function startVideoCapture(streamId: string) {
    if (recorder?.state === 'recording') {
        throw new Error('Already recording');
    }
    revokeLastBlob();

    // Chrome extension tab capture uses non-standard `mandatory` constraint
    const constraints = {
        audio: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
        video: { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: streamId } },
    } as unknown as MediaStreamConstraints;
    const media = await navigator.mediaDevices.getUserMedia(constraints);

    // Continue playing captured audio to the user
    const output = new AudioContext();
    const source = output.createMediaStreamSource(media);
    source.connect(output.destination);

    recorder = new MediaRecorder(media, { mimeType: 'video/webm' });
    recorder.ondataavailable = (event) => recordedChunks.push(event.data);
    recorder.start();

    // Track recording state in URL hash (survives SW restarts)
    window.location.hash = 'recording';
}

async function stopVideoCapture(): Promise<{ blobUrl: string; size: number }> {
    if (!recorder || recorder.state !== 'recording') {
        throw new Error('Not recording');
    }

    return new Promise<{ blobUrl: string; size: number }>((resolve) => {
        recorder!.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const blobUrl = URL.createObjectURL(blob);
            lastBlobUrl = blobUrl;
            const size = blob.size;

            // Clean up
            recorder = undefined;
            recordedChunks = [];
            window.location.hash = '';

            resolve({ blobUrl, size });
        };

        // Stop recording and release tab capture
        recorder!.stop();
        recorder!.stream.getTracks().forEach((t) => t.stop());
    });
}

// ─── Bridge WebSocket (command relay) ────────────────────────────────────────

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnecting = false;
let lastPort = 9876;
let retryCount = 0;

async function reconnect() {
    if (reconnecting) return;
    if (ws && ws.readyState === WebSocket.OPEN) return;
    // Kill stuck CONNECTING sockets
    if (ws && ws.readyState === WebSocket.CONNECTING) {
        ws.onclose = null;
        ws.onerror = null;
        ws.close();
        ws = null;
    }
    reconnecting = true;
    try {
        const port: number = await chrome.runtime.sendMessage({ type: 'get-bridge-port' });
        lastPort = port || 9876;
    } catch {
        // Service worker may be waking up — use last known port
    }
    connect(lastPort);
    reconnecting = false;
}

function scheduleReconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    const delay = Math.min(3000 * Math.pow(2, retryCount), 30000);
    reconnectTimer = setTimeout(() => reconnect(), delay);
    retryCount++;
}

// Periodic health check — reconnect if WebSocket is not open and bridge is enabled.
setInterval(() => {
    if (lastPort && (!ws || ws.readyState !== WebSocket.OPEN)) {
        reconnect();
    }
}, 10000);

function connect(port: number) {
    try {
        ws = new WebSocket(`ws://127.0.0.1:${port}`);

        ws.onopen = () => {
            console.debug(`[pw-repl] bridge connected to port ${port}`);
            retryCount = 0;
            // Trigger auto-attach so the CLI knows which tab is connected
            chrome.runtime.sendMessage({ type: 'bridge-attach' }).then((result: { url?: string }) => {
                if (ws?.readyState === WebSocket.OPEN && result?.url)
                    ws.send(JSON.stringify({ _event: true, type: 'tab-attached', url: result.url }));
            }).catch(() => {});
        };

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

        ws.onclose = (e) => {
            console.debug(`[pw-repl] bridge disconnected (code: ${e.code}, reason: ${e.reason || 'none'})`);
            ws = null;
            scheduleReconnect();
        };

        ws.onerror = () => {};
    } catch {
        scheduleReconnect();
    }
}

chrome.runtime.sendMessage({ type: 'get-bridge-port' }).then((port: number) => {
    lastPort = port || 9876;
    connect(lastPort);
});

// ─── Message routing from background SW ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: { type: string; port?: number; streamId?: string }, _sender, sendResponse) => {
    if (msg.type === 'bridge-port-changed') {
        lastPort = msg.port as number;
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) { ws.onclose = null; ws.close(); ws = null; }
        if (lastPort) connect(lastPort);
    }

    // Video capture messages
    if (msg.type === 'video-capture-start') {
        startVideoCapture(msg.streamId as string)
            .then(() => sendResponse({ ok: true }))
            .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
        return true;
    }
    if (msg.type === 'video-capture-stop') {
        stopVideoCapture()
            .then(({ blobUrl, size }) => sendResponse({ ok: true, blobUrl, size }))
            .catch((e: Error) => sendResponse({ ok: false, error: e.message }));
        return true;
    }
    if (msg.type === 'video-revoke') {
        revokeLastBlob();
    }

    // Forward events to the bridge client (CLI/MCP/VS Code)
    if (msg.type === 'tab-attached' || msg.type === 'recorded-action' || msg.type === 'recorded-fill-update') {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ _event: true, ...msg }));
        }
    }
});

export {};
