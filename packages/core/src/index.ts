/**
 * @playwright-repl/core — shared parser, utilities, and relay server.
 */

export { minimist, replVersion, COMMANDS, CATEGORIES, JS_CATEGORIES, UPDATE_COMMANDS } from './resolve.js';
export { parseInput, ALIASES, ALL_COMMANDS, booleanOptions, resolveArgs } from './parser.js';
export { buildCompletionItems } from './completion-data.js';
export { c, prettyJson } from './colors.js';
export {
  buildRunCode, buildRunCodeScoped, verifyText, verifyElement, verifyValue, verifyList,
  verifyTitle, verifyUrl, verifyNoText, verifyNoElement,
  verifyVisible, verifyCssVisible, verifyCssElement, verifyCssNoElement, verifyCssValue,
  verifyInputValue, waitForText,
  actionByText, fillByText, selectByText, checkByText, uncheckByText,
  actionByRole, fillByRole, selectByRole, pressKeyByRole,
} from './page-scripts.js';
export {
  gotoUrl, reloadPage, goBack, goForward, waitMs, getTitle, getUrl,
  evalCode, runCode, takeScreenshot, takeSnapshot, takePdf,
  refAction, pressKey, typeText,
  highlightByText, highlightByRole, highlightBySelector, highlightByRef, clearHighlight,
  chainAction,
  localStorageGet, localStorageSet, localStorageDelete, localStorageClear, localStorageList,
  sessionStorageGet, sessionStorageSet, sessionStorageDelete, sessionStorageClear, sessionStorageList,
  cookieList, cookieGet, cookieSet, cookieDelete, cookieClear,
  getConsoleMessages, getNetworkRequests, setDialogAccept, setDialogDismiss,
  addRoute, listRoutes, removeRoute,
  tracingStart, tracingStop, videoStart, videoStop,
  tabList, tabNew, tabClose, tabSelect,
  dragDrop, resizeViewport,
} from './command-scripts.js';
export type { EngineOpts, EngineResult, ParsedArgs } from './types.js';
export { filterResponse } from './filter.js';
export { CDPRelayServer } from './cdp-relay-server.js';
export type { CompletionItem } from './completion-data.js';
export type { CommandInfo } from './resolve.js';
export { parseSnapshot, refToLocator, allRefLocators } from './snapshot-parser.js';
export type { SnapshotNode, LocatorResult, RefLocatorEntry } from './snapshot-parser.js';
export { isLocalCommand, handleLocalCommand, isVideoCommand, handleVideoCommand, isTracingCommand, handleTracingCommand } from './local-commands.js';
export { resolveCommand } from './resolve-command.js';
export type { ResolvedCommand } from './resolve-command.js';
export type { LocalCommandResult } from './local-commands.js';
export { buildSystemPrompt, buildUserMessage, buildGrammarReference } from './prompt-builder.js';
export type { PromptContext, PromptOptions } from './prompt-builder.js';
export { pwLineToJs, pwScriptToSpec } from './pw-to-js.js';
export type { ConvertOptions } from './pw-to-js.js';
export { getActiveModel, resolveConfigFromEnv, DEFAULT_MODELS, PROVIDER_BASE_URLS, PROVIDER_ENV_KEYS } from './llm-config.js';
export type { LlmProvider, LlmModelConfig, LlmSettings } from './llm-config.js';
