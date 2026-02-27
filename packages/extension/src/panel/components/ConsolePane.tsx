import { useState } from 'react';
import { OutputLine } from "@/types";
import { executeCommand } from '@/lib/server';
import { Action } from "@/reducer";
import CommandInput from './CommandInput';
import Lightbox from '@/components/Lightbox';
import { saveImageToFile } from '@/lib/file-utils';
import { filterResponse } from '@/lib/filter';

interface ConsolePaneProps {
    outputLines: OutputLine[]
    passCount: number
    failCount: number
    dispatch: React.Dispatch<Action>
}

function ConsolePane({ outputLines, passCount, failCount, dispatch }: ConsolePaneProps) {
    const [lightBoxImage, setLightBoxImage ] = useState<string | undefined>(undefined);

    async function handleSubmit(command: string) {
        if (!command.trim()) return;

        if (command.trim().startsWith('#')) {
             dispatch({ type: 'ADD_LINE', line: { text: command, type: 'comment' } });
             return;
        }
        if (command.trim().toLowerCase() === 'clear') {
            dispatch({ type: 'CLEAR_CONSOLE'});
            return;
        }
        // Show what the user typed
        dispatch({ type: 'COMMAND_SUBMITTED', line: { text: command, type: 'command' } });
        try {
            const result = await executeCommand(command);
            const cmdName = command.trim().split(/\s+/)[0];
            const text = filterResponse(result.text, cmdName);
            dispatch({
                type: 'COMMAND_SUCCESS', line: {
                    text,
                    type: result.isError ? 'error' : result.image? 'screenshot' : 'success',
                    image: result.image
                }
            });
        } catch {
            dispatch({
                type: 'COMMAND_ERROR', line: {
                    text: 'Not connected to server. Run: playwright-repl --extension',
                    type: 'error'
                }
            });
        }
    }

    function handleClear() {
        dispatch({ type: 'CLEAR_CONSOLE' });
    }

    function openLightbox(image: string | undefined) {
        setLightBoxImage(image);
    }

    function saveScreenshot(image: string | undefined) {
        saveImageToFile(image);
    }
    function renderLine(line: OutputLine, i: number) {
        switch (line.type) {
            case 'code-block':
                return (
                    <div key={i} className="code-block">
                        <pre className="code-content">
                            {line.text}
                        </pre>
                        <button className="code-copy-btn" onClick={() => navigator.clipboard.writeText(line.text)}>Copy</button>
                    </div>);
            case 'screenshot':
                return (
                    <div key={i} className="screenshot-block">
                        <img src={line.image} onClick={() => openLightbox(line.image)} />
                        <span className="screenshot-zoom-hint">Click to enlarge</span>
                        <div className="screenshot-actions">
                            <button className="screenshot-btn" onClick={() => saveScreenshot(line.image)}>Save</button>
                        </div>
                    </div>);
            default:
                return (
                    <div key={i} className={`line line-${line.type}`}>{line.text}</div>
                );
        }
    }
    return (
        <>
        <div id="console-pane">
            <div id="console-header">
                <span id="console-header-left">
                    <span id="console-title">Terminal</span>
                    <button id="console-clear-btn" title="Clear terminal" onClick={handleClear}>Clear</button>
                </span>
                    <span id="console-stats">
                        {
                            (passCount > 0 || failCount > 0) && (
                                <>
                                    <span className="pass-count">{passCount} passed</span>
                                    {' / '}
                                    <span className="fail-count">{failCount} failed</span>
                                </>
                            )
                        }
                </span>
                
            </div>
            <div id="output">
                {outputLines.map(renderLine)}
            </div>
            <CommandInput onSubmit={handleSubmit} />
        </div>
        { lightBoxImage && 
            <Lightbox image={lightBoxImage} onClose={()=> setLightBoxImage(undefined)} />
        }
        </>
    )
}

export default ConsolePane;