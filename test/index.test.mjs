/**
 * Tests that index.mjs re-exports all public API.
 */
import { describe, it, expect } from 'vitest';
import * as api from '../src/index.mjs';

describe('index.mjs exports', () => {
  it('exports DaemonConnection', () => {
    expect(api.DaemonConnection).toBeDefined();
    expect(typeof api.DaemonConnection).toBe('function');
  });

  it('exports parseInput', () => {
    expect(typeof api.parseInput).toBe('function');
  });

  it('exports ALIASES', () => {
    expect(typeof api.ALIASES).toBe('object');
  });

  it('exports ALL_COMMANDS', () => {
    expect(Array.isArray(api.ALL_COMMANDS)).toBe(true);
  });

  it('exports SessionRecorder', () => {
    expect(typeof api.SessionRecorder).toBe('function');
  });

  it('exports SessionPlayer', () => {
    expect(typeof api.SessionPlayer).toBe('function');
  });

  it('exports socketPath', () => {
    expect(typeof api.socketPath).toBe('function');
  });

  it('exports isDaemonRunning', () => {
    expect(typeof api.isDaemonRunning).toBe('function');
  });

  it('exports startDaemon', () => {
    expect(typeof api.startDaemon).toBe('function');
  });

  it('exports findWorkspaceDir', () => {
    expect(typeof api.findWorkspaceDir).toBe('function');
  });

  it('exports startRepl', () => {
    expect(typeof api.startRepl).toBe('function');
  });
});
