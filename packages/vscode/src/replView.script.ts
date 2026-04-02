/**
 * REPL webview script — handles input, output rendering, and command history.
 */

import { vscode } from './common';

const output = document.getElementById('output')!;
const input = document.getElementById('command-input') as HTMLTextAreaElement;

let history: string[] = [];
let historyIndex = -1;
let savedInput = '';

// ─── Input handling ───────────────────────────────────────────────────────

input.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    const command = input.value.trim();
    if (!command) return;
    appendLine(command, 'command');
    vscode.postMessage({ method: 'execute', params: { command } });
    history.unshift(command);
    if (history.length > 100) history.pop();
    historyIndex = -1;
    savedInput = '';
    input.value = '';
    resetHeight();
  } else if (e.key === 'ArrowUp' && input.selectionStart === 0 && !input.value.includes('\n')) {
    e.preventDefault();
    if (historyIndex < history.length - 1) {
      if (historyIndex === -1) savedInput = input.value;
      historyIndex++;
      input.value = history[historyIndex]!;
    }
  } else if (e.key === 'ArrowDown' && input.selectionEnd === input.value.length && !input.value.includes('\n')) {
    e.preventDefault();
    if (historyIndex > 0) {
      historyIndex--;
      input.value = history[historyIndex]!;
    } else if (historyIndex === 0) {
      historyIndex = -1;
      input.value = savedInput;
    }
  }
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
    history = params.history;
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
