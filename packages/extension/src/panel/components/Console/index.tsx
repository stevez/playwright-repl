import { useImperativeHandle, useRef, useEffect, useMemo, type Ref } from 'react';
import { useConsole } from './useConsole';
import { ConsoleOutput } from './ConsoleOutput';
import { ConsoleInput, type ConsoleInputHandle } from './ConsoleInput';
import type { ConsoleHandle, ConsoleProps, ConsoleEntry, SerializedValue } from './types';
import type { OutputLine } from '@/types';

export { type ConsoleHandle } from './types';

function outputLinesToEntries(lines: OutputLine[]): ConsoleEntry[] {
    const entries: ConsoleEntry[] = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const id = `ol-${i}`;
        if (line.type === 'command') {
            const next = lines[i + 1];
            if (next && next.type !== 'command' && next.type !== 'comment') {
                const entry: ConsoleEntry = { id, input: line.text, status: next.type === 'error' ? 'error' : 'done' };
                if (next.type === 'success') {
                    if (next.value !== undefined) {
                        entry.value = next.value as SerializedValue;
                        if (next.getProperties) entry.getProperties = next.getProperties;
                    } else {
                        entry.text = next.text;
                    }
                }
                else if (next.type === 'error') entry.errorText = next.text;
                else if (next.type === 'snapshot' || next.type === 'code-block') entry.codeBlock = next.text;
                else if (next.type === 'screenshot') entry.image = next.image;
                entries.push(entry);
                i += 2;
            } else {
                entries.push({ id, input: line.text, status: 'pending' });
                i++;
            }
        } else if (line.type === 'comment') {
            entries.push({ id, input: line.text, status: 'done' });
            i++;
        } else if (line.type === 'info') {
            entries.push({ id, input: '', status: 'done', text: line.text });
            i++;
        } else if (line.type === 'code-block') {
            entries.push({ id, input: '', status: 'done', codeBlock: line.text });
            i++;
        } else if (line.type === 'error') {
            entries.push({ id, input: '', status: 'error', errorText: line.text });
            i++;
        } else if (line.type === 'success') {
            entries.push({ id, input: '', status: 'done', text: line.text });
            i++;
        } else {
            i++;
        }
    }
    return entries;
}

interface Props extends ConsoleProps {
    ref?: Ref<ConsoleHandle>;
}

export function Console({ outputLines, dispatch, className, ref }: Props) {
    const { execute, addResult, runScript } = useConsole(dispatch);
    const inputRef = useRef<ConsoleInputHandle>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const entries = useMemo(() => outputLinesToEntries(outputLines ?? []), [outputLines]);

    function clearAll() {
        dispatch({ type: 'CLEAR_CONSOLE' });
        inputRef.current?.clear();
    }

    function handleExecute(input: string) {
        if (input.trim().toLowerCase() === 'clear') { clearAll(); return; }
        execute(input);
    }

    useImperativeHandle(ref, () => ({ clear: clearAll, addResult, runScript }));

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' });
    }, [entries]);

    return (
        <div className={`flex flex-col flex-1 min-h-20 overflow-hidden ${className ?? ''}`} data-testid="console-pane">
            <div className="flex items-center px-2 py-0.5 border-b border-(--border-primary) bg-(--bg-toolbar) shrink-0">
                <span className="text-(--text-dim) font-medium">Console</span>
            </div>
            <div className="flex items-center gap-1 px-1 py-0.5 border-b border-(--border-primary) shrink-0">
                <button className="console-clear-btn" onClick={clearAll} title="Clear console (Ctrl+L)">⊘</button>
            </div>
            <div className="flex-1 overflow-y-auto py-1 px-2" data-testid="output">
                <ConsoleOutput entries={entries} />
                <div className="flex items-start gap-1 py-0.5">
                    <span className="text-(--color-prompt) shrink-0" data-testid="prompt">&gt;</span>
                    <ConsoleInput ref={inputRef} onSubmit={handleExecute} onClear={clearAll} />
                </div>
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
