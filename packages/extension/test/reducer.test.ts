import { describe, it, expect } from "vitest";
import { panelReducer, initialState, type PanelState } from "@/reducer";
import { OutputLine } from "@/types";

describe('Reducer tests', () => {
   it('should process event ADD_LINE', () => {
      const line: OutputLine = {text: 'click e5', type: 'command'};
      const newState = panelReducer(initialState, {type: 'ADD_LINE', line});

      expect(newState.outputLines.length).toEqual(1);
      expect(newState.outputLines[0]).toEqual(line);
   })

   it('should process event CLEAR_CONSOLE', () => {
       const line: OutputLine = {text: 'click e5', type: 'command'};
       const state: PanelState = {
         ...initialState,
         outputLines: new Array(10).fill(line)
       }

       const newState = panelReducer(state, {type: 'CLEAR_CONSOLE'});
       expect(newState.outputLines.length).toEqual(0);
       expect(newState.passCount).toEqual(0);
       expect(newState.failCount).toEqual(0);
   })
   it('should process event COMMAND_SUBMITTED', () => {
      const line: OutputLine = {text: 'click e5', type: 'command'};
      const newState = panelReducer(initialState, {type: 'COMMAND_SUBMITTED', line});

      expect(newState.outputLines.length).toEqual(1);
      expect(newState.outputLines[0]).toEqual(line);
   })
   it('should process event COMMAND_SUCCESS', () => {
      const line: OutputLine = {text: 'click e5', type: 'command'};
      const newState = panelReducer(initialState, {type: 'COMMAND_SUCCESS', line});

      expect(newState.outputLines.length).toEqual(1);
      expect(newState.outputLines[0]).toEqual(line);
   })
   it('should process event COMMAND_ERROR', () => {
      const line: OutputLine = {text: 'click e5', type: 'command'};
      const newState = panelReducer(initialState, {type: 'COMMAND_ERROR', line});

      expect(newState.outputLines.length).toEqual(1);
      expect(newState.outputLines[0]).toEqual(line);
   })

   it('should process event EDIT_EDITOR_CONTENT', () => {
      const newState = panelReducer(initialState, {type: 'EDIT_EDITOR_CONTENT', content: 'click e5'});

      expect(newState.editorContent).toEqual('click e5');
   })

   it('should process event RUN_START', () => {
     const newState = panelReducer(initialState, { type: 'RUN_START'})
     expect(newState.isRunning).toBe(true);
   })

   it('should process event RUN_STOP', () => {
     const newState = panelReducer(initialState, { type: 'RUN_STOP'})
     expect(newState.isRunning).toBe(false);
     expect(newState.currentRunLine).toEqual(-1);
   })

   it('should process event SET_RUN_LINE', () => {
     const newState = panelReducer(initialState, { type: 'SET_RUN_LINE', currentRunLine: 10})
     expect(newState.currentRunLine).toEqual(10);
   })

   it('should process event STEP_INIT', () => {
     const newState = panelReducer(initialState, { type: 'STEP_INIT', stepLine: 10})
     expect(newState.stepLine).toEqual(10);
   })

   it('should process event STEP_ADVANCE', () => {
     const newState = panelReducer({...initialState, stepLine: 10}, { type: 'STEP_ADVANCE', stepLine: 11})
     expect(newState.stepLine).toEqual(11);
   })

   it('should process event SET_LINE_RESULT with pass status', () => {
     const newState = panelReducer({...initialState, lineResults: [null]}, {type: 'SET_LINE_RESULT', index: 0, result: 'pass'});
     expect(newState.lineResults.length).toEqual(1);
     expect(newState.lineResults[0]).toEqual('pass');
   })

   it('should process event SET_LINE_RESULT with pass status for multiple line results', () => {
     const newState = panelReducer({...initialState, lineResults: ['fail', null]}, {type: 'SET_LINE_RESULT', index: 1, result: 'pass'});
     expect(newState.lineResults.length).toEqual(2);
     expect(newState.lineResults[1]).toEqual('pass');
   })

   it('should process event SET_LINE_RESULT with fail status', () => {
     const newState = panelReducer({...initialState, lineResults: [null]}, {type: 'SET_LINE_RESULT', index: 0, result: 'fail'});
     expect(newState.lineResults.length).toEqual(1);
     expect(newState.lineResults[0]).toEqual('fail');
   })

   it('should remain the same state for the invalid event', () => {
     const newState = panelReducer(initialState, {type: 'invalid_event'} as never);
     expect(newState).toEqual(initialState);
   })

   // ─── Attach lifecycle ────────────────────────────────────────────────────

   it('should process event ATTACH_START', () => {
     const newState = panelReducer(initialState, { type: 'ATTACH_START' });
     expect(newState.isAttaching).toBe(true);
   });

   it('should process event ATTACH_SUCCESS', () => {
     const newState = panelReducer(
       { ...initialState, isAttaching: true },
       { type: 'ATTACH_SUCCESS', url: 'https://example.com', tabId: 1 }
     );
     expect(newState.isAttaching).toBe(false);
     expect(newState.attachedUrl).toBe('https://example.com');
   });

   it('should process event ATTACH_FAIL', () => {
     const newState = panelReducer(
       { ...initialState, isAttaching: true, attachedUrl: 'https://old.com' },
       { type: 'ATTACH_FAIL' }
     );
     expect(newState.isAttaching).toBe(false);
     expect(newState.attachedUrl).toBeNull();
   });

   it('should process event DETACH', () => {
     const newState = panelReducer(
       { ...initialState, attachedUrl: 'https://example.com' },
       { type: 'DETACH' }
     );
     expect(newState.attachedUrl).toBeNull();
   });

   // ─── Editor mode ─────────────────────────────────────────────────────────

   it('initialState should have editorMode pw', () => {
     expect(initialState.editorMode).toBe('pw');
   });

   it('should process event SET_EDITOR_MODE to js', () => {
     const newState = panelReducer(initialState, { type: 'SET_EDITOR_MODE', mode: 'js' });
     expect(newState.editorMode).toBe('js');
   });

   it('should process event SET_EDITOR_MODE back to pw', () => {
     const state = { ...initialState, editorMode: 'js' as const };
     const newState = panelReducer(state, { type: 'SET_EDITOR_MODE', mode: 'pw' });
     expect(newState.editorMode).toBe('pw');
   });
})