// Attaches the panel's debugger client to the extension's service worker target
// and evaluates expressions in the service worker's JS runtime.
// The panel is a separate context so it CAN see the SW in getTargets().
import { SerializedValue } from '@/components/Console/types';
import { CdpRemoteObject, fromCdpRemoteObject, CdpPropertyDescriptor } from '@/components/Console/cdpToSerialized';
import { cdpSendCommand, cdpGetProperties, cdpCallFunctionOn, cdpEval, getTargetId } from '../../lib/sw-debugger-core';
export { swDebugTargets } from '../../lib/sw-debugger-core';

export type ScopeInfo = {
    type: string;
    name?: string;
    objectId: string
}

export async function swGetProperties(objectId: string): Promise<unknown> {
    return cdpGetProperties(objectId);
}

export async function swCallFunctionOn(objectId: string, functionDeclaration: string): Promise<unknown> {
    return cdpCallFunctionOn(objectId, functionDeclaration);
}

export async function swDebugEval(expression: string): Promise<unknown> {
    // When paused at a breakpoint, evaluate in the call frame scope (access to local variables)
    if (pausedCallFrameId) {
        const expr = expression.trimStart().startsWith('{') ? `(${expression})` : expression;
        const result = await cdpSendCommand('Debugger.evaluateOnCallFrame', {
            callFrameId: pausedCallFrameId,
            expression: expr, awaitPromise: true, returnByValue: false, generatePreview: true, objectGroup: 'console',
        });
        if (result?.exceptionDetails) {
            const msg = result.exceptionDetails.exception?.description
                ?? result.exceptionDetails.text ?? 'Unknown error';
            throw new Error(msg);
        }
        return result;
    }
    // Normal eval — delegate to shared core (returns result.result, not the wrapper)
    const raw = await cdpEval(expression);
    return { result: raw };
}

type ConsoleCallback = (level: string, args: SerializedValue[]) => void;
let consoleCallback: ConsoleCallback | null = null;

export function onConsoleEvent(callback: ConsoleCallback | null) {
    consoleCallback = callback;
}

// ─── CDP Debugger Domain ─────────────────────────────────────────────────────

type PauseCallback = (lineNumber: number, scopes: ScopeInfo[]) => void;

let pauseCallback: PauseCallback | null = null;
let pausedCallFrameId: string | null = null;

export function onDebugPaused(callback: PauseCallback | null) {
    pauseCallback = callback;
}

export async function swDebuggerEnable(): Promise<void> {
    await cdpSendCommand('Debugger.enable');
}

export async function swDebuggerDisable(): Promise<void> {
    pausedCallFrameId = null;
    await cdpSendCommand('Debugger.disable');
}

export async function swSetBreakpointByUrl(url: string, lineNumber: number): Promise<string> {
    const result = await cdpSendCommand('Debugger.setBreakpointByUrl', { url, lineNumber });
    return result?.breakpointId ?? '';
}

/** Like swDebugEval but returns raw result (doesn't reject on exceptions). */
export async function swDebugEvalRaw(expression: string): Promise<{ result?: any; exceptionDetails?: any }> {
    return cdpSendCommand('Runtime.evaluate', {
        expression, awaitPromise: true, returnByValue: false, generatePreview: true, replMode: true,
    });
}

const activeBreakpointIds: string[] = [];

export function swTrackBreakpoint(breakpointId: string) {
    activeBreakpointIds.push(breakpointId);
}

export async function swRemoveAllBreakpoints(): Promise<void> {
    const ids = activeBreakpointIds.splice(0);
    for (const id of ids) await swRemoveBreakpoint(id).catch(() => {});
}

export async function swRemoveBreakpoint(breakpointId: string): Promise<void> {
    await cdpSendCommand('Debugger.removeBreakpoint', { breakpointId });
}

export async function swDebugResume(): Promise<void> {
    await cdpSendCommand('Debugger.resume');
}

export async function swDebugPause(): Promise<void> {
    await cdpSendCommand('Debugger.pause');
}

export async function swDebugStepOver(): Promise<void> {
    await cdpSendCommand('Debugger.stepOver');
}

export async function swDebugStepInto(): Promise<void> {
    await cdpSendCommand('Debugger.stepInto');
}

export async function swDebugStepOut(): Promise<void> {
    await cdpSendCommand('Debugger.stepOut');
}

export async function swTerminateExecution(): Promise<void> {
    await cdpSendCommand('Runtime.terminateExecution');
}

async function eagerSerialize(obj: CdpRemoteObject, depth = 0, visited = new Set<string>()): Promise<SerializedValue> {
    // Primitives — delegate to existing converter
    if (obj.type !== 'object' || !obj.objectId) return fromCdpRemoteObject(obj);
    if (depth > 3) return fromCdpRemoteObject(obj);  // preview-only at depth limit
    if (visited.has(obj.objectId)) return { __type: 'circular' };
    visited.add(obj.objectId);

    // Fetch own properties eagerly
    const raw = await swGetProperties(obj.objectId);
    const descriptors = (raw as any)?.result as CdpPropertyDescriptor[];
    if (!descriptors) return fromCdpRemoteObject(obj);

    const props: Record<string, SerializedValue> = {};
    for (const desc of descriptors) {
        if (!desc.value) continue;
        props[desc.name] = await eagerSerialize(desc.value, depth + 1, visited);
    }

    const cls = obj.className ?? 'Object';
    if (obj.subtype === 'array') {
        return { __type: 'array', cls, len: descriptors.length, props };
        // No objectId — fully serialized, no lazy expand
    }
    return { __type: 'object', cls, props };
}

chrome.debugger.onEvent.addListener(async (source, method, params: any) => {
    if (source.targetId !== getTargetId()) return;

    if (method === 'Debugger.paused') {
        if (params.callFrames?.length > 0) {
            pausedCallFrameId = params.callFrames[0].callFrameId;
            const scopes: ScopeInfo[] = (params.callFrames[0].scopeChain ?? [])
            .filter((s:any) => s.type !== 'global')
            .map((s:any) => ({ type: s.type, name: s.name, objectId: s.object.objectId }));
            pauseCallback?.(params.callFrames[0].location.lineNumber, scopes);
        }
        return;
    }
    if (method === 'Debugger.resumed') {
        pausedCallFrameId = null;
        return;
    }

    if (method !== 'Runtime.consoleAPICalled') return;
    if (!consoleCallback) return;

    const level = params.type; // 'log', 'error', 'warn', 'info', etc.
    try {
        const serialized: SerializedValue[] = [];
        for (const arg of params.args) {
            try {
                serialized.push(await eagerSerialize(arg));
            } catch {
                serialized.push(fromCdpRemoteObject(arg));
            }
        }
        consoleCallback(level, serialized);
    } catch { /* prevent unhandled rejection from killing the listener */ }
});