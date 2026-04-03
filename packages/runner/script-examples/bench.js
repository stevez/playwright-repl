/**
 * Benchmark: pw repl (evaluate) vs pw repl-extension (evaluate)
 *
 * Both now use serviceWorker.evaluate() — should be roughly the same speed.
 *
 * Usage: node packages/runner/script-examples/bench.js
 *        node packages/runner/script-examples/bench.js --headless
 */

import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '../../..');
const pw = path.join(root, 'packages/runner/dist/pw-cli.js');
const script = path.join(root, 'packages/runner/script-examples/todomvc.js');
const RUNS = 5;
const headless = process.argv.includes('--headless');
const headlessFlag = headless ? ' --headless' : '';

function run(cmd) {
  const output = execSync(`node ${pw} ${cmd}`, { cwd: root, encoding: 'utf-8', timeout: 30000 });
  return output.trim();
}

function extractTime(output) {
  const match = output.match(/([\d.]+)ms/);
  return match ? parseFloat(match[1]) : null;
}

// 1. Benchmark pw repl (evaluate)
console.log(`=== pw repl (evaluate) — ${RUNS} runs ===`);
const replTimes = [];
for (let i = 0; i < RUNS; i++) {
  const output = run(`repl${headlessFlag} "${script}"`);
  const ms = extractTime(output);
  if (ms !== null) replTimes.push(ms);
  console.log(`  Run ${i + 1}: ${ms}ms`);
}

// 2. Benchmark pw repl-extension (evaluate)
console.log(`\n=== pw repl-extension (evaluate) — ${RUNS} runs ===`);
const extTimes = [];
for (let i = 0; i < RUNS; i++) {
  const output = run(`repl-extension${headlessFlag} "${script}"`);
  const ms = extractTime(output);
  if (ms !== null) extTimes.push(ms);
  console.log(`  Run ${i + 1}: ${ms}ms`);
}

// 3. Summary
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const replAvg = avg(replTimes);
const extAvg = avg(extTimes);

console.log('\n=== Summary ===');
console.log(`  pw repl:           avg ${replAvg.toFixed(1)}ms  (${replTimes.map(t => t + 'ms').join(', ')})`);
console.log(`  pw repl-extension: avg ${extAvg.toFixed(1)}ms  (${extTimes.map(t => t + 'ms').join(', ')})`);
console.log('Done.');
process.exit(0);
