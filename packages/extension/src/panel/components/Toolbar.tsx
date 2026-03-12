import { useRef, useMemo, useState, useEffect, useCallback } from 'react';
import type { PanelState, Action } from "@/reducer";
import { jsonlToRepl } from '@/lib/converter';
import { connectWithRetry, attachToTab } from '@/lib/bridge';
import { runAndDispatch, runJsScript, runJsScriptStep } from '@/lib/run';
import { SunIcon, MoonIcon, FolderOpenIcon, SaveIcon, RecordIcon, StopIcon, StepForwardIcon, AbortIcon } from './Icons';
import type { EditorHandle } from './CodeMirrorEditorPane';
import { asLocator } from '@/lib/locator/locatorGenerators';
import { loadSettings, storeSettings } from '@/lib/settings'

interface ToolbarProps extends Pick<PanelState, 'editorContent' | 'editorMode' | 'stepLine' | 'attachedUrl' | 'attachedTabId' | 'isAttaching' | 'isRunning' | 'isStepDebugging'> {
    dispatch: React.Dispatch<Action>,
    editorRef: React.RefObject<EditorHandle | null>,
};

function Toolbar({ editorContent, editorMode, stepLine, attachedUrl, attachedTabId, isAttaching, isRunning, isStepDebugging, dispatch, editorRef }: ToolbarProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const recorderPortRef = useRef<chrome.runtime.Port | null>(null);
    const prevActionsRef = useRef<string[]>([]);
    // State machine for fill sequence: click → fill → Enter → release as single command
    const pendingFillRef = useRef<{ text: string; jsonl: string } | null>(null);
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
        const onActivated = (info: chrome.tabs.TabActiveInfo) => { setSelectedTabId(info.tabId); checkActiveTab(); };
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
        const jsonlSource = sources.find(s => s.id === 'jsonl') || sources[0];
        if (!jsonlSource?.actions?.length) return;
        const actions = jsonlSource.actions as string[];
        const prev = prevActionsRef.current;

        // Detect new actions (appended) vs updated actions (in-place edit, e.g. fill text changing)
        const newActions = actions.slice(prev.length);
        const lastUpdated = prev.length > 0 && actions.length === prev.length &&
            actions[actions.length - 1] !== prev[prev.length - 1];

        prevActionsRef.current = [...actions];

        // ─── JSONL-level helpers (mode-independent) ───
        const parseAction = (jsonl: string) => { try { return JSON.parse(jsonl); } catch { return null; } };
        const isOpenPage = (jsonl: string) => parseAction(jsonl)?.name === 'openPage';
        const isFocusClick = (jsonl: string) => {
            const a = parseAction(jsonl);
            if (a?.name !== 'click') return false;
            let loc = a.locator;
            while (loc) {
                if (loc.kind === 'role' && loc.body === 'textbox') return true;
                loc = loc.next;
            }
            return false;
        };
        // Click immediately followed by check/uncheck/select → redundant (recorder artifact)
        const isClickBeforeToggle = (jsonl: string, nextJsonl: string | undefined) => {
            if (!nextJsonl) return false;
            const a = parseAction(jsonl);
            if (a?.name !== 'click') return false;
            const next = parseAction(nextJsonl);
            return ['check', 'uncheck', 'select', 'selectOption'].includes(next?.name);
        };
        const isFill = (jsonl: string) => parseAction(jsonl)?.name === 'fill';
        const isBareEnter = (jsonl: string) => {
            const a = parseAction(jsonl);
            return a?.name === 'press' && a?.key === 'Enter';
        };

        // Helper: convert a single action to editor text
        const actionToEditorText = (jsonl: string, idx: number): string | null => {
            if (isOpenPage(jsonl)) return null;
            if (editorMode === 'js') {
                const jsSource = sources.find(s => s.id === 'javascript');
                const jsAction = (jsSource?.actions as string[] | undefined)?.[idx];
                if (!jsAction) return null;
                return jsAction.split('\n')
                    .map((line: string) => line.replace(/^ {2}/, ''))
                    .map((line: string) => line.replace(/^\/\/ (await expect\()/, '$1'))
                    .filter((line: string) => !line.startsWith('const page ='))
                    .join('\n') || null;
            } else {
                return jsonlToRepl(jsonl, false) || null;
            }
        };

        // In-place update: replace the last inserted line in the editor + console
        if (lastUpdated) {
            const lastAction = actions[actions.length - 1];
            // Update pending fill text if it's being edited (user still typing)
            if (pendingFillRef.current && isFill(lastAction)) {
                const text = actionToEditorText(lastAction, actions.length - 1);
                if (text) pendingFillRef.current = { text, jsonl: lastAction };
                return;
            }
            const text = actionToEditorText(lastAction, actions.length - 1);
            if (text) editorRef.current?.replaceLastInsert(text);
            return;
        }

        // ─── State machine: buffer click→fill→Enter, release as single command ───
        if (newActions.length) {
            const flush = () => {
                if (pendingFillRef.current) {
                    editorRef.current?.insertAtCursor(pendingFillRef.current.text);
                    pendingFillRef.current = null;
                }
            };

            for (let i = 0; i < newActions.length; i++) {
                const jsonl = newActions[i];
                const idx = prev.length + i;

                // Deduplicate consecutive identical actions (recorder artifact: emits same action twice)
                const prevJsonl = i > 0 ? newActions[i - 1] : (prev.length > 0 ? prev[prev.length - 1] : null);
                if (prevJsonl && jsonl === prevJsonl) continue;

                // Click on input → skip (noise before fill)
                if (isFocusClick(jsonl)) continue;

                // Click followed by check/uncheck/select → skip (keep the semantic action)
                if (isClickBeforeToggle(jsonl, newActions[i + 1])) continue;

                // Fill → buffer (wait for Enter)
                if (isFill(jsonl)) {
                    flush(); // release any previous pending fill
                    const text = actionToEditorText(jsonl, idx);
                    if (text) pendingFillRef.current = { text, jsonl };
                    continue;
                }

                // Press Enter after fill → release as fill --submit
                if (isBareEnter(jsonl) && pendingFillRef.current) {
                    if (editorMode === 'pw') {
                        editorRef.current?.insertAtCursor(pendingFillRef.current.text + ' --submit');
                    } else {
                        // JS mode: emit fill, skip Enter (form submit is implicit)
                        editorRef.current?.insertAtCursor(pendingFillRef.current.text);
                    }
                    pendingFillRef.current = null;
                    continue;
                }

                // Any other action → flush pending fill, emit this action
                flush();
                const text = actionToEditorText(jsonl, idx);
                if (text) editorRef.current?.insertAtCursor(text);
            }
            // Don't flush at end — keep pending fill buffered for cross-batch Enter
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
        prevActionsRef.current = [];

        if (result.url && result.url !== 'about:blank') {
            const gotoCmd = editorMode === 'js'
                ? `await page.goto(${JSON.stringify(result.url)});`
                : `goto "${result.url}"`;
            editorRef.current?.insertAtCursor(gotoCmd);
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        recorderPortRef.current!.onMessage.addListener((msg: any) => {
            if (msg.type === 'recorder' && msg.method === 'setSources') {
                handleRecordedSources(msg.sources);
            }
            if (msg.type === 'recorder' && msg.method === 'elementPicked') {
                const selector = msg.elementInfo?.selector;
                if (selector) {
                    const locator = asLocator(selector);
                    dispatch({ type: 'ADD_LINE', line: { text: locator, type: 'info' } });
                }
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
