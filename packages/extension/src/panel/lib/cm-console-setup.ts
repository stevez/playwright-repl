import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view';
import { javascript, javascriptLanguage } from '@codemirror/lang-javascript';
import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { history, historyKeymap } from '@codemirror/commands';
import { autocompletion, acceptCompletion, completionStatus, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import type { Extension } from '@codemirror/state';
import { pwCompletion } from '@/lib/pw-completion';
import { playwrightCompletions } from '@/lib/pw-completion-source';

interface Opts {
    onSubmit:    (value: string) => void;
    onClear:     () => void;
    histBack:    (current: string) => string | null;
    histForward: () => string | null;
}

function replaceDoc(view: EditorView, text: string) {
    view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: text },
        selection: { anchor: text.length },
    });
}

export function consoleExtensions(opts: Opts): Extension[] {
    const customKeymap = keymap.of([
        {
            key: 'Enter',
            run(view) {
                if (completionStatus(view.state) === 'active') return false;
                const value = view.state.doc.toString().trim();
                if (!value) return true;
                opts.onSubmit(value);
                replaceDoc(view, '');
                return true;
            },
        },
        {
            key: 'Tab',
            run: acceptCompletion,
        },
        {
            key: 'Ctrl-l',
            preventDefault: true,
            run() { opts.onClear(); return true; },
        },
        {
            key: 'ArrowUp',
            run(view) {
                const sel = view.state.selection.main;
                if (view.state.doc.lineAt(sel.head).number !== 1) return false;
                const prev = opts.histBack(view.state.doc.toString());
                if (prev !== null) replaceDoc(view, prev);
                return prev !== null;
            },
        },
        {
            key: 'ArrowDown',
            run(view) {
                const sel = view.state.selection.main;
                const lastLine = view.state.doc.lineAt(view.state.doc.length);
                if (view.state.doc.lineAt(sel.head).number !== lastLine.number) return false;
                const next = opts.histForward();
                if (next !== null) replaceDoc(view, next);
                return next !== null;
            },
        },
    ]);

    const consoleTheme = EditorView.theme({
        '&': { background: 'transparent', minHeight: '54px', maxHeight: '200px' },
        '&.cm-focused': { outline: 'none' },
        '.cm-scroller': { overflow: 'auto', fontFamily: 'inherit', fontSize: 'inherit', lineHeight: '18px' },
        '.cm-content':     { padding: '0', caretColor: 'var(--color-prompt)' },
        '.cm-cursor':      { borderLeftColor: 'var(--color-prompt)' },
        '.cm-line':        { padding: '0' },
        '.cm-placeholder': { color: 'var(--text-placeholder)' },
    });

    return [
        EditorView.lineWrapping,
        customKeymap,
        javascript(),
        javascriptLanguage.data.of({ autocomplete: playwrightCompletions }),
        javascriptLanguage.data.of({ autocomplete: pwCompletion }),
        autocompletion(),
        closeBrackets(),
        syntaxHighlighting(defaultHighlightStyle),
        drawSelection(),
        history(),
        keymap.of([...closeBracketsKeymap, ...historyKeymap]),
        placeholder('js expression or .pw command  (Shift+Enter for newline)'),
        consoleTheme,
    ];
}
