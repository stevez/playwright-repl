import { forwardRef } from 'react';
import type { PanelState, Action } from "@/reducer";

interface EditorPaneProps extends Pick<PanelState, 'editorContent' | 'currentRunLine' | 'lineResults'> {
    dispatch: React.Dispatch<Action>
}

const EditorPane = forwardRef<HTMLDivElement, EditorPaneProps>(
    function EditorPane({ editorContent, currentRunLine, lineResults, dispatch }: EditorPaneProps, ref) {
        function handleEditorChange(text: string) {
            return dispatch({type: 'EDIT_EDITOR_CONTENT', content: text});
        };
        
        const lineHeight = 18;
        return (
            <div id="editor-pane" ref={ref}>
                <div id="line-numbers">
                    {editorContent.split('\n').map((_, i) => {
                        let cls = ''
                        if( i === currentRunLine) cls = 'line-active'
                        else if (lineResults[i] === 'pass') cls = 'line-pass'
                        else if (lineResults[i] === 'fail') cls = 'line-fail'
                        return <div key={i} className={cls}>{i+1}</div>
                    })}
                </div>
                <div id="editor-wrapper">
                    { currentRunLine >=0 &&
                    <div id="line-highlight" style={{ top: currentRunLine * lineHeight + 8, display: 'block'}}></div>
                    }
                    <textarea
                        id="editor"
                        value={editorContent}
                        spellCheck={false}
                        autoComplete="off"
                        placeholder="# Type or open a .pw script..."
                        onChange={(e) => handleEditorChange(e.target.value)}
                    />
                </div>
            </div>
        )
    })

export default EditorPane;