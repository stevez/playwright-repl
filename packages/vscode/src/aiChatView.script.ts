/**
 * AI Chat webview script — renders streaming AI responses, tool calls, and status.
 */

import { vscode } from './common';

const messages = document.getElementById('messages')!;
const chatInput = document.getElementById('chat-input') as HTMLTextAreaElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;

let currentAiMessage: HTMLElement | null = null;
let isRunning = false;

// ─── Input handling ──────────────────────────────────────────────────────────

chatInput.addEventListener('keydown', (e: KeyboardEvent) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

sendBtn.addEventListener('click', sendMessage);

cancelBtn.addEventListener('click', () => {
  vscode.postMessage({ method: 'cancel' });
});

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text && !isRunning) {
    // Empty prompt = auto fix/polish/review
    vscode.postMessage({ method: 'send', params: { prompt: '' } });
    return;
  }
  if (isRunning) return;
  vscode.postMessage({ method: 'send', params: { prompt: text } });
  chatInput.value = '';
}

// ─── Messages from extension ─────────────────────────────────────────────────

window.addEventListener('message', event => {
  const { method, params } = event.data;

  if (method === 'userMessage') {
    appendUserMessage(params.text);
    currentAiMessage = null;
  } else if (method === 'agentEvent') {
    handleAgentEvent(params);
  } else if (method === 'running') {
    isRunning = params.running;
    chatInput.disabled = isRunning;
    sendBtn.style.display = isRunning ? 'none' : '';
    cancelBtn.style.display = isRunning ? '' : 'none';
    if (!isRunning) chatInput.focus();
  } else if (method === 'clear') {
    messages.innerHTML = '';
    currentAiMessage = null;
  }
});

// ─── Event handlers ──────────────────────────────────────────────────────────

function handleAgentEvent(event: any) {
  switch (event.type) {
    case 'text':
      if (!currentAiMessage) {
        currentAiMessage = document.createElement('div');
        currentAiMessage.className = 'msg msg-ai';
        messages.appendChild(currentAiMessage);
      }
      currentAiMessage.textContent += event.value;
      scrollToBottom();
      break;

    case 'toolCallStart':
      appendToolCall(event.name, event.input, event.callId);
      break;

    case 'toolCallEnd':
      updateToolResult(event.callId, event.result);
      break;

    case 'iteration':
      appendStatus(`Iteration ${event.current}/${event.max}`);
      currentAiMessage = null; // reset for next AI response
      break;

    case 'verifyStart':
      appendStatus(`Verifying: "${event.testName}"...`);
      break;

    case 'verifyEnd':
      appendStatus(event.passed
        ? `\u2713 Test passed: "${event.testName}"`
        : `\u2717 Test failed: "${event.testName}"`
      );
      break;

    case 'codeApplied':
      appendStatus('\u2713 Code applied to editor.');
      break;

    case 'done':
      appendStatus(event.summary);
      currentAiMessage = null;
      break;

    case 'error':
      appendError(event.message);
      currentAiMessage = null;
      break;
  }
}

// ─── Rendering helpers ───────────────────────────────────────────────────────

function appendUserMessage(text: string) {
  const el = document.createElement('div');
  el.className = 'msg msg-user';
  el.textContent = text;
  messages.appendChild(el);
  scrollToBottom();
}

function appendStatus(text: string) {
  const el = document.createElement('div');
  el.className = 'msg msg-status';
  el.textContent = text;
  messages.appendChild(el);
  scrollToBottom();
}

function appendError(text: string) {
  const el = document.createElement('div');
  el.className = 'msg msg-error';
  el.textContent = `Error: ${text}`;
  messages.appendChild(el);
  scrollToBottom();
}

function appendToolCall(name: string, input: Record<string, unknown>, callId: string) {
  const details = document.createElement('details');
  details.className = 'msg msg-tool';
  details.setAttribute('data-call-id', callId);

  const summary = document.createElement('summary');
  const inputStr = Object.keys(input).length > 0
    ? ` ${JSON.stringify(input)}`
    : '';
  summary.textContent = `\u2192 ${name}${inputStr}`;
  details.appendChild(summary);

  // Placeholder for result
  const resultDiv = document.createElement('div');
  resultDiv.className = 'tool-result';
  resultDiv.textContent = 'Running...';
  details.appendChild(resultDiv);

  messages.appendChild(details);
  scrollToBottom();
}

function updateToolResult(callId: string, result: string) {
  const details = messages.querySelector(`[data-call-id="${callId}"]`);
  if (!details) return;
  const resultDiv = details.querySelector('.tool-result');
  if (resultDiv) {
    resultDiv.textContent = result;
  }
  // Update summary to show completion
  const summary = details.querySelector('summary');
  if (summary) {
    summary.textContent = summary.textContent!.replace('\u2192', '\u2713');
  }
}

function scrollToBottom() {
  messages.scrollTop = messages.scrollHeight;
}

// ─── Focus input on load ─────────────────────────────────────────────────────

chatInput.focus();
