import Toolbar from './components/Toolbar'
import EditorPane from "./components/EditorPane"
import Splitter from './components/Splitter'
import ConsolePane from './components/ConsolePane'
import Lightbox from './components/Lightbox'
import { useReducer } from 'react'
import { panelReducer, initialState } from './reducer'

function App() {
  const [state, dispatch ] = useReducer(panelReducer, initialState)
  return (
    <>
      {/* Toolbar */}
      <Toolbar />

      {/* Editor pane */}
      <EditorPane />

      {/* Splitter */}
      <Splitter />

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