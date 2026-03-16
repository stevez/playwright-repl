import { Console } from './Console';
import { VariablePane } from './VariablePane';
import type { PanelState, Action } from "@/reducer";

interface BottomPaneProps extends Pick<PanelState, 'isStepDebugging' | 'bottomTab' | 'outputLines'| 'scopeData'> {
    dispatch: React.Dispatch<Action>,
};

export function BottomPane({isStepDebugging, bottomTab, outputLines, dispatch, scopeData }: BottomPaneProps) {
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
        { bottomTab === 'console' &&  <Console outputLines={outputLines} dispatch={dispatch} />}
        { bottomTab === 'variables' && isStepDebugging && <VariablePane scopeData={scopeData} />}
        </div>
        
    )
}