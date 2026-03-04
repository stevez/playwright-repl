import { useState, useRef, useEffect } from 'react';
import { OutputLine } from "@/types";
import { Action } from "@/reducer";
import Lightbox from '@/components/Lightbox';
import { saveImageToFile } from '@/lib/file-utils';

interface ConsolePaneProps {
    outputLines: OutputLine[]
    passCount: number
    failCount: number
    dispatch: React.Dispatch<Action>
}

const lineStyles: Record<string, string> = {
    command: "text-(--color-command) before:content-['>_'] before:text-(--color-success)",
    success: "text-(--color-success) before:content-['✓_']",
    error: "text-(--color-error) before:content-['✗_']",
    info: "text-(--text-default)",
    comment: "text-(--color-comment) italic",
    snapshot: "text-(--color-snapshot) text-[12px]",
};

function ConsolePane({ outputLines, passCount, failCount, dispatch }: ConsolePaneProps) {
    const [lightBoxImage, setLightBoxImage ] = useState<string | undefined>(undefined);
    const outputRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [outputLines]);

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
                    <div key={i} className="relative border border-solid border-(--border-primary) rounded-[4px] my-[6px] mx-0 bg-(--bg-line-highlight)">
                        <pre className="m-0 py-2 px-3 text-(--color-command) font-[inherit] text-[12px] leading-4 whitespace-pre-wrap wrap-break-word">
                            {line.text}
                        </pre>
                        <button className="absolute top-1 right-1 bg-(--bg-button) text-(--text-default) border border-solid border-(--border-button) rounded-[3px] py-[2px] px-2 font-[inherit] text-[10px] cursor-pointer hover:bg-(--bg-button-hover)" onClick={() => navigator.clipboard.writeText(line.text)}>Copy</button>
                    </div>);
            case 'screenshot':
                return (
                    <div key={i} className="relative inline-block my-[6px] mx-0 group">
                        <img src={line.image} className='max-w-100 border border-solid border-(--border-screenshot) rounded-t-[4px] block cursor-zoom-in group-hover:opacity-85' onClick={() => openLightbox(line.image)} />
                        <span className="absolute top-[50%] left-[50%] -translate-x-1/2 -translate-y-1/2 bg-black/60 text-white text-[11px] py-1 px-[10px] rounded-[4px] pointer-events-none opacity-0 transition-opacity duration-150 group-hover:opacity-100">Click to enlarge</span>
                        <div className="flex justify-end py-1 px-1.5 bg-(--bg-toolbar) border border-solid border-(--border-screenshot) border-t-0 rounded-b-[4px]">
                            <button className="bg-(--bg-button) text-(--text-default) border border-solid border-(--border-button) rounded-[3px] py-[2px] px-2 font-[inherit] text-[10px] cursor-pointer hover:bg-(--bg-button-hover)" onClick={() => saveScreenshot(line.image)}>Save</button>
                        </div>
                    </div>);
            case 'snapshot':
                 return (
                      <pre key={i} className={`py-[1px] ${lineStyles[line.type] ?? ''}`} data-type={line.type}>{line.text}</pre>
                 );
            default:
                return (
                    <div key={i} className={`py-[1px] ${lineStyles[line.type] ?? ''}`} data-type={line.type}>{line.text}</div>
                );
        }
    }
    return (
        <>
        <div id="console-pane" className='flex flex-col flex-1 min-h-[80px] overflow-hidden'>
            <div id="console-header" className='flex justify-between items-center py-1 px-3 bg-(--bg-toolbar) border-b border-solid border-(--border-primary) shrink-0 text-[11px]'>
                <span id="console-header-left" className='flex items-center gap-2'>
                    <span id="console-title" className='text-(--text-default) text-[12px] font-semibold'>Terminal</span>
                    <button id="console-clear-btn" className="bg-transparent border-none text-(--text-dim) font-[inherit] text-[11px] cursor-pointer py-[1px] px-1.5 rounded-[3px] hover:text-(--text-default) hover:bg-(--bg-button)" title="Clear terminal" onClick={handleClear} onMouseDown={(e) => e.preventDefault()}>Clear</button>
                </span>
                    <span id="console-stats" className='text-(--text-dim)'>
                        {
                            (passCount > 0 || failCount > 0) && (
                                <>
                                    <span className="text-(--color-success)">{passCount} passed</span>
                                    {' / '}
                                    <span className="text-(--color-error)">{failCount} failed</span>
                                </>
                            )
                        }
                </span>
                
            </div>
            <div id="output" ref={outputRef} data-testid="output" className='flex-1 overflow-y-auto py-2 px-3 whitespace-pre-wrap wrap-break-word'>
                {outputLines.map(renderLine)}
            </div>
        </div>
        { lightBoxImage && 
            <Lightbox image={lightBoxImage} onClose={()=> setLightBoxImage(undefined)} />
        }
        </>
    )
}

export default ConsolePane;