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
    const prefix = input.value.slice(0, input.selectionStart);
    const matchLen = prefix.length;
    const cmd = items[i].cmd;
    const highlighted = `<b>${escapeHtml(cmd.slice(0, matchLen))}</b>${escapeHtml(cmd.slice(matchLen))}`;
    el.innerHTML = `<span class="ac-cmd">${highlighted}</span><span class="ac-desc">${escapeHtml(items[i].desc)}</span>`;
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
  // Replace entire input with the completed command + trailing space
  input.value = item.cmd + ' ';
  input.selectionStart = input.selectionEnd = input.value.length;
  hideDropdown();
  input.focus();
}

function updateAutocomplete() {
  const text = input.value.slice(0, input.selectionStart);
  if (text.length === 0 || input.value.includes('\n')) {
    hideDropdown();
    return;
  }
  // Match against full input — same logic as CLI ghost completion:
  // when input contains a space, only match commands that also contain a space
  const candidates = text.includes(' ')
    ? completionItems.filter(item => item.cmd.includes(' '))
    : completionItems;
  const matches = candidates.filter(item => item.cmd.startsWith(text) && item.cmd !== text);
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
  } else if (method === 'structuredOutput') {
    output.appendChild(renderValue(params.data, true));
    output.scrollTop = output.scrollHeight;
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

// ─── Object tree rendering ───────────────────────────────────────────────

function renderValue(value: unknown, topLevel = false): HTMLElement {
  if (value === null) {
    const span = document.createElement('span');
    span.className = 'obj-null';
    span.textContent = 'null';
    return span;
  }
  if (value === undefined) {
    const span = document.createElement('span');
    span.className = 'obj-null';
    span.textContent = 'undefined';
    return span;
  }
  if (typeof value === 'string') {
    const span = document.createElement('span');
    span.className = 'obj-string';
    span.textContent = `"${value}"`;
    return span;
  }
  if (typeof value === 'number') {
    const span = document.createElement('span');
    span.className = 'obj-number';
    span.textContent = String(value);
    return span;
  }
  if (typeof value === 'boolean') {
    const span = document.createElement('span');
    span.className = 'obj-boolean';
    span.textContent = String(value);
    return span;
  }
  if (Array.isArray(value)) {
    return renderCollapsible(`Array(${value.length})`, value, topLevel, (v, container) => {
      for (let i = 0; i < v.length; i++) {
        const row = document.createElement('div');
        row.className = 'obj-row';
        const key = document.createElement('span');
        key.className = 'obj-key';
        key.textContent = `${i}: `;
        row.appendChild(key);
        row.appendChild(renderValue(v[i]));
        container.appendChild(row);
      }
    });
  }
  if (typeof value === 'object') {
    const keys = Object.keys(value as Record<string, unknown>);
    const preview = keys.slice(0, 3).map(k => `${k}: …`).join(', ');
    const label = `{${preview}${keys.length > 3 ? ', …' : ''}}`;
    return renderCollapsible(label, value as Record<string, unknown>, topLevel, (v, container) => {
      for (const k of Object.keys(v)) {
        const row = document.createElement('div');
        row.className = 'obj-row';
        const key = document.createElement('span');
        key.className = 'obj-key';
        key.textContent = `${k}: `;
        row.appendChild(key);
        row.appendChild(renderValue((v as Record<string, unknown>)[k]));
        container.appendChild(row);
      }
    });
  }
  // Fallback
  const span = document.createElement('span');
  span.textContent = String(value);
  return span;
}

function renderCollapsible<T>(
  label: string,
  data: T,
  open: boolean,
  populate: (data: T, container: HTMLElement) => void,
): HTMLElement {
  const details = document.createElement('details');
  details.className = 'obj-tree line';
  if (open) details.open = true;

  const summary = document.createElement('summary');
  summary.textContent = label;
  details.appendChild(summary);

  // Lazy: populate children on first open
  let populated = false;
  if (open) {
    populate(data, details);
    populated = true;
  }
  details.addEventListener('toggle', () => {
    if (details.open && !populated) {
      populate(data, details);
      populated = true;
    }
  });

  return details;
}

// Request history on load
vscode.postMessage({ method: 'getHistory' });
