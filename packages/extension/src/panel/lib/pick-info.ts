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
 * Derive a .pw keyword command from element info.
 * Returns null if no suitable name/text can be extracted.
 */
function derivePwCommand(info: ElementPickInfo, jsLocator?: string): string | null {
    // Extract nth from JS locator (has .first()/.nth()) not content script's locator
    const nth = extractNth(jsLocator ?? info.locator);

    // Try role + name: getByRole('button', { name: 'Submit' }) → highlight button "Submit"
    const roleNameMatch = info.locator.match(/getByRole\(['"](.+?)['"],\s*\{\s*name:\s*['"](.+?)['"]\s*\}/);
    if (roleNameMatch) return `highlight ${roleNameMatch[1]} "${roleNameMatch[2]}"${nth}`;

    // Try bare role: getByRole('tab') → highlight tab
    const roleMatch = info.locator.match(/getByRole\(['"](.+?)['"]\)/);
    if (roleMatch) return `highlight ${roleMatch[1]}${nth}`;

    // Try test ID: getByTestId('submit')
    const testIdMatch = info.locator.match(/getByTestId\(['"](.+?)['"]\)/);
    if (testIdMatch) return `highlight "${testIdMatch[1]}"${nth}`;

    // Try label: getByLabel('Email')
    const labelMatch = info.locator.match(/getByLabel\(['"](.+?)['"]\)/);
    if (labelMatch) return `highlight "${labelMatch[1]}"${nth}`;

    // Try text: getByText('Submit')
    const textMatch = info.locator.match(/getByText\(['"](.+?)['"]\)/);
    if (textMatch) return `highlight "${textMatch[1]}"${nth}`;

    // Try placeholder: getByPlaceholder('Enter email')
    const placeholderMatch = info.locator.match(/getByPlaceholder\(['"](.+?)['"]\)/);
    if (placeholderMatch) return `highlight "${placeholderMatch[1]}"${nth}`;

    // Fallback: use element text content
    if (info.text && info.text.length <= 80) return `highlight "${info.text}"${nth}`;

    return null;
}

/**
 * Build a PickResultData from element info gathered by the content script.
 * Playwright's locator for JS/locator display (more precise chaining).
 * Content script's locator for pw command (simpler, role-aware).
 */
export function buildPickResult(info: ElementPickInfo): PickResultData {
    const jsLocator = info.pwLocator ?? info.locator;
    const locator = `page.${jsLocator}`;
    const jsExpression = `await page.${jsLocator}.highlight();`;
    const pwCommand = derivePwCommand(info, jsLocator);

    return {
        locator,
        pwCommand,
        jsExpression,
        details: {
            tag: info.tag,
            text: info.text,
            html: info.html,
            visible: info.visible,
            enabled: info.enabled,
            count: 1,
            attributes: info.attributes,
            box: info.box,
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
