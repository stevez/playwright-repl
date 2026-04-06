/**
 * Element picker content script.
 * Injected into the active tab via chrome.scripting.executeScript.
 * Highlights elements on hover, captures click, generates locator + element info.
 */
import { generateLocator, getImplicitRole } from './locator';

// ─── Element retargeting ────────────────────────────────────────────────

/** Interactive roles that should be retargeted to (like Playwright codegen). */
const INTERACTIVE_ROLES = new Set(['link', 'button', 'checkbox', 'radio', 'textbox', 'combobox', 'tab', 'menuitem', 'menuitemcheckbox', 'menuitemradio', 'option', 'switch', 'treeitem']);

/**
 * Walk up from the clicked element to the nearest interactive ancestor.
 * Playwright codegen does this to ensure locators target the semantic element
 * (e.g. the <a> link) rather than a child <span> inside it.
 */
function retarget(el: Element): Element {
    let current: Element | null = el;
    while (current && current !== document.body && current !== document.documentElement) {
        const role = getImplicitRole(current);
        if (role && INTERACTIVE_ROLES.has(role)) return current;
        current = current.parentElement;
    }
    return el;
}

// ─── Element info gathering ──────────────────────────────────────────────

export function getOuterHtml(el: Element): string {
    const outer = el.outerHTML;
    if (outer.length <= 200) return outer;
    const tag = el.tagName.toLowerCase();
    const open = outer.slice(0, outer.indexOf('>') + 1);
    return `${open}...</${tag}>`;
}

export function gatherInfo(el: Element) {
    const rect = el.getBoundingClientRect();
    const attrs: Record<string, string> = {};
    for (const a of el.attributes) attrs[a.name] = a.value;
    return {
        locator: generateLocator(el),
        tag: el.tagName.toLowerCase(),
        text: (el.textContent || '').trim().slice(0, 200),
        html: getOuterHtml(el),
        attributes: attrs,
        visible: rect.width > 0 && rect.height > 0,
        enabled: !(el as HTMLButtonElement).disabled,
        box: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        value: (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)
            ? el.value : undefined,
        checked: (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio'))
            ? el.checked : undefined,
    };
}

// ─── Overlay + state ─────────────────────────────────────────────────────

export const highlight = document.createElement('div');
highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6fa8dc;background:rgba(111,168,220,0.2);display:none;box-sizing:border-box;';

export let currentElement: Element | null = null;

// ─── Event handlers ──────────────────────────────────────────────────────

export function onMouseMove(e: MouseEvent) {
    const raw = document.elementFromPoint(e.clientX, e.clientY);
    if (!raw || raw === highlight) return;
    const target = retarget(raw);
    if (target === currentElement) return;
    currentElement = target;

    const rect = target.getBoundingClientRect();
    highlight.style.display = 'block';
    highlight.style.left = rect.left + 'px';
    highlight.style.top = rect.top + 'px';
    highlight.style.width = rect.width + 'px';
    highlight.style.height = rect.height + 'px';
}

export function onClick(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (!currentElement) return;
    const info = gatherInfo(currentElement);
    // Mark element so CDP can find it for _generateLocatorString()
    const pickId = Math.random().toString(36).slice(2);
    currentElement.setAttribute('data-pw-pick-id', pickId);
    cleanup();
    chrome.runtime.sendMessage({ type: 'element-picked-raw', pickId, info });
}

export function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        cleanup();
        chrome.runtime.sendMessage({ type: 'pick-cancelled' });
    }
}

// ─── Lifecycle ───────────────────────────────────────────────────────────

export function cleanup() {
    (window as any).__pw_picker_active = false;
    currentElement = null;
    highlight.remove();
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    chrome.runtime.onMessage.removeListener(onMessage);
}

function onMessage(msg: any) {
    if (msg.type === 'pick-stop') cleanup();
}

// ─── Init ────────────────────────────────────────────────────────────────

export function init() {
    // Guard against double-injection
    if ((window as any).__pw_picker_active) return;
    (window as any).__pw_picker_active = true;

    document.documentElement.appendChild(highlight);

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
}

init();
