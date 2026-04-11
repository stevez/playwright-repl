/**
 * REPL webview script — handles input, output rendering, command history,
 * and autocomplete dropdown for .pw commands.
 */

import { vscode } from './common';

const output = document.getElementById('output')!;
const input = document.getElementById('command-input') as HTMLTextAreaElement;
const dropdown = document.getElementById('autocomplete-dropdown')!;

let commandHistory: string[] = [];
let commandHistoryIndex = -1;
let savedInput = '';

// ─── Autocomplete state ──────────────────────────────────────────────────

interface CompletionItem { cmd: string; desc: string; }

let completionItems: CompletionItem[] = [];
let filteredItems: CompletionItem[] = [];
let selectedIndex = 0;
let dropdownVisible = false;

function showDropdown(items: CompletionItem[]) {
  filteredItems = items;
  selectedIndex = 0;
  dropdown.innerHTML = '';
  for (let i = 0; i < items.length; i++) {
    const el = document.createElement('div');
    el.className = 'ac-item' + (i === 0 ? ' ac-selected' : '');
    el.innerHTML = `<span class="ac-cmd">${escapeHtml(items[i].cmd)}</span><span class="ac-desc">${escapeHtml(items[i].desc)}</span>`;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault(); // prevent blur
      acceptCompletion(i);
    });
    dropdown.appendChild(el);
  }
  dropdown.classList.add('visible');
  dropdownVisible = true;
}

function hideDropdown() {
  dropdown.classList.remove('visible');
  dropdown.innerHTML = '';
  dropdownVisible = false;
  filteredItems = [];
}

function updateSelection(newIndex: number) {
  const items = dropdown.querySelectorAll('.ac-item');
  if (items[selectedIndex]) items[selectedIndex].classList.remove('ac-selected');
  selectedIndex = Math.max(0, Math.min(newIndex, filteredItems.length - 1));
  if (items[selectedIndex]) {
    items[selectedIndex].classList.add('ac-selected');
    items[selectedIndex].scrollIntoView({ block: 'nearest' });
  }
}

function acceptCompletion(index?: number) {
  const idx = index ?? selectedIndex;
  if (idx < 0 || idx >= filteredItems.length) return;
  const item = filteredItems[idx];
  // Replace the current word with the completed command
  const prefix = getCurrentWord();
  const before = input.value.slice(0, input.selectionStart - prefix.length);
  const after = input.value.slice(input.selectionStart);
  input.value = before + item.cmd + (after || ' ');
  input.selectionStart = input.selectionEnd = before.length + item.cmd.length + (after ? 0 : 1);
  hideDropdown();
  input.focus();
}

function getCurrentWord(): string {
  const text = input.value.slice(0, input.selectionStart);
  // Find word start (from cursor back to start or last space/newline)
  const match = text.match(/[\w.\-]+$/);
  return match ? match[0] : '';
}

function updateAutocomplete() {
  const word = getCurrentWord();
  if (word.length === 0 || input.value.includes('\n')) {
    hideDropdown();
    return;
  }
  const lower = word.toLowerCase();
  const matches = completionItems.filter(item => item.cmd.toLowerCase().startsWith(lower) && item.cmd !== word);
  if (matches.length === 0) {
    hideDropdown();
    return;
  }
  // Limit to 12 items to keep dropdown manageable
  showDropdown(matches.slice(0, 12));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Input handling ───────────────────────────────────────────────────────

input.addEventListener('keydown', (e: KeyboardEvent) => {
  // Autocomplete takes priority when visible
  if (dropdownVisible) {
    if (e.key === 'ArrowDown') { e.preventDefault(); updateSelection(selectedIndex + 1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); updateSelection(selectedIndex - 1); return; }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); acceptCompletion(); return; }
    if (e.key === 'Escape') { e.preventDefault(); hideDropdown(); return; }
  }

  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    hideDropdown();
    const command = input.value.trim();
    if (!command) return;
    appendLine(command, 'command');
    vscode.postMessage({ method: 'execute', params: { command } });
    commandHistory.unshift(command);
    if (commandHistory.length > 100) commandHistory.pop();
    commandHistoryIndex = -1;
    savedInput = '';
    input.value = '';
    resetHeight();
  } else if (e.key === 'ArrowUp' && input.selectionStart === 0 && !input.value.includes('\n')) {
    e.preventDefault();
    if (commandHistoryIndex < commandHistory.length - 1) {
      if (commandHistoryIndex === -1) savedInput = input.value;
      commandHistoryIndex++;
      input.value = commandHistory[commandHistoryIndex]!;
    }
  } else if (e.key === 'ArrowDown' && input.selectionEnd === input.value.length && !input.value.includes('\n')) {
    e.preventDefault();
    if (commandHistoryIndex > 0) {
      commandHistoryIndex--;
      input.value = commandHistory[commandHistoryIndex]!;
    } else if (commandHistoryIndex === 0) {
      commandHistoryIndex = -1;
      input.value = savedInput;
    }
  }
});

input.addEventListener('input', () => {
  updateAutocomplete();
});

input.addEventListener('blur', () => {
  // Delay to allow mousedown on dropdown items
  setTimeout(hideDropdown, 150);
});

function resetHeight() {
  input.style.height = 'auto';
}


// ─── Messages from extension ──────────────────────────────────────────────

window.addEventListener('message', event => {
  const { method, params } = event.data;

  if (method === 'output') {
    appendLine(params.text, params.type);
  } else if (method === 'image') {
    const img = document.createElement('img');
    img.src = params.dataUri;
    img.style.maxWidth = '100%';
    img.style.margin = '4px 0';
    output.appendChild(img);
    output.scrollTop = output.scrollHeight;
  } else if (method === 'pdf') {
    const row = document.createElement('div');
    row.className = 'line line-info';
    row.textContent = 'PDF generated. ';
    const btn = document.createElement('button');
    btn.textContent = 'Save PDF';
    btn.style.cssText = 'cursor:pointer; background:var(--vscode-button-background); color:var(--vscode-button-foreground); border:none; padding:2px 8px; border-radius:2px;';
    btn.onclick = () => vscode.postMessage({ method: 'savePdf', params: { dataUri: params.dataUri } });
    row.appendChild(btn);
    output.appendChild(row);
    output.scrollTop = output.scrollHeight;
  } else if (method === 'clear') {
    output.textContent = '';
  } else if (method === 'processing') {
    input.disabled = params.processing;
    if (!params.processing) input.focus();
  } else if (method === 'history') {
    commandHistory = params.history;
  } else if (method === 'completionItems') {
    completionItems = params.items;
  }
});

// ─── Output rendering ─────────────────────────────────────────────────────

function appendLine(text: string, type: 'command' | 'output' | 'error' | 'info') {
  const lines = text.split('\n');
  for (const line of lines) {
    const el = document.createElement('div');
    el.className = `line line-${type}`;
    el.textContent = line;
    output.appendChild(el);
  }
  output.scrollTop = output.scrollHeight;
}

// Request history on load
vscode.postMessage({ method: 'getHistory' });
