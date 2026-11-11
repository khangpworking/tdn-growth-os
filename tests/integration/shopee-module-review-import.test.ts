/**
 * Real module M3 imports into a real migrated SQLite file through the owning
 * S05 writer: verified source selection, provenance, duplicate/concurrent
 * reuse, first-version retention, conflicts, rollback, denied configuration.
 * No collection or provider call is made.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import {
  discoverModuleReviewSources, reviewArchive, type VerifiedModuleReviewCollection,
} from '../../src/modules/foundation/shopee-module-review-data.js';
import { reviewDataView, saveModuleReviewData } from '../../src/modules/raw-db/module-shopee-reviews.js';
import { vietnamTime } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import {
  LINKS, addCustomAttempt, addLegacySource, createModuleRun, moduleRow, sha256,
} from '../fixtures/shopee-module-review-data.js';

const envKeys = ['TDN_WORKSPACE_DB', 'TDN_ARTIFACT_ROOT', 'SHOPEE_FLOW_STATE', 'TDN_SHOPEE_FLOW_READONLY'] as const;
const coreTables = ['raw_capture', 'product', 'product_name_source', 'review', 'run_review'] as const;
const writtenTables = [...coreTables, 'artifact_manifests', 'raw_db_module_review_import'] as const;

function rejection(code: string) {
  return (error: unknown) => (error as { code?: string }).code === code;
}

function tableCounts(db: Database.Database): Record<string, number> {
  const names = (db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[]).map(row => row.name);
  return Object.fromEntries(names.map(name => [name,
    Number((db.prepare(`SELECT count(*) n FROM "${name}"`).get() as { n: number | bigint }).n)]));
}

function assertNoSideEffects(before: Record<string, number>, after: Record<string, number>): void {
  for (const [table, count] of Object.entries(before)) {
    if (!writtenTables.includes(table as typeof writtenTables[number])) assert.equal(after[table], count, `${table} changed`);
  }
}

async function workspace(t: TestContext) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-import-'));
  const databasePath = path.join(base, 'app.sqlite');
  const artifactRoot = path.join(base, 'artifacts');
  const stateRoot = path.join(base, 'state');
  await fs.mkdir(artifactRoot);
  await fs.mkdir(stateRoot);
  const db = new Database(databasePath);
  applyMigrations(db);
  db.close();
  const previous = Object.fromEntries(envKeys.map(key => [key, process.env[key]]));
  process.env.TDN_WORKSPACE_DB = databasePath;
  process.env.TDN_ARTIFACT_ROOT = artifactRoot;
  process.env.SHOPEE_FLOW_STATE = stateRoot;
  delete process.env.TDN_SHOPEE_FLOW_READONLY;
  t.after(async () => {
    for (const key of envKeys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
    await fs.rm(base, { recursive: true, force: true });
  });
  const open = () => new Database(databasePath);
  const countsNow = () => { const handle = open(); try { return tableCounts(handle); } finally { handle.close(); } };
  return { base, databasePath, artifactRoot, stateRoot, open, countsNow };
}

async function customSource(base: string, runId: string, rowsByLink: ReturnType<typeof moduleRow>[][],
  rawNameRows?: readonly Record<string, unknown>[]) {
  const run = await createModuleRun(base, { runId, ...(rawNameRows === undefined ? {} : { rawNameRows }) });
  const attempt = await addCustomAttempt(run, { rowsByLink });
  const [source] = await discoverModuleReviewSources(run.runDir);
  assert.ok(source);
  return { run, attempt, source };
}

function archiveSha(source: VerifiedModuleReviewCollection): string {
  return sha256(Buffer.from(canonicalJson(reviewArchive(source))));
}

test('a verified custom source imports captures, provenance, rows and membership once', async t => {
  const f = await workspace(t);
  const { run, source } = await customSource(f.base, 'run-import-custom', [
    [moduleRow(LINKS[0]!, 'import-a')], [moduleRow(LINKS[1]!, 'import-b', { ratingStar: 5 })],
  ]);
  const before = f.countsNow();
  const receipt = await saveModuleReviewData(run.runDir, source.sourceSha256);
  assert.deepEqual(receipt, {
    format: 'review-data-saved-v1', runId: run.runId, sourceSha256: source.sourceSha256,
    datasetId: `module-m3:${run.runId}:${source.sourceSha256}`, importPolicyVersion: 'module-m3-s05-v1',
    importedAt: receipt.importedAt, rowCount: 2, reviewsInserted: 2, reviewsAlreadyPresent: 0,
    runReviewsInserted: 2, firstVersionDiffers: 0, reused: false,
  });

  const db = f.open();
  try {
    assertNoSideEffects(before, tableCounts(db));
    const archive = archiveSha(source);
    const raw = JSON.parse(await fs.readFile(path.join(run.runDir, 'm1', '30d', 'raw-responses.json'), 'utf8'));
    const namesBytes = Buffer.from(canonicalJson({ format: 'module-metric-product-names-v1',
      metricInputSha256: run.m1Sha256, m2Digest: source.m2Digest, raw }));
    const namesSha = sha256(namesBytes);
    assert.deepEqual(db.prepare('SELECT sha256,byte_size FROM artifact_manifests ORDER BY sha256').all(),
      [{ sha256: archive, byte_size: Buffer.byteLength(canonicalJson(reviewArchive(source))) },
        { sha256: namesSha, byte_size: namesBytes.length }].sort((left, right) => left.sha256.localeCompare(right.sha256)));

    for (const [index, link] of source.links.entries()) {
      const captureId = `S05:module:${source.sourceSha256}:${index}`;
      const capture = db.prepare('SELECT * FROM raw_capture WHERE capture_id=?').get(captureId) as Record<string, unknown>;
      assert.equal(capture.run_id, receipt.datasetId);
      assert.equal(capture.source_code, 'S05');
      assert.equal(capture.provider, 'shopee-public-review');
      assert.equal(capture.operation, 'shopee.module_reviews.import');
      assert.equal(capture.requested_at, '2026-11-10T00:05:00.000Z');
      assert.equal(capture.completed_at, '2026-11-10T00:05:00.000Z');
      assert.equal(capture.outcome, 'OK');
      assert.equal(capture.response_sha256, archive);
      assert.equal(capture.raw_path, `artifact:${archive}`);
      assert.equal(capture.response_sha256_basis, 'RETAINED_ENVELOPE');
      assert.deepEqual(JSON.parse(capture.request_params_json as string), {
        moduleRunId: run.runId, sourceSha256: source.sourceSha256, attemptId: source.attemptId,
        planSha256: source.planSha256, requestSha256: source.requestSha256, m2Digest: source.m2Digest,
        link, collectionTimeBasis: 'provider-terminal-updated-at', importedAt: receipt.importedAt,
      });
    }

    assert.deepEqual(db.prepare('SELECT product_key,platform,item_id,shop_id,product_name,product_url,first_capture_id FROM product ORDER BY product_key').all(), [
      { product_key: 'shopee:101', platform: 'shopee', item_id: '101', shop_id: '201', product_name: 'Synthetic jar 1',
        product_url: LINKS[0]!.url, first_capture_id: `S05:module:${source.sourceSha256}:0` },
      { product_key: 'shopee:102', platform: 'shopee', item_id: '102', shop_id: '202', product_name: 'Synthetic jar 2',
        product_url: LINKS[1]!.url, first_capture_id: `S05:module:${source.sourceSha256}:1` },
    ]);
    assert.deepEqual(db.prepare('SELECT product_key,source_kind,artifact_sha256,capture_id,json_path FROM product_name_source ORDER BY product_key').all(), [
      { product_key: 'shopee:101', source_kind: 'APP_CAPTURE', artifact_sha256: namesSha, capture_id: null,
        json_path: '$.raw["responses"][0]["body"]["data"][0].product_name' },
      { product_key: 'shopee:102', source_kind: 'APP_CAPTURE', artifact_sha256: namesSha, capture_id: null,
        json_path: '$.raw["responses"][0]["body"]["data"][1].product_name' },
    ]);

    const rows = db.prepare('SELECT * FROM review ORDER BY review_key').all() as Record<string, unknown>[];
    assert.deepEqual(rows.map(row => [row.review_key, row.external_id, row.product_key, row.rating_star,
      row.text, row.attributes_json, row.posted_at, row.state, row.collected_at, row.capture_id, row.source_position]), [
      ['S05:import-a', 'import-a', 'shopee:101', 4, 'Synthetic comment', '["Synthetic material","Synthetic size"]',
        '2026-11-03T03:04:00+07:00', 'VALID', '2026-11-10T00:05:00.000Z',
        `S05:module:${source.sourceSha256}:0`, 'page=2,row=0'],
      ['S05:import-b', 'import-b', 'shopee:102', 5, 'Synthetic comment', '["Synthetic material","Synthetic size"]',
        '2026-11-03T03:04:00+07:00', 'VALID', '2026-11-10T00:05:00.000Z',
        `S05:module:${source.sourceSha256}:1`, 'page=2,row=0'],
    ]);
    assert.equal(rows[0]!.reviewer_name_state, 'not_provided');
    assert.deepEqual(db.prepare('SELECT run_id,review_key,capture_id,source_position FROM run_review ORDER BY review_key').all(), [
      { run_id: receipt.datasetId, review_key: 'S05:import-a', capture_id: `S05:module:${source.sourceSha256}:0`, source_position: 'page=2,row=0' },
      { run_id: receipt.datasetId, review_key: 'S05:import-b', capture_id: `S05:module:${source.sourceSha256}:1`, source_position: 'page=2,row=0' },
    ]);
    const registry = db.prepare('SELECT * FROM raw_db_module_review_import').get() as Record<string, unknown>;
    assert.equal(registry.source_sha256, source.sourceSha256);
    assert.equal(registry.import_policy_version, 'module-m3-s05-v1');
    assert.equal(registry.module_run_id, run.runId);
    assert.equal(registry.source_kind, 'custom');
    assert.equal(registry.attempt_id, source.attemptId);
    assert.equal(registry.archive_sha256, archive);
    assert.equal(Number(registry.row_count), 2);
    assert.deepEqual(JSON.parse(registry.receipt_json as string), receipt);

    const after = tableCounts(db);
    const view = await reviewDataView(run.runDir);
    assert.deepEqual(view.db, { configured: true, schemaReady: true, blockedBy: null });
    const listed = view.sources.find(item => item.sourceSha256 === source.sourceSha256);
    assert.ok(listed);
    assert.equal(listed.canSaveDb, true);
    assert.equal(listed.dbBlockedBy, null);
    assert.equal(listed.importReceipt?.reused, true);
    assert.deepEqual(listed.importReceipt, { ...receipt, reviewsInserted: 0, reviewsAlreadyPresent: 2, runReviewsInserted: 0, reused: true });
    assert.equal(listed.exportFormats.json.canExport, true);
    assert.equal(listed.exportFormats.txt.canExport, true);
    assert.deepEqual(f.countsNow(), after, 'reading the view does not write');

    assert.throws(() => db.prepare('UPDATE raw_db_module_review_import SET row_count=0').run(),
      /immutable_raw_db_module_review_import/);
    assert.throws(() => db.prepare('DELETE FROM raw_db_module_review_import').run(),
      /immutable_raw_db_module_review_import/);
  } finally { db.close(); }
});

test('duplicate and concurrent imports reuse the receipt without extra rows', async t => {
  const f = await workspace(t);
  const { run, source } = await customSource(f.base, 'run-import-duplicate', [
    [moduleRow(LINKS[0]!, 'dup-a')], [moduleRow(LINKS[1]!, 'dup-b')],
  ]);

  const [a, b] = await Promise.all([
    saveModuleReviewData(run.runDir, source.sourceSha256), saveModuleReviewData(run.runDir, source.sourceSha256),
  ]);
  assert.deepEqual([a.reused, b.reused].sort(), [false, true]);
  const first = a.reused ? b : a;
  assert.equal(first.reviewsInserted, 2);
  const afterFirst = f.countsNow();
  assert.equal(afterFirst.raw_capture, 2);
  assert.equal(afterFirst.raw_db_module_review_import, 1);

  const second = await saveModuleReviewData(run.runDir, source.sourceSha256);
  assert.deepEqual(second, { ...first, reviewsInserted: 0, reviewsAlreadyPresent: 2, runReviewsInserted: 0, reused: true });
  assert.deepEqual(f.countsNow(), afterFirst, 'a repeated import keeps one row set');
});

test('a later attempt reuses existing reviews and reports first-version differences without overwriting them', async t => {
  const f = await workspace(t);
  const run = await createModuleRun(f.base, { runId: 'run-import-versions' });
  await addCustomAttempt(run, {
    attemptId: '11111111-1111-4111-8111-111111111111',
    rowsByLink: [[moduleRow(LINKS[0]!, 'version-a', { comment: 'First version' })], [moduleRow(LINKS[1]!, 'version-b')]],
  });
  const later = await addCustomAttempt(run, {
    attemptId: '22222222-2222-4222-8222-222222222222',
    rowsByLink: [[moduleRow(LINKS[0]!, 'version-a', { comment: 'Second version' })], [moduleRow(LINKS[1]!, 'version-b')]],
  });
  const sources = await discoverModuleReviewSources(run.runDir);
  const first = sources.find(source => source.attemptId === '11111111-1111-4111-8111-111111111111');
  const second = sources.find(source => source.attemptId === later.attemptId);
  assert.ok(first && second);

  const firstReceipt = await saveModuleReviewData(run.runDir, first.sourceSha256);
  const receipt = await saveModuleReviewData(run.runDir, second.sourceSha256);
  assert.equal(receipt.datasetId, `module-m3:${run.runId}:${second.sourceSha256}`);
  assert.notEqual(receipt.datasetId, firstReceipt.datasetId);
  assert.equal(receipt.reviewsInserted, 0);
  assert.equal(receipt.reviewsAlreadyPresent, 2);
  assert.equal(receipt.runReviewsInserted, 2);
  assert.equal(receipt.firstVersionDiffers, 1);
  assert.equal(receipt.reused, false);

  const db = f.open();
  try {
    assert.equal((db.prepare("SELECT text FROM review WHERE review_key='S05:version-a'").get() as { text: string }).text,
      'First version', 'the first stored version wins');
    assert.deepEqual(db.prepare('SELECT run_id,count(*) n FROM run_review GROUP BY run_id ORDER BY run_id').all(), [
      { run_id: firstReceipt.datasetId, n: 2 }, { run_id: receipt.datasetId, n: 2 },
    ].sort((left, right) => left.run_id.localeCompare(right.run_id)));
    assert.deepEqual(db.prepare('SELECT count(*) n FROM raw_capture').get(), { n: 4 });
    assert.deepEqual(db.prepare('SELECT count(*) n FROM product').get(), { n: 2 });
    assert.equal(Number((db.prepare('SELECT count(*) n FROM artifact_manifests').get() as { n: number }).n), 3);
    assert.equal(Number((db.prepare('SELECT count(*) n FROM raw_db_module_review_import').get() as { n: number }).n), 2);
  } finally { db.close(); }

  const before = f.countsNow();
  const again = await saveModuleReviewData(run.runDir, first.sourceSha256);
  assert.equal(again.reused, true);
  assert.deepEqual(f.countsNow(), before, 're-importing an older source changes nothing');
});

test('legacy proof imports with the retained-observation time basis', async t => {
  const f = await workspace(t);
  const run = await createModuleRun(f.base, { runId: 'run-import-legacy' });
  await addLegacySource(run);
  const [source] = await discoverModuleReviewSources(run.runDir);
  assert.ok(source);
  const receipt = await saveModuleReviewData(run.runDir, source.sourceSha256);
  assert.equal(receipt.rowCount, 2);
  assert.equal(receipt.reviewsInserted, 2);
  const db = f.open();
  try {
    const capture = db.prepare(`SELECT request_params_json,completed_at FROM raw_capture WHERE capture_id=?`)
      .get(`S05:module:${source.sourceSha256}:0`) as { request_params_json: string; completed_at: string };
    assert.equal(capture.completed_at, '2026-11-10T00:05:00.000Z');
    const params = JSON.parse(capture.request_params_json) as Record<string, unknown>;
    assert.equal(params.collectionTimeBasis, 'retained-observed-at');
    assert.equal(params.attemptId, null);
    assert.equal(params.planSha256, null);
    assert.equal(Number((db.prepare('SELECT count(*) n FROM review').get() as { n: number | bigint }).n), 2);
  } finally { db.close(); }
});

test('a stored product collision refuses the import before any write', async t => {
  const f = await workspace(t);
  const { run, source } = await customSource(f.base, 'run-import-collision', [
    [moduleRow(LINKS[0]!, 'collide-a')], [moduleRow(LINKS[1]!, 'collide-b')],
  ]);
  const db = f.open();
  db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('seed','S05','seed','seed','2026-01-01T00:00:00.000Z','OK')`).run();
  db.prepare(`INSERT INTO product(product_key,platform,item_id,shop_id,product_name,first_capture_id)
    VALUES ('shopee:101','shopee','101','999','Existing product','seed')`).run();
  const before = tableCounts(db); db.close();

  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('DB_IMPORT_CONFLICT'));
  const after = f.open();
  try {
    assert.deepEqual(tableCounts(after), before);
    assert.deepEqual(after.prepare('SELECT count(*) n FROM raw_db_module_review_import').get(), { n: 0 });
    assert.deepEqual(after.prepare('SELECT count(*) n FROM review').get(), { n: 0 });
  } finally { after.close(); }
});

test('missing or ambiguous Metric names refuse the import without writes', async t => {
  const f = await workspace(t);
  const missingRun = await createModuleRun(f.base, { runId: 'run-import-no-names', rawNameRows: [] });
  await addCustomAttempt(missingRun, { rowsByLink: [[moduleRow(LINKS[0]!, 'name-a')], [moduleRow(LINKS[1]!, 'name-b')]] });
  const [missing] = await discoverModuleReviewSources(missingRun.runDir);
  assert.ok(missing);
  await assert.rejects(saveModuleReviewData(missingRun.runDir, missing.sourceSha256), rejection('PRODUCT_NAME_PROVENANCE_MISSING'));

  const ambiguousRun = await createModuleRun(f.base, {
    runId: 'run-import-ambiguous', rawNameRows: [
      { product_base_id: '1__101__201', product_name: 'First name' },
      { product_base_id: '1__101__201', product_name: 'Second name' },
      { product_base_id: '1__102__202', product_name: 'Synthetic jar 2' },
    ],
  });
  await addCustomAttempt(ambiguousRun, { rowsByLink: [[moduleRow(LINKS[0]!, 'amb-a')], [moduleRow(LINKS[1]!, 'amb-b')]] });
  const [ambiguous] = await discoverModuleReviewSources(ambiguousRun.runDir);
  assert.ok(ambiguous);
  await assert.rejects(saveModuleReviewData(ambiguousRun.runDir, ambiguous.sourceSha256), rejection('PRODUCT_NAME_AMBIGUOUS'));

  const db = f.open();
  try {
    assert.deepEqual(db.prepare('SELECT count(*) n FROM raw_capture').get(), { n: 0 });
    assert.deepEqual(db.prepare('SELECT count(*) n FROM raw_db_module_review_import').get(), { n: 0 });
    assert.deepEqual(db.prepare('SELECT count(*) n FROM artifact_manifests').get(), { n: 0 });
  } finally { db.close(); }
});

test('an attributes shape failure rolls the whole import back', async t => {
  const f = await workspace(t);
  const { run, source } = await customSource(f.base, 'run-import-rollback', [
    [moduleRow(LINKS[0]!, 'rollback-a')],
    [moduleRow(LINKS[1]!, 'rollback-b', { attributes: [''] })],
  ]);
  const before = f.countsNow();
  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), /^Error: RAW_DB_ATTRIBUTES_SHAPE:/);
  const db = f.open();
  try {
    const after = tableCounts(db);
    assert.deepEqual(after, before, 'no capture, product, provenance, review, membership, manifest or receipt row survives');
    for (const table of writtenTables) assert.equal(after[table], 0, table);
  } finally { db.close(); }
});

test('unconfigured or unmigrated databases are denied and never upgraded', async t => {
  const f = await workspace(t);
  const { run, source } = await customSource(f.base, 'run-import-denied', [
    [moduleRow(LINKS[0]!, 'denied-a')], [moduleRow(LINKS[1]!, 'denied-b')],
  ]);
  const before = f.countsNow();

  delete process.env.TDN_WORKSPACE_DB;
  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('APP_DB_NOT_CONFIGURED'));

  process.env.TDN_WORKSPACE_DB = path.join(f.base, 'missing.sqlite');
  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('APP_DB_NOT_CONFIGURED'));

  process.env.TDN_WORKSPACE_DB = path.relative(f.base, f.databasePath);
  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('APP_DB_NOT_CONFIGURED'));

  process.env.TDN_WORKSPACE_DB = f.databasePath;
  process.env.TDN_ARTIFACT_ROOT = path.join(f.base, 'missing-artifacts');
  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('APP_DB_NOT_CONFIGURED'));
  process.env.TDN_ARTIFACT_ROOT = f.artifactRoot;

  const emptyPath = path.join(f.base, 'empty.sqlite');
  new Database(emptyPath).close();
  process.env.TDN_WORKSPACE_DB = emptyPath;
  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('DB_SCHEMA_REQUIRED'));
  const empty = new Database(emptyPath);
  try {
    assert.deepEqual(empty.prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'").all(), [],
      'the denied save does not auto-migrate');
    const view = await reviewDataView(run.runDir);
    assert.deepEqual(view.db, { configured: true, schemaReady: false, blockedBy: { code: 'DB_SCHEMA_REQUIRED' } });
    assert.equal(view.sources.find(item => item.sourceSha256 === source.sourceSha256)?.canSaveDb, false);
  } finally { empty.close(); }

  process.env.TDN_WORKSPACE_DB = f.databasePath;
  assert.deepEqual(f.countsNow(), before);
});

test('a pre-existing product without name provenance blocks import and still exports', async t => {
  const f = await workspace(t);
  // Only the second link has a verified Metric name; the first is stored before product_name_source existed.
  const { run, source } = await customSource(f.base, 'run-import-pre0071-no-source', [
    [moduleRow(LINKS[0]!, 'pre0071-a')], [moduleRow(LINKS[1]!, 'pre0071-b')],
  ], [{ product_base_id: '1__102__202', product_name: 'Synthetic jar 2' }]);
  const db = f.open();
  db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('pre0071-seed','S05','seed','seed','2026-01-01T00:00:00.000Z','OK')`).run();
  db.prepare(`INSERT INTO product(product_key,platform,item_id,shop_id,product_name,first_capture_id)
    VALUES ('shopee:101','shopee','101','201','Stored before provenance','pre0071-seed')`).run();
  const before = tableCounts(db); db.close();

  await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('PRODUCT_NAME_PROVENANCE_MISSING'));
  const after = f.open();
  try {
    assert.deepEqual(tableCounts(after), before, 'the denied import writes nothing');
    assert.deepEqual(after.prepare('SELECT count(*) n FROM product_name_source').get(), { n: 0 });
    const view = await reviewDataView(run.runDir);
    assert.equal(view.db.blockedBy, null);
    const listed = view.sources.find(item => item.sourceSha256 === source.sourceSha256);
    assert.ok(listed);
    assert.equal(listed.canSaveDb, false);
    assert.deepEqual(listed.dbBlockedBy, { code: 'PRODUCT_NAME_PROVENANCE_MISSING' });
    assert.equal(listed.exportFormats.json.canExport, true, 'file export is independent of DB provenance');
    assert.equal(listed.exportFormats.txt.canExport, true);
    assert.deepEqual(tableCounts(after), before, 'viewing and exporting eligibility write nothing');
  } finally { after.close(); }
});

test('verified evidence establishes missing provenance for a stored product in the import transaction', async t => {
  const f = await workspace(t);
  const { run, source } = await customSource(f.base, 'run-import-pre0071-evidence', [
    [moduleRow(LINKS[0]!, 'evidence-a')], [moduleRow(LINKS[1]!, 'evidence-b')],
  ]);
  const db = f.open();
  db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('pre0071-seed','S05','seed','seed','2026-01-01T00:00:00.000Z','OK')`).run();
  db.prepare(`INSERT INTO product(product_key,platform,item_id,shop_id,product_name,first_capture_id)
    VALUES ('shopee:101','shopee','101','201','Synthetic jar 1','pre0071-seed')`).run();
  db.close();

  const receipt = await saveModuleReviewData(run.runDir, source.sourceSha256);
  assert.equal(receipt.reviewsInserted, 2);
  const raw = JSON.parse(await fs.readFile(path.join(run.runDir, 'm1', '30d', 'raw-responses.json'), 'utf8'));
  const namesSha = sha256(Buffer.from(canonicalJson({ format: 'module-metric-product-names-v1',
    metricInputSha256: run.m1Sha256, m2Digest: source.m2Digest, raw })));
  const imported = f.open();
  try {
    assert.deepEqual(imported.prepare('SELECT product_key,item_id,shop_id,product_name,first_capture_id FROM product ORDER BY product_key').all(), [
      { product_key: 'shopee:101', item_id: '101', shop_id: '201', product_name: 'Synthetic jar 1',
        first_capture_id: 'pre0071-seed' },
      { product_key: 'shopee:102', item_id: '102', shop_id: '202', product_name: 'Synthetic jar 2',
        first_capture_id: `S05:module:${source.sourceSha256}:1` },
    ], 'the stored product keeps its name and first capture');
    assert.deepEqual(imported.prepare('SELECT product_key,source_kind,artifact_sha256,capture_id,json_path FROM product_name_source ORDER BY product_key').all(), [
      { product_key: 'shopee:101', source_kind: 'APP_CAPTURE', artifact_sha256: namesSha, capture_id: null,
        json_path: '$.raw["responses"][0]["body"]["data"][0].product_name' },
      { product_key: 'shopee:102', source_kind: 'APP_CAPTURE', artifact_sha256: namesSha, capture_id: null,
        json_path: '$.raw["responses"][0]["body"]["data"][1].product_name' },
    ], 'verified evidence is recorded for the pre-existing and the new product together');
  } finally { imported.close(); }
});

test('read-only refuses a save even when every other prerequisite is valid', async t => {
  const f = await workspace(t);
  const { run, source } = await customSource(f.base, 'run-import-readonly', [
    [moduleRow(LINKS[0]!, 'readonly-a')], [moduleRow(LINKS[1]!, 'readonly-b')],
  ]);
  process.env.TDN_SHOPEE_FLOW_READONLY = '1';
  try {
    await assert.rejects(saveModuleReviewData(run.runDir, source.sourceSha256), rejection('READONLY_ON'));
  } finally { delete process.env.TDN_SHOPEE_FLOW_READONLY; }
  const db = f.open();
  try { assert.deepEqual(db.prepare('SELECT count(*) n FROM raw_db_module_review_import').get(), { n: 0 }); } finally { db.close(); }
});
