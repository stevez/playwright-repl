import { useRef, useEffect, useImperativeHandle } from 'react';
import { EditorView } from 'codemirror';
import { baseExtensions, dispatchRunState, languageCompartment, pwModeExtension, jsModeExtension } from '@/lib/codemirror-setup';
import type { PanelState, Action } from "@/reducer";
import { breakpointField } from '@/lib/codemirror-setup';

export interface EditorHandle {
    insertAtCursor: (text: string) => void;
    replaceLastInsert: (text: string) => void;
}

interface EditorPaneProps extends Pick<PanelState, 'editorContent' | 'currentRunLine' | 'lineResults' | 'editorMode'> {
    dispatch: React.Dispatch<Action>
    ref?: React.Ref<EditorHandle | null>
    containerRef?: React.Ref<HTMLDivElement>
}


function CodeMirrorEditorPane({ editorContent, editorMode, currentRunLine, lineResults, dispatch, ref, containerRef }: EditorPaneProps) {
    const cmContainerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView>(null);
    const externalUpdateRef = useRef(false);
    const lastInsertRangeRef = useRef<{ from: number; to: number } | null>(null);

    useImperativeHandle(ref, () => ({
        insertAtCursor(text: string) {
            const view = viewRef.current;
            if (!view) return;
            const { from } = view.state.selection.main;
            const before = view.state.doc.sliceString(Math.max(0, from - 1), from);
            const insert = (before && before !== '\n' ? '\n' : '') + text;
            const insertFrom = from;
            view.dispatch({
                changes: { from, to: from, insert },
                selection: { anchor: from + insert.length },
                scrollIntoView: true,
            });
            lastInsertRangeRef.current = { from: insertFrom, to: insertFrom + insert.length };
            view.focus();
        },
        replaceLastInsert(text: string) {
            const view = viewRef.current;
            const range = lastInsertRangeRef.current;
            if (!view || !range) return;
            const before = view.state.doc.sliceString(Math.max(0, range.from - 1), range.from);
            const insert = (before && before !== '\n' ? '\n' : '') + text;
            view.dispatch({
                changes: { from: range.from, to: range.to, insert },
                selection: { anchor: range.from + insert.length },
                scrollIntoView: true,
            });
            lastInsertRangeRef.current = { from: range.from, to: range.from + insert.length };
            view.focus();
        },
    }));

    useEffect(() => {
        const view = new EditorView({
            doc: editorContent,
            extensions: [
                ...baseExtensions,
                EditorView.updateListener.of((update) => {
                    if (update.docChanged && !externalUpdateRef.current) {
                        dispatch({ type: 'EDIT_EDITOR_CONTENT', content: update.state.doc.toString() });
                    }
                    const oldBps = update.startState.field(breakpointField);
                    const newBps = update.state.field(breakpointField);
                    if (oldBps !== newBps) {
                        dispatch({ type: 'SET_BREAKPOINTS', breakPoints: newBps });
                    }
                }),
            ],
            parent: cmContainerRef.current!,
        });
        viewRef.current = view;
        return () => view.destroy();
    }, []);

    useEffect(() => {
        const view = viewRef.current;
        if(!view) return;
        if(view.state.doc.toString() === editorContent) return;
        externalUpdateRef.current = true;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: editorContent } });
        view.dispatch({ selection: { anchor: view.state.doc.length }, scrollIntoView: true });
        externalUpdateRef.current = false;
        view.focus();
    }, [editorContent]);

    useEffect(()=> {
        const view = viewRef.current;
        if(!view) return;
        dispatchRunState(view, currentRunLine, lineResults);
    }, [currentRunLine, lineResults]);

    useEffect(() => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ effects: languageCompartment.reconfigure(editorMode === 'js' ? jsModeExtension : pwModeExtension) });
    }, [editorMode]);


    return (
        <div id="editor-pane" ref={containerRef} data-testid="editor" className="flex flex-1 min-h-[80px] overflow-hidden bg-(--bg-editor)">
           <div ref={cmContainerRef} className='flex-1' />
        </div>
    )
}

export default CodeMirrorEditorPane;
