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
  commands: string[] = [];
  recording = false;
  filename: string | null = null;
  paused = false;

  /**
   * Start recording commands.
   */
  start(filename?: string): string {
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
  record(line: string): void {
    if (!this.recording || this.paused) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('.')) return;
    this.commands.push(trimmed);
  }

  /**
   * Pause recording (toggle).
   */
  pause(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  /**
   * Stop recording and save to file.
   */
  save(): { filename: string; count: number } {
    if (!this.recording) throw new Error('Not recording');

    const header = [
      `# Playwright REPL session`,
      `# recorded ${new Date().toISOString()}`,
      ``,
    ];

    const content = [...header, ...this.commands, ''].join('\n');

    // Ensure directory exists
    const dir = path.dirname(this.filename!);
    if (dir && dir !== '.') {
      fs.mkdirSync(dir, { recursive: true });
    }

    fs.writeFileSync(this.filename!, content, 'utf-8');

    const result = { filename: this.filename!, count: this.commands.length };

    this.recording = false;
    this.commands = [];
    this.filename = null;
    this.paused = false;

    return result;
  }

  /**
   * Discard recording without saving.
   */
  discard(): void {
    this.recording = false;
    this.commands = [];
    this.filename = null;
    this.paused = false;
  }

  get status(): string {
    if (!this.recording) return 'idle';
    if (this.paused) return 'paused';
    return 'recording';
  }

  get commandCount(): number {
    return this.commands.length;
  }
}

// ─── Session Player ──────────────────────────────────────────────────────────

export class SessionPlayer {
  filename: string;
  commands: string[];
  index = 0;

  /**
   * Load commands from a .pw file.
   */
  static load(filename: string): string[] {
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
  constructor(filename: string) {
    this.filename = filename;
    this.commands = SessionPlayer.load(filename);
  }

  get done(): boolean {
    return this.index >= this.commands.length;
  }

  get current(): string | null {
    return this.commands[this.index] || null;
  }

  get progress(): string {
    return `[${this.index}/${this.commands.length}]`;
  }

  next(): string | null {
    if (this.done) return null;
    return this.commands[this.index++];
  }

  reset(): void {
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
  #player: SessionPlayer | null = null;
  #step = false;

  /** Current mode: 'idle' | 'recording' | 'paused' | 'replaying' */
  get mode(): string {
    if (this.#player && !this.#player.done) return 'replaying';
    return this.#recorder.status;
  }

  // ── Recording ──────────────────────────────────────────────────

  startRecording(filename?: string): string {
    if (this.mode !== 'idle') throw new Error(`Cannot record while ${this.mode}`);
    return this.#recorder.start(filename);
  }

  save(): { filename: string; count: number } {
    if (this.mode !== 'recording' && this.mode !== 'paused')
      throw new Error('Not recording');
    return this.#recorder.save();
  }

  togglePause(): boolean {
    if (this.mode !== 'recording' && this.mode !== 'paused')
      throw new Error('Not recording');
    return this.#recorder.pause();
  }

  discard(): void {
    if (this.mode !== 'recording' && this.mode !== 'paused')
      throw new Error('Not recording');
    this.#recorder.discard();
  }

  /** Called after each successful command — records if active. */
  record(line: string): void {
    this.#recorder.record(line);
  }

  get recordingFilename(): string | null { return this.#recorder.filename; }
  get recordedCount(): number { return this.#recorder.commandCount; }

  // ── Playback ───────────────────────────────────────────────────

  startReplay(filename: string, step = false): SessionPlayer {
    if (this.mode !== 'idle') throw new Error(`Cannot replay while ${this.mode}`);
    this.#player = new SessionPlayer(filename);
    this.#step = step;
    return this.#player;
  }

  endReplay(): void {
    this.#player = null;
    this.#step = false;
  }

  get player(): SessionPlayer | null { return this.#player; }
  get step(): boolean { return this.#step; }
}
