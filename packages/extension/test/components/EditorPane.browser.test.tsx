import { describe, it, expect } from 'vitest';
import { render } from 'vitest-browser-react';
import { useReducer } from 'react';
import { panelReducer, initialState, PanelState } from '@/reducer';

import EditorPane from '@/components/EditorPane';

describe('EditorPane component tests', () => {
    
    function TestWrapper() {
        const [state, dispatch] = useReducer(panelReducer, initialState);
        return (
            <EditorPane
            editorContent={state.editorContent}
            currentRunLine={state.currentRunLine}
            lineResults={state.lineResults}
            dispatch={dispatch}
        />)
    }

    it('should render text area', async () => {
        const screen = await render(<TestWrapper />);
        await expect.element(screen.getByRole('textbox')).toBeInTheDocument();
    })

    it('should render the text that user typed', async () => {
        const screen = await render(<TestWrapper />);
        
        await screen.getByRole('textbox').fill('hello');

        await expect.element(screen.getByRole('textbox')).toHaveValue('hello');
    })

    it('should render the line number with with line status', async () => {
        const preloadedState: PanelState = {
              ...initialState,
              lineResults: ['pass', 'fail', null],
              currentRunLine: 2,
              editorContent: 'click e5\nsnapshot\ngo-back'
          };
        function LineStatusTestWrapper() {
            const [state, dispatch] = useReducer(panelReducer, preloadedState);
            return (
                <EditorPane
                editorContent={state.editorContent}
                currentRunLine={state.currentRunLine}
                lineResults={state.lineResults}
                dispatch={dispatch}
            />)
        }

        const screen = await render(<LineStatusTestWrapper />);
        
        // Line 1 has 'pass' → line-pass class
        await expect.element(screen.getByText('1')).toHaveClass('line-pass');

        // Line 2 has 'fail' → line-fail class
        await expect.element(screen.getByText('2')).toHaveClass('line-fail');

        // Line 3 has currentRunLine=2 (0-indexed) → active line highlight
        await expect.element(screen.getByText('3')).toHaveClass('bg-(--bg-line-highlight)');
    })

})