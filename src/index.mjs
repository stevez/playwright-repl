/**
 * playwright-repl — public API
 *
 * Usage as CLI:
 *   npx playwright-repl [options]
 *
 * Usage as library:
 *   import { DaemonConnection, parseInput, SessionRecorder } from 'playwright-repl';
 */

export { DaemonConnection } from './connection.mjs';
export { parseInput, ALIASES, ALL_COMMANDS } from './parser.mjs';
export { SessionRecorder, SessionPlayer } from './recorder.mjs';
export { socketPath, isDaemonRunning, startDaemon, findWorkspaceDir } from './workspace.mjs';
export { startRepl } from './repl.mjs';
