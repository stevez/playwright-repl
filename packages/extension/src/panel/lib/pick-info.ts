import { swDebugEval } from '@/lib/sw-debugger';
import type { ElementPickInfo, PickResultData } from '@/types';

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

/**
 * Try to derive a pw highlight command from a locator string.
 * Returns null if no getBy* pattern matches.
 */
function parsePwCommand(locator: string, nth: string): string | null {
    const roleNameMatch = locator.match(/getByRole\(['"](.+?)['"],\s*\{[^}]*name:\s*['"](.+?)['"]/);
    if (roleNameMatch) return `highlight ${roleNameMatch[1]} "${roleNameMatch[2]}"${nth}`;

    const roleMatch = locator.match(/getByRole\(['"](.+?)['"]\)/);
    if (roleMatch) return `highlight ${roleMatch[1]}${nth}`;

    const testIdMatch = locator.match(/getByTestId\(['"](.+?)['"]\)/);
    if (testIdMatch) return `highlight "${testIdMatch[1]}"${nth}`;

    const labelMatch = locator.match(/getByLabel\(['"](.+?)['"]\)/);
    if (labelMatch) return `highlight "${labelMatch[1]}"${nth}`;

    const textMatch = locator.match(/getByText\(['"](.+?)['"]\)/);
    if (textMatch) return `highlight "${textMatch[1]}"${nth}`;

    const placeholderMatch = locator.match(/getByPlaceholder\(['"](.+?)['"]\)/);
    if (placeholderMatch) return `highlight "${placeholderMatch[1]}"${nth}`;

    return null;
}

/**
 * Derive a .pw keyword command from element info.
 * Tries content script's locator first, then Playwright's jsLocator as fallback.
 * Returns null if no suitable name/text can be extracted.
 */
function derivePwCommand(info: ElementPickInfo, jsLocator?: string): string | null {
    // Prefer nth from content script's locator (globally correct)
    // Fall back to Playwright's locator nth only when content script has none
    const contentNth = extractNth(info.locator);
    const nth = contentNth || extractNth(jsLocator ?? info.locator);

    // Try content script's locator first
    const fromContentScript = parsePwCommand(info.locator, nth);
    if (fromContentScript) return fromContentScript;

    // Fallback: try Playwright's locator (may have better name for long-text elements)
    if (jsLocator && jsLocator !== info.locator) {
        const fromPlaywright = parsePwCommand(jsLocator, nth);
        if (fromPlaywright) return fromPlaywright;
    }

    // Last resort: use element text content
    if (info.text && info.text.length <= 80) return `highlight "${info.text}"${nth}`;

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
function deriveAssertion(info: ElementPickInfo, locator: string, pwCommand: string | null): { assertJs: string; assertPw: string } {
    const tag = info.tag;
    const inputType = info.attributes?.type?.toLowerCase() ?? '';
    // Extract name from pw command, falling back to JS locator string
    const name = (pwCommand ? extractPwName(pwCommand) : null) ?? extractLocatorName(locator);
    const quotedName = name ? `"${name}"` : null;
    // Extract role and nth from locator for pw assertions
    const roleMatch = locator.match(/getByRole\(['"](.+?)['"]/);
    const role = roleMatch ? roleMatch[1] : null;
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
 * Build a PickResultData from element info gathered by the content script.
 * Prefer content script's locator (simpler, disambiguated with .nth()).
 * Fall back to Playwright's locator only when content script uses CSS fallback.
 */
export function buildPickResult(info: ElementPickInfo): PickResultData {
    const isCssFallback = /^locator\(/.test(info.locator);
    const jsLocator = isCssFallback ? (info.pwLocator ?? info.locator) : info.locator;
    const locator = `page.${jsLocator}`;
    const jsExpression = `await page.${jsLocator}.highlight();`;
    const pwCommand = derivePwCommand(info, jsLocator);
    const { assertJs, assertPw } = deriveAssertion(info, locator, pwCommand);

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
 * Resolve Playwright's locator for a picked element via swDebugEval.
 * The element must be marked with data-pw-pick-id by the content script.
 */
export async function resolvePlaywrightLocator(pickId: string): Promise<string | null> {
    try {
        const expr = `page.$('[data-pw-pick-id="${pickId}"]').then(async el => { if (!el) return null; await el.evaluate(e => e.removeAttribute('data-pw-pick-id')); const loc = await el._generateLocatorString(); el.dispose(); return loc ?? null; })`;
        const result = await swDebugEval(expr) as { result?: { type?: string; value?: string } };
        if (result?.result?.type === 'string' && result.result.value)
            return result.result.value;
        return null;
    } catch {
        return null;
    }
}
