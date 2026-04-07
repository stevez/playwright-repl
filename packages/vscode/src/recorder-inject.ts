/**
 * Recorder injection script — runs inside the browser page.
 * Captures DOM events transparently (no preventDefault), marks elements
 * with data-pw-rec-id, and calls exposed Node functions for action recording.
 *
 * Does NOT generate locators — Node side resolves them via Playwright API.
 */

declare global {
  interface Window {
    __pwRecordAction: (action: string, recId: string, opts: Record<string, unknown>) => void;
    __pwRecordFillUpdate: (action: string, recId: string, opts: Record<string, unknown>) => void;
    __pwRecorderActive: boolean;
    __pwRecorderCleanup: () => void;
  }
}

const SPECIAL_KEYS = new Set([
  'Enter', 'Tab', 'Escape', 'Backspace', 'Delete',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'Home', 'End', 'PageUp', 'PageDown',
  'F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10', 'F11', 'F12',
]);

function isTextField(el: Element): boolean {
  if (el instanceof HTMLTextAreaElement) return true;
  if (el instanceof HTMLInputElement) {
    const type = el.type.toLowerCase();
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'file', 'image', 'hidden', 'range', 'color'].includes(type);
  }
  return el.getAttribute('contenteditable') === 'true';
}

function isCheckable(el: Element): boolean {
  if (!(el instanceof HTMLInputElement)) return false;
  const type = el.type.toLowerCase();
  return type === 'checkbox' || type === 'radio';
}

let recIdCounter = 0;
function markElement(el: Element): string {
  const existing = el.getAttribute('data-pw-rec-id');
  if (existing) return existing;
  const id = `rec-${++recIdCounter}-${Date.now()}`;
  el.setAttribute('data-pw-rec-id', id);
  return id;
}

// ─── Fill buffering ──────────────────────────────────────────────────────

let pendingFill: { el: Element; recId: string; value: string } | null = null;

function flushPendingFill() {
  pendingFill = null;
}

// ─── Event handlers (capture phase, transparent) ─────────────────────────

function onClickCapture(e: MouseEvent) {
  const target = e.target as Element;
  if (!target) return;
  if (isTextField(target)) return;
  if (isCheckable(target)) return;
  flushPendingFill();
  const recId = markElement(target);
  window.__pwRecordAction('click', recId, {});
}

function onInputCapture(e: Event) {
  const target = e.target as Element;
  if (!target || !isTextField(target)) return;
  const value = (target as HTMLInputElement | HTMLTextAreaElement).value ?? '';
  const recId = markElement(target);

  if (pendingFill && pendingFill.el === target) {
    pendingFill.value = value;
    window.__pwRecordFillUpdate('fill', pendingFill.recId, { value });
  } else {
    flushPendingFill();
    pendingFill = { el: target, recId, value };
    window.__pwRecordAction('fill', recId, { value });
  }
}

function onChangeCapture(e: Event) {
  const target = e.target as Element;
  if (!target) return;

  if (isCheckable(target)) {
    flushPendingFill();
    const checked = (target as HTMLInputElement).checked;
    const recId = markElement(target);
    window.__pwRecordAction(checked ? 'check' : 'uncheck', recId, {});
    return;
  }

  if (target instanceof HTMLSelectElement) {
    flushPendingFill();
    const recId = markElement(target);
    window.__pwRecordAction('select', recId, { option: target.value });
    return;
  }
}

function onKeyDownCapture(e: KeyboardEvent) {
  if (!SPECIAL_KEYS.has(e.key)) return;
  const target = e.target as Element;
  if (e.key === 'Tab') { flushPendingFill(); return; }
  if (e.key !== 'Enter' && target && isTextField(target)) return;
  flushPendingFill();

  if (target && target !== document.body && target !== document.documentElement) {
    const recId = markElement(target);
    window.__pwRecordAction('press', recId, { key: e.key });
  } else {
    // Global key press — no element context, use empty recId
    window.__pwRecordAction('press', '', { key: e.key });
  }
}

function onFocusOutCapture(e: FocusEvent) {
  if (pendingFill && e.target === pendingFill.el) {
    flushPendingFill();
  }
}

// ─── Lifecycle ──────────────────────────────────────────────────────────

function cleanup() {
  flushPendingFill();
  window.__pwRecorderActive = false;
  document.removeEventListener('click', onClickCapture, true);
  document.removeEventListener('input', onInputCapture, true);
  document.removeEventListener('change', onChangeCapture, true);
  document.removeEventListener('keydown', onKeyDownCapture, true);
  document.removeEventListener('focusout', onFocusOutCapture, true);
}

function initRecorder() {
  if (window.__pwRecorderActive) return;
  window.__pwRecorderActive = true;
  window.__pwRecorderCleanup = cleanup;
  document.addEventListener('click', onClickCapture, true);
  document.addEventListener('input', onInputCapture, true);
  document.addEventListener('change', onChangeCapture, true);
  document.addEventListener('keydown', onKeyDownCapture, true);
  document.addEventListener('focusout', onFocusOutCapture, true);
}

initRecorder();
