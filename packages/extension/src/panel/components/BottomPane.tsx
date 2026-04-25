import { Console } from './Console';
import { VariablePane } from './VariablePane';
import { AIChatPane } from './AIChat/AIChatPane';
import type { PanelState, Action } from "@/reducer";
import type { SerializedValue } from '@/components/Console/types';

interface BottomPaneProps extends Pick<PanelState, 'isStepDebugging' | 'bottomTab' | 'outputLines'| 'scopeData' | 'aiChatMessages'> {
    dispatch: React.Dispatch<Action>,
    onLocalProps?: (props: Record<string, SerializedValue> | null) => void;
};

export function BottomPane({isStepDebugging, bottomTab, outputLines, dispatch, scopeData, onLocalProps, aiChatMessages }: BottomPaneProps) {
    return (
        <div className="flex flex-col flex-1 min-h-20 overflow-hidden" data-testid="bottom-pane">
        {/* Tab bar */}
        <div  className="flex items-center gap-3 px-2 py-0.5 border-b border-(--border-primary) bg-(--bg-toolbar) shrink-0">
           <button
                data-active={bottomTab === 'console' ? '' : undefined}
                onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: 'console'})}
                data-testid="tab-console"
           >Console</button>
           <button
                data-active={bottomTab === 'ai-chat' ? '' : undefined}
                onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: 'ai-chat'})}
                data-testid="tab-ai-chat"
           ><svg width="12" height="12" viewBox="0 0 16 16" fill="#e67e22" style={{display:'inline',verticalAlign:'-1px',marginRight:'3px'}}><path d="M8 1l1.5 4L14 6.5 9.5 8 8 12 6.5 8 2 6.5 6.5 5zm5 9l.75 2L15.5 12.75 13.75 13.5 13 15.5 12.25 13.5 10.5 12.75 12.25 12z"/></svg>AI</button>
           {isStepDebugging && (
            <button
                data-active={bottomTab === 'variables' ? '' : undefined}
                onClick={() => dispatch({ type: 'SET_BOTTOM_TAB', tab: 'variables'})}
                data-testid="tab-variables"
           >Variables</button>
           )}
        </div>
        {/* Tab content — AI Chat stays mounted to preserve state */}
        <div style={{ display: bottomTab === 'console' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <Console outputLines={outputLines} dispatch={dispatch} />
        </div>
        <div style={{ display: bottomTab === 'ai-chat' ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
            <AIChatPane messages={aiChatMessages} dispatch={dispatch} />
        </div>
        { bottomTab === 'variables' && isStepDebugging && <VariablePane scopeData={scopeData} onLocalProps={onLocalProps} />}
        </div>

    )
}