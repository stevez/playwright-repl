import type { CommandResult } from '@/types';

// --- Server config ---
const DEFAULT_PORT = 6781;
const STORAGE_KEY = 'pw-repl-server-port';

function getServerUrl(): string {
    const port = localStorage.getItem(STORAGE_KEY) || String(DEFAULT_PORT);
    return `http://localhost:${port}`;
}

export function getServerPort(): number {
    return parseInt(localStorage.getItem(STORAGE_KEY) || String(DEFAULT_PORT), 10);
}

export function setServerPort(port: number): void {
    localStorage.setItem(STORAGE_KEY, String(port));
}

const COMMAND_TIMEOUT_MS = 30_000;

export async function executeCommand(command: string, activeTabUrl?: string): Promise<CommandResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), COMMAND_TIMEOUT_MS);
    try {
        const res = await fetch(`${getServerUrl()}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ raw: command, activeTabUrl }),
            signal: controller.signal,
        });
        return res.json();
    } finally {
        clearTimeout(timer);
    }
}

export async function checkHealth(): Promise<{status: string, version: string, browserConnected?: boolean}> {
    const res = await fetch(`${getServerUrl()}/health`);
    return res.json();
}
