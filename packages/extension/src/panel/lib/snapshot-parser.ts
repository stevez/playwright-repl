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
        // Object: { "document [ref=e1]": [...children] } or { "textbox [ref=e5]": "value" }
        const obj = item as Record<string, unknown>;
        const key = Object.keys(obj)[0];
        const val = obj[key];
        const children = Array.isArray(val) ? toNodes(val)
            : (typeof val === 'string' || typeof val === 'number') ? [{ text: String(val), children: [] }]
            : [];
        return { text: stripRef(key), ref: extractRef(key), children }
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

    const matches = findAllByRoleName(root, role, name);
    const nth = matches.length > 1 ? matches.findIndex(n => n.ref === ref) : -1;

    return buildLocator(role, name, nth >= 0 ? nth : undefined);
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

export function locatorToRef(snapshotYaml: string, jsLocator: string): string | null {
    const roleNameMatch = jsLocator.match(/getByRole\(['"](.+?)['"](?:,\s*\{[^}]*name:\s*['"](.+?)['"])?/);
    if (!roleNameMatch) return null;
    const role = roleNameMatch[1];
    const name = roleNameMatch[2];

    const root = parseSnapshot(snapshotYaml);
    if (!root) return null;

    const matches = findAllByRoleName(root, role, name);
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0].ref ?? null;

    // Multiple matches — check for nth
    const nthMatch = jsLocator.match(/\.nth\((\d+)\)/);
    if (nthMatch) {
        const nth = parseInt(nthMatch[1]);
        return matches[nth]?.ref ?? null;
    }

    return matches[0].ref ?? null;
}

function parseRoleName(text: string): { role: string; name?: string } {
    const withoutAttrs = text.replace(/\s*\[.*?\]/g, '').trim();
    // Strip value suffix — e.g. `textbox "Search": dddd` → `textbox "Search"`
    const withoutValue = withoutAttrs.replace(/":\s.*$/, '"');
    const match = withoutValue.match(/^(\S+?)(?:\s+"(.*)")?$/);
    if (!match) return { role: text };
    return { role: match[1], name: match[2] };
}