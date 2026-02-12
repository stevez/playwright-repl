/**
 * Tests for DaemonConnection.connect() with mocked net module.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock net.createConnection
vi.mock('node:net', () => {
  let mockSocket;
  return {
    default: {
      createConnection: vi.fn((_path, cb) => {
        mockSocket = new EventEmitter();
        mockSocket.destroy = vi.fn();
        // Simulate async connect
        if (cb) process.nextTick(cb);
        return mockSocket;
      }),
    },
    createConnection: vi.fn((_path, cb) => {
      const { EventEmitter } = require('node:events');
      mockSocket = new EventEmitter();
      mockSocket.destroy = vi.fn();
      if (cb) process.nextTick(cb);
      return mockSocket;
    }),
    __getMockSocket: () => mockSocket,
  };
});

import { DaemonConnection } from '../src/connection.mjs';
import net from 'node:net';

describe('DaemonConnection.connect() with mock', () => {
  let conn;

  beforeEach(() => {
    conn = new DaemonConnection('/tmp/mock.sock', '0.1.0');
    vi.clearAllMocks();
  });

  it('connects successfully and sets socket', async () => {
    await conn.connect();
    expect(conn.connected).toBe(true);
    expect(conn.socket).toBeTruthy();
  });

  it('rejects on connection error', async () => {
    // Override mock to emit error instead of connecting
    const origCreate = net.createConnection;
    net.createConnection = vi.fn((_path, _cb) => {
      const sock = new EventEmitter();
      sock.destroy = vi.fn();
      process.nextTick(() => sock.emit('error', new Error('ECONNREFUSED')));
      return sock;
    });

    const conn2 = new DaemonConnection('/tmp/fail.sock', '0.1.0');
    await expect(conn2.connect()).rejects.toThrow('ECONNREFUSED');
    expect(conn2.connected).toBe(false);

    net.createConnection = origCreate;
  });

  it('handles socket close event — rejects pending callbacks', async () => {
    await conn.connect();

    // Set up a pending callback
    const promise = new Promise((resolve, reject) => {
      conn.callbacks.set(99, { resolve, reject });
    });

    // Simulate socket close
    conn.socket.emit('close');

    await expect(promise).rejects.toThrow('Connection closed');
    expect(conn.callbacks.size).toBe(0);
  });

  it('handles socket data events after connect', async () => {
    await conn.connect();

    const promise = new Promise((resolve, reject) => {
      conn.callbacks.set(1, { resolve, reject });
    });

    // Simulate receiving data
    conn.socket.emit('data', Buffer.from('{"id":1,"result":{"text":"hello"}}\n'));
    const result = await promise;
    expect(result).toEqual({ text: 'hello' });
  });
});
