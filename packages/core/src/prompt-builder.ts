/**
 * Builds LLM prompts from the .pw command grammar and page snapshot.
 *
 * Pure functions — no LLM dependency, no I/O.
 */

import { COMMANDS, CATEGORIES } from './resolve.js';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PromptContext {
  /** Raw YAML accessibility snapshot from browser_snapshot. */
  snapshot?: string;
  /** Current page URL. */
  currentUrl?: string;
  /** Current page title. */
  pageTitle?: string;
}

export interface PromptOptions {
  /** Include usage examples per command (default: true). */
  includeExamples?: boolean;
  /** Max snapshot lines before truncation (default: 200). */
  maxSnapshotLines?: number;
  /** Which command categories to include (default: all relevant). */
  categories?: string[];
}

// ─── Categories relevant to AI generation ───────────────────────────────────

const AI_CATEGORIES = ['Navigation', 'Interaction', 'Inspection', 'Assertions', 'Tabs'];

// ─── Grammar reference builder ──────────────────────────────────────────────

/**
 * Build a command grammar reference from COMMANDS + CATEGORIES.
 * Used as part of the system prompt so the LLM knows what commands exist.
 */
export function buildGrammarReference(opts?: Pick<PromptOptions, 'includeExamples' | 'categories'>): string {
  const includeExamples = opts?.includeExamples ?? true;
  const selectedCategories = opts?.categories ?? AI_CATEGORIES;

  const sections: string[] = [];
  for (const cat of selectedCategories) {
    const commands = CATEGORIES[cat];
    if (!commands) continue;

    const lines: string[] = [`### ${cat}`];
    for (const cmd of commands) {
      const info = COMMANDS[cmd];
      if (!info) continue;
      const usage = info.usage ?? cmd;
      lines.push(`  ${usage}  — ${info.desc}`);
      if (includeExamples && info.examples) {
        for (const ex of info.examples) {
          lines.push(`    e.g. ${ex}`);
        }
      }
    }
    sections.push(lines.join('\n'));
  }
  return sections.join('\n\n');
}

// ─── System prompt ──────────────────────────────────────────────────────────

/**
 * Build the system prompt that teaches the LLM the .pw command grammar.
 */
export function buildSystemPrompt(opts?: PromptOptions): string {
  const grammar = buildGrammarReference(opts);
  return `You are a browser automation assistant for playwright-repl.
You translate natural language instructions into .pw keyword commands.

## Available Commands

${grammar}

## Rules

1. Use accessible names from the snapshot, NOT refs (e.g. click "Submit" not click e5).
2. When a role is clear from the snapshot, use role-based syntax:
   - click button "Sign in" (not click "Sign in")
   - fill textbox "Email" "user@test.com"
3. Quote all text arguments with double quotes.
4. One command per line.
5. For assertions, use verify-text, verify-element, verify-title, or verify-url.
6. After state-changing actions, include a verify command if the instruction implies checking a result.
7. Keep it minimal — only the commands needed for the instruction.

## Output Format

Return ONLY .pw commands, one per line. No prose, no markdown fences, no explanations.`;
}

// ─── User message ───────────────────────────────────────────────────────────

/**
 * Build the user message with snapshot context and English instruction.
 */
export function buildUserMessage(instruction: string, context?: PromptContext): string {
  const parts: string[] = [];

  if (context?.snapshot) {
    const maxLines = 200;
    const lines = context.snapshot.split('\n');
    const truncated = lines.length > maxLines
      ? [...lines.slice(0, maxLines), `... (${lines.length - maxLines} more lines truncated)`]
      : lines;
    // Strip refs — the LLM should use accessible names, not refs
    const cleaned = truncated.map(l => l.replace(/\s*\[ref=e\d+\]/g, ''));
    parts.push(`## Current Page\n${cleaned.join('\n')}`);
  }

  if (context?.currentUrl) {
    parts.push(`URL: ${context.currentUrl}`);
  }
  if (context?.pageTitle) {
    parts.push(`Title: ${context.pageTitle}`);
  }

  parts.push(`## Instruction\n${instruction}`);
  return parts.join('\n\n');
}
