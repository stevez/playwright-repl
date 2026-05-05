/**
 * Session recorder and player.
 *
 * Records REPL commands to .pw files and replays them.
 * Supports ref-to-locator resolution: when recording, refs like e5 are
 * converted to stable text locators like `button "Submit"` using the
 * most recent snapshot data.
 *
 * File format (.pw):
 *   - One command per line
 *   - Comments start with #
 *   - Blank lines are ignored
 *   - First lines are metadata comments with timestamp
 *
 * Example (after ref resolution):
 *   # Playwright REPL session
 *   # recorded 2026-05-04T10:00:00Z
 *
 *   goto https://myapp.com
 *   click button "Submit"
 *   fill textbox "Email" admin@test.com
 */

import fs from 'node:fs';
import path from 'node:path';
import { refToLocator } from './snapshot-parser.js';
import { ALIASES } from './parser.js';

// ─── Ref resolution helpers ────────────────────────────────────────────────

/** Commands whose second token can be an element ref. */
const REF_COMMANDS = new Set([
  'click', 'dblclick', 'hover', 'check', 'uncheck',
  'fill', 'select', 'press', 'upload',
]);

/** Recording-related commands — never recorded. */
const RECORDING_COMMANDS = new Set([
  'start-recording', 'stop-recording', 'pause-recording', 'discard-recording',
]);

/**
 * Resolve ref tokens in a command line to stable text locators.
 *
 * Example: "click e5" → "click button \"Submit\"" (given e5 maps to button "Submit" in the snapshot).
 */
function resolveRefs(line: string, snapshotYaml: string | null): string {
  if (!snapshotYaml) return line;

  // Match: <command> <eN-ref> [rest...]
  const match = line.match(/^(\S+)\s+(e\d+)(\s.*|$)/);
  if (!match) return line;

  const [, cmd, ref, rest] = match;
  const cmdLower = cmd.toLowerCase();

  // Resolve alias → canonical name for the REF_COMMANDS check
  const canonical = ALIASES[cmdLower] || cmdLower;
  if (!REF_COMMANDS.has(canonical)) return line;

  const loc = refToLocator(snapshotYaml, ref);
  if (!loc) return line;

  // Reconstruct: canonical command + resolved locator + original rest
  return `${canonical} ${loc.pw}${rest}`;
}

/**
 * Resolve alias in a command line to its canonical name.
 * Only resolves the first token (command name).
 */
function resolveAlias(line: string): string {
  const spaceIdx = line.search(/\s/);
  const cmd = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
  const rest = spaceIdx === -1 ? '' : line.slice(spaceIdx);
  const canonical = ALIASES[cmd.toLowerCase()];
  return canonical ? canonical + rest : line;
}

// ─── Session Recorder ────────────────────────────────────────────────────────

export class SessionRecorder {
  commands: string[] = [];
  recording = false;
  filename: string | null = null;
  paused = false;
  #lastSnapshot: string | null = null;

  /**
   * Start recording commands.
   */
  start(filename?: string): string {
    this.filename = filename || `session-${new Date().toISOString().replace(/[:.]/g, '-')}.pw`;
    this.commands = [];
    this.recording = true;
    this.paused = false;
    this.#lastSnapshot = null;
    return this.filename;
  }

  /**
   * Update the stored snapshot YAML for ref-to-locator resolution.
   * Call this after each successful `snapshot` command with the result text.
   */
  setSnapshot(yaml: string): void {
    this.#lastSnapshot = yaml;
  }

  /**
   * Record a command (called after each successful REPL command).
   * Resolves aliases and ref tokens to stable text locators.
   * Skips meta-commands (lines starting with .) and recording commands.
   */
  record(line: string): void {
    if (!this.recording || this.paused) return;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('.')) return;

    // Skip recording-related commands
    const cmd = trimmed.split(/\s+/)[0].toLowerCase();
    const canonical = ALIASES[cmd] || cmd;
    if (RECORDING_COMMANDS.has(canonical)) return;

    // Resolve alias → canonical name, then resolve refs → text locators
    const aliasResolved = resolveAlias(trimmed);
    const resolved = resolveRefs(aliasResolved, this.#lastSnapshot);
    this.commands.push(resolved);
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
    this.#lastSnapshot = null;

    return result;
  }

  /**
   * Stop recording and return commands without saving to file.
   */
  stop(): { commands: string[]; count: number } {
    if (!this.recording) throw new Error('Not recording');
    const result = { commands: [...this.commands], count: this.commands.length };
    this.recording = false;
    this.commands = [];
    this.filename = null;
    this.paused = false;
    this.#lastSnapshot = null;
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
    this.#lastSnapshot = null;
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
  static load(filename: string, variables?: Record<string, string>): string[] {
    if (!fs.existsSync(filename)) {
      throw new Error(`File not found: ${filename}`);
    }

    let content = fs.readFileSync(filename, 'utf-8');

    // Replace {{key}} placeholders with --variable key=value args
    if (variables) {
      for (const [key, value] of Object.entries(variables)) {
        content = content.replaceAll(`{{${key}}}`, value);
      }
    }

    // Check for unresolved variables
    const unresolved = content.match(/\{\{(\w+)\}\}/g);
    if (unresolved) {
      const keys = [...new Set(unresolved.map(m => m.slice(2, -2)))];
      throw new Error(`Missing variables: ${keys.join(', ')}. Use --variable key=value`);
    }

    return content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));
  }

  /**
   * Create a player that yields commands one at a time.
   */
  constructor(filename: string, variables?: Record<string, string>) {
    this.filename = filename;
    this.commands = SessionPlayer.load(filename, variables);
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

  /** Stop recording and return commands without saving to file. */
  stop(): { commands: string[]; count: number } {
    if (this.mode !== 'recording' && this.mode !== 'paused')
      throw new Error('Not recording');
    return this.#recorder.stop();
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

  /** Update the snapshot YAML for ref-to-locator resolution. */
  setSnapshot(yaml: string): void {
    this.#recorder.setSnapshot(yaml);
  }

  get recordingFilename(): string | null { return this.#recorder.filename; }
  get recordedCount(): number { return this.#recorder.commandCount; }

  // ── Playback ───────────────────────────────────────────────────

  startReplay(filename: string, step = false, variables?: Record<string, string>): SessionPlayer {
    if (this.mode !== 'idle') throw new Error(`Cannot replay while ${this.mode}`);
    this.#player = new SessionPlayer(filename, variables);
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
