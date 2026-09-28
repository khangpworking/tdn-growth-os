import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tabletQuoteFixture } from '../helpers/tablet-quote-fixture.js';
import { replayTabletQuoteNormalization } from '../../src/modules/analysis/tablet-quote-normalizer.js';

// Pure tests own the arithmetic; publisher tests own retry, conflict and file
// safety. This test owns only the actual quote CLI's complete byte wiring.
test('quote CLI binds exact input and replayable result in its private export manifest', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-quote-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const inputFile = path.join(root, 'quote.json'), output = path.join(root, 'export');
  const input = tabletQuoteFixture();
  const original = Buffer.from(JSON.stringify(input, null, 2) + '\n');
  await fs.writeFile(inputFile, original, { mode: 0o600 });
  const child = spawnSync(process.execPath,
    ['--import', 'tsx', 'scripts/normalize-tablet-quote.ts', inputFile, output],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 });
  assert.equal(child.status, 0, child.stderr);
  const receipt = JSON.parse(child.stdout);
  assert.equal(receipt.quoteId, input.quoteId);
  assert.equal(receipt.status, 'SCENARIO');
  assert.deepEqual(await fs.readFile(inputFile), original);
  assert.deepEqual(await fs.readFile(path.join(output, 'raw-input.json')), original);
  const resultBytes = await fs.readFile(path.join(output, 'result.json'));
  const result = JSON.parse(resultBytes.toString('utf8'));
  const canonicalInput = JSON.parse(await fs.readFile(path.join(output, 'input.json'), 'utf8'));
  assert.deepEqual(replayTabletQuoteNormalization(canonicalInput, result), result);
  assert.equal(receipt.resultSha256, createHash('sha256').update(resultBytes).digest('hex'));
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8')) as {
    quoteId: string; files: { name: string; byteSize: number; sha256: string }[];
  };
  assert.equal(manifest.quoteId, input.quoteId);
  assert.deepEqual(manifest.files.map(file => file.name).sort(), ['input.json', 'raw-input.json', 'result.json']);
  for (const file of manifest.files) {
    const bytes = await fs.readFile(path.join(output, file.name));
    assert.equal(bytes.length, file.byteSize);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
});
