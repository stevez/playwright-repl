import { executeCommand } from '@/lib/bridge';
import { filterResponse } from '@/lib/filter';
import { COMMANDS } from '@/lib/commands';
import type { CommandResult } from '@/types';
import type { Action } from '@/reducer';
import { getCommandHistory, clearHistory, addCommand } from '@/lib/command-history';
import { swDebugEval, swGetProperties } from '@/lib/sw-debugger';
import { fromCdpRemoteObject } from '@/components/Console/cdpToSerialized';
import type { CdpRemoteObject } from '@/components/Console/cdpToSerialized';
import { injectBreakpoints } from '@/lib/js-step-transform';

function trimStack(msg: string): string {
    return msg.split('\n    at ')[0].split('\nCall log:')[0].trim();
}

function runLocalCommand(command: string, dispatch: React.Dispatch<Action>): boolean {
    if (command.trim().startsWith('#')) {
        dispatch({ type: 'ADD_LINE', line: { text: command, type: 'comment' } });
        return true;
    }
    if (command.trim().toLowerCase() === 'clear') {
        dispatch({ type: 'CLEAR_CONSOLE' });
        return true;
    }
    if (command.trim().toLowerCase() === 'help') {
        const lines = Object.entries(COMMANDS)
            .map(([name, info]) => `  ${name.padEnd(22)} ${info.desc}`)
            .join('\n');
        dispatch({ type: 'ADD_LINE', line: { text: `Available commands:\n${lines}`, type: 'info' } });
        return true;
    }
    if (command.trim().toLowerCase() === 'history clear') {
        clearHistory();
        dispatch({ type: 'ADD_LINE', line: { text: 'History cleared.', type: 'info' } });
        return true;
    }
    if (command.trim().toLowerCase() === 'history') {
        const history = getCommandHistory();
        const text = history.length ? history.join('\n') : '(no history)';
        dispatch({ type: 'ADD_LINE', line: { text, type: 'info'} });
        return true;
    }

    return false;
}

export async function runJsScript(code: string, dispatch: React.Dispatch<Action>): Promise<void> {
    dispatch({ type: 'COMMAND_SUBMITTED', line: { text: '(run JS script)', type: 'command' } });
    try {
        const raw = await swDebugEval(code) as { result?: CdpRemoteObject };
        const r = raw?.result;
        if (!r || r.type === 'undefined') {
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success' } });
        } else if (r.type === 'string') {
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: r.value as string, type: 'success' } });
        } else if (r.type === 'number' || r.type === 'boolean') {
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: String(r.value), type: 'success' } });
        } else {
            const value = fromCdpRemoteObject(r);
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: '', type: 'success', value, getProperties: swGetProperties } });
        }
    } catch (e: any) {
        const text = trimStack(e?.message ?? String(e));
        dispatch({ type: 'COMMAND_ERROR', line: { text, type: 'error' } });
    }
}

export async function runJsScriptStep(code: string, dispatch: React.Dispatch<Action>): Promise<void> {
    dispatch({ type: 'COMMAND_SUBMITTED', line: { text: '(debug JS script)', type: 'command' } });
    const transformed = injectBreakpoints(code);
    try {
        const raw = await swDebugEval(transformed) as { result?: CdpRemoteObject };
        const r = raw?.result;
        if (!r || r.type === 'undefined') {
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success' } });
        } else if (r.type === 'string') {
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: r.value as string, type: 'success' } });
        } else if (r.type === 'number' || r.type === 'boolean') {
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: String(r.value), type: 'success' } });
        } else {
            const value = fromCdpRemoteObject(r);
            dispatch({ type: 'COMMAND_SUCCESS', line: { text: '', type: 'success', value, getProperties: swGetProperties } });
        }
    } catch (e: any) {
        const msg: string = e?.message ?? String(e);
        if (msg.includes('__debug_stopped__')) {
            dispatch({ type: 'ADD_LINE', line: { text: 'Stopped.', type: 'info' } });
        } else {
            dispatch({ type: 'COMMAND_ERROR', line: { text: trimStack(msg), type: 'error' } });
        }
    }
}

export async function runAndDispatch(command: string, dispatch: React.Dispatch<Action>): Promise<CommandResult> {

    if (!command.trim() || runLocalCommand(command, dispatch))
         return { text: '', isError: false };

    addCommand(command);
    dispatch({ type: 'COMMAND_SUBMITTED', line: { text: command, type: 'command' } });

    // run-code is handled via swDebugEval (background service worker runtime)
    const cmdName = command.trim().split(/\s+/)[0].toLowerCase();
    if (cmdName === 'run-code') {
        const code = command.trim().slice('run-code'.length).trim();
        try {
            const raw = await swDebugEval(code) as { result?: CdpRemoteObject };
            const r = raw?.result;
            let text: string;
            if (!r || r.type === 'undefined' || r.type === 'object' || r.type === 'function') text = 'Done';
            else if (r.type === 'string') text = r.value as string;
            else if (r.type === 'number' || r.type === 'boolean') text = String(r.value);
            else text = 'Done';
            dispatch({ type: 'COMMAND_SUCCESS', line: { text, type: 'success' } });
            return { text, isError: false };
        } catch (e: any) {
            const text = trimStack(e?.message ?? String(e));
            dispatch({ type: 'COMMAND_SUCCESS', line: { text, type: 'error' } });
            return { text, isError: true };
        }
    }

    try {
        const result = await executeCommand(command);
        const text = filterResponse(result.text, cmdName);
        if (cmdName === 'snapshot') {
            dispatch({ type: 'COMMAND_SUCCESS', line: { text, type: 'snapshot' } });
        } else {
            dispatch({
                type: 'COMMAND_SUCCESS', line: {
                    text,
                    type: result.isError ? 'error' : result.image ? 'screenshot' : 'success',
                    image: result.image
                }
            });
        }
        return result;
    } catch {
        dispatch({
            type: 'COMMAND_ERROR', line: {
                text: 'Command failed. Try clicking Attach first.',
                type: 'error'
            }
        });
        return { text: '', isError: true };
    }
}
