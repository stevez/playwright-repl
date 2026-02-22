// background.js — Opens side panel when extension icon is clicked + recording handlers.
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ─── Recording State ───────────────────────────────────────────────────────

let recordingTabId: number | null = null;
let tabUpdateListener: ((tabId: number, changeInfo: chrome.tabs.TabChangeInfo) => void) | null = null;
let navCommittedListener: ((details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => void) | null = null;
let lastRecordedUrl: string | null = null;
let urlStack: string[] = [];
let stackIndex: number = -1;

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

    // Listen for navigation commits to detect back/forward vs typed URLs
    navCommittedListener = (details: chrome.webNavigation.WebNavigationTransitionCallbackDetails) => {
      if (details.tabId !== recordingTabId) return;
      if (details.frameId !== 0) return; // main frame only
      if (details.url === lastRecordedUrl) return;

      const qualifiers = details.transitionQualifiers || [];

      if (qualifiers.includes("forward_back")) {
        // Back or forward — compare to history stack
        if (stackIndex > 0 && details.url === urlStack[stackIndex - 1]) {
          stackIndex--;
          chrome.runtime.sendMessage({
            type: "pw-recorded-command",
            command: "go-back",
          }).catch(() => {});
        } else if (stackIndex < urlStack.length - 1 && details.url === urlStack[stackIndex + 1]) {
          stackIndex++;
          chrome.runtime.sendMessage({
            type: "pw-recorded-command",
            command: "go-forward",
          }).catch(() => {});
        } else {
          // Can't determine direction — default to go-back
          chrome.runtime.sendMessage({
            type: "pw-recorded-command",
            command: "go-back",
          }).catch(() => {});
        }
      } else if (details.transitionType === "typed" || qualifiers.includes("from_address_bar")) {
        // User typed URL in address bar
        chrome.runtime.sendMessage({
          type: "pw-recorded-command",
          command: "goto " + details.url,
        }).catch(() => {});
        // Push to history stack (truncate any forward entries)
        urlStack = urlStack.slice(0, stackIndex + 1);
        urlStack.push(details.url);
        stackIndex = urlStack.length - 1;
      } else {
        // Link click, form submit, etc. — don't emit goto (click already recorded)
        // But do update the history stack
        urlStack = urlStack.slice(0, stackIndex + 1);
        urlStack.push(details.url);
        stackIndex = urlStack.length - 1;
      }

      lastRecordedUrl = details.url;
    };
    chrome.webNavigation.onCommitted.addListener(navCommittedListener);

    // Listen for page load completion to re-inject recorder
    tabUpdateListener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId !== recordingTabId) return;
      if (changeInfo.status === "complete") {
        injectRecorder(updatedTabId).catch((err: unknown) => {
          console.warn("[recorder] re-injection failed:", (err as Error).message);
        });
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

