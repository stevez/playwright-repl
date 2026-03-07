import { useState } from 'react';
import type { ConsoleEntry } from './types';
import { COMMAND_NAMES, COMMANDS } from '@/lib/commands';
import { addCommand, getCommandHistory, clearHistory } from '@/lib/command-history';
import { swDebugEval, swGetProperties } from '@/lib/sw-debugger';
import { cdpEvaluate, executeCommandForConsole } from '@/lib/bridge';
import { fromCdpRemoteObject, type CdpRemoteObject } from './cdpToSerialized';

const PW_COMMANDS = new Set(COMMAND_NAMES);

const SNAPSHOT_CMDS = new Set(['snapshot', 'snap', 's']);

const executors = {
    playwright: async (expr: string) => {
        const raw = await swDebugEval(expr) as { result?: CdpRemoteObject; error?: string };
        if (raw?.error) throw new Error(raw.error);
        if (!raw?.result) throw new Error('No result from service worker');
        const result = raw.result as CdpRemoteObject;
        if (result.type === 'undefined') return { text: 'Done' as string };
        return { value: fromCdpRemoteObject(result), getProperties: swGetProperties };
    },
    js: async (expr: string) => {
        const raw = await cdpEvaluate(expr) as { result?: CdpRemoteObject; error?: string };
        if (raw?.error) throw new Error(raw.error);
        if (!raw?.result) throw new Error('No result');
        return { value: fromCdpRemoteObject(raw.result) };
    },
    pw: async (command: string) => {
        const result = await executeCommandForConsole(command);
        if ('cdpResult' in result) {
            return { value: fromCdpRemoteObject(result.cdpResult), getProperties: swGetProperties };
        }
        if (result.image) return { image: result.image as string };
        const cmd = command.trim().split(/\s+/)[0].toLowerCase();
        if (SNAPSHOT_CMDS.has(cmd)) return { codeBlock: result.text as string };
        return { text: (result.text || 'Done') as string };
    },
};

export function useConsole() {
    const [entries, setEntries] = useState<ConsoleEntry[]>([]);

    function addEntry(entry: ConsoleEntry) {
        setEntries(prev => [...prev, entry]);
    }

    function updateEntry(id: string, patch: Partial<ConsoleEntry>) {
        setEntries(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
    }

    function clear() {
        setEntries([]);
    }

    function detectMode(input: string): 'playwright' | 'js' | 'pw' {
        const t = input.trim();
        const firstToken = t.split(/\s+/)[0].toLowerCase();
        if (PW_COMMANDS.has(firstToken)) return 'pw';
        if (t === 'page' || t.startsWith('page.') || t.startsWith('page[') ||
            t.startsWith('await page') ||
            t === 'expect' || t.startsWith('expect(') || t.startsWith('await expect(') ||
            t === 'crxApp' || t.startsWith('crxApp.') ||
            t === 'context' || t.startsWith('context.') || t.startsWith('await context') ||
            t === 'activeTabId') return 'playwright';
        // If it looks like a command name (word + optional hyphens, no JS operators),
        // route to pw so unknown commands return a proper error message.
        if (/^[a-z][\w-]*$/.test(firstToken) && !/[.()[\]=+`$;{}"']/.test(t)) return 'pw';
        return 'js';
    }

    async function execute(input: string) {
        const trimmed = input.trim();
        if (!trimmed) return;

        const id = Math.random().toString(36).slice(2);

        if (trimmed.startsWith('#')) {
            addEntry({ id, input: trimmed, status: 'done' });
            return;
        }
        if (trimmed.toLowerCase() === 'clear') {
            clear();
            return;
        }
        if (trimmed.toLowerCase() === 'help') {
            const lines = Object.entries(COMMANDS).map(([n, i]) => `  ${n.padEnd(22)} ${i.desc}`).join('\n');
            addEntry({ id, input: trimmed, status: 'done', text: `Available commands:\n${lines}` });
            return;
        }
        if (trimmed.toLowerCase() === 'history clear') {
            clearHistory();
            addEntry({ id, input: trimmed, status: 'done', text: 'History cleared.' });
            return;
        }
        if (trimmed.toLowerCase() === 'history') {
            const h = getCommandHistory();
            addEntry({ id, input: trimmed, status: 'done', text: h.length ? h.join('\n') : '(no history)' });
            return;
        }
        addCommand(trimmed);

        const mode = detectMode(trimmed);
        addEntry({ id, input: trimmed, status: 'pending' });

        try {
            const result = await (mode === 'playwright' ? executors.playwright(trimmed) : mode === 'pw' ? executors.pw(trimmed) : executors.js(trimmed)) as { value?: ConsoleEntry['value']; text?: string; image?: string; codeBlock?: string; getProperties?: ConsoleEntry['getProperties'] };
            updateEntry(id, { status: 'done', value: result.value, text: result.text, image: result.image, codeBlock: result.codeBlock, getProperties: result.getProperties });
        } catch (e: any) {
            const raw = e?.message ?? String(e);
            // Strip stack trace and verbose "Call log:" section from Playwright assertion errors
            const errorText = raw.split('\n    at ')[0].split('\nCall log:')[0].trim();
            updateEntry(id, { status: 'error', errorText });
        }
    }

    function addResult({ input, value, text, image, getProperties }: { input: string; value?: ConsoleEntry['value']; text?: string; image?: string; getProperties?: ConsoleEntry['getProperties'] }) {
        const id = Math.random().toString(36).slice(2);
        addEntry({ id, input, status: 'done', value, text, image, getProperties });
    }

    async function runScript(code: string) {
        const id = Math.random().toString(36).slice(2);
        addEntry({ id, input: '(run JS script)', status: 'pending' });
        try {
            const raw = await swDebugEval(code) as { result?: CdpRemoteObject };
            const r = raw?.result;
            let text: string;
            if (!r || r.type === 'undefined' || r.type === 'object' || r.type === 'function') text = 'Done';
            else if (r.type === 'string') text = r.value as string;
            else if (r.type === 'number' || r.type === 'boolean') text = String(r.value);
            else text = 'Done';
            updateEntry(id, { status: 'done', text });
        } catch (e: any) {
            const raw: string = e?.message ?? String(e);
            const errorText = raw.split('\n    at ')[0].split('\nCall log:')[0].trim();
            updateEntry(id, { status: 'error', errorText });
        }
    }

    return { entries, execute, clear, addResult, runScript };
}
