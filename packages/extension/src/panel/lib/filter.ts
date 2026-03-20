/**
 * Filter verbose Playwright MCP response for panel display.
 *
 * Playwright MCP responses are always ### sections:
 *   ### Error / Result / Modal state / Page / Snapshot / ...
 *
 * Strategy:
 *   - Keep: Result, Error, Modal state, Snapshot (only when cmdName is 'snapshot')
 *   - Skip: Ran Playwright code, Open tabs, Page, Events
 *   - Fallback: raw text if no sections found, otherwise 'Done'
 */
export function filterResponse(text: string, cmdName?: string): string {
    const sections = text.split(/^### /m).slice(1);
    if (sections.length === 0) return text.trim() || 'Done';
    const kept: string[] = [];
    for (const section of sections) {
        const nl = section.indexOf('\n');
        if (nl === -1) continue;
        const title = section.substring(0, nl).trim();
        const content = section.substring(nl + 1).trim();
        if (title === 'Snapshot' && cmdName !== 'snapshot') continue;
        if (title === 'Result' || title === 'Error' || title === 'Modal state' || title === 'Snapshot')
            kept.push(content);
    }
    return kept.length > 0 ? kept.join('\n') : 'Done';
}
