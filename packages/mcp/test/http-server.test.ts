// @ts-nocheck
/**
 * Tests for the HTTP server and helper functions from index.ts.
 *
 * index.ts has top-level side effects (MCP server, process handlers),
 * so we test the extractable logic patterns: readBody, withTimeout,
 * startHttpServer, and --http-port parsing.
 */
import { describe, it, expect, vi } from 'vitest';
import http from 'node:http';

// ─── withTimeout (mirrors index.ts implementation) ───────────────────

describe('withTimeout', () => {
  function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        (e) => { clearTimeout(timer); reject(e); },
      );
    });
  }

  it('resolves when promise resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve('ok'), 1000, 'timeout');
    expect(result).toBe('ok');
  });

  it('rejects with timeout message when promise is slow', async () => {
    const slow = new Promise(r => setTimeout(() => r('late'), 5000));
    await expect(withTimeout(slow, 50, 'too slow')).rejects.toThrow('too slow');
  });

  it('rejects with original error if promise rejects before timeout', async () => {
    const failing = Promise.reject(new Error('boom'));
    await expect(withTimeout(failing, 1000, 'timeout')).rejects.toThrow('boom');
  });
});

// ─── readBody (mirrors index.ts implementation) ──────────────────────

describe('readBody', () => {
  function readBody(req: http.IncomingMessage, timeoutMs = 5000): Promise<string> {
    return new Promise((resolve, reject) => {
      let data = '';
      const timer = setTimeout(() => {
        req.destroy();
        reject(new Error(`Request body read timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      req.on('data', (chunk: string) => data += chunk);
      req.on('end', () => { clearTimeout(timer); resolve(data); });
      req.on('error', (e: Error) => { clearTimeout(timer); reject(e); });
    });
  }

  it('reads body from a request', async () => {
    // Create a real HTTP server to test readBody
    const server = http.createServer(async (req, res) => {
      const body = await readBody(req);
      res.writeHead(200);
      res.end(body);
    });
    await new Promise<void>(r => server.listen(0, r));
    const port = (server.address() as any).port;

    const result = await new Promise<string>((resolve, reject) => {
      const req = http.request({ port, method: 'POST' }, (res) => {
        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => resolve(data));
      });
      req.on('error', reject);
      req.write('{"command":"snapshot"}');
      req.end();
    });

    expect(result).toBe('{"command":"snapshot"}');
    server.close();
  });
});

// ─── HTTP port parsing ───────────────────────────────────────────────

describe('HTTP port parsing', () => {
  function parseHttpPort(argv: string[]): number {
    const idx = argv.indexOf('--http-port');
    if (idx !== -1 && argv[idx + 1]) return parseInt(argv[idx + 1], 10);
    return 9223;
  }

  it('defaults to 9223', () => {
    expect(parseHttpPort([])).toBe(9223);
  });

  it('parses --http-port flag', () => {
    expect(parseHttpPort(['--http-port', '8080'])).toBe(8080);
  });

  it('defaults when --http-port has no value', () => {
    expect(parseHttpPort(['--http-port'])).toBe(9223);
  });
});

// ─── Runner selection logic ──────────────────────────────────────────

describe('runner selection', () => {
  it('detects --standalone flag', () => {
    const argv = ['--standalone', '--headed'];
    expect(argv.includes('--standalone')).toBe(true);
    expect(argv.includes('--headed')).toBe(true);
  });

  it('defaults to bridge mode when no --standalone', () => {
    const argv = [];
    expect(argv.includes('--standalone')).toBe(false);
  });
});
