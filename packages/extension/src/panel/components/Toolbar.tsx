import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import type { PanelState, Action } from "@/reducer";
import { exportToPlaywright, jsonlToRepl } from '@/lib/converter';
import { connectWithRetry, attachToTab } from '@/lib/bridge';
import { runAndDispatch } from '@/lib/run';
import { SunIcon, MoonIcon, FolderOpenIcon, SaveIcon, RecordIcon, StopIcon, ExportIcon } from './Icons';

interface ToolbarProps extends Pick<PanelState, 'editorContent' | 'fileName' | 'stepLine' | 'attachedUrl' | 'isAttaching'> {
    dispatch: React.Dispatch<Action>,
};

function Toolbar({ editorContent, fileName, stepLine, attachedUrl, isAttaching, dispatch }: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recorderPortRef = useRef<chrome.runtime.Port | null>(null);
    const prevActionCountRef = useRef(0);
    const [isRecording, setIsRecording] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === 'dark');
    const [availableTabs, setAvailableTabs] = useState<chrome.tabs.Tab[]>([]);

    const lines = useMemo(() => editorContent.split('\n'), [editorContent]);

    // ─── Tab switcher ───

    async function loadTabs() {
        if (!chrome.tabs?.query) return;
        const tabs = await chrome.tabs.query({});
        setAvailableTabs(tabs.filter(t =>
            t?.url &&
            !t.url.startsWith('chrome://') &&
            !t.url.startsWith('chrome-extension://') &&
            !t.url.startsWith('about:')
        ));
    }

    useEffect(() => { loadTabs(); }, []);

    async function handleTabChange(tabId: number) {
        dispatch({ type: 'ATTACH_START' });
        const res = await attachToTab(tabId);
        if (res.ok && res.url) dispatch({ type: 'ATTACH_SUCCESS', url: res.url });
        else dispatch({ type: 'ATTACH_FAIL' });
    }

    // ─── File operations ───

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
            types: [{ description: "PW command files", accept: { "text/plain": [".pw"] } }],
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

    // ─── Run / Step ───

    async function runCommand(index: number, command: string) {
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
        let executableIndex = -1;
        for (let i = fromIndex; i < lines.length; i++) {
            if (!lines[i].startsWith('#') && lines[i].trim()) {
                executableIndex = i;
                break;
            }
        }
        return executableIndex;
    }

    async function handleStep() {
        if (stepLine === -1) {
            const nextStepLine = findExecutableIndex(0);
            if (nextStepLine !== -1) dispatch({ type: 'STEP_INIT', stepLine: nextStepLine });
            return;
        }
        await runCommand(stepLine, lines[stepLine].trim());
        const nextStepLine = findExecutableIndex(stepLine + 1);
        dispatch({ type: 'STEP_ADVANCE', stepLine: nextStepLine });
    }

    // ─── Recording (crx port-based) ───

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleRecordedSources = useCallback((sources: any[]) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const source = sources.find((s: any) => s.id === 'jsonl') || sources[0];
        if (!source?.actions?.length) return;
        const newActions = (source.actions as string[]).slice(prevActionCountRef.current);
        prevActionCountRef.current = source.actions.length;
        for (const a of newActions) {
            try {
                dispatch({ type: 'ADD_LINE', line: { text: JSON.stringify(JSON.parse(a), null, 2), type: 'code-block' } });
            } catch {
                dispatch({ type: 'ADD_LINE', line: { text: a, type: 'info' } });
            }
        }
        const replLines = (source.actions as string[])
            .map((a: string) => jsonlToRepl(a, false))
            .filter(Boolean) as string[];
        if (replLines.length > 0) {
            dispatch({ type: 'EDIT_EDITOR_CONTENT', content: replLines.join('\n') });
        }
    }, [dispatch]);

    async function handleRecord() {
        if (!chrome.tabs?.query) return;

        if (isRecording) {
            const port = recorderPortRef.current;
            recorderPortRef.current = null;
            setIsRecording(false);
            chrome.runtime.sendMessage({ type: 'record-stop' }).catch(() => {});
            port?.disconnect();
            dispatch({ type: 'ADD_LINE', line: { text: 'Recording stopped.', type: 'command' } });
            return;
        }

        const result = await chrome.runtime.sendMessage({ type: 'record-start' });
        if (!result?.ok) {
            dispatch({ type: 'ADD_LINE', line: { text: `Recording failed: ${result?.error ?? 'unknown error'}`, type: 'error' } });
            return;
        }

        try {
            recorderPortRef.current = await connectWithRetry();
        } catch {
            dispatch({ type: 'ADD_LINE', line: { text: 'Recording failed: could not connect to recorder.', type: 'error' } });
            return;
        }

        setIsRecording(true);
        prevActionCountRef.current = 0;

        if (result.url && result.url !== 'about:blank') {
            dispatch({ type: 'APPEND_EDITOR_CONTENT', command: `goto "${result.url}"` });
        }

        dispatch({ type: 'ADD_LINE', line: { text: 'Recording started. Interact with the page...', type: 'command' } });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recorderPortRef.current!.onMessage.addListener((msg: any) => {
            if (msg.type === 'recorder' && msg.method === 'setSources') {
                handleRecordedSources(msg.sources);
            }
        });

        recorderPortRef.current!.onDisconnect.addListener(() => {
            recorderPortRef.current = null;
            setIsRecording(false);
        });
    }

    // ─── Export ───

    function handleExport() {
        const code = exportToPlaywright(lines);
        dispatch({ type: 'ADD_LINE', line: { text: code, type: 'code-block' } })
    }

    // ─── Theme toggle ───

    useEffect(() => {
        document.documentElement.classList.toggle('theme-dark', isDarkMode);
        localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    }, [isDarkMode]);

    return (
        <div id="toolbar" className="flex flex-wrap gap-1 justify-between items-center py-1 px-2 bg-(--bg-toolbar) border-b border-solid border-(--border-primary) shrink-0">
            <div id="toolbar-left" className="flex flex-wrap gap-1 items-center">
                <input
                    type="file"
                    accept='.pw,.txt'
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileChange}
                />
                <button id="open-btn" title="Open .pw file" onClick={handleFileOpen}><FolderOpenIcon /></button>
                <button id="save-btn" title="Save as .pw file" disabled={!editorContent.trim()} onClick={handleSave}><SaveIcon /></button>
                <span className="w-[1px] h-[18px] bg-(--color-toolbar-sep) mx-1"></span>
                <button
                    id="record-btn"
                    data-testid="record-btn"
                    className={isRecording ? 'recording' : ''}
                    title={isRecording ? "Stop recording" : "Start Recording"}
                    onClick={handleRecord}
                >
                    {isRecording ? <StopIcon /> : <RecordIcon />}
                </button>
                <button id="run-btn" data-testid="run-btn" title="Run script (Ctrl+Enter)" disabled={!editorContent.trim()} onClick={handleRun}>&#9654;</button>
                <button id="step-btn" title="Step: run next line" disabled={!editorContent.trim()} onClick={handleStep}>&#9655;</button>
                <button id="export-btn" title="Export as Playwright test" disabled={!editorContent.trim()} onClick={handleExport}><ExportIcon /></button>
                <button onClick={() => setIsDarkMode(prev => !prev)} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                    {isDarkMode ? <SunIcon /> : <MoonIcon />}
                </button>
            </div>
            <div id="toolbar-right" className="flex items-center gap-2">
                <select
                    value={attachedUrl ?? ''}
                    title="Switch tab"
                    onFocus={loadTabs}
                    onChange={e => {
                        const tabId = availableTabs.find(t => t.url === e.target.value)?.id;
                        if (tabId) handleTabChange(tabId);
                    }}
                >
                    {availableTabs.map(tab => (
                        <option key={tab.id} value={tab.url}>{new URL(tab.url!).hostname}</option>
                    ))}
                </select>
                <div
                    className="flex items-center gap-1 text-[11px] text-(--text-dim)"
                    data-testid="status-indicator"
                >
                    <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${isAttaching ? 'bg-yellow-400' : attachedUrl ? 'bg-(--color-success)' : 'bg-(--color-error)'}`}
                        data-testid="status-dot"
                        data-status={isAttaching ? 'attaching' : attachedUrl ? 'connected' : 'disconnected'}
                        title={isAttaching ? 'Connecting...' : attachedUrl ? `Attached: ${attachedUrl}` : 'Not attached'}
                    />
                    {attachedUrl
                        ? <span className="max-w-[160px] truncate" title={attachedUrl}>{attachedUrl.replace(/^https?:\/\//, '')}</span>
                        : <span>{isAttaching ? 'Connecting...' : 'Not attached'}</span>
                    }
                </div>
                <span id="file-info" className="text-(--text-dim) text-[11px]">{fileName}</span>
            </div>
        </div>
    )
}

export default Toolbar;
