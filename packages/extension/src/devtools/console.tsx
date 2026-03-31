/**
 * DevTools REPL Console — mounts the Console component in a DevTools panel.
 */
import '../panel/panel.css';
import { createRoot } from 'react-dom/client';
import { useReducer, useEffect } from 'react';
import { panelReducer, initialState } from '../panel/reducer';
import { attachToTab } from '../panel/lib/bridge';
import { Console } from '../panel/components/Console';
import { onConsoleEvent } from '../panel/lib/sw-debugger';

function DevToolsConsole() {
  const [state, dispatch] = useReducer(panelReducer, initialState);
  // Auto-attach to the inspected tab, re-attach when user switches back
  useEffect(() => {
    const inspectedTabId = chrome.devtools?.inspectedWindow?.tabId;

    async function doAttach(tabId: number) {
      const [res, tab] = await Promise.all([
        attachToTab(tabId),
        chrome.tabs.get(tabId).catch(() => null),
      ]);
      if (res.ok && res.url) {
        const idx = (tab?.index ?? 0) + 1;
        dispatch({ type: 'ATTACH_SUCCESS', url: res.url, tabId });
        dispatch({ type: 'ADD_LINE', line: { text: `Attached to tab ${idx}: ${res.url}`, type: 'info' } });
      }
    }

    if (inspectedTabId) {
      doAttach(inspectedTabId).catch(e => console.warn('[pw-repl] auto-attach failed:', e));
    }

    const onActivated = (info: chrome.tabs.TabActiveInfo) => {
      if (!inspectedTabId || info.tabId !== inspectedTabId) return;
      doAttach(inspectedTabId).catch(e => console.warn('[pw-repl] re-attach failed:', e));
    };
    chrome.tabs.onActivated.addListener(onActivated);

    return () => {
      chrome.tabs.onActivated.removeListener(onActivated);
    };
  }, []);

  // Forward console.log/error from the page
  useEffect(() => {
    onConsoleEvent((level, args) => {
      for (const arg of args) {
        const type = level === 'error' ? 'error' : level === 'warn' ? 'info' : 'success';
        dispatch({ type: 'ADD_LINE', line: { text: '', type, value: arg } });
      }
    });
    return () => onConsoleEvent(null);
  }, [dispatch]);

  return <Console outputLines={state.outputLines} dispatch={dispatch} />;
}

createRoot(document.getElementById('root')!).render(<DevToolsConsole />);
