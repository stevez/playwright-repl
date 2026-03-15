import type { SerializedValue } from './types';

interface CdpPropertyPreview {
    name: string;
    type: string;
    subtype?: string;
    value?: string;
}

interface CdpEntryPreview {
    key?: { type: string; subtype?: string; value?: string; description?: string };
    value: { type: string; subtype?: string; value?: string; description?: string };
}

interface CdpPreview {
    type: string;
    description?: string;
    overflow?: boolean;
    subtype?: string;
    properties?: CdpPropertyPreview[];
    entries?: CdpEntryPreview[];
}

export interface CdpRemoteObject {
    type: string;
    subtype?: string;
    className?: string;
    value?: unknown;
    description?: string;
    objectId?: string;
    preview?: CdpPreview;
}

export interface CdpPropertyDescriptor {
    name: string;
    value?: CdpRemoteObject;
}

function fromPreviewProperty(prop: CdpPropertyPreview): SerializedValue {
    const { type, subtype, value, name } = prop;
    if (type === 'undefined') return { __type: 'undefined' };
    if (type === 'object' && subtype === 'null') return { __type: 'null' };
    if (type === 'string')   return { __type: 'string', v: value ?? '' };
    if (type === 'number')   return { __type: 'number', v: Number(value ?? 0) };
    if (type === 'boolean')  return { __type: 'boolean', v: value === 'true' };
    if (type === 'function') return { __type: 'function', name };
    // Object: no objectId available from preview — show as unexpandable ref
    if (type === 'object')   return { __type: 'ref', cls: value ?? 'Object' };
    return { __type: 'string', v: String(value ?? '') };
}

export function fromCdpRemoteObject(obj: CdpRemoteObject): SerializedValue {
    const { type, subtype, className, value, description, preview, objectId } = obj;
    if (type === 'undefined') return { __type: 'undefined' };
    if (type === 'object' && subtype === 'null') return { __type: 'null' };
    if (type === 'string')   return { __type: 'string', v: value as string };
    if (type === 'number')   return { __type: 'number', v: value as number };
    if (type === 'boolean')  return { __type: 'boolean', v: value as boolean };
    if (type === 'function') return { __type: 'function', name: description ?? '(anonymous)' };
    if (type === 'object') {
        // Special subtypes — use description string directly
        if (subtype === 'date' || subtype === 'regexp') {
            return { __type: 'string', v: description ?? String(value ?? '') };
        }
        if (subtype === 'error') return { __type: 'string', v: description ?? '[Error]' };
        // Map / Set — entries live in preview.entries, not preview.properties
        if (subtype === 'map' || subtype === 'set') {
            const props: Record<string, SerializedValue> = {};
            if (preview?.entries) {
                for (let i = 0; i < preview.entries.length; i++) {
                    const entry: CdpEntryPreview = preview.entries[i];
                    const key = subtype === 'map'
                        ? String(entry.key?.value ?? entry.key?.description ?? i)
                        : String(i);
                    props[key] = fromPreviewProperty({ name: key, type: entry.value.type, subtype: entry.value.subtype, value: entry.value.value });
                }
            }
            return { __type: 'object', cls: description ?? className ?? (subtype === 'map' ? 'Map' : 'Set'), props, objectId };
        }
        const cls = className ?? 'Object';
        const isArray = subtype === 'array';
        // Use preview properties as initial display; objectId enables lazy full expansion
        const props: Record<string, SerializedValue> = {};
        if (preview?.properties) {
            for (const prop of preview.properties) {
                props[prop.name] = fromPreviewProperty(prop);
            }
        }
        if (isArray) {
            const len = preview?.properties?.length ?? 0;
            return { __type: 'array', cls, len, props, objectId };
        }
        return { __type: 'object', cls, props, objectId };
    }
    return { __type: 'string', v: String(value ?? description ?? '') };
}

/** Convert Runtime.getProperties response into SerializedValue props map. */
export function fromCdpGetProperties(raw: unknown): Record<string, SerializedValue> {
    const result = (raw as any)?.result as CdpPropertyDescriptor[] | undefined;
    if (!result) return {};
    const props: Record<string, SerializedValue> = {};
    for (const desc of result) {
        if (desc.value) props[desc.name] = fromCdpRemoteObject(desc.value);
    }
    return props;
}
