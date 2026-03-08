/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from 'vitest-browser-react';
import { userEvent } from 'vitest/browser';

import Toolbar from '@/components/Toolbar';

// ─── Bridge mock ──────────────────────────────────────────────────────────────

vi.mock('@/lib/bridge', () => ({
  executeCommand: vi.fn(),
  cdpEvaluate: vi.fn().mockResolvedValue(undefined),
  attachToTab: vi.fn().mockResolvedValue({ ok: true, url: 'https://example.com' }),
  connectWithRetry: vi.fn().mockResolvedValue({
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
    disconnect: vi.fn(),
  }),
}));

vi.mock('@/lib/sw-debugger', () => ({
  swDebugEval: vi.fn().mockResolvedValue(undefined),
  swGetProperties: vi.fn().mockResolvedValue({ result: [] }),
}));

import { executeCommand, cdpEvaluate, attachToTab, connectWithRetry } from '@/lib/bridge';
import { swDebugEval } from '@/lib/sw-debugger';

// ─── Helper to render Toolbar with default required props ─────────────────────

function renderToolbar(overrides: Partial<Parameters<typeof Toolbar>[0]> = {}) {
  const editorRef = { current: null };
  return render(<Toolbar
    editorContent=''
    fileName=''
    editorMode='pw'
    stepLine={-1}
    attachedUrl={null}
    attachedTabId={null}
    isAttaching={false}
    isRunning={false}
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
    vi.mocked(connectWithRetry).mockResolvedValue({
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    } as unknown as chrome.runtime.Port);
    vi.mocked(swDebugEval).mockResolvedValue(undefined);
    vi.mocked(cdpEvaluate).mockResolvedValue(undefined);
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
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_FILENAME',
        fileName: 'test.pw'
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

  it('should save file and dispatch SET_FILENAME', async () => {
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
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_FILENAME', fileName: 'saved.pw' });
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
    const screen = await renderToolbar({
      editorContent: 'goto https://example.com\nclick e5',
      dispatch,
    });

    vi.mocked(executeCommand).mockResolvedValue({ text: 'Done', isError: true });

    await screen.getByText('▶').click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_LINE_RESULT', index: 0, result: 'fail' });
      expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'error' } });
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

    await screen.getByText('▷').click();

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

    await screen.getByText('▷').click();

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

    await screen.getByText('▷').click();

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

    await screen.getByText('▷').click();

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

    await screen.getByText('▷').click();

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
    await screen.getByText('▷').click();

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

  it('should send record-stop and disconnect port when stop clicked', async () => {
    const mockPort = {
      onMessage: { addListener: vi.fn() },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    } as unknown as chrome.runtime.Port;
    vi.mocked(connectWithRetry).mockResolvedValue(mockPort);

    const screen = await renderToolbar();

    await screen.getByRole('button', { name: 'Record' }).click();
    await vi.waitFor(() => expect(connectWithRetry).toHaveBeenCalled());

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

  it('should dispatch error when connectWithRetry fails', async () => {
    vi.mocked(connectWithRetry).mockRejectedValue(new Error('port error'));

    const dispatch = vi.fn();
    const screen = await renderToolbar({ dispatch });

    await screen.getByRole('button', { name: 'Record' }).click();

    await vi.waitFor(() => {
      expect(dispatch).toHaveBeenCalledWith({
        type: 'ADD_LINE',
        line: { text: 'Recording failed: could not connect to recorder.', type: 'error' }
      });
    });
  });

  it('should call insertAtCursor when port receives setSources', async () => {
    let portMessageListener: ((...args: unknown[]) => unknown) | null = null;
    const mockPort = {
      onMessage: {
        addListener: vi.fn((fn: (...args: unknown[]) => unknown) => { portMessageListener = fn; }),
      },
      onDisconnect: { addListener: vi.fn() },
      disconnect: vi.fn(),
    } as unknown as chrome.runtime.Port;
    vi.mocked(connectWithRetry).mockResolvedValue(mockPort);

    const insertAtCursor = vi.fn();
    const editorRef = { current: { insertAtCursor } };
    const screen = await renderToolbar({ editorRef: editorRef as any });

    await screen.getByRole('button', { name: 'Record' }).click();
    await vi.waitFor(() => expect(portMessageListener).not.toBeNull());

    // Simulate JSONL source message from playwright-crx recorder
    portMessageListener!({
      type: 'recorder',
      method: 'setSources',
      sources: [{
        id: 'jsonl',
        actions: [
          JSON.stringify({ name: 'click', locator: { kind: 'text', body: 'Submit' } }),
        ],
      }],
    });

    await vi.waitFor(() => {
      expect(insertAtCursor).toHaveBeenCalledWith(expect.stringContaining('click'));
    });
  });

  // ─── Export ────────────────────────────────────────────────────────────────

  it('should support export function', async () => {
    const pwCommands = `
    # command list
    goto https://example.com
    click "Learn more"
    verify-text "As described in RFC 2606 and RFC 6761"
    `;

    const dispatch = vi.fn();
    const screen = await renderToolbar({ editorContent: pwCommands, dispatch });

    await screen.getByRole('button', { name: 'Export' }).click();
    const expected_code = `
import { test, expect } from '@playwright/test';

test('recorded session', async ({ page }) => {
  // command list
  await page.goto("https://example.com");
  await page.getByText("Learn more").click();
  await expect(page.getByText("As described in RFC 2606 and RFC 6761")).toBeVisible();
});`.trim();
    expect(dispatch).toHaveBeenCalledWith({
      type: 'ADD_LINE',
      line: { text: expected_code, type: 'code-block' }
    });
  });

  // ─── Attach status indicator ───────────────────────────────────────────────

  it('shows disconnected status dot when not attached', async () => {
    const screen = await renderToolbar({ attachedUrl: null, isAttaching: false });
    const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
    expect(dot.dataset.status).toBe('disconnected');
  });

  it('shows attaching status dot when isAttaching is true', async () => {
    const screen = await renderToolbar({ attachedUrl: null, isAttaching: true });
    const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
    expect(dot.dataset.status).toBe('attaching');
  });

  it('shows connected status dot with attachedUrl', async () => {
    const screen = await renderToolbar({ attachedUrl: 'https://example.com', isAttaching: false });
    const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
    expect(dot.dataset.status).toBe('connected');
  });

  it('shows hostname in dot tooltip when attached', async () => {
    const screen = await renderToolbar({ attachedUrl: 'https://example.com', isAttaching: false });
    const dot = screen.container.querySelector('[data-testid="status-dot"]') as HTMLElement;
    expect(dot.title).toContain('example.com');
  });

  it('shows no extra text when disconnected (only dot)', async () => {
    const screen = await renderToolbar({ attachedUrl: null, isAttaching: false });
    const statusIndicator = screen.container.querySelector('[data-testid="status-indicator"]');
    expect(statusIndicator?.textContent?.trim()).toBe('');
  });

  it('shows Connecting text when isAttaching', async () => {
    const screen = await renderToolbar({ attachedUrl: null, isAttaching: true });
    await expect.element(screen.getByText('Connecting...')).toBeInTheDocument();
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

    it('filters out chrome-extension:// and about: tabs but keeps chrome:// tabs', async () => {
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
        // placeholder + example.com + chrome://newtab (chrome-extension:// and about: excluded)
        expect(options.length).toBe(3);
        const values = Array.from(options).map(o => (o as HTMLOptionElement).value);
        expect(values).not.toContain('3'); // chrome-extension:// tab excluded
        expect(values).not.toContain('4'); // about:blank excluded
        expect(values).toContain('1');     // https://example.com included
        expect(values).toContain('2');     // chrome://newtab included
      });
    });
  });

  // ─── Editor mode toggle ────────────────────────────────────────────────────

  describe('editor mode toggle', () => {
    it('should render the mode toggle button showing current mode', async () => {
      const screen = await renderToolbar({ editorMode: 'pw' });
      const toggle = screen.container.querySelector('[data-testid="mode-toggle"]');
      expect(toggle).not.toBeNull();
      expect(toggle?.textContent).toBe('.pw');
    });

    it('should dispatch SET_EDITOR_MODE js when toggled from pw', async () => {
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorMode: 'pw', dispatch });

      const toggle = screen.container.querySelector('[data-testid="mode-toggle"]') as HTMLButtonElement;
      toggle.click();

      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EDITOR_MODE', mode: 'js' });
    });

    it('should dispatch SET_EDITOR_MODE pw when toggled from js', async () => {
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorMode: 'js', dispatch });

      const toggle = screen.container.querySelector('[data-testid="mode-toggle"]') as HTMLButtonElement;
      toggle.click();

      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_EDITOR_MODE', mode: 'pw' });
    });

    it('step button is disabled in JS mode', async () => {
      const screen = await renderToolbar({
        editorContent: 'goto https://example.com',
        editorMode: 'js',
      });

      const stepBtn = screen.container.querySelector('#step-btn') as HTMLButtonElement;
      expect(stepBtn.disabled).toBe(true);
    });

    it('step button is enabled in pw mode with content', async () => {
      const screen = await renderToolbar({
        editorContent: 'goto https://example.com',
        editorMode: 'pw',
      });

      const stepBtn = screen.container.querySelector('#step-btn') as HTMLButtonElement;
      expect(stepBtn.disabled).toBe(false);
    });

    // 'document.title' → detectMode='js' → cdpEvaluate (page context)
    it('should call cdpEvaluate for page-context JS and dispatch in JS mode', async () => {
      const dispatch = vi.fn();
      const screen = await renderToolbar({
        editorContent: 'document.title',
        editorMode: 'js',
        dispatch,
      });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_START' });
        expect(cdpEvaluate).toHaveBeenCalledWith('document.title');
        expect(swDebugEval).not.toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUBMITTED', line: { text: '(run JS script)', type: 'command' } });
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success' } });
        expect(dispatch).toHaveBeenCalledWith({ type: 'RUN_STOP' });
      });
    });

    it('should not call executeCommand in JS mode', async () => {
      const screen = await renderToolbar({
        editorContent: 'document.title',
        editorMode: 'js',
      });

      await screen.getByText('▶').click();

      await vi.waitFor(() => expect(cdpEvaluate).toHaveBeenCalled());
      expect(executeCommand).not.toHaveBeenCalled();
    });

    // '6' → detectMode='js' → cdpEvaluate
    it('should dispatch COMMAND_SUCCESS with number result in JS mode', async () => {
      vi.mocked(cdpEvaluate).mockResolvedValue({ result: { type: 'number', value: 6 } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: '6', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: '6', type: 'success' } });
      });
    });

    // 'true' → detectMode='pw' (word with no special chars) → swDebugEval
    it('should dispatch COMMAND_SUCCESS with boolean result in JS mode', async () => {
      vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'boolean', value: true } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: 'true', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'true', type: 'success' } });
      });
    });

    // 'void 0' → detectMode='pw' → swDebugEval
    it('should dispatch COMMAND_SUCCESS with Done for undefined result in JS mode', async () => {
      vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'undefined' } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: 'void 0', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: { text: 'Done', type: 'success' } });
      });
    });

    // '({})' → detectMode='js' → cdpEvaluate; dispatches value (ObjectTree) not text
    it('should dispatch COMMAND_SUCCESS with value for object result in JS mode', async () => {
      vi.mocked(cdpEvaluate).mockResolvedValue({ result: { type: 'object', description: 'Object' } });
      const dispatch = vi.fn();
      const screen = await renderToolbar({ editorContent: '({})', editorMode: 'js', dispatch });

      await screen.getByText('▶').click();

      await vi.waitFor(() => {
        expect(dispatch).toHaveBeenCalledWith({ type: 'COMMAND_SUCCESS', line: expect.objectContaining({
          type: 'success',
          value: expect.objectContaining({ __type: 'object', cls: 'Object' }),
        }) });
      });
    });

    // 'invalid()' → detectMode='js' (has parens) → cdpEvaluate
    it('should dispatch COMMAND_ERROR when cdpEvaluate throws in JS mode', async () => {
      vi.mocked(cdpEvaluate).mockRejectedValue(new Error('ReferenceError: invalid is not defined'));
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

    it('export button is disabled in JS mode', async () => {
      const screen = await renderToolbar({
        editorContent: 'document.title',
        editorMode: 'js',
      });

      const exportBtn = screen.container.querySelector('#export-btn') as HTMLButtonElement;
      expect(exportBtn.disabled).toBe(true);
    });

    it('export button is enabled in pw mode with content', async () => {
      const screen = await renderToolbar({
        editorContent: 'goto https://example.com',
        editorMode: 'pw',
      });

      const exportBtn = screen.container.querySelector('#export-btn') as HTMLButtonElement;
      expect(exportBtn.disabled).toBe(false);
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

    it('save renames .pw filename to .js in JS mode', async () => {
      const screen = await renderToolbar({ editorContent: 'document.title', editorMode: 'js', fileName: 'script.pw' });

      const mockWritable = { write: vi.fn(), close: vi.fn() };
      const mockFileHandle = { name: 'script.js', createWritable: vi.fn().mockResolvedValue(mockWritable) };
      window.showSaveFilePicker = vi.fn().mockResolvedValue(mockFileHandle) as any;

      const saveBtn = screen.container.querySelector('#save-btn') as HTMLButtonElement;
      saveBtn.click();

      await vi.waitFor(() => {
        const opts = (window.showSaveFilePicker as ReturnType<typeof vi.fn>).mock.calls[0][0];
        expect(opts.suggestedName).toBe('script.js');
      });
    });
  });
});
