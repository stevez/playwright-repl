import { useRef } from 'react';
import type { PanelState, Action } from "@/reducer";

interface EditorPaneProps extends Pick<PanelState, 'editorContent' | 'currentRunLine' | 'lineResults'> {
    dispatch: React.Dispatch<Action>
    ref?: React.Ref<HTMLDivElement>
}


function EditorPane({ editorContent, currentRunLine, lineResults, dispatch, ref }: EditorPaneProps) {
    const lineNumbersRef = useRef<HTMLDivElement>(null);

    function handleEditorChange(text: string) {
        return dispatch({ type: 'EDIT_EDITOR_CONTENT', content: text });
    };

    function handleEditorScroll(e: React.UIEvent<HTMLTextAreaElement>) {
        if (lineNumbersRef.current) {
            lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
        }
    }

    const lineHeight = 18;
    return (
        <div id="editor-pane" ref={ref} className="flex flex-1 min-h-[80px] overflow-hidden bg-(--bg-editor)">
            <div id="line-numbers" ref={lineNumbersRef} className="w-10 shrink-0 pt-2 pr-1 pb-2 pl-2 text-right text-(--text-line-numbers) bg-(--bg-editor) leading-[18px] overflow-hidden select-none border-r border-solid border-(--border-primary)">
                {editorContent.split('\n').map((_, i) => {
                    let cls = ''
                    if (i === currentRunLine) cls = 'text-(--color-active-line) bg-(--bg-line-highlight)'
                    else if (lineResults[i] === 'pass') cls = 'line-pass text-(--color-line-pass)'
                    else if (lineResults[i] === 'fail') cls = 'line-fail text-(--color-line-fail)'
                    return <div key={i} className={`h-[18px] ${cls}`}>{i + 1}</div>
                })}
            </div>
            <div id="editor-wrapper" className="flex-1 relative overflow-hidden">
                {currentRunLine >= 0 &&
                    <div id="line-highlight" className="absolute left-0 right-0 h-[18px] bg-(--bg-line-highlight) pointer-events-none" style={{ top: currentRunLine * lineHeight + 8}}></div>
                }
                <textarea
                    id="editor"
                    className="w-full h-full resize-none bg-transparent text-(--text-default) border-none outline-none p-2 font-[inherit] leading-[18px] whitespace-pre overflow-auto tab-[2px] caret-(--color-caret) relative placeholder:text-(--text-placeholder)"
                    value={editorContent}
                    spellCheck={false}
                    autoComplete="off"
                    placeholder="# Type or open a .pw script..."
                    onScroll={handleEditorScroll}
                    onChange={(e) => handleEditorChange(e.target.value)}
                />
            </div>
        </div>
    )
}


export default EditorPane;