import { useRef, useEffect, useImperativeHandle, Ref } from 'react';
import { EditorView } from '@codemirror/view';
import { goUp, goDown } from '@/lib/command-history';
import { consoleExtensions } from '@/lib/cm-console-setup';

export interface ConsoleInputHandle {
    focus: () => void;
    clear: () => void;
}

interface Props {
    onSubmit: (value: string) => void;
    onClear:  () => void;
    ref?:     Ref<ConsoleInputHandle>;
}

export function ConsoleInput({ onSubmit, onClear, ref }: Props) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef      = useRef<EditorView | null>(null);
    // Refs so CM6 key handlers always call the latest callbacks
    const submitRef = useRef(onSubmit);
    const clearRef  = useRef(onClear);
    useEffect(() => { submitRef.current = onSubmit; }, [onSubmit]);
    useEffect(() => { clearRef.current  = onClear;  }, [onClear]);

    useEffect(() => {
        const view = new EditorView({
            extensions: consoleExtensions({
                onSubmit:    (v) => { submitRef.current(v); },
                onClear:     ()  => clearRef.current(),
                histBack:    ()  => goUp() ?? null,
                histForward: ()  => { const v = goDown(); return v !== undefined ? v : null; },
            }),
            parent: containerRef.current!,
        });
        viewRef.current = view;
        return () => view.destroy();
    }, []); // mount once — hist is stable (all refs internally)

    useImperativeHandle(ref, () => ({
        focus: () => viewRef.current?.focus(),
        clear: () => {
            const view = viewRef.current;
            if (view) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
        },
    }));

    return <div ref={containerRef} data-testid="command-input" className="flex-1 min-w-0" />;
}
