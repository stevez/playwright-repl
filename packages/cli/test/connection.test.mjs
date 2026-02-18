import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DaemonConnection } from '../src/connection.mjs';

describe('DaemonConnection', () => {
  let conn;

  beforeEach(() => {
    conn = new DaemonConnection('/tmp/test.sock', '0.1.0');
  });

  describe('initial state', () => {
    it('starts disconnected', () => {
      expect(conn.connected).toBe(false);
    });

    it('stores socket path and version', () => {
      expect(conn.sockPath).toBe('/tmp/test.sock');
      expect(conn.version).toBe('0.1.0');
    });

    it('starts with nextId = 1', () => {
      expect(conn.nextId).toBe(1);
    });

    it('starts with empty callbacks', () => {
      expect(conn.callbacks.size).toBe(0);
    });
  });

  describe('connected getter', () => {
    it('returns false when socket is null', () => {
      conn.socket = null;
      expect(conn.connected).toBe(false);
    });

    it('returns false when socket is destroyed', () => {
      conn.socket = { destroyed: true };
      expect(conn.connected).toBe(false);
    });

    it('returns true when socket exists and is not destroyed', () => {
      conn.socket = { destroyed: false };
      expect(conn.connected).toBe(true);
    });
  });

  describe('_dispatch', () => {
    it('resolves callback on success', async () => {
      const promise = new Promise((resolve, reject) => {
        conn.callbacks.set(1, { resolve, reject });
      });
      conn._dispatch('{"id":1,"result":{"text":"OK"}}');
      const result = await promise;
      expect(result).toEqual({ text: 'OK' });
    });

    it('rejects callback on error', async () => {
      const promise = new Promise((resolve, reject) => {
        conn.callbacks.set(2, { resolve, reject });
      });
      conn._dispatch('{"id":2,"error":"Something failed"}');
      await expect(promise).rejects.toThrow('Something failed');
    });

    it('ignores messages with no matching callback', () => {
      conn._dispatch('{"id":99,"result":{"text":"no one cares"}}');
    });

    it('ignores invalid JSON', () => {
      conn._dispatch('not json');
    });

    it('ignores messages without id', () => {
      conn._dispatch('{"result":{"text":"no id"}}');
      expect(conn.callbacks.size).toBe(0);
    });

    it('removes callback after dispatch', () => {
      conn.callbacks.set(3, { resolve: () => {}, reject: () => {} });
      conn._dispatch('{"id":3,"result":{}}');
      expect(conn.callbacks.has(3)).toBe(false);
    });
  });

  describe('_onData', () => {
    it('dispatches a complete message', async () => {
      const promise = new Promise((resolve, reject) => {
        conn.callbacks.set(1, { resolve, reject });
      });
      conn._onData(Buffer.from('{"id":1,"result":{"text":"hello"}}\n'));
      const result = await promise;
      expect(result).toEqual({ text: 'hello' });
    });

    it('buffers partial messages', () => {
      conn.callbacks.set(1, { resolve: () => {}, reject: () => {} });
      conn._onData(Buffer.from('{"id":1,"res'));
      expect(conn.callbacks.has(1)).toBe(true);
    });

    it('dispatches after receiving the rest of a buffered message', async () => {
      const promise = new Promise((resolve, reject) => {
        conn.callbacks.set(1, { resolve, reject });
      });
      conn._onData(Buffer.from('{"id":1,"res'));
      conn._onData(Buffer.from('ult":{"text":"split"}}\n'));
      const result = await promise;
      expect(result).toEqual({ text: 'split' });
    });

    it('handles multiple messages in one chunk', async () => {
      const p1 = new Promise((resolve, reject) => {
        conn.callbacks.set(1, { resolve, reject });
      });
      const p2 = new Promise((resolve, reject) => {
        conn.callbacks.set(2, { resolve, reject });
      });
      conn._onData(Buffer.from('{"id":1,"result":{"a":1}}\n{"id":2,"result":{"b":2}}\n'));
      expect(await p1).toEqual({ a: 1 });
      expect(await p2).toEqual({ b: 2 });
    });

    it('handles message followed by partial in same chunk', async () => {
      const p1 = new Promise((resolve, reject) => {
        conn.callbacks.set(1, { resolve, reject });
      });
      conn.callbacks.set(2, { resolve: () => {}, reject: () => {} });
      conn._onData(Buffer.from('{"id":1,"result":{"a":1}}\n{"id":2,"res'));
      expect(await p1).toEqual({ a: 1 });
      // Second message still pending
      expect(conn.callbacks.has(2)).toBe(true);
    });

    it('handles empty lines gracefully', () => {
      conn._onData(Buffer.from('\n\n'));
      // Should not throw
    });
  });

  describe('send', () => {
    it('throws when not connected', async () => {
      await expect(conn.send('run', {})).rejects.toThrow('Not connected');
    });

    it('sends JSON message with incrementing id', async () => {
      const written = [];
      conn.socket = {
        destroyed: false,
        write: (data, cb) => { written.push(data); cb(); },
      };

      const p1 = conn.send('run', { args: { _: ['snapshot'] } });
      const p2 = conn.send('run', { args: { _: ['click', 'e5'] } });

      // Resolve both
      conn._dispatch(`{"id":1,"result":{"text":"snap"}}`);
      conn._dispatch(`{"id":2,"result":{"text":"clicked"}}`);

      expect(await p1).toEqual({ text: 'snap' });
      expect(await p2).toEqual({ text: 'clicked' });

      // Verify message format
      const msg1 = JSON.parse(written[0].replace('\n', ''));
      expect(msg1.id).toBe(1);
      expect(msg1.method).toBe('run');
      expect(msg1.version).toBe('0.1.0');

      const msg2 = JSON.parse(written[1].replace('\n', ''));
      expect(msg2.id).toBe(2);
    });

    it('rejects if write fails', async () => {
      conn.socket = {
        destroyed: false,
        write: (_data, cb) => { cb(new Error('EPIPE')); },
      };
      await expect(conn.send('run', {})).rejects.toThrow('EPIPE');
    });
  });

  describe('run', () => {
    it('sends a "run" method with args and cwd', async () => {
      const written = [];
      conn.socket = {
        destroyed: false,
        write: (data, cb) => { written.push(data); cb(); },
      };

      const promise = conn.run({ _: ['snapshot'] });
      conn._dispatch('{"id":1,"result":{"text":"tree"}}');
      const result = await promise;

      expect(result).toEqual({ text: 'tree' });
      const msg = JSON.parse(written[0].replace('\n', ''));
      expect(msg.method).toBe('run');
      expect(msg.params.args).toEqual({ _: ['snapshot'] });
      expect(msg.params.cwd).toBeTruthy();
    });
  });

  describe('close', () => {
    it('handles close when already disconnected', () => {
      conn.close();
      expect(conn.connected).toBe(false);
    });

    it('destroys socket and sets to null', () => {
      const destroy = vi.fn();
      conn.socket = { destroy, destroyed: false };
      conn.close();
      expect(destroy).toHaveBeenCalled();
      expect(conn.socket).toBeNull();
    });
  });

  describe('_handleError', () => {
    it('logs non-EPIPE errors', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      conn._handleError(new Error('connection reset'));
      expect(spy).toHaveBeenCalled();
      spy.mockRestore();
    });

    it('suppresses EPIPE errors', () => {
      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const err = new Error('EPIPE');
      err.code = 'EPIPE';
      conn._handleError(err);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });
  });
});
