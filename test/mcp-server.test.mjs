import { describe, it, expect } from 'vitest';
import {
  ContentLengthParser,
  encodeMessage,
  createMcpServer,
  createServerConfigFromArgv,
} from '../src/mcp-server.mjs';

function decodeFrames(buffer) {
  const messages = [];
  let rest = buffer;

  while (rest.length > 0) {
    const headerEnd = rest.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = rest.slice(0, headerEnd).toString('utf8');
    const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!lengthMatch) break;

    const length = Number.parseInt(lengthMatch[1], 10);
    const bodyStart = headerEnd + 4;
    const bodyEnd = bodyStart + length;
    const body = rest.slice(bodyStart, bodyEnd).toString('utf8');
    messages.push(JSON.parse(body));
    rest = rest.slice(bodyEnd);
  }

  return messages;
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('ContentLengthParser', () => {
  it('parses chunked and concatenated frames', () => {
    const seen = [];
    const parser = new ContentLengthParser((msg) => seen.push(msg));
    const msg1 = encodeMessage({ jsonrpc: '2.0', id: 1, method: 'ping' });
    const msg2 = encodeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    const both = Buffer.concat([msg1, msg2]);

    parser.push(both.subarray(0, 12));
    parser.push(both.subarray(12));

    expect(seen.map((m) => m.id)).toEqual([1, 2]);
  });
});

describe('createServerConfigFromArgv', () => {
  it('parses arguments into bridge config', () => {
    const cfg = createServerConfigFromArgv([
      '--session', 'ci',
      '--tool-timeout-ms', '1500',
      '--allow-tool', 'open,goto',
      '--allow-tool', 'snapshot',
      '--headed',
    ]);

    expect(cfg.session).toBe('ci');
    expect(cfg.toolTimeoutMs).toBe(1500);
    expect(cfg.allowedTools).toEqual(['open', 'goto', 'snapshot']);
    expect(cfg.headed).toBe(true);
  });
});

describe('createMcpServer', () => {
  it('responds to initialize/tools/list/tools/call', async () => {
    const calls = [];
    const fakeBridge = {
      tools: () => [{ name: 'goto', description: 'Navigate', inputSchema: { type: 'object' } }],
      callTool: async (name, args) => {
        calls.push({ name, args });
        return { content: [{ type: 'text', text: 'ok' }], isError: false };
      },
      close: async () => {},
    };

    const chunks = [];
    const oldWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    };

    try {
      const server = createMcpServer({}, { bridge: fakeBridge });

      server.parser.push(encodeMessage({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }));
      server.parser.push(encodeMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }));
      server.parser.push(encodeMessage({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'goto', arguments: { url: 'https://example.com' } },
      }));

      await flush();

      const responses = decodeFrames(Buffer.concat(chunks));
      expect(responses.find((r) => r.id === 1).result.serverInfo.name).toBe('playwright-repl-mcp');
      expect(responses.find((r) => r.id === 2).result.tools[0].name).toBe('goto');
      expect(responses.find((r) => r.id === 3).result.isError).toBe(false);
      expect(calls).toEqual([{ name: 'goto', args: { url: 'https://example.com' } }]);

      await server.close();
    } finally {
      process.stdout.write = oldWrite;
    }
  });

  it('returns method-not-found jsonrpc error', async () => {
    const fakeBridge = {
      tools: () => [],
      callTool: async () => ({ content: [], isError: false }),
      close: async () => {},
    };

    const chunks = [];
    const oldWrite = process.stdout.write;
    process.stdout.write = (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    };

    try {
      const server = createMcpServer({}, { bridge: fakeBridge });
      server.parser.push(encodeMessage({ jsonrpc: '2.0', id: 99, method: 'unknown/method', params: {} }));
      await flush();

      const responses = decodeFrames(Buffer.concat(chunks));
      expect(responses[0].error.code).toBe(-32601);

      await server.close();
    } finally {
      process.stdout.write = oldWrite;
    }
  });
});
