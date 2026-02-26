import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

describe("background.js recording handlers", () => {
  let startRecording: (tabId: number) => Promise<{ ok: boolean; error?: string }>;
  let stopRecording: (tabId: number) => Promise<{ ok: boolean }>;
  let injectRecorder: (tabId: number) => Promise<void>;

  // Aliases for frequently-used mocks
  let executeScript: Mock;
  let onUpdatedAdd: Mock;
  let onCommittedAdd: Mock;
  let rtSendMessage: Mock;

  beforeEach(async () => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    executeScript = vi.fn().mockResolvedValue([]);
    (chrome as any).scripting = { executeScript };

    onUpdatedAdd = vi.fn();
    (chrome.tabs as any).onUpdated = {
      addListener: onUpdatedAdd,
      removeListener: vi.fn(),
    };

    (chrome.tabs as any).onActivated = { addListener: vi.fn() };
    (chrome.tabs as any).get = vi.fn().mockResolvedValue({ id: 42, url: "https://example.com", title: "Example" });

    onCommittedAdd = vi.fn();
    (chrome as any).webNavigation = {
      onCommitted: {
        addListener: onCommittedAdd,
        removeListener: vi.fn(),
      },
    };

    rtSendMessage = vi.fn().mockResolvedValue(undefined);
    (chrome.runtime as any).sendMessage = rtSendMessage;

    const bg: any = await import("../src/background.js");
    startRecording = bg.startRecording;
    stopRecording = bg.stopRecording;
    injectRecorder = bg.injectRecorder;
  });

  // ─── startRecording ─────────────────────────────────────────────────────

  it("injects recorder.js into the tab", async () => {
    const result = await startRecording(42);
    expect(result).toEqual({ ok: true });
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 42 },
      files: ["content/recorder.js"],
    });
  });

  it("adds tabs.onUpdated and webNavigation.onCommitted listeners", async () => {
    await startRecording(42);
    expect(onUpdatedAdd).toHaveBeenCalledWith(expect.any(Function));
    expect(onCommittedAdd).toHaveBeenCalledWith(expect.any(Function));
  });

  it("returns error on injection failure", async () => {
    executeScript.mockRejectedValue(new Error("Cannot access chrome:// URLs"));
    const result = await startRecording(42);
    expect(result).toEqual({ ok: false, error: "Cannot access chrome:// URLs" });
  });

  // ─── stopRecording ──────────────────────────────────────────────────────

  it("runs cleanup on the tab", async () => {
    await startRecording(42);
    const result = await stopRecording(42);
    expect(result).toEqual({ ok: true });
    expect(executeScript).toHaveBeenCalledTimes(2);
    const cleanupCall = executeScript.mock.calls[1][0];
    expect(cleanupCall.target).toEqual({ tabId: 42 });
    expect(typeof cleanupCall.func).toBe("function");
  });

  it("removes tabs.onUpdated and webNavigation.onCommitted listeners", async () => {
    await startRecording(42);
    await stopRecording(42);
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalledWith(expect.any(Function));
    expect(chrome.webNavigation.onCommitted.removeListener).toHaveBeenCalledWith(expect.any(Function));
  });

  it("handles cleanup failure gracefully", async () => {
    await startRecording(42);
    executeScript.mockRejectedValueOnce(new Error("Tab closed"));
    const result = await stopRecording(42);
    expect(result).toEqual({ ok: true });
  });

  // ─── onTabUpdated re-injection ──────────────────────────────────────────

  it("re-injects recorder on tab navigation (status complete)", async () => {
    await startRecording(42);
    const listener = onUpdatedAdd.mock.calls[0][0];
    executeScript.mockClear();
    listener(42, { status: "complete" });
    await vi.waitFor(() => {
      expect(executeScript).toHaveBeenCalledWith({
        target: { tabId: 42 },
        files: ["content/recorder.js"],
      });
    });
  });

  it("does not re-inject for non-complete status", async () => {
    await startRecording(42);
    const listener = onUpdatedAdd.mock.calls[0][0];
    executeScript.mockClear();
    listener(42, { status: "loading" });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it("does not re-inject for a different tab", async () => {
    await startRecording(42);
    const listener = onUpdatedAdd.mock.calls[0][0];
    executeScript.mockClear();
    listener(99, { status: "complete" });
    expect(executeScript).not.toHaveBeenCalled();
  });

  // ─── webNavigation.onCommitted — goto, go-back, go-forward ─────────

  it("emits goto when user types URL in address bar", async () => {
    await startRecording(42);
    const navListener = onCommittedAdd.mock.calls[0][0];

    navListener({
      tabId: 42, frameId: 0, url: "https://new-url.com",
      transitionType: "typed", transitionQualifiers: ["from_address_bar"],
    });

    expect(rtSendMessage).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "goto https://new-url.com",
    });
  });

  it("does not emit goto for link click navigations", async () => {
    await startRecording(42);
    const navListener = onCommittedAdd.mock.calls[0][0];

    navListener({
      tabId: 42, frameId: 0, url: "https://linked-page.com",
      transitionType: "link", transitionQualifiers: [],
    });

    expect(rtSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  it("does not emit for same URL", async () => {
    await startRecording(42);
    const navListener = onCommittedAdd.mock.calls[0][0];

    navListener({
      tabId: 42, frameId: 0, url: "https://example.com",
      transitionType: "typed", transitionQualifiers: [],
    });

    expect(rtSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  it("ignores navigations from a different tab", async () => {
    await startRecording(42);
    const navListener = onCommittedAdd.mock.calls[0][0];

    navListener({
      tabId: 99, frameId: 0, url: "https://other.com",
      transitionType: "typed", transitionQualifiers: [],
    });

    expect(rtSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  it("ignores subframe navigations", async () => {
    await startRecording(42);
    const navListener = onCommittedAdd.mock.calls[0][0];

    navListener({
      tabId: 42, frameId: 1, url: "https://iframe.com",
      transitionType: "typed", transitionQualifiers: [],
    });

    expect(rtSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  it("emits go-back on back button navigation", async () => {
    await startRecording(42);
    const navListener = onCommittedAdd.mock.calls[0][0];

    navListener({
      tabId: 42, frameId: 0, url: "https://page2.com",
      transitionType: "typed", transitionQualifiers: ["from_address_bar"],
    });
    rtSendMessage.mockClear();

    navListener({
      tabId: 42, frameId: 0, url: "https://example.com",
      transitionType: "link", transitionQualifiers: ["forward_back"],
    });

    expect(rtSendMessage).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "go-back",
    });
  });

  it("emits go-forward on forward button navigation", async () => {
    await startRecording(42);
    const navListener = onCommittedAdd.mock.calls[0][0];

    navListener({
      tabId: 42, frameId: 0, url: "https://page2.com",
      transitionType: "typed", transitionQualifiers: ["from_address_bar"],
    });
    navListener({
      tabId: 42, frameId: 0, url: "https://example.com",
      transitionType: "link", transitionQualifiers: ["forward_back"],
    });
    rtSendMessage.mockClear();

    navListener({
      tabId: 42, frameId: 0, url: "https://page2.com",
      transitionType: "link", transitionQualifiers: ["forward_back"],
    });

    expect(rtSendMessage).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "go-forward",
    });
  });

  // ─── SPA / BFCache navigation (tabUpdateListener fallback) ─────────

  it("emits go-back for SPA back navigation via tabUpdateListener", async () => {
    await startRecording(42);
    const tabListener = onUpdatedAdd.mock.calls[0][0];

    // SPA navigate to /page2 (only tabUpdate fires, no onCommitted)
    tabListener(42, { url: "https://example.com/page2" });
    await vi.advanceTimersByTimeAsync(150);
    rtSendMessage.mockClear();

    // Press back — goes to original URL
    tabListener(42, { url: "https://example.com" });
    await vi.advanceTimersByTimeAsync(150);

    expect(rtSendMessage).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "go-back",
    });
  });

  it("emits go-forward for SPA forward navigation via tabUpdateListener", async () => {
    await startRecording(42);
    const tabListener = onUpdatedAdd.mock.calls[0][0];

    // SPA navigate to /page2, then back
    tabListener(42, { url: "https://example.com/page2" });
    await vi.advanceTimersByTimeAsync(150);
    tabListener(42, { url: "https://example.com" });
    await vi.advanceTimersByTimeAsync(150);
    rtSendMessage.mockClear();

    // Press forward — goes to /page2
    tabListener(42, { url: "https://example.com/page2" });
    await vi.advanceTimersByTimeAsync(150);

    expect(rtSendMessage).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "go-forward",
    });
  });

  it("does not emit goto for SPA link click navigation", async () => {
    await startRecording(42);
    const tabListener = onUpdatedAdd.mock.calls[0][0];

    tabListener(42, { url: "https://example.com/page2" });
    await vi.advanceTimersByTimeAsync(150);

    expect(rtSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.stringContaining("goto") }),
    );
  });

  it("onCommitted cancels pending tabUpdate timer", async () => {
    await startRecording(42);
    const tabListener = onUpdatedAdd.mock.calls[0][0];
    const navListener = onCommittedAdd.mock.calls[0][0];

    // tabUpdate fires first (as Chrome does)
    tabListener(42, { url: "https://new-url.com" });

    // onCommitted fires shortly after — should cancel tabUpdate timer
    navListener({
      tabId: 42, frameId: 0, url: "https://new-url.com",
      transitionType: "typed", transitionQualifiers: ["from_address_bar"],
    });

    expect(rtSendMessage).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "goto https://new-url.com",
    });

    // Advance past timer — should NOT double-emit
    rtSendMessage.mockClear();
    await vi.advanceTimersByTimeAsync(150);
    expect(rtSendMessage).not.toHaveBeenCalled();
  });

  it("detects go-back when Chrome misreports SPA back as typed", async () => {
    await startRecording(42);
    const tabListener = onUpdatedAdd.mock.calls[0][0];
    const navListener = onCommittedAdd.mock.calls[0][0];

    // SPA navigate to /page2
    tabListener(42, { url: "https://example.com/page2" });
    await vi.advanceTimersByTimeAsync(150);
    rtSendMessage.mockClear();

    // Back button — tabUpdate fires first, then onCommitted reports as "typed"
    tabListener(42, { url: "https://example.com" });
    navListener({
      tabId: 42, frameId: 0, url: "https://example.com",
      transitionType: "typed", transitionQualifiers: ["from_address_bar"],
    });
    await vi.advanceTimersByTimeAsync(150);

    // Should emit go-back, NOT goto
    expect(rtSendMessage).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "go-back",
    });
    expect(rtSendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ command: expect.stringContaining("goto") }),
    );
  });

  // ─── injectRecorder ────────────────────────────────────────────────────

  it("calls chrome.scripting.executeScript with correct args", async () => {
    await injectRecorder(99);
    expect(executeScript).toHaveBeenCalledWith({
      target: { tabId: 99 },
      files: ["content/recorder.js"],
    });
  });
});
