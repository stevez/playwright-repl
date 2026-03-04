import { useEffect, useRef, useImperativeHandle } from "react";
import { EditorView } from 'codemirror';
import { inputExtensions } from '@/lib/cm-input-setup';

interface CommandInputProps {
    onSubmit: (command: string) => void,
    ref?: React.Ref<CommandInputHandle>,
}

export interface CommandInputHandle {
    focus: () => void;
}

function CommandInput({ onSubmit, ref }: CommandInputProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    useImperativeHandle(ref, () => ({
        focus: () => viewRef.current?.focus(),
    }), []);

    useEffect(() => {
        const view = new EditorView({
            extensions: inputExtensions(onSubmit),
            parent: containerRef.current!,
        });
        viewRef.current = view;
        return () => view.destroy();
    }, []);

    return (
        <div id="input-bar" className="flex items-center border-t border-solid border-(--border-primary) py-[6px] px-3 bg-(--bg-toolbar) gap-2 shrink-0"
           onClick={() => viewRef.current?.focus()}>
            <span id="prompt" data-testid="prompt" className="text-(--color-prompt) font-bold shrink-0">pw&gt;</span>
            <div ref={containerRef} data-testid="command-input" className="flex-1" />
        </div>
    );
}

export default CommandInput;
