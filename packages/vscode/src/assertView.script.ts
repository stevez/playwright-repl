/**
 * Assert Builder webview script.
 */

import { vscode } from './common';

const pickBtn = document.getElementById('pickBtn') as HTMLButtonElement;
const locatorInput = document.getElementById('locator') as HTMLInputElement;
const ariaPreview = document.getElementById('ariaPreview') as HTMLTextAreaElement;
const assertType = document.getElementById('assertType') as HTMLSelectElement;
const negateCheckbox = document.getElementById('negateCheckbox') as HTMLInputElement;
const argInput = document.getElementById('argInput') as HTMLInputElement;
const locatorMode = document.getElementById('locatorMode')!;
const snapshotMode = document.getElementById('snapshotMode')!;
const assertionInput = document.getElementById('assertion') as HTMLTextAreaElement;
const verifyBtn = document.getElementById('verifyBtn') as HTMLButtonElement;
const verifyResult = document.getElementById('verifyResult')!;
const modeRadios = document.querySelectorAll<HTMLInputElement>('input[name="assertMode"]');

let types: { value: string; label: string; needsArg: boolean; argType?: string }[] = [];
let currentLocator = '';
let currentMode: 'locator' | 'snapshot' = 'locator';

// ─── Mode switching ──────────────────────────────────────────────────────

function switchMode(mode: 'locator' | 'snapshot') {
  currentMode = mode;
  locatorMode.style.display = mode === 'locator' ? 'block' : 'none';
  snapshotMode.style.display = mode === 'snapshot' ? 'block' : 'none';
  rebuild();
}

for (const radio of modeRadios) {
  radio.addEventListener('change', () => {
    if (radio.checked) switchMode(radio.value as 'locator' | 'snapshot');
  });
}

// ─── Event handlers ───────────────────────────────────────────────────────

pickBtn.addEventListener('click', () => {
  vscode.postMessage({ method: 'pick' });
});

function rebuild() {
  if (currentMode === 'snapshot') {
    vscode.postMessage({ method: 'rebuildSnapshot', params: { snapshot: ariaPreview.value, negate: negateCheckbox.checked } });
  } else {
    const typeDef = types.find(t => t.value === assertType.value);
    const needsArg = typeDef?.needsArg ?? false;
    argInput.style.display = needsArg ? 'block' : 'none';
    argInput.placeholder = typeDef?.argType === 'pair' ? 'attribute, value' :
      typeDef?.argType === 'number' ? 'Count' : 'Expected value';
    vscode.postMessage({ method: 'rebuild', params: { type: assertType.value, arg: argInput.value, negate: negateCheckbox.checked } });
  }
}

assertType.addEventListener('change', rebuild);
argInput.addEventListener('input', rebuild);
negateCheckbox.addEventListener('change', rebuild);

locatorInput.addEventListener('input', () => {
  currentLocator = locatorInput.value;
  vscode.postMessage({ method: 'locatorChanged', params: { locator: locatorInput.value } });
  rebuild();
});

verifyBtn.addEventListener('click', () => {
  vscode.postMessage({ method: 'verify', params: { assertion: assertionInput.value } });
});

// ─── Messages from extension ──────────────────────────────────────────────

window.addEventListener('message', event => {
  const { method, params } = event.data;

  if (method === 'init') {
    populateTypes(params.types);
  } else if (method === 'update') {
    currentLocator = params.locator;
    locatorInput.value = params.locator;
    assertionInput.value = params.assertion;
    autoSizeAssertion();
    if (params.ariaSnapshot)
      ariaPreview.value = params.ariaSnapshot;
    if (params.types) populateTypes(params.types);
    detectType(params.assertion);
    verifyResult.style.display = 'none';
  } else if (method === 'assertionUpdated') {
    assertionInput.value = params.assertion;
    autoSizeAssertion();
    verifyResult.style.display = 'none';
  } else if (method === 'verifyProcessing') {
    verifyBtn.disabled = params.processing;
    verifyBtn.textContent = params.processing ? 'Verifying...' : 'Verify';
    if (params.processing) {
      verifyResult.style.display = 'inline';
      verifyResult.textContent = '...';
      verifyResult.style.color = 'var(--vscode-descriptionForeground)';
    }
  } else if (method === 'verifyResult') {
    verifyResult.style.display = 'inline';
    if (params.passed) {
      verifyResult.textContent = '✓ Passed';
      verifyResult.style.color = 'var(--vscode-terminal-ansiGreen)';
      verifyResult.title = '';
    } else {
      const full = (params.error || 'Assertion failed').replace(/^### \w[\w ]*\n/gm, '').trim();
      const expectedMatch = full.match(/Expected\s*(?:string)?:\s*(.+)/);
      const receivedMatch = full.match(/Received\s*(?:string)?:\s*(.+)/);
      const timeoutMatch = full.match(/Timed out (\d+)ms/);
      let short: string;
      if (expectedMatch && receivedMatch) {
        short = `expected: ${expectedMatch[1].trim()}, received: ${receivedMatch[1].trim()}`;
      } else if (timeoutMatch) {
        short = `Timed out (${timeoutMatch[1]}ms)`;
      } else {
        const msgMatch = full.match(/Error:\s*(.+?)(?:\n|$)/);
        short = msgMatch ? msgMatch[1].trim() : (full.split('\n')[0] || 'Assertion failed');
      }
      if (short.length > 80) short = short.slice(0, 80) + '...';
      verifyResult.textContent = '✗ ' + short;
      verifyResult.style.color = 'var(--vscode-terminal-ansiRed)';
      verifyResult.title = full;
    }
  }
});

function autoSizeAssertion() {
  const lines = assertionInput.value.split('\n').length;
  assertionInput.rows = Math.max(2, Math.min(lines + 1, 12));
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function populateTypes(t: typeof types) {
  types = t;
  assertType.innerHTML = '';
  for (const type of types) {
    const opt = document.createElement('option');
    opt.value = type.value;
    opt.textContent = type.label;
    assertType.appendChild(opt);
  }
}

function detectType(assertion: string) {
  if (assertion.includes('.toMatchAriaSnapshot(')) {
    // Switch to snapshot mode
    (document.querySelector('input[name="assertMode"][value="snapshot"]') as HTMLInputElement).checked = true;
    switchMode('snapshot');
    return;
  }
  for (const type of types) {
    if (assertion.includes(`.${type.value}(`)) {
      assertType.value = type.value;
      // Stay in locator mode
      (document.querySelector('input[name="assertMode"][value="locator"]') as HTMLInputElement).checked = true;
      switchMode('locator');
      return;
    }
  }
}
