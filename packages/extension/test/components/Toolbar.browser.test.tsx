/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import Toolbar from '@/components/Toolbar';

vi.mock('@/lib/server', () => ({
  executeCommand: vi.fn(),
  checkHealth: vi.fn().mockResolvedValue({ status: 'ok', version: "0.6.0" }),
  getServerPort: vi.fn().mockReturnValue(6781),
  setServerPort: vi.fn(),
}))

import { executeCommand, checkHealth, setServerPort } from '@/lib/server';

describe('Toolbar component tests', () => {
  beforeEach(() => {
    vi.mocked(checkHealth).mockResolvedValue({ status: 'ok', version: '0.6.0' });
    Object.assign(window, {
      chrome: {
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
        },
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ ok: true }),
          onMessage: {
            addListener: vi.fn(),
            removeListener: vi.fn(),
          },
        },
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should render the Toolbar component', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);
    await expect.element(screen.getByTitle('Open .pw file')).toBeInTheDocument();
  })

  it('should open a file dialog when click open button', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    // create a fake file
    const file = new File(['go to https://example.com\nclick e5'], 'test.pw', { type: 'text/plain' });

    // find the hidden file input
    const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement;

    await userEvent.upload(fileInput, file);

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'EDIT_EDITOR_CONTENT',
        content: 'go to https://example.com\nclick e5'
      });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_FILENAME',
        fileName: 'test.pw'
      });
    });
  });

  it('should handle open a file dialog when no file selected', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    // find the hidden file input
    const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement;

    dispatch.mockClear(); // clear health check dispatches
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('should dispatch error when file read fails', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    // Mock FileReader to trigger onerror
    vi.spyOn(FileReader.prototype, 'readAsText').mockImplementation(function (this: FileReader) {
      this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>);
    });

    const file = new File(['content'], 'test.pw', { type: 'text/plain' });
    const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'ADD_LINE',
        line: { text: 'Failed to read file', type: 'error' }
      });
    });
  });

  it('should trigger file input click when Open button clicked', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
    let inputClicked = false;
    fileInput.addEventListener('click', (e) => {
      e.preventDefault();
      inputClicked = true;
    });

    const openBtn = screen.container.querySelector('#open-btn') as HTMLButtonElement;
    openBtn.click();

    expect(inputClicked).toBe(true);
  });

  it('should save file and dispatch SET_FILENAME', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent='goto https://example.com'
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    const mockWritable = { write: vi.fn(), close: vi.fn() };
    const mockFileHandle = {
      name: 'saved.pw',
      createWritable: vi.fn().mockResolvedValue(mockWritable),
    };
    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle) as any;

    const saveBtn = screen.container.querySelector('#save-btn') as HTMLButtonElement;
    saveBtn.click();

    await vi.waitFor(() => {
      expect(mockWritable.write).toHaveBeenCalledWith('goto https://example.com');
      expect(mockWritable.close).toHaveBeenCalled();
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_FILENAME', fileName: 'saved.pw'
      });
    });
  });

  it('should dispatch error when save fails', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent='some content'
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    window.showSaveFilePicker = vi.fn().mockRejectedValue(new Error('Disk full')) as any;

    const saveBtn = screen.container.querySelector('#save-btn') as HTMLButtonElement;
    saveBtn.click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'ADD_LINE',
        line: { text: 'Save failed: Disk full', type: 'error' }
      });
    });
  });

  it('should not dispatch error when user cancels save', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent='some content'
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    const abortError = new Error('User cancelled');
    abortError.name = 'AbortError';
    window.showSaveFilePicker = vi.fn().mockRejectedValue(abortError) as any;

    dispatch.mockClear(); // clear health check dispatches
    const saveBtn = screen.container.querySelector('#save-btn') as HTMLButtonElement;
    saveBtn.click();

    await new Promise(r => setTimeout(r, 50));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('should run all commands and dispatch results', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'goto https://example.com\nclick e5'}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_START' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_RUN_LINE', currentRunLine: 0 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: 'goto https://example.com', type: 'command' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 0, result: 'pass' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_RUN_LINE', currentRunLine: 1 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: 'click e5', type: 'command' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 1, result: 'pass' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_STOP' });
    });
  });

  it('should run all commands and dispatch results with error type', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'goto https://example.com\nclick e5'}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: true });

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_START' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_RUN_LINE', currentRunLine: 0 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: 'goto https://example.com', type: 'command' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'error' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 0, result: 'fail' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_RUN_LINE', currentRunLine: 1 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: 'click e5', type: 'command' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 1, result: 'fail' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_STOP' });
    });
  });

  it('should dispatch error message when run command failed', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'goto https://example.com\nclick e5'}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    vi.mocked(executeCommand).mockRejectedValue(new Error('server error'));

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_START' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_RUN_LINE', currentRunLine: 0 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: 'goto https://example.com', type: 'command' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_ERROR', line: { text: 'Not connected to server. Run: playwright-repl --extension', type: 'error' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_STOP' });
    })
  });

  it('should skip comments and empty lines when running', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'# comment\ngoto https://example.com\n\nclick e5'}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(executeCommand).toHaveBeenCalledTimes(2);
      expect(executeCommand).toHaveBeenCalledWith('goto https://example.com', 'https://example.com');
      expect(executeCommand).toHaveBeenCalledWith('click e5', 'https://example.com');
    });
  });

  it('should highlight the first line when click the step button', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'goto https://example.com\nclick e5'}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByText('▷').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_INIT', stepLine: 0 });
    });
  });

  it('should execute current line and advance when stepping', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'goto https://example.com\nclick e5'}
      fileName=''
      stepLine={0}
      dispatch={dispatch}
    />);

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByText('▷').click();

    await vi.waitFor(() => {
      expect(executeCommand).toHaveBeenCalledWith('goto https://example.com', 'https://example.com');
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_ADVANCE', stepLine: 1 });
    });
  });

  it('should skip comments on step init', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'# comment\n\ngoto https://example.com'}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByText('▷').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_INIT', stepLine: 2 });
    });
  });
  it('should skip comments when advancing step', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'goto https://example.com\n# comment\nclick e5'}
      fileName=''
      stepLine={0}
      dispatch={dispatch}
    />);

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByText('▷').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_ADVANCE', stepLine: 2 });
    });
  });

  it('should set stepLine to -1 when no more lines', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'goto https://example.com'}
      fileName=''
      stepLine={0}
      dispatch={dispatch}
    />);

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByText('▷').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_ADVANCE', stepLine: -1 });
    });
  });

  it('should not dispatch step init when no executable lines', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={'# comment\n\n# another comment'}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    dispatch.mockClear(); // clear health check dispatches
    await screen.getByText('▷').click();

    await new Promise(r => setTimeout(r, 50));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('should toggle to stop when record button is clicked', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByRole('button', { name: 'Record' }).click();
    await expect.element(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  })

  it('should toggle to record when stop button is clicked', async () => {
    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByRole('button', { name: 'Record' }).click();
    await screen.getByRole('button', { name: 'Stop' }).click();

    await expect.element(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  })

  it('should render when chrome.tabs is undefined', async () => {
    window.chrome.tabs.query = null as any;

    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByRole('button', { name: 'Record' }).click();

    expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  })

  it('should not send chrome message whtn tabs[0] is null', async () => {
    window.chrome.tabs.query = vi.fn().mockResolvedValue([null]);

    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByRole('button', { name: 'Record' }).click();

    expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  })

  it('should send out message to console when chrome.runtime.sendMessage return failure', async () => {
    window.chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ error: 'connection failed' });

    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByRole('button', { name: 'Record' }).click();

    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_LINE', line: { text: 'Recording failed: connection failed', type: 'error' } })
  })

  it('should dispatch messages to console and editor console when pw-recorded-command is received', async () => {

    const dispatch = vi.fn();
    await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    const listener = (window.chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // Invoke it with a fake message
    listener({ type: 'pw-recorded-command', command: 'click e5' });

    // Assert dispatch was called
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_LINE',
      line: { text: 'click e5', type: 'command' }
    });
    expect(dispatch).toHaveBeenCalledWith({
      type: 'APPEND_EDITOR_CONTENT',
      command: 'click e5'
    });
  })

  it('should not dispatch messages to console and editor console when non pw-recorded-command is received', async () => {

    const dispatch = vi.fn();
    await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    const listener = (window.chrome.runtime.onMessage.addListener as ReturnType<typeof vi.fn>).mock.calls[0][0];

    dispatch.mockClear(); // clear health check dispatches

    // Invoke it with a fake message
    listener({ type: 'non-pw-recorded-command', command: 'click e5' });

    // Assert dispatch was not called
    expect(dispatch).not.toHaveBeenCalled();
  })

  it('should still render the component when chrome.runtime?.onMessage is null', async () => {
    window.chrome.runtime.onMessage = null as any;

    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await expect.element(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  })

  it('should support export function', async () => {
    const pwCommands = `
    # command list
    goto https://example.com
    click "Learn more"
    verify-text "As described in RFC 2606 and RFC 6761"
    `

    const dispatch = vi.fn();
    const screen = await render(<Toolbar
      editorContent={pwCommands}
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await screen.getByRole('button', { name: 'Export' }).click();
    const expected_code = `
import { test, expect } from '@playwright/test';

test('recorded session', async ({ page }) => {
  // command list
  await page.goto("https://example.com");
  await page.getByText("Learn more").click();
  await expect(page.getByText("As described in RFC 2606 and RFC 6761")).toBeVisible();
});`.trim();
    expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_LINE', line: { text: expected_code, type: 'code-block' } })
  });

  it('should show connected status dot when health check succeeds', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    await vi.waitFor(() => {
      const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
      expect(dot.dataset.status).toBe('connected');
    });
  });

  it('should show disconnected status dot when health check fails', async () => {
    vi.mocked(checkHealth).mockRejectedValue(new Error('connection refused'));

    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    await vi.waitFor(() => {
      const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
      expect(dot.dataset.status).toBe('disconnected');
    });
  });

  it('should dispatch version and connected messages on initial health check success', async () => {
    const dispatch = vi.fn();
    await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_LINE', line: { text: 'Playwright REPL v0.6.0', type: 'info' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_LINE', line: { text: 'Connected to localhost:6781', type: 'success' } });
    });
  });

  it('should dispatch error messages on initial health check failure', async () => {
    vi.mocked(checkHealth).mockRejectedValue(new Error('connection refused'));

    const dispatch = vi.fn();
    await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={dispatch}
    />);

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_LINE', line: { text: 'Server not running.', type: 'error' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'ADD_LINE', line: { text: 'Start with: playwright-repl --extension', type: 'error' } });
    });
  });

  it('should poll health check every 30 seconds', async () => {
    vi.useFakeTimers();

    await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    // initial check from the first useEffect
    await vi.waitFor(() => {
      expect(checkHealth).toHaveBeenCalledTimes(1);
    });

    await vi.advanceTimersByTimeAsync(30000);
    expect(checkHealth).toHaveBeenCalledTimes(2);

    await vi.advanceTimersByTimeAsync(30000);
    expect(checkHealth).toHaveBeenCalledTimes(3);

    vi.useRealTimers();
  });

  it('should update status dot to disconnected when polling detects failure', async () => {
    vi.useFakeTimers();

    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    // initially connected
    await vi.waitFor(() => {
      const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
      expect(dot.dataset.status).toBe('connected');
    });

    // server goes down
    vi.mocked(checkHealth).mockRejectedValue(new Error('connection refused'));
    await vi.advanceTimersByTimeAsync(30000);

    await vi.waitFor(() => {
      const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
      expect(dot.dataset.status).toBe('disconnected');
    });

    vi.useRealTimers();
  });

  it('should display port number in status label', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    await expect.element(screen.getByText(':6781')).toBeInTheDocument();
  });

  it('should show port input when status indicator is clicked', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    const indicator = screen.container.querySelector('[data-testid="status-indicator"]') as HTMLElement;
    indicator.click();

    await vi.waitFor(() => {
      const input = screen.container.querySelector('[data-testid="port-input"]') as HTMLInputElement;
      expect(input).not.toBeNull();
      expect(input.value).toBe('6781');
    });
  });

  it('should call setServerPort when port is changed and committed', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    const indicator = screen.container.querySelector('[data-testid="status-indicator"]') as HTMLElement;
    indicator.click();

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-testid="port-input"]')).not.toBeNull();
    });

    const input = screen.container.querySelector('[data-testid="port-input"]') as HTMLInputElement;
    await userEvent.click(input);
    await userEvent.clear(input);
    await userEvent.type(input, '9000');
    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => {
      expect(setServerPort).toHaveBeenCalledWith(9000);
    });
  });

  it('should change the port number when leave the input box', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    const indicator = screen.container.querySelector('[data-testid="status-indicator"]') as HTMLElement;
    indicator.click();

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-testid="port-input"]')).not.toBeNull();
    });

    const input = screen.container.querySelector('[data-testid="port-input"]') as HTMLInputElement;
    await userEvent.clear(input);
    await userEvent.type(input, '9000');
    await userEvent.tab();

    await vi.waitFor(() => {
      expect(setServerPort).toHaveBeenCalledWith(9000);
    });
  });

  it('should dismiss port input on Escape without changing port', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    const indicator = screen.container.querySelector('[data-testid="status-indicator"]') as HTMLElement;
    indicator.click();

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-testid="port-input"]')).not.toBeNull();
    });

    await userEvent.keyboard('{Escape}');

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-testid="port-input"]')).toBeNull();
    });
    expect(setServerPort).not.toHaveBeenCalled();
  });

  it('should dismiss port input on when input value is 65536', async () => {
    const screen = await render(<Toolbar
      editorContent=''
      fileName=''
      stepLine={-1}
      dispatch={vi.fn()}
    />);

    const indicator = screen.container.querySelector('[data-testid="status-indicator"]') as HTMLElement;
    indicator.click();

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-testid="port-input"]')).not.toBeNull();
    });

    const input = screen.container.querySelector('[data-testid="port-input"]')!;
    await userEvent.clear(input);
    await userEvent.type(input, '65536');
    await userEvent.keyboard('{Enter}');

    await vi.waitFor(() => {
      expect(screen.container.querySelector('[data-testid="port-input"]')).toBeNull();
    })
    
    expect(setServerPort).not.toHaveBeenCalled();
    await expect.element(screen.getByText(':6781')).toBeInTheDocument();
  });






})