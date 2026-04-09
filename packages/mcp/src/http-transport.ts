/**
 * HTTP transport for the MCP server.
 *
 * Allows the MCP server to run as a standalone HTTP process that multiple
 * AI clients (Claude Desktop, Claude Code, Copilot) can connect to.
 *
 * Usage: npx playwright-repl-mcp --http [--http-port 9877]
 */

import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { createMcpServer } from './server-factory.js';
import { logEvent } from './logger.js';
import type { Runner, RunnerDescriptions } from './types.js';

const PID_FILE = join(homedir(), '.playwright-repl', 'mcp.pid');

// ─── Session Management ─────────────────────────────────────────────────────

const sessions = new Map<string, StreamableHTTPServerTransport>();

// ─── HTTP Server ─────────────────────────────────────────────────────────────

export async function startHttpTransport(
    runner: Runner,
    descriptions: RunnerDescriptions,
    port: number,
): Promise<void> {
    const httpServer = createServer(async (req, res) => {
      try {
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (req.url !== '/mcp') {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        if (req.method === 'POST') {
            // Parse request body
            const body = await new Promise<string>((resolve) => {
                let data = '';
                req.on('data', (chunk: Buffer) => { data += chunk; });
                req.on('end', () => resolve(data));
            });
            let jsonBody: unknown;
            try {
                jsonBody = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32700, message: 'Parse error' }, id: null }));
                return;
            }

            let transport = sessionId ? sessions.get(sessionId) : undefined;
            if (!transport) {
                // Only create a new session for initialize requests
                if (!isInitializeRequest(jsonBody)) {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        jsonrpc: '2.0',
                        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
                        id: null,
                    }));
                    return;
                }
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (sid) => {
                        sessions.set(sid, transport!);
                        logEvent(`HTTP session created: ${sid}`);
                    },
                });
                const server = createMcpServer(runner, descriptions);
                await server.connect(transport);

                transport.onclose = () => {
                    const sid = transport!.sessionId;
                    if (sid) sessions.delete(sid);
                    logEvent(`HTTP session closed: ${sid}`);
                };
            }
            await transport.handleRequest(req, res, jsonBody);
            return;
        }

        if (req.method === 'GET') {
            // SSE stream for server-initiated notifications
            const transport = sessionId ? sessions.get(sessionId) : undefined;
            if (!transport) {
                res.writeHead(400);
                res.end('No session');
                return;
            }
            await transport.handleRequest(req, res);
            return;
        }

        if (req.method === 'DELETE') {
            const transport = sessionId ? sessions.get(sessionId) : undefined;
            if (transport) {
                await transport.close();
                sessions.delete(sessionId!);
                logEvent(`HTTP session deleted: ${sessionId}`);
            }
            res.writeHead(200);
            res.end();
            return;
        }

        res.writeHead(405);
        res.end('Method not allowed');
      } catch (err: any) {
        logEvent(`HTTP handler error: ${err?.message ?? err}`);
        console.error('[http] request handler error:', err);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal server error' }, id: null }));
        }
      }
    });

    await new Promise<void>((resolve) => {
        httpServer.listen(port, '127.0.0.1', () => resolve());
    });

    // Write PID file for easy process management
    writePidFile();

    console.error(`playwright-repl MCP HTTP server on http://127.0.0.1:${port}/mcp`);
    logEvent(`HTTP server listening on http://127.0.0.1:${port}/mcp`);

    // Clean up on exit
    const cleanup = () => {
        removePidFile();
        for (const transport of sessions.values()) {
            transport.close().catch(() => {});
        }
        sessions.clear();
        httpServer.close();
    };
    process.on('SIGINT', () => { logEvent('Received SIGINT, shutting down'); cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { logEvent('Received SIGTERM, shutting down'); cleanup(); process.exit(0); });
    process.on('uncaughtException', (err) => { logEvent(`Uncaught exception: ${err.message}`); console.error(err); });
    process.on('unhandledRejection', (reason) => { logEvent(`Unhandled rejection: ${reason}`); console.error(reason); });
}

// ─── PID File ────────────────────────────────────────────────────────────────

function writePidFile(): void {
    try {
        writeFileSync(PID_FILE, String(process.pid));
    } catch {
        // Non-critical — just for convenience
    }
}

function removePidFile(): void {
    try {
        unlinkSync(PID_FILE);
    } catch {
        // Already gone
    }
}
