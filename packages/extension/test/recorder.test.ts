import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("recorder.js", () => {
  let sendMessageSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    vi.useFakeTimers();

    // Clear recorder state
    delete document.documentElement.dataset.pwRecorderActive;
    delete window.__pwRecorderCleanup;

    // Mock chrome.runtime.sendMessage
    sendMessageSpy = vi.fn();
    (globalThis as any).chrome = {
      runtime: { sendMessage: sendMessageSpy },
    };
  });

  afterEach(() => {
    // Clean up recorder if still active
    if (typeof window.__pwRecorderCleanup === "function") {
      window.__pwRecorderCleanup();
    }
    vi.useRealTimers();
  });

  async function loadRecorder() {
    // @ts-expect-error recorder.ts is an IIFE script with no exports; vitest can still execute it
    await import("../src/content/recorder.ts");
  }

  // ─── Initialization ─────────────────────────────────────────────────────

  it("sets dataset.pwRecorderActive on load", async () => {
    await loadRecorder();
    expect(document.documentElement.dataset.pwRecorderActive).toBe("true");
  });

  it("provides __pwRecorderCleanup function", async () => {
    await loadRecorder();
    expect(typeof window.__pwRecorderCleanup).toBe("function");
  });

  it("is idempotent — does not run twice", async () => {
    await loadRecorder();
    const firstCleanup = window.__pwRecorderCleanup;
    // @ts-expect-error recorder.ts is an IIFE with no exports
    await import("../src/content/recorder.ts");
    expect(window.__pwRecorderCleanup).toBe(firstCleanup);
  });

  // ─── Click ──────────────────────────────────────────────────────────────

  it("records click on a button", async () => {
    document.body.innerHTML = '<button>Submit</button>';
    await loadRecorder();
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Submit"',
    });
  });

  it("records click on a link", async () => {
    document.body.innerHTML = '<a href="#">Learn more</a>';
    await loadRecorder();
    document.querySelector("a")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Learn more"',
    });
  });

  it("skips clicks on non-interactive containers (div, section)", async () => {
    document.body.innerHTML = '<div id="container">content</div>';
    await loadRecorder();
    (document.querySelector("#container") as HTMLElement).click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("uses aria-label for locator when available", async () => {
    document.body.innerHTML = '<button aria-label="Close dialog">X</button>';
    await loadRecorder();
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Close dialog"',
    });
  });

  it("uses label[for] for locator", async () => {
    document.body.innerHTML = '<label for="name">Full Name</label><input id="name" type="checkbox">';
    await loadRecorder();
    document.querySelector("input")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  it("uses placeholder for locator", async () => {
    document.body.innerHTML = '<button placeholder="Search...">Search...</button>';
    await loadRecorder();
    // placeholder is not standard on buttons, so textContent takes priority
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Search..."',
    });
  });

  it("uses title as fallback locator", async () => {
    document.body.innerHTML = '<span title="Info tooltip" role="button"></span>';
    await loadRecorder();
    document.querySelector("span")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Info tooltip"',
    });
  });

  it("falls back to tagName locator", async () => {
    document.body.innerHTML = '<span role="button"></span>';
    await loadRecorder();
    document.querySelector("span")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "span"',
    });
  });

  it("skips click on text input (handled by fill)", async () => {
    document.body.innerHTML = '<input type="text" placeholder="Name">';
    await loadRecorder();
    document.querySelector("input")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("skips click on textarea (handled by fill)", async () => {
    document.body.innerHTML = '<textarea placeholder="Notes"></textarea>';
    await loadRecorder();
    document.querySelector("textarea")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("records click on div with role attribute", async () => {
    document.body.innerHTML = '<div role="button">Custom Button</div>';
    await loadRecorder();
    document.querySelector("div")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Custom Button"',
    });
  });

  it("escapes quotes in locator text", async () => {
    document.body.innerHTML = '<button>Say "Hello"</button>';
    await loadRecorder();
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Say \\"Hello\\""',
    });
  });

  it("falls through long text (>80 chars) to title", async () => {
    const longText = "A".repeat(100);
    document.body.innerHTML = `<span role="button" title="Short title">${longText}</span>`;
    await loadRecorder();
    document.querySelector("span")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Short title"',
    });
  });

  it("uses parent label text for locator", async () => {
    document.body.innerHTML = '<label>Username <span role="button">icon</span></label>';
    await loadRecorder();
    document.querySelector("span")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Username icon"',
    });
  });

  // ─── Non-interactive elements (isClickable) ────────────────────────────

  it("skips clicks on plain span without role", async () => {
    document.body.innerHTML = '<span>just text</span>';
    await loadRecorder();
    document.querySelector("span")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("skips clicks on paragraph text", async () => {
    document.body.innerHTML = '<p>paragraph content</p>';
    await loadRecorder();
    document.querySelector("p")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("skips clicks on heading text", async () => {
    document.body.innerHTML = '<h2>Section Title</h2>';
    await loadRecorder();
    document.querySelector("h2")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("records click on child of a link", async () => {
    document.body.innerHTML = '<a href="#"><span>inner text</span></a>';
    await loadRecorder();
    document.querySelector("span")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  it("records click on child of a button", async () => {
    document.body.innerHTML = '<button><span>icon</span></button>';
    await loadRecorder();
    document.querySelector("span")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  it("records click on element with onclick attribute", async () => {
    document.body.innerHTML = '<div onclick="void(0)">clickable div</div>';
    await loadRecorder();
    document.querySelector("div")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: "pw-recorded-command" }),
    );
  });

  // ─── Nth suffix (uniqueness check) ────────────────────────────────────

  it("appends --nth when multiple buttons share the same text", async () => {
    document.body.innerHTML = '<button>OK</button><button>OK</button><button>OK</button>';
    await loadRecorder();
    const buttons = document.querySelectorAll("button");
    buttons[1].click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "OK" --nth 1',
    });
  });

  it("appends --nth 0 for the first of multiple matching elements", async () => {
    document.body.innerHTML = '<button>Save</button><button>Save</button>';
    await loadRecorder();
    document.querySelectorAll("button")[0].click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Save" --nth 0',
    });
  });

  it("does not append --nth when text is unique", async () => {
    document.body.innerHTML = '<button>Submit</button><button>Cancel</button>';
    await loadRecorder();
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Submit"',
    });
  });

  it("appends --nth for duplicate links", async () => {
    document.body.innerHTML = '<a href="#">Read more</a><a href="#">Read more</a>';
    await loadRecorder();
    document.querySelectorAll("a")[1].click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Read more" --nth 1',
    });
  });

  // ─── Checkbox ───────────────────────────────────────────────────────────

  it("records check command on checkbox", async () => {
    document.body.innerHTML = '<input type="checkbox" aria-label="Accept terms">';
    await loadRecorder();
    const cb = document.querySelector("input")!;
    // click() toggles unchecked → checked, handler reads checked=true
    cb.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'check "Accept terms"',
    });
  });

  it("records uncheck command on checkbox", async () => {
    document.body.innerHTML = '<input type="checkbox" aria-label="Accept terms" checked>';
    await loadRecorder();
    const cb = document.querySelector("input")!;
    // click() toggles checked → unchecked, handler reads checked=false
    cb.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'uncheck "Accept terms"',
    });
  });

  it("detects checkbox via parent label", async () => {
    document.body.innerHTML = '<label>Remember me <input type="checkbox"></label>';
    await loadRecorder();
    const cb = document.querySelector("input")!;
    cb.checked = true;
    document.querySelector("label")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pw-recorded-command",
        command: expect.stringContaining("check"),
      }),
    );
  });

  // ─── Input / Fill ───────────────────────────────────────────────────────

  it("records debounced fill command on input", async () => {
    document.body.innerHTML = '<input type="text" placeholder="Username">';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.value = "alice";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    // Should not fire immediately
    expect(sendMessageSpy).not.toHaveBeenCalled();
    // After debounce
    vi.advanceTimersByTime(1500);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'fill "Username" "alice"',
    });
  });

  it("click flushes pending fill immediately", async () => {
    document.body.innerHTML = '<input type="text" placeholder="Email"><button>Submit</button>';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.value = "test@example.com";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    // Click before debounce timeout
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    const calls = sendMessageSpy.mock.calls.map((c) => c[0]);
    const fillCall = calls.find((c) => c.command && c.command.startsWith("fill"));
    const clickCall = calls.find((c) => c.command && c.command.startsWith("click"));
    expect(fillCall).toBeDefined();
    expect(clickCall).toBeDefined();
  });

  it("records fill on textarea", async () => {
    document.body.innerHTML = '<textarea aria-label="Comments"></textarea>';
    await loadRecorder();
    const el = document.querySelector("textarea")!;
    el.value = "Great product!";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(1500);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'fill "Comments" "Great product!"',
    });
  });

  it("resets debounce timer on continued typing", async () => {
    document.body.innerHTML = '<input type="text" placeholder="Search">';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.value = "hel";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    // Still typing — should not have flushed yet
    expect(sendMessageSpy).not.toHaveBeenCalled();
    el.value = "hello";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(1000);
    // Timer reset — still waiting
    expect(sendMessageSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    // Now 1500ms since last input
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'fill "Search" "hello"',
    });
  });

  it("escapes quotes in fill value", async () => {
    document.body.innerHTML = '<input type="text" placeholder="Name">';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.value = 'John "Doe"';
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(1500);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'fill "Name" "John \\"Doe\\""',
    });
  });

  it("does not record fill for radio inputs", async () => {
    document.body.innerHTML = '<input type="radio" name="opt">';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(1500);
    const fillCalls = sendMessageSpy.mock.calls.filter(
      (c) => c[0].command && c[0].command.startsWith("fill"),
    );
    expect(fillCalls).toHaveLength(0);
  });

  it("does not record fill for checkbox inputs", async () => {
    document.body.innerHTML = '<input type="checkbox" aria-label="Toggle">';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    vi.advanceTimersByTime(1500);
    const fillCalls = sendMessageSpy.mock.calls.filter(
      (c) => c[0].command && c[0].command.startsWith("fill"),
    );
    expect(fillCalls).toHaveLength(0);
  });

  // ─── Select ─────────────────────────────────────────────────────────────

  it("records select command on dropdown", async () => {
    document.body.innerHTML = `
      <select aria-label="Color">
        <option value="r">Red</option>
        <option value="b">Blue</option>
      </select>`;
    await loadRecorder();
    const sel = document.querySelector("select")!;
    sel.selectedIndex = 1;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'select "Color" "Blue"',
    });
  });

  // ─── Keydown ────────────────────────────────────────────────────────────

  it("records press Enter", async () => {
    document.body.innerHTML = '<input type="text">';
    await loadRecorder();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "press Enter",
    });
  });

  it("records press Tab", async () => {
    await loadRecorder();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "press Tab",
    });
  });

  it("records press Escape", async () => {
    await loadRecorder();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: "press Escape",
    });
  });

  it("does not record regular key presses", async () => {
    await loadRecorder();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("keydown flushes pending fill", async () => {
    document.body.innerHTML = '<input type="text" placeholder="Search">';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.value = "hello";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    const calls = sendMessageSpy.mock.calls.map((c) => c[0]);
    expect(calls.find((c) => c.command === 'fill "Search" "hello"')).toBeDefined();
    expect(calls.find((c) => c.command === "press Enter")).toBeDefined();
  });

  // ─── Double-click ───────────────────────────────────────────────────────

  it("records dblclick and suppresses single click", async () => {
    document.body.innerHTML = '<span role="button">Edit</span>';
    await loadRecorder();
    const el = document.querySelector("span")!;
    // Simulate browser's click → dblclick sequence
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    el.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    vi.advanceTimersByTime(300);
    const commands = sendMessageSpy.mock.calls.map((c) => c[0].command);
    expect(commands).toContain('dblclick "Edit"');
    expect(commands).not.toContain('click "Edit"');
  });

  // ─── Context menu (right-click) ─────────────────────────────────────────

  it("records right-click as click --button right", async () => {
    document.body.innerHTML = '<span role="button">Item</span>';
    await loadRecorder();
    const el = document.querySelector("span")!;
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "Item" --button right',
    });
  });

  // ─── Action button with item context ────────────────────────────────────

  it("includes item context for action buttons in a list", async () => {
    document.body.innerHTML = `
      <ul>
        <li><span>Buy milk</span><button aria-label="delete">X</button></li>
      </ul>`;
    await loadRecorder();
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'click "delete" "Buy milk"',
    });
  });

  // ─── Cleanup ────────────────────────────────────────────────────────────

  it("cleanup removes listeners and dataset", async () => {
    document.body.innerHTML = '<button>Click me</button>';
    await loadRecorder();
    expect(document.documentElement.dataset.pwRecorderActive).toBe("true");

    window.__pwRecorderCleanup();

    expect(document.documentElement.dataset.pwRecorderActive).toBeUndefined();
    expect(window.__pwRecorderCleanup).toBeUndefined();

    // Events should no longer be captured
    sendMessageSpy.mockClear();
    document.querySelector("button")!.click();
    vi.advanceTimersByTime(300);
    expect(sendMessageSpy).not.toHaveBeenCalled();
  });

  it("cleanup flushes pending fill", async () => {
    document.body.innerHTML = '<input type="text" placeholder="Name">';
    await loadRecorder();
    const el = document.querySelector("input")!;
    el.value = "Bob";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    // Cleanup before debounce
    window.__pwRecorderCleanup();
    expect(sendMessageSpy).toHaveBeenCalledWith({
      type: "pw-recorded-command",
      command: 'fill "Name" "Bob"',
    });
  });
});
