import Toolbar from './components/Toolbar'
import EditorPane from "./components/EditorPane"
import Splitter from './components/Splitter'
import ConsolePane from './components/ConsolePane'
import Lightbox from './components/Lightbox'
import { useReducer, useRef } from 'react'
import { panelReducer, initialState } from './reducer'

function App() {
  const [state, dispatch ] = useReducer(panelReducer, initialState)
  const editorPaneRef = useRef<HTMLDivElement>(null)
  return (
    <>
      {/* Toolbar */}
      <Toolbar />

      {/* Editor pane */}
      <EditorPane
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
         dispatch={dispatch}
      />

      {/* Lightbox */}
      <Lightbox />
    </>
  )
}

export default App