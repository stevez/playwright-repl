import { Console } from './Console';
import { VariablePane } from './VariablePane';
import type { PanelState, Action } from "@/reducer";
import type { SerializedValue } from '@/components/Console/types';

interface BottomPaneProps extends Pick<PanelState, 'isStepDebugging' | 'bottomTab' | 'outputLines'| 'scopeData'> {
    dispatch: React.Dispatch<Action>,
    onLocalProps?: (props: Record<string, SerializedValue> | null) => void;
};

export function BottomPane({isStepDebugging, bottomTab, outputLines, dispatch, scopeData, onLocalProps }: BottomPaneProps) {
    return (
        <div className="flex flex-col flex-1 min-h-20 overflow-hidden" data-testid="bottom-pane">
        {/* Tab bar */}
        <div  className="flex items-center gap-3 px-2 py-0.5 border-b border-(--border-primary) bg-(--bg-toolbar) shrink-0">
           <button
                data-active={bottomTab === 'console' ? '' : undefined}
                onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: 'console'})}
                data-testid="tab-console"
           >Console</button>
           {isStepDebugging && (
            <button
                data-active={bottomTab === 'variables' ? '' : undefined}
                onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: 'variables'})}
                data-testid="tab-variables"
           >Variables</button>
           )}
        </div>
        {/* Tab content */}
        <div style={{ display: bottomTab === 'console' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <Console outputLines={outputLines} dispatch={dispatch} />
        </div>
        { bottomTab === 'variables' && isStepDebugging && <VariablePane scopeData={scopeData} onLocalProps={onLocalProps} />}
        </div>

    )
}