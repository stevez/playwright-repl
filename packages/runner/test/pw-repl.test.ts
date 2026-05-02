// @ts-nocheck
import { describe, it, expect } from 'vitest';

describe('handleRepl', () => {
  it('exports handleRepl function', async () => {
    const { handleRepl } = await import('../src/pw-repl.js');
    expect(typeof handleRepl).toBe('function');
  });
});
