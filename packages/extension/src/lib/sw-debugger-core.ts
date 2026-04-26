/**
 * Shared CDP debugger core — attaches to the extension's service worker target
 * and provides low-level helpers for Runtime.evaluate, callFunctionOn, and getProperties.
 *
 * Used by both background.ts (bridge eval) and panel/lib/sw-debugger.ts (panel eval).
 * Vite bundles a copy into each entry point.
 */

export type CdpEvalResult = {
    result?: unknown;
    exceptionDetails?: {
        exception?: { description?: string };
        text?: string;
    };
};

let swTargetId: string | null = null;

if (typeof chrome !== 'undefined' && chrome.debugger) {
    chrome.debugger.onDetach.addListener((source) => {
        if (source.targetId === swTargetId) swTargetId = null;
    });
}

// ─── Target Discovery ────────────────────────────────────────────────────────

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
    await chrome.runtime.sendMessage({ type: 'ping' }).catch(() => { /* SW may not be ready yet */ });
    // Poll until it appears as a debuggable target (up to ~1s)
    for (let i = 0; i < 10; i++) {
        const id = await querySwTarget();
        if (id) return id;
        await new Promise(r => setTimeout(r, 100));
    }
    return null;
}

// ─── Attach ──────────────────────────────────────────────────────────────────

export async function ensureAttached(): Promise<string> {
    // Fast path: already attached
    if (swTargetId) return swTargetId;
    const targetId = await findSwTarget();
    if (!targetId) throw new Error('Background worker target not found. Try reloading the extension.');
    if (swTargetId === targetId) return targetId;
    await new Promise<void>((resolve, reject) => {
        chrome.debugger.attach({ targetId }, '1.3', () => {
            if (chrome.runtime.lastError) {
                const msg = chrome.runtime.lastError.message ?? '';
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

export function resetTargetId() { swTargetId = null; }
export function getTargetId() { return swTargetId; }

// ─── Generic CDP Command ─────────────────────────────────────────────────────

export async function cdpSendCommand(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    const targetId = await ensureAttached();
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand({ targetId }, method, params, (result: unknown) => {
            if (chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
            } else {
                resolve(result);
            }
        });
    });
}

// ─── Runtime.evaluate ────────────────────────────────────────────────────────

/**
 * Evaluate a JS expression in the service worker's runtime.
 * Wraps `{…}` in parens so V8 parses object literals correctly.
 * Returns the raw CDP result object (not exceptionDetails — those throw).
 */
export async function cdpEval(expression: string, objectGroup = 'console'): Promise<unknown> {
    const expr = expression.trimStart().startsWith('{') ? `(${expression})` : expression;
    const targetId = await ensureAttached();
    const result = await new Promise<CdpEvalResult | undefined>((resolve, reject) => {
        chrome.debugger.sendCommand(
            { targetId },
            'Runtime.evaluate',
            { expression: expr, awaitPromise: true, returnByValue: false, generatePreview: true, objectGroup, replMode: true },
            (res: unknown) => {
                if (chrome.runtime.lastError) {
                    swTargetId = null;
                    reject(new Error(chrome.runtime.lastError.message));
                } else {
                    resolve(res as CdpEvalResult | undefined);
                }
            }
        );
    });
    if (result?.exceptionDetails) {
        const msg = result.exceptionDetails.exception?.description
            ?? result.exceptionDetails.text ?? 'Unknown error';
        throw new Error(msg);
    }
    return result?.result;
}

// ─── Runtime.callFunctionOn ──────────────────────────────────────────────────

export async function cdpCallFunctionOn(
    objectId: string,
    functionDeclaration: string,
    returnByValue = true,
): Promise<unknown> {
    return cdpSendCommand('Runtime.callFunctionOn', {
        objectId, functionDeclaration, returnByValue,
    });
}

// ─── Runtime.getProperties ───────────────────────────────────────────────────

export async function cdpGetProperties(objectId: string): Promise<unknown> {
    return cdpSendCommand('Runtime.getProperties', {
        objectId, ownProperties: true, generatePreview: true,
    });
}

// ─── Debug helper ────────────────────────────────────────────────────────────

/** Debug helper — call from console: (await import('...')).swDebugTargets() */
export function swDebugTargets(): Promise<chrome.debugger.TargetInfo[]> {
    return new Promise(resolve => chrome.debugger.getTargets(resolve));
}
