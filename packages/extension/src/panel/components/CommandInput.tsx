import { useState } from "react";
import useCommandHistory from '@/hooks/useCommandHistory'
import { getGhostText, getMatches } from "@/lib/autocomplete";

interface CommandInputProps {
    onSubmit: (command: string) => void,
}

// Each handler: process the event, or call next() to pass it along
type KeyHandler = (e: React.KeyboardEvent, next: () => void) => void;

function CommandInput({ onSubmit }: CommandInputProps) {
    const [input, setInput] = useState<string>('');
    const { add, goUp, goDown } = useCommandHistory();
    const [selectIndex, setSelectIndex] = useState(-1);

    const matches = getMatches(input);

    const dropdownKeyHandler: KeyHandler = (e, next) => {
        if (matches.length == 0) return next();

        if (e.key == 'ArrowUp') {
            e.preventDefault();
            setSelectIndex(i => i > 0 ? i - 1 : 0);
        } else if (e.key == "ArrowDown") {
            e.preventDefault();
            setSelectIndex(i => i < matches.length - 1 ? i + 1 : i);
        } else if (e.key == 'Escape') {
            setInput('');
            setSelectIndex(-1);
        } else if (e.key == 'Enter') {
            if (selectIndex >= 0) {
                setInput(matches[selectIndex]);
                setSelectIndex(-1);
            } else {
               next();
            }
        } else {
            next();
        }
    }

    const inputKeyHandler: KeyHandler = (e) => {
        if (e.key == 'ArrowUp') {
            e.preventDefault();
            const value = goUp();
            if (value) setInput(value);
        } else if (e.key == 'ArrowDown') {
            e.preventDefault();
            const value = goDown();
            if (value != null) setInput(value);
        } else if (e.key == 'Tab') {
            e.preventDefault();
            const ghost = getGhostText(input);
            if (ghost) setInput(input + ghost);
        } else if (e.key == 'Enter') {
            add(input);
            onSubmit(input);
            setInput('');
        }
    }
    return (
        <div id="input-bar" className="flex items-center border-t border-solid border-(--border-primary) py-[6px] px-3 bg-(--bg-toolbar) gap-2 shrink-0">
            <span id="prompt" className="text-(--color-prompt) font-bold shrink-0">pw&gt;</span>
            <div id="input-wrapper" className="flex-1 relative">
                {matches.length > 0 && (
                    <div id="autocomplete-dropdown" className="absolute bottom-full left-0 bg-(--bg-toolbar) border border-solid border-(--border-primary) rounded-[4px] py-1 px-0 mb-1 max-h-50 overflow-y-auto z-50 shadow-[0_-2px_8px_rgba(0,0,0,0.15)] " data-testid="autocomplete-dropdown">
                        {matches.map((cmd, i) => (
                            <div key={cmd} className={`py-[3px] px-3 cursor-pointer font-[inherit] text-[12px] text-(--text-default) hover:bg-(--bg-button) ${i === selectIndex ? 'bg-(--bg-button)' : ''}`}
                                data-active={i === selectIndex || undefined}
                                onClick={() => setInput(cmd)}>
                                {cmd}
                            </div>
                        ))}
                    </div>
                )}
                <span id="ghost-text" data-testid="ghost-text" className="absolute top-0 left-0 h-full flex items-center text-(--text-placeholder) font-[inherit] text-[inherit] pointer-events-none whitespace-pre">
                    <span style={{ visibility: 'hidden' }}>{input}</span>
                    {getGhostText(input)}
                </span>
                <input
                    type="text"
                    id="command-input"
                    className="w-full bg-transparent border-none outline-none text-(--text-default) font-[inherit] text-[inherit] caret-(--color-caret) relative placeholder:text-(--text-placeholder)"
                    value={input}
                    placeholder="Type a .pw command..."
                    autoComplete="off"
                    onChange={(e) => {
                        setInput(e.target.value);
                        setSelectIndex(-1);
                    }}
                    onKeyDown={(e) => dropdownKeyHandler(e, () => inputKeyHandler(e, () => {}))}
                    spellCheck={false} />
            </div>
        </div>
    );

}

export default CommandInput;