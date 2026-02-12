/**
 * DaemonConnection — persistent Unix socket client.
 *
 * Wire protocol: newline-delimited JSON.
 *
 * Send:    {"id":1,"method":"run","params":{"args":{...},"cwd":"/"},"version":"0.1.0"}\n
 * Receive: {"id":1,"result":{"text":"..."},"version":"0.1.0"}\n
 */

import net from 'node:net';

export class DaemonConnection {
  constructor(sockPath, version) {
    this.sockPath = sockPath;
    this.version = version;
    this.socket = null;
    this.nextId = 1;
    this.callbacks = new Map();
    this.pendingBuffers = [];
  }

  async connect() {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection(this.sockPath, () => {
        this.socket = sock;
        resolve(true);
      });
      sock.on('data', (buf) => this._onData(buf));
      sock.on('error', (err) => {
        if (!this.socket) reject(err);
        else this._handleError(err);
      });
      sock.on('close', () => {
        this.socket = null;
        for (const cb of this.callbacks.values()) {
          cb.reject(new Error('Connection closed'));
        }
        this.callbacks.clear();
      });
    });
  }

  get connected() {
    return this.socket !== null && !this.socket.destroyed;
  }

  /**
   * Send a raw message to the daemon.
   * Returns the result from the daemon response.
   */
  async send(method, params = {}) {
    if (!this.connected) throw new Error('Not connected to daemon');
    const id = this.nextId++;
    const msg = { id, method, params, version: this.version };
    return new Promise((resolve, reject) => {
      this.callbacks.set(id, { resolve, reject });
      this.socket.write(JSON.stringify(msg) + '\n', (err) => {
        if (err) {
          this.callbacks.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Send a "run" command — the standard way to execute CLI commands.
   * `minimistArgs` is a pre-parsed minimist object, e.g. { _: ["click", "e5"] }
   */
  async run(minimistArgs) {
    return this.send('run', { args: minimistArgs, cwd: process.cwd() });
  }

  close() {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  // ─── Internal: newline-delimited JSON parsing ────────────────────────

  _onData(buffer) {
    let end = buffer.indexOf('\n');
    if (end === -1) {
      this.pendingBuffers.push(buffer);
      return;
    }
    this.pendingBuffers.push(buffer.slice(0, end));
    this._dispatch(Buffer.concat(this.pendingBuffers).toString());
    let start = end + 1;
    end = buffer.indexOf('\n', start);
    while (end !== -1) {
      this._dispatch(buffer.toString(undefined, start, end));
      start = end + 1;
      end = buffer.indexOf('\n', start);
    }
    this.pendingBuffers = [buffer.slice(start)];
  }

  _dispatch(message) {
    try {
      const obj = JSON.parse(message);
      if (obj.id && this.callbacks.has(obj.id)) {
        const cb = this.callbacks.get(obj.id);
        this.callbacks.delete(obj.id);
        if (obj.error) cb.reject(new Error(obj.error));
        else cb.resolve(obj.result);
      }
    } catch {
      // Ignore parse errors on partial messages
    }
  }

  _handleError(err) {
    if (err.code !== 'EPIPE')
      console.error(`\n⚠️  Socket error: ${err.message}`);
  }
}
