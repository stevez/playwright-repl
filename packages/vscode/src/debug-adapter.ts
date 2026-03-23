/**
 * Playwright IDE Debug Adapter
 *
 * Implements VS Code's Debug Adapter Protocol (DAP) inline.
 * Uses CDP (Chrome DevTools Protocol) directly over WebSocket to debug
 * the service worker where test code runs.
 *
 * Two channels:
 * - Bridge (port 9876): run tests, record, pick
 * - CDP (port 9222): debug (breakpoints, stepping, variables)
 */

import * as vscode from 'vscode';
import type { BrowserManager } from './browser.js';
import WebSocket from 'ws';

// ─── CDP Client ────────────────────────────────────────────────────────────

class CdpClient {
  private _ws: WebSocket | null = null;
  private _seq = 1;
  private _pending = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>();
  private _onEvent?: (method: string, params: any) => void;

  async connect(port: number, log?: (msg: string) => void): Promise<void> {
    // Find the service worker target
    const res = await fetch(`http://localhost:${port}/json`);
    const targets = await res.json() as { id: string; type: string; url: string; webSocketDebuggerUrl: string }[];
    for (const t of targets) {
      log?.(`  Target: type=${t.type} url=${t.url.substring(0, 80)}`);
    }
    const sw = targets.find(t => t.type === 'service_worker' && t.url.includes('background.js'));
    if (!sw) throw new Error('Service worker target not found. Targets: ' + targets.map(t => t.type).join(', '));
    log?.(`  → Connecting to: ${sw.type} ${sw.url}`);

    // Connect to the SW's WebSocket debugger URL
    this._ws = new WebSocket(sw.webSocketDebuggerUrl);
    await new Promise<void>((resolve, reject) => {
      this._ws!.on('open', resolve);
      this._ws!.on('error', reject);
    });

    this._ws.on('message', (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id) {
        const pending = this._pending.get(msg.id);
        if (pending) {
          this._pending.delete(msg.id);
          if (msg.error) pending.reject(new Error(msg.error.message));
          else pending.resolve(msg.result);
        }
      } else if (msg.method) {
        this._onEvent?.(msg.method, msg.params);
      }
    });
  }

  onEvent(fn: (method: string, params: any) => void) {
    this._onEvent = fn;
  }

  async send(method: string, params?: any): Promise<any> {
    if (!this._ws) throw new Error('CDP not connected');
    const id = this._seq++;
    return new Promise((resolve, reject) => {
      this._pending.set(id, { resolve, reject });
      this._ws!.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this._ws?.close();
    this._ws = null;
  }
}

// ─── DAP Messages ──────────────────────────────────────────────────────────

interface DapRequest {
  seq: number;
  type: 'request';
  command: string;
  arguments?: any;
}

interface DapResponse {
  seq: number;
  type: 'response';
  request_seq: number;
  success: boolean;
  command: string;
  body?: any;
  message?: string;
}

interface DapEvent {
  seq: number;
  type: 'event';
  event: string;
  body?: any;
}

// ─── Debug Session ─────────────────────────────────────────────────────────

export class PlaywrightDebugSession implements vscode.DebugAdapter {
  private _sendMessage = new vscode.EventEmitter<vscode.DebugProtocolMessage>();
  private _seq = 1;
  private _browserManager: BrowserManager;
  private _outputChannel: vscode.OutputChannel;
  private _cdp: CdpClient | null = null;
  private _sourceFile = '';
  private _pausedLine = 0;
  private _pausedScopes: any[] = [];
  private _pendingBreakpoints: { req: DapRequest; filePath: string; breakpoints: any[] }[] = [];
  private _breakpointLines: number[] = []; // original source lines (0-based)
  private _lineMap: Map<number, number> = new Map(); // bundled line → original line (0-based)
  private _reverseLineMap: Map<number, number> = new Map(); // original line → bundled line (0-based)
  private _testScriptId: string | null = null;

  onDidSendMessage = this._sendMessage.event;

  constructor(browserManager: BrowserManager, outputChannel: vscode.OutputChannel) {
    this._browserManager = browserManager;
    this._outputChannel = outputChannel;
  }

  handleMessage(message: vscode.DebugProtocolMessage): void {
    const msg = message as unknown as DapRequest;
    this._outputChannel.appendLine(`[DAP] → ${msg.command} (seq: ${msg.seq})`);
    this._handleRequest(msg).catch(err => {
      this._outputChannel.appendLine(`[DAP] ERROR in ${msg.command}: ${(err as Error).message}`);
      this._sendResponse(msg, false, undefined, (err as Error).message);
    });
  }

  private async _handleRequest(req: DapRequest): Promise<void> {
    switch (req.command) {
      case 'initialize':
        this._sendResponse(req, true, {
          supportsConfigurationDoneRequest: true,
        });
        this._sendEvent('initialized');
        break;

      case 'configurationDone':
        this._sendResponse(req, true);
        break;

      case 'launch': {
        const testFile = req.arguments?.program;
        if (!testFile) {
          this._sendResponse(req, false, undefined, 'No test file specified');
          return;
        }
        this._sourceFile = testFile;

        // Auto-launch browser if needed
        if (!this._browserManager.isRunning()) {
          const config = vscode.workspace.getConfiguration('playwright-ide');
          await this._browserManager.launch({
            browser: config.get('browser', 'chromium'),
            bridgePort: config.get('bridgePort', 9876),
          });
        }

        // Connect CDP directly to Chrome's service worker
        this._cdp = new CdpClient();
        try {
          await this._cdp.connect(9222, (msg) => this._outputChannel.appendLine(msg));
          this._outputChannel.appendLine('CDP connected to service worker.');
        } catch (err: unknown) {
          this._sendResponse(req, false, undefined, `CDP connection failed: ${(err as Error).message}`);
          return;
        }

        // Enable debugger + runtime
        await this._cdp.send('Debugger.enable');
        await this._cdp.send('Runtime.enable');

        // Listen for debug events
        this._cdp.onEvent((method, params) => {
          if (method === 'Debugger.scriptParsed') {
            this._outputChannel.appendLine(`[CDP] Script parsed: ${params.url} (id: ${params.scriptId}, hasSourceMap: ${!!params.sourceMapURL})`);
            // When our test script is parsed, apply breakpoints by script ID
            if (params.sourceMapURL && params.url.startsWith('pw-ide-bundle-')) {
              this._testScriptId = params.scriptId;
              this._applyBreakpointsByScriptId().catch(() => {});
            }
          }
          if (method === 'Debugger.paused') {
            const frame = params.callFrames?.[0];
            const line = frame?.location?.lineNumber;
            this._outputChannel.appendLine(`[CDP] Paused: line=${line} fn=${frame?.functionName}`);

            // Only pause on test file lines (in the line map). Skip shim/runner code.
            if (line !== undefined && !this._lineMap.has(line)) {
              this._cdp?.send('Debugger.resume').catch(() => {});
              return;
            }

            if (frame) {
              this._pausedLine = line!;
              this._pausedScopes = (frame.scopeChain ?? [])
                .filter((s: any) => s.type !== 'global');
            }
            this._sendEvent('stopped', {
              reason: params.reason === 'breakpoint' ? 'breakpoint' : 'step',
              threadId: 1,
              allThreadsStopped: true,
            });
          }
          if (method === 'Debugger.resumed') {
            this._sendEvent('continued', { threadId: 1 });
          }
        });

        this._sendResponse(req, true);

        // Ensure extension has a page attached (needed for page/expect globals)
        const snapResult = await this._browserManager.runCommand('snapshot').catch((e: Error) => ({ text: e.message, isError: true }));
        this._outputChannel.appendLine(`Snapshot: ${snapResult.isError ? 'FAILED: ' + snapResult.text : 'OK'}`);

        // Check if globals are visible via CDP
        const pageCheck = await this._cdp.send('Runtime.evaluate', {
          expression: 'typeof globalThis.page',
          returnByValue: true,
        });
        this._outputChannel.appendLine(`CDP globalThis.page type: ${pageCheck?.result?.value}`);

        // Breakpoints will be applied when scriptParsed fires (after Runtime.evaluate starts)

        // Bundle and run the test with source maps
        const { bundleTestFile } = await import('./bundler.js');
        const bundle = await bundleTestFile(testFile, { debug: true });
        const script = bundle.script;
        this._lineMap = bundle.lineMap;
        // Build reverse map: original line → bundled line
        this._reverseLineMap = new Map();
        for (const [bundled, original] of this._lineMap) {
          if (!this._reverseLineMap.has(original)) {
            this._reverseLineMap.set(original, bundled);
          }
        }
        this._outputChannel.appendLine(`Debugging ${testFile}... (${script.length} bytes, ${this._lineMap.size} mapped lines)`);

        // Run via CDP directly (not bridge — so debugger can pause)
        // replMode: true enables top-level await (same as panel's sw-debugger)
        this._cdp.send('Runtime.evaluate', {
          expression: script,
          awaitPromise: true,
          returnByValue: true,
          replMode: true,
        }).then(async result => {
          if (result?.exceptionDetails) {
            this._outputChannel.appendLine(`Error: ${result.exceptionDetails.exception?.description || result.exceptionDetails.text}`);
          } else {
            this._outputChannel.appendLine(result?.result?.value || '(completed)');
          }
          this._outputChannel.appendLine('Test finished. Ending debug session.');
          await this._cdp?.send('Debugger.disable').catch(() => {});
          this._sendEvent('terminated');
        }).catch(async (err: Error) => {
          this._outputChannel.appendLine(`Debug error: ${err.message}`);
          await this._cdp?.send('Debugger.disable').catch(() => {});
          this._sendEvent('terminated');
        });
        break;
      }

      case 'setBreakpoints': {
        const source = req.arguments?.source;
        const breakpoints = req.arguments?.breakpoints || [];
        const filePath = source?.path || '';

        // Always queue — apply after CDP connects, right before running script
        this._pendingBreakpoints = [{ req, filePath, breakpoints }];
        this._sendResponse(req, true, {
          breakpoints: breakpoints.map((bp: any) => ({ verified: true, line: bp.line })),
        });
        break;
      }

      case 'threads':
        this._sendResponse(req, true, {
          threads: [{ id: 1, name: 'Test' }],
        });
        break;

      case 'stackTrace': {
        // Map bundled line → original source line via source map
        const originalLine = this._lineMap.get(this._pausedLine) ?? this._pausedLine;
        this._sendResponse(req, true, {
          stackFrames: [{
            id: 1,
            name: 'test',
            source: { name: this._sourceFile.replace(/.*[\\/]/, ''), path: this._sourceFile },
            line: originalLine + 1, // 0-based → DAP 1-based
            column: 0,
          }],
          totalFrames: 1,
        });
        break;
      }

      case 'scopes':
        this._sendResponse(req, true, {
          scopes: this._pausedScopes.map((s: any, i: number) => ({
            name: s.name || s.type,
            variablesReference: i + 1,
            expensive: false,
          })),
        });
        break;

      case 'variables': {
        const ref = req.arguments?.variablesReference;
        const scope = this._pausedScopes[ref - 1];
        const vars: any[] = [];
        if (scope?.object?.objectId && this._cdp) {
          try {
            const result = await this._cdp.send('Runtime.getProperties', {
              objectId: scope.object.objectId,
              ownProperties: true,
            });
            for (const prop of result?.result || []) {
              if (!prop.value) continue;
              vars.push({
                name: prop.name,
                value: prop.value.description || String(prop.value.value ?? 'undefined'),
                type: prop.value.type,
                variablesReference: 0,
              });
            }
          } catch { /* ignore */ }
        }
        this._sendResponse(req, true, { variables: vars });
        break;
      }

      case 'evaluate': {
        const expr = req.arguments?.expression;
        if (!expr || !this._cdp) {
          this._sendResponse(req, false, undefined, 'No expression');
          return;
        }
        try {
          const result = await this._cdp.send('Runtime.evaluate', {
            expression: expr,
            awaitPromise: true,
            returnByValue: true,
          });
          this._sendResponse(req, true, {
            result: JSON.stringify(result?.result?.value) || result?.result?.description || 'undefined',
            variablesReference: 0,
          });
        } catch (err: unknown) {
          this._sendResponse(req, false, undefined, (err as Error).message);
        }
        break;
      }

      case 'continue':
        await this._cdp?.send('Debugger.resume');
        this._sendResponse(req, true, { allThreadsContinued: true });
        break;

      case 'next':
        await this._cdp?.send('Debugger.stepOver');
        this._sendResponse(req, true);
        break;

      case 'stepIn':
        await this._cdp?.send('Debugger.stepIn');
        this._sendResponse(req, true);
        break;

      case 'stepOut':
        await this._cdp?.send('Debugger.stepOut');
        this._sendResponse(req, true);
        break;

      case 'disconnect':
        if (this._cdp) {
          await this._cdp.send('Debugger.disable').catch(() => {});
          this._cdp.close();
          this._cdp = null;
        }
        this._sendResponse(req, true);
        break;

      default:
        this._sendResponse(req, true);
    }
  }

  private async _applyBreakpointsByScriptId() {
    if (!this._testScriptId || !this._cdp) return;
    for (const pending of this._pendingBreakpoints) {
      for (const bp of pending.breakpoints) {
        const originalLine = bp.line - 1; // DAP 1-based → 0-based
        const bundledLine = this._reverseLineMap.get(originalLine);
        if (bundledLine === undefined) {
          this._outputChannel.appendLine(`  No mapping for original line ${bp.line}`);
          continue;
        }
        try {
          const result = await this._cdp.send('Debugger.setBreakpoint', {
            location: { scriptId: this._testScriptId, lineNumber: bundledLine },
          });
          this._outputChannel.appendLine(`  Breakpoint: line ${bp.line} → bundled ${bundledLine} → ${result?.breakpointId}`);
        } catch (err: unknown) {
          this._outputChannel.appendLine(`  Breakpoint failed: line ${bp.line} → bundled ${bundledLine}: ${(err as Error).message}`);
        }
      }
    }
    this._pendingBreakpoints = [];
  }

  private async _applyBreakpointsOnly(filePath: string, breakpoints: any[]) {
    const fileName = filePath.replace(/.*[\\/]/, '');
    this._outputChannel.appendLine(`Setting ${breakpoints.length} breakpoint(s) in ${fileName}`);

    this._breakpointLines = breakpoints.map((bp: any) => bp.line - 1); // DAP 1-based → 0-based

    for (const bp of breakpoints) {
      try {
        // Use urlRegex to match the source map's relative path
        const escapedName = fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const result = await this._cdp!.send('Debugger.setBreakpointByUrl', {
          urlRegex: `.*${escapedName}`,
          lineNumber: bp.line - 1, // DAP 1-based → CDP 0-based
        });
        this._outputChannel.appendLine(`  Breakpoint set at line ${bp.line} → ${result?.breakpointId}`);
      } catch (err: unknown) {
        this._outputChannel.appendLine(`  Breakpoint failed at line ${bp.line}: ${(err as Error).message}`);
      }
    }
  }

  private _sendResponse(req: DapRequest, success: boolean, body?: any, message?: string) {
    const response: DapResponse = {
      seq: this._seq++,
      type: 'response',
      request_seq: req.seq,
      success,
      command: req.command,
      body,
      message,
    };
    this._outputChannel.appendLine(`[DAP] ← response ${req.command} (success: ${success}${message ? ', msg: ' + message : ''})`);
    this._sendMessage.fire(response as any);
  }

  private _sendEvent(event: string, body?: any) {
    const evt: DapEvent = {
      seq: this._seq++,
      type: 'event',
      event,
      body,
    };
    this._sendMessage.fire(evt as any);
  }

  dispose() {
    this._cdp?.close();
  }
}

// ─── Debug Adapter Factory ─────────────────────────────────────────────────

export class PlaywrightDebugAdapterFactory implements vscode.DebugAdapterDescriptorFactory {
  private _browserManager: BrowserManager;
  private _outputChannel: vscode.OutputChannel;

  constructor(browserManager: BrowserManager, outputChannel: vscode.OutputChannel) {
    this._browserManager = browserManager;
    this._outputChannel = outputChannel;
  }

  createDebugAdapterDescriptor(): vscode.ProviderResult<vscode.DebugAdapterDescriptor> {
    return new vscode.DebugAdapterInlineImplementation(
      new PlaywrightDebugSession(this._browserManager, this._outputChannel)
    );
  }
}
