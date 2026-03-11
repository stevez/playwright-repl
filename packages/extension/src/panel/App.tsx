import { useReducer, useRef, useEffect } from 'react'
import Toolbar from './components/Toolbar'
import CodeMirrorEditorPane, { type EditorHandle } from "./components/CodeMirrorEditorPane"
import Splitter from './components/Splitter'
import { panelReducer, initialState } from './reducer'
import { attachToTab } from './lib/bridge'
import { Console } from './components/Console';
import { onConsoleEvent } from '@/lib/sw-debugger';
import { loadSettings } from './lib/settings';

function App() {
  const [state, dispatch] = useReducer(panelReducer, initialState)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorHandle | null>(null);
  const attachedTabRef = useRef<number | null>(null);

  useEffect(() => {
    onConsoleEvent((level, args) => {
      for (const arg of args) {
        const type = level === 'error' ? 'error' : level === 'warn' ? 'info' : 'success';
        dispatch({ type: 'ADD_LINE', line: { text: '', type, value: arg } });
      }
    });
    return () => onConsoleEvent(null);
  }, [dispatch]);

  useEffect(() => {
    loadSettings().then(s => {
      dispatch({ type: 'SET_EDITOR_MODE', mode: s.languageMode });
    });
  }, []);

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

  useEffect(() => {
    function onMessage(msg: { type: string; line?: number }) {
      if (msg.type === 'debug-paused' && msg.line !== undefined) {
        dispatch({ type: 'SET_RUN_LINE', currentRunLine: msg.line });
      }
    }
    chrome.runtime.onMessage.addListener(onMessage);
    return () => chrome.runtime.onMessage.removeListener(onMessage);
  }, []);

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
      if (tab?.id && !url.startsWith('chrome://') && !url.startsWith('chrome-extension://') && !url.startsWith('about:')) {
        doAttach(tab.id);
      }
    });

    const onActivated = async (info: chrome.tabs.TabActiveInfo) => {
      const tab = await chrome.tabs.get(info.tabId).catch(() => null);
      const url = tab?.url ?? '';
      if (url.startsWith('chrome-extension://') || url.startsWith('about:')) return;
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
      if (attachedTabRef.current === tabId) return;
      if (changeInfo.url && !changeInfo.url.startsWith('chrome://') && !changeInfo.url.startsWith('chrome-extension://') && !changeInfo.url.startsWith('about:')) {
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
      {/* Toolbar */}
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
      />

      {/* Editor pane */}
      <CodeMirrorEditorPane
        ref={editorRef}
        containerRef={editorPaneRef}
        editorContent={state.editorContent}
        editorMode={state.editorMode}
        currentRunLine={state.currentRunLine}
        lineResults={state.lineResults}
        dispatch={dispatch}
      />

      {/* Splitter */}
      <Splitter editorPaneRef={editorPaneRef} />

      <Console outputLines={state.outputLines} dispatch={dispatch} />
    </>
  )
}

export default App
