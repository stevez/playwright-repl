/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import Toolbar from '@/components/Toolbar';

// ─── Bridge mock ──────────────────────────────────────────────────────────────

vi.mock('@/lib/bridge', () => ({
  executeCommand: vi.fn(),
  attachToTab: vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' }),
}));

vi.mock('@/lib/sw-debugger', () => ({
  swDebugEval: vi.fn().mockResolvedValue(undefined),
  swDebugEvalRaw: vi.fn().mockResolvedValue({ result: { type: 'undefined' } }),
  swGetProperties: vi.fn().mockResolvedValue({ result: [] }),
  swDebuggerEnable: vi.fn().mockResolvedValue(undefined),
  swDebuggerDisable: vi.fn().mockResolvedValue(undefined),
  swDebugPause: vi.fn().mockResolvedValue(undefined),
  swRemoveBreakpoint: vi.fn().mockResolvedValue(undefined),
  swDebugResume: vi.fn().mockResolvedValue(undefined),
  swDebugStepOver: vi.fn().mockResolvedValue(undefined),
  swDebugStepInto: vi.fn().mockResolvedValue(undefined),
  swDebugStepOut: vi.fn().mockResolvedValue(undefined),
  swTerminateExecution: vi.fn().mockResolvedValue(undefined),
  swSetBreakpointByUrl: vi.fn().mockResolvedValue('bp-1'),
  swTrackBreakpoint: vi.fn(),
  swRemoveAllBreakpoints: vi.fn().mockResolvedValue(undefined),
  onDebugPaused: vi.fn(),
}));

vi.mock('@/lib/settings', () => ({
  loadSettings: vi.fn().mockResolvedValue({ openAs: 'sidepanel', bridgePort: 9876, languageMode: 'pw' }),
  storeSettings: vi.fn().mockResolvedValue(undefined),
}));

import { executeCommand, attachToTab } from '@/lib/bridge';
import { swDebugEval } from '@/lib/sw-debugger';

// ─── Helper to render Toolbar with default required props ─────────────────────

function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  const editorRef = { current: null };
  return render(<Toolbar
    editorContent=''
    editorMode='pw'
    stepLine={-1}
    attachedUrl={null}
    attachedTabId={null}
    isAttaching={false}
    isRunning={false}
    isStepDebugging={false}
    breakPoints={new Set()}
    dispatch={vi.fn()}
    editorRef={editorRef}
    {...overrides}
  />);
}

describe('Toolbar component tests', () => {
  beforeEach(() => {
    Object.assign(window, {
      chrome: {
        tabs: {
          query: vi.fn().mockResolvedValue([{ id: 1, url: 'https://example.com' }]),
          update: vi.fn().mockResolvedValue({}),
        },
        runtime: {
          sendMessage: vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' }),
          connect: vi.fn().mockReturnValue({
            onMessage: { addListener: vi.fn() },
            onDisconnect: { addListener: vi.fn() },
            disconnect: vi.fn(),
          }),
        },
      },
    });
    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });
    vi.mocked(attachToTab).mockResolvedValue({ ok: true, url: 'https://example.com' });
    vi.mocked(swDebugEval).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('should render the Toolbar component', async () => {
    const screen = await renderToolbar();
    await expect.element(screen.getByTitle('Open .pw file')).toBeInTheDocument();
  });

  // ─── File operations ───────────────────────────────────────────────────────

  it('should open a file dialog when click open button', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({ dispatch });

    const file = new File(['go to https://example.com\nclick e5'], 'test.pw', { type: 'text/plain' });
    const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(fileInput, file);

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'EDIT_EDITOR_CONTENT',
        content: 'go to https://example.com\nclick e5'
      });
    });
  });

  it('should handle open a file dialog when no file selected', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({ dispatch });

    const fileInput = screen.container.querySelector('input[type="file"]') as HTMLInputElement;
    dispatch.mockClear();
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    await new Promise(r => setTimeout(r, 50));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('should dispatch error when file read fails', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({ dispatch });

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
    const screen = await renderToolbar();

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

  it('should save file content', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({ editorContent: 'goto https://example.com', dispatch });

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
    });
  });

  it('should dispatch error when save fails', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({ editorContent: 'some content', dispatch });

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
    const screen = await renderToolbar({ editorContent: 'some content', dispatch });

    const abortError = new Error('User cancelled');
    abortError.name = 'AbortError';
    window.showSaveFilePicker = vi.fn().mockRejectedValue(abortError) as any;

    dispatch.mockClear();
    const saveBtn = screen.container.querySelector('#save-btn') as HTMLButtonElement;
    saveBtn.click();

    await new Promise(r => setTimeout(r, 50));
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ─── Run / Step ────────────────────────────────────────────────────────────

  it('should run all commands and dispatch results', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com\nclick e5',
      dispatch,
    });

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_START' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_RUN_LINE', currentRunLine: 0 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: 'goto https://example.com', type: 'command' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success', time: expect.any(Number) } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 0, result: 'pass' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_RUN_LINE', currentRunLine: 1 });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: 'click e5', type: 'command' } });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 1, result: 'pass' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_STOP' });
    });
  });

  it('should run all commands and dispatch results with error type', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com\nclick e5',
      dispatch,
    });

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: true });

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 0, result: 'fail' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'error', time: expect.any(Number) } });
    });
  });

  it('should dispatch error message when run command fails', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com\nclick e5',
      dispatch,
    });

    vi.mocked(executeCommand).mockRejectedValue(new Error('bridge error'));

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_START' });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'COMMAND_ERROR',
        line: { text: 'Command failed. Try clicking Attach first.', type: 'error' }
      });
    });
  });

  it('should skip comments and empty lines when running', async () => {
    const screen = await renderToolbar({
      editorContent: '# comment\ngoto https://example.com\n\nclick e5',
    });

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(executeCommand).toHaveBeenCalledTimes(2);
      expect(executeCommand).toHaveBeenCalledWith('goto https://example.com');
      expect(executeCommand).toHaveBeenCalledWith('click e5');
    });
  });

  it('should highlight the first line when click the step button', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com\nclick e5',
      dispatch,
    });

    await screen.getByTestId('step-btn').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_INIT', stepLine: 0 });
    });
  });

  it('should execute current line and advance when stepping', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com\nclick e5',
      stepLine: 0,
      dispatch,
    });

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByTestId('step-btn').click();

    await vi.waitFor(() => {
      expect(executeCommand).toHaveBeenCalledWith('goto https://example.com');
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_ADVANCE', stepLine: 1 });
    });
  });

  it('should skip comments on step init', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: '# comment\n\ngoto https://example.com',
      dispatch,
    });

    await screen.getByTestId('step-btn').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_INIT', stepLine: 2 });
    });
  });

  it('should skip comments when advancing step', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com\n# comment\nclick e5',
      stepLine: 0,
      dispatch,
    });

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByTestId('step-btn').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_ADVANCE', stepLine: 2 });
    });
  });

  it('should set stepLine to -1 when no more lines', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com',
      stepLine: 0,
      dispatch,
    });

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: false });

    await screen.getByTestId('step-btn').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'STEP_ADVANCE', stepLine: -1 });
    });
  });

  it('should not dispatch step init when no executable lines', async () => {
    const dispatch = vi.fn();
    const screen = await renderToolbar({
      editorContent: '# comment\n\n# another comment',
      dispatch,
    });

    dispatch.mockClear();
    await screen.getByTestId('step-btn').click();

    await new Promise(r => setTimeout(r, 50));
    expect(dispatch).not.toHaveBeenCalled();
  });

  // ─── Recording ─────────────────────────────────────────────────────────────

  it('should toggle to stop when record button is clicked', async () => {
    const screen = await renderToolbar();

    await screen.getByRole('button', { name: 'Record' }).click();
    await expect.element(screen.getByRole('button', { name: 'Stop' })).toBeInTheDocument();
  });

  it('should toggle to record when stop button is clicked', async () => {
    const screen = await renderToolbar();

    await screen.getByRole('button', { name: 'Record' }).click();
    await screen.getByRole('button', { name: 'Stop' }).click();

    await expect.element(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  });

  it('should send record-start message when record button clicked', async () => {
    const screen = await renderToolbar();
    await screen.getByRole('button', { name: 'Record' }).click();
    await vi.waitFor(() => {
      expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'record-start' });
    });
  });

  it('should send record-stop when stop clicked', async () => {
    const screen = await renderToolbar();

    await screen.getByRole('button', { name: 'Record' }).click();

    await screen.getByRole('button', { name: 'Stop' }).click();
    await vi.waitFor(() => {
      expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'record-stop' })
      );
    });
  });

  it('should not record when chrome.tabs.query is unavailable', async () => {
    window.chrome.tabs.query = null as any;

    const screen = await renderToolbar();
    await screen.getByRole('button', { name: 'Record' }).click();

    expect(window.chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('should dispatch error when record-start fails', async () => {
    window.chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: false, error: 'connection failed' });

    const dispatch = vi.fn();
    const screen = await renderToolbar({ dispatch });

    await screen.getByRole('button', { name: 'Record' }).click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'ADD_LINE',
        line: { text: 'Recording failed: connection failed', type: 'error' }
      });
    });
  });

  it('should call insertAtCursor when recorder sends recorded-action', async () => {
    const insertAtCursor = vi.fn();
    const editorRef = { current: { insertAtCursor, replaceLastInsert: vi.fn() } };

    // Set up chrome.runtime.onMessage to capture the listener
    const listeners: ((msg: any) => void)[] = [];
    window.chrome.runtime.onMessage = {
      addListener: vi.fn((fn: any) => listeners.push(fn)),
      removeListener: vi.fn(),
    } as any;

    await renderToolbar({ editorRef: editorRef as any });

    // Simulate a recorded-action message from content script
    for (const listener of listeners) {
      listener({ type: 'recorded-action', action: { pw: 'click "Submit"', js: "await page.getByRole('button', { name: 'Submit' }).click();" } });
    }

    await vi.waitFor(() => {
      expect(insertAtCursor).toHaveBeenCalledWith('click "Submit"');
    });
  });


  // ─── Record: goto insertion depends on editor content ─────────────────────

  it('should insert goto when recording starts with empty editor', async () => {
    window.chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' });
    const insertAtCursor = vi.fn();
    const editorRef = { current: { insertAtCursor, replaceLastInsert: vi.fn() } };

    const screen = await renderToolbar({ editorContent: '', editorRef: editorRef as any });
    await screen.getByRole('button', { name: 'Record' }).click();

    await vi.waitFor(() => {
      expect(insertAtCursor).toHaveBeenCalledWith('goto "https://example.com"');
    });
  });

  it('should insert goto when editor has only comments in pw mode', async () => {
    window.chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' });
    const insertAtCursor = vi.fn();
    const editorRef = { current: { insertAtCursor, replaceLastInsert: vi.fn() } };

    const screen = await renderToolbar({ editorContent: '# this is a comment\n\n# another', editorMode: 'pw', editorRef: editorRef as any });
    await screen.getByRole('button', { name: 'Record' }).click();

    await vi.waitFor(() => {
      expect(insertAtCursor).toHaveBeenCalledWith('goto "https://example.com"');
    });
  });

  it('should insert goto when editor has only comments in js mode', async () => {
    window.chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' });
    const insertAtCursor = vi.fn();
    const editorRef = { current: { insertAtCursor, replaceLastInsert: vi.fn() } };

    const screen = await renderToolbar({ editorContent: '// comment\n/* block */', editorMode: 'js', editorRef: editorRef as any });
    await screen.getByRole('button', { name: 'Record' }).click();

    await vi.waitFor(() => {
      expect(insertAtCursor).toHaveBeenCalledWith(expect.stringContaining('await page.goto'));
    });
  });

  it('should NOT insert goto when editor has existing commands', async () => {
    window.chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' });
    const insertAtCursor = vi.fn();
    const editorRef = { current: { insertAtCursor, replaceLastInsert: vi.fn() } };

    const screen = await renderToolbar({ editorContent: 'click "Submit"', editorMode: 'pw', editorRef: editorRef as any });
    await screen.getByRole('button', { name: 'Record' }).click();

    await vi.waitFor(() => {
      expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'record-start' });
    });
    expect(insertAtCursor).not.toHaveBeenCalled();
  });

  it('should NOT insert goto when editor has existing JS code', async () => {
    window.chrome.runtime.sendMessage = vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' });
    const insertAtCursor = vi.fn();
    const editorRef = { current: { insertAtCursor, replaceLastInsert: vi.fn() } };

    const screen = await renderToolbar({ editorContent: 'document.title', editorMode: 'js', editorRef: editorRef as any });
    await screen.getByRole('button', { name: 'Record' }).click();

    await vi.waitFor(() => {
      expect(window.chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'record-start' });
    });
    expect(insertAtCursor).not.toHaveBeenCalled();
  });

  // ─── Attach icon toggle ────────────────────────────────────────────────────

  it('shows attach button when not attached', async () => {
    const screen = await renderToolbar({ attachedUrl: null, isAttaching: false });
    const btn = screen.container.querySelector('[data-testid="attach-btn"]') as HTMLElement;
    expect(btn.title).toBe('Attach to tab');
  });

  it('shows connecting title when isAttaching', async () => {
    const screen = await renderToolbar({ attachedUrl: null, isAttaching: true });
    const btn = screen.container.querySelector('[data-testid="attach-btn"]') as HTMLElement;
    expect(btn.title).toBe('Connecting...');
  });

  it('shows detach title with URL when connected', async () => {
    const screen = await renderToolbar({ attachedUrl: 'https://example.com', isAttaching: false });
    const btn = screen.container.querySelector('[data-testid="attach-btn"]') as HTMLElement;
    expect(btn.title).toContain('example.com');
  });

  it('attach button is disabled when isAttaching', async () => {
    const screen = await renderToolbar({ attachedUrl: null, isAttaching: true });
    const btn = screen.container.querySelector('[data-testid="attach-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('attach button is enabled when connected (for detach)', async () => {
    const screen = await renderToolbar({ attachedUrl: 'https://example.com', isAttaching: false });
    const btn = screen.container.querySelector('[data-testid="attach-btn"]') as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  // ─── Tab switcher ──────────────────────────────────────────────────────────

  describe('tab switcher', () => {
    const mockTabs = [
      { id: 1, url: 'https://example.com', title: 'Example' },
      { id: 2, url: 'https://google.com', title: 'Google' },
    ];

    beforeEach(() => {
      (window.chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue(mockTabs);
    });

    it('renders a tab select element', async () => {
      const screen = await renderToolbar();
      const select = screen.container.querySelector('select[title="Switch tab"]');
      expect(select).not.toBeNull();
    });

    it('shows attached tab as the selected value', async () => {
      // attachedTabId=1 matches example.com (id=1 in mockTabs)
      const screen = await renderToolbar({ attachedUrl: 'https://example.com', attachedTabId: 1 });

      const select = screen.container.querySelector('select[title="Switch tab"]') as HTMLSelectElement;
      select.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      await vi.waitFor(() => {
        // No placeholder when attachedTabId is set; 2 tab options
        expect(select.querySelectorAll('option').length).toBe(2);
      });

      expect(select.value).toBe('1'); // tab ID, not URL
    });

    it('loads tabs from chrome.tabs.query on focus', async () => {
      const screen = await renderToolbar();
      const select = screen.container.querySelector('select[title="Switch tab"]') as HTMLSelectElement;
      select.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      await vi.waitFor(() => {
        expect(window.chrome.tabs.query).toHaveBeenCalled();
        const options = select.querySelectorAll('option');
        // placeholder + 2 tabs (no attachedTabId set)
        expect(options.length).toBe(3);
      });
    });

    it('dispatches ATTACH_START and calls attachToTab when tab changed', async () => {
      vi.mocked(attachToTab).mockResolvedValue({ ok: true, url: 'https://google.com' });

      const dispatch = vi.fn();
      const screen = await renderToolbar({ attachedUrl: 'https://example.com', attachedTabId: 1, dispatch });

      const select = screen.container.querySelector('select[title="Switch tab"]') as HTMLSelectElement;
      select.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      await vi.waitFor(() => {
        expect(select.querySelectorAll('option').length).toBe(2);
      });

      await userEvent.selectOptions(select, 'google.com'); // select by label text

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'ATTACH_START' });
        expect(attachToTab).toHaveBeenCalledWith(2);
        expect(dispatch).toHaveBeenCalledWith({ type: 'ATTACH_SUCCESS', url: 'https://google.com', tabId: 2 });
      });
    });

    it('dispatches ATTACH_FAIL when attachToTab returns error', async () => {
      vi.mocked(attachToTab).mockResolvedValue({ ok: false, error: 'Cannot attach' });

      const dispatch = vi.fn();
      const screen = await renderToolbar({ attachedUrl: 'https://example.com', attachedTabId: 1, dispatch });

      const select = screen.container.querySelector('select[title="Switch tab"]') as HTMLSelectElement;
      select.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      await vi.waitFor(() => expect(select.querySelectorAll('option').length).toBe(2));

      await userEvent.selectOptions(select, 'google.com'); // select by label text

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'ATTACH_FAIL' });
      });
    });

    it('filters out chrome-extension:// tabs but keeps chrome:// and about: tabs', async () => {
      (window.chrome.tabs.query as ReturnType<typeof vi.fn>).mockResolvedValue([
        { id: 1, url: 'https://example.com', title: 'Example' },
        { id: 2, url: 'chrome://newtab/', title: 'New Tab' },
        { id: 3, url: 'chrome-extension://abc/panel.html', title: 'Panel' },
        { id: 4, url: 'about:blank', title: 'Blank' },
      ]);

      const screen = await renderToolbar();
      const select = screen.container.querySelector('select[title="Switch tab"]') as HTMLSelectElement;
      select.dispatchEvent(new FocusEvent('focus', { bubbles: true }));

      await vi.waitFor(() => {
        const options = select.querySelectorAll('option');
        // placeholder + example.com + chrome://newtab + about:blank (chrome-extension:// excluded)
        expect(options.length).toBe(4);
        const values = Array.from(options).map(o => (o as HTMLOptionElement).value);
        expect(values).not.toContain('3'); // chrome-extension:// tab excluded
        expect(values).toContain('1');     // https://example.com included
        expect(values).toContain('2');     // chrome://newtab included
        expect(values).toContain('4');     // about:blank included
      });
    });
  });

  // ─── Editor mode toggle ────────────────────────────────────────────────────

  describe('editor mode toggle', () => {
    it('should render segmented control with both modes', async () => {
      const screen = await renderToolbar({ editorMode: 'pw' });
      const toggle = screen.container.querySelector('[data-testid="mode-toggle"]');
      expect(toggle).not.toBeNull();
      expect(toggle?.textContent).toContain('.pw');
      expect(toggle?.textContent).toContain('JS');
      expect(toggle?.querySelector('button[data-active]')?.textContent).toBe('.pw');
    });

    it('should dispatch SET_EDITOR_MODE js when JS button clicked', async () => {
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorMode: 'pw', dispatch });

      const buttons = screen.container.querySelectorAll('[data-testid="mode-toggle"] button');
      const jsButton = Array.from(buttons).find(b => b.textContent === 'JS') as HTMLButtonElement;
      jsButton.click();

      // dispatch happens after storeSettings resolves (async)
      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EDITOR_MODE', mode: 'js' });
      });
    });

    it('should dispatch SET_EDITOR_MODE pw when .pw button clicked', async () => {
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorMode: 'js', dispatch });

      const buttons = screen.container.querySelectorAll('[data-testid="mode-toggle"] button');
      const pwButton = Array.from(buttons).find(b => b.textContent === '.pw') as HTMLButtonElement;
      pwButton.click();

      // dispatch happens after storeSettings resolves (async)
      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EDITOR_MODE', mode: 'pw' });
      });
    });

    it('step button is hidden in JS mode', async () => {
      const screen = await renderToolbar({
        editorContent: 'goto https://example.com',
        editorMode: 'js',
      });

      const stepBtn = screen.container.querySelector('#step-btn');
      expect(stepBtn).toBeNull();
    });

    it('debug button is visible in JS mode', async () => {
      const screen = await renderToolbar({
        editorContent: 'goto https://example.com',
        editorMode: 'js',
      });

      const debugBtn = screen.container.querySelector('#debug-btn') as HTMLButtonElement;
      expect(debugBtn).not.toBeNull();
      expect(debugBtn.disabled).toBe(false);
    });

    it('debug button is hidden in pw mode', async () => {
      const screen = await renderToolbar({
        editorContent: 'goto https://example.com',
        editorMode: 'pw',
      });

      const debugBtn = screen.container.querySelector('#debug-btn');
      expect(debugBtn).toBeNull();
    });

    it('step button is enabled in pw mode with content', async () => {
      const screen = await renderToolbar({
        editorContent: 'goto https://example.com',
        editorMode: 'pw',
      });

      const stepBtn = screen.container.querySelector('#step-btn') as HTMLButtonElement;
      expect(stepBtn.disabled).toBe(false);
    });

    // JS mode always uses swDebugEval
    it('should call swDebugEval and dispatch in JS mode', async () => {
      const dispatch = vi.fn();
      const screen = await renderToolbar({
        editorContent: 'document.title',
        editorMode: 'js',
        dispatch,
      });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_START' });
        expect(swDebugEval).toHaveBeenCalledWith('document.title');
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: '(run JS script)', type: 'command' } });
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success', time: expect.any(Number) } });
        expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_STOP' });
      });
    });

    it('should not call executeCommand in JS mode', async () => {
      const screen = await renderToolbar({
        editorContent: 'document.title',
        editorMode: 'js',
      });

      await screen.getByText('▶').click();

      await vi.waitFor(() => expect(swDebugEval).toHaveBeenCalled());
      expect(executeCommand).not.toHaveBeenCalled();
    });

    it('should dispatch COMMAND_SUCCESS with number result in JS mode', async () => {
      vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'number', value: 6 } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: '6', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: '6', type: 'success', time: expect.any(Number) } });
      });
    });

    // 'true' → detectMode='pw' (word with no special chars) → swDebugEval
    it('should dispatch COMMAND_SUCCESS with boolean result in JS mode', async () => {
      vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'boolean', value: true } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: 'true', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'true', type: 'success', time: expect.any(Number) } });
      });
    });

    // 'void 0' → detectMode='pw' → swDebugEval
    it('should dispatch COMMAND_SUCCESS with Done for undefined result in JS mode', async () => {
      vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'undefined' } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: 'void 0', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success', time: expect.any(Number) } });
      });
    });

    // '({})' → runJsScript → swDebugEval; dispatches value (ObjectTree) not text
    it('should dispatch COMMAND_SUCCESS with value for object result in JS mode', async () => {
      vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'object', description: 'Object' } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: '({})', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: expect.objectContaining({
          type: 'success',
          time: expect.any(Number),
          value: expect.objectContaining({ __type: 'object', cls: 'Object' }),
        }) });
      });
    });

    // 'invalid()' → runJsScript → swDebugEval throws
    it('should dispatch COMMAND_ERROR when swDebugEval throws in JS mode', async () => {
      vi.mocked(swDebugEval).mockRejectedValue(new Error('ReferenceError: invalid is not defined'));
      const dispatch = vi.fn();
      const screen = await renderToolbar({
        editorContent: 'invalid()',
        editorMode: 'js',
        dispatch,
      });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({
          type: 'COMMAND_ERROR',
          line: { text: 'ReferenceError: invalid is not defined', type: 'error' },
        });
      });
    });


    it('shows stop button when isRunning is true', async () => {
      const screen = await renderToolbar({ isRunning: true, editorContent: 'goto https://example.com' });
      const stopBtn = screen.container.querySelector('#stop-run-btn') as HTMLButtonElement;
      const runBtn = screen.container.querySelector('#run-btn');
      expect(stopBtn).not.toBeNull();
      expect(runBtn).toBeNull();
    });

    it('shows run button when isRunning is false', async () => {
      const screen = await renderToolbar({ isRunning: false, editorContent: 'goto https://example.com' });
      const runBtn = screen.container.querySelector('#run-btn') as HTMLButtonElement;
      const stopBtn = screen.container.querySelector('#stop-run-btn');
      expect(runBtn).not.toBeNull();
      expect(stopBtn).toBeNull();
    });

    it('stop button dispatches RUN_STOP', async () => {
      const dispatch = vi.fn();
      const screen = await renderToolbar({ isRunning: true, editorContent: 'goto https://example.com', dispatch });
      const stopBtn = screen.container.querySelector('#stop-run-btn') as HTMLButtonElement;
      stopBtn.click();
      expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_STOP' });
    });

    it('save uses .js extension in JS mode', async () => {
      const screen = await renderToolbar({ editorContent: 'document.title', editorMode: 'js' });

      const mockWritable = { write: vi.fn(), close: vi.fn() };
      const mockFileHandle = { name: 'commands.js', createWritable: vi.fn().mockResolvedValue(mockWritable) };
      window.showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle) as any;

      const saveBtn = screen.container.querySelector('#save-btn') as HTMLButtonElement;
      saveBtn.click();

      await vi.waitFor(() => {
        const opts = (window.showSaveFilePicker as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(opts.suggestedName).toMatch(/\.js$/);
        expect(opts.types[0].accept).toHaveProperty('text/javascript');
      });
    });

    it('save uses .js extension in JS mode', async () => {
      const screen = await renderToolbar({ editorContent: 'document.title', editorMode: 'js' });

      const mockWritable = { write: vi.fn(), close: vi.fn() };
      const mockFileHandle = { name: 'script.js', createWritable: vi.fn().mockResolvedValue(mockWritable) };
      window.showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle) as any;

      const saveBtn = screen.container.querySelector('#save-btn') as HTMLButtonElement;
      saveBtn.click();

      await vi.waitFor(() => {
        const opts = (window.showSaveFilePicker as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(opts.suggestedName).toMatch(/\.js$/);
      });
    });
  });
});
