import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionRecorder, SessionPlayer, SessionManager } from '../src/recorder.mjs';

// ─── SessionRecorder ────────────────────────────────────────────────────────

describe('SessionRecorder', () => {
  let recorder;
  let tmpDir;

  beforeEach(() => {
    recorder = new SessionRecorder();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts in idle state', () => {
    expect(recorder.status).toBe('idle');
    expect(recorder.recording).toBe(false);
  });

  it('start() transitions to recording', () => {
    const file = recorder.start(path.join(tmpDir, 'test.pw'));
    expect(recorder.status).toBe('recording');
    expect(recorder.recording).toBe(true);
    expect(file).toContain('test.pw');
  });

  it('start() generates a filename if none provided', () => {
    const file = recorder.start();
    expect(file).toMatch(/^session-.*\.pw$/);
  });

  it('record() captures commands', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.record('click e5');
    recorder.record('fill e7 hello');
    expect(recorder.commandCount).toBe(2);
  });

  it('record() skips empty lines and meta-commands', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.record('');
    recorder.record('  ');
    recorder.record('.help');
    recorder.record('.save');
    expect(recorder.commandCount).toBe(0);
  });

  it('record() does nothing when not recording', () => {
    recorder.record('click e5');
    expect(recorder.commandCount).toBe(0);
  });

  it('save() writes file and returns result', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    recorder.start(filePath);
    recorder.record('open https://example.com');
    recorder.record('click e5');
    const result = recorder.save();

    expect(result.filename).toBe(filePath);
    expect(result.count).toBe(2);
    expect(recorder.status).toBe('idle');

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('# Playwright REPL session');
    expect(content).toContain('open https://example.com');
    expect(content).toContain('click e5');
  });

  it('save() throws when not recording', () => {
    expect(() => recorder.save()).toThrow('Not recording');
  });

  it('pause() toggles paused state', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    expect(recorder.pause()).toBe(true);
    expect(recorder.status).toBe('paused');
    expect(recorder.pause()).toBe(false);
    expect(recorder.status).toBe('recording');
  });

  it('record() skips when paused', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.record('click e5');
    recorder.pause();
    recorder.record('click e6');
    expect(recorder.commandCount).toBe(1);
  });

  it('discard() resets state without saving', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    recorder.start(filePath);
    recorder.record('click e5');
    recorder.discard();
    expect(recorder.status).toBe('idle');
    expect(recorder.commandCount).toBe(0);
    expect(fs.existsSync(filePath)).toBe(false);
  });
});

// ─── SessionPlayer ──────────────────────────────────────────────────────────

describe('SessionPlayer', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function writeFile(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  it('loads commands from a .pw file', () => {
    const filePath = writeFile('test.pw', [
      '# Comment',
      '# Another comment',
      '',
      'open https://example.com',
      'click e5',
      '',
      '# Inline comment',
      'fill e7 hello',
    ].join('\n'));

    const commands = SessionPlayer.load(filePath);
    expect(commands).toEqual([
      'open https://example.com',
      'click e5',
      'fill e7 hello',
    ]);
  });

  it('throws on missing file', () => {
    expect(() => SessionPlayer.load('/nonexistent/file.pw'))
      .toThrow('File not found');
  });

  it('iterates with next()/done/progress', () => {
    const filePath = writeFile('test.pw', 'open https://a.com\nclick e5\nfill e7 x');
    const player = new SessionPlayer(filePath);

    expect(player.done).toBe(false);
    expect(player.progress).toBe('[0/3]');

    expect(player.next()).toBe('open https://a.com');
    expect(player.progress).toBe('[1/3]');

    expect(player.next()).toBe('click e5');
    expect(player.next()).toBe('fill e7 x');
    expect(player.done).toBe(true);
    expect(player.next()).toBeNull();
  });

  it('current returns the current command', () => {
    const filePath = writeFile('test.pw', 'open https://a.com\nclick e5');
    const player = new SessionPlayer(filePath);
    expect(player.current).toBe('open https://a.com');
    player.next();
    expect(player.current).toBe('click e5');
  });

  it('reset() goes back to the start', () => {
    const filePath = writeFile('test.pw', 'open https://a.com\nclick e5');
    const player = new SessionPlayer(filePath);
    player.next();
    player.next();
    expect(player.done).toBe(true);
    player.reset();
    expect(player.done).toBe(false);
    expect(player.current).toBe('open https://a.com');
  });
});

// ─── SessionManager (state machine) ─────────────────────────────────────────

describe('SessionManager', () => {
  let mgr;
  let tmpDir;

  beforeEach(() => {
    mgr = new SessionManager();
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('starts in idle mode', () => {
    expect(mgr.mode).toBe('idle');
  });

  // ── Recording transitions ──

  it('idle → recording → idle (save)', () => {
    const file = mgr.startRecording(path.join(tmpDir, 'test.pw'));
    expect(mgr.mode).toBe('recording');
    expect(file).toContain('test.pw');

    mgr.record('click e5');
    expect(mgr.recordedCount).toBe(1);

    const result = mgr.save();
    expect(result.count).toBe(1);
    expect(mgr.mode).toBe('idle');
  });

  it('idle → recording → paused → recording → idle (save)', () => {
    mgr.startRecording(path.join(tmpDir, 'test.pw'));
    expect(mgr.mode).toBe('recording');

    const paused = mgr.togglePause();
    expect(paused).toBe(true);
    expect(mgr.mode).toBe('paused');

    const resumed = mgr.togglePause();
    expect(resumed).toBe(false);
    expect(mgr.mode).toBe('recording');

    mgr.record('click e5');
    mgr.save();
    expect(mgr.mode).toBe('idle');
  });

  it('idle → recording → idle (discard)', () => {
    mgr.startRecording(path.join(tmpDir, 'test.pw'));
    mgr.record('click e5');
    mgr.discard();
    expect(mgr.mode).toBe('idle');
  });

  // ── Replay transitions ──

  it('idle → replaying → idle', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(filePath, 'click e5\nfill e7 hello', 'utf-8');

    const player = mgr.startReplay(filePath);
    expect(mgr.mode).toBe('replaying');
    expect(player.commands.length).toBe(2);

    mgr.endReplay();
    expect(mgr.mode).toBe('idle');
  });

  // ── Guards ──

  it('startRecording throws when recording', () => {
    mgr.startRecording(path.join(tmpDir, 'a.pw'));
    expect(() => mgr.startRecording(path.join(tmpDir, 'b.pw')))
      .toThrow('Cannot record while recording');
  });

  it('startRecording throws when replaying', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(filePath, 'click e5', 'utf-8');
    mgr.startReplay(filePath);
    expect(() => mgr.startRecording(path.join(tmpDir, 'b.pw')))
      .toThrow('Cannot record while replaying');
  });

  it('save throws when idle', () => {
    expect(() => mgr.save()).toThrow('Not recording');
  });

  it('togglePause throws when idle', () => {
    expect(() => mgr.togglePause()).toThrow('Not recording');
  });

  it('discard throws when idle', () => {
    expect(() => mgr.discard()).toThrow('Not recording');
  });

  it('startReplay throws when recording', () => {
    mgr.startRecording(path.join(tmpDir, 'a.pw'));
    const filePath = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(filePath, 'click e5', 'utf-8');
    expect(() => mgr.startReplay(filePath))
      .toThrow('Cannot replay while recording');
  });

  it('record() no-ops when idle', () => {
    mgr.record('click e5');
    expect(mgr.recordedCount).toBe(0);
  });

  it('step is stored from startReplay', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    fs.writeFileSync(filePath, 'click e5', 'utf-8');
    mgr.startReplay(filePath, true);
    expect(mgr.step).toBe(true);
    mgr.endReplay();
    expect(mgr.step).toBe(false);
  });
});
