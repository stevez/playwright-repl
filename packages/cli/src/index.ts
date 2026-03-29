/**
 * playwright-repl — public API
 *
 * Usage as CLI:
 *   npx playwright-repl [options]
 *
 * Usage as library:
 *   import { Engine, parseInput, SessionRecorder } from 'playwright-repl';
 */

// Re-export core utilities
export { parseInput, ALIASES, ALL_COMMANDS, buildCompletionItems } from '@playwright-repl/core';

// Engine (moved from core to cli)
export { Engine } from './engine.js';
export type { EngineOpts, EngineResult, ParsedArgs } from './engine.js';

// CLI-specific
export { SessionRecorder, SessionPlayer } from './recorder.js';
export { startRepl } from './repl.js';
