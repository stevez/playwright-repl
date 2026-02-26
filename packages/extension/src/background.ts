// background.js — Opens side panel when extension icon is clicked + recording handlers.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── Recording State ───────────────────────────────────────────────────────

let recordingTabId: number | null = null;
let tabUpdateListener: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void) | null = null;
let navCommittedListener: ((details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => void) | null = null;
let lastRecordedUrl: string | null = null;
let urlStack: string[] = [];
let stackIndex: number = -1;
let pendingUrlChange: string | null = null;
let pendingUrlTimer: ReturnType<typeof setTimeout> | null = null;

// ─── Centralized URL Change Handler ──────────────────────────────────────────

function handleUrlChange(url: string, isTyped: boolean) {
  if (url === lastRecordedUrl) return;

  // Back/forward detection (checked before isTyped — Chrome can misreport SPA back as "typed")
  if (stackIndex > 0 && url === urlStack[stackIndex - 1]) {
    stackIndex--;
    chrome.runtime.sendMessage({ type: "pw-recorded-command", command: "go-back" }).catch(() => {});
  } else if (stackIndex < urlStack.length - 1 && url === urlStack[stackIndex + 1]) {
    stackIndex++;
    chrome.runtime.sendMessage({ type: "pw-recorded-command", command: "go-forward" }).catch(() => {});
  } else if (isTyped) {
    // User typed URL in address bar
    chrome.runtime.sendMessage({ type: "pw-recorded-command", command: "goto " + url }).catch(() => {});
    urlStack = urlStack.slice(0, stackIndex + 1);
    urlStack.push(url);
    stackIndex = urlStack.length - 1;
  } else {
    // Link click, SPA navigation — update stack, no command (click already recorded)
    urlStack = urlStack.slice(0, stackIndex + 1);
    urlStack.push(url);
    stackIndex = urlStack.length - 1;
  }

  lastRecordedUrl = url;
}

// ─── Message Handler ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg: { type: string; tabId?: number }, sender: chrome.runtime.MessageSender, sendResponse: (response?: unknown) => void) => {
  if (msg.type === "pw-record-start") {
    startRecording(msg.tabId!).then(sendResponse);
    return true;
  }
  if (msg.type === "pw-record-stop") {
    stopRecording(msg.tabId!).then(sendResponse);
    return true;
  }
});

// ─── Tab Activation (follow active tab) ─────────────────────────────────────

chrome.tabs.onActivated.addListener((activeInfo: chrome.tabs.TabActiveInfo) => {
  if (recordingTabId === null) return;
  recordingTabId = activeInfo.tabId;
  injectRecorder(activeInfo.tabId).catch(() => {});
  // Notify panel about tab switch
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    chrome.runtime.sendMessage({
      type: "pw-recorded-command",
      command: "# tab: " + (tab.title || tab.url || "unknown"),
    }).catch(() => {});
  });
});

// ─── Recording Functions ────────────────────────────────────────────────────

async function startRecording(tabId: number): Promise<{ ok: boolean; error?: string }> {
  try {
    await injectRecorder(tabId);
    recordingTabId = tabId;

    // Store the initial URL and initialize history stack
    const tab = await chrome.tabs.get(tabId);
    lastRecordedUrl = tab.url ?? null;
    urlStack = [tab.url ?? ""];
    stackIndex = 0;

    // Listen for navigation commits — only used to detect typed URLs (for goto)
    navCommittedListener = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
      if (details.tabId !== recordingTabId) return;
      if (details.frameId !== 0) return; // main frame only

      // Cancel pending tabUpdate handler — onCommitted has transition info, so it takes priority
      if (pendingUrlTimer) {
        clearTimeout(pendingUrlTimer);
        pendingUrlTimer = null;
        pendingUrlChange = null;
      }

      const qualifiers = details.transitionQualifiers || [];
      const isTyped = (details.transitionType === "typed" || qualifiers.includes("from_address_bar"))
        && !qualifiers.includes("forward_back");
      handleUrlChange(details.url, isTyped);
    };
    chrome.webNavigation.onCommitted.addListener(navCommittedListener);

    // Listen for tab URL changes — catches SPA (pushState) and BFCache navigations
    // that onCommitted misses. Uses a short timer so onCommitted can take priority.
    tabUpdateListener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== recordingTabId) return;
      if (changeInfo.status === "complete") {
        injectRecorder(updatedTabId).catch((err: unknown) => {
          console.warn("[recorder] re-injection failed:", (err as Error).message);
        });
      }
      if (changeInfo.url && changeInfo.url !== lastRecordedUrl) {
        pendingUrlChange = changeInfo.url;
        if (pendingUrlTimer) clearTimeout(pendingUrlTimer);
        pendingUrlTimer = setTimeout(() => {
          if (pendingUrlChange && pendingUrlChange !== lastRecordedUrl) {
            handleUrlChange(pendingUrlChange, false);
          }
          pendingUrlChange = null;
          pendingUrlTimer = null;
        }, 100);
      }
    };
    chrome.tabs.onUpdated.addListener(tabUpdateListener);

    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message };
  }
}

async function stopRecording(tabId: number): Promise<{ ok: boolean }> {
  try {
    // Remove navigation listeners
    if (navCommittedListener) {
      chrome.webNavigation.onCommitted.removeListener(navCommittedListener);
      navCommittedListener = null;
    }
    if (tabUpdateListener) {
      chrome.tabs.onUpdated.removeListener(tabUpdateListener);
      tabUpdateListener = null;
    }
    recordingTabId = null;
    urlStack = [];
    stackIndex = -1;
    if (pendingUrlTimer) {
      clearTimeout(pendingUrlTimer);
      pendingUrlTimer = null;
      pendingUrlChange = null;
    }

    // Run cleanup on the tab
    await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        if (typeof window.__pwRecorderCleanup === "function") {
          window.__pwRecorderCleanup();
        }
      },
    });

    return { ok: true };
  } catch (_err) {
    // Cleanup failure is non-fatal (tab may have closed)
    return { ok: true };
  }
}

async function injectRecorder(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({
    target: { tabId },
    files: ["content/recorder.js"],
  });
}

export { startRecording, stopRecording, injectRecorder };

