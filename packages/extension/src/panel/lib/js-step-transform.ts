/**
 * Injects `await __breakpoint__(originalLineIndex)` before each executable line.
 * Blank lines and // comments are skipped.
 */
export function injectBreakpoints(source: string): string {
    const lines = source.split('\n');
    const out: string[] = [];
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed !== '' && !trimmed.startsWith('//')) {
            out.push(`await __breakpoint__(${i});`);
        }
        out.push(lines[i]);
    }
    return out.join('\n');
}
