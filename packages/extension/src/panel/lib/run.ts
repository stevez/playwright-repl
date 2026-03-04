import { executeCommand } from '@/lib/server';
import { filterResponse } from '@/lib/filter';
import { COMMANDS } from '@/lib/commands';
import type { CommandResult } from '@/types';
import type { Action } from '@/reducer';
import { getCommandHistory, clearHistory, addCommand } from '@/lib/command-history';

let cachedTabUrl: string | undefined;
export function setTabUrl(url: string | undefined) { cachedTabUrl = url; }

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
export async function runAndDispatch(command: string, dispatch: React.Dispatch<Action>): Promise<CommandResult> {
   
    if (!command.trim() || runLocalCommand(command, dispatch))
         return { text: '', isError: false };

    addCommand(command);
    dispatch({ type: 'COMMAND_SUBMITTED', line: { text: command, type: 'command' } });
    try {
        const result = await executeCommand(command, cachedTabUrl);
        const cmdName = command.trim().split(/\s+/)[0];
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
                text: 'Not connected to server. Run: playwright-repl --extension',
                type: 'error'
            }
        });
        return { text: '', isError: true };
    }
}
