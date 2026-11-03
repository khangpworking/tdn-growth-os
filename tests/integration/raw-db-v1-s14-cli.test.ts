import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { s07Fixture } from '../fixtures/raw-db-v1-s07.js';
import { S14_FILE, S14_RECEIPT, S14_RUN } from '../fixtures/raw-db-v1-s14.js';

test('RAWDB-W W9: CLI S14 --file --privacy-file --dry-run prints counts and leaves exact database bytes unchanged', async t => {
  const f = await s07Fixture(t);
  f.db.pragma('wal_checkpoint(TRUNCATE)'); f.db.pragma('journal_mode = DELETE');
  const before = await fs.readFile(f.databasePath);
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/raw-db-load.ts', '--source', 'S14', '--run', S14_RUN,
    '--file', S14_FILE, '--privacy-file', f.privacyFile, '--db', f.databasePath, '--artifacts', f.artifactRoot, '--dry-run'], {
    encoding: 'utf8', timeout: 30_000, env: { ...process.env, TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot,
      TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: path.join(f.root, 'absent-env-key.json') },
  });
  assert.equal(child.error, undefined); assert.equal(child.status, 0, child.stderr); assert.equal(child.stderr, '');
  const lines = child.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1); assert.deepEqual(JSON.parse(lines[0]!), S14_RECEIPT);
  assert.deepEqual(await fs.readFile(f.databasePath), before);
});
