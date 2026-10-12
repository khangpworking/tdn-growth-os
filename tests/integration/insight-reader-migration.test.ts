import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase, applyMigrations } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const historicalRunId = '22222222-2222-4222-8222-222222222223';
const at = '2026-10-01T00:00:00.000Z';

test('0050 preserves populated historical Market ledger and bytes, rolls back atomically, and isolates both reader kinds', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-reader-upgrade-'));
  const prior = path.join(root, 'prior'), failed = path.join(root, 'failed');
  await fs.mkdir(prior); await fs.mkdir(failed);
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const name of (await fs.readdir('migrations')).filter(name => /^\d{4}_.*\.sql$/.test(name))) {
    if (Number(name.slice(0, 4)) < 50) await fs.copyFile(path.join('migrations', name), path.join(prior, name));
    await fs.copyFile(path.join('migrations', name), path.join(failed, name));
  }
  await fs.appendFile(path.join(failed, '0050_analysis_reader_report_kinds.sql'), '\nSELECT * FROM synthetic_missing_table_0050;\n');
  const { db } = openDatabase({ databasePath: path.join(root, 'fixture.sqlite'), migrationsDirectory: prior });
  t.after(() => db.close());
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const html = await artifacts.put(Buffer.from('<!doctype html><html lang="vi"><body>Market historical bytes 123</body></html>'));
  const metadata = await artifacts.put(Buffer.from('{"synthetic":"historical-input-profile-metrics-claims"}'));
  for (const [artifact, media] of [[html, 'text/html; charset=utf-8'], [metadata, 'application/json']] as const) {
    db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,?,?,?,'1.0.0','active',?)`).run(artifact.sha256, artifact.byteSize, media, artifact.relativePath, at, at);
  }
  for (const id of [runId, historicalRunId]) db.prepare(`INSERT INTO analysis_research_automation_runs
    (run_id,workspace_id,revision,status,mode,keyword,period_start,period_end,reports,start_request_sha256,actor_id,created_at,updated_at)
    VALUES (?,?,1,'DRAFT_READY','CATEGORY','Synthetic','2026-09-01','2026-09-30','MARKET,INSIGHT',?,'owner:synthetic',?,?)`)
    .run(id, workspaceId, metadata.sha256, at, at);
  const insert = (kind: 'MARKET' | 'INSIGHT', number: number, extra: Record<string, unknown> = {}) => {
    const row: Record<string, unknown> = {
      revision_id: randomUUID(), workspace_id: workspaceId, run_id: runId, revision_number: number,
      request_key: randomUUID(), request_sha256: metadata.sha256, draft_pair_id: metadata.sha256,
      metric_package_id: kind === 'MARKET' ? randomUUID() : null, platforms: kind === 'MARKET' ? 'shopee' : null,
      profile_status: kind === 'MARKET' ? 'proposed' : null, input_sha256: metadata.sha256,
      profile_sha256: kind === 'MARKET' ? metadata.sha256 : null, cover_sha256: null, html_sha256: html.sha256,
      metrics_sha256: metadata.sha256, claims_sha256: metadata.sha256,
      builder_version: kind === 'MARKET' ? 'reader-report-market-v3' : 'reader-report-insight-v1', actor_id: 'owner:synthetic', created_at: at,
      ...(db.pragma('user_version', { simple: true }) as number | bigint >= 50 ? { report_kind: kind,
        semantic_sha256: kind === 'INSIGHT' ? metadata.sha256 : null, source_report_sha256: kind === 'INSIGHT' ? html.sha256 : null } : {}),
      ...extra,
    };
    db.prepare(`INSERT INTO analysis_reader_report_revisions(${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
    return row;
  };
  const decision = (row: Record<string, unknown>, key = randomUUID()) => db.prepare(`INSERT INTO analysis_reader_report_decisions
    (revision_id,run_id,decision,request_key,reason,actor_id,decided_at) VALUES (?,?,'APPROVED',?,NULL,'owner:synthetic',?)`)
    .run(row.revision_id, row.run_id, key, at);
  const market1 = insert('MARKET', 1); decision(market1);
  const market2 = insert('MARKET', 2);
  const historical1 = insert('MARKET', 1, { run_id: historicalRunId }); decision(historical1);
  insert('MARKET', 2, { run_id: historicalRunId });
  // Model a historical run that cannot accept a fresh build. Copying its rows
  // must happen before the replacement live INSERT/latest triggers are installed.
  const guard = db.prepare("SELECT sql FROM sqlite_schema WHERE name='analysis_research_automation_runs_guard'").get() as { sql: string };
  db.exec('DROP TRIGGER analysis_research_automation_runs_guard');
  db.prepare("UPDATE analysis_research_automation_runs SET status='CANCELLED' WHERE run_id=?").run(historicalRunId);
  db.exec(guard.sql);
  const rows = () => db.prepare('SELECT * FROM analysis_reader_report_revisions ORDER BY revision_id').all() as Record<string, unknown>[];
  const decisions = () => db.prepare('SELECT * FROM analysis_reader_report_decisions ORDER BY revision_id').all();
  const oldRows = rows(), oldDecisions = decisions();
  const oldManifests = db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all();
  const oldMigrations = db.prepare('SELECT * FROM schema_migrations ORDER BY version').all();
  // openDatabase applies migrations before enabling safe-integer projections.
  // Match that production ordering on this already-open fixture connection.
  const migrate = (migrationsDirectory?: string) => {
    db.defaultSafeIntegers(false);
    try { return applyMigrations(db, migrationsDirectory ? { migrationsDirectory } : {}); }
    finally { db.defaultSafeIntegers(true); }
  };
  assert.throws(() => migrate(failed), /synthetic_missing_table_0050/);
  assert.equal(db.pragma('user_version', { simple: true }), 49n);
  assert.deepEqual(rows(), oldRows); assert.deepEqual(decisions(), oldDecisions);
  assert.deepEqual(db.prepare('SELECT * FROM schema_migrations ORDER BY version').all(), oldMigrations);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(migrate(), { applied: [50, 51, 52, 53, 54], currentVersion: 54 });
  assert.deepEqual(rows().map(({ report_kind, semantic_sha256, source_report_sha256, ...old }) => {
    assert.equal(report_kind, 'MARKET'); assert.equal(semantic_sha256, null); assert.equal(source_report_sha256, null); return old;
  }), oldRows);
  assert.deepEqual(decisions(), oldDecisions);
  assert.deepEqual(db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(), oldManifests);
  assert.deepEqual(await artifacts.read(html.sha256), Buffer.from('<!doctype html><html lang="vi"><body>Market historical bytes 123</body></html>'));
  assert.deepEqual(migrate(), { applied: [], currentVersion: 54 });
  // Additive TikTok ledgers arrive empty; their immutability is proven at the owning boundary.
  assert.equal(Number((db.prepare('SELECT COUNT(*) n FROM analysis_tiktok_report_consumption').get() as { n: number | bigint }).n), 0);
  assert.equal(Number((db.prepare('SELECT COUNT(*) n FROM analysis_tiktok_coding_executions').get() as { n: number | bigint }).n), 0);
  const insight1 = insert('INSIGHT', 1);
  assert.throws(() => insert('INSIGHT', 3), /reader_report_requires_draft_ready_sequence/);
  assert.throws(() => insert('MARKET', 3, { metric_package_id: null }), /CHECK constraint/);
  assert.throws(() => insert('MARKET', 3, { profile_status: null }), /CHECK constraint/);
  assert.throws(() => insert('INSIGHT', 2, { source_report_sha256: null }), /CHECK constraint/);
  assert.throws(() => insert('INSIGHT', 2, { semantic_sha256: null }), /CHECK constraint/);
  assert.throws(() => insert('INSIGHT', 2, { metric_package_id: randomUUID() }), /CHECK constraint/);
  assert.throws(() => insert('INSIGHT', 2, { source_report_sha256: 'A'.repeat(64) }), /CHECK constraint/);
  assert.throws(() => insert('INSIGHT', 2, { source_report_sha256: 'f'.repeat(64) }), /FOREIGN KEY constraint/);
  assert.throws(() => insert('INSIGHT', 2, { workspace_id: randomUUID() }), /reader_report_requires_draft_ready_sequence/);
  assert.throws(() => insert('INSIGHT', 2, { request_key: market1.request_key }), /UNIQUE constraint/);
  decision(market2); // Insight build cannot supersede the latest distinct Market.
  const insight2 = insert('INSIGHT', 2);
  assert.throws(() => decision(insight1), /reader_report_decision_requires_latest_revision/);
  assert.throws(() => decision({ ...insight2, run_id: historicalRunId }), /reader_report_decision_requires_latest_revision/);
  decision(insight2);
  assert.throws(() => decision(insight2), /UNIQUE constraint/);
  assert.throws(() => db.prepare('UPDATE analysis_reader_report_revisions SET html_sha256=? WHERE revision_id=?').run(metadata.sha256, market1.revision_id), /immutable_reader_report_revision/);
  assert.throws(() => db.prepare('DELETE FROM analysis_reader_report_revisions WHERE revision_id=?').run(insight1.revision_id), /immutable_reader_report_revision/);
  assert.throws(() => db.prepare("UPDATE analysis_reader_report_decisions SET decision='REJECTED' WHERE revision_id=?").run(market1.revision_id), /immutable_reader_report_decision/);
  assert.throws(() => db.prepare('DELETE FROM analysis_reader_report_decisions WHERE revision_id=?').run(insight2.revision_id), /immutable_reader_report_decision/);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.deepEqual(db.prepare('SELECT * FROM analysis_reader_report_decisions WHERE revision_id=?').get(market1.revision_id), oldDecisions.find(row => (row as { revision_id: unknown }).revision_id === market1.revision_id));
});
