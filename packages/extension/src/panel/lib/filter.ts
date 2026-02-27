/**
 * Filter verbose Playwright MCP response for panel display.
 *
 * Playwright MCP responses are always ### sections:
 *   ### Error          ← if command failed
 *   ### Result         ← if command produced a result
 *   ### Ran Playwright code
 *   ### Open tabs / Page / Snapshot / Events ...
 *
 * Strategy:
 *   - For "snapshot": return full response (the whole point is to see the tree)
 *   - For everything else: extract ### Result or ### Error content
 *   - Fallback: 'Done'
 */
export function filterResponse(command: string, text: string): string {
    const cmdName = command.trim().split(/\s+/)[0];

    // snapshot: return full response (the whole point is to see the tree)
    if (cmdName === 'snapshot' || cmdName === 'snap' || cmdName === 's') return text;

    // Extract content from ### Result or ### Error sections
    const sections = text.split(/^### /m).slice(1);
    for (const section of sections) {
        const nl = section.indexOf('\n');
        if (nl === -1) continue;
        const title = section.substring(0, nl).trim();
        const content = section.substring(nl + 1).trim();
        if (title === 'Result' || title === 'Error') return content;
    }

    return 'Done';
}
