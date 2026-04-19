/**
 * AiChatView — dedicated webview panel for AI Assist conversations.
 *
 * Streams AI text, tool calls, verify status, and errors in real-time.
 * Replaces the showInputBox popup and Output channel fallback.
 */

import { WebviewBase } from './webviewBase';
import type { IBrowserManager } from './browser';
import type * as vscodeTypes from './vscodeTypes';
import { aiAssist, type AgentEvent } from './ai/agent';
import { VSCodeLMProvider } from './ai/provider';

export class AiChatView extends WebviewBase {
  private _browserManager: IBrowserManager | undefined;
  private _logger: vscodeTypes.LogOutputChannel | undefined;
  private _cancellation: vscodeTypes.CancellationTokenSource | undefined;
  private _isRunning = false;
  private _lastEditor: vscodeTypes.TextEditor | undefined;

  get viewId() { return 'playwright-repl.aiChatView'; }
  get scriptName() { return 'aiChatView.script.js'; }
  get bodyClass() { return 'ai-chat-view'; }

  setBrowserManager(manager: IBrowserManager | undefined) {
    this._browserManager = manager;
  }

  setLogger(logger: vscodeTypes.LogOutputChannel) {
    this._logger = logger;
  }

  bodyHtml(): string {
    return `
      <style>
        body.ai-chat-view {
          display: flex;
          flex-direction: column;
          height: 100vh;
          overflow: hidden;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
        }
        #messages {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
          user-select: text;
          -webkit-user-select: text;
        }
        .msg {
          margin-bottom: 8px;
          line-height: 1.5;
          white-space: pre-wrap;
          word-wrap: break-word;
        }
        .msg-user {
          color: var(--vscode-terminal-ansiBrightWhite);
          padding: 4px 8px;
          border-left: 3px solid var(--vscode-terminal-ansiBlue);
          background: var(--vscode-editor-inactiveSelectionBackground);
          border-radius: 2px;
        }
        .msg-ai {
          color: var(--vscode-editor-foreground);
          padding: 4px 0;
        }
        .msg-status {
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
          font-style: italic;
          padding: 2px 0;
        }
        .msg-error {
          color: var(--vscode-errorForeground);
          padding: 2px 0;
        }
        .msg-tool {
          color: var(--vscode-descriptionForeground);
          font-size: 0.9em;
          padding: 2px 0;
        }
        .msg-tool summary {
          cursor: pointer;
          user-select: none;
        }
        .msg-tool .tool-result {
          padding: 4px 8px;
          margin-top: 4px;
          background: var(--vscode-editor-inactiveSelectionBackground);
          border-radius: 2px;
          max-height: 200px;
          overflow-y: auto;
          font-family: var(--vscode-editor-font-family);
          font-size: var(--vscode-editor-font-size);
        }
        #input-row {
          display: flex;
          gap: 4px;
          padding: 6px 8px;
          border-top: 1px solid var(--vscode-panel-border);
          align-items: flex-end;
        }
        #chat-input {
          flex: 1;
          resize: none;
          border: 1px solid var(--vscode-input-border, transparent);
          background: var(--vscode-input-background);
          color: var(--vscode-input-foreground);
          padding: 4px 8px;
          font-family: var(--vscode-font-family);
          font-size: var(--vscode-font-size);
          border-radius: 2px;
          field-sizing: content;
          max-height: 120px;
          outline: none;
        }
        #chat-input:focus {
          border-color: var(--vscode-focusBorder);
        }
        #chat-input:disabled {
          opacity: 0.5;
        }
        #send-btn {
          border: none;
          background: var(--vscode-button-background);
          color: var(--vscode-button-foreground);
          padding: 4px 10px;
          border-radius: 2px;
          cursor: pointer;
          font-size: var(--vscode-font-size);
        }
        #send-btn:hover {
          background: var(--vscode-button-hoverBackground);
        }
        #send-btn:disabled {
          opacity: 0.5;
          cursor: default;
        }
        #cancel-btn {
          border: none;
          background: var(--vscode-button-secondaryBackground);
          color: var(--vscode-button-secondaryForeground);
          padding: 4px 10px;
          border-radius: 2px;
          cursor: pointer;
          font-size: var(--vscode-font-size);
        }
        #cancel-btn:hover {
          background: var(--vscode-button-secondaryHoverBackground);
        }
      </style>
      <div id="messages"></div>
      <div id="input-row">
        <textarea id="chat-input" rows="1" placeholder="What should AI do? (Enter to send)"></textarea>
        <button id="send-btn" title="Send">Send</button>
        <button id="cancel-btn" title="Cancel" style="display:none">Cancel</button>
      </div>
    `;
  }

  async onMessage(data: any): Promise<void> {
    if (data.method === 'send') {
      // When sending from webview, use the last known editor (panel has focus, not editor)
      if (!this._lastEditor)
        this._lastEditor = this._vscode.window.activeTextEditor;
      // User typed a prompt — pass it directly (no template)
      const prompt = data.params.prompt?.trim() || undefined;
      await this._startAssist(prompt);
    } else if (data.method === 'cancel') {
      this._cancellation?.cancel();
    }
  }

  /** Public API: focus the panel and auto-start with the default template. */
  async startAssist(userPrompt?: string) {
    // Capture the editor BEFORE focusing the panel (focus changes activeTextEditor)
    this._lastEditor = this._vscode.window.activeTextEditor;
    await this._vscode.commands.executeCommand('playwright-repl.aiChatView.focus');
    // Small delay to let the webview resolve if first open
    await new Promise(r => setTimeout(r, 100));
    // Auto-start: undefined = default fix/polish/review template
    await this._startAssist(userPrompt);
  }

  /** Clear the chat history. */
  clear() {
    this.postMessage('clear');
  }

  private async _startAssist(userPrompt?: string) {
    if (this._isRunning) return;

    const editor = this._lastEditor || this._vscode.window.activeTextEditor;
    if (!editor) {
      this.postMessage('agentEvent', { type: 'error', message: 'No active editor. Open a test file first.' });
      return;
    }

    const aiProvider = new VSCodeLMProvider(this._vscode);
    if (!await aiProvider.isAvailable()) {
      this.postMessage('agentEvent', { type: 'error', message: 'No AI model available. Install GitHub Copilot or another LLM extension.' });
      return;
    }

    const browserManager = this._browserManager?.isRunning()
      ? this._browserManager
      : undefined;

    this._isRunning = true;
    this.postMessage('running', { running: true });
    this.postMessage('userMessage', { text: userPrompt || '(auto fix/polish/review)' });

    this._cancellation = new this._vscode.CancellationTokenSource();

    const onEvent = (event: AgentEvent) => {
      this.postMessage('agentEvent', event);
    };

    try {
      await aiAssist(
        this._vscode, editor, browserManager,
        this._logger, userPrompt || undefined,
        onEvent, this._cancellation.token,
      );
    } catch (e: unknown) {
      this.postMessage('agentEvent', { type: 'error', message: (e as Error).message });
    } finally {
      this._isRunning = false;
      this._cancellation.dispose();
      this._cancellation = undefined;
      this.postMessage('running', { running: false });
    }
  }
}
