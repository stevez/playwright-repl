import { useRef, useEffect } from 'react';
import { EditorView } from 'codemirror';
import { baseExtensions, dispatchRunState } from '@/lib/codemirror-setup';
import type { PanelState, Action } from "@/reducer";

interface EditorPaneProps extends Pick<PanelState, 'editorContent' | 'currentRunLine' | 'lineResults'> {
    dispatch: React.Dispatch<Action>
    ref?: React.Ref<HTMLDivElement>
}


function CodeMirrorEditorPane({ editorContent, currentRunLine, lineResults, dispatch, ref }: EditorPaneProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView>(null);
    const externalUpdateRef = useRef(false);

    useEffect(() => {
        const view = new EditorView({
            doc: editorContent,
            extensions: [
                ...baseExtensions,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !externalUpdateRef.current) {
                        dispatch({ type: 'EDIT_EDITOR_CONTENT', content: update.state.doc.toString() });
                    }
                }),
            ],
            parent: containerRef.current!,
        });
        viewRef.current = view;
        return () => view.destroy();
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if(!view) return;
        if(view.state.doc.toString() === editorContent) return;
        externalUpdateRef.current = true;
        view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: editorContent}
        });
        externalUpdateRef.current = false;
    }, [editorContent]);

    useEffect(()=> {
        const view = viewRef.current;
        if(!view) return;
        dispatchRunState(view, currentRunLine, lineResults);
    }, [currentRunLine, lineResults]);


    return (
        <div id="editor-pane" ref={ref} data-testid="editor" className="flex flex-1 min-h-[80px] overflow-hidden bg-(--bg-editor)">
           <div ref={containerRef} className='flex-1' />
        </div>
    )
}

export default CodeMirrorEditorPane;