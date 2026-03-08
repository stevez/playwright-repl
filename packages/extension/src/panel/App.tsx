import { useReducer, useRef, useEffect } from 'react'
import Toolbar from './components/Toolbar'
import CodeMirrorEditorPane, { type EditorHandle } from "./components/CodeMirrorEditorPane"
import Splitter from './components/Splitter'
import { panelReducer, initialState } from './reducer'
import { attachToTab } from './lib/bridge'
import { Console } from './components/Console';

function App() {
  const [state, dispatch] = useReducer(panelReducer, initialState)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<EditorHandle | null>(null);


  async function doAttach(tabId: number) {
    dispatch({ type: 'ATTACH_START' });
    const res = await attachToTab(tabId);
    if (res.ok && res.url) dispatch({ type: 'ATTACH_SUCCESS', url: res.url, tabId });
    else dispatch({ type: 'ATTACH_FAIL' });
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
      const tabId = tabs[0]?.id;
      if (tabId) doAttach(tabId);
    });

    const onActivated = async (info: chrome.tabs.TabActiveInfo) => {
      const tab = await chrome.tabs.get(info.tabId).catch(() => null);
      const url = tab?.url ?? '';
      if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) return;
      doAttach(info.tabId);
    };
    chrome.tabs.onActivated.addListener(onActivated);
    return () => chrome.tabs.onActivated.removeListener(onActivated);
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
      <Splitter editorPaneRef={editorPaneRef}/>

      <Console outputLines={state.outputLines} dispatch={dispatch} />
    </>
  )
}

export default App
