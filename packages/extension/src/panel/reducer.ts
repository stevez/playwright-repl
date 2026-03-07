import type { OutputLine } from "@/types"

export type PanelState = {
  outputLines: OutputLine[]
  editorContent: string
  fileName: string
  editorMode: 'pw' | 'js'
  isRunning: boolean
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
   | { type: 'CLEAR_CONSOLE'}
   | { type: 'COMMAND_SUBMITTED', line: OutputLine}
   | { type: 'COMMAND_SUCCESS', line: OutputLine }
   | { type: 'COMMAND_ERROR', line: OutputLine }
   | { type: 'EDIT_EDITOR_CONTENT', content: string }
   | { type: 'APPEND_EDITOR_CONTENT', command: string}
   | { type: 'SET_FILENAME', fileName: string }
   | { type: 'RUN_START'}
   | { type: 'RUN_STOP' }
   | { type: 'SET_RUN_LINE', currentRunLine: number }
   | { type: 'STEP_INIT', stepLine: number }
   | { type: 'STEP_ADVANCE', stepLine: number }
   | { type: 'SET_LINE_RESULT', index: number, result: 'pass' | 'fail'}
   | { type: 'ATTACH_START' }
   | { type: 'ATTACH_SUCCESS', url: string, tabId: number }
   | { type: 'ATTACH_FAIL' }
   | { type: 'DETACH' }
   | { type: 'SET_EDITOR_MODE', mode: 'pw' | 'js' }

export const initialState : PanelState = {
    outputLines: [],
    editorContent: '',
    fileName: '',
    editorMode: 'pw',
    isRunning: false,
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
        case 'APPEND_EDITOR_CONTENT': {
            const separator = state.editorContent && !state.editorContent.endsWith('\n') ? '\n' : '';
            return { ...state, editorContent: state.editorContent + separator + action.command };
        }
        case 'SET_FILENAME':
            return { ...state, fileName: action.fileName }
        case 'RUN_START': {
            const lineCount = state.editorContent.split('\n').length;
            return {
                ...state,
                isRunning: true,
                currentRunLine: 0,
                passCount: 0,
                failCount: 0,
                lineResults: new Array(lineCount).fill(null)
            }
        }
        case 'RUN_STOP':
            return { ...state, isRunning: false, currentRunLine: -1}
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
        case 'SET_EDITOR_MODE':
            return { ...state, editorMode: action.mode }
        default:
            return state
    }
}
