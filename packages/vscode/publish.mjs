#!/usr/bin/env node
/**
 * Package/publish VS Code extension using @vercel/nft.
 *
 * 1. Build monorepo + extension
 * 2. nft-build: trace deps, assemble .vsce-build/
 * 3. vsce package --no-dependencies (creates VSIX without node_modules)
 * 4. Append nft-traced node_modules to VSIX using yazl/yauzl
 * 5. Optionally publish to marketplace
 *
 * Usage:
 *   node publish.mjs          # package only (creates .vsix)
 *   node publish.mjs publish  # package + publish to marketplace
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import yazl from 'yazl';
import yauzl from 'yauzl';

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
const tmpPath = vsixPath + '.tmp';

await new Promise((resolve, reject) => {
  yauzl.open(vsixPath, { lazyEntries: true }, (err, zipReader) => {
    if (err) return reject(err);

    const zipWriter = new yazl.ZipFile();
    const output = fs.createWriteStream(tmpPath);
    let added = 0;

    zipReader.on('entry', (entry) => {
      zipReader.openReadStream(entry, (err, stream) => {
        if (err) return reject(err);

        // Fix Content_Types — add .mjs if missing
        if (entry.fileName === '[Content_Types].xml') {
          const chunks = [];
          stream.on('data', c => chunks.push(c));
          stream.on('end', () => {
            let ct = Buffer.concat(chunks).toString('utf8');
            if (!ct.includes('.mjs')) {
              ct = ct.replace('</Types>', '<Default Extension=".mjs" ContentType="application/javascript"/></Types>');
            }
            zipWriter.addBuffer(Buffer.from(ct), entry.fileName);
            zipReader.readEntry();
          });
        } else {
          zipWriter.addReadStream(stream, entry.fileName, {
            compress: entry.fileName.endsWith('.map') ? false : true,
          });
          zipReader.readEntry();
        }
      });
    });

    zipReader.on('end', () => {
      // Add node_modules files
      const nmDir = path.join(BUILD, 'node_modules');
      (function walk(dir) {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const fp = path.join(dir, f.name);
          if (f.isDirectory()) walk(fp);
          else {
            const arcname = 'extension/' + path.relative(BUILD, fp).split(path.sep).join('/');
            zipWriter.addFile(fp, arcname);
            added++;
          }
        }
      })(nmDir);

      zipWriter.end();
      console.log(`Added ${added} node_modules files`);
    });

    zipWriter.outputStream.pipe(output);
    output.on('close', () => {
      fs.renameSync(tmpPath, vsixPath);
      const size = fs.statSync(vsixPath).size;
      console.log(`VSIX: ${(size / 1024 / 1024).toFixed(1)} MB`);
      resolve();
    });

    zipReader.readEntry();
  });
});

// ─── 5. Copy VSIX / Publish ─────────────────────────────────────────────
fs.cpSync(vsixPath, path.join(VSCODE_PKG, vsixName));

if (doPublish) {
  console.log('\n=== Step 5: Publish ===');
  run(`npx @vscode/vsce publish -i ${vsixName}`, { cwd: BUILD });
} else {
  console.log(`\nVSIX: packages/vscode/${vsixName}`);
}

console.log('\nDone!');
