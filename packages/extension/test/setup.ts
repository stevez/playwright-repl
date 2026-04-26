import { vi } from "vitest";
import * as chrome from "vitest-chrome/lib/index.esm.js";

// Add chrome object to global scope so imported modules can use it
Object.assign(global, chrome);

// vitest-chrome doesn't include chrome.tabs.update — add it manually
if (!globalThis.chrome.tabs?.update) {
  (globalThis.chrome.tabs as unknown as Record<string, unknown>).update = vi.fn().mockResolvedValue({});
}

// vitest-chrome doesn't include chrome.scripting — add it manually
if (!globalThis.chrome.scripting) {
  (globalThis.chrome as Record<string, unknown>).scripting = {
    executeScript: async () => [],
  };
}

// vitest-chrome doesn't include chrome.sidePanel — add it manually
if (!globalThis.chrome.sidePanel) {
  (globalThis.chrome as Record<string, unknown>).sidePanel = {
    setPanelBehavior: () => Promise.resolve(),
    open: () => Promise.resolve(),
  };
}

// vitest-chrome doesn't include chrome.action — add it manually
if (!globalThis.chrome.action) {
  (globalThis.chrome as Record<string, unknown>).action = {
    onClicked: { addListener: () => {} },
  };
}

// vitest-chrome doesn't include chrome.offscreen — add it manually
if (!globalThis.chrome.offscreen) {
  (globalThis.chrome as Record<string, unknown>).offscreen = {
    hasDocument: async () => false,
    createDocument: async () => {},
    Reason: { BLOBS: 'BLOBS' },
  };
}

// vitest-chrome doesn't include chrome.management — add it manually
if (!globalThis.chrome.management) {
  (globalThis.chrome as Record<string, unknown>).management = {
    getSelf: async () => ({ installType: 'development' }),
  };
}

// vitest-chrome doesn't include chrome.webNavigation — add it manually
if (!globalThis.chrome.webNavigation) {
  (globalThis.chrome as Record<string, unknown>).webNavigation = {
    onCommitted: {
      addListener: () => {},
      removeListener: () => {},
    },
  };
}
