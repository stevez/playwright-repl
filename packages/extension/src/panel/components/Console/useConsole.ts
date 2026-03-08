import type { ConsoleEntry } from './types';
import { COMMANDS } from '@/lib/commands';
import { addCommand, getCommandHistory, clearHistory } from '@/lib/command-history';
import { swDebugEval, swGetProperties } from '@/lib/sw-debugger';
import { cdpEvaluate, executeCommandForConsole } from '@/lib/bridge';
import { fromCdpRemoteObject, type CdpRemoteObject } from './cdpToSerialized';
import { detectMode } from '@/lib/execute';
import { runJsScript } from '@/lib/run';
import type { Action } from '@/reducer';
import type React from 'react';

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

export function useConsole(dispatch: React.Dispatch<Action>) {

    async function execute(input: string) {
        const trimmed = input.trim();
        if (!trimmed) return;

        if (trimmed.startsWith('#')) {
            dispatch({ type: 'ADD_LINE', line: { text: trimmed, type: 'comment' } });
            return;
        }
        if (trimmed.toLowerCase() === 'help') {
            const lines = Object.entries(COMMANDS).map(([n, i]) => `  ${n.padEnd(22)} ${i.desc}`).join('\n');
            dispatch({ type: 'ADD_LINE', line: { text: `Available commands:\n${lines}`, type: 'info' } });
            return;
        }
        if (trimmed.toLowerCase() === 'history clear') {
            clearHistory();
            dispatch({ type: 'ADD_LINE', line: { text: 'History cleared.', type: 'info' } });
            return;
        }
        if (trimmed.toLowerCase() === 'history') {
            const h = getCommandHistory();
            dispatch({ type: 'ADD_LINE', line: { text: h.length ? h.join('\n') : '(no history)', type: 'info' } });
            return;
        }

        addCommand(trimmed);

        const mode = detectMode(trimmed);
        dispatch({ type: 'COMMAND_SUBMITTED', line: { text: trimmed, type: 'command' } });

        try {
            const result = await (mode === 'playwright' ? executors.playwright(trimmed) : mode === 'pw' ? executors.pw(trimmed) : executors.js(trimmed)) as { value?: ConsoleEntry['value']; text?: string; image?: string; codeBlock?: string; getProperties?: ConsoleEntry['getProperties'] };
            if (result.value !== undefined) {
                dispatch({ type: 'COMMAND_SUCCESS', line: { text: '', type: 'success', value: result.value, getProperties: result.getProperties } });
            } else if (result.image !== undefined) {
                dispatch({ type: 'COMMAND_SUCCESS', line: { text: '', type: 'screenshot', image: result.image } });
            } else if (result.codeBlock !== undefined) {
                dispatch({ type: 'COMMAND_SUCCESS', line: { text: result.codeBlock, type: 'snapshot' } });
            } else {
                dispatch({ type: 'COMMAND_SUCCESS', line: { text: result.text ?? 'Done', type: 'success' } });
            }
        } catch (e: any) {
            const raw = e?.message ?? String(e);
            const errorText = raw.split('\n    at ')[0].split('\nCall log:')[0].trim();
            dispatch({ type: 'COMMAND_ERROR', line: { text: errorText, type: 'error' } });
        }
    }

    function addResult({ input, value, text, image, getProperties }: { input: string; value?: ConsoleEntry['value']; text?: string; image?: string; getProperties?: ConsoleEntry['getProperties'] }) {
        dispatch({ type: 'COMMAND_SUBMITTED', line: { text: input, type: 'command' } });
        dispatch({
            type: 'COMMAND_SUCCESS',
            line: {
                text: text ?? '',
                type: image ? 'screenshot' : 'success',
                image,
                value,
                getProperties,
            }
        });
    }

    async function runScript(code: string) {
        await runJsScript(code, dispatch);
    }

    return { execute, addResult, runScript };
}
