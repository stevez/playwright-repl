// Attaches the panel's debugger client to the extension's service worker target
// and evaluates expressions in the service worker's JS runtime.
// The panel is a separate context so it CAN see the SW in getTargets().
import { SerializedValue } from '@/components/Console/types';
import { CdpRemoteObject, fromCdpRemoteObject, CdpPropertyDescriptor } from '@/components/Console/cdpToSerialized';

let swTargetId: string | null = null;

if (typeof chrome !== 'undefined') {
    chrome.debugger.onDetach.addListener((source) => {
        if (source.targetId === swTargetId) swTargetId = null;
    });
}

/** Debug helper — call from console: (await import('/panel/lib/sw-debugger.js')).swDebugTargets() */
export function swDebugTargets(): Promise<chrome.debugger.TargetInfo[]> {
    return new Promise(resolve => chrome.debugger.getTargets(resolve));
}

function querySwTarget(): Promise<string | null> {
    const swUrl = `chrome-extension://${chrome.runtime.id}/background.js`;
    return new Promise(resolve => {
        chrome.debugger.getTargets(targets => {
            const sw = targets.find(t => t.type === 'worker' && t.url === swUrl);
            resolve(sw?.id ?? null);
        });
    });
}

async function findSwTarget(): Promise<string | null> {
    // Wake the SW and wait for it to confirm it's alive before polling
    await chrome.runtime.sendMessage({ type: 'ping' }).catch(() => {});
    // Poll until it appears as a debuggable target (up to ~1s)
    for (let i = 0; i < 10; i++) {
        const id = await querySwTarget();
        if (id) return id;
        await new Promise(r => setTimeout(r, 100));
    }
    return null;
}

async function ensureAttached(): Promise<string> {
    const targetId = await findSwTarget();
    if (!targetId) throw new Error('Background worker target not found. Try reloading the extension.');
    if (swTargetId === targetId) return targetId;
    await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ targetId }, '1.3', () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message ?? '';
                // Extension already attached (persists after panel page closes) — reuse it
                if (/already attached/i.test(msg)) { swTargetId = targetId; resolve(); }
                else reject(new Error(msg));
            } else {
                chrome.debugger.sendCommand({ targetId }, 'Runtime.enable', {}, () => {});
                swTargetId = targetId; resolve();
            }
        });
    });
    return targetId;
}

export async function swGetProperties(objectId: string): Promise<unknown> {
    const targetId = await ensureAttached();
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand(
            { targetId },
            'Runtime.getProperties',
            { objectId, ownProperties: true, generatePreview: true },
            (result: any) => {
                if (chrome.runtime.lastError) {
                    swTargetId = null;
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            }
        );
    });
}

export async function swCallFunctionOn(objectId: string, functionDeclaration: string): Promise<unknown> {
    const targetId = await ensureAttached();
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand(
            { targetId },
            'Runtime.callFunctionOn',
            { objectId, functionDeclaration, returnByValue: true, awaitPromise: false },
            (result: any) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve(result);
            }
        );
    });
}

export async function swDebugEval(expression: string): Promise<unknown> {
    const targetId = await ensureAttached();
    // Wrap {…} in parens so V8 parses it as an object literal, not a block statement.
    // This is the same approach Chrome DevTools and Node REPL use.
    const expr = expression.trimStart().startsWith('{') ? `(${expression})` : expression;
    // replMode: true enables top-level await and returns completion values automatically.
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand(
            { targetId },
            'Runtime.evaluate',
            { expression: expr, awaitPromise: true, returnByValue: false, generatePreview: true, objectGroup: 'console', replMode: true },
            (result: any) => {
                if (chrome.runtime.lastError) {
                    swTargetId = null;
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                if (result?.exceptionDetails) {
                    const msg = result.exceptionDetails.exception?.description
                        ?? result.exceptionDetails.text
                        ?? 'Unknown error';
                    reject(new Error(msg));
                    return;
                }
                resolve(result);
            }
        );
    });
}

type ConsoleCallback = (level: string, args: SerializedValue[]) => void;
let consoleCallback: ConsoleCallback | null = null;

export function onConsoleEvent(callback: ConsoleCallback | null) {
    consoleCallback = callback;
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
    if (method !== 'Runtime.consoleAPICalled') return;
    if (source.targetId !== swTargetId) return;
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