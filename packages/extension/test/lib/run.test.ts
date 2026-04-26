import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mocks ──────────────────────────────────────────────────────────────────

const mockExecuteCommand = vi.fn();
vi.mock('@/lib/bridge', () => ({
    executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
}));

const mockFilterResponse = vi.fn((text: string) => text);
vi.mock('@/lib/filter', () => ({
    filterResponse: (...args: [string]) => mockFilterResponse(...args),
}));

vi.mock('@/lib/commands', () => ({
    COMMANDS: {
        click: { desc: 'Click an element', usage: 'click <ref>', examples: ['click e5'] },
        snapshot: { desc: 'Take snapshot' },
    },
    CATEGORIES: { 'Actions': ['click', 'fill'], 'Navigation': ['goto'] },
    JS_CATEGORIES: { 'Navigation': ['page.goto'], 'Selectors': ['page.locator'] },
}));

const mockGetCommandHistory = vi.fn(() => [] as string[]);
const mockClearHistory = vi.fn();
const mockAddCommand = vi.fn();
vi.mock('@/lib/command-history', () => ({
    getCommandHistory: () => mockGetCommandHistory(),
    clearHistory: () => mockClearHistory(),
    addCommand: (cmd: string) => mockAddCommand(cmd),
}));

const mockSwDebugEval = vi.fn();
const mockSwDebugEvalRaw = vi.fn();
const mockSwGetProperties = vi.fn();
const mockSwDebuggerEnable = vi.fn().mockResolvedValue(undefined);
const mockSwDebuggerDisable = vi.fn().mockResolvedValue(undefined);
const mockSwDebugPause = vi.fn().mockResolvedValue(undefined);
const mockOnDebugPaused = vi.fn();
vi.mock('@/lib/sw-debugger', () => ({
    swDebugEval: (...args: unknown[]) => mockSwDebugEval(...args),
    swDebugEvalRaw: (...args: unknown[]) => mockSwDebugEvalRaw(...args),
    swGetProperties: (...args: unknown[]) => mockSwGetProperties(...args),
    swDebuggerEnable: (...args: unknown[]) => mockSwDebuggerEnable(...args),
    swDebuggerDisable: (...args: unknown[]) => mockSwDebuggerDisable(...args),
    swDebugPause: (...args: unknown[]) => mockSwDebugPause(...args),
    onDebugPaused: (...args: unknown[]) => mockOnDebugPaused(...args),
    swDebugResume: vi.fn().mockResolvedValue(undefined),
    swDebugStepOver: vi.fn().mockResolvedValue(undefined),
    swDebugStepInto: vi.fn().mockResolvedValue(undefined),
    swDebugStepOut: vi.fn().mockResolvedValue(undefined),
    swSetBreakpointByUrl: vi.fn().mockResolvedValue('bp-1'),
    swTrackBreakpoint: vi.fn(),
    swRemoveAllBreakpoints: vi.fn().mockResolvedValue(undefined),
}));

const mockFromCdpRemoteObject = vi.fn((_obj: unknown) => ({ __type: 'string', v: 'mocked' }) as Record<string, unknown>);
vi.mock('@/components/Console/cdpToSerialized', () => ({
    fromCdpRemoteObject: (obj: unknown) => mockFromCdpRemoteObject(obj),
}));

import { runAndDispatch, runJsScript, runJsScriptStep } from '@/lib/run';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createDispatch() {
    return vi.fn() as unknown as React.Dispatch<unknown> & ReturnType<typeof vi.fn>;
}

// ─── Setup ──────────────────────────────────────────────────────────────────

beforeEach(() => {
    vi.clearAllMocks();
    mockFilterResponse.mockImplementation((text: string) => text);
});

// ─── runAndDispatch: local commands ─────────────────────────────────────────

describe('runAndDispatch', () => {
    it('returns early for empty input', async () => {
        const dispatch = createDispatch();
        const result = await runAndDispatch('', dispatch);
        expect(result).toEqual({ text: '', isError: false });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('returns early for whitespace-only input', async () => {
        const dispatch = createDispatch();
        const result = await runAndDispatch('   ', dispatch);
        expect(result).toEqual({ text: '', isError: false });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('dispatches comment for # lines', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('# this is a comment', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'ADD_LINE',
            line: { text: '# this is a comment', type: 'comment' },
        });
    });

    it('dispatches CLEAR_CONSOLE for "clear"', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('clear', dispatch);
        expect(dispatch).toHaveBeenCalledWith({ type: 'CLEAR_CONSOLE' });
    });

    it('dispatches help text for "help"', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('help', dispatch);
        expect(dispatch).toHaveBeenCalledWith(
            expect.objectContaining({
                type: 'ADD_LINE',
                line: expect.objectContaining({ type: 'info' }),
            }),
        );
        const text = dispatch.mock.calls[0][0].line.text;
        expect(text).toContain('Keyword commands');
        expect(text).toContain('Actions');
    });

    it('dispatches js help for "help js"', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('help js', dispatch);
        const text = dispatch.mock.calls[0][0].line.text;
        expect(text).toContain('JavaScript mode');
        expect(text).toContain('page.goto');
    });

    it('dispatches js help for "help javascript"', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('help javascript', dispatch);
        const text = dispatch.mock.calls[0][0].line.text;
        expect(text).toContain('JavaScript mode');
    });

    it('dispatches per-command help for "help click"', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('help click', dispatch);
        const text = dispatch.mock.calls[0][0].line.text;
        expect(text).toContain('Click an element');
        expect(text).toContain('Usage:');
        expect(text).toContain('Examples:');
        expect(text).toContain('click e5');
    });

    it('dispatches error for unknown help command', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('help unknowncmd', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'ADD_LINE',
            line: { text: 'Unknown command: "unknowncmd". Type "help" for available commands.', type: 'error' },
        });
    });

    it('dispatches history with items', async () => {
        mockGetCommandHistory.mockReturnValue(['click e5', 'snapshot']);
        const dispatch = createDispatch();
        await runAndDispatch('history', dispatch);
        const text = dispatch.mock.calls[0][0].line.text;
        expect(text).toBe('click e5\nsnapshot');
    });

    it('dispatches empty history message', async () => {
        mockGetCommandHistory.mockReturnValue([]);
        const dispatch = createDispatch();
        await runAndDispatch('history', dispatch);
        const text = dispatch.mock.calls[0][0].line.text;
        expect(text).toBe('(no history)');
    });

    it('clears history for "history clear"', async () => {
        const dispatch = createDispatch();
        await runAndDispatch('history clear', dispatch);
        expect(mockClearHistory).toHaveBeenCalled();
        expect(dispatch).toHaveBeenCalledWith({
            type: 'ADD_LINE',
            line: { text: 'History cleared.', type: 'info' },
        });
    });

    // ─── runAndDispatch: run-code ───────────────────────────────────────────

    it('handles run-code with string result', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'string', value: 'hello' } });
        const dispatch = createDispatch();
        const result = await runAndDispatch('run-code "hello"', dispatch);
        expect(mockAddCommand).toHaveBeenCalledWith('run-code "hello"');
        expect(result).toEqual({ text: 'hello', isError: false });
    });

    it('handles run-code with number result', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'number', value: 42 } });
        const dispatch = createDispatch();
        const result = await runAndDispatch('run-code 21+21', dispatch);
        expect(result).toEqual({ text: '42', isError: false });
    });

    it('handles run-code with undefined result', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'undefined' } });
        const dispatch = createDispatch();
        const result = await runAndDispatch('run-code void 0', dispatch);
        expect(result).toEqual({ text: 'Done', isError: false });
    });

    it('handles run-code with object result as Done', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'object', className: 'Object' } });
        const dispatch = createDispatch();
        const result = await runAndDispatch('run-code {}', dispatch);
        expect(result).toEqual({ text: 'Done', isError: false });
    });

    it('handles run-code with function result as Done', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'function' } });
        const dispatch = createDispatch();
        const result = await runAndDispatch('run-code () => {}', dispatch);
        expect(result).toEqual({ text: 'Done', isError: false });
    });

    it('handles run-code error', async () => {
        mockSwDebugEval.mockRejectedValue(new Error('eval failed\n    at eval:1:1\n    at Object.run'));
        const dispatch = createDispatch();
        const result = await runAndDispatch('run-code bad()', dispatch);
        expect(result).toEqual({ text: 'eval failed', isError: true });
    });

    // ─── runAndDispatch: normal commands ─────────────────────────────────────

    it('dispatches success for normal command', async () => {
        mockExecuteCommand.mockResolvedValue({ text: '### Result\nClicked', isError: false });
        mockFilterResponse.mockReturnValue('Clicked');
        const dispatch = createDispatch();
        const result = await runAndDispatch('click e5', dispatch);
        expect(mockAddCommand).toHaveBeenCalledWith('click e5');
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUBMITTED',
            line: { text: 'click e5', type: 'command' },
        });
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'Clicked', type: 'success', time: expect.any(Number), image: undefined },
        });
        expect(result).toEqual({ text: '### Result\nClicked', isError: false });
    });

    it('dispatches snapshot type for snapshot command', async () => {
        mockExecuteCommand.mockResolvedValue({ text: '### Snapshot\n- tree', isError: false });
        mockFilterResponse.mockReturnValue('- tree');
        const dispatch = createDispatch();
        await runAndDispatch('snapshot', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: '- tree', type: 'snapshot', time: expect.any(Number) },
        });
    });

    it('dispatches error type when result.isError is true', async () => {
        mockExecuteCommand.mockResolvedValue({ text: 'Not found', isError: true });
        mockFilterResponse.mockReturnValue('Not found');
        const dispatch = createDispatch();
        await runAndDispatch('click e99', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'Not found', type: 'error', time: expect.any(Number), image: undefined },
        });
    });

    it('dispatches screenshot type when result has image', async () => {
        mockExecuteCommand.mockResolvedValue({ text: '', isError: false, image: 'data:image/png;base64,...' });
        mockFilterResponse.mockReturnValue('');
        const dispatch = createDispatch();
        await runAndDispatch('screenshot', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: '', type: 'screenshot', time: expect.any(Number), image: 'data:image/png;base64,...' },
        });
    });

    it('dispatches COMMAND_ERROR when executeCommand throws', async () => {
        mockExecuteCommand.mockRejectedValue(new Error('Connection lost'));
        const dispatch = createDispatch();
        const result = await runAndDispatch('click e5', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_ERROR',
            line: { text: 'Command failed. Try clicking Attach first.', type: 'error' },
        });
        expect(result).toEqual({ text: '', isError: true });
    });
});

// ─── runJsScript ────────────────────────────────────────────────────────────

describe('runJsScript', () => {
    it('dispatches COMMAND_SUBMITTED with script label', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'undefined' } });
        const dispatch = createDispatch();
        await runJsScript('1+1', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUBMITTED',
            line: { text: '(run JS script)', type: 'command' },
        });
    });

    it('dispatches Done for undefined result', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'undefined' } });
        const dispatch = createDispatch();
        await runJsScript('void 0', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'Done', type: 'success', time: expect.any(Number) },
        });
    });

    it('dispatches Done for null result', async () => {
        mockSwDebugEval.mockResolvedValue({});
        const dispatch = createDispatch();
        await runJsScript('null', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'Done', type: 'success', time: expect.any(Number) },
        });
    });

    it('dispatches string value', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'string', value: 'hello' } });
        const dispatch = createDispatch();
        await runJsScript('"hello"', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'hello', type: 'success', time: expect.any(Number) },
        });
    });

    it('dispatches stringified number', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'number', value: 42 } });
        const dispatch = createDispatch();
        await runJsScript('42', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: '42', type: 'success', time: expect.any(Number) },
        });
    });

    it('dispatches stringified boolean', async () => {
        mockSwDebugEval.mockResolvedValue({ result: { type: 'boolean', value: true } });
        const dispatch = createDispatch();
        await runJsScript('true', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'true', type: 'success', time: expect.any(Number) },
        });
    });

    it('dispatches serialized value for object result', async () => {
        const cdpObj = { type: 'object', className: 'Object', objectId: 'obj-1' };
        mockSwDebugEval.mockResolvedValue({ result: cdpObj });
        mockFromCdpRemoteObject.mockReturnValue({ __type: 'object', cls: 'Object', props: {} });
        const dispatch = createDispatch();
        await runJsScript('({a:1})', dispatch);
        expect(mockFromCdpRemoteObject).toHaveBeenCalledWith(cdpObj);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: expect.objectContaining({
                text: '',
                type: 'success',
                time: expect.any(Number),
                value: { __type: 'object', cls: 'Object', props: {} },
            }),
        });
    });

    it('dispatches COMMAND_ERROR with trimmed stack on error', async () => {
        mockSwDebugEval.mockRejectedValue(new Error('ReferenceError: x is not defined\n    at eval:1:1'));
        const dispatch = createDispatch();
        await runJsScript('x', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_ERROR',
            line: { text: 'ReferenceError: x is not defined', type: 'error' },
        });
    });
});

// ─── runJsScriptStep ────────────────────────────────────────────────────────

describe('runJsScriptStep', () => {
    beforeEach(() => {
        mockSwDebuggerEnable.mockResolvedValue(undefined);
        mockSwDebuggerDisable.mockResolvedValue(undefined);
        mockSwDebugEvalRaw.mockResolvedValue({ result: { type: 'undefined' } });
        mockSwDebugPause.mockResolvedValue(undefined);
    });

    it('dispatches debug script label', async () => {
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUBMITTED',
            line: { text: '(debug JS script)', type: 'command' },
        });
    });

    it('dispatches Done for undefined result', async () => {
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'Done', type: 'success' },
        });
    });

    it('calls Debugger.pause before evaluating code', async () => {
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        expect(mockSwDebugPause).toHaveBeenCalledTimes(1);
        expect(mockSwDebuggerEnable).toHaveBeenCalled();
        // pause should be called after enable
        const enableOrder = mockSwDebuggerEnable.mock.invocationCallOrder[0];
        const pauseOrder = mockSwDebugPause.mock.invocationCallOrder[0];
        expect(pauseOrder).toBeGreaterThan(enableOrder);
    });

    it('evaluates code with sourceURL suffix', async () => {
        const dispatch = createDispatch();
        await runJsScriptStep('await page.title()', dispatch);
        expect(mockSwDebugEvalRaw).toHaveBeenCalledWith('await page.title()\n//# sourceURL=pw-repl-debug.js');
    });

    it('dispatches Stopped for terminated execution', async () => {
        mockSwDebugEvalRaw.mockResolvedValue({
            exceptionDetails: { exception: { description: 'Script execution was terminated' } },
        });
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'ADD_LINE',
            line: { text: 'Stopped.', type: 'info' },
        });
    });

    it('dispatches COMMAND_ERROR for other errors', async () => {
        mockSwDebugEvalRaw.mockResolvedValue({
            exceptionDetails: { exception: { description: 'TypeError: cannot read\n    at eval:1:1' } },
        });
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_ERROR',
            line: { text: 'TypeError: cannot read', type: 'error' },
        });
    });

    it('disables debugger and clears pause handler on completion', async () => {
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        expect(mockSwDebuggerDisable).toHaveBeenCalled();
        expect(mockOnDebugPaused).toHaveBeenLastCalledWith(null);
    });

    it('dispatches string result', async () => {
        mockSwDebugEvalRaw.mockResolvedValue({ result: { type: 'string', value: 'ok' } });
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        expect(dispatch).toHaveBeenCalledWith({
            type: 'COMMAND_SUCCESS',
            line: { text: 'ok', type: 'success' },
        });
    });

    it('registers and unregisters pause callback', async () => {
        const dispatch = createDispatch();
        await runJsScriptStep('code', dispatch);
        // First call registers callback, last call unregisters with null
        expect(mockOnDebugPaused).toHaveBeenCalledTimes(2);
        expect(mockOnDebugPaused.mock.calls[0][0]).toBeTypeOf('function');
        expect(mockOnDebugPaused.mock.calls[1][0]).toBeNull();
    });
});
