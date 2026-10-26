// Usage: node scripts/ci/split-backend-tests.mjs list <shard> <count>
//        printf '%s\0' tests/unit/*.test.ts tests/integration/*.test.ts | node scripts/ci/split-backend-tests.mjs verify <count>
// Refresh: after preparing the normal backend environment, run `node scripts/ci/split-backend-tests.mjs measure`.
// measure runs every file separately and only replaces timings after every file passes.
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../../', import.meta.url));
const timingsPath = new URL('./backend-timings.json', import.meta.url);
const files = ['tests/unit', 'tests/integration'].flatMap(dir =>
  readdirSync(`${root}/${dir}`).filter(name => name.endsWith('.test.ts')).map(name => `${dir}/${name}`)
).sort();
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const [command, ...args] = process.argv.slice(2);
const positiveInteger = value => {
  if (!/^[1-9]\d*$/.test(value ?? '') || !Number.isSafeInteger(Number(value))) {
    throw new Error(`Expected a positive integer, got ${value}`);
  }
  return Number(value);
};

function split(count) {
  const timings = JSON.parse(readFileSync(timingsPath, 'utf8'));
  const weights = new Map(files.map(file => [file, timings.files[file] ?? timings.defaultMs]));
  for (const [file, weight] of weights) {
    if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Invalid timing for ${file}`);
  }
  const shards = Array.from({ length: count }, () => ({ files: [], weight: 0 }));
  // Longest processing time first; path and shard index break ties deterministically.
  for (const file of [...files].sort((a, b) => weights.get(b) - weights.get(a) || compare(a, b))) {
    const target = shards.reduce((best, shard) => shard.weight < best.weight ? shard : best);
    target.files.push(file);
    target.weight += weights.get(file);
  }
  return shards.map(shard => shard.files.sort());
}

if (command === 'list' && args.length === 2) {
  const index = positiveInteger(args[0]);
  const count = positiveInteger(args[1]);
  if (index > count) throw new Error('Shard index exceeds count');
  const selected = split(count)[index - 1];
  if (!selected.length) throw new Error('Refusing to invoke the test runner with an empty shard');
  process.stdout.write(selected.join('\0') + '\0');
} else if (command === 'verify' && args.length === 1) {
  const shards = split(positiveInteger(args[0]));
  const actual = shards.flat().sort();
  // The shell supplies an independent expansion of the full test glob.
  const expected = readFileSync(0, 'utf8').split('\0');
  if (expected.pop() !== '') throw new Error('Expected a NUL-terminated file list');
  expected.sort();
  if (!expected.length || shards.some(shard => !shard.length) ||
      new Set(actual).size !== actual.length || JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error('Backend shard coverage mismatch: missing, duplicated or unexpected test files');
  }
  console.log(`Verified ${actual.length} files run exactly once across ${shards.length} shards`);
} else if (command === 'measure' && args.length === 0) {
  const measured = {};
  for (const file of files) {
    const start = performance.now();
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', file], { cwd: root, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error(`Measurement failed: ${file}`, { cause: result.error });
    measured[file] = Math.round((performance.now() - start) * 1000) / 1000;
  }
  writeFileSync(timingsPath, JSON.stringify({
    source: `Per-file local wall milliseconds, measured ${new Date().toISOString()} with ${process.version}`,
    defaultMs: 5000,
    files: measured
  }, null, 2) + '\n');
} else {
  throw new Error('Usage: split-backend-tests.mjs list <shard> <count> | verify <count> | measure');
}
