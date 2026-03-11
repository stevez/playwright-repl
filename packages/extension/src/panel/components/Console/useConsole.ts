import type { ConsoleEntry } from './types';
import { COMMANDS, CATEGORIES, JS_CATEGORIES } from '@/lib/commands';
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
            const pwLines = Object.entries(CATEGORIES)
                .map(([cat, cmds]) => `  ${cat}: ${cmds.join(', ')}`)
                .join('\n');
            const text = `Keyword commands (.pw mode):\n${pwLines}\n\nJavaScript mode:\n  Use Playwright API directly: await page.title(), page.locator('h1').click(), ...\n  Type "help js" for available Playwright methods\n\n  Type "help <command>" for details.`;
            dispatch({ type: 'ADD_LINE', line: { text, type: 'info' } });
            return;
        }
        if (trimmed.toLowerCase().startsWith('help ')) {
            const cmd = trimmed.slice(5).trim().toLowerCase();
            if (cmd === 'js' || cmd === 'javascript') {
                const jsLines = Object.entries(JS_CATEGORIES)
                    .map(([cat, methods]) => `  ${cat}: ${methods.join(', ')}`)
                    .join('\n');
                const globals = [
                    '  Available globals:',
                    '    page      — Playwright Page object (active browser tab)',
                    '    context   — Playwright BrowserContext (cookies, pages, routes)',
                    '    expect    — Playwright assertion (expect(locator).toBeVisible())',
                    '    document  — DOM document (inside page.evaluate())',
                    '    window    — Browser window (inside page.evaluate())',
                ].join('\n');
                const text = `JavaScript mode — Playwright API:\n  Prefix with await for async methods\n\n${globals}\n\n${jsLines}`;
                dispatch({ type: 'ADD_LINE', line: { text, type: 'info' } });
                return;
            }
            const info = COMMANDS[cmd];
            if (!info) {
                dispatch({ type: 'ADD_LINE', line: { text: `Unknown command: "${cmd}". Type "help" for available commands.`, type: 'error' } });
                return;
            }
            const parts = [`${cmd} — ${info.desc}`];
            if (info.usage) parts.push(`\n  Usage: ${info.usage}`);
            if (info.examples?.length) {
                parts.push(`  Examples:`);
                for (const ex of info.examples) parts.push(`    ${ex}`);
            }
            dispatch({ type: 'ADD_LINE', line: { text: parts.join('\n'), type: 'info' } });
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
