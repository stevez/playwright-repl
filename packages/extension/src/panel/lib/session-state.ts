/**
 * Persist and restore panel state across side-panel close/reopen.
 * Uses chrome.storage.session (cleared when browser closes).
 */

const KEY = 'panelSessionState';

export interface SessionState {
  editorContent: string;
  editorMode: 'pw' | 'js';
  breakPoints: number[];
  bottomTab: 'console' | 'variables';
  cursorPos: number;
  editorPaneHeight: number | null;
  commandHistory: string[];
}

export async function saveSessionState(state: SessionState): Promise<void> {
  await chrome.storage.session.set({ [KEY]: state });
}

export async function loadSessionState(): Promise<SessionState | null> {
  const result = await chrome.storage.session.get(KEY);
  return result[KEY] ?? null;
}
