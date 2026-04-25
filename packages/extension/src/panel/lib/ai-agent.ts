/**
 * AI agent setup — model factory and browser tool definitions.
 */

import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { jsonSchema } from 'ai';
import type { AIModelConfig } from './settings';
import { executeCommandForConsole } from './bridge';

// ─── Model factory ──────────────────────────────────────────────────────────

const PROVIDER_BASE_URLS: Record<string, string> = {
  github: 'https://models.github.ai/inference',
};

export function createModel(config: AIModelConfig): any {
  const { provider, apiKey, model, baseUrl } = config;

  switch (provider) {
    case 'openai':
    case 'github': {
      const openai = createOpenAI({
        apiKey,
        ...(baseUrl || PROVIDER_BASE_URLS[provider] ? { baseURL: baseUrl ?? PROVIDER_BASE_URLS[provider] } : {}),
      });
      // .chat() uses /chat/completions (compatible with GitHub Models)
      return openai.chat(model);
    }
    case 'anthropic': {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(model);
    }
    default:
      throw new Error(`Unknown LLM provider: ${provider}`);
  }
}

// ─── Browser tools for the LLM ──────────────────────────────────────────────

/** Last screenshot taken — read by AIChatPane to display inline. */
export let lastScreenshot: string | null = null;

async function runPwCommand(command: string): Promise<string> {
  try {
    const result = await executeCommandForConsole(command);
    if ('image' in result && result.image) {
      lastScreenshot = result.image;
      return '[screenshot taken]';
    }
    if ('text' in result) return result.text ?? 'Done';
    return 'Done';
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return `Error: ${msg}`;
  }
}

// JSON Schema helpers
const str = (desc: string) => ({ type: 'string' as const, description: desc });
const optStr = (desc: string) => ({ type: 'string' as const, description: desc });
const emptyObj = jsonSchema({ type: 'object', properties: {} });
const obj = (props: Record<string, any>, required?: string[]) =>
  jsonSchema({ type: 'object', properties: props, required: required ?? Object.keys(props) });

/**
 * Tool definitions using inputSchema + jsonSchema (AI SDK v5).
 */
export const browserTools = {
  snapshot: {
    description: 'Take an accessibility snapshot of the current page. Call this first to see what elements are on the page.',
    inputSchema: emptyObj,
    execute: async () => runPwCommand('snapshot'),
  },
  goto: {
    description: 'Navigate to a URL.',
    inputSchema: obj({ url: str('The URL to navigate to') }),
    execute: async ({ url }: any) => runPwCommand(`goto ${url}`),
  },
  click: {
    description: 'Click an element by its accessible name and optional role.',
    inputSchema: obj(
      { label: str('The accessible name of the element'), role: optStr('The ARIA role (button, link, etc.)') },
      ['label'],
    ),
    execute: async ({ label, role }: any) =>
      runPwCommand(role ? `click ${role} "${label}"` : `click "${label}"`),
  },
  fill: {
    description: 'Fill a form field with a value.',
    inputSchema: obj(
      { label: str('The accessible name or label of the field'), value: str('The value to fill'), role: optStr('The ARIA role (textbox, combobox, etc.)') },
      ['label', 'value'],
    ),
    execute: async ({ label, value, role }: any) =>
      runPwCommand(role ? `fill ${role} "${label}" "${value}"` : `fill "${label}" "${value}"`),
  },
  press: {
    description: 'Press a keyboard key (Enter, Tab, Escape, etc.).',
    inputSchema: obj({ key: str('The key to press') }),
    execute: async ({ key }: any) => runPwCommand(`press ${key}`),
  },
  select: {
    description: 'Select a dropdown option.',
    inputSchema: obj({ label: str('The accessible name of the dropdown'), value: str('The option to select') }),
    execute: async ({ label, value }: any) => runPwCommand(`select "${label}" "${value}"`),
  },
  hover: {
    description: 'Hover over an element.',
    inputSchema: obj(
      { label: str('The accessible name of the element'), role: optStr('The ARIA role') },
      ['label'],
    ),
    execute: async ({ label, role }: any) =>
      runPwCommand(role ? `hover ${role} "${label}"` : `hover "${label}"`),
  },
  check: {
    description: 'Check a checkbox.',
    inputSchema: obj({ label: str('The accessible name of the checkbox') }),
    execute: async ({ label }: any) => runPwCommand(`check "${label}"`),
  },
  uncheck: {
    description: 'Uncheck a checkbox.',
    inputSchema: obj({ label: str('The accessible name of the checkbox') }),
    execute: async ({ label }: any) => runPwCommand(`uncheck "${label}"`),
  },
  type_text: {
    description: 'Type text key by key into the focused element.',
    inputSchema: obj({ text: str('The text to type') }),
    execute: async ({ text }: any) => runPwCommand(`type "${text}"`),
  },
  verify_text: {
    description: 'Assert that text is visible on the page.',
    inputSchema: obj({ text: str('The text to verify') }),
    execute: async ({ text }: any) => runPwCommand(`verify-text "${text}"`),
  },
  screenshot: {
    description: 'Take a screenshot of the current page.',
    inputSchema: emptyObj,
    execute: async () => runPwCommand('screenshot'),
  },
};
