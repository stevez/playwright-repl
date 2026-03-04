import { useReducer, useRef, useEffect } from 'react'
import Toolbar from './components/Toolbar'
import CodeMirrorEditorPane from "./components/CodeMirrorEditorPane"
import Splitter from './components/Splitter'
import ConsolePane from './components/ConsolePane'
import CommandInput, { CommandInputHandle } from './components/CommandInput'
import { panelReducer, initialState } from './reducer'
import { runAndDispatch, setTabUrl } from './lib/run'

function App() {
  const [state, dispatch ] = useReducer(panelReducer, initialState)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  const cmdInputRef = useRef<CommandInputHandle>(null)

  useEffect(() => {
    if (!chrome.tabs?.onActivated) return;
    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      chrome.tabs.get(info.tabId, (tab) => setTabUrl(tab?.url));
    };
    chrome.tabs.onActivated.addListener(onActivated);
    return () => chrome.tabs.onActivated.removeListener(onActivated);
  }, []);

  async function handleSubmit(command: string) {
    await runAndDispatch(command, dispatch);
    cmdInputRef.current?.focus();
  }

  return (
    <>
      {/* Toolbar */}
      <Toolbar
        editorContent={state.editorContent}
        fileName={state.fileName}
        stepLine={state.stepLine}
        dispatch={dispatch}
      />

      {/* Editor pane */}
      <CodeMirrorEditorPane
         ref={editorPaneRef}
         editorContent={state.editorContent}
         currentRunLine={state.currentRunLine}
         lineResults={state.lineResults}
         dispatch={dispatch}
      />

      {/* Splitter */}
      <Splitter editorPaneRef={editorPaneRef}/>

      {/* Console pane */}
      <ConsolePane
         outputLines={state.outputLines}
         passCount={state.passCount}
         failCount={state.failCount}
         dispatch={dispatch}
      />

      {/* Command input — lives outside ConsolePane so its CM view is unaffected by console re-renders */}
      <CommandInput ref={cmdInputRef} onSubmit={handleSubmit} />
    </>
  )
}

export default App
