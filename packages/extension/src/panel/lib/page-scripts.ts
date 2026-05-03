// @ts-nocheck — This file is intentionally untyped JavaScript.
// Functions here are called directly with the Playwright page object.
// Type annotations are omitted so this file can also be used in
// plain-JS contexts without a TypeScript build step.

/**
 * Page-context functions for direct execution.
 *
 * Shared functions are imported from @playwright-repl/core.
 * Chrome-specific functions (globalThis, chrome.tabs) are defined locally.
 */

// ─── Re-exports from core ──────────────────────────────────────────────────

// Import from specific files to avoid pulling Node.js modules into the browser bundle
export {
  // Verify
  verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  verifyVisible, verifyCssVisible, verifyCssElement, verifyCssNoElement, verifyCssValue,
  verifyInputValue, waitForText,
  // Text locator actions
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  // Role-based actions
  actionByRole, fillByRole, selectByRole, pressKeyByRole,
} from '@playwright-repl/core/dist/page-scripts.js';

export {
  // Highlight
  highlightByText, highlightByRole, highlightBySelector, highlightByRef, clearHighlight,
  // Chaining
  chainAction,
  // Navigation
  goBack, goForward, gotoUrl, reloadPage,
  // Timing
  waitMs,
  // Page info
  getTitle, getUrl,
  // Eval / Run
  evalCode, runCode,
  // Screenshot / Snapshot / PDF
  takeScreenshot, takeSnapshot, takePdf,
  // Ref-based actions
  refAction,
  // Press / Type
  pressKey, typeText,
  // Storage
  localStorageGet, localStorageSet, localStorageDelete, localStorageClear, localStorageList,
  sessionStorageGet, sessionStorageSet, sessionStorageDelete, sessionStorageClear, sessionStorageList,
  // Cookies
  cookieList, cookieGet, cookieSet, cookieDelete, cookieClear,
  // Drag / Resize
  dragDrop, resizeViewport,
} from '@playwright-repl/core/dist/command-scripts.js';

// ─── Chrome-specific: Console / Network / Dialog / Route ───────────────────
// These use globalThis state from the Chrome extension service worker.

export async function getConsoleMessages(_page, clear) {
  if (clear) { globalThis.__consoleMessages = []; return 'Console cleared'; }
  const msgs = globalThis.__consoleMessages || [];
  return msgs.length === 0 ? 'No console messages (listening...)' : msgs.join('\n');
}

export async function getNetworkRequests(_page, clear, includeStatic) {
  if (clear) { globalThis.__networkRequests = []; return 'Network log cleared'; }
  let reqs = globalThis.__networkRequests || [];
  if (!includeStatic) {
    const skip = new Set(['stylesheet', 'image', 'font', 'media', 'other']);
    reqs = reqs.filter(r => !skip.has(r.type));
  }
  return reqs.length === 0
    ? 'No network requests (listening...)'
    : reqs.map(r => r.status + ' ' + r.method + ' ' + r.url).join('\n');
}

export async function setDialogAccept(_page) {
  globalThis.__dialogMode = 'accept';
  return 'Dialogs will be auto-accepted';
}

export async function setDialogDismiss(_page) {
  globalThis.__dialogMode = 'dismiss';
  return 'Dialogs will be auto-dismissed';
}

export async function addRoute(page, pattern) {
  if (!globalThis.__activeRoutes) globalThis.__activeRoutes = [];
  const handler = route => route.abort();
  await page.route(pattern, handler);
  globalThis.__activeRoutes.push({ pattern, handler });
  return 'Route added (blocked): ' + pattern;
}

export async function listRoutes(_page) {
  const routes = globalThis.__activeRoutes || [];
  return routes.length === 0 ? 'No active routes' : routes.map(r => r.pattern).join('\n');
}

export async function removeRoute(page, pattern) {
  if (!globalThis.__activeRoutes || globalThis.__activeRoutes.length === 0)
    return 'No routes to remove';
  const idx = globalThis.__activeRoutes.findIndex(r => r.pattern === pattern);
  if (idx === -1) return 'Route not found: ' + pattern;
  await page.unroute(pattern, globalThis.__activeRoutes[idx].handler);
  globalThis.__activeRoutes.splice(idx, 1);
  return 'Route removed: ' + pattern;
}

// ─── Chrome-specific: Tab operations ───────────────────────────────────────
// Use chrome.tabs API (available in SW) so ALL Chrome tabs are visible,
// not just pages tracked by playwright-crx. Scoped to the attached tab's window.

export async function tabList(_page) {
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  const tabs = await chrome.tabs.query(windowId !== undefined ? { windowId } : {});
  return JSON.stringify(tabs.map((tab, i) => ({
    index: i,
    title: tab.title || '',
    url: tab.url || '',
    current: tab.id === activeTabId,
  })), null, 2);
}

export async function tabNew(_page, url) {
  const tabUrl = url || 'about:blank';
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  await chrome.tabs.create(windowId !== undefined ? { url: tabUrl, windowId } : { url: tabUrl });
  return 'Opened new tab' + (url ? ': ' + url : '');
}

export async function tabClose(_page, index) {
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  const tabs = await chrome.tabs.query(windowId !== undefined ? { windowId } : {});
  const tab = index !== undefined ? tabs[index] : tabs.find(t => t.id === activeTabId);
  if (!tab?.id) throw new Error('Tab ' + (index !== undefined ? index : 'current') + ' not found');
  const url = tab.url || '';
  await chrome.tabs.remove(tab.id);
  return 'Closed: ' + url;
}

export async function tabSelect(_page, index) {
  const activeTabId = globalThis.activeTabId;
  const windowId = activeTabId ? (await chrome.tabs.get(activeTabId)).windowId : undefined;
  const tabs = await chrome.tabs.query(windowId !== undefined ? { windowId } : {});
  const tab = tabs[index];
  if (!tab?.id) throw new Error('Tab ' + index + ' not found');
  const res = await globalThis.attachToTab(tab.id);
  if (!res.ok) throw new Error(res.error || 'Attach failed');
  return 'Selected tab ' + index + ': ' + (res.url || '');
}
