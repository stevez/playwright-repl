import { useState, useRef, useEffect, useCallback } from 'react';
import { streamText, stepCountIs } from 'ai';
import { createModel, browserTools, lastScreenshot } from '@/lib/ai-agent';
import { loadAISettings, type AIModelConfig } from '@/lib/settings';
// ─── Types ──────────────────────────────────────────────────────────────────

interface ToolCallInfo { name: string; input: Record<string, unknown>; result?: string; image?: string }

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    toolCalls?: ToolCallInfo[];
}

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

// ─── Markdown rendering ─────────────────────────────────────────────────────

function renderInline(line: string, lineKey: number) {
    // Split on **bold**, *italic*, and `code`
    const parts: React.ReactNode[] = [];
    const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g;
    let last = 0;
    let match;
    let key = 0;
    while ((match = regex.exec(line)) !== null) {
        if (match.index > last) parts.push(line.slice(last, match.index));
        if (match[2]) parts.push(<strong key={`${lineKey}-${key++}`}>{match[2]}</strong>);
        else if (match[3]) parts.push(<em key={`${lineKey}-${key++}`}>{match[3]}</em>);
        else if (match[4]) parts.push(<code key={`${lineKey}-${key++}`} style={{ background: 'rgba(255,255,255,0.1)', padding: '1px 4px', borderRadius: '3px', fontSize: '12px' }}>{match[4]}</code>);
        last = match.index + match[0].length;
    }
    if (last < line.length) parts.push(line.slice(last));
    return parts.length ? parts : ['\u00A0'];
}

function renderText(text: string) {
    return text.split('\n').map((line, i) => {
        // Bullet lists
        const bulletMatch = line.match(/^(\s*)([-*])\s+(.*)/);
        if (bulletMatch) {
            const indent = bulletMatch[1].length;
            return <div key={i} style={{ paddingLeft: `${indent * 8 + 12}px`, textIndent: '-12px' }}>• {renderInline(bulletMatch[3], i)}</div>;
        }
        // Numbered lists
        const numMatch = line.match(/^(\s*)(\d+)\.\s+(.*)/);
        if (numMatch) {
            const indent = numMatch[1].length;
            return <div key={i} style={{ paddingLeft: `${indent * 8 + 16}px`, textIndent: '-16px' }}>{numMatch[2]}. {renderInline(numMatch[3], i)}</div>;
        }
        // Headers
        if (line.startsWith('### ')) return <div key={i} style={{ fontWeight: 600, marginTop: '4px' }}>{renderInline(line.slice(4), i)}</div>;
        if (line.startsWith('## ')) return <div key={i} style={{ fontWeight: 600, fontSize: '14px', marginTop: '4px' }}>{renderInline(line.slice(3), i)}</div>;
        if (line.startsWith('# ')) return <div key={i} style={{ fontWeight: 600, fontSize: '15px', marginTop: '4px' }}>{renderInline(line.slice(2), i)}</div>;
        // Regular line
        return <div key={i}>{renderInline(line, i)}</div>;
    });
}

// ─── Main AI Chat Pane ──────────────────────────────────────────────────────

export function AIChatPane() {
    const [input, setInput] = useState('');
    const [activeModel, setActiveModel] = useState<AIModelConfig | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const abortRef = useRef<AbortController | null>(null);

    // Load active model config
    useEffect(() => {
        loadAISettings().then(settings => {
            const model = settings.models.find(m => m.id === settings.activeModelId);
            setActiveModel(model ?? null);
        });
    }, []);

    // Auto-scroll
    useEffect(() => {
        scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
    }, [messages, isStreaming]);

    const sendMessage = useCallback(async (text: string) => {
        if (!activeModel || isStreaming) return;

        const userMsg: ChatMessage = { id: crypto.randomUUID(), role: 'user', content: text };
        const assistantMsg: ChatMessage = { id: crypto.randomUUID(), role: 'assistant', content: '', toolCalls: [] };

        setMessages(prev => [...prev, userMsg, assistantMsg]);
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
                abortSignal: abort.signal,
                system: `You are a browser automation assistant for Dramaturg (playwright-repl).
You help users interact with web pages by calling browser tools.
Always call the snapshot tool first to see what elements are on the page before taking actions.
Use accessible names from the snapshot, not element refs.
When you execute browser actions, briefly describe what you did and what happened.
Keep responses concise.`,
            });

            let fullText = '';
            const toolCalls: ChatMessage['toolCalls'] = [];

            for await (const part of result.fullStream) {
                if (part.type === 'tool-call') {
                    const input = (part as unknown as Record<string, unknown>).input as Record<string, unknown> ?? {};
                    toolCalls.push({ name: part.toolName, input });
                    setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, toolCalls: [...toolCalls] } : m));
                } else if (part.type === 'tool-result') {
                    const output = (part as unknown as Record<string, unknown>).output;
                    const last = toolCalls.find(t => t.name === part.toolName && !t.result);
                    if (last) {
                        last.result = String(output ?? '');
                        if (part.toolName === 'screenshot' && lastScreenshot) {
                            last.image = lastScreenshot;
                        }
                    }
                    setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, toolCalls: [...toolCalls] } : m));
                } else if (part.type === 'text-delta') {
                    fullText += part.text;
                    setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullText } : m));
                }
            }

            // fullStream already consumed all text, skip textStream
            for await (const chunk of result.textStream) {
                fullText += chunk;
                setMessages(prev => prev.map(m => m.id === assistantMsg.id ? { ...m, content: fullText } : m));
            }
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg !== 'This operation was aborted') {
                console.error('[AI Chat] error:', e);
                setError(msg);
            }
        } finally {
            setIsStreaming(false);
            abortRef.current = null;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeModel, messages, isStreaming]);

    function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;
        const text = input;
        setInput('');
        sendMessage(text);
    }

    function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (input.trim() && !isStreaming) {
                const text = input;
                setInput('');
                sendMessage(text);
            }
        }
    }

    // ─── No model configured ────────────────────────────────────
    if (!activeModel) {
        return (
            <div className="flex flex-col items-center justify-center flex-1 px-4 py-8 text-center opacity-60">
                <p className="text-sm mb-2">No AI model configured.</p>
                <p className="text-xs">Go to Preferences to add an API key.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col flex-1 overflow-hidden">
            {/* Messages */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 text-[13px]">
                {messages.length === 0 && (
                    <div className="opacity-40 text-[13px] text-center mt-6">
                        Ask anything about the page, or describe what you want to do.
                    </div>
                )}
                {messages.map(msg => (
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
                                {msg.content && <div className="leading-relaxed">{renderText(msg.content)}</div>}
                            </div>
                        )}
                    </div>
                ))}
                {isStreaming && messages[messages.length - 1]?.role === 'assistant' && !messages[messages.length - 1]?.content && !messages[messages.length - 1]?.toolCalls?.length && (
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
                <button
                    type="submit"
                    disabled={!input.trim() || isStreaming}
                    className="px-2 py-1 text-[13px] rounded opacity-60 hover:opacity-100 disabled:opacity-20"
                    title="Send (Enter)"
                >
                    ▶
                </button>
            </form>
        </div>
    );
}
