import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

describe("panel.js", () => {
  let fetchMock: Mock;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();

    // Set up the DOM that panel.js expects (split editor/REPL layout)
    document.body.innerHTML = `
      <div id="toolbar">
        <div id="toolbar-left">
          <button id="open-btn">Open</button>
          <button id="save-btn" disabled>Save</button>
          <button id="copy-btn" disabled>Copy</button>
          <span class="toolbar-sep"></span>
          <button id="record-btn">&#9210; Record</button>
          <button id="run-btn">&#9654;</button>
          <button id="step-btn">&#9655;</button>
          <button id="export-btn" disabled>Export</button>
        </div>
        <div id="toolbar-right">
          <span id="file-info"></span>
        </div>
      </div>
      <div id="editor-pane">
        <div id="line-numbers"></div>
        <div id="editor-wrapper">
          <div id="line-highlight"></div>
          <textarea id="editor" spellcheck="false"></textarea>
        </div>
      </div>
      <div id="splitter"><div id="splitter-handle"></div></div>
      <div id="console-pane">
        <div id="console-header">
          <span id="console-header-left">
            <span id="console-title">Terminal</span>
            <button id="console-clear-btn">Clear</button>
          </span>
          <span id="console-stats"></span>
        </div>
        <div id="output"></div>
        <div id="input-bar">
          <span id="prompt">pw&gt;</span>
          <div id="input-wrapper">
            <div id="autocomplete-dropdown" hidden></div>
            <span id="ghost-text"></span>
            <input type="text" id="command-input" autocomplete="off" spellcheck="false">
          </div>
        </div>
      </div>
      <div id="lightbox" hidden><button id="lightbox-close-btn">&times;</button><button id="lightbox-save-btn">Save</button><img id="lightbox-img"></div>
    `;

    // Remove any theme class from previous test
    document.body.classList.remove("theme-dark");

    // Mock window.matchMedia for theme detection
    (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });

    // Mock fetch — route-aware: /health returns version, /run returns command result
    fetchMock = vi.fn((url) => {
      if (url && url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok", version: "1.0.0" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ text: "OK", isError: false }),
      });
    });
    (global as any).fetch = fetchMock;
  });

  async function loadPanel() {
    await import("../src/panel/panel.js");
  }

  // --- Init ---

  it("renders welcome message on load", async () => {
    await loadPanel();
    const output = document.getElementById("output")!;
    expect(output.textContent).toContain("Playwright REPL v1.0.0");
  });

  it("performs health check on load", async () => {
    await loadPanel();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/health")
      );
    });
  });

  it("shows connected message when health check succeeds", async () => {
    await loadPanel();
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Connected to server"
      );
    });
  });

  it("shows error when health check fails", async () => {
    fetchMock = (global as any).fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    await loadPanel();
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Server not running"
      );
    });
  });

  it("focuses the editor on load", async () => {
    const editor = document.getElementById("editor")!;
    const focusSpy = vi.spyOn(editor, "focus");
    await loadPanel();
    expect(focusSpy).toHaveBeenCalled();
  });

  it("has disabled copy, save, and export buttons initially", async () => {
    await loadPanel();
    expect((document.getElementById("copy-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("save-btn") as HTMLButtonElement).disabled).toBe(true);
    expect((document.getElementById("export-btn") as HTMLButtonElement).disabled).toBe(true);
  });

  it("has enabled open button", async () => {
    await loadPanel();
    expect((document.getElementById("open-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("record button is enabled", async () => {
    await loadPanel();
    expect((document.getElementById("record-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  // --- Theme ---

  it("defaults to light theme", async () => {
    (window as any).matchMedia = vi.fn().mockReturnValue({ matches: false });
    await loadPanel();
    expect(document.body.classList.contains("theme-dark")).toBe(false);
  });

  it("applies dark theme when prefers-color-scheme: dark", async () => {
    (window as any).matchMedia = vi.fn().mockReturnValue({ matches: true });
    await loadPanel();
    expect(document.body.classList.contains("theme-dark")).toBe(true);
  });

  // --- Line numbers ---

  it("renders line numbers for editor content", async () => {
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = "goto https://example.com\nclick \"OK\"\npress Enter";
    editor.dispatchEvent(new Event("input"));
    const lineNums = document.getElementById("line-numbers")!;
    const divs = lineNums.querySelectorAll("div");
    expect(divs.length).toBe(3);
    expect(divs[0].textContent).toBe("1");
    expect(divs[1].textContent).toBe("2");
    expect(divs[2].textContent).toBe("3");
  });

  it("shows file info with line count", async () => {
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = "goto https://example.com\nclick \"OK\"";
    editor.dispatchEvent(new Event("input"));
    const fileInfo = document.getElementById("file-info")!;
    expect(fileInfo.textContent).toContain("2 lines");
  });

  // --- REPL input ---

  it("sends command via fetch on Enter key", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "click e5";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/run"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ raw: "click e5", activeTabUrl: null }),
        })
      );
    });
  });

  it("clears input after Enter", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(input.value).toBe("");
  });

  it("does not send empty commands", async () => {
    await loadPanel();
    // Clear the health check fetch call
    fetchMock.mockClear();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "   ";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/run"),
      expect.anything()
    );
  });

  // --- Response display ---

  it("displays success response in output", async () => {
    fetchMock = (global as any).fetch = vi.fn((url) => {
      if (url && url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok", version: "1.0.0" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            text: "Navigated\n### Page\n- Page URL: https://example.com",
            isError: false,
          }),
      });
    });
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "goto https://example.com";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Navigated"
      );
    });
  });

  it("displays error response in output", async () => {
    fetchMock = (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ text: "Element not found", isError: true }),
    });
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = 'click "Missing"';
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Element not found"
      );
    });
  });

  it("displays snapshot lines in output", async () => {
    fetchMock = (global as any).fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          text: '- button "OK" [ref=e1]\n- link "Home" [ref=e2]',
          isError: false,
        }),
    });
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "button"
      );
      expect(document.getElementById("output")!.textContent).toContain("link");
    });
  });

  it("displays screenshot as image in output", async () => {
    fetchMock = (global as any).fetch = vi.fn((url) => {
      if (url && url.includes("/health")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "ok", version: "1.0.0" }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            text: "Screenshot saved\n### Page\n- Page URL: https://example.com",
            image: "data:image/png;base64,fakebase64",
            isError: false,
          }),
      });
    });
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "screenshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      const img = document.querySelector("img:not(#lightbox-img)") as HTMLImageElement;
      expect(img).not.toBeNull();
      expect(img.src).toContain("fakebase64");
    });
  });

  it("shows server not running on fetch failure", async () => {
    fetchMock = (global as any).fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Not connected to server"
      );
    });
  });

  it("displays comments without sending to server", async () => {
    await loadPanel();
    fetchMock.mockClear();
    const input = document.getElementById("command-input") as HTMLInputElement;
    input.value = "# this is a comment";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(document.getElementById("output")!.textContent).toContain(
      "# this is a comment"
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining("/run"),
      expect.anything()
    );
  });

  // --- History ---

  it("navigates command history with ArrowUp/ArrowDown", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;

    input.value = "help";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
    );
    expect(input.value).toBe("snapshot");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
    );
    expect(input.value).toBe("help");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    expect(input.value).toBe("snapshot");

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true })
    );
    expect(input.value).toBe("");
  });

  // --- Copy/Save/Export ---

  it("enables copy, save, export when editor has content", async () => {
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = "goto https://example.com";
    editor.dispatchEvent(new Event("input"));

    expect((document.getElementById("copy-btn") as HTMLButtonElement).disabled).toBe(false);
    expect((document.getElementById("save-btn") as HTMLButtonElement).disabled).toBe(false);
    expect((document.getElementById("export-btn") as HTMLButtonElement).disabled).toBe(false);
  });

  it("copy button copies editor content to clipboard", async () => {
    (document as any).execCommand = vi.fn().mockReturnValue(true);
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = 'goto https://example.com\nclick "OK"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("copy-btn")!.click();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.getElementById("output")!.textContent).toContain("copied");
  });

  it("export button converts editor to Playwright code", async () => {
    await loadPanel();
    (document as any).execCommand = vi.fn().mockReturnValue(true);
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = 'goto https://example.com\nclick "Submit"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("export-btn")!.click();
    const output = document.getElementById("output")!;
    const codeBlock = output.querySelector(".code-block");
    expect(codeBlock).not.toBeNull();
    expect(codeBlock!.textContent).toContain("@playwright/test");
  });

  // --- Console commands (history, clear, reset) ---

  it("history command displays history in terminal", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;

    input.value = "help";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    await vi.waitFor(() => {
      // Wait for the fetch calls to complete
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/run"),
        expect.anything()
      );
    });

    input.value = "history";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    const output = document.getElementById("output")!;
    expect(output.textContent).toContain("help");
    expect(output.textContent).toContain("snapshot");
  });

  it("clear command clears console output", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;

    input.value = "clear";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    expect(document.getElementById("output")!.innerHTML).toBe("");
  });

  it("reset command clears history and console", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;

    input.value = "help";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    input.value = "reset";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    expect(document.getElementById("output")!.textContent).toContain(
      "History and terminal cleared"
    );

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
    );
    expect(input.value).toBe("");
  });

  // --- Run button ---

  it("run button executes editor lines via fetch", async () => {
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = 'goto https://example.com\nclick "OK"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("run-btn")!.click();
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Running script..."
      );
      expect(document.getElementById("output")!.textContent).toContain(
        "Run complete."
      );
    });
  });

  it("run button shows pass/fail stats", async () => {
    let callCount = 0;
    fetchMock = (global as any).fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes("/run")) {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            json: () => Promise.resolve({ text: "OK", isError: false }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({ text: "Not found", isError: true }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ status: "ok" }),
      });
    });
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = 'goto https://example.com\nclick "Missing"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("run-btn")!.click();
    await vi.waitFor(() => {
      const stats = document.getElementById("console-stats")!;
      expect(stats.textContent).toContain("1 passed");
      expect(stats.textContent).toContain("1 failed");
    });
  });

  it("run button shows message for empty editor", async () => {
    await loadPanel();
    document.getElementById("run-btn")!.click();
    expect(document.getElementById("output")!.textContent).toContain(
      "Editor is empty"
    );
  });

  // --- Ctrl+Enter ---

  it("Ctrl+Enter in editor triggers run", async () => {
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = "goto https://example.com";
    editor.dispatchEvent(new Event("input"));

    editor.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        ctrlKey: true,
        bubbles: true,
      })
    );

    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Running script..."
      );
    });
  });

  // --- Step button ---

  it("step button executes the first executable line", async () => {
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = 'goto https://example.com\nclick "OK"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("step-btn")!.click();
    await vi.waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/run"),
        expect.objectContaining({
          body: JSON.stringify({ raw: "goto https://example.com", activeTabUrl: null }),
        })
      );
    });
  });

  it("step button shows message for empty editor", async () => {
    await loadPanel();
    document.getElementById("step-btn")!.click();
    expect(document.getElementById("output")!.textContent).toContain(
      "Editor is empty"
    );
  });

  // --- Autocomplete ---

  it("ghost text shows completion hint while typing", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    const ghost = document.getElementById("ghost-text")!;

    input.value = "go";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ghost.textContent).toBe("to");
  });

  it("Tab completes single matching command", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;

    input.value = "scr";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    );
    expect(input.value).toBe("screenshot ");
  });

  it("dropdown shows for multiple matches", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    const dd = document.getElementById("autocomplete-dropdown")!;

    input.value = "go";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(dd.hidden).toBe(false);
    expect(dd.querySelectorAll(".autocomplete-item").length).toBeGreaterThan(1);
  });

  it("Escape closes dropdown", async () => {
    await loadPanel();
    const input = document.getElementById("command-input") as HTMLInputElement;
    const dd = document.getElementById("autocomplete-dropdown")!;

    input.value = "go";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(dd.hidden).toBe(false);

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(dd.hidden).toBe(true);
  });

  // --- Lightbox ---

  it("lightbox closes when clicking backdrop", async () => {
    await loadPanel();
    const lightbox = document.getElementById("lightbox")!;
    lightbox.hidden = false;

    lightbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(lightbox.hidden).toBe(true);
  });

  it("lightbox close button works", async () => {
    await loadPanel();
    const lightbox = document.getElementById("lightbox")!;
    lightbox.hidden = false;

    document.getElementById("lightbox-close-btn")!.click();
    expect(lightbox.hidden).toBe(true);
  });

  it("Escape key closes lightbox when visible", async () => {
    await loadPanel();
    const lightbox = document.getElementById("lightbox")!;
    lightbox.hidden = false;

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(lightbox.hidden).toBe(true);
  });

  // --- Splitter ---

  it("splitter drag resizes editor pane", async () => {
    await loadPanel();
    const splitter = document.getElementById("splitter")!;

    splitter.dispatchEvent(
      new MouseEvent("mousedown", { clientY: 200, bubbles: true })
    );
    expect(document.body.style.cursor).toBe("row-resize");

    document.dispatchEvent(
      new MouseEvent("mousemove", { clientY: 250, bubbles: true })
    );

    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    expect(document.body.style.cursor).toBe("");
  });

  // --- Save button ---

  it("save button saves editor content", async () => {
    const mockWritable = { write: vi.fn(), close: vi.fn() };
    const mockHandle = { name: "test.pw", createWritable: vi.fn().mockResolvedValue(mockWritable) };
    (window as any).showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);
    await loadPanel();
    const editor = document.getElementById("editor") as HTMLTextAreaElement;
    editor.value = "goto https://example.com";
    editor.dispatchEvent(new Event("input"));

    document.getElementById("save-btn")!.click();
    await vi.waitFor(() => {
      expect(document.getElementById("output")!.textContent).toContain(
        "Saved as test.pw"
      );
    });
    expect(mockWritable.write).toHaveBeenCalledWith("goto https://example.com");
    expect(mockWritable.close).toHaveBeenCalled();
  });

  // --- Open button ---

  it("open button loads file content into editor", async () => {
    await loadPanel();

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = realCreateElement(tag);
      if (tag === "input") {
        el.click = () => {
          const file = new File(
            ['goto https://example.com\nclick "OK"'],
            "test.pw",
            { type: "text/plain" }
          );
          Object.defineProperty(el, "files", { value: [file] });
          el.dispatchEvent(new Event("change"));
        };
      }
      return el;
    });

    document.getElementById("open-btn")!.click();

    await vi.waitFor(() => {
      expect((document.getElementById("editor") as HTMLTextAreaElement).value).toContain(
        "goto https://example.com"
      );
    });

    (document.createElement as any).mockRestore();
  });
});
