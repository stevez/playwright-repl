import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import type { PanelState, Action } from "@/reducer";
import { jsonlToRepl } from '@/lib/converter';
import { connectWithRetry, attachToTab } from '@/lib/bridge';
import { runAndDispatch, runJsScript, runJsScriptStep } from '@/lib/run';
import { SunIcon, MoonIcon, FolderOpenIcon, SaveIcon, RecordIcon, StopIcon, StepForwardIcon, AbortIcon } from './Icons';
import type { EditorHandle } from './CodeMirrorEditorPane';

interface ToolbarProps extends Pick<PanelState, 'editorContent' | 'editorMode' | 'stepLine' | 'attachedUrl' | 'attachedTabId' | 'isAttaching' | 'isRunning' | 'isStepDebugging'> {
    dispatch: React.Dispatch<Action>,
    editorRef: React.RefObject<EditorHandle | null>,
};

function Toolbar({ editorContent, editorMode, stepLine, attachedUrl, attachedTabId, isAttaching, isRunning, isStepDebugging, dispatch, editorRef }: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recorderPortRef = useRef<chrome.runtime.Port | null>(null);
    const prevActionCountRef = useRef(0);
    const cancelRunRef = useRef(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem("theme") === 'dark');
    const [availableTabs, setAvailableTabs] = useState<chrome.tabs.Tab[]>([]);
    const [canAttach, setCanAttach] = useState(true);
    const [selectedTabId, setSelectedTabId] = useState<number | null>(null);

    const lines = useMemo(() => editorContent.split('\n'), [editorContent]);

    // ─── Tab switcher ───

    function isInternalUrl(url: string | undefined) {
        if (!url) return true;
        return url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:');
    }

    function getTabLabel(tab: chrome.tabs.Tab): string {
        try {
            const url = new URL(tab.url!);
            if (url.protocol === 'chrome:') return `chrome://${url.hostname}`;
            return url.hostname;
        } catch {
            return tab.url ?? '(unknown)';
        }
    }

    async function loadTabs() {
        if (!chrome.tabs?.query) return;
        const tabs = await chrome.tabs.query({});
        // Keep chrome:// tabs (to preserve tab order) but exclude chrome-extension:// and about: tabs
        setAvailableTabs(tabs.filter(t => t?.url && !t.url.startsWith('chrome-extension://') && !t.url.startsWith('about:')));
    }

    async function checkActiveTab() {
        if (!chrome.tabs?.query) return;
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        setCanAttach(!isInternalUrl(tab?.url));
    }

    useEffect(() => {
        loadTabs();
        checkActiveTab();
        if (!chrome.tabs?.onActivated) return;
        const onActivated = () => { setSelectedTabId(null); checkActiveTab(); };
        chrome.tabs.onActivated.addListener(onActivated);
        return () => chrome.tabs.onActivated.removeListener(onActivated);
    }, []);

    async function doAttach(tabId: number) {
        dispatch({ type: 'ATTACH_START' });
        const res = await attachToTab(tabId);
        if (res.ok && res.url) {
            dispatch({ type: 'ATTACH_SUCCESS', url: res.url, tabId });
            setSelectedTabId(null); // attachedTabId takes over in dropdown
        } else {
            dispatch({ type: 'ATTACH_FAIL' });
            dispatch({ type: 'ADD_LINE', line: { text: `Attach failed: ${res.error ?? 'unknown error'}`, type: 'error' } });
            // keep selectedTabId so dropdown stays on the failed tab
        }
    }

    async function handleTabChange(tabId: number) {
        const tab = availableTabs.find(t => t.id === tabId);
        setSelectedTabId(tabId); // show in dropdown immediately
        if (tab && isInternalUrl(tab.url)) return; // internal: Attach disabled, don't try
        await doAttach(tabId);
    }

    // ─── Attach ───

    async function handleAttach() {
        // Reconnect to the tab shown in the dropdown; only use browser's active tab when nothing is selected/attached
        const targetTabId = selectedTabId ?? attachedTabId;
        if (targetTabId !== null) {
            const tab = availableTabs.find(t => t.id === targetTabId);
            if (tab && isInternalUrl(tab.url)) return;
            await doAttach(targetTabId);
            return;
        }
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id || isInternalUrl(tab.url)) return;
        await doAttach(tab.id);
    }

    // ─── File operations ───

    function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        if (!file) return;
        const fileReader = new FileReader();
        fileReader.onload = () => {
            dispatch({ type: 'EDIT_EDITOR_CONTENT', content: fileReader.result as string })
            if (file.name.endsWith('.js')) dispatch({ type: 'SET_EDITOR_MODE', mode: 'js' });
            else if (file.name.endsWith('.pw') || file.name.endsWith('.txt')) dispatch({ type: 'SET_EDITOR_MODE', mode: 'pw' });
            fileInputRef.current!.value = '';
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
        const isJs = editorMode === 'js';
        const ext = isJs ? '.js' : '.pw';
        const defaultName = `commands-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}${ext}`;
        const opts = {
            suggestedName: defaultName,
            types: isJs
                ? [{ description: "JavaScript files", accept: { "text/javascript": [".js"] } }]
                : [{ description: "PW command files", accept: { "text/plain": [".pw"] } }],
        };
        try {
            const fileHandle: FileSystemFileHandle = await window.showSaveFilePicker(opts);
            const writable = await fileHandle.createWritable();
            await writable.write(editorContent);
            await writable.close();
        } catch (e: unknown) {
            if (e instanceof Error && e.name !== 'AbortError') {
                dispatch({ type: 'ADD_LINE', line: { text: 'Save failed: ' + e.message, type: 'error' } })
            }
        }
    }

    // ─── Run / Step / Stop ───

    async function runCommand(index: number, command: string) {
        dispatch({ type: 'SET_RUN_LINE', currentRunLine: index });
        const result = await runAndDispatch(command, dispatch);
        dispatch({ type: 'SET_LINE_RESULT', index: index, result: result.isError ? 'fail' : 'pass' });
    }

    async function handleRun() {
        cancelRunRef.current = false;
        dispatch({ type: 'RUN_START' });
        if (editorMode === 'js') {
            await runJsScript(editorContent, dispatch);
        } else {
            for (let i = 0; i < lines.length; i++) {
                if (cancelRunRef.current) break;
                const trimmedValue = lines[i].trim();
                if (!lines[i].startsWith('#') && trimmedValue) {
                    await runCommand(i, trimmedValue);
                }
            }
            if (!cancelRunRef.current) {
                dispatch({ type: 'ADD_LINE', line: { text: 'Run complete.', type: 'info' } });
            }
        }
        dispatch({ type: 'RUN_STOP' });
    }

    function handleStop() {
        cancelRunRef.current = true;
        if (isStepDebugging) {
            chrome.runtime.sendMessage({ type: 'debug-stop' }).catch(() => {});
        }
        dispatch({ type: 'RUN_STOP' });
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
        if (isStepDebugging) {
            // JS debug mode: advance past the current breakpoint
            chrome.runtime.sendMessage({ type: 'debug-resume' }).catch(() => {});
            return;
        }
        if (editorMode === 'js') {
            // Start JS debug session on first press
            dispatch({ type: 'RUN_START', stepDebug: true });
            await runJsScriptStep(editorContent, dispatch);
            dispatch({ type: 'RUN_STOP' });
            return;
        }
        // pw step mode: run next line via runAndDispatch
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
        const jsonlSource = sources.find((s: any) => s.id === 'jsonl') || sources[0];
        if (!jsonlSource?.actions?.length) return;
        const prevCount = prevActionCountRef.current;
        const newActions = (jsonlSource.actions as string[]).slice(prevCount);
        prevActionCountRef.current = jsonlSource.actions.length;

        // Console: show new JSONL actions as pretty JSON
        for (const a of newActions) {
            try {
                dispatch({ type: 'ADD_LINE', line: { text: JSON.stringify(JSON.parse(a), null, 2), type: 'code-block' } });
            } catch {
                dispatch({ type: 'ADD_LINE', line: { text: a, type: 'info' } });
            }
        }

        // Editor: insert only new actions at cursor; skip openPage (handleRecord already adds goto)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isOpenPage = (jsonl: string) => { try { return JSON.parse(jsonl).name === 'openPage'; } catch { return false; } };

        if (editorMode === 'js') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const jsSource = sources.find((s: any) => s.id === 'javascript');
            const jsLines = newActions.flatMap((a, i) => {
                if (isOpenPage(a)) return [];
                const jsAction = (jsSource?.actions as string[] | undefined)?.[prevCount + i];
                if (!jsAction) return [];
                return jsAction.split('\n')
                    .map((line: string) => line.replace(/^ {2}/, ''))          // strip 2-space base offset
                    .filter((line: string) => !line.startsWith('const page =')); // page already exists
            }).filter(Boolean);
            if (jsLines.length) editorRef.current?.insertAtCursor(jsLines.join('\n'));
        } else {
            const replLines = newActions
                .filter(a => !isOpenPage(a))
                .map((a: string) => jsonlToRepl(a, false))
                .filter(Boolean) as string[];
            if (replLines.length) editorRef.current?.insertAtCursor(replLines.join('\n'));
        }
    }, [dispatch, editorMode]);

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

        let result: { ok: boolean; url?: string; error?: string } | undefined;
        try {
            result = await chrome.runtime.sendMessage({ type: 'record-start' });
        } catch (e) {
            dispatch({ type: 'ADD_LINE', line: { text: `Recording failed: ${String(e)}`, type: 'error' } });
            return;
        }
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
            const gotoCmd = editorMode === 'js'
                ? `await page.goto(${JSON.stringify(result.url)});`
                : `goto "${result.url}"`;
            editorRef.current?.insertAtCursor(gotoCmd);
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
                    accept='.pw,.js,.txt'
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
                {(isRunning || stepLine !== -1)
                    ? <button id="stop-run-btn" data-testid="stop-run-btn" title={isStepDebugging ? "Abort" : "Stop"} onClick={handleStop}>{isStepDebugging ? <AbortIcon /> : <StopIcon />}</button>
                    : <button id="run-btn" data-testid="run-btn" title="Run script (Ctrl+Enter)" disabled={!editorContent.trim()} onClick={handleRun}>&#9654;</button>
                }
                <button id="step-btn" data-testid="step-btn" title={editorMode === 'js' ? (isStepDebugging ? 'Step: advance to next line' : 'Step: start debug session') : 'Step: run next line'} disabled={!editorContent.trim() || (isRunning && !isStepDebugging)} onClick={handleStep}><StepForwardIcon /></button>
                <span className="w-px h-4.5 bg-(--color-toolbar-sep) mx-1"></span>
                <button
                    data-testid="mode-toggle"
                    title={`Switch to ${editorMode === 'pw' ? 'JS' : '.pw'} mode`}
                    onClick={() => dispatch({ type: 'SET_EDITOR_MODE', mode: editorMode === 'pw' ? 'js' : 'pw' })}
                >
                    {editorMode === 'pw' ? '.pw' : 'JS'}
                </button>
                <button onClick={() => setIsDarkMode(prev => !prev)} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
                    {isDarkMode ? <SunIcon /> : <MoonIcon />}
                </button>
            </div>
            <div id="toolbar-right" className="flex items-center gap-2">
                <select
                    value={selectedTabId ?? attachedTabId ?? ''}
                    title="Switch tab"
                    onFocus={loadTabs}
                    onChange={e => {
                        const tabId = Number(e.target.value);
                        if (tabId) handleTabChange(tabId);
                    }}
                >
                    {!selectedTabId && !attachedTabId && <option value="">— select tab —</option>}
                    {availableTabs.map(tab => (
                        <option key={tab.id} value={tab.id}>{getTabLabel(tab)}</option>
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
                    {isAttaching && <span>Connecting...</span>}
                </div>
                <button id="attach-btn" title="Attach to active tab" disabled={isAttaching || !canAttach || availableTabs.some(t => t.id === selectedTabId && isInternalUrl(t.url))} onClick={handleAttach}>
                    Attach
                </button>
            </div>
        </div>
    )
}

export default Toolbar;
