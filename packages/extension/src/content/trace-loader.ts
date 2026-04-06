// Content script injected into trace.playwright.dev
// Receives trace data from the background SW and loads it via postMessage.

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== 'load-trace' || !msg.data) return;
  const bytes = new Uint8Array(msg.data);
  const blob = new Blob([bytes], { type: 'application/zip' });
  window.postMessage({ method: 'load', params: { trace: blob } }, '*');
});

// Signal ready
chrome.runtime.sendMessage({ type: 'trace-loader-ready' });
