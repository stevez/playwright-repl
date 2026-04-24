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
/**
 * Compute selectors for a single frame element.
 * pw: plain name/id for --frame (resolved by page.frame())
 * css: CSS selector for JS .locator().contentFrame()
 */
function selectorsForFrame(frame: Element): { pw: string; css: string } {
    const tag = frame.tagName.toLowerCase(); // 'frame' or 'iframe'
    const name = frame.getAttribute('name');
    if (name) return { pw: name, css: `${tag}[name="${name}"]` };
    if (frame.id) return { pw: frame.id, css: `#${CSS.escape(frame.id)}` };
    const src = frame.getAttribute('src');
    if (src) { const sel = `${tag}[src="${src}"]`; return { pw: sel, css: sel }; }
    const parent = frame.parentElement;
    if (parent) {
        const siblings = Array.from(parent.querySelectorAll(`:scope > ${tag}`));
        const idx = siblings.indexOf(frame);
        const sel = siblings.length === 1 ? tag : `${tag}:nth-of-type(${idx + 1})`;
        return { pw: sel, css: sel };
    }
    return { pw: tag, css: tag };
}

/**
 * Detect the full frame chain from this window up to the top frame.
 * Returns arrays of selectors, one per ancestor frame, outermost first.
 * Returns empty arrays if we're in the top frame.
 */
function detectFrameChain(): { pw: string[]; css: string[] } {
    if (window === window.top) return { pw: [], css: [] };

    const pwChain: string[] = [];
    const cssChain: string[] = [];
    let win: Window = window;
    while (win !== win.top) {
        try {
            const frame = win.frameElement;
            if (frame) {
                const sels = selectorsForFrame(frame);
                pwChain.push(sels.pw);
                cssChain.push(sels.css);
            } else {
                // Cross-origin: frameElement is null, use src fallback
                try {
                    const src = win.location.href;
                    const sel = (src && src !== 'about:blank') ? `iframe[src="${src}"]` : 'iframe';
                    pwChain.push(sel);
                    cssChain.push(sel);
                } catch { pwChain.push('iframe'); cssChain.push('iframe'); }
                break; // Can't walk further up from cross-origin
            }
        } catch {
            break; // cross-origin — frameElement throws
        }
        win = win.parent;
    }
    return { pw: pwChain.reverse(), css: cssChain.reverse() };
}

/** Cached frame chain — computed once on init */
let framePath: { pw: string[]; css: string[] } = { pw: [], css: [] };

/**
 * Wrap recorded commands with frame context if we're inside an iframe.
 * Prepends --frame flag(s) to PW and .contentFrame() chain to JS.
 */
function wrapWithFrameContext(cmds: { pw: string; js: string }): { pw: string; js: string } {
    if (framePath.pw.length === 0) return cmds;
    // Single frame: use plain name for PW (page.frame() resolves it)
    // Nested frames: use CSS selectors for PW (locator().contentFrame() at each level)
    const frameArg = framePath.pw.length === 1
        ? framePath.pw[0]
        : framePath.css.join(' ');
    const jsChain = framePath.css.map(sel => `.locator(${JSON.stringify(sel)}).contentFrame()`).join('');
    return {
        pw: `${cmds.pw} --frame "${frameArg}"`,
        js: `await page${jsChain}.${cmds.js.replace(/^await page\./, '')}`,
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
    framePath = detectFrameChain();

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('focusout', onFocusOutCapture, true);
}

init();
