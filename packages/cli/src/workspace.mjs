/**
 * Workspace detection and daemon lifecycle.
 *
 * Socket hash: sha1(workspaceDir || packageLocation).substring(0, 16)
 * where packageLocation = our package.json (same as daemon-launcher.cjs uses).
 */

import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import net from 'node:net';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// packageLocation must point to CLI's package.json (not core's) — it's used
// for socket hash computation and must match what daemon-launcher.cjs computes.
const packageLocation = fileURLToPath(new URL('../../package.json', import.meta.url));

// ─── Workspace detection ─────────────────────────────────────────────────────

export function findWorkspaceDir(startDir) {
  let dir = startDir;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, '.playwright'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return undefined;
}

// ─── Hash (must match daemon-launcher.cjs → program.js logic) ────────────────

const workspaceDir = findWorkspaceDir(process.cwd());
const hashInput = workspaceDir || packageLocation;
const workspaceDirHash = crypto.createHash('sha1').update(hashInput).digest('hex').substring(0, 16);

// ─── Socket path ─────────────────────────────────────────────────────────────

function socketsBaseDir() {
  if (process.platform === 'win32') return null;
  return process.env.PLAYWRIGHT_DAEMON_SOCKETS_DIR || path.join(os.tmpdir(), 'playwright-cli');
}

export function socketPath(sessionName) {
  if (process.platform === 'win32')
    return `\\\\.\\pipe\\${workspaceDirHash}-${sessionName}.sock`;
  return path.join(socketsBaseDir(), workspaceDirHash, `${sessionName}.sock`);
}

// ─── Daemon profiles dir ─────────────────────────────────────────────────────

function baseDaemonDir() {
  if (process.platform === 'darwin')
    return path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright', 'daemon');
  if (process.platform === 'win32')
    return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'ms-playwright', 'daemon');
  return path.join(os.homedir(), '.cache', 'ms-playwright', 'daemon');
}

export const daemonProfilesDir = path.join(baseDaemonDir(), workspaceDirHash);

// ─── Daemon lifecycle ────────────────────────────────────────────────────────

export async function isDaemonRunning(sessionName) {
  const sockPath = socketPath(sessionName);
  return new Promise((resolve) => {
    const sock = net.createConnection(sockPath, () => {
      sock.destroy();
      resolve(true);
    });
    sock.on('error', () => resolve(false));
  });
}

/**
 * Start daemon using our own launcher (no @playwright/cli needed).
 */
export async function startDaemon(sessionName, opts = {}) {
  const launcherPath = fileURLToPath(new URL('../bin/daemon-launcher.cjs', import.meta.url));

  const args = [launcherPath];
  if (sessionName !== 'default') args.push(`-s=${sessionName}`);
  args.push('open');
  if (opts.headed) args.push('--headed');
  if (opts.browser) args.push('--browser', opts.browser);
  if (opts.persistent) args.push('--persistent');
  if (opts.profile) args.push('--profile', opts.profile);
  if (opts.config) args.push('--config', opts.config);

  if (!opts.silent) console.log(`🚀 Starting daemon...`);

  try {
    const output = execSync(`node ${args.map(a => `"${a}"`).join(' ')}`, {
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    if (output.trim()) console.log(output.trim());
  } catch (err) {
    if (err.stdout?.trim()) console.log(err.stdout.trim());
    if (err.stderr?.trim()) console.error(err.stderr.trim());
  }
}

export { workspaceDirHash };
