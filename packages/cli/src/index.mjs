/**
 * playwright-repl — public API
 *
 * Usage as CLI:
 *   npx playwright-repl [options]
 *
 * Usage as library:
 *   import { DaemonConnection, parseInput, SessionRecorder } from 'playwright-repl';
 */

// Re-export core
export { parseInput, ALIASES, ALL_COMMANDS, buildCompletionItems } from '@playwright-repl/core';

// CLI-specific
export { DaemonConnection } from './connection.mjs';
export { SessionRecorder, SessionPlayer } from './recorder.mjs';
export { socketPath, isDaemonRunning, startDaemon, findWorkspaceDir } from './workspace.mjs';
export { startRepl } from './repl.mjs';
