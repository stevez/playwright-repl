import { executeCommand } from '@/lib/server';
import { filterResponse } from '@/lib/filter';
import type { CommandResult } from '@/types';
import type { Action } from '@/reducer';

export async function runAndDispatch(command: string, dispatch: React.Dispatch<Action>): Promise<CommandResult> {
    dispatch({ type: 'COMMAND_SUBMITTED', line: { text: command, type: 'command' } });
    try {
        const result = await executeCommand(command);
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
