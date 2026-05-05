// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { SessionRecorder, SessionPlayer, SessionManager } from '../src/session-recorder.js';

const SAMPLE_SNAPSHOT = `\
- document [ref=e1]:
  - heading "Welcome" [level=2] [ref=e2]
  - navigation "Main":
    - link "Home" [ref=e3]
    - link "About" [ref=e4]
  - main:
    - textbox "Email" [ref=e5]
    - button "Sign in" [ref=e6]
    - img [ref=e7]
    - checkbox "Remember me" [checked] [ref=e8]
`;

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

  it('record() skips recording-related commands', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.record('start-recording');
    recorder.record('stop-recording');
    recorder.record('pause-recording');
    recorder.record('discard-recording');
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

  it('stop() returns commands without saving to file', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    recorder.start(filePath);
    recorder.record('goto https://example.com');
    recorder.record('click e5');
    const result = recorder.stop();

    expect(result.commands).toEqual(['goto https://example.com', 'click e5']);
    expect(result.count).toBe(2);
    expect(recorder.status).toBe('idle');
    expect(fs.existsSync(filePath)).toBe(false);
  });

  it('stop() throws when not recording', () => {
    expect(() => recorder.stop()).toThrow('Not recording');
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

  // ── Ref-to-locator resolution ──────────────────────────────────

  it('resolves ref to text locator when snapshot is set', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('click e6');
    expect(recorder.commands[0]).toBe('click button "Sign in"');
  });

  it('resolves ref for fill command, keeping value', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('fill e5 "hello world"');
    expect(recorder.commands[0]).toBe('fill textbox "Email" "hello world"');
  });

  it('resolves ref for check/uncheck', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('check e8');
    expect(recorder.commands[0]).toBe('check checkbox "Remember me"');
  });

  it('resolves ref for hover', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('hover e3');
    expect(recorder.commands[0]).toBe('hover link "Home"');
  });

  it('resolves ref for dblclick', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('dblclick e6');
    expect(recorder.commands[0]).toBe('dblclick button "Sign in"');
  });

  it('resolves ref for press with key', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('press e5 Enter');
    expect(recorder.commands[0]).toBe('press textbox "Email" Enter');
  });

  it('preserves flags when resolving refs', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('click e6 --button right');
    expect(recorder.commands[0]).toBe('click button "Sign in" --button right');
  });

  it('does not resolve refs when no snapshot is set', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.record('click e5');
    expect(recorder.commands[0]).toBe('click e5');
  });

  it('does not resolve non-ref text arguments', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('click "Sign in"');
    expect(recorder.commands[0]).toBe('click "Sign in"');
  });

  it('does not resolve refs in non-action commands', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('goto e5');
    expect(recorder.commands[0]).toBe('goto e5');
  });

  it('keeps original command when ref is not found in snapshot', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('click e99');
    expect(recorder.commands[0]).toBe('click e99');
  });

  // ── Alias resolution ──────────────────────────────────────────

  it('resolves aliases to canonical command names', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.record('s');
    expect(recorder.commands[0]).toBe('snapshot');
  });

  it('resolves aliases combined with ref resolution', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('c e6');
    expect(recorder.commands[0]).toBe('click button "Sign in"');
  });

  it('resolves fill alias with ref and value', () => {
    recorder.start(path.join(tmpDir, 'test.pw'));
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('f e5 hello');
    expect(recorder.commands[0]).toBe('fill textbox "Email" hello');
  });

  // ── Snapshot clears on stop ────────────────────────────────────

  it('clears snapshot on save', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    recorder.start(filePath);
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.save();

    // Start a new recording — refs should NOT be resolved (snapshot cleared)
    recorder.start(path.join(tmpDir, 'test2.pw'));
    recorder.record('click e6');
    expect(recorder.commands[0]).toBe('click e6');
  });

  // ── .pw file with resolved locators ───────────────────────────

  it('saves .pw file with resolved locators', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    recorder.start(filePath);
    recorder.setSnapshot(SAMPLE_SNAPSHOT);
    recorder.record('goto https://example.com');
    recorder.record('click e6');
    recorder.record('fill e5 admin@test.com');
    recorder.record('check e8');
    recorder.save();

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('goto https://example.com');
    expect(content).toContain('click button "Sign in"');
    expect(content).toContain('fill textbox "Email" admin@test.com');
    expect(content).toContain('check checkbox "Remember me"');
    expect(content).not.toContain('e5');
    expect(content).not.toContain('e6');
    expect(content).not.toContain('e8');
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

  it('substitutes {{variables}} in loaded file', () => {
    const filePath = writeFile('test.pw', 'click "{{period}}"');
    const commands = SessionPlayer.load(filePath, { period: 'January 2026' });
    expect(commands).toEqual(['click "January 2026"']);
  });

  it('throws on unresolved variables', () => {
    const filePath = writeFile('test.pw', 'click "{{period}}"');
    expect(() => SessionPlayer.load(filePath)).toThrow('Missing variables: period');
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

  it('idle → recording → idle (stop without saving)', () => {
    mgr.startRecording(path.join(tmpDir, 'test.pw'));
    mgr.record('click e5');
    mgr.record('fill e7 hello');

    const result = mgr.stop();
    expect(result.commands).toEqual(['click e5', 'fill e7 hello']);
    expect(result.count).toBe(2);
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

  // ── Snapshot tracking ──

  it('setSnapshot feeds snapshot to recorder for ref resolution', () => {
    const filePath = path.join(tmpDir, 'test.pw');
    mgr.startRecording(filePath);
    mgr.setSnapshot(SAMPLE_SNAPSHOT);
    mgr.record('click e6');
    mgr.record('fill e5 hello');
    const result = mgr.save();

    const content = fs.readFileSync(filePath, 'utf-8');
    expect(content).toContain('click button "Sign in"');
    expect(content).toContain('fill textbox "Email" hello');
    expect(result.count).toBe(2);
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

  it('stop throws when idle', () => {
    expect(() => mgr.stop()).toThrow('Not recording');
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
