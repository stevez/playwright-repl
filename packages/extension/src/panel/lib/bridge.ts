export type CommandResult = { text: string; isError: boolean; image?: string };
export type { CdpRemoteObject } from '@/components/Console/cdpToSerialized';
import type { CdpRemoteObject } from '@/components/Console/cdpToSerialized';
import { parseReplCommand } from './commands';
import { loadSettings } from './settings';
export type ConsoleCommandResult = { cdpResult: CdpRemoteObject } | { text: string; image?: string; video?: string; duration?: number; size?: number; trace?: boolean; traceSize?: number };

type CdpResult = { type?: string; value?: unknown; description?: string; objectId?: string };

export async function executeCommand(command: string): Promise<CommandResult> {
  // Video/tracing capture — bypass parseReplCommand, send directly to SW
  const cmdName = command.trim().split(/\s+/)[0].toLowerCase();
  if (cmdName === 'video-start' || cmdName === 'video-stop') {
    const r = await chrome.runtime.sendMessage({ type: cmdName });
    if (!r?.ok) return { text: r?.error || 'Failed', isError: true };
    return { text: cmdName === 'video-start' ? 'Video recording started' : 'Video recording stopped', isError: false };
  }
  if (cmdName === 'tracing-start' || cmdName === 'tracing-stop') {
    const r = await chrome.runtime.sendMessage({ type: cmdName });
    if (!r?.ok) return { text: r?.error || 'Failed', isError: true };
    return { text: r.text || (cmdName === 'tracing-start' ? 'Tracing started' : 'Tracing stopped'), isError: false };
  }

  const parsed = parseReplCommand(command);
  if ('help' in parsed) return { text: parsed.help, isError: false };

  const [{ swDebugEval, swCallFunctionOn }, { commandTimeout }] = await Promise.all([
    import('@/lib/sw-debugger'),
    loadSettings(),
  ]);

  let timer: ReturnType<typeof setTimeout>;
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Command timed out after ${commandTimeout / 1000}s`)), commandTimeout);
      }),
    ]).finally(() => clearTimeout(timer!));

  async function formatResult(r: CdpResult | undefined): Promise<CommandResult> {
    if (!r || r.type === 'undefined') return { text: 'Done', isError: false };
    if (r.type === 'string') {
      const val = r.value as string;
      try {
        const obj = JSON.parse(val);
        if (obj && typeof obj === 'object' && '__image' in obj) {
          const img = obj as { mimeType: string; __image: string };
          return { text: '', image: `data:${img.mimeType};base64,${img.__image}`, isError: false };
        }
      } catch { /* not JSON — treat as plain text */ }
      return { text: val, isError: false };
    }
    if (r.type === 'number' || r.type === 'boolean') return { text: String(r.value), isError: false };
    if (r.objectId) {
      try {
        const s = await swCallFunctionOn(r.objectId,
          'function() { try { return JSON.stringify(this, null, 2); } catch(e) { return String(this); } }'
        ) as { result?: { value?: string } };
        const val = s?.result?.value;
        if (val) return { text: val, isError: false };
      } catch { /* fall through */ }
    }
    return { text: (r.description as string) ?? 'Done', isError: false };
  }

  if ('error' in parsed) {
    // Not a keyword command — check if it's a raw playwright/JS expression
    const { detectMode } = await import('@/lib/execute');
    const expr = command.trim();
    const mode = detectMode(expr);

    if (mode === 'js' || expr.includes('\n')) {
      // Evaluate in SW context (page, crxApp globals available, await supported)
      try {
        const raw = await withTimeout(swDebugEval(expr)) as { result?: CdpResult };
        return formatResult(raw?.result);
      } catch (e: unknown) {
        return { text: e instanceof Error ? e.message : String(e), isError: true };
      }
    }

    // mode === 'pw' — bare word that looks like a command but isn't recognized
    return { text: parsed.error, isError: true };
  }

  // Known keyword command — evaluate the generated JS in SW context
  try {
    const raw = await withTimeout(swDebugEval(parsed.jsExpr)) as { result?: CdpResult };
    return formatResult(raw?.result);
  } catch (e: unknown) {
    return { text: e instanceof Error ? e.message : String(e), isError: true };
  }
}

/**
 * Like executeCommand but preserves the raw CDP result for object/array types.
 * Used by the Console's pw executor to render expandable ObjectTree entries.
 */
export async function executeCommandForConsole(command: string): Promise<ConsoleCommandResult> {
  // Video capture — bypass parseReplCommand, send directly to SW
  const cmdName = command.trim().split(/\s+/)[0].toLowerCase();
  if (cmdName === 'video-start' || cmdName === 'video-stop') {
    const r = await chrome.runtime.sendMessage({ type: cmdName });
    if (!r?.ok) throw new Error(r?.error || 'Failed');
    if (cmdName === 'video-stop' && r.blobUrl) return { text: 'Video recorded', video: r.blobUrl, duration: r.duration, size: r.size };
    return { text: 'Video recording started' };
  }
  if (cmdName === 'tracing-start' || cmdName === 'tracing-stop') {
    const r = await chrome.runtime.sendMessage({ type: cmdName });
    if (!r?.ok) throw new Error(r?.error || 'Failed');
    if (cmdName === 'tracing-stop') return { text: r.text || 'Tracing stopped', trace: true, traceSize: r.size };
    return { text: 'Tracing started' };
  }

  const parsed = parseReplCommand(command);

  if ('error' in parsed) throw new Error(parsed.error);
  if ('help' in parsed) return { text: parsed.help };

  const [{ swDebugEval }, { commandTimeout }] = await Promise.all([
    import('@/lib/sw-debugger'),
    loadSettings(),
  ]);
  const { jsExpr } = parsed;

  let timer: ReturnType<typeof setTimeout>;
  const withTimeout = <T>(p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Command timed out after ${commandTimeout / 1000}s`)), commandTimeout);
      }),
    ]).finally(() => clearTimeout(timer!));

  const raw = await withTimeout(swDebugEval(jsExpr)) as { result?: CdpRemoteObject };
  const r = raw?.result;

  if (!r || r.type === 'undefined') return { text: 'Done' };

  if (r.type === 'string') {
    const val = r.value as string;
    try {
      const obj = JSON.parse(val);
      if (obj && typeof obj === 'object' && '__image' in obj) {
        const img = obj as { mimeType: string; __image: string };
        return { text: '', image: `data:${img.mimeType};base64,${img.__image}` };
      }
    } catch { /* not JSON — treat as plain text */ }
    return { text: val };
  }

  if (r.type === 'number' || r.type === 'boolean') return { text: String(r.value) };

  // object, array, function — return raw CDP result so Console can render ObjectTree
  return { cdpResult: r };
}

export async function attachToTab(tabId: number): Promise<{ ok: boolean; url?: string; error?: string }> {
  return chrome.runtime.sendMessage({ type: 'attach', tabId });
}

