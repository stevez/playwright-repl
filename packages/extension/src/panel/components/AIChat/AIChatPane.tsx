import { useState, useRef, useEffect, useCallback } from 'react';
import { streamText, stepCountIs } from 'ai';
import { createModel, browserTools, lastScreenshot } from '@/lib/ai-agent';
import { loadAISettings, storeAISettings, type AIModelConfig } from '@/lib/settings';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage, ToolCallInfo } from '@/types';
import type { Action } from '@/reducer';

// ─── Tool badge ─────────────────────────────────────────────────────────────

function ToolBadge({ name, input, result, image }: { name: string; input?: Record<string, unknown>; result?: string; image?: string }) {
    const argsStr = input
        ? Object.entries(input).filter(([k]) => k !== '_unused').map(([, v]) => String(v)).join(', ')
        : '';
    const ok = result && !result.startsWith('Error');
    const fail = result?.startsWith('Error');
    return (
        <div className="my-1">
            <div className="text-[13px] font-mono px-2 py-1 rounded bg-(--bg-toolbar) border border-(--border-primary)">
                <span style={{ opacity: 0.5 }}>▶ </span>
                <span style={{ fontWeight: 500 }}>{name}</span>
                {argsStr && <span style={{ opacity: 0.5 }}> {argsStr}</span>}
                {ok && <span className="ml-1" style={{ color: '#4ade80' }}>✓</span>}
                {fail && <span className="ml-1" style={{ color: '#f87171' }}>✗</span>}
            </div>
            {image && <img src={image} alt="screenshot" className="mt-1 rounded border border-(--border-primary) max-w-full" style={{ maxHeight: '200px' }} />}
        </div>
    );
}

// ─── Code block with copy button ────────────────────────────────────────────

function CodeBlock({ children, className }: { children: React.ReactNode; className?: string }) {
    const [copied, setCopied] = useState(false);
    const code = String(children).replace(/\n$/, '');
    const lang = className?.replace('language-', '') ?? '';

    function handleCopy() {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    return (
        <div className="relative my-2 rounded border border-(--border-primary) bg-(--bg-toolbar) overflow-hidden">
            <div className="flex items-center justify-between px-2 py-0.5 border-b border-(--border-primary)" style={{ fontSize: '11px', opacity: 0.5 }}>
                <span>{lang}</span>
                <button onClick={handleCopy} className="hover:opacity-100" style={{ opacity: 0.6 }}>
                    {copied ? '✓ copied' : 'copy'}
                </button>
            </div>
            <pre className="overflow-x-auto px-3 py-2 m-0" style={{ fontSize: '12px', lineHeight: '1.5' }}>
                <code>{code}</code>
            </pre>
        </div>
    );
}

// ─── Markdown components ────────────────────────────────────────────────────

const markdownComponents = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    code({ className, children, ...props }: any) {
        const isBlock = className || String(children).includes('\n');
        if (isBlock) return <CodeBlock className={className}>{children}</CodeBlock>;
        return <code style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '12px' }} {...props}>{children}</code>;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pre({ children }: any) {
        // react-markdown wraps code blocks in <pre><code>. We handle it in code() above, so just pass through.
        return <>{children}</>;
    },
};

// ─── Main AI Chat Pane ──────────────────────────────────────────────────────

interface AIChatPaneProps {
    messages: ChatMessage[];
    dispatch: React.Dispatch<Action>;
}

export function AIChatPane({ messages, dispatch }: AIChatPaneProps) {
    const [input, setInput] = useState('');
    const [models, setModels] = useState<AIModelConfig[]>([]);
    const [activeModel, setActiveModel] = useState<AIModelConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    // Local state for fast streaming renders; synced to reducer when stream ends
    const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);
    const localMessagesRef = useRef<ChatMessage[]>([]);
    const [historyIndex, setHistoryIndex] = useState(-1);
    const inputHistoryRef = useRef<string[]>([]);

    // Sync from reducer → local when not streaming (e.g. after handoff restore)
    useEffect(() => {
        if (!isStreaming) setLocalMessages(messages);
    }, [messages, isStreaming]);

    // The display messages: local during streaming, reducer otherwise
    const displayMessages = isStreaming ? localMessages : messages;

    // Load model configs
    useEffect(() => {
        loadAISettings().then(settings => {
            setModels(settings.models);
            const model = settings.models.find(m => m.id === settings.activeModelId);
            setActiveModel(model ?? null);
        });
    }, []);

    async function switchModel(id: string) {
        const model = models.find(m => m.id === id);
        if (!model) return;
        setActiveModel(model);
        const settings = await loadAISettings();
        await storeAISettings({ ...settings, activeModelId: id });
    }

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    }, [displayMessages, isStreaming]);

    const sendMessage = useCallback(async (text: string) => {
        if (!activeModel || isStreaming) return;

        const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
        const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', toolCalls: [] };

        const initial = [...messages, userMsg, assistantMsg];
        localMessagesRef.current = initial;
        setLocalMessages(initial);
        setIsStreaming(true);
        setError(null);

        try {
            const model = createModel(activeModel);
            const abort = new AbortController();
            abortRef.current = abort;

            // Build messages for the API (include history)
            const allMessages = [...messages, userMsg].map(m => ({
                role: m.role as 'user' | 'assistant',
                content: m.content,
            }));

            const result = streamText({
                model,
                messages: allMessages,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                tools: browserTools as any,
                stopWhen: stepCountIs(10),
                maxRetries: 1,
                abortSignal: abort.signal,
                onError: ({ error }) => {
                    console.error('[AI Chat] stream error:', error);
                    const msg = error instanceof Error ? error.message : String(error);
                    if (msg.includes('429')) setError('Rate limited. Wait a moment and try again.');
                    else if (msg.includes('401') || msg.includes('403')) setError('Invalid API key. Check Preferences.');
                    else if (msg.includes('404')) setError('Model not available. Check model name in Preferences.');
                    else setError(msg || 'An error occurred.');
                },
                system: `You are a browser automation assistant for Dramaturg (playwright-repl).
You help users interact with web pages by calling browser tools.
Always call the snapshot tool first to see what elements are on the page before taking actions.
Use accessible names from the snapshot, not element refs.
When you execute browser actions, briefly describe what you did and what happened.
Keep responses concise.

When asked to generate test scripts or commands, use .pw keyword format (not JavaScript):
  goto <url>
  click [role] "<text>"
  fill [role] "<label>" "<value>"
  press <key>
  select [role] "<label>" "<value>"
  hover [role] "<text>"
  check "<label>"
  uncheck "<label>"
  type "<text>"
  verify-text "<text>"
  verify-element <role> "<name>"
  verify-title "<text>"
  verify-url "<text>"
  wait-for-text "<text>"
  snapshot
  screenshot

Example .pw script:
\`\`\`pw
goto https://example.com
click link "Get started"
verify-url "/docs/intro"
click link "Home"
verify-text "Welcome"
\`\`\`

Only use JavaScript (Playwright API) if the user explicitly asks for JavaScript or .js format.`,
            });

            let fullText = '';
            const toolCalls: ToolCallInfo[] = [];

            for await (const part of result.fullStream) {
                if (part.type === 'tool-call') {
                    const input = (part as unknown as Record<string, unknown>).input as Record<string, unknown> ?? {};
                    toolCalls.push({ name: part.toolName, input });
                } else if (part.type === 'tool-result') {
                    const output = (part as unknown as Record<string, unknown>).output;
                    const last = toolCalls.find(t => t.name === part.toolName && !t.result);
                    if (last) {
                        last.result = String(output ?? '');
                        if (part.toolName === 'screenshot' && lastScreenshot) {
                            last.image = lastScreenshot;
                        }
                    }
                } else if (part.type === 'text-delta') {
                    fullText += part.text;
                }
                // Update local state for fast rendering (only AIChatPane re-renders)
                const updated = initial.map(m => m.id === assistantMsg.id
                    ? { ...m, content: fullText, toolCalls: [...toolCalls] } : m);
                localMessagesRef.current = updated;
                setLocalMessages(updated);
            }

        } catch (e: unknown) {
            const raw = e instanceof Error ? e.message : String(e);
            if (raw === 'This operation was aborted') return;
            // API errors are handled by onError above; this catches
            // model creation failures, aborts, and other exceptions.
            if (!error) setError(raw);
        } finally {
            // Sync final messages to reducer (persists for handoff)
            dispatch({ type: 'SET_AI_CHAT_MESSAGES', messages: localMessagesRef.current });
            setIsStreaming(false);
            abortRef.current = null;
        }
    }, [activeModel, messages, isStreaming]);

    const SLASH_COMMANDS = [
        { cmd: '/explain', prompt: 'Describe what is on the current page. Take a snapshot first.', help: 'Describe what is on the page' },
        { cmd: '/suggest', prompt: 'Suggest next actions based on the current page state. Take a snapshot first.', help: 'Suggest next actions' },
        { cmd: '/convert', prompt: 'Convert the session commands above into a Playwright .spec.js test file.', help: 'Convert session to .spec.js' },
        { cmd: '/clear', prompt: '', help: 'Clear chat history' },
    ];

    const [slashIndex, setSlashIndex] = useState(-1);
    const slashMatches = input.startsWith('/')
        ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(input.split(' ')[0]))
        : [];

    function submitInput() {
        const text = input.trim();
        if (!text || isStreaming) return;
        inputHistoryRef.current.push(text);
        setHistoryIndex(-1);
        setInput('');
        setSlashIndex(-1);
        if (text === '/clear') {
            dispatch({ type: 'SET_AI_CHAT_MESSAGES', messages: [] });
            return;
        }
        const match = SLASH_COMMANDS.find(c => c.prompt && text.startsWith(c.cmd));
        if (match) {
            const rest = text.slice(match.cmd.length).trim();
            sendMessage(rest ? `${match.prompt} ${rest}` : match.prompt);
        } else {
            sendMessage(text);
        }
    }

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        submitInput();
    }

    function selectSlashCommand(cmd: string) {
        setInput(cmd + ' ');
        setSlashIndex(-1);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (slashMatches.length > 0) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSlashIndex(i => (i + 1) % slashMatches.length);
                return;
            }
            if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSlashIndex(i => (i - 1 + slashMatches.length) % slashMatches.length);
                return;
            }
            if ((e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) && slashIndex >= 0) {
                e.preventDefault();
                selectSlashCommand(slashMatches[slashIndex].cmd);
                return;
            }
        }
        const history = inputHistoryRef.current;
        if (e.key === 'ArrowUp' && history.length > 0) {
            e.preventDefault();
            const next = historyIndex < 0 ? history.length - 1 : Math.max(0, historyIndex - 1);
            setHistoryIndex(next);
            setInput(history[next]);
            return;
        }
        if (e.key === 'ArrowDown' && historyIndex >= 0) {
            e.preventDefault();
            const next = historyIndex + 1;
            if (next >= history.length) {
                setHistoryIndex(-1);
                setInput('');
            } else {
                setHistoryIndex(next);
                setInput(history[next]);
            }
            return;
        }
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            submitInput();
        }
    }

    // ─── No model configured ────────────────────────────────────
    if (!activeModel) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center">
                <div className="text-2xl mb-3">✨</div>
                <p className="text-sm mb-1 opacity-80">Set up an AI model to get started</p>
                <p className="text-xs opacity-50 mb-3">Add an API key in Preferences to use AI Chat.</p>
                <button
                    onClick={() => window.open(`${location.origin}/preferences/preferences.html`)}
                    className="px-3 py-1 text-xs rounded border border-(--border-primary) opacity-70 hover:opacity-100"
                >Open Preferences</button>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Model switcher */}
            {models.length > 0 && (
                <div className="flex items-center gap-1 px-3 py-1 border-b border-(--border-primary) bg-(--bg-toolbar) text-[11px]">
                    <span style={{opacity: 0.5}}>Model:</span>
                    <select
                        value={activeModel?.id ?? ''}
                        onChange={e => switchModel(e.target.value)}
                        disabled={isStreaming}
                        className="bg-transparent border-none outline-none text-[11px] cursor-pointer"
                        style={{color: 'var(--text-primary)'}}
                    >
                        {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                    </select>
                    <span className="flex-1" />
                    {displayMessages.length > 0 && (
                        <button
                            onClick={() => dispatch({ type: 'SET_AI_CHAT_MESSAGES', messages: [] })}
                            disabled={isStreaming}
                            className="opacity-40 hover:opacity-100 disabled:opacity-20"
                            title="Clear chat"
                        >Clear</button>
                    )}
                </div>
            )}
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 text-[13px]">
                {displayMessages.length === 0 && (
                    <div className="opacity-40 text-[13px] text-center mt-6">
                        Ask anything about the page, or describe what you want to do.
                    </div>
                )}
                {displayMessages.map(msg => (
                    <div key={msg.id} className={`mb-3 ${msg.role === 'user' ? 'text-right' : ''}`}>
                        {msg.role === 'user' && (
                            <div className="inline-block px-3 py-1.5 rounded bg-(--bg-toolbar) text-left max-w-[90%] text-[13px]">
                                {msg.content}
                            </div>
                        )}
                        {msg.role === 'assistant' && (
                            <div>
                                {msg.toolCalls?.map((tc, i) => (
                                    <ToolBadge key={i} name={tc.name} input={tc.input} result={tc.result} image={tc.image} />
                                ))}
                                {msg.content && <div className="leading-relaxed"><Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>{msg.content}</Markdown></div>}
                            </div>
                        )}
                    </div>
                ))}
                {isStreaming && displayMessages[displayMessages.length - 1]?.role === 'assistant' && !displayMessages[displayMessages.length - 1]?.content && !displayMessages[displayMessages.length - 1]?.toolCalls?.length && (
                    <div className="text-[13px] opacity-40 ml-1">thinking...</div>
                )}
            </div>

            {/* Error bar */}
            {error && (
                <div className="px-3 py-1.5 text-[13px] border-t border-(--border-primary) bg-(--bg-toolbar)" style={{ color: 'var(--text-error, #f97583)' }}>
                    {error}
                    <button className="ml-2 underline opacity-60" onClick={() => setError(null)}>dismiss</button>
                </div>
            )}

            {/* Slash command autocomplete */}
            {slashMatches.length > 0 && (
                <div className="border-t border-(--border-primary) bg-(--bg-toolbar) px-1 py-1">
                    {slashMatches.map((c, i) => (
                        <button
                            key={c.cmd}
                            onClick={() => selectSlashCommand(c.cmd)}
                            data-active={i === slashIndex ? '' : undefined}
                            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded text-[12px]"
                            style={{background: i === slashIndex ? 'var(--bg-button)' : 'transparent'}}
                        >
                            <span style={{fontWeight: 500}}>{c.cmd}</span>
                            <span style={{opacity: 0.5}}>{c.help}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* Input */}
            <form onSubmit={handleSubmit} className="flex items-end gap-1 px-3 py-1.5 border-t border-(--border-primary) bg-(--bg-toolbar)">
                <textarea
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask anything..."
                    rows={1}
                    disabled={isStreaming}
                    className="flex-1 resize-none bg-transparent border-none outline-none text-[13px] py-1 min-h-[24px] max-h-[80px]"
                    style={{ color: 'var(--text-primary)' }}
                />
                {isStreaming ? (
                    <button
                        type="button"
                        onClick={() => abortRef.current?.abort()}
                        className="px-2 py-1 text-[13px] rounded opacity-60 hover:opacity-100"
                        title="Stop"
                    >
                        ■
                    </button>
                ) : (
                    <button
                        type="submit"
                        disabled={!input.trim()}
                        className="px-2 py-1 text-[13px] rounded opacity-60 hover:opacity-100 disabled:opacity-20"
                        title="Send (Enter)"
                    >
                        ▶
                    </button>
                )}
            </form>
        </div>
    );
}
