import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { findWorkspaceDir, socketPath, daemonProfilesDir, workspaceDirHash } from '../src/workspace.mjs';

describe('findWorkspaceDir', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ws-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns undefined when no .playwright directory found', () => {
    // Create a deep nested dir so the 10-level walk limit expires
    // before reaching any real .playwright dir above tmpDir
    let deep = tmpDir;
    for (let i = 0; i < 12; i++) {
      deep = path.join(deep, `n${i}`);
    }
    fs.mkdirSync(deep, { recursive: true });
    expect(findWorkspaceDir(deep)).toBeUndefined();
  });

  it('finds .playwright in the start directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.playwright'));
    expect(findWorkspaceDir(tmpDir)).toBe(tmpDir);
  });

  it('finds .playwright in a parent directory', () => {
    fs.mkdirSync(path.join(tmpDir, '.playwright'));
    const child = path.join(tmpDir, 'sub', 'deep');
    fs.mkdirSync(child, { recursive: true });
    expect(findWorkspaceDir(child)).toBe(tmpDir);
  });

  it('stops walking after 10 levels', () => {
    // Create a deeply nested path (>10 levels from tmpDir)
    let deep = tmpDir;
    for (let i = 0; i < 15; i++) {
      deep = path.join(deep, `d${i}`);
    }
    fs.mkdirSync(deep, { recursive: true });
    // Put .playwright at tmpDir — should not be found from 15 levels deep
    fs.mkdirSync(path.join(tmpDir, '.playwright'));
    expect(findWorkspaceDir(deep)).toBeUndefined();
  });
});

describe('socketPath', () => {
  it('returns a string containing the session name', () => {
    const p = socketPath('my-session');
    expect(p).toContain('my-session');
  });

  it('returns a string containing the workspace hash', () => {
    const p = socketPath('default');
    expect(p).toContain(workspaceDirHash);
  });

  it('returns different paths for different sessions', () => {
    const a = socketPath('session-a');
    const b = socketPath('session-b');
    expect(a).not.toBe(b);
  });

  if (process.platform === 'win32') {
    it('uses named pipe format on windows', () => {
      const p = socketPath('default');
      expect(p).toMatch(/^\\\\\.\\/);
    });
  } else {
    it('uses unix socket format on non-windows', () => {
      const p = socketPath('default');
      expect(p).toMatch(/\.sock$/);
    });
  }
});

describe('workspaceDirHash', () => {
  it('is a 16-character hex string', () => {
    expect(workspaceDirHash).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('daemonProfilesDir', () => {
  it('is a non-empty string containing the hash', () => {
    expect(typeof daemonProfilesDir).toBe('string');
    expect(daemonProfilesDir.length).toBeGreaterThan(0);
    expect(daemonProfilesDir).toContain(workspaceDirHash);
  });
});
