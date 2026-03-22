import { useState, useEffect } from "react";
import { SnapshotNode } from "@/lib/snapshot-parser";
import { useTreeExpand } from "./TreeExpandContext";

export function SnapshotTree({node, depth}: { node: SnapshotNode, depth: number}) {
    const [open, setOpen] = useState(depth < 2);
    const hasChildren = node.children.length > 0;
    const { generation, expanded } = useTreeExpand();

    useEffect(() => {
        if (generation > 0) setOpen(expanded);
    }, [generation]);

    return (
        <div>
            <div className="ot-row">
                {hasChildren ? (
                    <span className="ot-toggle" onClick={() => setOpen(o => !o)}>
                        {open ? '▼' : '▶'}
                    </span>
                ) : <span style={{ width: 12, display: 'inline-block' }} />}
                <span>{node.text}</span>
            </div>
            {open && hasChildren && (
                <div className="ot-children">
                    {node.children.map((child, i) => (
                        <SnapshotTree key={i} node={child} depth={depth + 1} />
                    ))}
                </div>
            )}
        </div>
    )
}