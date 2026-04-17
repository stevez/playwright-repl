import type { ElementPickInfo, PickResultData } from '@/types';
import type { SerializedValue } from '@/components/Console/types';

/**
 * Extract --nth flag from a JS locator chain (.first(), .last(), .nth(N)).
 */
function extractNth(locator: string): string {
    if (/\.first\(\)/.test(locator)) return ' --nth 0';
    if (/\.last\(\)/.test(locator)) return ' --nth -1';
    const nthMatch = locator.match(/\.nth\((\d+)\)/);
    if (nthMatch) return ` --nth ${nthMatch[1]}`;
    return '';
}

// ─── Aria snapshot parsing ──────────────────────────────────────────────

type AriaNode = { role: string; name: string };

/**
 * Parse an aria snapshot YAML line into role + name.
 * e.g. `- button "Submit"` → { role: 'button', name: 'Submit' }
 * e.g. `- listitem:` → { role: 'listitem', name: '' }
 */
function parseAriaLine(line: string): AriaNode | null {
    const trimmed = line.replace(/^\s*-\s*/, '').replace(/:$/, '');
    // role "name" or role 'name'
    const match = trimmed.match(/^(\w[\w-]*)\s+["'](.+?)["']$/);
    if (match) return { role: match[1], name: match[2] };
    // role only (no name)
    const roleOnly = trimmed.match(/^(\w[\w-]*)$/);
    if (roleOnly) return { role: roleOnly[1], name: '' };
    return null;
}

/**
 * Parse aria snapshot to extract the picked element and optional parent context.
 * Returns { element, parent } where parent provides --in context.
 *
 * Single line:  `- button "Submit"` → element only
 * Nested:       `- listitem:\n  - checkbox "reading"` → element=checkbox, parent=listitem
 */
function parseAriaSnapshot(snapshot: string): { element: AriaNode; parent?: AriaNode } | null {
    const lines = snapshot.split('\n').filter(l => l.trim() && l.trim() !== '-');
    if (!lines.length) return null;

    // Single-line snapshot: the element itself
    if (lines.length === 1) {
        const element = parseAriaLine(lines[0]);
        return element ? { element } : null;
    }

    // Multi-line: first line is parent, first child is the element
    const parent = parseAriaLine(lines[0]);
    if (!parent) return null;

    // Find first child line (deeper indentation)
    const parentIndent = lines[0].search(/\S/);
    for (let i = 1; i < lines.length; i++) {
        const indent = lines[i].search(/\S/);
        if (indent > parentIndent) {
            const element = parseAriaLine(lines[i]);
            if (element) return { element, parent };
        }
    }

    // No children parsed — treat first line as the element
    return { element: parent };
}

/**
 * Extract frame selector from a JS locator that contains .contentFrame().
 * e.g. `locator('#oevd-iframe').contentFrame().getByRole('radio', { name: 'Bis 45 km/h' })`
 * → { frameSelector: '#oevd-iframe', innerLocator: "getByRole('radio', { name: 'Bis 45 km/h' })" }
 * Returns null if no frame context is present.
 */
function extractFrameContext(locator: string): { frameSelector: string; innerLocator: string } | null {
    const match = locator.match(/^locator\(['"](.+?)['"]\)\.contentFrame\(\)\.(.+)$/);
    if (match) return { frameSelector: match[1], innerLocator: match[2] };
    return null;
}

/**
 * Extract role + name from a JS locator string (lightweight fallback).
 * e.g. `getByRole('button', { name: 'Submit' })` → { role: 'button', name: 'Submit' }
 */
function parseJsLocator(locator: string): { role?: string; name?: string } {
    const roleNameMatch = locator.match(/getByRole\(['"](.+?)['"],\s*\{[^}]*name:\s*['"](.+?)['"]/);
    if (roleNameMatch) return { role: roleNameMatch[1], name: roleNameMatch[2] };
    const roleMatch = locator.match(/getByRole\(['"](.+?)['"]\)/);
    if (roleMatch) return { role: roleMatch[1] };
    // getByLabel/getByText/getByPlaceholder/getByTestId — name only
    const getByMatch = locator.match(/getBy\w+\(['"](.+?)['"]\)/);
    if (getByMatch) return { name: getByMatch[1] };
    return {};
}

/**
 * Derive a .pw keyword command from aria snapshot + locator.
 * Uses aria snapshot as primary source; falls back to JS locator parsing.
 * When headingContext is provided and --nth is present, replaces --nth with --in "heading".
 */
function derivePwCommand(info: ElementPickInfo, ariaSnapshot?: string, headingContext?: string | null): string | null {
    const nth = extractNth(info.locator);
    const headingIn = headingContext ? ` --in "${headingContext}"` : '';

    // Primary: derive from aria snapshot
    if (ariaSnapshot) {
        const parsed = parseAriaSnapshot(ariaSnapshot);
        if (parsed) {
            const { element, parent } = parsed;
            const nameArg = element.name ? ` "${element.name}"` : '';
            let inFlag = '';
            if (parent && parent.role !== element.role) {
                const parentName = parent.name ? ` "${parent.name}"` : '';
                inFlag = ` --in ${parent.role}${parentName}`;
            }
            // Prefer heading --in over --nth when no aria parent context exists
            if (!inFlag && headingIn) {
                return `highlight ${element.role}${nameArg}${headingIn}`;
            }
            return `highlight ${element.role}${nameArg}${nth}${inFlag}`;
        }
    }

    // Fallback: parse JS locator string
    const { role, name } = parseJsLocator(info.locator);
    if (role && name) return `highlight ${role} "${name}"${headingIn || nth}`;
    if (role) return `highlight ${role}${headingIn || nth}`;
    if (name) return `highlight "${name}"${headingIn || nth}`;

    // Last resort: element text
    const text = info.text?.trim();
    if (text && text.length <= 80) return `highlight "${text}"${headingIn || nth}`;

    return null;
}

/**
 * Extract the quoted name from a pw command like `highlight "Submit"` or `highlight button "Submit"`.
 */
function extractPwName(pwCommand: string): string | null {
    const match = pwCommand.match(/"(.+?)"/);
    return match ? match[1] : null;
}

/**
 * Extract the name/text argument from a JS locator string like `page.getByText('Submit')`.
 * Used as fallback when pwCommand is null (e.g. content script locator was CSS).
 */
function extractLocatorName(locator: string): string | null {
    const roleNameMatch = locator.match(/getByRole\(['"](.+?)['"],\s*\{[^}]*name:\s*['"](.+?)['"]/);
    if (roleNameMatch) return roleNameMatch[2];
    const textMatch = locator.match(/getByText\(['"](.+?)['"]\)/);
    if (textMatch) return textMatch[1];
    const labelMatch = locator.match(/getByLabel\(['"](.+?)['"]\)/);
    if (labelMatch) return labelMatch[1];
    const testIdMatch = locator.match(/getByTestId\(['"](.+?)['"]\)/);
    if (testIdMatch) return testIdMatch[1];
    const placeholderMatch = locator.match(/getByPlaceholder\(['"](.+?)['"]\)/);
    if (placeholderMatch) return placeholderMatch[1];
    return null;
}

/**
 * Derive assertion strings (JS + PW) based on element type.
 * Priority: checked > value > text > visible.
 */
function deriveAssertion(info: ElementPickInfo, locator: string, pwCommand: string | null, ariaSnapshot?: string): { assertJs: string; assertPw: string } {
    const tag = info.tag;
    const inputType = info.attributes?.type?.toLowerCase() ?? '';
    // Extract name from pw command, falling back to JS locator string
    const name = (pwCommand ? extractPwName(pwCommand) : null) ?? extractLocatorName(locator);
    const quotedName = name ? `"${name}"` : null;
    // Extract role from aria snapshot, element attributes, or JS locator
    const ariaRole = ariaSnapshot ? parseAriaSnapshot(ariaSnapshot)?.element.role : null;
    const role = ariaRole || info.attributes?.role || parseJsLocator(locator)?.role || null;
    const nth = extractNth(locator);

    // Checkbox/radio → checked assertion
    if (tag === 'input' && (inputType === 'checkbox' || inputType === 'radio') && info.checked !== undefined) {
        return {
            assertJs: info.checked
                ? `await expect(${locator}).toBeChecked();`
                : `await expect(${locator}).not.toBeChecked();`,
            assertPw: quotedName
                ? `verify-value ${quotedName} "${info.checked ? 'on' : 'off'}"`
                : `verify-value "${info.checked ? 'on' : 'off'}"`,
        };
    }

    // Input/textarea/select → value assertion
    if ((tag === 'input' || tag === 'textarea' || tag === 'select') && info.value !== undefined) {
        return {
            assertJs: `await expect(${locator}).toHaveValue('${info.value.replace(/'/g, "\\'")}');`,
            assertPw: quotedName
                ? `verify-value ${quotedName} "${info.value}"`
                : `verify-value "${info.value}"`,
        };
    }

    // Helper: build pw assertion target, consistent with JS locator's role/name/nth
    function pwTarget(fallbackText?: string): string {
        if (role && quotedName) return `${role} ${quotedName}${nth}`;
        if (quotedName) return `${quotedName}${nth}`;
        if (fallbackText) return `"${fallbackText}"${nth}`;
        return '';
    }

    // Has text content → text assertion
    // Skip if locator is getByText — toContainText with the same text is redundant
    const text = info.text?.trim();
    const locatorIsText = /\.getByText\(/.test(locator);
    if (text && !locatorIsText) {
        const assertText = name ?? text;
        const target = pwTarget(assertText);
        return {
            assertJs: `await expect(${locator}).toContainText('${assertText.replace(/'/g, "\\'")}');`,
            assertPw: role ? `verify-element ${target}` : `verify-text ${target}`,
        };
    }

    // Fallback → visible assertion
    const target = pwTarget();
    let assertPw: string;
    if (role) {
        assertPw = target ? `verify-element ${target}` : 'verify-text';
    } else if (target) {
        assertPw = `verify-text ${target}`;
    } else {
        assertPw = 'verify-text';
    }
    return {
        assertJs: `await expect(${locator}).toBeVisible();`,
        assertPw,
    };
}

/**
 * Build a PickResultData from element info gathered by pickLocator().
 * Uses aria snapshot (when available) to derive .pw commands from
 * Playwright's semantic model instead of regex-parsing the JS locator.
 */
export function buildPickResult(info: ElementPickInfo, cdpLocator?: string | null, ariaSnapshot?: string, headingContext?: string | null): PickResultData {
    const jsLocator = cdpLocator ?? info.locator;
    const locator = `page.${jsLocator}`;
    const jsExpression = `await page.${jsLocator}.highlight();`;

    // Extract context flags from JS locator — applied to all PW commands
    const frame = extractFrameContext(jsLocator);
    const innerLocator = frame ? frame.innerLocator : jsLocator;
    const exact = /exact:\s*true/.test(innerLocator);
    const extraFlags = (exact ? ' --exact' : '') + (frame ? ` --frame "${frame.frameSelector}"` : '');
    const headingIn = headingContext ? ` --in "${headingContext}"` : '';

    let pwCommand = derivePwCommand({ ...info, locator: innerLocator }, ariaSnapshot, headingContext);
    if (pwCommand) pwCommand += extraFlags; // --in already inside derivePwCommand

    const assertion = deriveAssertion(info, locator, pwCommand, ariaSnapshot);
    const assertJs = assertion.assertJs;
    let assertPw = assertion.assertPw;
    if (assertPw) assertPw += headingIn + extraFlags; // assertions need --in added here

    return {
        locator,
        pwCommand,
        jsExpression,
        assertJs,
        assertPw,
        details: {
            tag: info.tag,
            text: info.text,
            html: info.html,
            visible: info.visible,
            enabled: info.enabled,
            count: 1,
            attributes: info.attributes,
            box: info.box,
            value: info.value,
            checked: info.checked,
        },
    };
}

/**
 * Convert a PickResultData into a SerializedValue for rendering via ObjectTree.
 */
export function pickResultToSerialized(data: PickResultData): SerializedValue {
    const props: Record<string, SerializedValue> = {};

    // locator: { js, pw }
    const locatorProps: Record<string, SerializedValue> = {
        js: { __type: 'string', v: data.jsExpression },
    };
    if (data.pwCommand) locatorProps.pw = { __type: 'string', v: data.pwCommand };
    props.locator = { __type: 'object', cls: '', props: locatorProps };

    // assert: { js, pw }
    if (data.assertJs) {
        const assertProps: Record<string, SerializedValue> = {
            js: { __type: 'string', v: data.assertJs },
        };
        if (data.assertPw) assertProps.pw = { __type: 'string', v: data.assertPw };
        props.assert = { __type: 'object', cls: '', props: assertProps };
    }

    // aria: placeholder so key appears in collapsed summary; actual rendering via extraChildren
    if (data.ariaSnapshot) {
        props.aria = { __type: 'string', v: '' };
    }

    return { __type: 'object', cls: 'PickResult', props };
}


