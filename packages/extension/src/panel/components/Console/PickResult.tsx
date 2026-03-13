import { useState } from 'react';
import type { PickResultData } from '@/types';

function Row({ label, value }: { label: string; value: string }) {
    return (
        <div className="ot-row">
            <span className="ot-key">{label}</span>
            <span className="ot-colon">:&nbsp;</span>
            <span className="ot-string min-w-0 truncate">{value}</span>
        </div>
    );
}

export function PickResult({ data }: { data: PickResultData }) {
    const [showDetails, setShowDetails] = useState(false);
    const d = data.details;

    return (
        <div data-type="pick-result">
            <Row label="locator" value={data.locator} />
            <Row label="js" value={data.jsExpression} />
            {data.pwCommand && <Row label="pw" value={data.pwCommand} />}

            {d && (
                <div>
                    <span className="ot-toggle" onClick={() => setShowDetails(!showDetails)}>
                        {showDetails ? '▾' : '▸'}&nbsp;
                    </span>
                    <span className="ot-key">element</span>
                    {showDetails && (
                        <div className="ot-children">
                            <div className="ot-row"><span className="ot-key">dom</span><span className="ot-colon">:&nbsp;</span><span className="ot-string">{d.html}</span></div>
                            <div className="ot-row"><span className="ot-key">tag</span><span className="ot-colon">:&nbsp;</span><span className="ot-string">"{d.tag}"</span></div>
                            {d.text && <div className="ot-row"><span className="ot-key">text</span><span className="ot-colon">:&nbsp;</span><span className="ot-string">"{d.text.length > 80 ? d.text.slice(0, 80) + '…' : d.text}"</span></div>}
                            <div className="ot-row"><span className="ot-key">visible</span><span className="ot-colon">:&nbsp;</span><span className="ot-boolean">{String(d.visible)}</span></div>
                            <div className="ot-row"><span className="ot-key">enabled</span><span className="ot-colon">:&nbsp;</span><span className="ot-boolean">{String(d.enabled)}</span></div>
                            {d.count > 1 && <div className="ot-row"><span className="ot-key">matches</span><span className="ot-colon">:&nbsp;</span><span className="ot-number">{d.count}</span></div>}
                            {d.box && <div className="ot-row"><span className="ot-key">size</span><span className="ot-colon">:&nbsp;</span><span className="ot-number">{Math.round(d.box.width)} × {Math.round(d.box.height)}</span></div>}
                            {d.box && <div className="ot-row"><span className="ot-key">position</span><span className="ot-colon">:&nbsp;</span><span className="ot-number">({Math.round(d.box.x)}, {Math.round(d.box.y)})</span></div>}
                            {Object.keys(d.attributes).length > 0 && Object.entries(d.attributes).map(([k, v]) => (
                                <div key={k} className="ot-row"><span className="ot-key">{k}</span><span className="ot-colon">:&nbsp;</span><span className="ot-string">"{v}"</span></div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
