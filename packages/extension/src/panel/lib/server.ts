import type { CommandResult } from '@/types';

// --- Server config ---
const SERVER_PORT = 6781;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

export async function executeCommand(command: string, activeTabUrl?: string): Promise<CommandResult> {
    const res = await fetch(`${SERVER_URL}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw: command, activeTabUrl }),
    });
    return res.json();
}

export async function checkHealth(): Promise<{status: string, version: string}> {
    const res = await fetch(`${SERVER_URL}/health`);
    return res.json();
}