import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { setTimeout } from 'node:timers/promises';
import test, { afterEach, beforeEach, mock } from 'node:test';
import Database from 'better-sqlite3';
import { codesFixture } from '../fixtures/raw-db-v1-codes.js';
import { labelsFixture, labelledKeys, seedLabelReview } from '../fixtures/raw-db-v1-labels.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { cliValue, exists, holdLabelsLock, lockPath, snapshotPath, startY2Cli, until } from '../fixtures/raw-db-v1-y2.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected parent network'); }); });
afterEach(() => mock.restoreAll());

const labelsArgs = (runId: string) => ['--source', 'LABELS', '--run', runId];
const codesArgs = (f: Awaited<ReturnType<typeof codesFixture>>) =>
  ['--source', 'CODES', '--mcp-run', f.mcpRunFile, '--codebook', f.codebookFile, '--coder', f.coder];

test('RAWDB-Y2 C1: killing a pass releases its OS lock and the next pass reuses the same lock file', async t => {
  const f = await labelsFixture(t);
  const key = seedLabelReview(f.db, f.runId, 'synthetic-crash-lock');
  const first = await startY2Cli(t, f, labelsArgs(f.runId), { gate: true });
  await until(async () => (await first.calls()).length === 1, 'first pass reaches fake Jev while holding its lock');
  assert.equal(await exists(lockPath(f)), true, 'a real pass creates the agreed lock file');
  const inode = (await fs.stat(lockPath(f))).ino;
  const probe = new Database(lockPath(f), { timeout: 0 });
  try { assert.throws(() => probe.exec('BEGIN EXCLUSIVE'), { code: 'SQLITE_BUSY' }, 'the file is OS-locked, not an existence flag'); }
  finally { if (probe.inTransaction) probe.exec('ROLLBACK'); probe.close(); }
  first.child.kill('SIGKILL');
  assert.equal((await first.result).signal, 'SIGKILL');
  assert.deepEqual(labelledKeys(f.db), [], 'the interrupted review has no partial label group');
  const resumed = await startY2Cli(t, f, labelsArgs(f.runId));
  const receipt = await cliValue(resumed);
  assert.equal(receipt.labelled, 1);
  assert.equal((await resumed.calls()).length, 1);
  assert.deepEqual(labelledKeys(f.db), [key]);
  assert.equal((await fs.stat(lockPath(f))).ino, inode, 'release and reacquisition never unlink the lock file');
});

test('RAWDB-Y2 C2: LABELS, CODES and S05 wait before eligibility selection; Jev holds no app write transaction', async t => {
  for (const source of ['LABELS', 'CODES', 'S05'] as const) {
    const f = source === 'CODES' ? await codesFixture(t) : source === 'S05' ? await rawDbFixture(t) : await labelsFixture(t);
    const release = holdLabelsLock(f);
    try {
      const args = source === 'CODES' ? codesArgs(f as Awaited<ReturnType<typeof codesFixture>>) :
        ['--source', source, '--run', (f as Awaited<ReturnType<typeof labelsFixture>>).runId];
      const running = await startY2Cli(t, f, args, { gate: source !== 'CODES' });
      await until(async () => running.done || await exists(running.ready), `${source} CLI dependencies are ready`);
      // This is a bounded exclusion check, not a load/stress test. No fake request may escape while another pass owns the lock.
      await setTimeout(1000);
      assert.equal(running.done, false, `${source} must wait even if the pre-lock candidate set is empty`);
      assert.equal((await running.calls()).length, 0, `${source} cannot dispatch through another pass's lock`);
      if (source === 'S05') {
        assert.equal(Number(f.db.prepare('SELECT count(*) FROM review').pluck().get()), 3, 'S05 commits its load before waiting to label');
      }
      if (source !== 'CODES') {
        // Make a review eligible while the lock holder still owns the pass. A pre-lock query would miss it.
        const runId = (f as Awaited<ReturnType<typeof labelsFixture>>).runId;
        seedLabelReview(f.db, runId, 'synthetic-arrived-under-lock');
      }
      release();
      if (source !== 'CODES') {
        await until(async () => (await running.calls()).length > 0, `${source} reaches fake Jev after release`);
        const writer = new Database(f.databasePath, { timeout: 0 });
        try { writer.exec('BEGIN IMMEDIATE'); writer.exec('ROLLBACK'); }
        finally { writer.close(); }
        await fs.writeFile(running.release, 'continue');
      }
      const value = await cliValue(running);
      if (source === 'CODES') assert.equal(value.labelsInserted, 1);
      else {
        const receipt = (source === 'S05' ? value.labelling : value) as { eligible: number; labelled: number };
        assert.equal(receipt.eligible, source === 'S05' ? 4 : 1, 'eligibility is selected after lock acquisition');
        assert.equal(receipt.labelled, source === 'S05' ? 4 : 1);
      }
    } finally { release(); }
  }
});

test('RAWDB-Y2 C3: a competing pass waits at most ten seconds then reports LABELS_BUSY; S05 keeps its committed load', async t => {
  for (const source of ['LABELS', 'CODES', 'S05'] as const) {
    const f = source === 'CODES' ? await codesFixture(t) : source === 'S05' ? await rawDbFixture(t) : await labelsFixture(t);
    if (source === 'LABELS') seedLabelReview(f.db, (f as Awaited<ReturnType<typeof labelsFixture>>).runId, 'synthetic-busy');
    const release = holdLabelsLock(f);
    try {
      const args = source === 'CODES' ? codesArgs(f as Awaited<ReturnType<typeof codesFixture>>) :
        ['--source', source, '--run', (f as Awaited<ReturnType<typeof labelsFixture>>).runId];
      const running = await startY2Cli(t, f, args);
      await until(async () => running.done || await exists(running.ready), `${source} CLI dependencies are ready`);
      const attempted = Date.now(), result = await running.result, elapsed = Date.now() - attempted;
      assert.ok(elapsed >= 9000 && elapsed < 13_000, `${source}: bounded ten-second wait, observed ${elapsed}ms after dependency initialization`);
      assert.equal((await running.calls()).length, 0);
      assert.deepEqual(labelledKeys(f.db), []);
      if (source === 'S05') {
        assert.equal(result.status, 0, 'busy labelling cannot fail the load');
        const value = JSON.parse(result.stdout) as { reviewsInserted: number; labelling: unknown };
        assert.equal(value.reviewsInserted, 3);
        assert.equal(value.labelling, 'SKIPPED_BUSY');
        assert.equal(Number(f.db.prepare('SELECT count(*) FROM review').pluck().get()), 3);
      } else {
        assert.match(result.stdout + result.stderr, /LABELS_BUSY/, `${source}: stable busy error`);
        assert.notEqual(result.status, 0, `${source} exits with an error`);
      }
    } finally { release(); }
  }
});

test('RAWDB-Y2 C4: dry-run neither acquires nor creates a pass lock and makes no calls', async t => {
  for (const source of ['LABELS', 'CODES'] as const) {
    for (const locked of [false, true]) {
      const f = source === 'CODES' ? await codesFixture(t) : await labelsFixture(t);
      if (source === 'LABELS') seedLabelReview(f.db, (f as Awaited<ReturnType<typeof labelsFixture>>).runId, 'synthetic-dry-lock');
      const release = locked ? holdLabelsLock(f) : () => {};
      try {
        const before = f.db.serialize();
        const args = source === 'CODES' ? codesArgs(f as Awaited<ReturnType<typeof codesFixture>>) :
          labelsArgs((f as Awaited<ReturnType<typeof labelsFixture>>).runId);
        const running = await startY2Cli(t, f, [...args, '--dry-run']);
        const value = await cliValue(running);
        assert.equal(source === 'CODES' ? value.labelsInserted : value.eligible, 1);
        assert.equal((await running.calls()).length, 0);
        assert.deepEqual(f.db.serialize(), before);
        assert.equal(await exists(lockPath(f)), locked, 'an absent lock stays absent');
        assert.equal(await exists(snapshotPath(f)), false, 'dry-run publishes nothing');
      } finally { release(); }
    }
  }
});
