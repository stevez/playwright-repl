/**
 * Local command handlers — commands that run in Node.js instead of the
 * extension service worker. Used by CLI, MCP, and VS Code.
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { parseInput } from './parser.js';

// ─── Types ──────────────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
type BrowserContext = any;
type Page = any;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface LocalCommandResult {
  text: string;
  isError?: boolean;
}

// ─── Video commands ─────────────────────────────────────────────────────────

export function isVideoCommand(cmd: string): boolean {
  const trimmed = cmd.trim();
  return trimmed.startsWith('video-start') || trimmed === 'video-stop'
    || trimmed.startsWith('video-chapter ') || trimmed === 'video-chapter';
}

let videoPath: string | null = null;

export async function handleVideoCommand(cmd: string, context: BrowserContext): Promise<LocalCommandResult> {
  const pages = context.pages();
  const page: Page = pages[pages.length - 1];
  if (!page) return { text: 'No page available.', isError: true };

  const trimmed = cmd.trim();

  if (trimmed.startsWith('video-start')) {
    const args = parseInput(trimmed);
    const sizeStr = args?.size as string | undefined;
    const size = sizeStr ? { width: parseInt(sizeStr.split('x')[0]), height: parseInt(sizeStr.split('x')[1]) } : undefined;
    const outDir = path.join(os.homedir(), 'pw-videos');
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, `pw-video-${Date.now()}.webm`);
    videoPath = outPath;
    await page.screencast.start({ path: outPath, size });
    return { text: `Recording started → ${outPath}` };
  }

  if (trimmed === 'video-stop') {
    await page.screencast.stop();
    const msg = videoPath ? `Recording stopped → ${videoPath}` : 'Recording stopped.';
    videoPath = null;
    return { text: msg };
  }

  if (trimmed.startsWith('video-chapter')) {
    const args = parseInput(trimmed);
    const title = args?._?.slice(1).join(' ') || '';
    const description = args?.description as string | undefined;
    const duration = args?.duration ? parseInt(String(args.duration)) : undefined;
    await page.screencast.showChapter(title, { description, duration });
    return { text: `Chapter "${title}" added.` };
  }

  return { text: `Unknown video command: ${trimmed}`, isError: true };
}

// ─── Local command dispatcher ───────────────────────────────────────────────

export function isLocalCommand(cmd: string): boolean {
  return isVideoCommand(cmd);
}

/**
 * Try to handle a command locally. Returns null if not a local command.
 * Requires a BrowserContext (from EvaluateConnection.context).
 */
export async function handleLocalCommand(cmd: string, context: BrowserContext | null): Promise<LocalCommandResult | null> {
  if (!isLocalCommand(cmd)) return null;
  if (!context) return { text: 'Local commands require evaluate mode.', isError: true };

  if (isVideoCommand(cmd)) return handleVideoCommand(cmd, context);

  return null;
}
