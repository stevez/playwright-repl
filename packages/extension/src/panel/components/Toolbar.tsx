import { useRef, useMemo, useState, useEffect } from 'react';
import type { PanelState, Action } from "@/reducer";
import type { RecordedMessage } from '@/types';
import { exportToPlaywright } from '@/lib/converter';
import { checkHealth, setServerPort } from '@/lib/server';
import { runAndDispatch } from '@/lib/run';
import { getServerPort } from '@/lib/server';

interface ToolbarProps extends Pick<PanelState, 'editorContent' | 'fileName' | 'stepLine'> {
    dispatch: React.Dispatch<Action>
};

function Toolbar({ editorContent, fileName, stepLine, dispatch }: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [isRecording, setIsRecording] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [serverVersion, setServerVersion] = useState('');
    const [port, setPort] = useState(getServerPort());
    const [editingPort, setEditingPort] = useState(false);

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

        const result = await runAndDispatch(command, dispatch);
        dispatch({ type: 'SET_LINE_RESULT', index: index, result: result.isError ? 'fail' : 'pass' });
    }

    async function handleRun() {
        dispatch({ type: 'RUN_START' });
        for (let i = 0; i < lines.length; i++) {
            const trimmedValue = lines[i].trim();
            if (!lines[i].startsWith('#') && trimmedValue) {
                await runCommand(i, trimmedValue);
            }
        }
        dispatch({ type: 'ADD_LINE', line: { text: 'Run complete.', type: 'info' } });
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

    function handleExport() {
        const code = exportToPlaywright(lines);
        dispatch({ type: 'ADD_LINE', line: { text: code, type: 'code-block' } })
    }

    function commitPort(e: React.SyntheticEvent<HTMLInputElement>) {
        const val = parseInt(e.currentTarget.value, 10);
        if(val > 0 && val < 65535) {
            setPort(val);
            setServerPort(val);
        }
        setEditingPort(false);
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

    useEffect(() => {
        async function initialCheck() {
            try {
                const result = await checkHealth();
                setIsConnected(true);
                setServerVersion(result.version);
                dispatch({ type: 'ADD_LINE', line: { text: `Playwright REPL v${result.version}`, type: 'info' } });
                dispatch({ type: 'ADD_LINE', line: { text: `Connected to localhost:${port}`, type: 'success' } });
            } catch {
                setIsConnected(false);
                setServerVersion('');
                dispatch({ type: 'ADD_LINE', line: { text: 'Server not running.', type: 'error' } });
                dispatch({ type: 'ADD_LINE', line: { text: 'Start with: playwright-repl --extension', type: 'error' } });
            }
        }
        initialCheck();
    }, []);

    useEffect(() => {
        async function poll() {
            try {
                const result = await checkHealth();
                setIsConnected(true);
                setServerVersion(result.version);
            } catch {
               setIsConnected(false);
               setServerVersion('');
            }
        }
        const timer = setInterval(poll, 30000);
        return () => clearInterval(timer);
    }, [port]);

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
                <button id="run-btn" title="Run script (Ctrl+Enter)" disabled={!editorContent.trim() || !isConnected} onClick={handleRun}>&#9654;</button>
                <button id="step-btn" title="Step: run next line" disabled={!editorContent.trim() || !isConnected} onClick={handleStep}>&#9655;</button>
                <button id="export-btn" title="Export as Playwright test" disabled={!editorContent.trim()} onClick={handleExport}>Export</button>
            </div>
            <div id="toolbar-right">
                <span id="file-info">{fileName}</span>
                <span className="toolbar-sep"></span>
                <span
                    className="status-indicator"
                    title={isConnected ? `v${serverVersion} - localhost:${port}` : `Disconnected - click to change port`}
                    onClick={() => setEditingPort(true)}
                >
                    <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
                    { editingPort ? (
                        <input
                            className="port-input"
                            type="number"
                            defaultValue={port}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => commitPort(e)}
                            onKeyDown={(e) => {
                                if(e.key === "Enter") commitPort(e);
                                if(e.key === "Escape")setEditingPort(false);
                            }}

                        />
                    ) 
                    : (
                    <span className="status-label">:{port}</span>
                    )}
                </span>
            </div>
        </div>
    )
}

export default Toolbar;