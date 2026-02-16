/**
 * MCP bridge: wrapper tools -> daemon run(args) calls.
 *
 * Keeps browser logic in Playwright daemon. This module only handles
 * mapping, validation, connection lifecycle, timeout handling, and
 * response normalization.
 */

import { DaemonConnection } from './connection.mjs';
import { replVersion } from './resolve.mjs';
import { socketPath, isDaemonRunning, startDaemon } from './workspace.mjs';
import { verifyToRunCode, textToRunCode, filterResponse } from './repl.mjs';

class BridgeError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const defaultConfig = {
  session: 'default',
  autoStartDaemon: true,
  toolTimeoutMs: 30000,
  headed: false,
  browser: undefined,
  persistent: false,
  profile: undefined,
  config: undefined,
  silent: true,
  allowedTools: undefined,
};

const TOOL_DEFS = [
  {
    name: 'open',
    description: 'Open a browser session and optionally navigate to a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: input.url ? ['open', input.url] : ['open'] }),
  },
  {
    name: 'goto',
    description: 'Navigate the current page to a URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['goto', input.url] }),
  },
  {
    name: 'click',
    description: 'Click an element by aria ref (e.g. e5) or text.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
      },
      required: ['target'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['click', input.target] }),
  },
  {
    name: 'fill',
    description: 'Fill an input by aria ref or text-based locator.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string' },
        text: { type: 'string' },
      },
      required: ['target', 'text'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['fill', input.target, input.text] }),
  },
  {
    name: 'press',
    description: 'Press a keyboard key (e.g. Enter, Escape).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string' },
      },
      required: ['key'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['press', input.key] }),
  },
  {
    name: 'snapshot',
    description: 'Return accessibility snapshot with aria refs.',
    inputSchema: {
      type: 'object',
      properties: {},
      additionalProperties: false,
    },
    buildArgs: () => ({ _: ['snapshot'] }),
  },
  {
    name: 'screenshot',
    description: 'Take a screenshot of the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        filename: { type: 'string' },
        fullPage: { type: 'boolean' },
      },
      additionalProperties: false,
    },
    buildArgs: (input) => {
      const args = { _: ['screenshot'] };
      if (input.filename) args.filename = input.filename;
      if (input.fullPage !== undefined) args.fullPage = input.fullPage;
      return args;
    },
  },
  {
    name: 'verify-text',
    description: 'Verify text is visible on the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
      },
      required: ['text'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['verify-text', input.text] }),
  },
  {
    name: 'verify-element',
    description: 'Verify an element exists by role and name.',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string' },
        name: { type: 'string' },
      },
      required: ['role', 'name'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['verify-element', input.role, input.name] }),
  },
  {
    name: 'verify-value',
    description: 'Verify element value by aria ref.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        value: { type: 'string' },
      },
      required: ['ref', 'value'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['verify-value', input.ref, input.value] }),
  },
  {
    name: 'verify-list',
    description: 'Verify list items exist within element aria ref.',
    inputSchema: {
      type: 'object',
      properties: {
        ref: { type: 'string' },
        items: {
          type: 'array',
          items: { type: 'string' },
          minItems: 1,
        },
      },
      required: ['ref', 'items'],
      additionalProperties: false,
    },
    buildArgs: (input) => ({ _: ['verify-list', input.ref, ...input.items] }),
  },
];

const toolMap = new Map(TOOL_DEFS.map((tool) => [tool.name, tool]));

function isRef(value) {
  return /^e\d+$/i.test(value);
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const id = setTimeout(() => reject(new BridgeError('DAEMON_TIMEOUT', `Tool execution timed out after ${ms}ms`)), ms);
    promise
      .then((value) => {
        clearTimeout(id);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(id);
        reject(error);
      });
  });
}

function validateObjectShape(value, schema) {
  if (value === undefined) value = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new BridgeError('INVALID_ARGUMENT', 'arguments must be an object');
  }

  const properties = schema.properties || {};
  const required = new Set(schema.required || []);

  for (const field of required) {
    if (!(field in value)) {
      throw new BridgeError('INVALID_ARGUMENT', `missing required field: ${field}`);
    }
  }

  if (schema.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!(key in properties)) {
        throw new BridgeError('INVALID_ARGUMENT', `unknown field: ${key}`);
      }
    }
  }

  for (const [key, spec] of Object.entries(properties)) {
    if (!(key in value) || value[key] === undefined) continue;
    const v = value[key];

    if (spec.type === 'string' && typeof v !== 'string')
      throw new BridgeError('INVALID_ARGUMENT', `${key} must be a string`);
    if (spec.type === 'boolean' && typeof v !== 'boolean')
      throw new BridgeError('INVALID_ARGUMENT', `${key} must be a boolean`);
    if (spec.type === 'array') {
      if (!Array.isArray(v))
        throw new BridgeError('INVALID_ARGUMENT', `${key} must be an array`);
      if (spec.minItems && v.length < spec.minItems)
        throw new BridgeError('INVALID_ARGUMENT', `${key} must include at least ${spec.minItems} item(s)`);
      if (spec.items?.type === 'string' && v.some((item) => typeof item !== 'string'))
        throw new BridgeError('INVALID_ARGUMENT', `${key} items must all be strings`);
    }
  }

  return value;
}

function normalizeError(error) {
  if (error instanceof BridgeError)
    return error;

  const message = error?.message || String(error);
  if (message.includes('Not connected') || message.includes('ENOENT') || message.includes('ECONNREFUSED'))
    return new BridgeError('DAEMON_UNAVAILABLE', message);

  return new BridgeError('TOOL_EXECUTION_FAILED', message);
}

export function listTools(config = {}) {
  const cfg = { ...defaultConfig, ...config };
  if (!cfg.allowedTools || cfg.allowedTools.length === 0)
    return TOOL_DEFS;

  const allow = new Set(cfg.allowedTools);
  return TOOL_DEFS.filter((tool) => allow.has(tool.name));
}

export class McpBridge {
  constructor(config = {}, deps = {}) {
    this.config = { ...defaultConfig, ...config };

    this.deps = {
      DaemonConnection,
      version: replVersion,
      socketPath,
      isDaemonRunning,
      startDaemon,
      verifyToRunCode,
      textToRunCode,
      filterResponse,
      ...deps,
    };

    this.conn = null;
    this.allowedTools = this.config.allowedTools ? new Set(this.config.allowedTools) : null;
  }

  tools() {
    return listTools(this.config).map((tool) => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
    }));
  }

  async close() {
    if (this.conn)
      this.conn.close();
    this.conn = null;
  }

  async callTool(name, rawInput = {}) {
    try {
      if (this.allowedTools && !this.allowedTools.has(name)) {
        throw new BridgeError('POLICY_DENIED', `Tool not allowed: ${name}`);
      }

      const tool = toolMap.get(name);
      if (!tool)
        throw new BridgeError('INVALID_ARGUMENT', `Unknown tool: ${name}`);

      const input = validateObjectShape(rawInput, tool.inputSchema);
      let args = tool.buildArgs(input);
      args = this._applyTransformations(args);

      await this._ensureConnected();
      const result = await withTimeout(this.conn.run(args), this.config.toolTimeoutMs);

      return this._toToolResult(result);
    } catch (error) {
      const normalized = normalizeError(error);
      return {
        content: [{
          type: 'text',
          text: `${normalized.code}: ${normalized.message}`,
        }],
        isError: true,
        structuredContent: {
          errorCode: normalized.code,
          message: normalized.message,
        },
      };
    }
  }

  _applyTransformations(args) {
    const cmdName = args._?.[0];
    if (!cmdName)
      return args;

    const verifyCommands = new Set(['verify-text', 'verify-element', 'verify-value', 'verify-list']);
    if (verifyCommands.has(cmdName)) {
      const translated = this.deps.verifyToRunCode(cmdName, args._.slice(1));
      if (!translated)
        throw new BridgeError('INVALID_ARGUMENT', `Invalid arguments for ${cmdName}`);
      return translated;
    }

    const refCommands = new Set(['click', 'dblclick', 'hover', 'fill', 'select', 'check', 'uncheck']);
    if (refCommands.has(cmdName) && args._[1] && !isRef(args._[1])) {
      const runCodeArgs = this.deps.textToRunCode(cmdName, args._[1], args._.slice(2));
      if (runCodeArgs)
        return runCodeArgs;
    }

    return args;
  }

  async _ensureConnected() {
    if (this.conn?.connected)
      return;

    if (!this.conn) {
      this.conn = new this.deps.DaemonConnection(
        this.deps.socketPath(this.config.session),
        this.deps.version
      );
    }

    let running = false;
    try {
      running = await this.deps.isDaemonRunning(this.config.session);
    } catch {}

    if (!running) {
      if (!this.config.autoStartDaemon)
        throw new BridgeError('DAEMON_UNAVAILABLE', 'Playwright daemon is not running');

      await this.deps.startDaemon(this.config.session, {
        headed: this.config.headed,
        browser: this.config.browser,
        persistent: this.config.persistent,
        profile: this.config.profile,
        config: this.config.config,
        silent: this.config.silent,
      });
    }

    try {
      await this.conn.connect();
    } catch (error) {
      throw new BridgeError('DAEMON_UNAVAILABLE', error?.message || String(error));
    }
  }

  _toToolResult(result) {
    const rawText = typeof result?.text === 'string' ? result.text : JSON.stringify(result ?? {});
    const filteredText = this.deps.filterResponse(rawText);
    const text = filteredText || rawText;

    return {
      content: [{ type: 'text', text }],
      isError: false,
      structuredContent: {
        rawResult: result,
      },
    };
  }
}

export { BridgeError, TOOL_DEFS };
