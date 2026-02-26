import { useRef, useMemo, useState, useEffect } from 'react';
import type { PanelState, Action } from "@/reducer";
import { executeCommand } from '@/lib/server';
import type { RecordedMessage } from '@/types';

interface ToolbarProps extends Pick<PanelState, 'editorContent' | 'fileName' | 'stepLine'> {
    dispatch: React.Dispatch<Action>
};

function Toolbar({ editorContent, fileName, stepLine, dispatch }: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isRecording, setIsRecording] = useState(false);

    const lines = useMemo(() => editorContent.split('\n'), [editorContent]);

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;

        const fileReader = new FileReader();

        fileReader.onload = () => {
            dispatch({ type: 'EDIT_EDITOR_CONTENT', content: fileReader.result as string })
            dispatch({ type: 'SET_FILENAME', fileName: file.name })
        }

        fileReader.onerror = () => {
            dispatch({ type: 'ADD_LINE', line: { text: 'Failed to read file', type: 'error' } })
        }
        fileReader.readAsText(file);
    }
    function handleFileOpen() {
        fileInputRef.current!.click();
    }
    async function handleSave() {
        const opts = {
            suggestedName: fileName || "commands-" + new Date().toISOString().slice(0, 19).replace(/:/g, '-') + ".pw",
            types: [
                {
                    description: "PW command files",
                    accept: { "text/plain": [".pw"] },
                },
            ],
        };
        try {
            const fileHandle: FileSystemFileHandle = await window.showSaveFilePicker(opts);
            const writable = await fileHandle.createWritable();
            await writable.write(editorContent);
            await writable.close();
            dispatch({ type: 'SET_FILENAME', fileName: fileHandle.name })
        } catch (e: unknown) {
            if (e instanceof Error && e.name !== 'AbortError') {
                dispatch({ type: 'ADD_LINE', line: { text: 'Save failed: ' + e.message, type: 'error' } })
            }
        }
    }

    async function runCommand(index: number, command: string) {
        // set current run line
        dispatch({ type: 'SET_RUN_LINE', currentRunLine: index });

        // Show what the user typed
        dispatch({ type: 'COMMAND_SUBMITTED', line: { text: command, type: 'command' } });
        try {
            const result = await executeCommand(command);
            dispatch({
                type: 'COMMAND_SUCCESS', line: {
                    text: result.text,
                    type: result.isError ? 'error' : 'success'
                }
            });
            dispatch({ type: 'SET_LINE_RESULT', index: index, result: result.isError ? 'fail' : 'pass' });
        } catch {
            dispatch({
                type: 'COMMAND_ERROR', line: {
                    text: 'Not connected to server. Run: playwright-repl --extension',
                    type: 'error'
                }
            });
            dispatch({ type: 'SET_LINE_RESULT', index: index, result: 'fail' });
        }
    }

    async function handleRun() {
        dispatch({ type: 'RUN_START' });
        for (let i = 0; i < lines.length; i++) {
            const trimmedValue = lines[i].trim();
            if (!lines[i].startsWith('#') && trimmedValue) {
                await runCommand(i, trimmedValue);
            }
        }
        dispatch({ type: 'RUN_STOP' })
    }

    function findExecutableIndex(fromIndex: number) {
        let excutableIndex = -1;
        for (let i = fromIndex; i < lines.length; i++) {
            if (!lines[i].startsWith('#') && lines[i].trim()) {
                excutableIndex = i;
                break;
            }
        }
        return excutableIndex;
    }
    async function handleStep() {
        if (stepLine === -1) {
            const nextStepLine = findExecutableIndex(0);
            if (nextStepLine !== -1) {
                dispatch({ type: 'STEP_INIT', stepLine: nextStepLine });
            }
            return;
        }
        await runCommand(stepLine, lines[stepLine].trim());
        const nextStepLine = findExecutableIndex(stepLine + 1);
        dispatch({ type: 'STEP_ADVANCE', stepLine: nextStepLine });

    }
    async function handleRecord() {
        if (!chrome.tabs?.query) return;
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const tab = tabs[0];
        if (!tab?.id) return;

        if (isRecording) {
            chrome.runtime.sendMessage({ type: "pw-record-stop", tabId: tab.id });
            setIsRecording(false);
        } else {
            const result = await chrome.runtime.sendMessage({ type: "pw-record-start", tabId: tab.id });
            if (result && !result.ok) {
                dispatch({ type: 'ADD_LINE', line: { text: 'Recording failed: ' + result.error, type: 'error' } });
                return;
            }
            setIsRecording(true);
        }
    }

    useEffect(() => {  
        const listener = (msg: RecordedMessage) => {
            if (msg.type === "pw-recorded-command" && msg.command) {
                dispatch({ type: 'ADD_LINE', line: { text: msg.command, type: 'command' } });
                dispatch({ type: 'APPEND_EDITOR_CONTENT', command: msg.command });
            }
        };
        if (!chrome.runtime?.onMessage) return;
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, []);

    return (
        <div id="toolbar">
            <div id="toolbar-left">
                <input
                    type="file"
                    accept='.pw,.txt'
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
                <button id="open-btn" title="Open .pw file" onClick={handleFileOpen}>Open</button>
                <button id="save-btn" title="Save as .pw file" disabled={!editorContent.trim()} onClick={handleSave}>Save</button>
                <span className="toolbar-sep"></span>
                <button
                    id="record-btn"
                    className={isRecording ? 'recording' : ''}
                    title={isRecording ? "Stop recording" : "Start Recording"}
                    onClick={handleRecord}
                >
                    {isRecording ? '⏹ Stop' : '⏺ Record'}
                </button>
                <button id="run-btn" title="Run script (Ctrl+Enter)" disabled={!editorContent.trim()} onClick={handleRun}>&#9654;</button>
                <button id="step-btn" title="Step: run next line" disabled={!editorContent.trim()} onClick={handleStep}>&#9655;</button>
                <button id="export-btn" title="Export as Playwright test" disabled>Export</button>
            </div>
            <div id="toolbar-right">
                <span id="file-info">{fileName}</span>
            </div>
        </div>
    )
}

export default Toolbar;