import type { OutputLine } from "@/types"

export type PanelState = {
  outputLines: OutputLine[]
  editorContent: string
  editorMode: 'pw' | 'js'
  isRunning: boolean
  isStepDebugging: boolean
  currentRunLine: number      // -1 = none
  stepLine: number            // -1 = not stepping
  passCount: number
  failCount: number
  lineResults: ('pass' | 'fail' | null)[]
  attachedUrl: string | null
  attachedTabId: number | null
  isAttaching: boolean
}

export type Action =
     { type: 'ADD_LINE', line: OutputLine}
   | { type: 'REPLACE_LAST_LINE', line: OutputLine }
   | { type: 'CLEAR_CONSOLE'}
   | { type: 'COMMAND_SUBMITTED', line: OutputLine}
   | { type: 'COMMAND_SUCCESS', line: OutputLine }
   | { type: 'COMMAND_ERROR', line: OutputLine }
   | { type: 'EDIT_EDITOR_CONTENT', content: string }
   | { type: 'RUN_START', stepDebug?: boolean }
   | { type: 'RUN_STOP' }
   | { type: 'SET_RUN_LINE', currentRunLine: number }
   | { type: 'STEP_INIT', stepLine: number }
   | { type: 'STEP_ADVANCE', stepLine: number }
   | { type: 'SET_LINE_RESULT', index: number, result: 'pass' | 'fail'}
   | { type: 'ATTACH_START' }
   | { type: 'ATTACH_SUCCESS', url: string, tabId: number }
   | { type: 'ATTACH_FAIL' }
   | { type: 'DETACH' }
   | { type: 'UPDATE_URL', url: string }
   | { type: 'SET_EDITOR_MODE', mode: 'pw' | 'js' }

export const initialState : PanelState = {
    outputLines: [],
    editorContent: '',
    editorMode: 'pw',
    isRunning: false,
    isStepDebugging: false,
    currentRunLine: -1,
    stepLine: -1,
    passCount: 0,
    failCount: 0,
    lineResults: [],
    attachedUrl: null,
    attachedTabId: null,
    isAttaching: false,
}

export function panelReducer(state: PanelState, action: Action): PanelState {
    switch(action.type) {
        case 'ADD_LINE':
            return { ...state, outputLines: [...state.outputLines, action.line]}
        case 'REPLACE_LAST_LINE':
            return { ...state, outputLines: [...state.outputLines.slice(0, -1), action.line]}
        case 'CLEAR_CONSOLE':
            return { ...state, outputLines: [], passCount: 0, failCount: 0}
        case 'COMMAND_SUBMITTED':
            return { ...state, outputLines: [ ...state.outputLines, action.line]}
        case 'COMMAND_SUCCESS':
            return { ...state, outputLines: [ ...state.outputLines, action.line]}
        case 'COMMAND_ERROR':
            return { ...state, outputLines: [ ...state.outputLines, action.line]}
        case 'EDIT_EDITOR_CONTENT':
            return {
                ...state,
                editorContent: action.content,
                lineResults: [],
                currentRunLine: -1,
                stepLine: -1,
                passCount: 0,
                failCount: 0
            }
        case 'RUN_START': {
            const lineCount = state.editorContent.split('\n').length;
            return {
                ...state,
                isRunning: true,
                isStepDebugging: action.stepDebug ?? false,
                currentRunLine: -1,
                passCount: 0,
                failCount: 0,
                lineResults: new Array(lineCount).fill(null)
            }
        }
        case 'RUN_STOP':
            return { ...state, isRunning: false, isStepDebugging: false, currentRunLine: -1, stepLine: -1 }
        case 'SET_RUN_LINE':
            return { ...state, currentRunLine: action.currentRunLine}
        case 'STEP_INIT': {
            const lineCount = state.editorContent.split('\n').length;
            return {
                ...state,
                stepLine: action.stepLine,
                currentRunLine: action.stepLine,
                passCount: 0,
                failCount: 0,
                lineResults: new Array(lineCount).fill(null)
            }
        }
        case 'STEP_ADVANCE':
            return { ...state, stepLine: action.stepLine, currentRunLine: action.stepLine }
        case 'SET_LINE_RESULT': {
            const newLineResults = state.lineResults.map((result, i) => i === action.index ? action.result : result);
            const newPassCount = action.result === 'pass' ? state.passCount + 1 : state.passCount;
            const newFailCount = action.result === 'fail' ? state.failCount + 1 : state.failCount;
            return { ...state, lineResults: newLineResults, passCount: newPassCount, failCount: newFailCount}
        }
        case 'ATTACH_START':
            return { ...state, isAttaching: true }
        case 'ATTACH_SUCCESS':
            return { ...state, isAttaching: false, attachedUrl: action.url, attachedTabId: action.tabId }
        case 'ATTACH_FAIL':
            return { ...state, isAttaching: false, attachedUrl: null, attachedTabId: null }
        case 'DETACH':
            return { ...state, attachedUrl: null, attachedTabId: null }
        case 'UPDATE_URL':
            return { ...state, attachedUrl: action.url }
        case 'SET_EDITOR_MODE':
            return { ...state, editorMode: action.mode }
        default:
            return state
    }
}
