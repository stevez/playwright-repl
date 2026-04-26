import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
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
        (cb: (t: Array<{ id: string; type: string; url: string }>) => void) => cb(targets)
    );
}

/** Make chrome.debugger.attach succeed */
function mockAttachSuccess() {
    (chrome.debugger.attach as ReturnType<typeof vi.fn>).mockImplementation(
        (_target: unknown, _version: string, cb: () => void) => {
            Object.defineProperty(chrome.runtime, 'lastError', { get: () => undefined, configurable: true });
            cb();
        }
    );
}

/** Make chrome.debugger.sendCommand call back with given result */
function mockSendCommand(result: unknown) {
    (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mockImplementation(
        (_target: unknown, _method: string, _params: unknown, cb: (r: unknown) => void) => {
            Object.defineProperty(chrome.runtime, 'lastError', { get: () => undefined, configurable: true });
            cb(result);
        }
    );
}

const SW_TARGET = { id: 'target-1', type: 'worker', url: `chrome-extension://${chrome.runtime.id}/background.js` };

/** Reset module-level swTargetId by firing the onDetach event (vitest-chrome's callListeners) */
function resetSwTargetId() {
    (chrome.debugger.onDetach as unknown as { callListeners: (...args: unknown[]) => void }).callListeners({ targetId: 'target-1' });
}

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

    it('evaluates expression with replMode', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'number', value: 42 } });

        const result = await swDebugEval('1 + 1');
        expect(result).toEqual({ result: { type: 'number', value: 42 } });
        expect(chrome.debugger.sendCommand).toHaveBeenCalledWith(
            { targetId: 'target-1' },
            'Runtime.evaluate',
            expect.objectContaining({
                expression: '1 + 1',
                replMode: true,
                awaitPromise: true,
            }),
            expect.any(Function),
        );
    });

    it('passes expression directly without wrapping', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'undefined' } });

        await swDebugEval('const x = 42');
        const expr = (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mock.calls
            .find((c: unknown[]) => c[1] === 'Runtime.evaluate')![2].expression;
        expect(expr).toBe('const x = 42');
    });

    it('wraps object literal in parens to avoid block parse', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'object', value: { a: 1, b: 2 } } });

        await swDebugEval('{a:1, b:2}');
        const expr = (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mock.calls
            .find((c: unknown[]) => c[1] === 'Runtime.evaluate')![2].expression;
        expect(expr).toBe('({a:1, b:2})');
    });

    it('does not wrap non-brace expressions', async () => {
        mockGetTargets([SW_TARGET]);
        mockAttachSuccess();
        mockSendCommand({ result: { type: 'undefined' } });

        await swDebugEval('const x = {a:1}');
        const expr = (chrome.debugger.sendCommand as ReturnType<typeof vi.fn>).mock.calls
            .find((c: unknown[]) => c[1] === 'Runtime.evaluate')![2].expression;
        expect(expr).toBe('const x = {a:1}');
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
            (_target: unknown, _method: string, _params: unknown, cb: (r: unknown) => void) => {
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
            (_target: unknown, _version: string, cb: () => void) => {
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
            (_target: unknown, _version: string, cb: () => void) => {
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
            (_target: unknown, method: string, _params: unknown, cb: (r: unknown) => void) => {
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
            (_target: unknown, method: string, _params: unknown, cb: (r: unknown) => void) => {
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
