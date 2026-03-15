import { executeCommand } from '@/lib/bridge';
import { filterResponse } from '@/lib/filter';
import { COMMANDS, CATEGORIES, JS_CATEGORIES } from '@/lib/commands';
import type { CommandResult } from '@/types';
import type { Action } from '@/reducer';
import { getCommandHistory, clearHistory, addCommand } from '@/lib/command-history';
import { swDebugEval, swDebugEvalRaw, swGetProperties, swDebuggerEnable, swDebuggerDisable, swDebugPause, swDebugResume, onDebugPaused } from '@/lib/sw-debugger';
import { fromCdpRemoteObject } from '@/components/Console/cdpToSerialized';
import type { CdpRemoteObject } from '@/components/Console/cdpToSerialized';

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
    const trimmed = command.trim().toLowerCase();
    if (trimmed === 'help') {
        const pwLines = Object.entries(CATEGORIES)
            .map(([cat, cmds]) => `  ${cat}: ${cmds.join(', ')}`)
            .join('\n');
        const text = `Keyword commands (.pw mode):\n${pwLines}\n\nJavaScript mode:\n  Use Playwright API directly: await page.title(), page.locator('h1').click(), ...\n  Type "help js" for available Playwright methods\n\n  Type "help <command>" for details.`;
        dispatch({ type: 'ADD_LINE', line: { text, type: 'info' } });
        return true;
    }
    if (trimmed.startsWith('help ')) {
        const cmd = trimmed.slice(5).trim();
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
            return true;
        }
        const info = COMMANDS[cmd];
        if (!info) {
            dispatch({ type: 'ADD_LINE', line: { text: `Unknown command: "${cmd}". Type "help" for available commands.`, type: 'error' } });
            return true;
        }
        const parts = [`${cmd} — ${info.desc}`];
        if (info.usage) parts.push(`\n  Usage: ${info.usage}`);
        if (info.examples?.length) {
            parts.push(`  Examples:`);
            for (const ex of info.examples) parts.push(`    ${ex}`);
        }
        dispatch({ type: 'ADD_LINE', line: { text: parts.join('\n'), type: 'info' } });
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

    const lines = code.split('\n');
    const lineCount = lines.length;
    const sourceURL = 'pw-repl-debug.js';

    try {
        await swDebuggerEnable();

        // Pause before the first executed statement (skips hoisted declarations)
        await swDebugPause();

        let lastPausedLine = -1;
        onDebugPaused((line: number) => {
            if (line >= 0 && line < lineCount) {
                lastPausedLine = line;
                dispatch({ type: 'SET_RUN_LINE', currentRunLine: line });
            } else if (lastPausedLine < lineCount - 1) {
                // Jumped past user code (e.g. step-out) — show last user line
                lastPausedLine = lineCount - 1;
                dispatch({ type: 'SET_RUN_LINE', currentRunLine: lineCount - 1 });
            } else {
                // Already at last line, stepped past — finish
                swDebugResume().catch(() => {});
            }
        });

        const codeWithSource = code + '\n//# sourceURL=' + sourceURL;
        const result = await swDebugEvalRaw(codeWithSource);

        // 5. Handle result
        if (result.exceptionDetails) {
            const msg: string = result.exceptionDetails.exception?.description
                ?? result.exceptionDetails.text ?? 'Unknown error';
            if (msg.includes('terminated')) {
                dispatch({ type: 'ADD_LINE', line: { text: 'Stopped.', type: 'info' } });
            } else {
                dispatch({ type: 'COMMAND_ERROR', line: { text: trimStack(msg), type: 'error' } });
            }
        } else {
            const r = result.result;
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
        }
    } catch (e: any) {
        dispatch({ type: 'COMMAND_ERROR', line: { text: trimStack(e?.message ?? String(e)), type: 'error' } });
    } finally {
        onDebugPaused(null);
        await swDebuggerDisable().catch(() => {});
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
