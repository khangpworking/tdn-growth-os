import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, mock } from 'node:test';
import Database from 'better-sqlite3';
import { codesFixture } from '../fixtures/raw-db-v1-codes.js';
import { labelsFixture, seedLabelReview } from '../fixtures/raw-db-v1-labels.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { cliValue, exists, snapshotPath, startY2Cli } from '../fixtures/raw-db-v1-y2.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected parent network'); }); });
afterEach(() => mock.restoreAll());

interface SnapshotReceipt { path: string; bytes: number; publishedAt: string }
// COMMON-Y2 fixes this production export. Runtime import keeps the tests-only branch typecheckable before it lands.
const publisher = async () => (await import(new URL('../../src/modules/raw-db/app-db-snapshot.js', import.meta.url).href)) as {
  publishAppDbSnapshot(db: Database.Database, dir: string): Promise<SnapshotReceipt>;
};

function snapshotReceipt(value: unknown, expectedPath: string): SnapshotReceipt | undefined {
  if (!value || typeof value !== 'object') return undefined;
  if ('path' in value && value.path === expectedPath) return value as SnapshotReceipt;
  for (const child of Object.values(value)) {
    const found = snapshotReceipt(child, expectedPath);
    if (found) return found;
  }
  return undefined;
}

async function checkReceipt(receipt: SnapshotReceipt | undefined, file: string, started: number) {
  assert.ok(receipt, 'the result reports the published path, byte length and time');
  assert.equal(receipt.path, file);
  assert.equal(receipt.bytes, (await fs.stat(file)).size);
  assert.ok(Date.parse(receipt.publishedAt) >= started - 1000 && Date.parse(receipt.publishedAt) <= Date.now() + 1000);
}

test('RAWDB-Y2 S1: publication includes committed WAL pages, stays standalone and replaces the old generation atomically', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-y2-snapshot-'));
  const db = new Database(path.join(root, 'live.sqlite'));
  t.after(async () => { if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); });
  db.pragma('journal_mode=WAL');
  db.pragma('wal_autocheckpoint=0');
  db.exec(`CREATE TABLE generation(part TEXT PRIMARY KEY, value INTEGER NOT NULL, padding TEXT NOT NULL) STRICT;
    INSERT INTO generation VALUES ('left',0,printf('%09000d',0)),('right',0,printf('%09000d',0));`);
  db.pragma('wal_checkpoint(TRUNCATE)');
  db.exec('BEGIN; UPDATE generation SET value=1; COMMIT; BEGIN; UPDATE generation SET value=99; ROLLBACK;');
  assert.ok((await fs.stat(`${db.name}-wal`)).size > 0, 'generation one is committed only in WAL');
  const { publishAppDbSnapshot } = await publisher();
  const directory = path.join(root, 'published'), file = path.join(directory, 'app-db.snapshot.sqlite');
  const started = Date.now(), receipt = await publishAppDbSnapshot(db, directory);
  const readGeneration = () => {
    const copy = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const rows = copy.prepare('SELECT part,value FROM generation ORDER BY part').all();
      assert.equal(copy.pragma('journal_mode', { simple: true }), 'delete');
      assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
      return rows;
    } finally { copy.close(); }
  };
  assert.deepEqual(readGeneration(), [{ part: 'left', value: 1 }, { part: 'right', value: 1 }],
    'snapshot contains the complete committed WAL generation, never the base file or an uncommitted generation');
  await checkReceipt(receipt, file, started);
  assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  assert.equal(await exists(`${file}-wal`), false);
  assert.equal(await exists(`${file}-shm`), false);
  const previous = await fs.open(file, 'r'), bytes = await fs.readFile(file), inode = (await previous.stat()).ino;
  try {
    const foreignTemp = path.join(directory, '.tmp-other-publisher.sqlite');
    await fs.writeFile(foreignTemp, 'foreign temporary work: preserve me');
    db.exec('BEGIN; UPDATE generation SET value=2; COMMIT;');
    await publishAppDbSnapshot(db, directory);
    assert.deepEqual(readGeneration(), [{ part: 'left', value: 2 }, { part: 'right', value: 2 }]);
    assert.notEqual((await fs.stat(file)).ino, inode, 'publication replaces the file instead of overwriting an open reader');
    assert.deepEqual(await previous.readFile(), bytes, 'an existing reader keeps its complete prior generation');
    assert.equal(await fs.readFile(foreignTemp, 'utf8'), 'foreign temporary work: preserve me');
    assert.deepEqual((await fs.readdir(directory)).sort(), ['.tmp-other-publisher.sqlite', 'app-db.snapshot.sqlite'],
      'only this publisher\'s temporary files are cleaned');
  } finally { await previous.close(); }
});

test('RAWDB-Y2 S2: real S05, LABELS and CODES publish their committed rows; SNAPSHOT publishes manually in the default directory', async t => {
  for (const source of ['S05', 'LABELS', 'CODES', 'SNAPSHOT'] as const) {
    const f = source === 'CODES' ? await codesFixture(t) : source === 'S05' ? await rawDbFixture(t) : await labelsFixture(t);
    let args: string[];
    if (source === 'CODES') {
      const c = f as Awaited<ReturnType<typeof codesFixture>>;
      args = ['--source', source, '--mcp-run', c.mcpRunFile, '--codebook', c.codebookFile, '--coder', c.coder];
    } else if (source === 'SNAPSHOT') {
      seedLabelReview(f.db, (f as Awaited<ReturnType<typeof labelsFixture>>).runId, 'synthetic-manual-snapshot');
      args = ['--source', source];
    } else {
      const runId = (f as Awaited<ReturnType<typeof labelsFixture>>).runId;
      if (source === 'LABELS') seedLabelReview(f.db, runId, 'synthetic-labelled-snapshot');
      args = ['--source', source, '--run', runId];
    }
    const started = Date.now(), running = await startY2Cli(t, f, args), value = await cliValue(running);
    const file = snapshotPath(f);
    assert.equal(await exists(file), true, `${source} publishes the default path`);
    await checkReceipt(snapshotReceipt(value, file), file, started);
    const copy = new Database(file, { readonly: true, fileMustExist: true });
    try {
      const reviews = Number(copy.prepare('SELECT count(*) FROM review').pluck().get());
      const codes = Number(copy.prepare('SELECT count(*) FROM review_code').pluck().get());
      assert.equal(reviews, source === 'S05' ? 3 : 1, source);
      assert.equal(codes, source === 'SNAPSHOT' ? 0 : source === 'S05' ? 3 : 1, `${source}: publication follows labelling/import commit`);
    } finally { copy.close(); }
    if (source === 'SNAPSHOT' || source === 'CODES') assert.equal((await running.calls()).length, 0);
    assert.equal((await fs.stat(path.dirname(file))).mode & 0o777, 0o700);
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
  }
});

test('RAWDB-Y2 S3: a failed snapshot publication is reported while successful loads and labels stay committed', async t => {
  for (const source of ['S05', 'LABELS', 'CODES'] as const) {
    const f = source === 'CODES' ? await codesFixture(t) : source === 'S05' ? await rawDbFixture(t) : await labelsFixture(t);
    // A non-empty directory at the destination forces rename to fail even for a privileged test runner.
    const file = snapshotPath(f), sentinel = path.join(file, 'synthetic-preserve');
    await fs.mkdir(file, { recursive: true });
    await fs.writeFile(sentinel, 'previous destination must survive');
    let args: string[];
    if (source === 'CODES') {
      const c = f as Awaited<ReturnType<typeof codesFixture>>;
      args = ['--source', source, '--mcp-run', c.mcpRunFile, '--codebook', c.codebookFile, '--coder', c.coder];
    } else {
      const runId = (f as Awaited<ReturnType<typeof labelsFixture>>).runId;
      if (source === 'LABELS') seedLabelReview(f.db, runId, 'synthetic-publish-failure');
      args = ['--source', source, '--run', runId];
    }
    const value = await cliValue(await startY2Cli(t, f, args));
    const report = Object.entries(value).filter(([key]) => /snapshot/i.test(key));
    assert.ok(report.length > 0, `${source}: snapshot outcome is part of the result`);
    assert.match(JSON.stringify(report), /error|fail|EISDIR|EEXIST|ENOTDIR/i, `${source}: failed publication is visible`);
    assert.equal(Number(f.db.prepare('SELECT count(*) FROM review_code').pluck().get()), source === 'S05' ? 3 : 1,
      `${source}: committed data survives a publisher failure`);
    assert.equal(await fs.readFile(sentinel, 'utf8'), 'previous destination must survive');
    assert.deepEqual(await fs.readdir(path.dirname(file)), ['app-db.snapshot.sqlite'], 'failed publication cleans its temporary file');
  }
});
