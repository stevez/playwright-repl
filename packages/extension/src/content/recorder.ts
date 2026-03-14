/**
 * Recorder content script.
 * Injected into the active tab via chrome.scripting.executeScript.
 * Captures DOM events, generates locator + PW/JS commands, sends to panel.
 *
 * Transparent: never calls preventDefault/stopPropagation — user actions flow normally.
 */
import { escapeString, isTextField, isCheckable, buildCommands } from './locator';

// ─── Special key detection ────────────────────────────────────────────────

export const SPECIAL_KEYS = new Set([
    'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Home', 'End', 'PageUp', 'PageDown',
    'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

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

    const cmds = buildCommands('click', target);
    if (cmds) {
        chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
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
            chrome.runtime.sendMessage({ type: 'recorded-fill-update', action: cmds });
        }
    } else {
        // Different element or first input — flush old, start new
        flushPendingFill();
        pendingFill = { el: target, value };
        const cmds = buildCommands('fill', target, { value });
        if (cmds) {
            chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
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
            chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
        }
        return;
    }

    // Select
    if (target instanceof HTMLSelectElement) {
        flushPendingFill();
        const option = target.value;
        const cmds = buildCommands('select', target, { option });
        if (cmds) {
            chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
        }
        return;
    }
}

export function onKeyDownCapture(e: KeyboardEvent) {
    if (!SPECIAL_KEYS.has(e.key)) return;

    const target = e.target as Element;

    // Enter during fill → submit variant
    if (e.key === 'Enter' && pendingFill) {
        const cmds = buildCommands('fill', pendingFill.el, { value: pendingFill.value, submit: true });
        if (cmds) {
            chrome.runtime.sendMessage({ type: 'recorded-fill-submit', action: cmds });
        }
        flushPendingFill();
        return;
    }

    // Other special key → flush fill, emit press
    flushPendingFill();

    const cmds = target && target !== document.body && target !== document.documentElement
        ? buildCommands('press', target, { key: e.key })
        : { pw: `press ${e.key}`, js: `await page.keyboard.press(${escapeString(e.key)});` };
    if (cmds) {
        chrome.runtime.sendMessage({ type: 'recorded-action', action: cmds });
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

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('click', onClickCapture, true);
    document.addEventListener('input', onInputCapture, true);
    document.addEventListener('change', onChangeCapture, true);
    document.addEventListener('keydown', onKeyDownCapture, true);
    document.addEventListener('focusout', onFocusOutCapture, true);
}

init();
