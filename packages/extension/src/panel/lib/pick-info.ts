import { swDebugEval } from '@/lib/sw-debugger';
import type { ElementPickInfo, PickResultData } from '@/types';

/**
 * Derive a .pw keyword command from element info.
 * Returns null if no suitable name/text can be extracted.
 */
function derivePwCommand(info: ElementPickInfo): string | null {
    // Try accessible name from role-based locator: getByRole('button', { name: 'Submit' })
    const roleMatch = info.locator.match(/getByRole\([^,]+,\s*\{\s*name:\s*['"](.+?)['"]\s*\}/);
    if (roleMatch) return `highlight "${roleMatch[1]}"`;

    // Try test ID: getByTestId('submit')
    const testIdMatch = info.locator.match(/getByTestId\(['"](.+?)['"]\)/);
    if (testIdMatch) return `highlight "${testIdMatch[1]}"`;

    // Try label: getByLabel('Email')
    const labelMatch = info.locator.match(/getByLabel\(['"](.+?)['"]\)/);
    if (labelMatch) return `highlight "${labelMatch[1]}"`;

    // Try text: getByText('Submit')
    const textMatch = info.locator.match(/getByText\(['"](.+?)['"]\)/);
    if (textMatch) return `highlight "${textMatch[1]}"`;

    // Try placeholder: getByPlaceholder('Enter email')
    const placeholderMatch = info.locator.match(/getByPlaceholder\(['"](.+?)['"]\)/);
    if (placeholderMatch) return `highlight "${placeholderMatch[1]}"`;

    // Fallback: use element text content
    if (info.text && info.text.length <= 80) return `highlight "${info.text}"`;

    return null;
}

/**
 * Build a PickResultData from element info gathered by the content script.
 * Uses Playwright's locator when available, falls back to content script's own.
 */
export function buildPickResult(info: ElementPickInfo): PickResultData {
    const locatorExpr = info.pwLocator ?? info.locator;
    const locator = `page.${locatorExpr}`;
    const jsExpression = `await page.${locatorExpr}.highlight();`;
    const pwCommand = derivePwCommand({ ...info, locator: locatorExpr });

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
