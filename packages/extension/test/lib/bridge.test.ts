import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { attachToTab, executeCommand, executeCommandForConsole } from '@/lib/bridge';

vi.mock('@/lib/sw-debugger', () => ({
    swDebugEval: vi.fn(),
    swCallFunctionOn: vi.fn(),
}));

vi.mock('@/lib/execute', () => ({
    detectMode: vi.fn(),
}));

vi.mock('@/lib/commands', async (importOriginal) => {
    const actual = await importOriginal() as any;
    return { ...actual, parseReplCommand: vi.fn(actual.parseReplCommand) };
});

import { swDebugEval, swCallFunctionOn } from '@/lib/sw-debugger';
import { detectMode } from '@/lib/execute';
import { parseReplCommand } from '@/lib/commands';

describe('bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  // ─── attachToTab ──────────────────────────────────────────────────────────

  it('attachToTab sends attach message and returns result', async () => {
    const expected = { ok: true, url: 'https://example.com' };
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

    const result = await attachToTab(42);

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'attach', tabId: 42 });
    expect(result).toEqual(expected);
  });

  it('attachToTab returns failure from background', async () => {
    const expected = { ok: false, error: 'Cannot attach to internal pages' };
    (chrome.runtime.sendMessage as ReturnType<typeof vi.fn>).mockResolvedValue(expected);

    const result = await attachToTab(1);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('Cannot attach');
  });

});

// ─── executeCommand ──────────────────────────────────────────────────────────

describe('executeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('returns help text for help commands', async () => {
    vi.mocked(parseReplCommand).mockReturnValueOnce({ help: 'Usage: click <text|ref>' });
    const result = await executeCommand('help click');
    expect(result).toEqual({ text: 'Usage: click <text|ref>', isError: false });
  });

  it('evaluates known keyword command via swDebugEval', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'undefined' } });
    const result = await executeCommand('snapshot');
    expect(swDebugEval).toHaveBeenCalled();
    expect(result).toEqual({ text: 'Done', isError: false });
  });

  it('returns error when keyword command throws', async () => {
    vi.mocked(swDebugEval).mockRejectedValue(new Error('Target closed'));
    const result = await executeCommand('snapshot');
    expect(result).toEqual({ text: 'Target closed', isError: true });
  });

  it('formats string result from keyword command', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'string', value: 'Hello' } });
    const result = await executeCommand('snapshot');
    expect(result).toEqual({ text: 'Hello', isError: false });
  });

  it('formats number result from keyword command', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'number', value: 42 } });
    const result = await executeCommand('snapshot');
    expect(result).toEqual({ text: '42', isError: false });
  });

  it('formats boolean result from keyword command', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'boolean', value: true } });
    const result = await executeCommand('snapshot');
    expect(result).toEqual({ text: 'true', isError: false });
  });

  it('formats image result from keyword command', async () => {
    const imgJson = JSON.stringify({ __image: 'base64data', mimeType: 'image/png' });
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'string', value: imgJson } });
    const result = await executeCommand('screenshot');
    expect(result.image).toBe('data:image/png;base64,base64data');
    expect(result.isError).toBe(false);
  });

  it('formats object result via swCallFunctionOn', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'object', objectId: 'obj-1', description: 'Object' } });
    vi.mocked(swCallFunctionOn).mockResolvedValue({ result: { value: '{"a":1}' } });
    const result = await executeCommand('snapshot');
    expect(result).toEqual({ text: '{"a":1}', isError: false });
  });

  it('falls back to description when swCallFunctionOn returns empty', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'object', objectId: 'obj-1', description: 'Map(3)' } });
    vi.mocked(swCallFunctionOn).mockResolvedValue({ result: { value: '' } });
    const result = await executeCommand('snapshot');
    expect(result).toEqual({ text: 'Map(3)', isError: false });
  });

  it('falls back to description when swCallFunctionOn throws', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'object', objectId: 'obj-1', description: 'WeakRef' } });
    vi.mocked(swCallFunctionOn).mockRejectedValue(new Error('gone'));
    const result = await executeCommand('snapshot');
    expect(result).toEqual({ text: 'WeakRef', isError: false });
  });

  // ─── Non-keyword commands (detectMode routing) ──────────────────────────

  it('evaluates js mode via swDebugEval', async () => {
    vi.mocked(detectMode).mockReturnValue('js');
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'string', value: 'ok' } });
    const result = await executeCommand('page.title()');
    expect(result).toEqual({ text: 'ok', isError: false });
  });

  it('returns error when js mode throws', async () => {
    vi.mocked(detectMode).mockReturnValue('js');
    vi.mocked(swDebugEval).mockRejectedValue(new Error('page crashed'));
    const result = await executeCommand('page.title()');
    expect(result).toEqual({ text: 'page crashed', isError: true });
  });

  it('returns parse error for pw mode (unknown bare word)', async () => {
    vi.mocked(detectMode).mockReturnValue('pw');
    const result = await executeCommand('unknowncmd foo');
    expect(result.isError).toBe(true);
    expect(result.text).toBeTruthy();
  });
});

// ─── executeCommandForConsole ────────────────────────────────────────────────

describe('executeCommandForConsole', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('throws for unknown commands', async () => {
    await expect(executeCommandForConsole('page.title()')).rejects.toThrow();
  });

  it('returns help text for help commands', async () => {
    vi.mocked(parseReplCommand).mockReturnValueOnce({ help: 'Usage: click <text|ref>' });
    const result = await executeCommandForConsole('help click');
    expect('text' in result && result.text).toBe('Usage: click <text|ref>');
  });

  it('returns text "Done" for undefined result', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'undefined' } });
    const result = await executeCommandForConsole('snapshot');
    expect(result).toEqual({ text: 'Done' });
  });

  it('returns string result as text', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'string', value: 'hello' } });
    const result = await executeCommandForConsole('snapshot');
    expect(result).toEqual({ text: 'hello' });
  });

  it('returns image result', async () => {
    const imgJson = JSON.stringify({ __image: 'abc', mimeType: 'image/png' });
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'string', value: imgJson } });
    const result = await executeCommandForConsole('screenshot');
    expect('image' in result && result.image).toBe('data:image/png;base64,abc');
  });

  it('returns number result as text', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'number', value: 99 } });
    const result = await executeCommandForConsole('snapshot');
    expect(result).toEqual({ text: '99' });
  });

  it('returns boolean result as text', async () => {
    vi.mocked(swDebugEval).mockResolvedValue({ result: { type: 'boolean', value: false } });
    const result = await executeCommandForConsole('snapshot');
    expect(result).toEqual({ text: 'false' });
  });

  it('returns cdpResult for object type', async () => {
    const obj = { type: 'object', objectId: 'obj-1', className: 'Array', subtype: 'array' };
    vi.mocked(swDebugEval).mockResolvedValue({ result: obj });
    const result = await executeCommandForConsole('snapshot');
    expect('cdpResult' in result && result.cdpResult).toEqual(obj);
  });
});
