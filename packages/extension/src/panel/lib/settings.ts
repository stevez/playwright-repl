// ─── AI Model Config ────────────────────────────────────────────────────────

export type LlmProvider = 'openai' | 'anthropic' | 'github' | 'huggingface';

export interface AIModelConfig {
    id: string;
    name: string;
    provider: LlmProvider;
    apiKey: string;
    model: string;
    baseUrl?: string;
}

export interface AISettings {
    models: AIModelConfig[];
    activeModelId: string;
}

const DEFAULT_AI: AISettings = { models: [], activeModelId: '' };

// ─── General Settings ───────────────────────────────────────────────────────

export type PwReplSettings = {
    openAs: 'sidepanel' | 'popup',
    bridgePort: number,
    languageMode: 'pw' | 'js',
    commandTimeout: number,
};

const DEFAULT: PwReplSettings = { openAs: 'sidepanel', bridgePort: 9876, languageMode: 'pw', commandTimeout: 15000 };

export async function loadSettings(): Promise<PwReplSettings> {
    const stored = await chrome.storage.local.get(['openAs', 'bridgePort', 'languageMode', 'commandTimeout']) as Partial<PwReplSettings>;
    return { ...DEFAULT, ...stored };
}

export async function storeSettings(s: PwReplSettings): Promise<void> {
    await chrome.storage.local.set(s);
}

// ─── AI Settings ────────────────────────────────────────────────────────────

export async function loadAISettings(): Promise<AISettings> {
    const stored = await chrome.storage.local.get(['aiModels', 'aiActiveModelId']);
    return {
        models: (stored.aiModels as AIModelConfig[] | undefined) ?? DEFAULT_AI.models,
        activeModelId: (stored.aiActiveModelId as string | undefined) ?? DEFAULT_AI.activeModelId,
    };
}

export async function storeAISettings(s: AISettings): Promise<void> {
    await chrome.storage.local.set({ aiModels: s.models, aiActiveModelId: s.activeModelId });
}