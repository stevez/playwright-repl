import { describe, it, expect, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import { buildBridgeErrorContext } from '../../src/utils';

describe('buildBridgeErrorContext', () => {
  it('generates markdown with instructions, test info, and error details', () => {
    const result = buildBridgeErrorContext(
      'should add todo',
      '/fake/tests/todo.spec.ts',
      'expect(received).toBe(expected)\n\nExpected: 2\nReceived: 1',
    );

    expect(result).toContain('# Instructions');
    expect(result).toContain('Explain why, be concise');
    expect(result).toContain('# Test info');
    expect(result).toContain('should add todo');
    expect(result).toContain('# Error details');
    expect(result).toContain('expect(received).toBe(expected)');
    expect(result).toContain('Expected: 2');
    expect(result).toContain('Received: 1');
  });

  it('includes test source when file is readable', () => {
    const spy = vi.spyOn(fs, 'readFileSync').mockReturnValue(
      "import { test, expect } from '@playwright/test';\ntest('should add todo', async () => {\n  expect(1).toBe(2);\n});\n"
    );

    const result = buildBridgeErrorContext(
      'should add todo',
      '/fake/tests/todo.spec.ts',
      'error',
    );

    expect(result).toContain('# Test source');
    expect(result).toContain("import { test, expect }");
    expect(result).toContain('expect(1).toBe(2)');
    // Line numbers
    expect(result).toContain('  1 |');
    expect(result).toContain('  2 |');

    spy.mockRestore();
  });

  it('omits test source when file is not readable', () => {
    const spy = vi.spyOn(fs, 'readFileSync').mockImplementation(() => { throw new Error('ENOENT'); });

    const result = buildBridgeErrorContext(
      'should add todo',
      '/fake/tests/todo.spec.ts',
      'error',
    );

    expect(result).not.toContain('# Test source');

    spy.mockRestore();
  });

  it('uses relative file path in test info', () => {
    const result = buildBridgeErrorContext(
      'my test',
      path.join(process.cwd(), 'tests', 'example.spec.ts'),
      'error',
    );

    expect(result).toContain(`tests${path.sep}example.spec.ts >> my test`);
    expect(result).not.toContain(process.cwd());
  });
});
