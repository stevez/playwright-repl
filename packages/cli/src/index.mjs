/**
 * playwright-repl — public API
 *
 * Usage as CLI:
 *   npx playwright-repl [options]
 *
 * Usage as library:
 *   import { Engine, parseInput, SessionRecorder } from 'playwright-repl';
 */

// Re-export core
export { parseInput, ALIASES, ALL_COMMANDS, buildCompletionItems, Engine } from '@playwright-repl/core';

// CLI-specific
export { SessionRecorder, SessionPlayer } from './recorder.mjs';
export { startRepl } from './repl.mjs';
