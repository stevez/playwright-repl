// Attaches the panel's debugger client to the extension's service worker target
// and evaluates expressions in the service worker's JS runtime.
// The panel is a separate context so it CAN see the SW in getTargets().

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

/** Attempt to insert `return` before the last expression line so the caller gets the value. */
export function tryReturnLastExpr(code: string): string {
    const lines = code.split('\n');
    let i = lines.length - 1;
    while (i >= 0 && !lines[i].trim()) i--;
    if (i < 0) return code;
    const trimmed = lines[i].trimStart();
    // Skip lines that are statements, not expressions
    if (/^(const |let |var |function |class |if |for |while |do |switch |try |throw |import |export |return |})/.test(trimmed)) return code;
    const leading = lines[i].slice(0, lines[i].length - trimmed.length);
    lines[i] = leading + 'return ' + trimmed;
    return lines.join('\n');
}

export async function swDebugEval(expression: string): Promise<unknown> {
    const targetId = await ensureAttached();
    const isMultiLine = expression.includes('\n');
    // Statement form (ends with ';') can't be used in `return (...)`.
    // Use AsyncFunction constructor so that:
    //   (1) await is valid (proper async function scope),
    //   (2) const/let are scoped per call and don't leak between runs,
    //   (3) last expression value is captured via tryReturnLastExpr.
    const isStatement = isMultiLine || expression.trimEnd().endsWith(';');
    const wrapped = isStatement
        ? `(new (Object.getPrototypeOf(async function(){}).constructor)(${JSON.stringify(tryReturnLastExpr(expression))}))()`
        : `(async () => { return (${expression}) })()`;
    return new Promise((resolve, reject) => {
        chrome.debugger.sendCommand(
            { targetId },
            'Runtime.evaluate',
            { expression: wrapped, awaitPromise: true, returnByValue: false, generatePreview: true, objectGroup: 'console' },
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
