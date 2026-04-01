#!/usr/bin/env node
/**
 * Package/publish VS Code extension using @vercel/nft.
 *
 * 1. Build monorepo + extension
 * 2. nft-build: trace deps, assemble .vsce-build/
 * 3. vsce package --no-dependencies (creates VSIX without node_modules)
 * 4. Append nft-traced node_modules to VSIX
 * 5. Optionally publish to marketplace
 *
 * Usage:
 *   node publish.mjs          # package only (creates .vsix)
 *   node publish.mjs publish  # package + publish to marketplace
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import AdmZip from 'adm-zip';

const VSCODE_PKG = import.meta.dirname;
const ROOT = path.resolve(VSCODE_PKG, '..', '..');
const BUILD = path.join(VSCODE_PKG, '.vsce-build');
const doPublish = process.argv.includes('publish');

function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', ...opts });
}

// ─── 1. Build ────────────────────────────────────────────────────────────
console.log('=== Step 1: Build ===');
run('pnpm run build', { cwd: ROOT });
run('node build.mjs', { cwd: VSCODE_PKG });

// ─── 2. nft-build ────────────────────────────────────────────────────────
console.log('\n=== Step 2: Trace dependencies ===');
run('node nft-build.mjs', { cwd: VSCODE_PKG });

// ─── 3. vsce package ─────────────────────────────────────────────────────
console.log('\n=== Step 3: Package VSIX ===');
run('npx @vscode/vsce package --no-dependencies', { cwd: BUILD });

// ─── 4. Append node_modules to VSIX ─────────────────────────────────────
console.log('\n=== Step 4: Append node_modules ===');
const vsixName = fs.readdirSync(BUILD).find(f => f.endsWith('.vsix'));
if (!vsixName) throw new Error('No .vsix file found');
const vsixPath = path.join(BUILD, vsixName);

const zip = new AdmZip(vsixPath);

// Add node_modules files
const nmDir = path.join(BUILD, 'node_modules');
let added = 0;
(function walk(dir) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const fp = path.join(dir, f.name);
    if (f.isDirectory()) walk(fp);
    else {
      const arcname = 'extension/' + path.relative(BUILD, fp).split(path.sep).join('/');
      zip.addLocalFile(fp, path.dirname(arcname));
      added++;
    }
  }
})(nmDir);

// Fix Content_Types — add .mjs if missing
const ctEntry = zip.getEntry('[Content_Types].xml');
if (ctEntry) {
  let ct = ctEntry.getData().toString('utf8');
  if (!ct.includes('.mjs')) {
    ct = ct.replace('</Types>', '<Default Extension=".mjs" ContentType="application/javascript"/></Types>');
    zip.updateFile(ctEntry, Buffer.from(ct));
  }
}

zip.writeZip(vsixPath);
console.log(`Added ${added} files to VSIX`);

const size = fs.statSync(vsixPath).size;
console.log(`VSIX: ${(size / 1024 / 1024).toFixed(1)} MB`);

// ─── 5. Copy VSIX / Publish ─────────────────────────────────────────────
fs.cpSync(vsixPath, path.join(VSCODE_PKG, vsixName));

if (doPublish) {
  console.log('\n=== Step 5: Publish ===');
  run(`npx @vscode/vsce publish -i ${vsixName}`, { cwd: BUILD });
} else {
  console.log(`\nVSIX: packages/vscode/${vsixName}`);
}

console.log('\nDone!');
