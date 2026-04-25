import { useReducer, useRef, useEffect, useState, useMemo } from 'react'
import Toolbar from './components/Toolbar'
import CodeMirrorEditorPane, { type EditorHandle } from "./components/CodeMirrorEditorPane"
import Splitter from './components/Splitter'
import { panelReducer, initialState } from './reducer'
import { attachToTab } from './lib/bridge'
import { BottomPane } from './components/BottomPane'
import DebugBar from './components/DebugBar';
import { onConsoleEvent } from '@/lib/sw-debugger';
import { loadSettings } from './lib/settings';
import { saveSessionState, loadSessionState } from './lib/session-state';
import { getCommandHistory, addCommand } from './lib/command-history';
import { SerializedValue } from './components/Console/types'
import { formatInlineValues } from './lib/inline-values'

function App() {
  const [state, dispatch] = useReducer(panelReducer, initialState)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorHandle | null>(null);
  const attachedTabRef = useRef<number | null>(null);
  const [localProps, setLocalProps] = useState<Record<string, SerializedValue> | null>(null);

  const inlineValues = useMemo(
    () => formatInlineValues(state.currentRunLine, localProps),
    [state.currentRunLine, localProps],
  );

  useEffect(() => {
    onConsoleEvent((level, args) => {
      for (const arg of args) {
        const type = level === 'error' ? 'error' : level === 'warn' ? 'info' : 'success';
        dispatch({ type: 'ADD_LINE', line: { text: '', type, value: arg } });
      }
    });
    return () => onConsoleEvent(null);
  }, [dispatch]);

  // Restore state: check handoff (mode switch) first, then session state, then settings
  useEffect(() => {
    (async () => {
      // Handoff from side panel ↔ popup switch (#820)
      const handoff = await chrome.runtime.sendMessage({ type: 'handoff-load' });
      if (handoff) {
        dispatch({ type: 'RESTORE_HANDOFF', state: {
          editorContent: handoff.editorContent,
          editorMode: handoff.editorMode,
          breakPoints: new Set(handoff.breakPoints),
          bottomTab: handoff.bottomTab,
          outputLines: handoff.outputLines,
          passCount: handoff.passCount,
          failCount: handoff.failCount,
          lineResults: handoff.lineResults,
        }});
        if (handoff.editorPaneHeight && editorPaneRef.current) {
          editorPaneRef.current.style.flex = `0 0 ${handoff.editorPaneHeight}px`;
        }
        if (handoff.cursorPos) {
          setTimeout(() => editorRef.current?.setCursorPos(handoff.cursorPos), 50);
        }
        for (const cmd of handoff.commandHistory ?? []) addCommand(cmd);
        return; // tab attachment handled by the normal useEffect below
      }
      // Regular session state restore (#811)
      const session = await loadSessionState();
      if (session) {
        if (session.editorContent) dispatch({ type: 'EDIT_EDITOR_CONTENT', content: session.editorContent });
        if (session.editorMode) dispatch({ type: 'SET_EDITOR_MODE', mode: session.editorMode });
        if (session.breakPoints.length) dispatch({ type: 'SET_BREAKPOINTS', breakPoints: new Set(session.breakPoints) });
        dispatch({ type: 'SET_BOTTOM_TAB', tab: session.bottomTab });
        if (session.editorPaneHeight && editorPaneRef.current) {
          editorPaneRef.current.style.flex = `0 0 ${session.editorPaneHeight}px`;
        }
        if (session.cursorPos) {
          setTimeout(() => editorRef.current?.setCursorPos(session.cursorPos), 50);
        }
        for (const cmd of session.commandHistory) addCommand(cmd);
      } else {
        const s = await loadSettings();
        dispatch({ type: 'SET_EDITOR_MODE', mode: s.languageMode });
      }
    })();
  }, []);

  // Save session state on every meaningful change (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      saveSessionState({
        editorContent: state.editorContent,
        editorMode: state.editorMode,
        breakPoints: [...state.breakPoints],
        bottomTab: state.bottomTab,
        cursorPos: editorRef.current?.getCursorPos() ?? 0,
        editorPaneHeight: editorPaneRef.current?.offsetHeight ?? null,
        commandHistory: getCommandHistory(),
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [state.editorContent, state.editorMode, state.breakPoints, state.bottomTab]);

  async function doAttach(tabId: number) {
    dispatch({ type: 'ATTACH_START' });
    const res = await attachToTab(tabId);
    if (res.ok && res.url) {
      attachedTabRef.current = tabId;
      dispatch({ type: 'ATTACH_SUCCESS', url: res.url, tabId });
    } else {
      attachedTabRef.current = null;
      dispatch({ type: 'ATTACH_FAIL' });
    }
  }

  // Handoff: switch between side panel ↔ popup (#820)
  async function handleModeSwitch() {
    const handoffState = {
      editorContent: state.editorContent,
      editorMode: state.editorMode,
      breakPoints: [...state.breakPoints],
      bottomTab: state.bottomTab,
      cursorPos: editorRef.current?.getCursorPos() ?? 0,
      editorPaneHeight: editorPaneRef.current?.offsetHeight ?? null,
      commandHistory: getCommandHistory(),
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      outputLines: state.outputLines.map(({ getProperties: _gp, ...rest }) => rest),
      passCount: state.passCount,
      failCount: state.failCount,
      lineResults: state.lineResults,
      attachedTabId: state.attachedTabId,
    };
    await chrome.runtime.sendMessage({ type: 'handoff-save', state: handoffState });
    const isPopup = new URLSearchParams(window.location.search).has('tabId');
    if (isPopup) {
      // Open side panel directly from the popup (preserves user gesture).
      // Chrome API types are incomplete for sidePanel/tabs in panel context.
      /* eslint-disable @typescript-eslint/no-explicit-any */
      let windowId: number | undefined;
      if (state.attachedTabId) {
        const tab = await (chrome as any).tabs.get(state.attachedTabId).catch(() => null);
        windowId = tab?.windowId;
      }
      if (!windowId) {
        const windows = await (chrome as any).windows.getAll({ windowTypes: ['normal'] });
        windowId = (windows.find((w: any) => w.focused) ?? windows[0])?.id;
      }
      if (windowId) {
        await (chrome as any).sidePanel.open({ windowId });
        window.close();
      }
      /* eslint-enable @typescript-eslint/no-explicit-any */
    } else {
      const res = await chrome.runtime.sendMessage({
        type: 'handoff-to-popup',
        tabId: state.attachedTabId,
      });
      if (res?.ok) window.close();
    }
  }

  useEffect(() => {
    if (!chrome.tabs?.query) return;

    const params = new URLSearchParams(window.location.search);
    const tabIdParam = params.get('tabId');

    if (tabIdParam) {
      // Popup mode — attach to the specific tab passed in URL
      doAttach(Number(tabIdParam));
      return;
    }

    // Side panel mode — attach to current active tab, then follow tab switches
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url ?? '';
      const ownOrigin = `chrome-extension://${chrome.runtime.id}/`;
      if (tab?.id && !url.startsWith('chrome://') &&
          (!url.startsWith('chrome-extension://') || url.startsWith(ownOrigin))) {
        doAttach(tab.id);
      }
    });

    const onActivated = async (info: chrome.tabs.TabActiveInfo) => {
      const tab = await chrome.tabs.get(info.tabId).catch(() => null);
      const url = tab?.url ?? '';
      if (url.startsWith('chrome-extension://') && !url.startsWith(`chrome-extension://${chrome.runtime.id}/`)) return;
      if (url.startsWith('chrome://')) {
        attachedTabRef.current = null;
        dispatch({ type: 'DETACH' });
        return;
      }
      doAttach(info.tabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);

    // Auto-attach when the active tab navigates from an internal URL to a regular one
    // (e.g. user opens a new tab from chrome://extensions and types a URL).
    // Skip if already attached to this tab — re-attaching interrupts in-progress commands.
    const onUpdated = (tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (attachedTabRef.current === tabId) {
        if (changeInfo.url) dispatch({ type: 'UPDATE_URL', url: changeInfo.url });
        return;
      }
      if (changeInfo.url && !changeInfo.url.startsWith('chrome://') &&
          (!changeInfo.url.startsWith('chrome-extension://') || changeInfo.url.startsWith(`chrome-extension://${chrome.runtime.id}/`))) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs[0]?.id === tabId) doAttach(tabId);
        });
      }
    };
    chrome.tabs.onUpdated.addListener(onUpdated);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
      chrome.tabs.onUpdated.removeListener(onUpdated);
    };
  }, []);

  return (
    <>
      {/* Toolbar + floating debug bar */}
      <Toolbar
        editorContent={state.editorContent}
        editorMode={state.editorMode}
        stepLine={state.stepLine}
        isRunning={state.isRunning}
        isStepDebugging={state.isStepDebugging}
        attachedUrl={state.attachedUrl}
        attachedTabId={state.attachedTabId}
        isAttaching={state.isAttaching}
        dispatch={dispatch}
        editorRef={editorRef}
        breakPoints={state.breakPoints}
        onModeSwitch={handleModeSwitch}
      />
      {state.isStepDebugging && <DebugBar dispatch={dispatch} />}

      {/* Editor pane */}
      <div ref={editorPaneRef} style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 80, overflow: 'hidden' }}>
        <CodeMirrorEditorPane
          ref={editorRef}
          editorContent={state.editorContent}
          editorMode={state.editorMode}
          currentRunLine={state.currentRunLine}
          lineResults={state.lineResults}
          inlineValues={inlineValues}
          dispatch={dispatch}
        />
      </div>

      {/* Splitter */}
      <Splitter editorPaneRef={editorPaneRef} />

      <BottomPane
          outputLines={state.outputLines}
          dispatch={dispatch}
          bottomTab={state.bottomTab}
          isStepDebugging={state.isStepDebugging}
          scopeData={state.scopeData}
          onLocalProps={setLocalProps}
      />
    </>
  )
}

export default App
