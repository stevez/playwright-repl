import { inlineSummary } from '@/components/Console/ObjectTree';
import type { SerializedValue } from '@/components/Console/types';
import type { InlineValues } from './codemirror-setup';

const MAX_INLINE_LENGTH = 80;

export function formatInlineValues(
    pausedLine: number,
    props: Record<string, SerializedValue> | null,
): InlineValues {
    const values = new Map<number, string>();
    if (pausedLine < 0 || !props) return values;

    const parts: string[] = [];
    for (const [name, val] of Object.entries(props)) {
        if (name.startsWith('[[')) continue;
        const summary = inlineSummary(val);
        if (!summary) continue;
        parts.push(`${name} = ${summary}`);
    }
    if (parts.length > 0) {
        let text = parts.join(', ');
        if (text.length > MAX_INLINE_LENGTH) text = text.slice(0, MAX_INLINE_LENGTH) + '…';
        values.set(pausedLine, text);
    }

    return values;
}