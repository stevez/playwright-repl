#!/usr/bin/env node
/**
 * Package/publish VS Code extension using @vercel/nft.
 *
 * 1. Build monorepo + extension
 * 2. nft-build: trace deps, assemble .vsce-build/
 * 3. vsce package --no-dependencies (creates VSIX without node_modules)
 * 4. Append nft-traced node_modules to VSIX via Python zipfile
 * 5. Optionally publish to marketplace
 *
 * Usage:
 *   node publish.mjs          # package only (creates .vsix)
 *   node publish.mjs publish  # package + publish to marketplace
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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
const vsixPath = path.join(BUILD, vsixName).replace(/\\/g, '/');
const nmDir = path.join(BUILD, 'node_modules').replace(/\\/g, '/');

run(`python3 -c "
import zipfile, os

vsix = '${vsixPath}'
tmp = vsix + '.tmp'

with zipfile.ZipFile(vsix, 'r') as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        if item.filename == '[Content_Types].xml':
            ct = zin.read(item.filename).decode()
            if '.mjs' not in ct:
                ct = ct.replace('</Types>', '<Default Extension=\\x22.mjs\\x22 ContentType=\\x22application/javascript\\x22/></Types>')
            zout.writestr(item, ct)
        else:
            zout.writestr(item, zin.read(item.filename))
    nm_dir = '${nmDir}'
    count = 0
    for root, dirs, files in os.walk(nm_dir):
        for f in files:
            fp = os.path.join(root, f)
            rel = os.path.relpath(fp, os.path.dirname(nm_dir)).replace(os.sep, '/')
            zout.write(fp, 'extension/' + rel)
            count += 1

os.replace(tmp, vsix)
print(f'Added {count} files, VSIX: {os.path.getsize(vsix) / 1024 / 1024:.1f} MB')
"`);

// ─── 5. Copy VSIX / Publish ─────────────────────────────────────────────
fs.cpSync(path.join(BUILD, vsixName), path.join(VSCODE_PKG, vsixName));

if (doPublish) {
  console.log('\n=== Step 5: Publish ===');
  run(`npx @vscode/vsce publish -i ${vsixName}`, { cwd: BUILD });
} else {
  console.log(`\nVSIX: packages/vscode/${vsixName}`);
}

console.log('\nDone!');
