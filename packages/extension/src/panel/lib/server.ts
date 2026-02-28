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

export async function executeCommand(command: string, activeTabUrl?: string): Promise<CommandResult> {
    const res = await fetch(`${getServerUrl()}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: command, activeTabUrl }),
    });
    return res.json();
}

export async function checkHealth(): Promise<{status: string, version: string}> {
    const res = await fetch(`${getServerUrl()}/health`);
    return res.json();
}
