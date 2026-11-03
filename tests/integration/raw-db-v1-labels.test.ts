import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, mock } from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations, defaultMigrationsDirectory, readMigrations } from '../../src/platform/db/migrations.js';
import { loadReviewCodesToDbV1 } from '../../src/modules/raw-db/review-code-loader.js';
import { loadShopeeReviewsToDbV1 } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../../src/modules/raw-db/google-search-loader.js';
import { loadTikTokCommentsToDbV1 } from '../../src/modules/raw-db/tiktok-comments-loader.js';
import { loadKalodataVideosToDbV1 } from '../../src/modules/raw-db/kalodata-video-loader.js';
import { loadVideoReadingsToDbV1 } from '../../src/modules/raw-db/video-reading-loader.js';
import {
  LABEL_CAP, labelCli, labelCodebookText, labelledKeys, labelRun, labelsFixture, labelsGolden,
  noThemeResponses, seedLabelCode, seedLabelCodebook, seedLabelReview,
  type LabelCall, type LabelReceipt,
} from '../fixtures/raw-db-v1-labels.js';
import { codesHash, seedCodeReview, writeCodeInputs } from '../fixtures/raw-db-v1-codes.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { ANSWER, QUERY, saveGoogleCapture } from '../fixtures/raw-db-v1-google.js';
import { S07_FILE, S07_RUN, s07Privacy } from '../fixtures/raw-db-v1-s07.js';
import { S02B_FILE, S02B_RUN } from '../fixtures/raw-db-v1-s02b.js';
import { S14_FILE, S14_RUN } from '../fixtures/raw-db-v1-s14.js';
import { startRun } from '../helpers/autorun-harness.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected parent-process network'); }); });
afterEach(() => mock.restoreAll());

const labelsArgs = (runId?: string) => ['--source', 'LABELS', ...(runId ? ['--run', runId] : [])];
const count = (db: Database.Database, table: string) => Number(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
const callText = (call: LabelCall) => Object.values((call.body as { state: Record<string, string> }).state)[0]!;

// Each Y row has one primary owner below. Wire assertions protect MCP protocol parity;
// row assertions protect storage/provenance; S05 exercises the separate post-commit lifecycle.
test('RAWDB-Y Y1: the real CLI sends MCP golden wire bodies and persists the same labels, including rounding ties and applied category', async t => {
  for (const c of labelsGolden.cases) {
    const f = await labelsFixture(t, c.keyword);
    if (c.category) {
      const directory = path.join(path.dirname(f.databasePath), 'metric-captures', f.runId);
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(path.join(directory, 'scope.json'), JSON.stringify({
        contractVersion: 'autorun-scope-record-v2', runId: f.runId, keyword1: c.keyword,
        capture2: { outcome: 'OK', keywords: [c.keyword], category: c.category },
      }));
    }
    seedLabelReview(f.db, f.runId, `synthetic-parity-${c.id}`, { text: c.text, attributes_json: JSON.stringify(c.attributes) });
    const result = await labelCli(f, labelsArgs(f.runId), [{ raw: c.raw_response }]);
    assert.equal(result.calls.length, 1, c.id);
    assert.deepEqual(result.calls[0]!.body, c.wire, `${c.id}: MCP wire includes the complete text and attributes`);
    assert.deepEqual(f.db.prepare(`SELECT theme_code,confidence AS p_yes,polarity,status,block_key,journey_step AS step
      FROM review_code ORDER BY theme_code`).all(), c.labels, `${c.id}: MCP labels and thresholds`);
  }
});

test('RAWDB-Y Y2: APP_JEV rows bind the model, full coding text, call time and exact retained response; no-theme has one sentinel', async t => {
  const c = labelsGolden.cases[0]!, f = await labelsFixture(t);
  const model = 'synthetic-jev-model-v2';
  const themedRaw = c.raw_response.replace(labelsGolden.model, model);
  const noThemeRaw = labelsGolden.no_theme_response.replace(labelsGolden.model, model);
  const themed = seedLabelReview(f.db, f.runId, 'synthetic-a-themed', { text: c.text, attributes_json: JSON.stringify(c.attributes) });
  const none = seedLabelReview(f.db, f.runId, 'synthetic-z-no-theme', { text: 'Chỉ lời thử nghiệm 🧪', attributes_json: '[]' });
  const before = Date.now();
  const result = await labelCli(f, labelsArgs(f.runId), [
    { raw: themedRaw, text: c.coding_text },
    { raw: noThemeRaw, text: 'Chỉ lời thử nghiệm 🧪' },
  ], 'enabled', model);
  const after = Date.now(), receipt = result.value as LabelReceipt;
  assert.equal(result.calls.length, 2);
  assert.deepEqual({ eligible: receipt.eligible, called: receipt.called, labelled: receipt.labelled,
    noTheme: receipt.noTheme, rowsInserted: receipt.rowsInserted, failed: receipt.failed },
  { eligible: 2, called: 2, labelled: 2, noTheme: 1, rowsInserted: c.labels.length + 1, failed: null });
  const rows = f.db.prepare('SELECT * FROM review_code ORDER BY review_key,theme_code').all() as Record<string, unknown>[];
  assert.deepEqual(rows.filter(row => row.review_key === themed).map(({ coded_at, ...row }) => row), c.labels.map(label => ({
    review_key: themed, codebook_version: labelsGolden.codebook_version, theme_code: label.theme_code,
    block_key: label.block_key, polarity: label.polarity, journey_step: label.step, status: label.status,
    confidence: label.p_yes, coder: model, text_sha256: c.text_sha256,
    origin: 'APP_JEV', import_sha256: codesHash(themedRaw),
  })));
  const { coded_at: noThemeAt, ...noThemeRow } = rows.find(row => row.review_key === none)!;
  assert.deepEqual(noThemeRow, { review_key: none, codebook_version: labelsGolden.codebook_version,
    theme_code: 'NO_THEME', block_key: null, polarity: null, journey_step: null, status: 'kept', confidence: null,
    coder: model, text_sha256: codesHash('Chỉ lời thử nghiệm 🧪'), origin: 'APP_JEV',
    import_sha256: codesHash(noThemeRaw) });
  assert.equal(typeof noThemeAt, 'string');
  for (const row of rows) {
    const time = Date.parse(String(row.coded_at));
    assert.ok(time >= before - 1000 && time <= after + 1000, 'coded_at belongs to this call, allowing second precision');
  }
  assert.equal(new Set(rows.filter(row => row.review_key === themed).map(row => row.coded_at)).size, 1,
    'all labels from one answer share the call time');
  for (const raw of [themedRaw, noThemeRaw]) {
    assert.deepEqual(await f.artifacts.read(codesHash(raw)), Buffer.from(raw), 'evidence digest resolves to exact response bytes');
  }
  const book = f.db.prepare('SELECT * FROM codebook').get() as Record<string, unknown>;
  const { loaded_at, ...definition } = book;
  assert.ok(Number.isFinite(Date.parse(String(loaded_at))));
  assert.deepEqual(definition, { codebook_version: labelsGolden.codebook_version, contract_version: 'insight-theme-codebook-v1',
    status: 'DRAFT', approved_by: null, approved_at: null, definition_json: labelCodebookText,
    definition_sha256: codesHash(labelCodebookText) });
});

test('RAWDB-Y Y3: migration 0069 preserves an imported row exactly and retains STRICT, keys, foreign keys and immutability', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-labels-migration-'));
  const db = new Database(path.join(root, 'test.sqlite'));
  t.after(async () => { if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); });
  db.pragma('foreign_keys=ON');
  const beforeDirectory = path.join(root, 'through-0068');
  await fs.mkdir(beforeDirectory);
  for (const migration of readMigrations().filter(m => m.version <= 68)) {
    await fs.copyFile(path.join(defaultMigrationsDirectory, migration.name), path.join(beforeDirectory, migration.name));
  }
  assert.equal(applyMigrations(db, { migrationsDirectory: beforeDirectory }).currentVersion, 68);
  seedCodeReview(db);
  const inputs = await writeCodeInputs(root);
  await loadReviewCodesToDbV1(db, inputs.input);
  const before = db.prepare('SELECT * FROM review_code').all();
  assert.equal(before.length, 1, 'a genuine MCP import exists before migration');
  const bytesBefore = Buffer.from(JSON.stringify(before));
  const booksBefore = db.prepare('SELECT * FROM codebook').all();
  const tablesBefore = db.prepare("SELECT count(*) FROM sqlite_schema WHERE type='table'").pluck().get();
  // Through 0069 only: later migrations (0070 adds a table) are not part of this check.
  await fs.copyFile(path.join(defaultMigrationsDirectory, '0069_raw_db_v1_review_code_app_jev.sql'), path.join(beforeDirectory, '0069_raw_db_v1_review_code_app_jev.sql'));
  assert.deepEqual(applyMigrations(db, { migrationsDirectory: beforeDirectory }), { applied: [69], currentVersion: 69 });
  assert.equal(db.prepare('SELECT name FROM schema_migrations WHERE version=69').pluck().get(), '0069_raw_db_v1_review_code_app_jev.sql');
  assert.deepEqual(Buffer.from(JSON.stringify(db.prepare('SELECT * FROM review_code').all())), bytesBefore);
  assert.deepEqual(db.prepare('SELECT * FROM codebook').all(), booksBefore);
  assert.equal(db.prepare("SELECT count(*) FROM sqlite_schema WHERE type='table'").pluck().get(), tablesBefore);
  assert.equal(db.prepare("SELECT strict FROM pragma_table_list WHERE name='review_code'").pluck().get(), 1);
  const row = before[0] as Record<string, unknown>;
  const insert = (patch: Record<string, unknown>) => {
    const next = { ...row, theme_code: 'T-VI', ...patch };
    return db.prepare(`INSERT INTO review_code(${Object.keys(next).join(',')}) VALUES (${Object.keys(next).map(() => '?').join(',')})`)
      .run(...Object.values(next));
  };
  assert.equal(insert({ origin: 'APP_JEV' }).changes, 1);
  assert.throws(() => insert({ origin: 'APP_JEV' }), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  for (const origin of ['AI', 'APP', '', 'app_jev']) assert.throws(() => insert({ origin }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => insert({ origin: 'APP_JEV', theme_code: 'T-CHATLUONG', confidence: 'high' }), { code: 'SQLITE_CONSTRAINT_DATATYPE' });
  for (const column of ['review_key', 'codebook_version']) {
    assert.throws(() => insert({ origin: 'APP_JEV', [column]: 'synthetic-missing' }), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  }
  assert.deepEqual(db.prepare("SELECT name FROM pragma_index_info('review_code_by_theme') ORDER BY seqno").pluck().all(),
    ['codebook_version', 'theme_code']);
  const frozen = db.prepare('SELECT * FROM review_code ORDER BY theme_code').all();
  for (const origin of ['MCP_IMPORT', 'APP_JEV']) {
    for (const sql of ['UPDATE review_code SET coder=coder', 'DELETE FROM review_code']) {
      assert.throws(() => db.prepare(`${sql} WHERE origin=?`).run(origin), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
      assert.deepEqual(db.prepare('SELECT * FROM review_code ORDER BY theme_code').all(), frozen);
    }
  }
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});

test('RAWDB-Y Y4: eligibility excludes either current origin, blank coding text and other kinds while permitting another version and attribute-only text', async t => {
  const f = await labelsFixture(t);
  seedLabelCodebook(f.db);
  seedLabelCodebook(f.db, 'synthetic-old-version');
  const imported = seedLabelReview(f.db, f.runId, 'synthetic-imported');
  const app = seedLabelReview(f.db, f.runId, 'synthetic-app');
  const older = seedLabelReview(f.db, f.runId, 'synthetic-old-version');
  const attributeOnly = seedLabelReview(f.db, f.runId, 'synthetic-attribute-only', { text: ' \t', attributes_json: '["Vị thử 🍊"]' });
  const fresh = seedLabelReview(f.db, f.runId, 'synthetic-fresh');
  seedLabelReview(f.db, f.runId, 'synthetic-blank', { text: ' \r\n\t ', attributes_json: JSON.stringify(['  ', '\t']) });
  seedLabelReview(f.db, f.runId, 'synthetic-null', { text: null, attributes_json: null });
  seedLabelReview(f.db, f.runId, 'synthetic-comment', { kind: 'video_comment', source_code: 'S07', platform: 'tiktok',
    product_key: null, video_url: 'https://example.invalid/synthetic-video' });
  // TikTok Shop product reviews are eligible since owner F368 (raw-db-autoload); a product review of another platform is not.
  seedLabelReview(f.db, f.runId, 'synthetic-other-platform', { source_code: 'S07', platform: 'tiktok' });
  seedLabelCode(f.db, imported);
  seedLabelCode(f.db, app, 'APP_JEV');
  seedLabelCode(f.db, older, 'MCP_IMPORT', 'synthetic-old-version');
  const existing = f.db.prepare('SELECT * FROM review_code ORDER BY review_key').all();
  const result = await labelCli(f, labelsArgs(f.runId), noThemeResponses(3));
  const receipt = result.value as LabelReceipt;
  assert.equal(receipt.eligible, 3);
  assert.equal(receipt.called, 3);
  assert.equal(result.calls.length, 3);
  const states = result.calls.map(callText);
  for (const id of ['synthetic-imported', 'synthetic-app', 'synthetic-blank', 'synthetic-null', 'synthetic-comment', 'synthetic-other-platform']) {
    assert.ok(states.every(state => !state.includes(id)), `${id} must never be sent`);
  }
  assert.deepEqual(f.db.prepare(`SELECT review_key FROM review_code WHERE origin='APP_JEV' AND theme_code='NO_THEME' ORDER BY review_key`)
    .pluck().all(), [attributeOnly, fresh, older].sort());
  for (const row of existing as Record<string, unknown>[]) {
    assert.deepEqual(f.db.prepare('SELECT * FROM review_code WHERE review_key=? AND codebook_version=? AND theme_code=?')
      .get(row.review_key, row.codebook_version, row.theme_code), row);
  }
});

test('RAWDB-Y Y5: both caps bound calls and failures stop before writing that review while a later pass resumes', async t => {
  for (const cap of [2, LABEL_CAP]) {
    const f = await labelsFixture(t);
    f.db.transaction(() => {
      for (let i = 0; i < cap + 1; i++) seedLabelReview(f.db, f.runId, `synthetic-cap-${String(i).padStart(5, '0')}`);
    })();
    const result = await labelCli(f, [...labelsArgs(f.runId), '--max-calls', String(cap === 2 ? cap : cap + 7)], noThemeResponses(cap));
    const receipt = result.value as LabelReceipt;
    assert.equal(result.calls.length, cap);
    assert.equal(receipt.called, cap);
    assert.equal(receipt.eligible, cap + 1);
    assert.equal(receipt.skipped, 1);
    assert.equal(receipt.labelled, cap);
    assert.equal(receipt.failed, null);
    assert.equal(labelledKeys(f.db).length, cap);
    const resumed = await labelCli(f, labelsArgs(f.runId), noThemeResponses(1));
    assert.equal(resumed.calls.length, 1);
    assert.equal((resumed.value as LabelReceipt).labelled, 1);
    assert.equal(labelledKeys(f.db).length, cap + 1);
  }
  const malformed = JSON.parse(labelsGolden.cases[0]!.raw_response);
  // Valid earlier theme answers must not leak rows before the final answer is rejected.
  malformed.answers['T-DEUDUNG'].probabilities.KHONG_NHAC = 2;
  for (const failure of [
    { status: 503, raw: '{}', code: 'JEV_THEME_UNAVAILABLE' },
    { status: 200, raw: '{', code: 'JEV_THEME_UNAVAILABLE' },
    { status: 200, raw: JSON.stringify(malformed), code: 'JEV_THEME_INVALID' },
  ]) {
    const f = await labelsFixture(t);
    const keys = ['synthetic-failure-a', 'synthetic-failure-b', 'synthetic-failure-c']
      .map(id => seedLabelReview(f.db, f.runId, id));
    const result = await labelCli(f, labelsArgs(f.runId), [...noThemeResponses(1), failure, ...noThemeResponses(1)]);
    const receipt = result.value as LabelReceipt;
    assert.equal(result.calls.length, 2, failure.code);
    const called = result.calls.map(call => keys.find(key => callText(call).includes(key.slice(4)))!);
    assert.ok(called.every(Boolean), 'failure identifies real synthetic reviews');
    assert.notEqual(called[0], called[1]);
    assert.deepEqual({ called: receipt.called, labelled: receipt.labelled, rowsInserted: receipt.rowsInserted, failed: receipt.failed },
      { called: 2, labelled: 1, rowsInserted: 1, failed: { code: failure.code, reviewKey: called[1] } });
    assert.deepEqual(labelledKeys(f.db), [called[0]]);
    assert.equal(receipt.skipped, 1, 'the failed call is counted as called, and the unattempted review is skipped');
    const prior = f.db.prepare('SELECT * FROM review_code').get();
    const resumed = await labelCli(f, labelsArgs(f.runId), noThemeResponses(2));
    assert.equal(resumed.calls.length, 2);
    assert.equal((resumed.value as LabelReceipt).labelled, 2);
    assert.deepEqual(labelledKeys(f.db), keys.sort());
    assert.deepEqual(f.db.prepare('SELECT * FROM review_code WHERE review_key=?').get(called[0]), prior);
  }
  // Reject a later INSERT after earlier themes of the same answer have been inserted. The entire review must roll back,
  // while the prior completed review and the independently committed S05 load survive.
  const f = await rawDbFixture(t);
  f.db.exec(`CREATE TRIGGER synthetic_reject_late_label BEFORE INSERT ON review_code
    WHEN NEW.theme_code='T-CONGDUNG' BEGIN SELECT RAISE(ABORT,'synthetic_late_label_failure'); END;`);
  const interrupted = await labelCli(f, ['--source', 'S05', '--run', f.runId],
    [...noThemeResponses(1), { raw: labelsGolden.cases[0]!.raw_response }, ...noThemeResponses(1)]);
  assert.equal(interrupted.calls.length, 2);
  assert.equal((interrupted.value as { reviewsInserted: number }).reviewsInserted, 3);
  assert.match(JSON.stringify((interrupted.value as { labelling: unknown }).labelling), /synthetic_late_label_failure/);
  const committed = f.db.prepare('SELECT * FROM review_code').all();
  assert.equal(committed.length, 1, 'no early theme from the rejected review may leak');
  assert.equal((committed[0] as { theme_code: string }).theme_code, 'NO_THEME');
  const resumed = await labelCli(f, labelsArgs(f.runId), noThemeResponses(2));
  assert.equal(resumed.calls.length, 2);
  assert.equal(labelledKeys(f.db).length, 3);
  assert.deepEqual(f.db.prepare("SELECT * FROM review_code WHERE review_key=?")
    .all((committed[0] as { review_key: string }).review_key), committed);
});

test('RAWDB-Y Y6: a real S05 CLI load labels after commit and honors no-label, disabled/missing Jev, dry-run and failed calls', async t => {
  for (const mode of ['enabled', 'no-label', 'disabled', 'missing-key', 'dry-run', 'failure'] as const) {
    const f = await rawDbFixture(t);
    const before = f.db.serialize();
    const result = await labelCli(f, ['--source', 'S05', '--run', f.runId,
      ...(mode === 'no-label' ? ['--no-label'] : []), ...(mode === 'dry-run' ? ['--dry-run'] : [])],
    mode === 'enabled' ? noThemeResponses(3) : mode === 'failure' ? [{ status: 503, raw: '{}' }] : [],
    mode === 'disabled' || mode === 'missing-key' ? mode : 'enabled');
    const value = result.value as { reviewsInserted: number; labelling: LabelReceipt | string };
    assert.equal(value.reviewsInserted, 3, mode);
    if (mode === 'dry-run') {
      assert.deepEqual(f.db.serialize(), before);
      assert.equal(result.calls.length, 0);
    } else {
      assert.equal(count(f.db, 'review'), 3, `${mode}: S05 commits independently of labelling`);
      assert.equal(result.calls.length, mode === 'enabled' ? 3 : mode === 'failure' ? 1 : 0, mode);
      assert.equal(count(f.db, 'review_code'), mode === 'enabled' ? 3 : 0, mode);
    }
    if (mode === 'disabled' || mode === 'missing-key') {
      assert.ok(JSON.stringify(value.labelling).includes('SKIPPED_JEV_DISABLED'), mode);
    }
    if (mode === 'enabled') {
      assert.equal((value.labelling as LabelReceipt).labelled, 3);
      assert.equal((value.labelling as LabelReceipt).failed, null);
    }
    if (mode === 'failure') {
      assert.equal((value.labelling as LabelReceipt).failed?.code, 'JEV_THEME_UNAVAILABLE');
      const resumed = await labelCli(f, labelsArgs(f.runId), noThemeResponses(3));
      assert.equal((resumed.value as LabelReceipt).labelled, 3);
    }
  }
});

test('RAWDB-Y Y7: LABELS dry-run counts without fetch or changed DB bytes and run selection excludes other runs', async t => {
  const f = await labelsFixture(t), otherRun = await labelRun(f);
  const selected = ['synthetic-plan-selected-a', 'synthetic-plan-selected-b']
    .map(id => seedLabelReview(f.db, f.runId, id));
  const other = seedLabelReview(f.db, otherRun, 'synthetic-plan-other');
  const physicalBefore = await fs.readFile(f.databasePath), logicalBefore = f.db.serialize();
  for (const [args, eligible] of [[labelsArgs(f.runId), 2], [labelsArgs(), 3]] as const) {
    const result = await labelCli(f, [...args, '--dry-run', '--max-calls', '1']);
    const receipt = result.value as LabelReceipt;
    assert.equal(receipt.eligible, eligible);
    assert.equal(receipt.called, 0);
    assert.equal(receipt.planned, 1);
    assert.equal(receipt.rowsInserted, 0);
    assert.equal(result.calls.length, 0);
    assert.deepEqual(await fs.readFile(f.databasePath), physicalBefore);
    assert.deepEqual(f.db.serialize(), logicalBefore);
  }
  const committed = await labelCli(f, labelsArgs(f.runId), noThemeResponses(2));
  assert.equal(committed.calls.length, 2);
  assert.equal((committed.value as LabelReceipt).eligible, 2);
  assert.deepEqual(labelledKeys(f.db), selected.sort());
  assert.equal(Number(f.db.prepare('SELECT count(*) FROM review_code WHERE review_key=?').pluck().get(other)), 0);
});

test('RAWDB-Y Y8: retrying a completed pass makes zero calls, inserts zero rows and preserves existing provenance', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'synthetic-idempotent-a');
  seedLabelReview(f.db, f.runId, 'synthetic-idempotent-b');
  const first = await labelCli(f, labelsArgs(f.runId), noThemeResponses(2));
  assert.equal(first.calls.length, 2);
  assert.equal((first.value as LabelReceipt).rowsInserted, 2);
  const before = f.db.serialize();
  const retry = await labelCli(f, labelsArgs(f.runId));
  const receipt = retry.value as LabelReceipt;
  assert.deepEqual({ eligible: receipt.eligible, called: receipt.called, labelled: receipt.labelled,
    noTheme: receipt.noTheme, rowsInserted: receipt.rowsInserted, failed: receipt.failed },
  { eligible: 0, called: 0, labelled: 0, noTheme: 0, rowsInserted: 0, failed: null });
  assert.equal(retry.calls.length, 0);
  assert.deepEqual(f.db.serialize(), before);
});

test('RAWDB-Y Y9: labelling preserves populated S05, Google, S07, S02b, S14 and pre-existing codebook rows', async t => {
  const f = await rawDbFixture(t), privacy = s07Privacy();
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  const googleRun = await startRun(f.service, ['INSIGHT']);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'google.suggest', ['synthetic jar', ['synthetic suggestion']], 0);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 1);
  await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: googleRun });
  await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: googleRun });
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: S07_RUN }, privacy);
  await loadKalodataVideosToDbV1(f.db, f.artifacts, { file: S02B_FILE, runId: S02B_RUN }, privacy);
  await loadVideoReadingsToDbV1(f.db, f.artifacts, { file: S14_FILE, runId: S14_RUN }, privacy);
  seedLabelCodebook(f.db);
  const populated = ['raw_capture', 'product', 'review', 'run_review', 'search_suggestion', 'ai_overview_block',
    'ai_overview_reference', 'video', 'video_snapshot', 'video_reading', 'video_segment', 'codebook'];
  // Only new labels and evidence manifests may change. Snapshot every other table,
  // including workflow/analysis state; sorting works for WITHOUT ROWID tables too.
  const preserved = f.db.prepare(`SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'
    AND name NOT IN ('review_code','artifact_manifests') ORDER BY name`).pluck().all() as string[];
  const snapshot = () => Object.fromEntries(preserved.map(name => [name,
    f.db.prepare(`SELECT * FROM "${name}"`).all().map(row => JSON.stringify(row,
      (_key, value: unknown) => typeof value === 'bigint' ? { integer: value.toString() } : value)).sort()]));
  const before = snapshot();
  for (const name of populated) assert.ok(before[name]!.length > 0, `${name}: preservation fixture is populated`);
  const manifests = f.db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all() as Record<string, unknown>[];
  assert.deepEqual(f.db.prepare('SELECT DISTINCT source_code FROM raw_capture ORDER BY source_code').pluck().all(), ['S02b', 'S05', 'S07', 'S14', 'S19b', 'S29']);
  const result = await labelCli(f, labelsArgs(f.runId), noThemeResponses(3));
  assert.equal((result.value as LabelReceipt).rowsInserted, 3, 'preservation must exercise successful labelling');
  assert.deepEqual(snapshot(), before);
  for (const manifest of manifests) {
    assert.deepEqual(f.db.prepare('SELECT * FROM artifact_manifests WHERE sha256=?').get(manifest.sha256), manifest);
  }
});
