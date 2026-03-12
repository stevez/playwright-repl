import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    tryReturnLastExpr,
    swDebugTargets,
    swGetProperties,
    swCallFunctionOn,
    swDebugEval,
    onConsoleEvent,
} from '@/lib/sw-debugger';

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Make chrome.debugger.getTargets call back with given targets */
function mockGetTargets(targets: Array<{ id: string; type: string; url: string }>) {
    (chrome.debugger.getTargets as ReturnType<typeof vi.fn>).mockImplementation(
        (cb: (t: any[]) => void) => cb(targets)
    );
}

/** Make chrome.debugger.attach succeed */
function mockAttachSuccess() {
    (chrome.debugger.attach as ReturnType<typeof vi.fn>).mockImplementation(
        (_target: any, _version: string, cb: () => void) => {
            Object.defineProperty(chrome.runtime, 'lastError', { get: () => undefined, configurable: true });
            cb();
        }
    );
}

/** Make chrome.debugger.sendCommand call back with given result */
function mockSendCommand(result: any) {
    (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mockImplementation(
        (_target: any, _method: string, _params: any, cb: (r: any) => void) => {
            Object.defineProperty(chrome.runtime, 'lastError', { get: () => undefined, configurable: true });
            cb(result);
        }
    );
}

const SW_TARGET = { id: 'target-1', type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js` };

/** Reset module-level swTargetId by firing the onDetach event (vitest-chrome's callListeners) */
function resetSwTargetId() {
    (chrome.debugger.onDetach as any).callListeners({ targetId: 'target-1' });
}

// ─── tryReturnLastExpr ──────────────────────────────────────────────────────

describe('tryReturnLastExpr', () => {

    // ─── Adds return ────────────────────────────────────────────────────────

    it('adds return before a simple expression', () => {
        expect(tryReturnLastExpr('1 + 2')).toBe('return 1 + 2');
    });

    it('adds return before a function call', () => {
        expect(tryReturnLastExpr('inc(5)')).toBe('return inc(5)');
    });

    it('adds return to the last line of a multi-line script', () => {
        const input = 'const inc = (a) => a + 1\ninc(5)';
        expect(tryReturnLastExpr(input)).toBe('const inc = (a) => a + 1\nreturn inc(5)');
    });

    it('preserves leading whitespace when inserting return', () => {
        const input = 'function f() {}\n  f()';
        expect(tryReturnLastExpr(input)).toBe('function f() {}\n  return f()');
    });

    it('ignores trailing empty lines and inserts return on last non-empty line', () => {
        const input = 'inc(5)\n\n';
        expect(tryReturnLastExpr(input)).toBe('return inc(5)\n\n');
    });

    // ─── Does NOT add return ─────────────────────────────────────────────────

    it('does not add return before const declaration', () => {
        const input = 'const x = 5';
        expect(tryReturnLastExpr(input)).toBe('const x = 5');
    });

    it('does not add return before let declaration', () => {
        expect(tryReturnLastExpr('let x = 5')).toBe('let x = 5');
    });

    it('does not add return before var declaration', () => {
        expect(tryReturnLastExpr('var x = 5')).toBe('var x = 5');
    });

    it('does not add return before function declaration', () => {
        expect(tryReturnLastExpr('function f() {}')).toBe('function f() {}');
    });

    it('does not add return before if statement', () => {
        expect(tryReturnLastExpr('if (x) {}')).toBe('if (x) {}');
    });

    it('does not add return before for loop', () => {
        expect(tryReturnLastExpr('for (let i=0;i<3;i++) {}')).toBe('for (let i=0;i<3;i++) {}');
    });

    it('does not add return if already has return', () => {
        expect(tryReturnLastExpr('return 42')).toBe('return 42');
    });

    it('does not add return before throw', () => {
        expect(tryReturnLastExpr('throw new Error("x")')).toBe('throw new Error("x")');
    });

    it('returns empty string unchanged', () => {
        expect(tryReturnLastExpr('')).toBe('');
    });
});

// ─── swDebugTargets ──────────────────────────────────────────────────────────

describe('swDebugTargets', () => {
    it('returns targets from chrome.debugger.getTargets', async () => {
        const targets = [SW_TARGET];
        mockGetTargets(targets);
        const result = await swDebugTargets();
        expect(result).toEqual(targets);
    });
});

// ─── swDebugEval ─────────────────────────────────────────────────────────────

describe('swDebugEval', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSwTargetId();
        (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it('evaluates a simple expression in the SW context', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'number', value: 42 } });

        const result = await swDebugEval('1 + 1');
        expect(result).toEqual({ result: { type: 'number', value: 42 } });
        // Simple expression — wrapped as arrow
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
            { targetId: 'target-1' },
            'Runtime.evaluate',
            expect.objectContaining({ expression: expect.stringContaining('return (1 + 1)') }),
            expect.any(Function),
        );
    });

    it('wraps multi-line expression with AsyncFunction constructor', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'undefined' } });

        await swDebugEval('const x = 1\nx + 1');
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
            { targetId: 'target-1' },
            'Runtime.evaluate',
            expect.objectContaining({ expression: expect.stringContaining('Object.getPrototypeOf') }),
            expect.any(Function),
        );
    });

    it('wraps statement-ending expression with AsyncFunction constructor', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'undefined' } });

        await swDebugEval('doSomething();');
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
            { targetId: 'target-1' },
            'Runtime.evaluate',
            expect.objectContaining({ expression: expect.stringContaining('Object.getPrototypeOf') }),
            expect.any(Function),
        );
    });

    it('rejects with exceptionDetails message', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ exceptionDetails: { exception: { description: 'ReferenceError: x is not defined' } } });

        await expect(swDebugEval('x')).rejects.toThrow('ReferenceError: x is not defined');
    });

    it('rejects with exceptionDetails text fallback', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ exceptionDetails: { text: 'Compile error' } });

        await expect(swDebugEval('{')).rejects.toThrow('Compile error');
    });

    it('rejects with Unknown error when exceptionDetails has no message', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ exceptionDetails: {} });

        await expect(swDebugEval('bad')).rejects.toThrow('Unknown error');
    });

    it('rejects when chrome.runtime.lastError is set on sendCommand', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mockImplementation(
            (_target: any, _method: string, _params: any, cb: (r: any) => void) => {
                Object.defineProperty(chrome.runtime, 'lastError', {
                    get: () => ({ message: 'Debugger is not attached' }),
                    configurable: true,
                });
                cb(undefined);
            }
        );

        await expect(swDebugEval('1')).rejects.toThrow('Debugger is not attached');
    });

    it('throws when SW target not found', async () => {
        mockGetTargets([]);
        await expect(swDebugEval('1')).rejects.toThrow('Background worker target not found');
    });

    it('reuses existing attachment when swTargetId matches', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'number', value: 1 } });

        // First call — attaches
        await swDebugEval('1');
        // Second call — should reuse (no new attach call)
        const attachCount1 = (chrome.debugger.attach as ReturnType<typeof vi.fn>).mock.calls.length;
        await swDebugEval('2');
        const attachCount2 = (chrome.debugger.attach as ReturnType<typeof vi.fn>).mock.calls.length;
        expect(attachCount2).toBe(attachCount1);
    });

    it('handles "already attached" error by reusing target', async () => {
        mockGetTargets([SW_TARGET]);
        (chrome.debugger.attach as ReturnType<typeof vi.fn>).mockImplementation(
            (_target: any, _version: string, cb: () => void) => {
                Object.defineProperty(chrome.runtime, 'lastError', {
                    get: () => ({ message: 'Another debugger is already attached' }),
                    configurable: true,
                });
                cb();
            }
        );
        mockSendCommand({ result: { type: 'string', value: 'ok' } });

        const result = await swDebugEval('test');
        expect(result).toEqual({ result: { type: 'string', value: 'ok' } });
    });

    it('rejects with attach error when not "already attached"', async () => {
        mockGetTargets([SW_TARGET]);
        (chrome.debugger.attach as ReturnType<typeof vi.fn>).mockImplementation(
            (_target: any, _version: string, cb: () => void) => {
                Object.defineProperty(chrome.runtime, 'lastError', {
                    get: () => ({ message: 'Cannot attach to this target' }),
                    configurable: true,
                });
                cb();
            }
        );

        await expect(swDebugEval('1')).rejects.toThrow('Cannot attach to this target');
    });
});

// ─── swGetProperties ─────────────────────────────────────────────────────────

describe('swGetProperties', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSwTargetId();
        (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it('returns properties from Runtime.getProperties', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        const props = { result: [{ name: 'x', value: { type: 'number', value: 1 } }] };
        mockSendCommand(props);

        const result = await swGetProperties('obj-1');
        expect(result).toEqual(props);
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
            { targetId: 'target-1' },
            'Runtime.getProperties',
            expect.objectContaining({ objectId: 'obj-1', ownProperties: true }),
            expect.any(Function),
        );
    });

    it('rejects and clears swTargetId when lastError on getProperties', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        // First call to sendCommand succeeds (Runtime.enable), second fails
        (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mockImplementation(
            (_target: any, method: string, _params: any, cb: (r: any) => void) => {
                if (method === 'Runtime.getProperties') {
                    Object.defineProperty(chrome.runtime, 'lastError', {
                        get: () => ({ message: 'Object has been collected' }),
                        configurable: true,
                    });
                } else {
                    Object.defineProperty(chrome.runtime, 'lastError', {
                        get: () => undefined,
                        configurable: true,
                    });
                }
                cb(undefined);
            }
        );

        await expect(swGetProperties('obj-gone')).rejects.toThrow('Object has been collected');
    });
});

// ─── swCallFunctionOn ────────────────────────────────────────────────────────

describe('swCallFunctionOn', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resetSwTargetId();
        (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    });

    it('calls Runtime.callFunctionOn and returns result', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { value: '{"a":1}' } });

        const result = await swCallFunctionOn('obj-1', 'function() { return JSON.stringify(this); }');
        expect(result).toEqual({ result: { value: '{"a":1}' } });
    });

    it('rejects when lastError is set', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mockImplementation(
            (_target: any, method: string, _params: any, cb: (r: any) => void) => {
                if (method === 'Runtime.callFunctionOn') {
                    Object.defineProperty(chrome.runtime, 'lastError', {
                        get: () => ({ message: 'Function call failed' }),
                        configurable: true,
                    });
                } else {
                    Object.defineProperty(chrome.runtime, 'lastError', {
                        get: () => undefined,
                        configurable: true,
                    });
                }
                cb(undefined);
            }
        );

        await expect(swCallFunctionOn('obj-1', 'function() {}')).rejects.toThrow('Function call failed');
    });
});

// ─── onConsoleEvent ──────────────────────────────────────────────────────────

describe('onConsoleEvent', () => {
    it('sets and clears the console callback', () => {
        const cb = vi.fn();
        onConsoleEvent(cb);
        // Setting again to null should not throw
        onConsoleEvent(null);
    });
});
