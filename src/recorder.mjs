/**
 * Session recorder and player.
 *
 * Records REPL commands to .pw files and replays them.
 *
 * File format (.pw):
 *   - One command per line (exactly as typed in REPL)
 *   - Comments start with #
 *   - Blank lines are ignored
 *   - First line is a metadata comment with timestamp
 *
 * Example:
 *   # Login test
 *   # recorded 2026-02-09T19:30:00Z
 *
 *   open https://myapp.com
 *   snapshot
 *   click e5
 *   fill e7 admin@test.com
 *   fill e9 password123
 *   click e12
 *   verify-text Welcome back
 */

import fs from 'node:fs';
import path from 'node:path';

// ─── Session Recorder ────────────────────────────────────────────────────────

export class SessionRecorder {
  constructor() {
    this.commands = [];
    this.recording = false;
    this.filename = null;
    this.paused = false;
  }

  /**
   * Start recording commands.
   * @param {string} [filename] - Output file path. If not provided, uses a timestamp.
   */
  start(filename) {
    this.filename = filename || `session-${new Date().toISOString().replace(/[:.]/g, '-')}.pw`;
    this.commands = [];
    this.recording = true;
    this.paused = false;
    return this.filename;
  }

  /**
   * Record a command (called after each successful REPL command).
   * Skips meta-commands (lines starting with .).
   */
  record(line) {
    if (!this.recording || this.paused) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('.')) return;
    this.commands.push(trimmed);
  }

  /**
   * Pause recording (toggle).
   */
  pause() {
    this.paused = !this.paused;
    return this.paused;
  }

  /**
   * Stop recording and save to file.
   * @returns {{ filename: string, count: number }}
   */
  save() {
    if (!this.recording) throw new Error('Not recording');

    const header = [
      `# Playwright REPL session`,
      `# recorded ${new Date().toISOString()}`,
      ``,
    ];

    const content = [...header, ...this.commands, ''].join('\n');

    // Ensure directory exists
    const dir = path.dirname(this.filename);
    if (dir && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filename, content, 'utf-8');

    const result = { filename: this.filename, count: this.commands.length };

    this.recording = false;
    this.commands = [];
    this.filename = null;
    this.paused = false;

    return result;
  }

  /**
   * Discard recording without saving.
   */
  discard() {
    this.recording = false;
    this.commands = [];
    this.filename = null;
    this.paused = false;
  }

  get status() {
    if (!this.recording) return 'idle';
    if (this.paused) return 'paused';
    return 'recording';
  }

  get commandCount() {
    return this.commands.length;
  }
}

// ─── Session Player ──────────────────────────────────────────────────────────

export class SessionPlayer {
  /**
   * Load commands from a .pw file.
   * @param {string} filename
   * @returns {string[]} Array of command lines
   */
  static load(filename) {
    if (!fs.existsSync(filename)) {
      throw new Error(`File not found: ${filename}`);
    }

    const content = fs.readFileSync(filename, 'utf-8');
    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  }

  /**
   * Create a player that yields commands one at a time.
   * Supports step-through mode where it pauses between commands.
   */
  constructor(filename) {
    this.filename = filename;
    this.commands = SessionPlayer.load(filename);
    this.index = 0;
  }

  get done() {
    return this.index >= this.commands.length;
  }

  get current() {
    return this.commands[this.index] || null;
  }

  get progress() {
    return `[${this.index}/${this.commands.length}]`;
  }

  next() {
    if (this.done) return null;
    return this.commands[this.index++];
  }

  reset() {
    this.index = 0;
  }
}

// ─── Session Manager (state machine) ────────────────────────────────────────
//
//  States: idle → recording ⇄ paused → idle
//                                       idle → replaying → idle
//

export class SessionManager {
  #recorder = new SessionRecorder();
  #player = null;
  #step = false;

  /** Current mode: 'idle' | 'recording' | 'paused' | 'replaying' */
  get mode() {
    if (this.#player && !this.#player.done) return 'replaying';
    return this.#recorder.status;
  }

  // ── Recording ──────────────────────────────────────────────────

  startRecording(filename) {
    if (this.mode !== 'idle') throw new Error(`Cannot record while ${this.mode}`);
    return this.#recorder.start(filename);
  }

  save() {
    if (this.mode !== 'recording' && this.mode !== 'paused')
      throw new Error('Not recording');
    return this.#recorder.save();
  }

  togglePause() {
    if (this.mode !== 'recording' && this.mode !== 'paused')
      throw new Error('Not recording');
    return this.#recorder.pause();
  }

  discard() {
    if (this.mode !== 'recording' && this.mode !== 'paused')
      throw new Error('Not recording');
    this.#recorder.discard();
  }

  /** Called after each successful command — records if active. */
  record(line) {
    this.#recorder.record(line);
  }

  get recordingFilename() { return this.#recorder.filename; }
  get recordedCount() { return this.#recorder.commandCount; }

  // ── Playback ───────────────────────────────────────────────────

  startReplay(filename, step = false) {
    if (this.mode !== 'idle') throw new Error(`Cannot replay while ${this.mode}`);
    this.#player = new SessionPlayer(filename);
    this.#step = step;
    return this.#player;
  }

  endReplay() {
    this.#player = null;
    this.#step = false;
  }

  get player() { return this.#player; }
  get step() { return this.#step; }
}
