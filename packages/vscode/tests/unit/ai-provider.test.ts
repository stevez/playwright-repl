import { describe, it, expect, vi } from 'vitest';
import {
  parseSuggestions,
  buildSystemPrompt,
  buildUserPrompt,
  VSCodeLMProvider,
  NoModelsAvailableError,
} from '../../src/ai/provider';

describe('parseSuggestions', () => {
  it('parses a valid JSON array of suggestions', () => {
    const response = '[{"type":"toBeVisible","explanation":"Element should be visible"}]';
    const result = parseSuggestions(response);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ type: 'toBeVisible', explanation: 'Element should be visible' });
  });

  it('parses multiple suggestions with args and negate', () => {
    const response = `[
      {"type":"toHaveText","arg":"Submit","explanation":"Button label"},
      {"type":"toBeEnabled","explanation":"Clickable"},
      {"type":"toBeVisible","negate":true,"explanation":"Should not be visible"}
    ]`;
    const result = parseSuggestions(response);
    expect(result).toHaveLength(3);
    expect(result[0].arg).toBe('Submit');
    expect(result[2].negate).toBe(true);
  });

  it('strips prose and code fences around JSON', () => {
    const response = 'Here are the suggestions:\n```json\n[{"type":"toBeVisible","explanation":"ok"}]\n```';
    const result = parseSuggestions(response);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('toBeVisible');
  });

  it('returns empty array for malformed JSON', () => {
    expect(parseSuggestions('not valid json')).toEqual([]);
    expect(parseSuggestions('[{broken json')).toEqual([]);
  });

  it('returns empty array for empty response', () => {
    expect(parseSuggestions('')).toEqual([]);
  });

  it('filters out suggestions with invalid types', () => {
    const response = '[{"type":"toBeVisible","explanation":"ok"},{"type":"doesNotExist","explanation":"bad"}]';
    const result = parseSuggestions(response);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('toBeVisible');
  });

  it('filters out non-object items', () => {
    const response = '[{"type":"toBeVisible","explanation":"ok"}, "string", null, 42]';
    const result = parseSuggestions(response);
    expect(result).toHaveLength(1);
  });

  it('caps results at 5', () => {
    const items = Array.from({ length: 10 }, () => ({ type: 'toBeVisible', explanation: 'x' }));
    const response = JSON.stringify(items);
    const result = parseSuggestions(response);
    expect(result).toHaveLength(5);
  });

  it('accepts all valid Playwright assertion types', () => {
    const types = ['toBeVisible', 'toHaveText', 'toBeEnabled', 'toHaveAttribute', 'toHaveValue', 'toHaveCount', 'toBeChecked', 'toHaveURL', 'toHaveTitle', 'toHaveRole'];
    const items = types.map(t => ({ type: t, explanation: 'x' }));
    const response = JSON.stringify(items);
    const result = parseSuggestions(response);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(s => types.includes(s.type))).toBe(true);
  });

  it('ignores non-string explanations by setting empty string', () => {
    const response = '[{"type":"toBeVisible"}]';
    const result = parseSuggestions(response);
    expect(result[0].explanation).toBe('');
  });
});

describe('buildSystemPrompt', () => {
  it('includes expected instructions', () => {
    const prompt = buildSystemPrompt();
    expect(prompt).toContain('JSON array');
    expect(prompt).toContain('Playwright');
    expect(prompt).toContain('toHaveAttribute');
    expect(prompt).toContain('importance');
  });
});

describe('buildUserPrompt', () => {
  it('includes locator, tag, text, attributes', () => {
    const prompt = buildUserPrompt(
      { tag: 'BUTTON', text: 'Submit', attributes: { type: 'submit', class: 'primary' } },
      '',
      "page.getByRole('button')",
    );
    expect(prompt).toContain("page.getByRole('button')");
    expect(prompt).toContain('BUTTON');
    expect(prompt).toContain('Submit');
    expect(prompt).toContain('type="submit"');
  });

  it('omits missing fields', () => {
    const prompt = buildUserPrompt({}, '', 'page.locator("#x")');
    expect(prompt).toContain('page.locator("#x")');
    expect(prompt).not.toContain('Tag:');
    expect(prompt).not.toContain('Attributes:');
  });

  it('includes ARIA snapshot when provided', () => {
    const prompt = buildUserPrompt({}, '- button "Submit"', 'loc');
    expect(prompt).toContain('ARIA snapshot');
    expect(prompt).toContain('- button "Submit"');
  });

  it('includes value and checked for inputs', () => {
    const prompt = buildUserPrompt(
      { tag: 'INPUT', value: 'hello', checked: true },
      '',
      'loc',
    );
    expect(prompt).toContain('"hello"');
    expect(prompt).toContain('Checked: true');
  });

  it('truncates long attribute values', () => {
    const longVal = 'x'.repeat(200);
    const prompt = buildUserPrompt(
      { attributes: { data: longVal } },
      '',
      'loc',
    );
    // Should be truncated to 100 chars
    expect(prompt).toContain('x'.repeat(100));
    expect(prompt).not.toContain('x'.repeat(150));
  });

  it('limits to first 15 attributes', () => {
    const attrs: Record<string, string> = {};
    for (let i = 0; i < 20; i++) attrs[`attr${i}`] = `val${i}`;
    const prompt = buildUserPrompt({ attributes: attrs }, '', 'loc');
    expect(prompt).toContain('attr14');
    expect(prompt).not.toContain('attr15');
  });
});

describe('VSCodeLMProvider', () => {
  function makeVscode(lm: any = undefined): any {
    return {
      lm,
      LanguageModelChatMessage: {
        User: (text: string) => ({ role: 'user', text }),
      },
      CancellationTokenSource: class {
        token = {};
      },
      workspace: {
        getConfiguration: () => ({
          get: () => '',
        }),
      },
    };
  }

  it('isAvailable returns false when lm is not available', async () => {
    const provider = new VSCodeLMProvider(makeVscode());
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable returns false when no models available', async () => {
    const provider = new VSCodeLMProvider(makeVscode({
      selectChatModels: async () => [],
    }));
    expect(await provider.isAvailable()).toBe(false);
  });

  it('isAvailable returns true when models are available', async () => {
    const provider = new VSCodeLMProvider(makeVscode({
      selectChatModels: async () => [{ id: 'copilot-gpt4' }],
    }));
    expect(await provider.isAvailable()).toBe(true);
  });

  it('suggestAssertions throws NoModelsAvailableError when lm is missing', async () => {
    const provider = new VSCodeLMProvider(makeVscode());
    await expect(provider.suggestAssertions({}, '', 'loc')).rejects.toThrow(NoModelsAvailableError);
  });

  it('suggestAssertions throws NoModelsAvailableError when no models', async () => {
    const provider = new VSCodeLMProvider(makeVscode({
      selectChatModels: async () => [],
    }));
    await expect(provider.suggestAssertions({}, '', 'loc')).rejects.toThrow(NoModelsAvailableError);
  });

  it('suggestAssertions returns parsed suggestions from model', async () => {
    const mockModel = {
      sendRequest: vi.fn(async () => ({
        text: (async function*() {
          yield '[{"type":"toBeVisible","explanation":"ok"}]';
        })(),
      })),
    };
    const provider = new VSCodeLMProvider(makeVscode({
      selectChatModels: async () => [mockModel],
    }));
    const suggestions = await provider.suggestAssertions({ tag: 'BUTTON' }, '', "page.getByRole('button')");
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].type).toBe('toBeVisible');
    expect(mockModel.sendRequest).toHaveBeenCalled();
  });
});
