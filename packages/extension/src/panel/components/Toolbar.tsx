import { useRef, useMemo, useState, useEffect } from 'react';
import type { PanelState, Action } from "@/reducer";
import { attachToTab } from '@/lib/bridge';
import { runAndDispatch, runJsScript, runJsScriptStep } from '@/lib/run';
import { swTerminateExecution, swDebugResume } from '@/lib/sw-debugger';
import { SunIcon, MoonIcon, FolderOpenIcon, SaveIcon, RecordIcon, StopIcon, StepForwardIcon, BugIcon, CrosshairIcon, PlugIcon, UnplugIcon } from './Icons';
import type { EditorHandle } from './CodeMirrorEditorPane';
import { buildPickResult, resolvePlaywrightLocator } from '@/lib/pick-info';
import { swDebugEval } from '@/lib/sw-debugger';
import { locatorToRef } from '@/lib/snapshot-parser';
import { setLastSnapshot } from '@/lib/last-snapshot';
import { loadSettings, storeSettings } from '@/lib/settings'

interface ToolbarProps extends Pick<PanelState, 'editorContent' | 'editorMode' | 'stepLine' | 'attachedUrl' | 'attachedTabId' | 'isAttaching' | 'isRunning' | 'isStepDebugging' | 'breakPoints'> {
    dispatch: React.Dispatch<Action>,
    editorRef: React.RefObject<EditorHandle | null>,
};

function Toolbar({ editorContent, editorMode, stepLine, attachedUrl, attachedTabId, isAttaching, isRunning, isStepDebugging, breakPoints, dispatch, editorRef }: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const cancelRunRef = useRef(false);
    const [isRecording, setIsRecording] = useState(false);
    const [isPicking, setIsPicking] = useState(false);
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
        // Keep chrome:// tabs (to preserve tab order) but exclude other extensions' and about: tabs.
        // Allow our own extension pages (newtab) but exclude the panel/popup itself.
        const ownOrigin = `chrome-extension://${chrome.runtime.id}/`;
        const panelUrl = `${ownOrigin}panel/panel.html`;
        setAvailableTabs(tabs.filter(t => t?.url && !t.url.startsWith('about:') && !t.url.startsWith(panelUrl) && (!t.url.startsWith('chrome-extension://') || t.url.startsWith(ownOrigin))));
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
        const onActivated = (info: chrome.tabs.TabActiveInfo) => { setSelectedTabId(info.tabId); checkActiveTab(); };
        const onUpdated = (_tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => { if (changeInfo.url) loadTabs(); };
        chrome.tabs.onActivated.addListener(onActivated);
        chrome.tabs.onUpdated.addListener(onUpdated);
        return () => { chrome.tabs.onActivated.removeListener(onActivated); chrome.tabs.onUpdated.removeListener(onUpdated); };
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
        chrome.tabs.update(tabId, { active: true }).catch(() => {});
        if (tab && isInternalUrl(tab.url)) {
            dispatch({ type: 'DETACH' });
            return;
        }
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
            swTerminateExecution().catch(() => {});
            swDebugResume().catch(() => {}); // unpause so termination takes effect
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

    async function handleDebug() {
        dispatch({ type: 'RUN_START', stepDebug: true });
        await runJsScriptStep(editorContent, dispatch, breakPoints);
        dispatch({ type: 'RUN_STOP' });
    }

    async function handleStep() {
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

    // ─── Recording (content script-based) ───

    function isEditorEmpty(): boolean {
        return editorContent.split('\n').every(line => {
            const trimmed = line.trim();
            if (!trimmed) return true;
            if (editorMode === 'pw') return trimmed.startsWith('#');
            return trimmed.startsWith('//') || trimmed.startsWith('/*');
        });
    }

    useEffect(() => {
        if (!chrome.runtime?.onMessage) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listener = (msg: any) => {
            if (msg.type === 'recorded-action') {
                editorRef.current?.insertAtCursor(editorMode === 'pw' ? msg.action.pw : msg.action.js);
            }
            if (msg.type === 'recorded-fill-update') {
                editorRef.current?.replaceLastInsert(editorMode === 'pw' ? msg.action.pw : msg.action.js);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, [editorMode]);

    // Auto-stop recording when run/debug starts
    useEffect(() => {
        if (isRunning && isRecording) {
            setIsRecording(false);
            chrome.runtime.sendMessage({ type: 'record-stop' }).catch(() => {});
        }
    }, [isRunning]);

    async function handleRecord() {
        if (!chrome.tabs?.query) return;

        if (isRecording) {
            setIsRecording(false);
            chrome.runtime.sendMessage({ type: 'record-stop' }).catch(() => {});
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

        setIsRecording(true);

        if (result.url && result.url !== 'about:blank' && !result.url.startsWith('chrome://') && isEditorEmpty()) {
            const gotoCmd = editorMode === 'js'
                ? `await page.goto(${JSON.stringify(result.url)});`
                : `goto "${result.url}"`;
            editorRef.current?.insertAtCursor(gotoCmd);
        }
    }

    // ─── Pick element ───

    useEffect(() => {
        if (!chrome.runtime?.onMessage) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const listener = (msg: any) => {
            if (msg.type === 'element-picked-raw') {
                setIsPicking(false);
                const snapshotPromise = swDebugEval('takeSnapshot(page)')
                    .then((r: unknown) => {
                        const res = r as { result?: { type?: string; value?: string } };
                        return res?.result?.type === 'string' ? res.result.value! : null;
                    })
                    .catch(() => null);
                resolvePlaywrightLocator(msg.pickId).then(async pwLocator => {
                    const pickResult = buildPickResult({ ...msg.info, pwLocator });
                    const snap = await snapshotPromise;
                    if (snap) {
                        setLastSnapshot(snap);
                        const jsLocator = pickResult.locator.replace(/^page\./, '');
                        pickResult.ref = locatorToRef(snap, jsLocator) ?? undefined;
                        if (pickResult.ref) {
                            pickResult.pwCommand = `highlight ${pickResult.ref}`;
                        }
                    }
                    dispatch({ type: 'ADD_LINE', line: { text: '', type: 'info', pickResult } });
                });
            }
            if (msg.type === 'pick-cancelled') {
                setIsPicking(false);
            }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
    }, [dispatch]);

    async function handlePick() {
        if (!chrome.tabs?.query) return;

        if (isPicking) {
            setIsPicking(false);
            await chrome.runtime.sendMessage({ type: 'pick-stop' }).catch(() => {});
            return;
        }

        let result: { ok: boolean; error?: string } | undefined;
        try {
            result = await chrome.runtime.sendMessage({ type: 'pick-start' });
        } catch (e) {
            dispatch({ type: 'ADD_LINE', line: { text: `Pick failed: ${String(e)}`, type: 'error' } });
            return;
        }
        if (!result?.ok) {
            dispatch({ type: 'ADD_LINE', line: { text: `Pick failed: ${result?.error ?? 'unknown error'}`, type: 'error' } });
            return;
        }
        setIsPicking(true);
    }

    function handleDetach() {
        dispatch({ type: 'DETACH' });
        // Let background know we're detaching (for cleanup)
        chrome.runtime.sendMessage({ type: 'detach' }).catch(() => { });
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
                <button
                    data-testid="pick-btn"
                    className={isPicking ? 'picking' : ''}
                    title={isPicking ? "Stop picking" : "Pick element"}
                    disabled={isRecording}
                    onClick={handlePick}
                >
                    <CrosshairIcon />
                </button>
                <button
                    id="record-btn"
                    data-testid="record-btn"
                    className={isRecording ? 'recording' : ''}
                    title={isRecording ? "Stop recording" : "Start Recording"}
                    disabled={isPicking || isRunning}
                    onClick={handleRecord}
                >
                    {isRecording ? <StopIcon /> : <RecordIcon />}
                </button>
                {(isRunning || stepLine !== -1) && !isStepDebugging
                    ? <button id="stop-run-btn" data-testid="stop-run-btn" title="Stop" onClick={handleStop}><StopIcon /></button>
                    : <button id="run-btn" data-testid="run-btn" title="Run script (Ctrl+Enter)" disabled={!editorContent.trim() || isStepDebugging} onClick={handleRun}>&#9654;</button>
                }
                {editorMode === 'js' && !isRunning && stepLine === -1 && (
                    <button id="debug-btn" data-testid="debug-btn" title="Debug script" disabled={!editorContent.trim()} onClick={handleDebug}><BugIcon /></button>
                )}
                {editorMode === 'pw' && (
                    <button id="step-btn" data-testid="step-btn" title="Step: run next line" disabled={!editorContent.trim() || isRunning} onClick={handleStep}><StepForwardIcon /></button>
                )}
                <span className="w-px h-4.5 bg-(--color-toolbar-sep) mx-1"></span>
                <div data-testid="mode-toggle" className="inline-flex rounded border border-(--border-button) overflow-hidden">
                    <button
                        data-active={editorMode === 'pw' ? '' : undefined}
                        onClick={() => {
                            loadSettings()
                            .then(s => storeSettings({ ...s, languageMode: 'pw' }))
                            .then(() => dispatch({ type: 'SET_EDITOR_MODE', mode: 'pw' }));
                        }}
                        className="px-1.5 py-0.5 text-[11px] border-0 rounded-none"
                    >.pw</button>
                    <button
                        data-active={editorMode === 'js' ? '' : undefined}
                        onClick={() => {
                            loadSettings()
                            .then(s => storeSettings({ ...s, languageMode: 'js' }))
                            .then(() =>  dispatch({ type: 'SET_EDITOR_MODE', mode: 'js' }));
                        }}
                        className="px-1.5 py-0.5 text-[11px] border-0 rounded-none"
                    >JS</button>
                </div>
                <button id="open-btn" title="Open .pw file" onClick={handleFileOpen}><FolderOpenIcon /></button>
                <button id="save-btn" title="Save as .pw file" disabled={!editorContent.trim()} onClick={handleSave}><SaveIcon /></button>
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
                <button
                    data-testid="attach-btn"
                    title={isAttaching ? 'Connecting...' : attachedUrl ? `Detach from ${attachedUrl}` : 'Attach to tab'}
                    disabled={!attachedUrl && (isAttaching || !canAttach || availableTabs.some(t => t.id === selectedTabId && isInternalUrl(t.url)))}
                    onClick={attachedUrl ? handleDetach : handleAttach}
                    style={{ color: isAttaching ? 'var(--color-warning, #facc15)' : attachedUrl ? 'var(--color-success)' : 'var(--color-error)' }}
                >
                    {attachedUrl ? <UnplugIcon /> : <PlugIcon />}
                </button>
            </div>
        </div>
    )
}

export default Toolbar;
