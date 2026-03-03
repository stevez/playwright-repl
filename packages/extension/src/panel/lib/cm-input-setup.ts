import { EditorView, keymap, placeholder, drawSelection  } from '@codemirror/view';
import { history, historyKeymap } from '@codemirror/commands';
import { autocompletion, acceptCompletion, completionStatus } from '@codemirror/autocomplete';
import { pwSyntax } from './pw-language';
import { pwCompletion } from './pw-completion';
import { goUp, goDown } from '@/lib/command-history';

export function inputExtensions(onSubmit: (cmd: string) => void) {
    const customKeymap = keymap.of([
        {
            key: 'Enter',
            run(view) {
                if (completionStatus(view.state) === 'active') return false;
                const cmd = view.state.doc.toString();
                if (cmd.trim()) onSubmit(cmd);
                view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '' } });
                return true;
            },
        },
        {
            key: 'Tab',
            run: acceptCompletion,
        },
        {
            key: 'ArrowUp',
            run(view) {
                if (completionStatus(view.state) === 'active') return false;
                const value = goUp();
                if (value) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
                return true;
            },
        },
        {
            key: 'ArrowDown',
            run(view) {
                if (completionStatus(view.state) === 'active') return false;
                const value = goDown();
                if (value != null) view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
                return true;
            },
        },
    ]);

    return [
        customKeymap,  // before historyKeymap so Enter/Up/Down are handled first
        ...pwSyntax,
        autocompletion({ override: [pwCompletion], icons: false }),
        drawSelection(),
        history(),
        keymap.of([...historyKeymap]),
        placeholder('Type a .pw command...'),
        inputTheme,
    ];
}

const inputTheme = EditorView.theme({
    '&': {
        backgroundColor: 'transparent',
        color: 'var(--text-default)',
        fontSize: 'inherit',
        fontFamily: 'inherit'
    },
    '.cm-content': {                // the editable area
        caretColor: 'var(--color-caret)',
        padding: '0',
        lineHeight: '18px',
    },
    '.cm-cursor': {                 // blinking cursor
        borderLeftColor: 'var(--color-caret)',
    },
    '.cm-line': {
        padding: '0',
    },
    '&.cm-focused': {               // remove default focus outline
        outline: 'none',
    },
    '.cm-scroller': {
        overflowY: 'hidden',
        overflowX: 'auto',
    },
    '.cm-tooltip-autocomplete': {
        backgroundColor: 'var(--bg-toolbar)',
        border: '1px solid var(--border-primary)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    },
    '.cm-tooltip-autocomplete ul li[aria-selected]': {
        backgroundColor: 'var(--bg-button)',
    },
});
