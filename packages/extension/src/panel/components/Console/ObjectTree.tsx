import { useState, useRef, useEffect } from 'react';
import type { SerializedValue } from './types';
import { fromCdpGetProperties } from './cdpToSerialized';

const MAX_DEPTH = 8;

interface Props {
    data: SerializedValue;
    label?: string;
    depth?: number;
    getProperties?: (objectId: string) => Promise<unknown>;
}

function inlineSummary(data: SerializedValue): string {
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
        const keys = Object.keys(data.props).slice(0, 3);
        const items = keys.map(k => `${k}: ${inlineSummary(data.props[k])}`).join(', ');
        return `{${items}${Object.keys(data.props).length > 3 ? ', …' : ''}}`;
    }
    return '';
}

export function ObjectTree({ data, label, depth = 0, getProperties }: Props) {
    const [open, setOpen] = useState(depth < 1);
    const [childProps, setChildProps] = useState<Record<string, SerializedValue> | null>(null);
    const [loading, setLoading] = useState(false);
    const fetchedRef = useRef(false);

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
    const propsToShow = childProps ?? data.props;
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
                        : keys.map(k => (
                            <div key={k} className="ot-row">
                                <ObjectTree data={propsToShow[k]} label={k} depth={depth + 1} getProperties={getProperties} />
                            </div>
                        ))
                    }
                </div>
            )}
        </span>
    );
}
