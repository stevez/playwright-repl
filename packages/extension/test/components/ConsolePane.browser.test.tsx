import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';
import { useReducer } from 'react';

import ConsolePane from '@/components/ConsolePane';
import type { OutputLine } from '@/types'
import { panelReducer, initialState, PanelState } from '@/reducer';

vi.mock('@/lib/server', () => ({
    executeCommand: vi.fn(),
}));

import { executeCommand } from '@/lib/server';

describe("ConsolePane component tests", () => {

  function TestWrapper() {
    const [state, dispatch ] = useReducer(panelReducer, initialState)
    return <ConsolePane outputLines={state.outputLines} dispatch={dispatch} />;
  }

  beforeEach(() => {
    vi.mocked(executeCommand).mockClear();
  })

  it('should render console pane', async () => {
     const screen = await render(<ConsolePane outputLines={[]} dispatch={vi.fn()} />);
     await expect.element(screen.getByRole('textbox')).toBeInTheDocument();
     await expect.element(screen.getByText('Terminal')).toBeInTheDocument();
  });

  it('should render output lines', async () => {
    const lines: OutputLine[] = [
        { text: 'click e5', type: 'command' },
        { text: 'Clicked', type: 'success' },
        { text: 'Element not found', type: 'error' },
    ];
    const screen = await render(<ConsolePane outputLines={lines} dispatch={vi.fn()} />);

    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
    await expect.element(screen.getByText('Element not found')).toBeInTheDocument();
  })

  it('should render prompt input', async () => {
    const screen = await render(<ConsolePane outputLines={[]} dispatch={vi.fn()} />);
    await screen.getByRole('textbox').fill('click e5');
    await expect.element(screen.getByRole('textbox')).toHaveValue('click e5');
  })

  it('should submit command on Enter', async () => {
    vi.mocked(executeCommand).mockResolvedValue({text: 'Clicked', isError: false });
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Enter}');
    
    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).toBeInTheDocument();
  })

  it('should submit command on Enter and display error message', async () => {
    vi.mocked(executeCommand).mockResolvedValue({text: 'element e5 not found', isError: true });
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Enter}');
    
    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('element e5 not found')).toBeInTheDocument();
  })

  it('should render error message when repl server failed to respond', async () => {
    vi.mocked(executeCommand).mockRejectedValue(new Error('Async error'));
    
    const screen = await render(<TestWrapper />);
    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Enter}');

    await expect.element(screen.getByText('Not connected to server. Run: playwright-repl --extension')).toBeInTheDocument();
  })

  it('should not submit empty string on Enter', async () => {
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('   ');
    await userEvent.keyboard('{Enter}');
    
    expect(executeCommand).not.toHaveBeenCalled();
  })

  it('should not submit on a non-Enter key', async () => {
    const screen = await render(<TestWrapper />);

    await screen.getByRole('textbox').fill('click e5');
    await userEvent.keyboard('{Space}');
    
    expect(executeCommand).not.toHaveBeenCalled();
  })

  it('should clear the console', async () => {
    const preloadedState: PanelState = {
      ...initialState,
      outputLines: [
        { text: 'click e5', type: 'command' },
        { text: 'Clicked', type: 'success' },
      ]
  };

    function ClearTestWrapper() {
         const [state, dispatch ] = useReducer(panelReducer,  preloadedState);
         return <ConsolePane outputLines={state.outputLines} dispatch={dispatch} />;
    }

    const screen = await render(<ClearTestWrapper />);
    
    await expect.element(screen.getByText('click e5')).toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).toBeInTheDocument();

    await screen.getByText('Clear').click();

    await expect.element(screen.getByText('click e5')).not.toBeInTheDocument();
    await expect.element(screen.getByText('Clicked')).not.toBeInTheDocument();
  })

})