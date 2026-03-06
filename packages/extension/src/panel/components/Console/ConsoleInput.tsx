import { useRef, useImperativeHandle, KeyboardEvent, Ref } from 'react';
import { useHistory } from './useHistory';

export interface ConsoleInputHandle {
    focus: () => void;
}

interface Props {
    onSubmit: (value: string) => void;
    onClear: () => void;
    ref?: Ref<ConsoleInputHandle>;
}

export function ConsoleInput({ onSubmit, onClear, ref }: Props) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const hist = useHistory();

    useImperativeHandle(ref, () => ({
        focus: () => textareaRef.current?.focus(),
    }));

    function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
        const el = textareaRef.current!;

        // Ctrl+L — clear
        if (e.key === 'l' && e.ctrlKey) {
            e.preventDefault();
            onClear();
            return;
        }

        // Enter — execute (Shift+Enter inserts newline)
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const value = el.value.trim();
            if (!value) return;
            hist.push(value);
            onSubmit(value);
            el.value = '';
            el.style.height = 'auto';
            return;
        }

        // ArrowUp — history back (only when on first line)
        if (e.key === 'ArrowUp') {
            const beforeCursor = el.value.slice(0, el.selectionStart);
            if (!beforeCursor.includes('\n')) {
                e.preventDefault();
                const prev = hist.goBack(el.value);
                if (prev !== null) {
                    el.value = prev;
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                    el.selectionStart = el.selectionEnd = prev.length;
                }
            }
            return;
        }

        // ArrowDown — history forward (only when on last line)
        if (e.key === 'ArrowDown') {
            const afterCursor = el.value.slice(el.selectionEnd);
            if (!afterCursor.includes('\n')) {
                e.preventDefault();
                const next = hist.goForward();
                if (next !== null) {
                    el.value = next;
                    el.style.height = 'auto';
                    el.style.height = el.scrollHeight + 'px';
                    el.selectionStart = el.selectionEnd = next.length;
                }
            }
            return;
        }
    }

    function handleInput() {
        const el = textareaRef.current!;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 120) + 'px';
    }

    return (
        <textarea
            ref={textareaRef}
            className="flex-1 bg-transparent border-none outline-none resize-none font-[inherit] text-inherit leading-4.5 p-0 max-h-30 overflow-y-auto placeholder:text-(--text-placeholder)"
            rows={1}
            spellCheck={false}
            placeholder="js expression, page.url(), or .pw command… (Shift+Enter for newline)"
            onKeyDown={handleKeyDown}
            onInput={handleInput}
        />
    );
}