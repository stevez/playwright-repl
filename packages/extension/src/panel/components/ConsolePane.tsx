import { useState } from 'react'
import { OutputLine } from "@/types";
import { executeCommand } from '@/lib/server';
import { Action } from "@/reducer";

interface ConsolePaneProps {
    outputLines: OutputLine[]
    dispatch: React.Dispatch<Action>
}

function ConsolePane({outputLines, dispatch} : ConsolePaneProps) {
    const [input, setInput] = useState<string>('');

    async function handleSubmit() {
        if(!input.trim()) return;
        
        // Show what the user typed
        dispatch({ type: 'COMMAND_SUBMITTED', line: { text: input, type: 'command' }});
        try {
           const result = await executeCommand(input);
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
        setInput('');
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
            <div id="input-bar">
                <span id="prompt">pw&gt;</span>
                <div id="input-wrapper">
                    <div id="autocomplete-dropdown" hidden></div>
                    <span id="ghost-text"></span>
                    <input
                        type="text"
                        id="command-input"
                        value={input}
                        placeholder="Type a .pw command..."
                        autoComplete="off"
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if(e.key == 'Enter') {
                                handleSubmit()
                            }
                        }}
                        spellCheck={false} />
                </div>
            </div>
        </div>
    )
}

export default ConsolePane;