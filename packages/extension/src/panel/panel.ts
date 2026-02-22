import { pwToPlaywright } from "../lib/converter.js";

// --- Interfaces ---

interface RunResult {
  text: string;
  isError: boolean;
  image?: string;
}

interface ResponseEntry {
  command: string;
  text: string;
  timestamp: number;
}

// --- Chrome MV3 promise-based API helpers ---
// @types/chrome only declares callback overloads; MV3 supports promises at runtime.
// These are functions (not captured references) so E2E tests can mock chrome.tabs/runtime.
function tabsQuery(q: chrome.tabs.QueryInfo): Promise<chrome.tabs.Tab[]> {
  return (chrome.tabs.query as any)(q);
}
function rtSendMessage(message: unknown): Promise<unknown> {
  return (chrome.runtime.sendMessage as any)(message);
}

// --- DOM references ---

const output = document.getElementById("output") as HTMLDivElement;
const input = document.getElementById("command-input") as HTMLInputElement;
const editor = document.getElementById("editor") as HTMLTextAreaElement;
const lineNumbers = document.getElementById("line-numbers") as HTMLDivElement;
const editorPane = document.getElementById("editor-pane") as HTMLDivElement;
const splitter = document.getElementById("splitter") as HTMLDivElement;
const consoleStats = document.getElementById("console-stats") as HTMLSpanElement;
const fileInfo = document.getElementById("file-info") as HTMLSpanElement;
const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
const openBtn = document.getElementById("open-btn") as HTMLButtonElement;
const saveBtn = document.getElementById("save-btn") as HTMLButtonElement;
const exportBtn = document.getElementById("export-btn") as HTMLButtonElement;
const recordBtn = document.getElementById("record-btn") as HTMLButtonElement;
const copyBtn = document.getElementById("copy-btn") as HTMLButtonElement;
const stepBtn = document.getElementById("step-btn") as HTMLButtonElement;
const consoleClearBtn = document.getElementById("console-clear-btn") as HTMLButtonElement;
const lineHighlight = document.getElementById("line-highlight") as HTMLDivElement;
const lightbox = document.getElementById("lightbox") as HTMLDivElement;
const lightboxImg = document.getElementById("lightbox-img") as HTMLImageElement;
const lightboxSaveBtn = document.getElementById("lightbox-save-btn") as HTMLButtonElement;
const lightboxCloseBtn = document.getElementById("lightbox-close-btn") as HTMLButtonElement;
const ghostText = document.getElementById("ghost-text") as HTMLSpanElement;
const dropdown = document.getElementById("autocomplete-dropdown") as HTMLDivElement;

// --- Server config ---
const SERVER_PORT = 6781;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

// --- Response history (full responses stored for reference) ---
const responseHistory: ResponseEntry[] = [];

/**
 * Filter verbose response for panel display.
 *
 * Playwright MCP responses follow a consistent structure:
 *   <result text>        ← the actual outcome (e.g. "Clicked", "Navigated to...")
 *   ### Section 1        ← supplementary context (code, tabs, page info, etc.)
 *   ### Section 2
 *   ...
 *
 * Generic strategy:
 *   - Always store the full response in responseHistory
 *   - For "snapshot": show the ### Snapshot section (that's the whole point)
 *   - For everything else: show only the result text (before the first ### header)
 */
function filterResponse(command: string, text: string): string {
  responseHistory.push({ command, text, timestamp: Date.now() });

  const cmdName = command.trim().split(/\s+/)[0];

  // snapshot: return full response (the whole point is to see the tree)
  if (cmdName === 'snapshot') return text;

  // Extract text before the first ### header (if any)
  const firstSectionIdx = text.indexOf('### ');
  const preamble = firstSectionIdx > 0 ? text.slice(0, firstSectionIdx).trim() : '';

  // Extract content from useful ### sections (Result, Error, Snapshot)
  const sections = text.split(/^### /m).slice(1);
  const kept: string[] = [];
  for (const section of sections) {
    const nl = section.indexOf('\n');
    if (nl === -1) continue;
    const title = section.substring(0, nl).trim();
    const content = section.substring(nl + 1).trim();
    if (title === 'Result' || title === 'Error') kept.push(content);
  }

  if (preamble) return preamble;
  if (kept.length > 0) return kept.join('\n');
  return 'Done';
}

// --- Theme detection ---
if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
  document.body.classList.add("theme-dark");
}

// --- State ---

// Command history (for REPL input up/down)
const history: string[] = [];
let historyIndex: number = -1;

// Run state
let isRunning: boolean = false;
let currentRunLine: number = -1;
let runPassCount: number = 0;
let runFailCount: number = 0;
let lineResults: (string | null)[] = []; // "pass" | "fail" | null per line

// Step state
let stepLine: number = -1; // Next line to execute when stepping, -1 = not stepping

// File state
let currentFilename: string = "";

// Commands handled locally (not added to history, not sent to background)
const LOCAL_COMMANDS = new Set(["history", "clear", "reset"]);

// All commands for autocomplete
const COMMANDS = [
  "goto", "open", "click", "dblclick", "fill", "select",
  "check", "uncheck", "hover", "press", "snapshot",
  "screenshot", "eval", "go-back", "back", "go-forward", "forward",
  "reload", "verify-text", "verify-no-text", "verify-element",
  "verify-no-element", "verify-url", "verify-title",
  "export", "help", "history", "clear", "reset"
];

// --- Autocomplete ---

function updateGhostText(): void {
  const val = input.value.toLowerCase();
  if (!val || val.includes(" ")) {
    ghostText.textContent = "";
    return;
  }
  const match = COMMANDS.find(cmd => cmd.startsWith(val) && cmd !== val);
  if (match) {
    ghostText.style.paddingLeft = val.length + "ch";
    ghostText.textContent = match.slice(val.length);
  } else {
    ghostText.textContent = "";
  }
}

function clearGhostText(): void {
  ghostText.textContent = "";
}

let dropdownItems: string[] = [];
let dropdownIndex: number = -1;

function showDropdown(matches: string[]): void {
  dropdown.innerHTML = "";
  dropdownItems = matches;
  dropdownIndex = -1;
  for (let i = 0; i < matches.length; i++) {
    const div = document.createElement("div");
    div.className = "autocomplete-item";
    div.textContent = matches[i];
    div.addEventListener("mousedown", (e: MouseEvent) => {
      e.preventDefault();
      input.value = matches[i] + " ";
      hideDropdown();
      clearGhostText();
      input.focus();
    });
    dropdown.appendChild(div);
  }
  dropdown.hidden = false;
}

function hideDropdown(): void {
  dropdown.hidden = true;
  dropdown.innerHTML = "";
  dropdownItems = [];
  dropdownIndex = -1;
}

function updateDropdownHighlight(): void {
  const items = dropdown.querySelectorAll(".autocomplete-item");
  items.forEach((el, i) => {
    el.classList.toggle("active", i === dropdownIndex);
  });
}

// --- Output helpers ---

function addLine(text: string, className: string): void {
  const div = document.createElement("div");
  div.className = `line ${className}`;
  div.textContent = text;
  output.appendChild(div);
  output.scrollTop = output.scrollHeight;
}

function addCommand(text: string): void {
  addLine(text, "line-command");
}

function addSuccess(text: string): void {
  addLine(text, "line-success");
}

function addError(text: string): void {
  addLine(text, "line-error");
}

function addInfo(text: string): void {
  addLine(text, "line-info");
}

function addSnapshot(text: string): void {
  addLine(text, "line-snapshot");
}

function addScreenshot(base64: string): void {
  const dataUrl = "data:image/png;base64," + base64;

  const wrapper = document.createElement("div");
  wrapper.className = "screenshot-block";

  const img = document.createElement("img");
  img.src = dataUrl;
  img.addEventListener("click", () => {
    lightboxImg.src = dataUrl;
    lightbox.hidden = false;
  });
  wrapper.appendChild(img);

  const zoomHint = document.createElement("span");
  zoomHint.className = "screenshot-zoom-hint";
  zoomHint.textContent = "Click to enlarge";
  wrapper.appendChild(zoomHint);

  const actions = document.createElement("div");
  actions.className = "screenshot-actions";

  const saveBtnEl = document.createElement("button");
  saveBtnEl.className = "screenshot-btn";
  saveBtnEl.textContent = "Save";
  saveBtnEl.addEventListener("click", async () => {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: "screenshot-" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".png",
        types: [{ description: "PNG images", accept: { "image/png": [".png"] } }],
      });
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
    } catch (e: unknown) {
      if (e instanceof Error && e.name !== "AbortError") console.error("Save failed:", e);
    }
  });
  actions.appendChild(saveBtnEl);

  wrapper.appendChild(actions);

  output.appendChild(wrapper);
  output.scrollTop = output.scrollHeight;
}

function addComment(text: string): void {
  addLine(text, "line-comment");
}

function addCodeBlock(code: string): void {
  const wrapper = document.createElement("div");
  wrapper.className = "code-block";

  const copyBtn = document.createElement("button");
  copyBtn.className = "code-copy-btn";
  copyBtn.textContent = "Copy";
  copyBtn.addEventListener("click", () => {
    if (copyToClipboard(code)) {
      copyBtn.textContent = "Copied!";
      setTimeout(() => { copyBtn.textContent = "Copy"; }, 1500);
    }
  });
  wrapper.appendChild(copyBtn);

  const pre = document.createElement("pre");
  pre.className = "code-content";
  pre.textContent = code;
  wrapper.appendChild(pre);

  output.appendChild(wrapper);
  output.scrollTop = output.scrollHeight;
}

// --- Clipboard helper (navigator.clipboard blocked in DevTools panels) ---

function copyToClipboard(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand("copy");
    return true;
  } catch (_e) {
    return false;
  } finally {
    document.body.removeChild(textarea);
  }
}

// --- Editor helpers ---

function updateLineNumbers(): void {
  const lines = editor.value.split("\n");
  let html = "";
  for (let i = 0; i < lines.length; i++) {
    let cls = "";
    if (i === currentRunLine) {
      cls = "line-active";
    } else if (lineResults[i] === "pass") {
      cls = "line-pass";
    } else if (lineResults[i] === "fail") {
      cls = "line-fail";
    }
    html += `<div class="${cls}">${i + 1}</div>`;
  }
  lineNumbers.innerHTML = html;
  updateLineHighlight();
}

function updateLineHighlight(): void {
  if (currentRunLine >= 0) {
    // 8px padding + line index * 18px line-height, offset by scroll
    lineHighlight.style.top = (8 + currentRunLine * 18 - editor.scrollTop) + "px";
    lineHighlight.style.display = "block";
  } else {
    lineHighlight.style.display = "none";
  }
}

function syncScroll(): void {
  lineNumbers.scrollTop = editor.scrollTop;
  updateLineHighlight();
}

function updateFileInfo(): void {
  const lines = editor.value.split("\n");
  const count = lines.length;
  const name = currentFilename || "untitled.pw";
  fileInfo.textContent = `${name} \u2014 ${count} line${count !== 1 ? "s" : ""}`;
}

function updateButtonStates(): void {
  const hasContent = editor.value.trim().length > 0;
  copyBtn.disabled = !hasContent;
  saveBtn.disabled = !hasContent;
  exportBtn.disabled = !hasContent;
}

function appendToEditor(text: string): void {
  const current = editor.value;
  if (current && !current.endsWith("\n")) {
    editor.value += "\n";
  }
  editor.value += text;
  updateLineNumbers();
  updateFileInfo();
  updateButtonStates();
  editor.scrollTop = editor.scrollHeight;
}

function clearConsole(): void {
  output.innerHTML = "";
  runPassCount = 0;
  runFailCount = 0;
  updateConsoleStats();
}

function findNextExecutableLine(startFrom: number, lines: string[]): number {
  for (let i = startFrom; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed && !trimmed.startsWith("#")) return i;
  }
  return -1;
}

function updateConsoleStats(): void {
  if (runPassCount === 0 && runFailCount === 0) {
    consoleStats.textContent = "";
    return;
  }
  consoleStats.innerHTML =
    `<span class="pass-count">${runPassCount} passed</span> / ` +
    `<span class="fail-count">${runFailCount} failed</span>`;
}

// Editor input/scroll listeners
editor.addEventListener("input", () => {
  // Reset execution state when editor content changes
  stepLine = -1;
  currentRunLine = -1;
  lineResults = [];
  updateLineNumbers();
  updateFileInfo();
  updateButtonStates();
});
editor.addEventListener("scroll", syncScroll);

// --- Export helper ---

function exportFromLines(cmds: string[]): void {
  const lines = [
    `import { test, expect } from '@playwright/test';`,
    ``,
    `test('recorded session', async ({ page }) => {`,
  ];
  for (const cmd of cmds) {
    if (cmd.startsWith("#")) {
      lines.push(`  ${cmd.replace("#", "//")}`);
      continue;
    }
    const converted = pwToPlaywright(cmd);
    if (converted) {
      lines.push(`  ${converted}`);
    }
  }
  lines.push(`});`);

  const code = lines.join("\n");
  addCodeBlock(code);
}

// --- Active tab detection ---

async function getActiveTabUrl(): Promise<string | null> {
  try {
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    const tab = tabs[0];
    console.log('[panel] activeTab:', tab?.id, tab?.url);
    return tab?.url || null;
  } catch (_e) { console.error('[panel] tabs.query failed:', _e); return null; }
}

// --- Command execution (REPL ad-hoc) ---

async function executeCommand(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) return;

  // Skip comments
  if (trimmed.startsWith("#")) {
    addComment(trimmed);
    return;
  }

  // Handle local console commands (no background needed, not added to history)
  if (trimmed === "history") {
    if (history.length === 0) {
      addInfo("No command history.");
    } else {
      for (const cmd of history) {
        addInfo(cmd);
      }
    }
    return;
  }

  if (trimmed === "clear") {
    clearConsole();
    return;
  }

  if (trimmed === "reset") {
    history.length = 0;
    historyIndex = -1;
    clearConsole();
    addInfo("History and terminal cleared.");
    return;
  }

  // Handle export command locally (no CDP needed)
  if (trimmed === "export") {
    const editorLines = editor.value.split("\n").filter((l) => l.trim());
    if (editorLines.length === 0) {
      addInfo("Nothing to export. Add commands to the editor first.");
    } else {
      exportFromLines(editorLines);
    }
    return;
  }
  if (trimmed.startsWith("export ")) {
    const subCmd = trimmed.slice(7).trim();
    const converted = pwToPlaywright(subCmd);
    if (converted) {
      addCommand(trimmed);
      addLine(converted, "line-snapshot");
    } else {
      addError("Cannot convert: " + subCmd);
    }
    return;
  }

  addCommand(trimmed);

  try {
    const activeTabUrl = await getActiveTabUrl();
    const res = await fetch(`${SERVER_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: trimmed, activeTabUrl }),
    });
    const result: RunResult = await res.json();

    if (result.isError) {
      addError(result.text);
    } else {
      if (result.image) {
        addScreenshot(result.image.replace(/^data:image\/\w+;base64,/, ''));
      }
      const text = filterResponse(trimmed, result.text);
      if (text.includes("[ref=") || text.startsWith("- ")) {
        for (const line of text.split("\n")) {
          addSnapshot(line);
        }
      } else {
        addSuccess(text);
      }
    }
  } catch (_e) {
    addError("Not connected to server. Run: playwright-repl --extension");
  }
}

// --- Command execution for Run (with pass/fail tracking) ---

async function executeCommandForRun(raw: string): Promise<void> {
  const trimmed = raw.trim();
  if (!trimmed) return;

  // Handle comments
  if (trimmed.startsWith("#")) {
    addComment(trimmed);
    return;
  }

  addCommand(trimmed);

  try {
    const activeTabUrl = await getActiveTabUrl();
    const res = await fetch(`${SERVER_URL}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ raw: trimmed, activeTabUrl }),
    });
    const result: RunResult = await res.json();

    if (result.isError) {
      addError(result.text);
      lineResults[currentRunLine] = "fail";
      runFailCount++;
    } else {
      if (result.image) {
        addScreenshot(result.image.replace(/^data:image\/\w+;base64,/, ''));
      }
      const text = filterResponse(trimmed, result.text);
      if (text.includes("[ref=") || text.startsWith("- ")) {
        for (const line of text.split("\n")) {
          addSnapshot(line);
        }
      } else {
        addSuccess(text);
      }
      lineResults[currentRunLine] = "pass";
      runPassCount++;
    }
  } catch (_e) {
    addError("Not connected to server. Run: playwright-repl --extension");
    lineResults[currentRunLine] = "fail";
    runFailCount++;
  }
  updateConsoleStats();
  updateLineNumbers();
}

// --- REPL input handling ---

function selectDropdownItem(cmd: string): void {
  input.value = cmd + " ";
  hideDropdown();
  clearGhostText();
}

input.addEventListener("keydown", (e: KeyboardEvent) => {
  // When dropdown is visible, arrow keys navigate it
  if (!dropdown.hidden && dropdownItems.length > 0) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      dropdownIndex = (dropdownIndex + 1) % dropdownItems.length;
      updateDropdownHighlight();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      dropdownIndex = dropdownIndex <= 0 ? dropdownItems.length - 1 : dropdownIndex - 1;
      updateDropdownHighlight();
      return;
    }
    if (e.key === "Enter" && dropdownIndex >= 0) {
      e.preventDefault();
      selectDropdownItem(dropdownItems[dropdownIndex]);
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      if (dropdownIndex >= 0) {
        selectDropdownItem(dropdownItems[dropdownIndex]);
      } else if (dropdownItems.length > 0) {
        selectDropdownItem(dropdownItems[0]);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      hideDropdown();
      clearGhostText();
      return;
    }
  }

  if (e.key === "Enter") {
    const value = input.value;
    if (value.trim()) {
      const cmd = value.trim().toLowerCase();
      if (!LOCAL_COMMANDS.has(cmd)) {
        history.push(value);
        historyIndex = history.length;
      }
      executeCommand(value);
    }
    input.value = "";
    hideDropdown();
    clearGhostText();
  } else if (e.key === "Tab") {
    e.preventDefault();
    const val = input.value.toLowerCase().trim();
    if (val.includes(" ")) return;
    if (!val) {
      showDropdown(COMMANDS);
      return;
    }
    const matches = COMMANDS.filter(cmd => cmd.startsWith(val) && cmd !== val);
    if (matches.length === 1) {
      selectDropdownItem(matches[0]);
    } else if (matches.length > 1) {
      showDropdown(matches);
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      input.value = history[historyIndex];
    }
    hideDropdown();
    clearGhostText();
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    if (historyIndex < history.length - 1) {
      historyIndex++;
      input.value = history[historyIndex];
    } else {
      historyIndex = history.length;
      input.value = "";
    }
    hideDropdown();
    clearGhostText();
  } else if (e.key === "Escape") {
    hideDropdown();
    clearGhostText();
  } else if (e.key === " " && e.ctrlKey) {
    e.preventDefault();
    const val = input.value.toLowerCase().trim();
    if (val.includes(" ")) return;
    const matches = val
      ? COMMANDS.filter(cmd => cmd.startsWith(val) && cmd !== val)
      : COMMANDS;
    if (matches.length > 0) showDropdown(matches);
  }
});

input.addEventListener("input", () => {
  updateGhostText();
  // Auto-show dropdown while typing
  const val = input.value.toLowerCase().trim();
  if (!val || val.includes(" ")) {
    hideDropdown();
    return;
  }
  const matches = COMMANDS.filter(cmd => cmd.startsWith(val) && cmd !== val);
  if (matches.length > 1) {
    showDropdown(matches);
  } else {
    hideDropdown();
  }
});

// --- Editor keyboard shortcut ---

editor.addEventListener("keydown", (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    runBtn.click();
  }
});

// --- Run button ---

runBtn.addEventListener("click", async () => {
  if (isRunning) {
    isRunning = false;
    runBtn.textContent = "\u25B6";
    addInfo("Run stopped.");
    currentRunLine = -1;
    updateLineNumbers();
    return;
  }

  const content = editor.value;
  if (!content.trim()) {
    addInfo("Editor is empty. Open a .pw file or type commands.");
    return;
  }

  const lines = content.split("\n");
  const startLine = stepLine > 0 ? stepLine : 0;

  isRunning = true;
  stepBtn.disabled = true;
  runBtn.textContent = "\u25A0";

  // Only reset stats if starting fresh (not continuing from step)
  if (startLine === 0) {
    runPassCount = 0;
    runFailCount = 0;
    lineResults = new Array(lines.length).fill(null);
    updateConsoleStats();
  }

  addInfo(startLine > 0 ? "Continuing run from step..." : "Running script...");

  for (let i = startLine; i < lines.length; i++) {
    if (!isRunning) break;
    const line = lines[i].trim();

    // Skip empty lines and comments (comments shown but not counted)
    if (!line) continue;

    currentRunLine = i;
    updateLineNumbers();

    await executeCommandForRun(line);

    if (isRunning) await new Promise<void>((r) => setTimeout(r, 300));
  }

  isRunning = false;
  stepBtn.disabled = false;
  runBtn.textContent = "\u25B6";
  currentRunLine = -1;
  stepLine = -1;
  updateLineNumbers();
  addInfo("Run complete.");
});

// --- Step button ---

stepBtn.addEventListener("click", async () => {
  if (isRunning) return;

  const content = editor.value;
  if (!content.trim()) {
    addInfo("Editor is empty. Open a .pw file or type commands.");
    return;
  }

  const lines = content.split("\n");

  // Initialize step state on first click
  if (stepLine === -1) {
    stepLine = 0;
    lineResults = new Array(lines.length).fill(null);
    runPassCount = 0;
    runFailCount = 0;
    updateConsoleStats();
  }

  // Find next executable line from current step position
  const nextLine = findNextExecutableLine(stepLine, lines);

  if (nextLine === -1) {
    addInfo("Step complete. No more lines to execute.");
    stepLine = -1;
    currentRunLine = -1;
    updateLineNumbers();
    return;
  }

  // Execute the line
  stepBtn.disabled = true;
  currentRunLine = nextLine;
  updateLineNumbers();

  await executeCommandForRun(lines[nextLine]);

  stepLine = nextLine + 1;
  currentRunLine = nextLine; // Keep highlight on last stepped line
  updateLineNumbers();
  stepBtn.disabled = false;

  // Check if there are more executable lines
  if (findNextExecutableLine(stepLine, lines) === -1) {
    addInfo("Step complete. All lines executed.");
    stepLine = -1;
    currentRunLine = -1;
    updateLineNumbers();
  }
});

// --- Open button ---

openBtn.addEventListener("click", () => {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".pw,.txt";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      editor.value = reader.result as string;
      currentFilename = file.name;
      lineResults = [];
      updateLineNumbers();
      updateFileInfo();
      updateButtonStates();
      addInfo(`Opened ${file.name}`);
    };
    reader.readAsText(file);
  });
  fileInput.click();
});

// --- Save button ---

saveBtn.addEventListener("click", async () => {
  const content = editor.value;
  if (!content.trim()) {
    addInfo("Nothing to save.");
    return;
  }
  const defaultName =
    currentFilename || "commands-" + new Date().toISOString().slice(0, 10) + ".pw";
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: defaultName,
      types: [{ description: "PW command files", accept: { "text/plain": [".pw"] } }],
    });
    const writable = await handle.createWritable();
    await writable.write(content);
    await writable.close();
    currentFilename = handle.name;
    updateFileInfo();
    addSuccess("Saved as " + handle.name);
  } catch (e: unknown) {
    if (e instanceof Error && e.name !== "AbortError") addError("Save failed: " + e.message);
  }
});

// --- Export button ---

exportBtn.addEventListener("click", () => {
  const content = editor.value;
  if (!content.trim()) {
    addInfo("Nothing to export.");
    return;
  }
  const editorLines = content.split("\n").filter((l) => l.trim());
  exportFromLines(editorLines);
});

// --- Copy button ---

copyBtn.addEventListener("click", () => {
  const content = editor.value;
  if (!content.trim()) {
    addInfo("Nothing to copy.");
    return;
  }
  if (copyToClipboard(content)) {
    addSuccess("Editor content copied to clipboard.");
  } else {
    addError("Failed to copy to clipboard.");
  }
});

// --- Console header clear button ---

consoleClearBtn.addEventListener("click", clearConsole);

// --- Record button ---

let isRecording: boolean = false;

recordBtn.addEventListener("click", async () => {
  if (isRecording) {
    // Stop recording
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab) {
      chrome.runtime.sendMessage({ type: "pw-record-stop", tabId: tab.id });
    }
    recordBtn.classList.remove("recording");
    recordBtn.textContent = "Record";
    recordBtn.title = "Start recording user interactions";
    isRecording = false;
    addInfo("Recording stopped");
  } else {
    // Start recording
    const tabs = await tabsQuery({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab) {
      addError("No active tab found");
      return;
    }
    const result = await rtSendMessage({ type: "pw-record-start", tabId: tab.id }) as { ok?: boolean; error?: string } | undefined;
    if (result && !result.ok) {
      addError("Recording failed: " + (result.error || "unknown error"));
      return;
    }
    recordBtn.classList.add("recording");
    recordBtn.textContent = "Stop";
    recordBtn.title = "Stop recording";
    isRecording = true;
    addInfo("Recording on " + (tab.title || tab.url));
  }
});

// --- Receive recorded commands from content script ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "pw-recorded-command" && msg.command) {
    addCommand(msg.command);
    appendToEditor(msg.command);
  }
});

// --- Draggable splitter ---

let isDragging: boolean = false;
let dragStartY: number = 0;
let dragStartHeight: number = 0;

splitter.addEventListener("mousedown", (e: MouseEvent) => {
  isDragging = true;
  dragStartY = e.clientY;
  dragStartHeight = editorPane.offsetHeight;
  document.body.style.cursor = "row-resize";
  document.body.style.userSelect = "none";
  e.preventDefault();
});

document.addEventListener("mousemove", (e: MouseEvent) => {
  if (!isDragging) return;
  const delta = e.clientY - dragStartY;
  const newHeight = dragStartY === 0 ? dragStartHeight : dragStartHeight + delta;
  const minEditor = 80;
  const bodyHeight = document.body.offsetHeight;
  const fixedHeight =
    (document.getElementById("toolbar") as HTMLDivElement).offsetHeight +
    splitter.offsetHeight +
    (document.getElementById("console-header") as HTMLDivElement).offsetHeight +
    (document.getElementById("input-bar") as HTMLDivElement).offsetHeight;
  const maxEditor = bodyHeight - fixedHeight - 80;
  editorPane.style.flex = `0 0 ${Math.max(minEditor, Math.min(maxEditor, newHeight))}px`;
});

document.addEventListener("mouseup", () => {
  if (!isDragging) return;
  isDragging = false;
  document.body.style.cursor = "";
  document.body.style.userSelect = "";
});

// --- Lightbox ---

lightbox.addEventListener("click", (e: MouseEvent) => {
  // Only close when clicking the backdrop, not the image or save button
  if (e.target === lightbox) {
    lightbox.hidden = true;
    lightboxImg.src = "";
  }
});

lightboxCloseBtn.addEventListener("click", () => {
  lightbox.hidden = true;
  lightboxImg.src = "";
});

lightboxSaveBtn.addEventListener("click", async () => {
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: "screenshot-" + new Date().toISOString().slice(0, 19).replace(/:/g, "-") + ".png",
      types: [{ description: "PNG images", accept: { "image/png": [".png"] } }],
    });
    const res = await fetch(lightboxImg.src);
    const blob = await res.blob();
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
  } catch (e: unknown) {
    if (e instanceof Error && e.name !== "AbortError") console.error("Save failed:", e);
  }
});

document.addEventListener("keydown", (e: KeyboardEvent) => {
  if (e.key === "Escape" && !lightbox.hidden) {
    e.stopPropagation();
    e.preventDefault();
    lightbox.hidden = true;
    lightboxImg.src = "";
  }
});

// --- Init ---

updateLineNumbers();
updateFileInfo();
updateButtonStates();
editor.focus();

// Health check — verify server is running and show version
(async () => {
  try {
    const res = await fetch(`${SERVER_URL}/health`);
    if (res.ok) {
      const data = await res.json();
      addInfo(`Playwright REPL v${data.version || '?'}`);
      addInfo("Connected to server on port " + SERVER_PORT);
    } else {
      addError("Server returned status " + res.status);
    }
  } catch {
    addError("Server not running. Start with: playwright-repl --extension");
  }
})();
