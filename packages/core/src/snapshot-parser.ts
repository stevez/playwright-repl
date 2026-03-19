import yaml from 'js-yaml';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SnapshotNode {
    text: string;
    ref?: string;
    children: SnapshotNode[];
}

// ─── Snapshot parsing ───────────────────────────────────────────────────────

export function parseSnapshot(yamlText: string): SnapshotNode | null {
    let parsed: unknown;
    try { parsed = yaml.load(yamlText); } catch { return null; }
    if (!Array.isArray(parsed)) return null;
    const nodes = toNodes(parsed);
    return nodes[0] ?? null;
}

function toNodes(parsed: unknown[]): SnapshotNode[] {
    return parsed.map(item => {
        if (typeof item === 'string') {
            return { text: stripRef(item), ref: extractRef(item), children: [] };
        }
        // Object: { "document [ref=e1]": [...children] }
        const obj = item as Record<string, unknown[]>;
        const key = Object.keys(obj)[0];
        const children = obj[key];
        return {
            text: stripRef(key),
            ref: extractRef(key),
            children: Array.isArray(children) ? toNodes(children) : [],
        };
    });
}

// "document [ref=e1]" → "document"
function stripRef(text: string): string {
    return text.replace(/\s*\[ref=e\d+\]/, '').trim();
}

// "document [ref=e1]" → "e1"
function extractRef(text: string): string | undefined {
    return text.match(/\[ref=(e\d+)\]/)?.[1];
}

// ─── Ref → Locator conversion ───────────────────────────────────────────────

export interface LocatorResult {
    js: string;
    pw: string;
}

export function refToLocator(snapshotYaml: string, ref: string): LocatorResult | null {
    const root = parseSnapshot(snapshotYaml);
    if (!root) return null;
    const node = findByRef(root, ref);
    if (!node) return null;
    const { role, name } = parseRoleName(node.text);

    // Check if role+name is unique in the tree
    const matches = findAllByRoleName(root, role, name);
    const nth = matches.length > 1 ? matches.findIndex(n => n.ref === ref) : -1;

    return buildLocator(role, name, nth >= 0 ? nth : undefined);
}

export interface RefLocatorEntry {
    ref: string;
    js: string;
    pw: string;
}

export function allRefLocators(snapshotYaml: string): RefLocatorEntry[] {
    const root = parseSnapshot(snapshotYaml);
    if (!root) return [];
    const nodes = collectRefNodes(root);
    const results: RefLocatorEntry[] = [];
    for (const node of nodes) {
        const { role, name } = parseRoleName(node.text);
        const matches = findAllByRoleName(root, role, name);
        const nth = matches.length > 1 ? matches.findIndex(n => n.ref === node.ref) : -1;
        const loc = buildLocator(role, name, nth >= 0 ? nth : undefined);
        results.push({ ref: node.ref!, ...loc });
    }
    return results;
}

function collectRefNodes(node: SnapshotNode): SnapshotNode[] {
    const nodes: SnapshotNode[] = [];
    if (node.ref) nodes.push(node);
    for (const child of node.children) nodes.push(...collectRefNodes(child));
    return nodes;
}

function findByRef(node: SnapshotNode, ref: string): SnapshotNode | null {
    if (node.ref === ref) return node;
    for (const child of node.children) {
        const found = findByRef(child, ref);
        if (found) return found;
    }
    return null;
}

function findAllByRoleName(node: SnapshotNode, role: string, name?: string): SnapshotNode[] {
    const results: SnapshotNode[] = [];
    const { role: r, name: n } = parseRoleName(node.text);
    if (r === role && n === name) results.push(node);
    for (const child of node.children) {
        results.push(...findAllByRoleName(child, role, name));
    }
    return results;
}

function buildLocator(role: string, name?: string, nth?: number): LocatorResult {
    const nthJs = nth !== undefined ? `.nth(${nth})` : '';
    const nthPw = nth !== undefined ? ` --nth ${nth}` : '';
    if (name) {
        const escaped = name.replace(/'/g, "\\'");
        return {
            js: `page.getByRole('${role}', { name: '${escaped}', exact: true })${nthJs}`,
            pw: `${role} "${name}"${nthPw}`,
        };
    }
    return {
        js: `page.getByRole('${role}')${nthJs}`,
        pw: `${role}${nthPw}`,
    };
}

function parseRoleName(text: string): { role: string; name?: string } {
    // text is already stripped of [ref=eN] by parseSnapshot
    // but may contain other attrs like [level=2], [checked], [disabled]
    const withoutAttrs = text.replace(/\s*\[.*?\]/g, '').trim();
    const match = withoutAttrs.match(/^(\S+?)(?:\s+"(.*)")?$/);
    if (!match) return { role: text };
    return { role: match[1], name: match[2] };
}
