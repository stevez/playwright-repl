import * as chrome from "vitest-chrome/lib/index.esm.js";

// Add chrome object to global scope so imported modules can use it
Object.assign(global, chrome);

// vitest-chrome doesn't include chrome.scripting — add it manually
if (!globalThis.chrome.scripting) {
  (globalThis.chrome as any).scripting = {
    executeScript: async () => [],
  };
}

// vitest-chrome doesn't include chrome.sidePanel — add it manually
if (!globalThis.chrome.sidePanel) {
  (globalThis.chrome as any).sidePanel = {
    setPanelBehavior: () => {},
  };
}

// vitest-chrome doesn't include chrome.webNavigation — add it manually
if (!globalThis.chrome.webNavigation) {
  (globalThis.chrome as any).webNavigation = {
    onCommitted: {
      addListener: () => {},
      removeListener: () => {},
    },
  };
}
