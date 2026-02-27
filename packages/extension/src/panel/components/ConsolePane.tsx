import { useState, useRef, useEffect } from 'react';
import { OutputLine } from "@/types";
import { Action } from "@/reducer";
import CommandInput from './CommandInput';
import Lightbox from '@/components/Lightbox';
import { saveImageToFile } from '@/lib/file-utils';
import { runAndDispatch } from '@/lib/run';

interface ConsolePaneProps {
    outputLines: OutputLine[]
    passCount: number
    failCount: number
    dispatch: React.Dispatch<Action>
}

function ConsolePane({ outputLines, passCount, failCount, dispatch }: ConsolePaneProps) {
    const [lightBoxImage, setLightBoxImage ] = useState<string | undefined>(undefined);
    const outputRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [outputLines]);

    async function handleSubmit(command: string) {
        await runAndDispatch(command, dispatch);
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
            case 'snapshot':
                 return (
                      <pre key={i} className={`line line-${line.type}`}>{line.text}</pre>
                 );
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
            <div id="output" ref={outputRef}>
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