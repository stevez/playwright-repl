/**
 * HTTP MCP client — connects the CLI to a shared HTTP MCP server.
 *
 * Usage: playwright-repl --http [url]
 *
 * Implements the same run()/close()/connected interface as BridgeServer
 * so it plugs into the existing bridge REPL loop.
 */

import http from 'node:http';
import type { EngineResult } from '@playwright-repl/core';

const DEFAULT_URL = 'http://127.0.0.1:9877/mcp';

export class HttpMcpClient {
    private url: string;
    private sessionId: string | null = null;
    private _connected = false;

    constructor(url?: string) {
        this.url = url || DEFAULT_URL;
    }

    get connected(): boolean { return this._connected; }

    async start(): Promise<void> {
        // Initialize the MCP session
        const res = await this.post({
            jsonrpc: '2.0',
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {},
                clientInfo: { name: 'playwright-repl-cli', version: '1.0' },
            },
            id: 1,
        });

        if (!this.sessionId) {
            throw new Error('MCP server did not return a session ID');
        }

        // Send initialized notification
        await this.post({
            jsonrpc: '2.0',
            method: 'notifications/initialized',
        });

        this._connected = true;
    }

    async run(command: string, opts?: { includeSnapshot?: boolean }): Promise<EngineResult> {
        if (!this._connected) {
            return { text: 'Not connected to MCP server', isError: true };
        }

        const params: Record<string, unknown> = { command };
        const result = await this.callTool('run_command', params);
        return result;
    }

    async runScript(script: string, language: 'pw' | 'javascript' = 'pw'): Promise<EngineResult> {
        if (!this._connected) {
            return { text: 'Not connected to MCP server', isError: true };
        }

        return this.callTool('run_script', { script, language });
    }

    async close(): Promise<void> {
        if (this.sessionId) {
            try {
                await this.request('DELETE');
            } catch { /* ignore */ }
        }
        this._connected = false;
        this.sessionId = null;
    }

    // Stub callbacks for compatibility with bridge REPL loop
    onConnect(_fn: () => void): void {}
    onDisconnect(_fn: () => void): void {}
    onEvent(_fn: (event: Record<string, unknown>) => void): void {}

    private async callTool(name: string, args: Record<string, unknown>): Promise<EngineResult> {
        const id = Math.random().toString(36).slice(2);
        const response = await this.post({
            jsonrpc: '2.0',
            method: 'tools/call',
            params: { name, arguments: args },
            id,
        });

        if (response.error) {
            return { text: response.error.message || 'MCP error', isError: true };
        }

        const content = response.result?.content;
        if (!content || !Array.isArray(content)) {
            return { text: 'No response', isError: false };
        }

        // Extract text and image from content blocks
        let text = '';
        let image: string | undefined;
        for (const block of content) {
            if (block.type === 'text') {
                text += (text ? '\n' : '') + block.text;
            } else if (block.type === 'image') {
                image = `data:${block.mimeType || 'image/png'};base64,${block.data}`;
            }
        }

        return {
            text: text || 'Done',
            image,
            isError: response.result?.isError ?? false,
        };
    }

    private async post(body: Record<string, unknown>): Promise<any> {
        return this.request('POST', JSON.stringify(body));
    }

    private request(method: string, body?: string): Promise<any> {
        return new Promise((resolve, reject) => {
            const url = new URL(this.url);
            const headers: Record<string, string> = {
                'Accept': 'application/json, text/event-stream',
            };
            if (body) headers['Content-Type'] = 'application/json';
            if (this.sessionId) headers['mcp-session-id'] = this.sessionId;

            const req = http.request({
                hostname: url.hostname,
                port: url.port,
                path: url.pathname,
                method,
                headers,
            }, (res) => {
                // Capture session ID from response
                const sid = res.headers['mcp-session-id'];
                if (sid && typeof sid === 'string') {
                    this.sessionId = sid;
                }

                if (method === 'DELETE') { resolve({}); return; }
                // Notifications return 202 with no body
                if (res.statusCode === 202) { resolve({}); return; }

                let resolved = false;
                let data = '';
                res.on('data', (chunk: Buffer) => {
                    if (resolved) return;
                    data += chunk;
                    // SSE events end with double newline
                    for (const line of data.split('\n')) {
                        if (line.startsWith('data: ')) {
                            try {
                                const parsed = JSON.parse(line.slice(6));
                                resolved = true;
                                resolve(parsed);
                                return;
                            } catch { /* continue */ }
                        }
                    }
                });
                res.on('end', () => {
                    if (resolved) return;
                    // Try plain JSON
                    try { resolve(JSON.parse(data)); }
                    catch { resolve({ error: { message: data || `HTTP ${res.statusCode}` } }); }
                });
            });

            req.on('error', (err) => reject(err));
            if (body) req.write(body);
            req.end();
        });
    }
}
