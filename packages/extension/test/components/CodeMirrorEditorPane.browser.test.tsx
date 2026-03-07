import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { useReducer } from 'react';
import { panelReducer, initialState, PanelState } from '@/reducer';

import CodeMirrorEditorPane from '@/components/CodeMirrorEditorPane';

describe('CodeMirrorEditorPane component tests', () => {

    function TestWrapper({ preloadedState }: { preloadedState?: PanelState }) {
        const [state, dispatch] = useReducer(panelReducer, preloadedState ?? initialState);
        return (
            <div style={{ height: '300px', width: '600px' }}>
                <CodeMirrorEditorPane
                    editorContent={state.editorContent}
                    editorMode={state.editorMode}
                    currentRunLine={state.currentRunLine}
                    lineResults={state.lineResults}
                    dispatch={dispatch}
                />
            </div>
        );
    }

    it('should render the CodeMirror editor', async () => {
        const screen = await render(<TestWrapper />);
        await expect.element(screen.getByRole('textbox')).toBeInTheDocument();
    });

    it('should render with initial content', async () => {
        const preloadedState: PanelState = {
            ...initialState,
            editorContent: 'goto https://example.com\nclick OK',
        };
        const screen = await render(<TestWrapper preloadedState={preloadedState} />);

        // CM6 content area should contain the text
        const editor = screen.getByRole('textbox');
        await expect.element(editor).toHaveTextContent('goto https://example.com');
        await expect.element(editor).toHaveTextContent('click OK');
    });

    it('should render line numbers', async () => {
        const preloadedState: PanelState = {
            ...initialState,
            editorContent: 'click e5\nsnapshot\ngo-back',
        };
        const screen = await render(<TestWrapper preloadedState={preloadedState} />);

        // CM6 renders line numbers in the gutter
        const lineNumbers = screen.container.querySelectorAll('.cm-lineNumbers .cm-gutterElement');
        // CM6 may include extra gutter elements; at least 3 lines
        expect(lineNumbers.length).toBeGreaterThanOrEqual(3);
    });

    it('should show pass/fail gutter markers', async () => {
        const preloadedState: PanelState = {
            ...initialState,
            editorContent: 'click e5\nsnapshot\ngo-back',
            lineResults: ['pass', 'fail', null],
            currentRunLine: -1,
        };
        const screen = await render(<TestWrapper preloadedState={preloadedState} />);

        // Result gutter should contain ✓ and ✗ markers
        const resultGutter = screen.container.querySelectorAll('.cm-result-gutter .cm-gutterElement');
        const markers = Array.from(resultGutter).map(el => el.textContent?.trim()).filter(Boolean);
        expect(markers).toContain('✓');
        expect(markers).toContain('✗');
    });

    it('should highlight the current run line', async () => {
        const preloadedState: PanelState = {
            ...initialState,
            editorContent: 'click e5\nsnapshot\ngo-back',
            currentRunLine: 1,
            lineResults: [],
        };
        const screen = await render(<TestWrapper preloadedState={preloadedState} />);

        // The run line decoration applies .cm-run-line class
        const runLines = screen.container.querySelectorAll('.cm-run-line');
        expect(runLines.length).toBe(1);
    });

    it('should show placeholder when empty', async () => {
        const screen = await render(<TestWrapper />);

        const placeholder = screen.container.querySelector('.cm-placeholder');
        expect(placeholder).not.toBeNull();
        expect(placeholder?.textContent).toBe('# Type or open a .pw script...');
    });

    it('should show JS placeholder in JS mode', async () => {
        const preloadedState: PanelState = { ...initialState, editorMode: 'js' };
        const screen = await render(<TestWrapper preloadedState={preloadedState} />);

        const placeholder = screen.container.querySelector('.cm-placeholder');
        expect(placeholder).not.toBeNull();
        expect(placeholder?.textContent).toBe('// Type JavaScript...');
    });
});
