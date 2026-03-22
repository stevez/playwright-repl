/**
 * @playwright-repl/core — shared engine, parser, and utilities.
 */

export { minimist, replVersion, COMMANDS, CATEGORIES, JS_CATEGORIES } from './resolve.js';
export { parseInput, ALIASES, ALL_COMMANDS, booleanOptions } from './parser.js';
export { buildCompletionItems } from './completion-data.js';
export { c, prettyJson } from './colors.js';
export {
  buildRunCode, verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  verifyVisible, verifyInputValue, waitForText,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  actionByRole, fillByRole, selectByRole, pressKeyByRole,
} from './page-scripts.js';
export { Engine } from './engine.js';
export type { EngineOpts, EngineResult, ParsedArgs } from './engine.js';
export { CommandServer, resolveArgs } from './extension-server.js';
export { filterResponse } from './filter.js';
export { BridgeServer } from './bridge-server.js';
export type { CompletionItem } from './completion-data.js';
export type { CommandInfo } from './resolve.js';
export { parseSnapshot, refToLocator, allRefLocators } from './snapshot-parser.js';
export type { SnapshotNode, LocatorResult, RefLocatorEntry } from './snapshot-parser.js';
