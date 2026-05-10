/**
 * Recorder content script.
 * Injected into the active tab via chrome.scripting.executeScript.
 * Captures DOM events, generates locator + PW/JS commands, sends to panel.
 *
 * Transparent: never calls preventDefault/stopPropagation — user actions flow normally.
 */
import { escapeString, isTextField, isCheckable, buildCommands, findHoverAncestor, isHoverRevealed } from './locator';

// ─── Special key detection ────────────────────────────────────────────────

export const SPECIAL_KEYS = new Set([
    'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

// ─── Frame detection ─────────────────────────────────────────────────────

/**
 * Compute CSS selector for a frame element.
 * Uses the same selector for both --frame flag (PW) and .locator().contentFrame() (JS),
 * matching pickLocator's output format for consistency.
 * Priority: CSS id > name attribute > src attribute > nth-of-type fallback.
 */
function selectorForFrame(frame: Element): string {
    if (frame.id) return `#${CSS.escape(frame.id)}`;
    const tag = frame.tagName.toLowerCase(); // 'frame' or 'iframe'
    const name = frame.getAttribute('name');
    if (name) return `${tag}[name="${name}"]`;
    const src = frame.getAttribute('src');
    if (src) return `${tag}[src="${src}"]`;
    const parent = frame.parentElement;
    if (parent) {
        const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
        const idx = siblings.indexOf(frame);
        return siblings.length === 1 ? tag : `${tag}:nth-of-type(${idx + 1})`;
    }
    return tag;
}

/**
 * Detect the full frame chain from this window up to the top frame.
 * Returns array of CSS selectors, one per ancestor frame, outermost first.
 * Returns empty array if we're in the top frame.
 */
function detectFrameChain(): { chain: string[]; complete: boolean } {
    if (window === window.top) return { chain: [], complete: true };

    const chain: string[] = [];
    let win: Window = window;
    while (win !== win.top) {
        try {
            const frame = win.frameElement;
            if (frame) {
                chain.push(selectorForFrame(frame));
            } else {
                // Cross-origin: frameElement is null — can't determine selector.
                // Will be resolved via postMessage from parent frame's content script.
                return { chain: chain.reverse(), complete: false };
            }
        } catch {
            // cross-origin — frameElement throws
            return { chain: chain.reverse(), complete: false };
        }
        win = win.parent;
    }
    return { chain: chain.reverse(), complete: true };
}

/** Cached frame chain — computed on init, may be updated via postMessage */
let framePath: string[] = [];
let framePathReady = false;
const pendingChildRequests: Window[] = [];

const FRAME_REQ = '__pw_repl_frame_req';
const FRAME_PATH = '__pw_repl_frame_path';

/**
 * Wrap recorded commands with frame context if we're inside an iframe.
 * Prepends --frame flag(s) to PW and .contentFrame() chain to JS.
 */
function wrapWithFrameContext(cmds: { pw: string; js: string }): { pw: string; js: string } {
    if (framePath.length === 0) return cmds;
    const frameArg = framePath.join(' ');
    const jsChain = framePath.map(sel => `.locator(${JSON.stringify(sel)}).contentFrame()`).join('');
    return {
        pw: `${cmds.pw} --frame "${frameArg}"`,
        js: `await page${jsChain}.${cmds.js.replace(/^await page\./, '')}`,
    };
}

// ─── Cross-origin frame path resolution ─────────────────────────────────

/**
 * For cross-origin frames (including file:// URLs), window.frameElement is null
 * so the child can't determine its own selector. The parent frame CAN see the
 * <frame>/<iframe> elements in its DOM, so we use postMessage to communicate
 * the correct selector chain from parent to child.
 *
 * Two redundant paths ensure resolution regardless of init ordering:
 * 1. Parent proactively notifies children on init (handles child-inits-later)
 * 2. Child requests from parent on init (handles parent-inits-later)
 */

let frameMessageHandler: ((e: MessageEvent) => void) | null = null;

/** Send frame path to a child window by finding its frame element in our DOM */
function sendPathToChild(childWindow: Window) {
    const frames = document.querySelectorAll('frame, iframe');
    for (const frame of frames) {
        try {
            if ((frame as HTMLIFrameElement).contentWindow === childWindow) {
                const sel = selectorForFrame(frame);
                childWindow.postMessage({ type: FRAME_PATH, path: [...framePath, sel] }, '*');
                return;
            }
        } catch { /* contentWindow comparison might throw */ }
    }
}

/** Proactively send frame paths to all child frames */
function notifyChildren() {
    const frames = document.querySelectorAll('frame, iframe');
    for (const frame of frames) {
        const sel = selectorForFrame(frame);
        try {
            (frame as HTMLIFrameElement).contentWindow?.postMessage(
                { type: FRAME_PATH, path: [...framePath, sel] },
                '*'
            );
        } catch { /* contentWindow.postMessage might throw */ }
    }
}

function setupFrameMessaging(complete: boolean) {
    frameMessageHandler = (e: MessageEvent) => {
        // Parent providing our frame path (cross-origin resolution)
        if (e.data?.type === FRAME_PATH && e.source === window.parent) {
            framePath = e.data.path;
            framePathReady = true;
            for (const child of pendingChildRequests) sendPathToChild(child);
            pendingChildRequests.length = 0;
            notifyChildren();
        }
        // Child frame requesting their path from us
        if (e.data?.type === FRAME_REQ && e.source) {
            if (framePathReady) {
                sendPathToChild(e.source as Window);
            } else {
                pendingChildRequests.push(e.source as Window);
            }
        }
    };
    window.addEventListener('message', frameMessageHandler);

    if (framePathReady) notifyChildren();
    if (window !== window.top && !complete) {
        window.parent.postMessage({ type: FRAME_REQ }, '*');
    }
}

/**
 * Safe wrapper for chrome.runtime.sendMessage — if the extension context
 * has been invalidated (e.g. extension reloaded), clean up event listeners
 * instead of throwing an uncaught error (#823).
 */
function safeSendMessage(msg: Record<string, unknown>) {
    try {
        chrome.runtime.sendMessage(msg);
    } catch {
        cleanup();
    }
}

// ─── Fill buffering state machine ─────────────────────────────────────────

export let pendingFill: { el: Element; value: string } | null = null;

export function flushPendingFill() {
    pendingFill = null;
}

// ─── Event handlers (capture phase, transparent) ──────────────────────────

export function onClickCapture(e: MouseEvent) {
    const target = e.target as Element;
    if (!target) return;

    // Media elements (video/audio) are typically covered by player overlays —
    // walk up to the nearest <a> with href for a unique URL-based locator
    if (target.matches('video, audio')) {
        const link = target.closest('a[href]') as HTMLAnchorElement | null;
        if (link) {
            // Strip tracking params — keep path + first query param for stable matching
            let href = link.getAttribute('href') || '';
            const ampIdx = href.indexOf('&');
            if (ampIdx > 0) href = href.slice(0, ampIdx);
            if (href) {
                const cmds = {
                    pw: `click link "${href}"`,
                    js: `await page.locator('a[href^="${href}"]:not([aria-hidden="true"])').click();`,
                };
                safeSendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
                return;
            }
        }
    }

    // Skip clicks on text fields (focus-click noise before fill)
    if (isTextField(target)) return;

    // Skip clicks on checkable elements (handled by change event)
    if (isCheckable(target)) return;

    // Flush any pending fill
    flushPendingFill();

    // Detect hover-revealed elements: if a :hover CSS rule reveals this element,
    // emit a hover command on the :hover ancestor so replay works.
    if (isHoverRevealed(target)) {
        const hoverTarget = findHoverAncestor(target);
        if (hoverTarget) {
            const hoverCmds = buildCommands('hover', hoverTarget);
            if (hoverCmds) {
                safeSendMessage({ type: 'recorded-action', action: wrapWithFrameContext(hoverCmds) });
            }
        }
    }

    const cmds = buildCommands('click', target);
    if (cmds) {
        safeSendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
    }
}

export function onInputCapture(e: Event) {
    const target = e.target as Element;
    if (!target || !isTextField(target)) return;

    const value = (target as HTMLInputElement | HTMLTextAreaElement).value ?? '';

    if (pendingFill && pendingFill.el === target) {
        // Same element — update
        pendingFill.value = value;
        const cmds = buildCommands('fill', target, { value });
        if (cmds) {
            safeSendMessage({ type: 'recorded-fill-update', action: wrapWithFrameContext(cmds) });
        }
    } else {
        // Different element or first input — flush old, start new
        flushPendingFill();
        pendingFill = { el: target, value };
        const cmds = buildCommands('fill', target, { value });
        if (cmds) {
            safeSendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
        }
    }
}

export function onChangeCapture(e: Event) {
    const target = e.target as Element;
    if (!target) return;

    // Checkbox / radio
    if (isCheckable(target)) {
        flushPendingFill();
        const checked = (target as HTMLInputElement).checked;
        const cmds = buildCommands(checked ? 'check' : 'uncheck', target);
        if (cmds) {
            safeSendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
        }
        return;
    }

    // Select
    if (target instanceof HTMLSelectElement) {
        flushPendingFill();
        // Use visible option text (label) instead of the value attribute (#802)
        const selected = target.options[target.selectedIndex];
        const option = selected ? selected.text.trim() || target.value : target.value;
        const cmds = buildCommands('select', target, { option });
        if (cmds) {
            safeSendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
        }
        return;
    }
}

export function onKeyDownCapture(e: KeyboardEvent) {
    if (!SPECIAL_KEYS.has(e.key)) return;

    const target = e.target as Element;

    // Tab changes focus but is navigation noise — flush fill, don't emit
    if (e.key === 'Tab') { flushPendingFill(); return; }

    // Inside a text field, only Enter is a meaningful action —
    // everything else (Backspace, arrows, etc.) is editing noise
    if (e.key !== 'Enter' && target && isTextField(target)) return;

    // Any special key during fill → flush fill, then fall through to emit press
    flushPendingFill();

    const cmds = target && target !== document.body && target !== document.documentElement
        ? buildCommands('press', target, { key: e.key })
        : { pw: `press ${e.key}`, js: `await page.keyboard.press(${escapeString(e.key)});` };
    if (cmds) {
        safeSendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
    }
}

export function onFocusOutCapture(e: FocusEvent) {
    if (pendingFill && e.target === pendingFill.el) {
        flushPendingFill();
    }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

export function cleanup() {
    flushPendingFill();
    window.__pw_recorder_active = false;
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('input', onInputCapture, true);
    document.removeEventListener('change', onChangeCapture, true);
    document.removeEventListener('keydown', onKeyDownCapture, true);
    document.removeEventListener('focusout', onFocusOutCapture, true);
    if (frameMessageHandler) {
        window.removeEventListener('message', frameMessageHandler);
        frameMessageHandler = null;
    }
    pendingChildRequests.length = 0;
    chrome.runtime.onMessage.removeListener(onMessage);
}

function onMessage(msg: { type: string }) {
    if (msg.type === 'record-stop') cleanup();
}

// ─── Init ────────────────────────────────────────────────────────────────

export function init() {
    // Guard against double-injection
    if (window.__pw_recorder_active) return;
    window.__pw_recorder_active = true;

    // Detect iframe context — same-origin path is synchronous and reliable;
    // cross-origin frames (including file:// URLs) get resolved via postMessage
    const detection = detectFrameChain();
    framePath = detection.chain;
    framePathReady = detection.complete;
    setupFrameMessaging(detection.complete);

    // Back/forward detection via Navigation API traverse event
    type NavEntry = { index: number; url?: string };
    type NavEvent = Event & { navigationType: string; destination: NavEntry };
    type NavAPI = EventTarget & { currentEntry?: NavEntry };
    const nav = (window as unknown as { navigation?: NavAPI }).navigation;
    if (nav) {
        // Same-origin back/forward: Navigation API traverse event (reliable direction)
        nav.addEventListener('navigate', (e) => {
            const evt = e as NavEvent;
            if (evt.navigationType === 'traverse') {
                if (evt.destination.index < (nav.currentEntry?.index ?? 0)) {
                    safeSendMessage({ type: 'recorded-action', action: { pw: 'go-back', js: 'await page.goBack();' } });
                } else {
                    const url = evt.destination.url ?? '';
                    safeSendMessage({ type: 'recorded-action', action: { pw: `goto "${url}"`, js: `await page.goto('${url}');` } });
                }
                safeSendMessage({ type: 'nav-handled' });
            }
        });
    }

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('focusout', onFocusOutCapture, true);
}

init();
