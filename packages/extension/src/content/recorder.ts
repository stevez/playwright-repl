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
 * Detect if we're inside an iframe and compute a CSS selector for it.
 * Returns null if we're in the top frame.
 *
 * For same-origin iframes, `window.frameElement` gives us the <iframe> element
 * in the parent document. For cross-origin iframes, `window.frameElement` is null
 * due to security restrictions — we fall back to using the frame's src URL.
 */
function detectFrameSelector(): string | null {
    if (window === window.top) return null;

    try {
        // Same-origin: window.frameElement is accessible
        const frame = window.frameElement;
        if (frame) {
            const tag = frame.tagName.toLowerCase(); // 'frame' or 'iframe'
            // Prefer id selector
            if (frame.id) return `#${CSS.escape(frame.id)}`;
            // Prefer name attribute
            const name = frame.getAttribute('name');
            if (name) return `${tag}[name="${name}"]`;
            // Prefer src attribute
            const src = frame.getAttribute('src');
            if (src) return `${tag}[src="${src}"]`;
            // Fall back to tag + nth-of-type
            const parent = frame.parentElement;
            if (parent) {
                const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
                const idx = siblings.indexOf(frame);
                if (siblings.length === 1) return tag;
                return `${tag}:nth-of-type(${idx + 1})`;
            }
            return tag;
        }
    } catch { /* cross-origin — frameElement throws */ }

    // Cross-origin fallback: use location to build a src-based selector
    // This is a best-effort approach — assume iframe (modern standard)
    try {
        const src = window.location.href;
        if (src && src !== 'about:blank') return `iframe[src="${src}"]`;
    } catch { /* cannot access location */ }

    return 'iframe';
}

/** Cached frame selector — computed once on init */
let frameSelector: string | null = null;

/**
 * Wrap recorded commands with frame context if we're inside an iframe.
 * Prepends --frame flag to PW and .contentFrame() to JS.
 */
function wrapWithFrameContext(cmds: { pw: string; js: string }): { pw: string; js: string } {
    if (!frameSelector) return cmds;
    return {
        pw: `${cmds.pw} --frame "${frameSelector}"`,
        js: `await page.locator(${JSON.stringify(frameSelector)}).contentFrame().${cmds.js.replace(/^await page\./, '')}`,
    };
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
                chrome.runtime.sendMessage({ type: 'recorded-action', action: wrapWithFrameContext(hoverCmds) });
            }
        }
    }

    const cmds = buildCommands('click', target);
    if (cmds) {
        chrome.runtime.sendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
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
            chrome.runtime.sendMessage({ type: 'recorded-fill-update', action: wrapWithFrameContext(cmds) });
        }
    } else {
        // Different element or first input — flush old, start new
        flushPendingFill();
        pendingFill = { el: target, value };
        const cmds = buildCommands('fill', target, { value });
        if (cmds) {
            chrome.runtime.sendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
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
            chrome.runtime.sendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
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
            chrome.runtime.sendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
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
        chrome.runtime.sendMessage({ type: 'recorded-action', action: wrapWithFrameContext(cmds) });
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
    (window as any).__pw_recorder_active = false;
    document.removeEventListener('click', onClickCapture, true);
    document.removeEventListener('input', onInputCapture, true);
    document.removeEventListener('change', onChangeCapture, true);
    document.removeEventListener('keydown', onKeyDownCapture, true);
    document.removeEventListener('focusout', onFocusOutCapture, true);
    chrome.runtime.onMessage.removeListener(onMessage);
}

function onMessage(msg: any) {
    if (msg.type === 'record-stop') cleanup();
}

// ─── Init ────────────────────────────────────────────────────────────────

export function init() {
    // Guard against double-injection
    if ((window as any).__pw_recorder_active) return;
    (window as any).__pw_recorder_active = true;

    // Detect iframe context once on init
    frameSelector = detectFrameSelector();

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('focusout', onFocusOutCapture, true);
}

init();
