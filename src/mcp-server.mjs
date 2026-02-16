/**
 * Stdio MCP server wrapper for playwright-repl daemon bridge.
 */

import { minimist, replVersion } from "./resolve.mjs";
import { McpBridge } from "./mcp-bridge.mjs";

const SERVER_NAME = "playwright-repl-mcp";
const PROTOCOL_VERSION = "2025-11-25";

function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  return Buffer.concat([header, body]);
}

class ContentLengthParser {
  constructor(onMessage) {
    this.onMessage = onMessage;
    this.buffer = Buffer.alloc(0);
  }

  push(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);

    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const header = this.buffer.subarray(0, headerEnd).toString("utf8");
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) throw new Error("Missing Content-Length header");

      const bodyLength = Number.parseInt(lengthMatch[1], 10);
      const totalLength = headerEnd + 4 + bodyLength;
      if (this.buffer.length < totalLength) return;

      const body = this.buffer
        .subarray(headerEnd + 4, totalLength)
        .toString("utf8");
      this.buffer = this.buffer.subarray(totalLength);

      this.onMessage(JSON.parse(body));
    }
  }
}

function jsonRpcError(id, code, message, data) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

function parseArgs(argv) {
  return minimist(argv, {
    boolean: ["auto-start-daemon", "headed", "persistent", "silent"],
    string: [
      "session",
      "browser",
      "profile",
      "config",
      "tool-timeout-ms",
      "allow-tool",
    ],
    alias: {
      s: "session",
    },
    default: {
      session: "default",
      "auto-start-daemon": true,
      "tool-timeout-ms": "30000",
      silent: true,
    },
  });
}

function normalizeAllowedTools(rawValue) {
  if (!rawValue) return undefined;
  const values = Array.isArray(rawValue) ? rawValue : [rawValue];
  const tools = [];
  for (const value of values) {
    for (const token of String(value).split(",")) {
      const name = token.trim();
      if (name) tools.push(name);
    }
  }
  return tools.length > 0 ? tools : undefined;
}

export function createServerConfigFromArgv(argv) {
  const args = parseArgs(argv);
  const timeout = Number.parseInt(args["tool-timeout-ms"], 10);

  return {
    session: args.session,
    autoStartDaemon: args["auto-start-daemon"],
    toolTimeoutMs: Number.isFinite(timeout) ? timeout : 30000,
    headed: Boolean(args.headed),
    browser: args.browser,
    persistent: Boolean(args.persistent),
    profile: args.profile,
    config: args.config,
    silent: Boolean(args.silent),
    allowedTools: normalizeAllowedTools(args["allow-tool"]),
  };
}

export function createMcpServer(config = {}, deps = {}) {
  const bridge = deps.bridge || new McpBridge(config, deps.bridgeDeps);

  const send = (payload) => process.stdout.write(encodeMessage(payload));

  async function handleMessage(message) {
    const { id, method, params } = message || {};

    try {
      if (!method) {
        if (id !== undefined)
          send(jsonRpcError(id, -32600, "Invalid Request: missing method"));
        return;
      }

      if (method === "initialize") {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: SERVER_NAME,
              version: replVersion,
            },
          },
        });
        return;
      }

      if (method === "notifications/initialized") return;

      if (method === "ping") {
        send({ jsonrpc: "2.0", id, result: {} });
        return;
      }

      if (method === "tools/list") {
        send({
          jsonrpc: "2.0",
          id,
          result: {
            tools: bridge.tools(),
          },
        });
        return;
      }

      if (method === "tools/call") {
        const toolName = params?.name;
        const toolArgs = params?.arguments || {};
        const result = await bridge.callTool(toolName, toolArgs);
        send({ jsonrpc: "2.0", id, result });
        return;
      }

      if (id !== undefined)
        send(jsonRpcError(id, -32601, `Method not found: ${method}`));
    } catch (error) {
      if (id !== undefined)
        send(jsonRpcError(id, -32000, error?.message || String(error)));
    }
  }

  const parser = new ContentLengthParser((message) => {
    handleMessage(message).catch((err) => {
      const fallback = jsonRpcError(
        message?.id,
        -32000,
        err?.message || String(err),
      );
      process.stdout.write(encodeMessage(fallback));
    });
  });

  return {
    bridge,
    parser,
    async close() {
      await bridge.close();
    },
  };
}

export async function runMcpServer(argv = process.argv.slice(2), streams = {}) {
  const input = streams.stdin || process.stdin;
  const config = createServerConfigFromArgv(argv);
  const server = createMcpServer(config);

  const onData = (chunk) => {
    try {
      server.parser.push(chunk);
    } catch (error) {
      const payload = jsonRpcError(
        null,
        -32700,
        error?.message || "Parse error",
      );
      process.stdout.write(encodeMessage(payload));
    }
  };

  input.on("data", onData);

  const shutdown = async () => {
    input.off("data", onData);
    await server.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export { ContentLengthParser, encodeMessage, PROTOCOL_VERSION, SERVER_NAME };
