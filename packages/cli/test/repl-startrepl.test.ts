// @ts-nocheck
/**
 * Tests for startRepl() — basic orchestration.
 * Bridge mode tests removed (bridge mode deprecated in favor of relay).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { startRepl } from '../src/repl.js';

describe('startRepl', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let exitSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    exitSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('prints banner when not silent', async () => {
    // startRepl defaults to relay mode which needs playwright — just verify it starts
    // without crashing before the import fails in test env
    try {
      await startRepl({});
    } catch {
      // Expected — playwright not available in test env
    }
    const output = logSpy.mock.calls.map((c: unknown[]) => c.join(' ')).join('\n');
    expect(output).toContain('Playwright REPL');
  });
});
