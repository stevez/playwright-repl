import { useState, useRef, useEffect } from 'react';
import type { SerializedValue } from './types';
import { fromCdpGetProperties } from './cdpToSerialized';
import { useTreeExpand } from './TreeExpandContext';

const MAX_DEPTH = 8;

interface Props {
    data: SerializedValue;
    label?: string;
    depth?: number;
    getProperties?: (objectId: string) => Promise<unknown>;
}

export function inlineSummary(data: SerializedValue): string {
    if (data.__type === 'null')      return 'null';
    if (data.__type === 'undefined') return 'undefined';
    if (data.__type === 'string')    return `"${data.v}"`;
    if (data.__type === 'number')    return String(data.v);
    if (data.__type === 'boolean')   return String(data.v);
    if (data.__type === 'function')  return `ƒ ${data.name}()`;
    if (data.__type === 'ref')       return `${data.cls} {…}`;
    if (data.__type === 'circular')  return '[Circular]';
    if (data.__type === 'error')     return '[Error]';
    if (data.__type === 'array') {
        const keys = Object.keys(data.props).slice(0, 3);
        const items = keys.map(k => inlineSummary(data.props[k])).join(', ');
        return `[${items}${Object.keys(data.props).length > 3 ? ', …' : ''}]`;
    }
    if (data.__type === 'object') {
        if (data.cls === 'Promise') {
            const stateVal = data.props['[[PromiseState]]'];
            const state = stateVal?.__type === 'string' ? stateVal.v : 'pending';
            if (state === 'pending') return '';
            const result = data.props['[[PromiseResult]]'];
            if (result && result.__type !== 'undefined') return `{<${state}>: ${inlineSummary(result)}}`;
            return `{<${state}>}`;
        }
        if (/^Map\(\d+\)$/.test(data.cls)) {
            const keys = Object.keys(data.props).slice(0, 3);
            const items = keys.map(k => `${k} => ${inlineSummary(data.props[k])}`).join(', ');
            return `{${items}${Object.keys(data.props).length > 3 ? ', …' : ''}}`;
        }
        if (/^Set\(\d+\)$/.test(data.cls)) {
            const keys = Object.keys(data.props).slice(0, 3);
            const items = keys.map(k => inlineSummary(data.props[k])).join(', ');
            return `{${items}${Object.keys(data.props).length > 3 ? ', …' : ''}}`;
        }
        const keys = Object.keys(data.props).slice(0, 3);
        const items = keys.map(k => `${k}: ${inlineSummary(data.props[k])}`).join(', ');
        return `{${items}${Object.keys(data.props).length > 3 ? ', …' : ''}}`;
    }
    return '';
}

/** For Map/Set expansion: keep original flattened entries, merge metadata, drop [[Entries]]. */
function mergeMapSetProps(original: Record<string, SerializedValue>, fetched: Record<string, SerializedValue>): Record<string, SerializedValue> {
    const merged: Record<string, SerializedValue> = { ...original };
    for (const [k, v] of Object.entries(fetched)) {
        if (k === '[[Entries]]') continue;
        merged[k] = v;
    }
    return merged;
}

export function ObjectTree({ data, label, depth = 0, getProperties }: Props) {
    const [open, setOpen] = useState(depth < 1);
    const [childProps, setChildProps] = useState<Record<string, SerializedValue> | null>(null);
    const [loading, setLoading] = useState(false);
    const fetchedRef = useRef(false);
    const { generation, expanded } = useTreeExpand();

    useEffect(() => {
        if (generation > 0) setOpen(expanded);
    }, [generation]);

    const objectId =
        depth < MAX_DEPTH && (data.__type === 'object' || data.__type === 'array' || data.__type === 'ref')
            ? data.objectId
            : undefined;

    useEffect(() => {
        if (open && objectId && getProperties && !fetchedRef.current) {
            fetchedRef.current = true;
            setLoading(true);
            getProperties(objectId).then(raw => {
                setChildProps(fromCdpGetProperties(raw));
                setLoading(false);
            });
        }
    }, [open, objectId]);

    const prefix = label !== undefined
        ? <><span className="ot-key">{label}</span><span className="ot-colon">: </span></>
        : null;

    // Primitives
    if (data.__type === 'null')      return <span>{prefix}<span className="ot-null">null</span></span>;
    if (data.__type === 'undefined') return <span>{prefix}<span className="ot-undefined">undefined</span></span>;
    if (data.__type === 'string')    return <span>{prefix}<span className="ot-string">"{data.v}"</span></span>;
    if (data.__type === 'number')    return <span>{prefix}<span className="ot-number">{data.v}</span></span>;
    if (data.__type === 'boolean')   return <span>{prefix}<span className="ot-boolean">{String(data.v)}</span></span>;
    if (data.__type === 'function')  return <span>{prefix}<span className="ot-summary">ƒ {data.name}()</span></span>;
    if (data.__type === 'circular')  return <span>{prefix}<span className="ot-empty">[Circular]</span></span>;
    if (data.__type === 'error')     return <span>{prefix}<span className="ot-empty">[Error]</span></span>;

    // Ref — expandable if objectId present, static otherwise
    if (data.__type === 'ref') {
        if (!objectId) return <span>{prefix}<span className="ot-summary">{data.cls} {'{…}'}</span></span>;
        const keys = Object.keys(childProps ?? {});
        return (
            <span className="ot-node">
                {prefix}
                <span className="ot-toggle" onClick={() => setOpen(o => !o)}>
                    {open ? '▼' : '▶'}{' '}
                    <span className="ot-summary">{data.cls} {!open && '{…}'}</span>
                </span>
                {open && (
                    <div className="ot-children">
                        {loading
                            ? <div className="ot-row"><span className="ot-empty">Loading…</span></div>
                            : keys.map(k => (
                                <div key={k} className="ot-row">
                                    <ObjectTree data={childProps![k]} label={k} depth={depth + 1} getProperties={getProperties} />
                                </div>
                            ))
                        }
                    </div>
                )}
            </span>
        );
    }

    // Object / Array
    const isArray = data.__type === 'array';
    const isMapOrSet = !isArray && /^(Map|Set)\(\d+\)$/.test(data.cls);
    const propsToShow = childProps
        ? (isMapOrSet ? mergeMapSetProps(data.props, childProps) : childProps)
        : data.props;
    const keys = Object.keys(propsToShow);
    const header = isArray ? `Array(${data.len})` : data.cls;

    if (keys.length === 0 && !objectId && !loading) {
        return <span>{prefix}<span className="ot-empty">{isArray ? '[]' : `${data.cls} {}`}</span></span>;
    }

    return (
        <span className="ot-node">
            {prefix}
            <span className="ot-toggle" onClick={() => setOpen(o => !o)}>
                {open ? '▼' : '▶'}{' '}
                <span className="ot-summary">
                    {header} {!open && inlineSummary(data)}
                </span>
            </span>
            {open && (
                <div className="ot-children">
                    {loading
                        ? <div className="ot-row"><span className="ot-empty">Loading…</span></div>
                        : keys.map(k => {
                            const isMapEntry = isMapOrSet && /^Map\(/.test(data.cls) && k in data.props;
                            return (
                                <div key={k} className="ot-row">
                                    {isMapEntry ? (
                                        <span>
                                            <span className="ot-key">{k}</span>
                                            <span className="ot-colon">{' => '}</span>
                                            <ObjectTree data={propsToShow[k]} depth={depth + 1} getProperties={getProperties} />
                                        </span>
                                    ) : (
                                        <ObjectTree data={propsToShow[k]} label={k} depth={depth + 1} getProperties={getProperties} />
                                    )}
                                </div>
                            );
                        })
                    }
                </div>
            )}
        </span>
    );
}
