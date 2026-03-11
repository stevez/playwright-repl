import yaml from 'js-yaml';

export interface SnapshotNode {
    text: string,
    ref?: string,
    children: SnapshotNode[];
}

export function parseSnapshot(yamlText: string): SnapshotNode | null {
    const parsed = yaml.load(yamlText);
    if (!Array.isArray(parsed)) return null;
    const nodes = toNodes(parsed);
    return nodes[0] ?? null;
}

function toNodes(parsed: unknown[]): SnapshotNode[] {
    return parsed.map(item => {
        if(typeof item === 'string') {
            return { text: stripRef(item), ref: extractRef(item), children: []}
        }
        // Object: { "document [ref=e1]": [...children] }
        const obj = item as Record<string, unknown[]>;
        const key = Object.keys(obj)[0];
        const children = obj[key];
        return { text: stripRef(key), ref: extractRef(key), children: Array.isArray(children) ? toNodes(children) : [] }
    })
}

// "document [ref=e1]" → "document"
function stripRef(text: string): string {
  return text.replace(/\s*\[ref=e\d+\]/, '').trim();
}

// "document [ref=e1]" → "e1"
function extractRef(text: string): string | undefined {
  return text.match(/\[ref=(e\d+)\]/)?.[1];
}