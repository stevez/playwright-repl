

import { useState, useEffect, useRef } from 'react';
import { ScopeInfo } from '@/lib/sw-debugger';
import { swGetProperties } from '@/lib/sw-debugger';
import { fromCdpGetProperties } from '@/components/Console/cdpToSerialized';
import { ObjectTree } from '@/components/Console/ObjectTree';
import type { SerializedValue } from '@/components/Console/types';



interface VariablePaneProps {
    scopeData: ScopeInfo[];
}

interface ScopeSectionProps {
    scope: ScopeInfo;
    defaultOpen: boolean
}
function ScopeSection({ scope, defaultOpen }: ScopeSectionProps) {
    const [open, setOpen] = useState(defaultOpen);
    const [props, setProps] = useState<Record<string, SerializedValue> | null>(null);
    const [loading, setLoading] = useState(false);
    const prevObjectId = useRef(scope.objectId);

    useEffect(() => {
        if (open && !props) fetchProps();
    }, [open]);

    useEffect(() => {
        if (scope.objectId != prevObjectId.current) {
            prevObjectId.current = scope.objectId;
            setProps(null);
            if (open) fetchProps();
        }
    }, [scope.objectId]);

    function fetchProps() {
        setLoading(true);
        swGetProperties(scope.objectId).then(raw => {
            setProps(fromCdpGetProperties(raw));
            setLoading(false);
        });
    }

    const title = scope.type === 'local' ? 'Local'
        : scope.type === 'closure' ? (scope.name ? `Closure (${scope.name})` : 'Closure')
        : scope.type === 'script' ? 'Script'
        : scope.type === 'block' ? 'Block'
        : scope.type;

    return (
        <div>
            <div className="ot-toggle" onClick={()=> setOpen( o => !o)}>
               {open ? '▼' : '▶'} {title}
            </div> 
            {open && (
                <div className='ot-children'>
                    {loading ? <span className='ot-empty'>Loading ...</span>
                    : props && Object.entries(props).map(([k, v]) => (
                        <div key={k} className='ot-row'>
                            <ObjectTree data={v} label={k} getProperties={swGetProperties} />
                        </div>
                    ))}
                </div>
            )}
        </div>
    )

}


export function VariablePane({ scopeData }: VariablePaneProps) {
    return (
        <div className="overflow-auto flex-1 p-2">
            { scopeData.length === 0 
              ? <div className='ot-empty'>No local variables</div>
              : scopeData.map((scope) => (
                <ScopeSection key={scope.objectId} scope={scope} defaultOpen={scope.type === 'local'} />
              ))
            }
        </div>
    );
}