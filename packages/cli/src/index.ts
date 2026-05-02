/**
 * playwright-repl — public API
 *
 * Usage as CLI:
 *   npx playwright-repl [options]
 *
 * Usage as library:
 *   import { parseInput, SessionRecorder } from 'playwright-repl';
 */

// Re-export core utilities
export { parseInput, ALIASES, ALL_COMMANDS, buildCompletionItems } from '@playwright-repl/core';
export type { EngineResult, ParsedArgs } from '@playwright-repl/core';

// CLI-specific
export { SessionRecorder, SessionPlayer } from './recorder.js';
export { startRepl } from './repl.js';
