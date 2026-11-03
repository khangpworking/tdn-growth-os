import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import Database from 'better-sqlite3';
import { codesFixture, emptyCodesReceipt } from '../fixtures/raw-db-v1-codes.js';

test('RAWDB-X X9: CODES CLI needs no run id or privacy file and dry-run prints counts without changing DB bytes', async t => {
  const f = await codesFixture(t);
  f.db.close();
  const before = await fs.readFile(f.databasePath);
  const run = (dryRun: boolean) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/raw-db-load.ts',
    '--source', 'CODES', '--mcp-run', f.mcpRunFile, '--codebook', f.codebookFile,
    '--coder', f.coder, '--db', f.databasePath, ...(dryRun ? ['--dry-run'] : [])], {
    cwd: path.resolve('.'), encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: path.join(f.root, 'unused-artifacts'),
      TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: undefined },
  });
  const child = run(true);
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  const lines = child.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!), { ...emptyCodesReceipt, codebookInserted: 1, labelsInserted: 1 });
  assert.deepEqual(await fs.readFile(f.databasePath), before);
  const after = new Database(f.databasePath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(after.prepare('SELECT count(*) FROM codebook').pluck().get(), 0);
    assert.equal(after.prepare('SELECT count(*) FROM review_code').pluck().get(), 0);
  } finally { after.close(); }
  const committed = run(false);
  assert.equal(committed.error, undefined);
  assert.equal(committed.status, 0, committed.stderr);
  const { snapshot, ...receipt } = JSON.parse(committed.stdout.trim());
  assert.deepEqual(receipt, { ...emptyCodesReceipt, codebookInserted: 1, labelsInserted: 1 });
  assert.equal(snapshot.path, path.join(f.root, 'app-db-snapshot', 'app-db.snapshot.sqlite'), 'a real import publishes the app DB snapshot');
  const persisted = new Database(f.databasePath, { readonly: true, fileMustExist: true });
  try {
    assert.equal(persisted.prepare('SELECT count(*) FROM codebook').pluck().get(), 1);
    assert.equal(persisted.prepare('SELECT count(*) FROM review_code').pluck().get(), 1);
  } finally { persisted.close(); }
});
