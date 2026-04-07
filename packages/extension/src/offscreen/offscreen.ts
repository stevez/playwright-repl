// ─── CLI Bridge (offscreen document) ──────────────────────────────────────────
// Maintains WebSocket connection to the bridge server + handles video capture.
// This runs independently of the side panel — MCP works without the panel open.

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

    const media = await navigator.mediaDevices.getUserMedia({
        audio: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId,
            },
        } as any,
        video: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId,
            },
        } as any,
    });

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

// ─── Message routing from background SW ─────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
chrome.runtime.onMessage.addListener((msg: any, _sender: any, sendResponse: any) => {
    if (msg.type === 'bridge-port-changed') {
        if (reconnectTimer) clearTimeout(reconnectTimer);
        if (ws) { ws.onclose = null; ws.close(); }
        connect(msg.port as number);
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

    // Forward recording events to the bridge client (VS Code)
    if (msg.type === 'recorded-action' || msg.type === 'recorded-fill-update') {
        if (ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ _event: true, ...msg }));
        }
    }
});

export {};
