/**
 * LLM provider configuration — types and pure utility functions.
 *
 * No AI SDK runtime dependency. The createModel() factory lives in
 * the consumer (extension, cli) where the AI SDK packages are installed.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export type LlmProvider = 'openai' | 'anthropic' | 'github' | 'huggingface';

export interface LlmModelConfig {
  /** Unique identifier for this model config. */
  id: string;
  /** Display name (e.g., "My GPT-4o"). */
  name: string;
  /** Provider identifier. */
  provider: LlmProvider;
  /** API key for the provider. */
  apiKey: string;
  /** Model identifier (e.g., 'gpt-4o', 'claude-sonnet-4-5-20250514'). */
  model: string;
  /** Custom base URL (e.g., for Ollama or custom endpoints). */
  baseUrl?: string;
}

export interface LlmSettings {
  /** All configured models. */
  models: LlmModelConfig[];
  /** ID of the currently active model. */
  activeModelId: string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Default models per provider. */
export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-5-20250514',
  github: 'openai/gpt-4o',
  huggingface: 'meta-llama/Llama-3.1-70B-Instruct',
};

/** Default base URLs per provider (empty = use SDK default). */
export const PROVIDER_BASE_URLS: Record<string, string> = {
  github: 'https://models.github.ai/inference',
};

/** Environment variable names for API keys per provider. */
export const PROVIDER_ENV_KEYS: Record<LlmProvider, string> = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  github: 'GITHUB_TOKEN',
  huggingface: 'HF_TOKEN',
};

// ─── Utility functions ─────────────────────────────────────────────────────

/**
 * Resolve the active model config from settings.
 */
export function getActiveModel(settings: LlmSettings): LlmModelConfig {
  const config = settings.models.find(m => m.id === settings.activeModelId);
  if (!config) throw new Error('No active LLM model configured');
  return config;
}

/**
 * Resolve LLM config from environment variables.
 * Used by CLI — the extension uses chrome.storage.local instead.
 */
export function resolveConfigFromEnv(overrides?: Partial<LlmModelConfig>): LlmModelConfig {
  const provider = (overrides?.provider ?? process.env.PLAYWRIGHT_REPL_LLM_PROVIDER ?? 'github') as LlmProvider;
  const apiKey = overrides?.apiKey ?? process.env.PLAYWRIGHT_REPL_API_KEY ?? process.env[PROVIDER_ENV_KEYS[provider]] ?? '';
  const model = overrides?.model ?? DEFAULT_MODELS[provider];

  return {
    id: 'env',
    name: `${provider}/${model}`,
    provider,
    apiKey,
    model,
    baseUrl: overrides?.baseUrl,
  };
}
