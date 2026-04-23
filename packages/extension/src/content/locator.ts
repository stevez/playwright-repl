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
    P: 'paragraph',
    UL: 'list', OL: 'list',
    LI: 'listitem',
    TABLE: 'table',
    TR: 'row',
    TH: 'columnheader',
    TD: 'cell',
    FORM: 'form',
    DIALOG: 'dialog',
    ARTICLE: 'article',
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
    // Informal associations (e.g. preceding table cell) are excluded here because
    // getByRole/getByLabel can't resolve them. See getInformalLabel() for fill/select.
    return '';
}

/**
 * Find informal label text for a form element (e.g. text in an adjacent table
 * cell). Used by the recorder to generate `fill "Label" "value"` instead of
 * `fill css "input#id" "value"`. Mirrors the fillByText runtime fallback in
 * page-scripts.ts which walks up from a getByText match to find a nearby input.
 */
export function getInformalLabel(el: Element): string {
    // Table layout: preceding cell's text in the same row
    const row = el.closest('tr');
    if (row) {
        const cell = el.closest('td, th');
        if (cell) {
            let prev = cell.previousElementSibling;
            while (prev) {
                const text = (prev.textContent || '').trim();
                if (text && text.length <= 80) return text;
                prev = prev.previousElementSibling;
            }
        }
    }
    // Non-table: preceding sibling's text content
    let prev = el.previousElementSibling;
    while (prev) {
        const text = (prev.textContent || '').trim();
        if (text && text.length <= 80) return text;
        prev = prev.previousElementSibling;
    }
    return '';
}

// ─── Ancestor context disambiguation ─────────────────────────────────────

/** Container roles suitable for ancestor-context disambiguation. */
const CONTAINER_ROLES = new Set(['listitem', 'row', 'article', 'group']);

/**
 * Find distinctive text in an ancestor that doesn't come from the excluded element's subtree.
 * Returns text from the first child subtree that doesn't contain the excluded element,
 * recursing into wrappers that do contain it. This ensures the returned text is a
 * contiguous substring of the ancestor's full textContent (needed for hasText matching).
 */
function getContextText(ancestor: Element, exclude: Element): string {
    function findText(node: Node): string {
        for (const child of node.childNodes) {
            if (child === exclude) continue;
            if (child.nodeType === Node.ELEMENT_NODE && (child as Element).contains(exclude)) {
                // This subtree contains the target — recurse to find non-target siblings
                const inner = findText(child);
                if (inner) return inner;
                continue;
            }
            const text = (child.textContent || '').trim();
            if (text && text.length <= 50) return text;
        }
        return '';
    }
    return findText(ancestor);
}

/** Walk up from el to find nearest ancestor with a container role. */
function findContainerAncestor(el: Element): { ancestor: Element; role: string } | null {
    let current = el.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
        const role = getImplicitRole(current);
        if (role && CONTAINER_ROLES.has(role)) return { ancestor: current, role };
        current = current.parentElement;
    }
    return null;
}

// ─── Heading-based context disambiguation ────────────────────────────────

/**
 * Find the first short leaf text in an element, skipping button content.
 * Generic approach — works for headings, banners, labels, or any structure.
 */
function findLeafText(node: Node): string {
    for (const child of node.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = (child.textContent || '').trim();
            if (text && text.length >= 2 && text.length <= 50) return text;
        }
        if (child.nodeType === Node.ELEMENT_NODE) {
            const el = child as Element;
            if (el.matches('button') || el.closest('button')) continue;
            const text = findLeafText(el);
            if (text) return text;
        }
    }
    return '';
}

/**
 * Walk up from el, find the nearest preceding sibling with distinctive text.
 * Skips siblings that contain links — those are peer items, not section labels.
 */
function findNearestHeading(el: Element): { container: Element; text: string } | null {
    let current = el.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
        for (const child of current.children) {
            if (child.contains(el)) break; // stop at el's branch
            // Skip peer items — section labels don't contain navigation links
            if (child.matches('a') || child.querySelector('a')) continue;
            // Skip peer radio/checkbox labels — "Ja" label is not a heading for "Nein"
            if (child.querySelector('input[type="radio"], input[type="checkbox"]')) continue;
            if (child.matches('input[type="radio"], input[type="checkbox"]')) continue;
            const text = findLeafText(child);
            if (text) return { container: current, text };
        }
        current = current.parentElement;
    }
    return null;
}

/**
 * Try heading-based disambiguation: if each duplicate match has a unique
 * nearest heading, return the heading text for the target element.
 */
function tryHeadingContext(el: Element, matches: Element[]): string | null {
    const result = findNearestHeading(el);
    if (!result) return null;

    // Check uniqueness: only one match should share this heading text
    let count = 0;
    for (const match of matches) {
        const mResult = findNearestHeading(match);
        if (mResult && mResult.text === result.text) {
            count++;
            if (count > 1) return null;
        }
    }
    return count === 1 ? result.text : null;
}

/**
 * Try to disambiguate using ancestor context.
 * Returns a chained locator like:
 *   getByRole('listitem').filter({ hasText: 'reading' }).getByRole('button', { name: 'Delete' })
 * or null if ancestor context doesn't produce a unique result.
 */
function tryAncestorContext(el: Element, role: string, name: string, matches: Element[]): string | null {
    const container = findContainerAncestor(el);
    if (!container) return null;

    const contextText = getContextText(container.ancestor, el);
    if (!contextText || contextText.length > 50) return null;

    // Verify uniqueness: only one match's container ancestor should contain this text
    let count = 0;
    for (const match of matches) {
        const mc = findContainerAncestor(match);
        if (!mc || mc.role !== container.role) continue;
        if ((mc.ancestor.textContent || '').includes(contextText)) {
            count++;
            if (count > 1) return null;
        }
    }
    if (count !== 1) return null;

    return `getByRole(${escapeString(container.role)}).filter({ hasText: ${escapeString(contextText)} }).getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
}

// ─── Locator disambiguation ─────────────────────────────────────────────

export function findByRoleAndName(role: string, name: string): Element[] {
    const matches: Element[] = [];
    for (const el of document.querySelectorAll('*')) {
        if (getImplicitRole(el) === role && getAccessibleName(el) === name
            && (el as HTMLElement).checkVisibility?.() !== false)
            matches.push(el);
    }
    return matches;
}

/** Like findByRoleAndName but includes hidden elements (for hover detection). */
export function findAllByRoleAndName(role: string, name: string): Element[] {
    const matches: Element[] = [];
    for (const el of document.querySelectorAll('*')) {
        if (getImplicitRole(el) === role && getAccessibleName(el) === name)
            matches.push(el);
    }
    return matches;
}

/** Find the nearest :hover ancestor (for recording hover before click). */
export function findHoverAncestor(el: Element): Element | null {
    let ancestor = el.parentElement;
    while (ancestor && ancestor !== document.body && ancestor !== document.documentElement) {
        if (ancestor.matches(':hover')) return ancestor;
        ancestor = ancestor.parentElement;
    }
    return null;
}

/**
 * Check if element is revealed by a :hover CSS rule.
 * Scans stylesheets for rules like `.parent:hover .child { display: inline-block }`.
 * At click time the ancestor IS hovered, so el.matches() works against :hover selectors.
 */
export function isHoverRevealed(el: Element): boolean {
    for (const sheet of document.styleSheets) {
        try {
            for (const rule of sheet.cssRules) {
                if (!(rule instanceof CSSStyleRule)) continue;
                if (!rule.selectorText.includes(':hover')) continue;
                const s = rule.style;
                const reveals = (s.display && s.display !== 'none') ||
                    s.visibility === 'visible' ||
                    (s.opacity && s.opacity !== '0');
                if (!reveals) continue;
                try { if (el.matches(rule.selectorText)) return true; } catch { /* invalid selector */ }
            }
        } catch { /* cross-origin stylesheet */ }
    }
    return false;
}

// ─── Locator string conversion ──────────────────────────────────────────

/**
 * Parse a JS locator string into PW keyword args.
 * e.g. `getByRole('tab', { name: 'npm', exact: true }).nth(1)` → `tab "npm" --nth 1`
 */
export function locatorToPwArgs(locator: string, role?: string | null): string {
    const q = (s: string) => `"${s}"`;

    // Extract nth modifier
    let nth = '';
    if (/\.first\(\)/.test(locator)) nth = ' --nth 0';
    else if (/\.last\(\)/.test(locator)) nth = ' --nth -1';
    else {
        const nthMatch = locator.match(/\.nth\((\d+)\)/);
        if (nthMatch) nth = ` --nth ${nthMatch[1]}`;
    }

    // getByRole with name — already has role
    const roleNameMatch = locator.match(/getByRole\(['"](.+?)['"],\s*\{[^}]*name:\s*['"](.+?)['"]/);
    if (roleNameMatch) return `${roleNameMatch[1]} ${q(roleNameMatch[2])}${nth}`;

    // getByRole without name — already has role
    const roleMatch = locator.match(/getByRole\(['"](.+?)['"]\)/);
    if (roleMatch) return `${roleMatch[1]}${nth}`;

    // getByTestId — test ID is not an accessible name, don't add role
    const testIdMatch = locator.match(/getByTestId\(['"](.+?)['"]\)/);
    if (testIdMatch) return `${q(testIdMatch[1])}${nth}`;

    // getByLabel / getByText / getByPlaceholder / getByTitle / getByAltText — prepend role if available
    const getByMatch = locator.match(/getBy\w+\(['"](.+?)['"](,\s*\{[^}]*\})?\)/);
    if (getByMatch) {
        const prefix = role ? `${role} ` : '';
        const exact = getByMatch[0].includes('exact: true') ? ' --exact' : '';
        return `${prefix}${q(getByMatch[1])}${exact}${nth}`;
    }

    // locator('css') fallback
    const locatorMatch = locator.match(/locator\(['"](.+?)['"]\)/);
    if (locatorMatch) return `${q(locatorMatch[1])}${nth}`;

    return q(locator);
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
            // Try ancestor context first (readable chained locators)
            const ancestorLocator = tryAncestorContext(el, role, name, matches);
            if (ancestorLocator) return ancestorLocator;
            // Fallback to nth-based disambiguation
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

    // 7. Text content — use exact matching for full text, substring for long text
    // Skip for <select>: textContent is concatenated option texts, not useful for locating.
    const text = (el.textContent || '').trim();
    if (text && el.tagName !== 'SELECT') {
        if (text.length <= 80) return `getByText(${escapeString(text)}, { exact: true })`;
        const snippet = text.slice(0, 50).replace(/\s+\S*$/, '');
        if (snippet) return `getByText(${escapeString(snippet)})`;
    }

    // 8. Role without name — only when unique on the page
    if (role) {
        const allWithRole = [...document.querySelectorAll('*')].filter(
            e => getImplicitRole(e) === role && (!e.checkVisibility || e.checkVisibility()),
        );
        if (allWithRole.length === 1) return `getByRole(${escapeString(role)})`;
    }

    // 9. CSS fallback — use nth-of-type for deterministic targeting
    return `locator(${escapeString(buildCssSelector(el))})`;
}

/** Shorthand mapping for PW --in flag (listitem → list for readability). */
const ROLE_SHORTHANDS: Record<string, string> = { listitem: 'list' };

/**
 * Generate separate JS and PW locators.
 * JS uses ancestor context (.filter chains); PW uses --in flag.
 * Falls back to .nth() when ancestor context isn't available.
 */
export function generateLocatorPair(el: Element): { js: string; pw: string; ancestor?: { role: string; text: string } } {
    const jsLocator = generateLocator(el);

    // No disambiguation needed — return as-is
    if (!jsLocator.includes('.filter(') && !jsLocator.includes('.nth(') && !jsLocator.includes('.first()')) {
        return { js: jsLocator, pw: jsLocator };
    }

    // JS used ancestor context (.filter chain) — extract ancestor info for PW --in flag
    if (jsLocator.includes('.filter(')) {
        const role = getImplicitRole(el)!;
        const name = getAccessibleName(el);
        const container = findContainerAncestor(el);
        const contextText = container ? getContextText(container.ancestor, el) : '';

        if (container && contextText) {
            const pwLocator = `getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
            const shortRole = ROLE_SHORTHANDS[container.role] ?? container.role;
            return { js: jsLocator, pw: pwLocator, ancestor: { role: shortRole, text: contextText } };
        }

        // .filter() present but no container context — fall back to .nth()
        const matches = findByRoleAndName(role, name);
        const base = `getByRole(${escapeString(role)}, { name: ${escapeString(name)}, exact: true })`;
        const idx = matches.indexOf(el);
        const pwLocator = idx === 0 ? base + '.first()' : base + `.nth(${idx})`;
        return { js: jsLocator, pw: pwLocator };
    }

    // .nth()/.first() — try heading context for PW --in flag
    const role = getImplicitRole(el);
    const name = getAccessibleName(el);
    if (role && name) {
        const matches = findByRoleAndName(role, name);
        const headingText = tryHeadingContext(el, matches);
        if (headingText) {
            const pwLocator = `getByRole(${escapeString(role)}, { name: ${escapeString(name)} })`;
            return { js: jsLocator, pw: pwLocator, ancestor: { role: '', text: headingText } };
        }
    }

    return { js: jsLocator, pw: jsLocator };
}

// ─── Element classification ─────────────────────────────────────────────

/** Check if element is a text-entry field */
export function isTextField(el: Element): boolean {
    if (el instanceof HTMLTextAreaElement) return true;
    if (el instanceof HTMLInputElement) {
        const type = el.type.toLowerCase();
        return !['checkbox', 'radio', 'submit', 'reset', 'button', 'hidden', 'file', 'image', 'range', 'color'].includes(type);
    }
    // contenteditable
    if (el.getAttribute('contenteditable') === 'true') return true;
    return false;
}

/** Check if element is a checkbox or radio */
export function isCheckable(el: Element): boolean {
    return el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio');
}

// ─── Command building ───────────────────────────────────────────────────

/** Build both PW and JS command strings for a recorder action */
export function buildCommands(action: string, el: Element, opts?: {
    value?: string;
    key?: string;
    checked?: boolean;
    option?: string;
}): { pw: string; js: string } | null {
    const { js: jsLocator, pw: pwLocator, ancestor } = generateLocatorPair(el);
    const jsLoc = `page.${jsLocator}`;
    const role = getImplicitRole(el);
    const pwArgs = locatorToPwArgs(pwLocator, role);
    const q = (s: string) => `"${s}"`;
    const inFlag = ancestor
        ? ` --in ${ancestor.role ? `${ancestor.role} ` : ''}${q(ancestor.text)}`
        : '';
    // CSS fallback locators need "css" prefix in PW commands
    const isCssFallback = pwLocator.startsWith('locator(');

    const cssPrefix = isCssFallback ? 'css ' : '';

    switch (action) {
        case 'hover':
            return {
                pw: `hover ${cssPrefix}${pwArgs}${inFlag}`,
                js: `await ${jsLoc}.hover();`,
            };

        case 'click': {
            let clickLoc = pwArgs;
            let clickPrefix = cssPrefix;
            // For <select> elements, try informal label when CSS fallback or bare role (#800)
            if (el.tagName === 'SELECT') {
                const isBareRoleClick = !isCssFallback && /^[a-z]+$/.test(pwArgs);
                if (isCssFallback || isBareRoleClick) {
                    const informal = getInformalLabel(el);
                    if (informal) {
                        clickLoc = q(informal);
                        clickPrefix = '';
                    }
                }
            }
            return {
                pw: `click ${clickPrefix}${clickLoc}${inFlag}`,
                js: `await ${jsLoc}.click();`,
            };
        }

        case 'fill': {
            const val = opts?.value ?? '';
            let fillLoc = pwArgs;
            let fillPrefix = cssPrefix;
            const isBareRole = !isCssFallback && /^[a-z]+$/.test(pwArgs);
            if (isCssFallback || isBareRole) {
                // Try informal label (e.g. adjacent table-cell text) before CSS.
                // At runtime, fillByText handles these via DOM-walking fallback.
                const informal = getInformalLabel(el);
                if (informal) {
                    fillLoc = q(informal);
                    fillPrefix = '';
                } else if (isBareRole) {
                    fillLoc = q(buildCssSelector(el));
                    fillPrefix = 'css ';
                }
            }
            return {
                pw: `fill ${fillPrefix}${fillLoc} ${q(val)}${inFlag}`,
                js: `await ${jsLoc}.fill(${escapeString(val)});`,
            };
        }

        case 'check':
            return {
                pw: `check ${cssPrefix}${pwArgs}${inFlag}`,
                js: `await ${jsLoc}.check();`,
            };

        case 'uncheck':
            return {
                pw: `uncheck ${cssPrefix}${pwArgs}${inFlag}`,
                js: `await ${jsLoc}.uncheck();`,
            };

        case 'select': {
            const optVal = opts?.option ?? '';
            let selLoc = pwArgs;
            let selPrefix = cssPrefix;
            const isBareRoleSel = !isCssFallback && /^[a-z]+$/.test(pwArgs);
            if (isCssFallback || isBareRoleSel) {
                const informal = getInformalLabel(el);
                if (informal) {
                    selLoc = q(informal);
                    selPrefix = '';
                } else if (isBareRoleSel) {
                    selLoc = q(buildCssSelector(el));
                    selPrefix = 'css ';
                }
            }
            return {
                pw: `select ${selPrefix}${selLoc} ${q(optVal)}${inFlag}`,
                js: `await ${jsLoc}.selectOption(${escapeString(optVal)});`,
            };
        }

        case 'press': {
            const key = opts?.key ?? '';
            if (pwArgs) {
                return {
                    pw: `press ${cssPrefix}${pwArgs} ${key}${inFlag}`,
                    js: `await ${jsLoc}.press(${escapeString(key)});`,
                };
            }
            // Global key press (no locator context)
            return {
                pw: `press ${key}`,
                js: `await page.keyboard.press(${escapeString(key)});`,
            };
        }

        default:
            return null;
    }
}

// ─── CSS selector ───────────────────────────────────────────────────────

export function buildCssSelector(el: Element): string {
    const tag = el.tagName.toLowerCase();
    if (el.id) return `${tag}#${CSS.escape(el.id)}`;
    const classes = [...el.classList].slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
    if (classes) return `${tag}${classes}`;

    // Bare tag — build a unique path from the nearest identifiable ancestor
    let current: Element | null = el;
    const parts: string[] = [];
    while (current && current !== document.body && current !== document.documentElement) {
        const t = current.tagName.toLowerCase();
        if (current.id) {
            parts.unshift(`${t}#${CSS.escape(current.id)}`);
            break;
        }
        const cls = [...current.classList].slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
        if (cls) {
            parts.unshift(`${t}${cls}`);
            break;
        }
        // Use nth-of-type if siblings share the tag
        const parent = current.parentElement;
        if (parent) {
            const siblings = [...parent.querySelectorAll(`:scope > ${t}`)];
            parts.unshift(siblings.length > 1
                ? `${t}:nth-of-type(${siblings.indexOf(current) + 1})`
                : t);
        } else {
            parts.unshift(t);
        }
        current = current.parentElement;
    }
    return parts.join(' > ');
}
