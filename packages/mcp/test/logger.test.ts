// @ts-nocheck
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdirSync, appendFileSync } from 'node:fs';

// Mock node:fs to avoid writing real log files
vi.mock('node:fs', () => ({
  mkdirSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import {
  logStartup, logEvent, logToolCall, logToolResult, logError, logHttp,
  LOG_FILE, HTTP_LOG_FILE,
} from '../src/logger.js';

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Exports ────────────────────────────────────────────────────────

  it('exports LOG_FILE path', () => {
    expect(LOG_FILE).toContain('mcp.log');
  });

  it('exports HTTP_LOG_FILE path', () => {
    expect(HTTP_LOG_FILE).toContain('http.log');
  });

  // ─── logStartup ────────────────────────────────────────────────────

  it('writes startup message to log', () => {
    logStartup('bridge', 'log → /tmp/mcp.log');
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('Server started [bridge] log → /tmp/mcp.log'),
    );
  });

  // ─── logEvent ──────────────────────────────────────────────────────

  it('writes event message', () => {
    logEvent('Extension connected');
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('Extension connected'),
    );
  });

  // ─── logToolCall ───────────────────────────────────────────────────

  it('logs tool call with arguments', () => {
    logToolCall('run_command', { command: 'snapshot' });
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('-> run_command(command=snapshot)'),
    );
  });

  it('truncates long tool call arguments', () => {
    const longArg = 'x'.repeat(200);
    logToolCall('run_command', { command: longArg });
    const call = appendFileSync.mock.calls[0][1];
    expect(call).toContain('...');
    expect(call).toContain('chars');
  });

  it('stringifies non-string arguments', () => {
    logToolCall('run_command', { options: { force: true } });
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('options={"force":true}'),
    );
  });

  // ─── logToolResult ─────────────────────────────────────────────────

  it('logs OK result', () => {
    logToolResult('run_command', false, 'Clicked button', 42);
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('<- run_command [OK] 42ms Clicked button'),
    );
  });

  it('logs ERROR result', () => {
    logToolResult('run_command', true, 'Element not found', 100);
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('<- run_command [ERROR] 100ms Element not found'),
    );
  });

  it('handles empty result text', () => {
    logToolResult('run_command', false, undefined, 5);
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('(empty)'),
    );
  });

  it('truncates long result text', () => {
    const longText = 'y'.repeat(300);
    logToolResult('run_command', false, longText, 10);
    const call = appendFileSync.mock.calls[0][1];
    expect(call).toContain('...');
  });

  it('replaces newlines in result text', () => {
    logToolResult('run_command', false, 'line1\nline2\nline3', 10);
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('line1\\nline2\\nline3'),
    );
  });

  // ─── logError ──────────────────────────────────────────────────────

  it('logs Error objects', () => {
    logError('run_command', new Error('timeout'));
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('run_command: timeout'),
    );
  });

  it('logs non-Error values', () => {
    logError('run_command', 'string error');
    expect(appendFileSync).toHaveBeenCalledWith(
      LOG_FILE,
      expect.stringContaining('run_command: string error'),
    );
  });

  // ─── logHttp ───────────────────────────────────────────────────────

  it('writes to HTTP log file', () => {
    logHttp('→ snapshot');
    expect(appendFileSync).toHaveBeenCalledWith(
      HTTP_LOG_FILE,
      expect.stringContaining('→ snapshot'),
    );
  });

  // ─── Timestamp format ──────────────────────────────────────────────

  it('includes timestamp in YYYY-MM-DD HH:MM:SS format', () => {
    logEvent('test');
    const call = appendFileSync.mock.calls[0][1];
    expect(call).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
  });
});
