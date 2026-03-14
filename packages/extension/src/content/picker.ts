/**
 * Element picker content script.
 * Injected into the active tab via chrome.scripting.executeScript.
 * Highlights elements on hover, captures click, generates locator + element info.
 */
import { generateLocator } from './locator';

(function () {
    // Guard against double-injection
    if ((window as any).__pw_picker_active) return;
    (window as any).__pw_picker_active = true;

    // ─── Overlay elements ────────────────────────────────────────────────────

    const highlight = document.createElement('div');
    highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6fa8dc;background:rgba(111,168,220,0.2);display:none;box-sizing:border-box;';

    document.documentElement.appendChild(highlight);

    let currentElement: Element | null = null;

    // ─── Element info gathering ──────────────────────────────────────────────

    function getOuterHtml(el: Element): string {
        const outer = el.outerHTML;
        if (outer.length <= 200) return outer;
        const tag = el.tagName.toLowerCase();
        const open = outer.slice(0, outer.indexOf('>') + 1);
        return `${open}...</${tag}>`;
    }

    function gatherInfo(el: Element) {
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

    // ─── Event handlers ──────────────────────────────────────────────────────

    function onMouseMove(e: MouseEvent) {
        const target = document.elementFromPoint(e.clientX, e.clientY);
        if (!target || target === highlight) return;
        if (target === currentElement) return;
        currentElement = target;

        const rect = target.getBoundingClientRect();
        highlight.style.display = 'block';
        highlight.style.left = rect.left + 'px';
        highlight.style.top = rect.top + 'px';
        highlight.style.width = rect.width + 'px';
        highlight.style.height = rect.height + 'px';
    }

    function onClick(e: MouseEvent) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        if (!currentElement) return;
        const info = gatherInfo(currentElement);
        // Mark element so main-world script can find it for Playwright locator generation
        const pickId = Math.random().toString(36).slice(2);
        currentElement.setAttribute('data-pw-pick-id', pickId);
        cleanup();
        chrome.runtime.sendMessage({ type: 'element-picked-raw', pickId, info });
    }

    function onKeyDown(e: KeyboardEvent) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            cleanup();
            chrome.runtime.sendMessage({ type: 'pick-cancelled' });
        }
    }

    // ─── Lifecycle ───────────────────────────────────────────────────────────

    function cleanup() {
        (window as any).__pw_picker_active = false;
        highlight.remove();
        document.removeEventListener('mousemove', onMouseMove, true);
        document.removeEventListener('click', onClick, true);
        document.removeEventListener('keydown', onKeyDown, true);
        chrome.runtime.onMessage.removeListener(onMessage);
    }

    function onMessage(msg: any) {
        if (msg.type === 'pick-stop') cleanup();
    }

    chrome.runtime.onMessage.addListener(onMessage);
    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
})();
