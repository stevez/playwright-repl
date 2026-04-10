/**
 * File-based logger for the MCP server.
 *
 * Writes to ~/.playwright-repl/mcp.log so tool calls are visible
 * regardless of whether the host (Claude Desktop, Claude Code, etc.)
 * captures stderr.
 */

import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const LOG_DIR = join(homedir(), '.playwright-repl');
const LOG_FILE = join(LOG_DIR, 'mcp.log');

/** Maximum characters kept from a result text in the log. */
const MAX_RESULT_LENGTH = 200;

let enabled = true;

try {
    mkdirSync(LOG_DIR, { recursive: true });
} catch {
    enabled = false;
}

function ts(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function write(level: string, message: string): void {
    if (!enabled) return;
    try {
        appendFileSync(LOG_FILE, `${ts()} [${level}] ${message}\n`);
    } catch {
        // Silently ignore — logging should never break the server.
    }
}

/** Truncate a string for log readability. */
function truncate(text: string, max = MAX_RESULT_LENGTH): string {
    if (text.length <= max) return text;
    return text.slice(0, max) + `... (${text.length} chars)`;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function logStartup(mode: string, detail: string): void {
    write('info', `Server started [${mode}] ${detail}`);
}

export function logEvent(event: string): void {
    write('info', event);
}

export function logToolCall(tool: string, input: Record<string, unknown>): void {
    const args = Object.entries(input)
        .map(([k, v]) => {
            const s = typeof v === 'string' ? v : JSON.stringify(v);
            return `${k}=${truncate(s, 120)}`;
        })
        .join(' ');
    write('info', `-> ${tool}(${args})`);
}

export function logToolResult(tool: string, isError: boolean, text: string | undefined, durationMs: number): void {
    const status = isError ? 'ERROR' : 'OK';
    const summary = text ? truncate(text.replace(/\n/g, '\\n')) : '(empty)';
    write('info', `<- ${tool} [${status}] ${durationMs}ms ${summary}`);
}

export function logError(context: string, err: unknown): void {
    const msg = err instanceof Error ? err.message : String(err);
    write('error', `${context}: ${msg}`);
}

export { LOG_FILE };
