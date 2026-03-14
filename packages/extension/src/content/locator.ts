/**
 * Shared locator generation utilities.
 * Used by both picker.ts and recorder.ts content scripts.
 * Vite inlines this into each content script bundle — no runtime module loading.
 */

// ─── Implicit ARIA roles ─────────────────────────────────────────────────

export const IMPLICIT_ROLES: Record<string, string | ((el: Element) => string | null)> = {
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

export function getImplicitRole(el: Element): string | null {
    const explicit = el.getAttribute('role');
    if (explicit && explicit !== 'none' && explicit !== 'presentation') return explicit;
    const entry = IMPLICIT_ROLES[el.tagName];
    if (!entry) return null;
    return typeof entry === 'function' ? entry(el) : entry;
}

// ─── Accessible name ─────────────────────────────────────────────────────

export function getAccessibleName(el: Element): string {
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

    // For roles that get name from content (ARIA "name from content" roles)
    const role = getImplicitRole(el);
    const NAME_FROM_CONTENT = new Set([
        'button', 'link', 'heading', 'tab', 'menuitem', 'menuitemcheckbox',
        'menuitemradio', 'option', 'radio', 'checkbox', 'switch', 'cell',
        'columnheader', 'rowheader', 'tooltip', 'treeitem',
    ]);
    if (role && NAME_FROM_CONTENT.has(role)) {
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

export function getLabel(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
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

// ─── Locator disambiguation ─────────────────────────────────────────────

export function findByRoleAndName(role: string, name: string): Element[] {
    const matches: Element[] = [];
    for (const el of document.querySelectorAll('*')) {
        if (getImplicitRole(el) === role && getAccessibleName(el) === name)
            matches.push(el);
    }
    return matches;
}

// ─── Locator generation ──────────────────────────────────────────────────

export function escapeString(s: string): string {
    if (!s.includes("'")) return `'${s}'`;
    if (!s.includes('"')) return `"${s}"`;
    return `'${s.replace(/'/g, "\\'")}'`;
}

export function generateLocator(el: Element): string {
    // 1. Test ID
    const testId = el.getAttribute('data-testid') || el.getAttribute('data-test-id');
    if (testId) return `getByTestId(${escapeString(testId)})`;

    // 2. Role + accessible name
    const role = getImplicitRole(el);
    const name = getAccessibleName(el);
    if (role && name) {
        // Disambiguate when multiple elements share same role + name
        const matches = findByRoleAndName(role, name);
        if (matches.length > 1) {
            // exact: true so Playwright matches same elements as our exact comparison
            const base = `getByRole(${escapeString(role)}, { name: ${escapeString(name)}, exact: true })`;
            const idx = matches.indexOf(el);
            return idx === 0 ? base + '.first()' : base + `.nth(${idx})`;
        }
        return `getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
    }

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

export function buildCssSelector(el: Element): string {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${CSS.escape(el.id)}`;
    const classes = [...el.classList].slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
    if (classes) return `${tag}${classes}`;
    return tag;
}
