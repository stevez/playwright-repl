import { describe, it, expect, vi, beforeEach } from "vitest";

describe("panel.js", () => {
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
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });

    // Mock fetch — route-aware: /health returns version, /run returns command result
    global.fetch = vi.fn((url) => {
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
  });

  // --- Init ---

  it("renders welcome message on load", async () => {
    await import("../panel/panel.js");
    const output = document.getElementById("output");
    expect(output.textContent).toContain("Playwright REPL v1.0.0");
  });

  it("performs health check on load", async () => {
    await import("../panel/panel.js");
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/health")
      );
    });
  });

  it("shows connected message when health check succeeds", async () => {
    await import("../panel/panel.js");
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "Connected to server"
      );
    });
  });

  it("shows error when health check fails", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    await import("../panel/panel.js");
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "Server not running"
      );
    });
  });

  it("focuses the editor on load", async () => {
    const editor = document.getElementById("editor");
    const focusSpy = vi.spyOn(editor, "focus");
    await import("../panel/panel.js");
    expect(focusSpy).toHaveBeenCalled();
  });

  it("has disabled copy, save, and export buttons initially", async () => {
    await import("../panel/panel.js");
    expect(document.getElementById("copy-btn").disabled).toBe(true);
    expect(document.getElementById("save-btn").disabled).toBe(true);
    expect(document.getElementById("export-btn").disabled).toBe(true);
  });

  it("has enabled open button", async () => {
    await import("../panel/panel.js");
    expect(document.getElementById("open-btn").disabled).toBe(false);
  });

  it("record button is enabled", async () => {
    await import("../panel/panel.js");
    expect(document.getElementById("record-btn").disabled).toBe(false);
  });

  // --- Theme ---

  it("defaults to light theme", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: false });
    await import("../panel/panel.js");
    expect(document.body.classList.contains("theme-dark")).toBe(false);
  });

  it("applies dark theme when prefers-color-scheme: dark", async () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true });
    await import("../panel/panel.js");
    expect(document.body.classList.contains("theme-dark")).toBe(true);
  });

  // --- Line numbers ---

  it("renders line numbers for editor content", async () => {
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = "goto https://example.com\nclick \"OK\"\npress Enter";
    editor.dispatchEvent(new Event("input"));
    const lineNums = document.getElementById("line-numbers");
    const divs = lineNums.querySelectorAll("div");
    expect(divs.length).toBe(3);
    expect(divs[0].textContent).toBe("1");
    expect(divs[1].textContent).toBe("2");
    expect(divs[2].textContent).toBe("3");
  });

  it("shows file info with line count", async () => {
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = "goto https://example.com\nclick \"OK\"";
    editor.dispatchEvent(new Event("input"));
    const fileInfo = document.getElementById("file-info");
    expect(fileInfo.textContent).toContain("2 lines");
  });

  // --- REPL input ---

  it("sends command via fetch on Enter key", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    input.value = "click e5";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/run"),
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ raw: "click e5", activeTabUrl: null }),
        })
      );
    });
  });

  it("clears input after Enter", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(input.value).toBe("");
  });

  it("does not send empty commands", async () => {
    await import("../panel/panel.js");
    // Clear the health check fetch call
    global.fetch.mockClear();
    const input = document.getElementById("command-input");
    input.value = "   ";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/run"),
      expect.anything()
    );
  });

  // --- Response display ---

  it("displays success response in output", async () => {
    global.fetch = vi.fn((url) => {
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
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    input.value = "goto https://example.com";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "Navigated"
      );
    });
  });

  it("displays error response in output", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ text: "Element not found", isError: true }),
    });
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    input.value = 'click "Missing"';
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "Element not found"
      );
    });
  });

  it("displays snapshot lines in output", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          text: '- button "OK" [ref=e1]\n- link "Home" [ref=e2]',
          isError: false,
        }),
    });
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "button"
      );
      expect(document.getElementById("output").textContent).toContain("link");
    });
  });

  it("displays screenshot as image in output", async () => {
    global.fetch = vi.fn((url) => {
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
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    input.value = "screenshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      const img = document.querySelector("img:not(#lightbox-img)");
      expect(img).not.toBeNull();
      expect(img.src).toContain("fakebase64");
    });
  });

  it("shows server not running on fetch failure", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Connection refused"));
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    input.value = "snapshot";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "Not connected to server"
      );
    });
  });

  it("displays comments without sending to server", async () => {
    await import("../panel/panel.js");
    global.fetch.mockClear();
    const input = document.getElementById("command-input");
    input.value = "# this is a comment";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    expect(document.getElementById("output").textContent).toContain(
      "# this is a comment"
    );
    expect(global.fetch).not.toHaveBeenCalledWith(
      expect.stringContaining("/run"),
      expect.anything()
    );
  });

  // --- History ---

  it("navigates command history with ArrowUp/ArrowDown", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");

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
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = "goto https://example.com";
    editor.dispatchEvent(new Event("input"));

    expect(document.getElementById("copy-btn").disabled).toBe(false);
    expect(document.getElementById("save-btn").disabled).toBe(false);
    expect(document.getElementById("export-btn").disabled).toBe(false);
  });

  it("copy button copies editor content to clipboard", async () => {
    document.execCommand = vi.fn().mockReturnValue(true);
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = 'goto https://example.com\nclick "OK"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("copy-btn").click();
    expect(document.execCommand).toHaveBeenCalledWith("copy");
    expect(document.getElementById("output").textContent).toContain("copied");
  });

  it("export button converts editor to Playwright code", async () => {
    await import("../panel/panel.js");
    document.execCommand = vi.fn().mockReturnValue(true);
    const editor = document.getElementById("editor");
    editor.value = 'goto https://example.com\nclick "Submit"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("export-btn").click();
    const output = document.getElementById("output");
    const codeBlock = output.querySelector(".code-block");
    expect(codeBlock).not.toBeNull();
    expect(codeBlock.textContent).toContain("@playwright/test");
  });

  // --- Console commands (history, clear, reset) ---

  it("history command displays history in terminal", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");

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
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/run"),
        expect.anything()
      );
    });

    input.value = "history";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    const output = document.getElementById("output");
    expect(output.textContent).toContain("help");
    expect(output.textContent).toContain("snapshot");
  });

  it("clear command clears console output", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");

    input.value = "clear";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    expect(document.getElementById("output").innerHTML).toBe("");
  });

  it("reset command clears history and console", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");

    input.value = "help";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    input.value = "reset";
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );

    expect(document.getElementById("output").textContent).toContain(
      "History and terminal cleared"
    );

    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })
    );
    expect(input.value).toBe("");
  });

  // --- Run button ---

  it("run button executes editor lines via fetch", async () => {
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = 'goto https://example.com\nclick "OK"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("run-btn").click();
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "Running script..."
      );
      expect(document.getElementById("output").textContent).toContain(
        "Run complete."
      );
    });
  });

  it("run button shows pass/fail stats", async () => {
    let callCount = 0;
    global.fetch = vi.fn().mockImplementation((url) => {
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
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = 'goto https://example.com\nclick "Missing"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("run-btn").click();
    await vi.waitFor(() => {
      const stats = document.getElementById("console-stats");
      expect(stats.textContent).toContain("1 passed");
      expect(stats.textContent).toContain("1 failed");
    });
  });

  it("run button shows message for empty editor", async () => {
    await import("../panel/panel.js");
    document.getElementById("run-btn").click();
    expect(document.getElementById("output").textContent).toContain(
      "Editor is empty"
    );
  });

  // --- Ctrl+Enter ---

  it("Ctrl+Enter in editor triggers run", async () => {
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
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
      expect(document.getElementById("output").textContent).toContain(
        "Running script..."
      );
    });
  });

  // --- Step button ---

  it("step button executes the first executable line", async () => {
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = 'goto https://example.com\nclick "OK"';
    editor.dispatchEvent(new Event("input"));

    document.getElementById("step-btn").click();
    await vi.waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/run"),
        expect.objectContaining({
          body: JSON.stringify({ raw: "goto https://example.com", activeTabUrl: null }),
        })
      );
    });
  });

  it("step button shows message for empty editor", async () => {
    await import("../panel/panel.js");
    document.getElementById("step-btn").click();
    expect(document.getElementById("output").textContent).toContain(
      "Editor is empty"
    );
  });

  // --- Autocomplete ---

  it("ghost text shows completion hint while typing", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    const ghost = document.getElementById("ghost-text");

    input.value = "go";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(ghost.textContent).toBe("to");
  });

  it("Tab completes single matching command", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");

    input.value = "scr";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true })
    );
    expect(input.value).toBe("screenshot ");
  });

  it("dropdown shows for multiple matches", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    const dd = document.getElementById("autocomplete-dropdown");

    input.value = "go";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(dd.hidden).toBe(false);
    expect(dd.querySelectorAll(".autocomplete-item").length).toBeGreaterThan(1);
  });

  it("Escape closes dropdown", async () => {
    await import("../panel/panel.js");
    const input = document.getElementById("command-input");
    const dd = document.getElementById("autocomplete-dropdown");

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
    await import("../panel/panel.js");
    const lightbox = document.getElementById("lightbox");
    lightbox.hidden = false;

    lightbox.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(lightbox.hidden).toBe(true);
  });

  it("lightbox close button works", async () => {
    await import("../panel/panel.js");
    const lightbox = document.getElementById("lightbox");
    lightbox.hidden = false;

    document.getElementById("lightbox-close-btn").click();
    expect(lightbox.hidden).toBe(true);
  });

  it("Escape key closes lightbox when visible", async () => {
    await import("../panel/panel.js");
    const lightbox = document.getElementById("lightbox");
    lightbox.hidden = false;

    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    expect(lightbox.hidden).toBe(true);
  });

  // --- Splitter ---

  it("splitter drag resizes editor pane", async () => {
    await import("../panel/panel.js");
    const splitter = document.getElementById("splitter");

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
    window.showSaveFilePicker = vi.fn().mockResolvedValue(mockHandle);
    await import("../panel/panel.js");
    const editor = document.getElementById("editor");
    editor.value = "goto https://example.com";
    editor.dispatchEvent(new Event("input"));

    document.getElementById("save-btn").click();
    await vi.waitFor(() => {
      expect(document.getElementById("output").textContent).toContain(
        "Saved as test.pw"
      );
    });
    expect(mockWritable.write).toHaveBeenCalledWith("goto https://example.com");
    expect(mockWritable.close).toHaveBeenCalled();
  });

  // --- Open button ---

  it("open button loads file content into editor", async () => {
    await import("../panel/panel.js");

    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
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

    document.getElementById("open-btn").click();

    await vi.waitFor(() => {
      expect(document.getElementById("editor").value).toContain(
        "goto https://example.com"
      );
    });

    document.createElement.mockRestore();
  });
});
