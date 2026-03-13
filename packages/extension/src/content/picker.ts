/**
 * Element picker content script.
 * Injected into the active tab via chrome.scripting.executeScript.
 * Highlights elements on hover, captures click, generates locator + element info.
 */
(function () {
    // Guard against double-injection
    if ((window as any).__pw_picker_active) return;
    (window as any).__pw_picker_active = true;

    // ─── Overlay elements ────────────────────────────────────────────────────

    const highlight = document.createElement('div');
    highlight.style.cssText = 'position:fixed;pointer-events:none;z-index:2147483646;border:2px solid #6fa8dc;background:rgba(111,168,220,0.2);display:none;box-sizing:border-box;';

    document.documentElement.appendChild(highlight);

    let currentElement: Element | null = null;

    // ─── Implicit ARIA roles ─────────────────────────────────────────────────

    const IMPLICIT_ROLES: Record<string, string | ((el: Element) => string | null)> = {
        A: (el) => el.hasAttribute('href') ? 'link' : null,
        BUTTON: 'button',
        H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading',
        INPUT: (el) => {
            const type = (el as HTMLInputElement).type.toLowerCase();
            if (type === 'checkbox') return 'checkbox';
            if (type === 'radio') return 'radio';
            if (type === 'submit' || type === 'reset' || type === 'button') return 'button';
            if (type === 'hidden') return null;
            return 'textbox';
        },
        TEXTAREA: 'textbox',
        SELECT: 'combobox',
        IMG: 'img',
        NAV: 'navigation',
        MAIN: 'main',
        HEADER: 'banner',
        FOOTER: 'contentinfo',
        UL: 'list', OL: 'list',
        LI: 'listitem',
        TABLE: 'table',
        FORM: 'form',
        DIALOG: 'dialog',
    };

    function getImplicitRole(el: Element): string | null {
        const explicit = el.getAttribute('role');
        if (explicit && explicit !== 'none' && explicit !== 'presentation') return explicit;
        const entry = IMPLICIT_ROLES[el.tagName];
        if (!entry) return null;
        return typeof entry === 'function' ? entry(el) : entry;
    }

    // ─── Accessible name ─────────────────────────────────────────────────────

    function getAccessibleName(el: Element): string {
        // aria-label
        const ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel.trim();

        // aria-labelledby
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            const parts = labelledBy.split(/\s+/).map(id => document.getElementById(id)?.textContent?.trim()).filter(Boolean);
            if (parts.length) return parts.join(' ');
        }

        // For inputs: associated <label>
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            const label = getLabel(el);
            if (label) return label;
        }

        // For buttons, links: text content
        const role = getImplicitRole(el);
        if (role === 'button' || role === 'link' || role === 'heading') {
            const text = (el.textContent || '').trim();
            if (text && text.length <= 80) return text;
        }

        // alt for images
        if (el.tagName === 'IMG') {
            const alt = el.getAttribute('alt');
            if (alt) return alt.trim();
        }

        return '';
    }

    function getLabel(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
        // Explicit label via for attribute
        if (el.id) {
            const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
            if (label) return (label.textContent || '').trim();
        }
        // Implicit label (ancestor)
        const parentLabel = el.closest('label');
        if (parentLabel) {
            // Get label text excluding the input's own text
            const clone = parentLabel.cloneNode(true) as HTMLElement;
            clone.querySelectorAll('input,textarea,select').forEach(c => c.remove());
            const text = (clone.textContent || '').trim();
            if (text) return text;
        }
        return '';
    }

    // ─── Locator generation ──────────────────────────────────────────────────

    function escapeString(s: string): string {
        if (!s.includes("'")) return `'${s}'`;
        if (!s.includes('"')) return `"${s}"`;
        return `'${s.replace(/'/g, "\\'")}'`;
    }

    function generateLocator(el: Element): string {
        // 1. Test ID
        const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
        if (testId) return `getByTestId(${escapeString(testId)})`;

        // 2. Role + accessible name
        const role = getImplicitRole(el);
        const name = getAccessibleName(el);
        if (role && name) return `getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;

        // 3. Label (for form elements)
        if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
            const label = getLabel(el);
            if (label) return `getByLabel(${escapeString(label)})`;
        }

        // 4. Placeholder
        const placeholder = el.getAttribute('placeholder');
        if (placeholder) return `getByPlaceholder(${escapeString(placeholder)})`;

        // 5. Alt text
        const alt = el.getAttribute('alt');
        if (alt && ['IMG', 'APPLET', 'AREA', 'INPUT'].includes(el.tagName))
            return `getByAltText(${escapeString(alt)})`;

        // 6. Title
        const title = el.getAttribute('title');
        if (title) return `getByTitle(${escapeString(title)})`;

        // 7. Text content
        const text = (el.textContent || '').trim();
        if (text && text.length <= 80) return `getByText(${escapeString(text)})`;

        // 8. Role without name
        if (role) return `getByRole(${escapeString(role)})`;

        // 9. CSS fallback
        return `locator(${escapeString(buildCssSelector(el))})`;
    }

    function buildCssSelector(el: Element): string {
        const tag = el.tagName.toLowerCase();
        if (el.id) return `${tag}#${CSS.escape(el.id)}`;
        const classes = [...el.classList].slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
        if (classes) return `${tag}${classes}`;
        return tag;
    }

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
