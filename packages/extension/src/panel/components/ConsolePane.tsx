import { OutputLine } from "@/types";
import { executeCommand } from '@/lib/server';
import { Action } from "@/reducer";
import CommandInput from './CommandInput';

interface ConsolePaneProps {
    outputLines: OutputLine[]
    dispatch: React.Dispatch<Action>
}

function ConsolePane({outputLines, dispatch} : ConsolePaneProps) {
    
    async function handleSubmit(command: string) {
        if(!command.trim()) return;
        
        // Show what the user typed
        dispatch({ type: 'COMMAND_SUBMITTED', line: { text: command, type: 'command' }});
        try {
           const result = await executeCommand(command);
           dispatch({type: 'COMMAND_SUCCESS', line: {
            text: result.text,
            type: result.isError ? 'error' : 'success'
           }});
        }catch {
            dispatch({ type: 'COMMAND_ERROR', line: {
            text: 'Not connected to server. Run: playwright-repl --extension',
            type: 'error'
        }});
        }
    }

    function handleClear() {
        dispatch({ type: 'CLEAR_CONSOLE'});
    }
    
    return (
        <div id="console-pane">
            <div id="console-header">  
                <span id="console-header-left">
                    <span id="console-title">Terminal</span>
                    <button id="console-clear-btn" title="Clear terminal" onClick={handleClear}>Clear</button>
                </span>
                <span id="console-stats"></span>
            </div>
            <div id="output">
                {outputLines.map((line, i) => (
                    <div key={i} className={`line line-${line.type}`}>{line.text}</div>
                ))}
            </div>
            <CommandInput onSubmit={handleSubmit} />
        </div>
    )
}

export default ConsolePane;