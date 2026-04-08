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
import { createMcpServer } from './index.js';
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
        const sessionId = req.headers['mcp-session-id'] as string | undefined;

        if (req.url !== '/mcp') {
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        if (req.method === 'POST') {
            let transport = sessionId ? sessions.get(sessionId) : undefined;
            if (!transport) {
                // New session — create a fresh McpServer + transport
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                });
                const server = createMcpServer(runner, descriptions);
                await server.connect(transport);
                sessions.set(transport.sessionId!, transport);
                logEvent(`HTTP session created: ${transport.sessionId}`);

                transport.onclose = () => {
                    const sid = transport!.sessionId;
                    if (sid) sessions.delete(sid);
                    logEvent(`HTTP session closed: ${sid}`);
                };
            }
            await transport.handleRequest(req, res);
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
    process.on('SIGINT', () => { cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { cleanup(); process.exit(0); });
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
