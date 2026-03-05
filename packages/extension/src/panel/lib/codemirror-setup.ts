
import { EditorView } from "codemirror";
import { lineNumbers, highlightActiveLineGutter, highlightActiveLine, keymap, placeholder } from '@codemirror/view';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { bracketMatching } from '@codemirror/language';
import { pwSyntax } from './pw-language';
import { search, searchKeymap } from '@codemirror/search';
import { StateEffect, StateField, EditorState, RangeSet } from '@codemirror/state';
import { Decoration, GutterMarker, gutter } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import { pwCompletion } from './pw-completion'

const pwTheme = EditorView.theme({
    '&': {
        backgroundColor: 'var(--bg-editor)',
        color: 'var(--text-default)',
        height: '100%',
        fontSize: '13px',
        fontFamily: '"Cascadia Code", "Fira Code", "Consolas", "Courier New", monospace'
    },
    '.cm-content': {                // the editable area
        caretColor: 'var(--color-caret)',
        lineHeight: '18px',
        padding: '8px 0',
    },
    '.cm-cursor': {                 // blinking cursor
        borderLeftColor: 'var(--color-caret)',
    },
    '.cm-gutters': {                // line number column
        backgroundColor: 'var(--bg-editor)',
        color: 'var(--text-line-numbers)',
        borderRight: '1px solid var(--border-primary)',
    },
    '.cm-activeLineGutter': {       // gutter on active line
        backgroundColor: 'var(--bg-line-highlight)',
    },
    '.cm-activeLine': {             // active line background
        backgroundColor: 'var(--bg-line-highlight)',
    },
    '&.cm-focused': {               // remove default focus outline
        outline: 'none',
    },
    '.cm-scroller': {               // scrollable container
        overflow: 'auto',
    },
    '.cm-run-line': {
        background: 'var(--bg-line-highlight)'
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

export const setRunLineEffect = StateEffect.define<number>();           // -1 = none
export const setLineResultsEffect = StateEffect.define<(string | null)[]>();  // per-line

const runLineField = StateField.define<number>({
    create: () => -1,
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setRunLineEffect)) return e.value;
        }
        return value;
    },
});

const lineResultsField = StateField.define<(string | null)[]>({
    create: () => [],
    update(value, tr) {
        for (const e of tr.effects) {
            if (e.is(setLineResultsEffect)) return e.value;
        }
        return value;
    },
});

const runLineHighlight = EditorView.decorations.compute(
    [runLineField],
    (state) => {
        const lineNum = state.field(runLineField);
        if (lineNum < 0 || lineNum >= state.doc.lines) return Decoration.none;
        const line = state.doc.line(lineNum + 1);  // CM6 lines are 1-indexed
        return Decoration.set([
            Decoration.line({ class: 'cm-run-line' }).range(line.from),
        ]);
    }
);

class ResultMarker extends GutterMarker {
    constructor(readonly result: string) { super(); }
    toDOM() {
        const span = document.createElement('span');
        span.textContent = this.result === 'pass' ? '✓' : '✗';
        span.style.color = this.result === 'pass'
            ? 'var(--color-line-pass)'
            : 'var(--color-line-fail)';
        return span;
    }
}

const resultGutter = gutter({
    class: 'cm-result-gutter',
    markers(view) {
        const results = view.state.field(lineResultsField);
        const markers: any[] = [];
        for (let i = 0; i < results.length && i < view.state.doc.lines; i++) {
            if (results[i]) {
                const line = view.state.doc.line(i + 1);
                markers.push(new ResultMarker(results[i]!).range(line.from));
            }
        }
        return RangeSet.of(markers);
    },
});

export function dispatchRunState(
    view: EditorView,
    runLine: number,
    lineResults: (string | null)[]
) {
    view.dispatch({
        effects: [
            setRunLineEffect.of(runLine),
            setLineResultsEffect.of(lineResults),
        ],
    });
}

export const baseExtensions = [
    ...pwSyntax,                             // .pw syntax highlighting
    autocompletion({ override: [pwCompletion], icons: false}),
    lineNumbers(),                           // built-in line numbers (replaces manual div)
    highlightActiveLineGutter(),             // highlights gutter on cursor line
    highlightActiveLine(),                   // highlights content on cursor line
    history(),                               // undo/redo stack
    bracketMatching(),                       // highlight matching brackets
    search(),                                // Ctrl+F search panel
    keymap.of([
        ...defaultKeymap,                      // basic editing keys
        ...historyKeymap,                      // Ctrl+Z, Ctrl+Y
        ...searchKeymap,                       // Ctrl+F, Ctrl+H
    ]),
    EditorState.tabSize.of(2),              // tab = 2 spaces
    placeholder('# Type or open a .pw script...'),
    pwTheme,
    runLineField,          // ← register the StateField so CM6 tracks it
    lineResultsField,      // ← register the StateField so CM6 tracks it
    runLineHighlight,      // ← decoration that reads runLineField
    resultGutter,          // ← gutter that reads lineResultsField
];

