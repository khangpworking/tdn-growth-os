import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, mock } from 'node:test';
import Database from 'better-sqlite3';
import { TypesafeJevClient } from '../../src/platform/ai/typesafe-jev-client.js';
import { applyMigrations, defaultMigrationsDirectory, readMigrations } from '../../src/platform/db/migrations.js';
import { autoloadRunToDbV1 } from '../../src/modules/raw-db/autoload.js';
import { LabelsBusyError } from '../../src/modules/raw-db/labels-lock.js';
import { filterReviewsInDbV1 } from '../../src/modules/raw-db/review-filter.js';
import { aAttempt, aResult, aReviews, s06Fixture } from '../fixtures/raw-db-v1-autoload.js';
import { CODES_AT, codesHash, seedCodeReview } from '../fixtures/raw-db-v1-codes.js';
import { labelCli, labelsFixture, labelsGolden, seedLabelCode, seedLabelCodebook, seedLabelReview } from '../fixtures/raw-db-v1-labels.js';
import { exists, holdLabelsLock, lockPath } from '../fixtures/raw-db-v1-y2.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());

const POLICY = '2026-11-04.1';
const MODEL = 'synthetic-jev-review-filter';
const count = (db: Database.Database, table: string) => Number(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());
const assessments = (db: Database.Database) => {
  const rows = db.prepare('SELECT * FROM review_filter_assessment ORDER BY review_key,policy_version').all() as Record<string, unknown>[];
  return rows.map(row => ({ ...row, rating_star: row.rating_star === null ? null : Number(row.rating_star) }));
};
type Wire = { model: string; state: Record<string, string>; questions: Record<string, unknown> };
type Reply = { status: number; body: string };

function payload(loc: Record<string, unknown> = { GIU: 0.80, LOAI: 0.10, RIENG: 0.10 },
  che: Record<string, unknown> = { CO: 0.10, KHONG: 0.90 }) {
  return { model: MODEL, answers: {
    LOC: { type: 'choice', choice: 'GIU', probabilities: loc, confidence: 0.90 },
    CHE: { type: 'choice', choice: 'KHONG', probabilities: che, confidence: 0.90 },
  } };
}
const keepReply = (): Reply => ({ status: 200, body: JSON.stringify(payload()) });
// Choice intentionally disagrees with the probabilities: the policy uses probabilities.
const excludeReply = (): Reply => ({ status: 200, body: JSON.stringify(payload({ GIU: 0.05, LOAI: 0.90, RIENG: 0.05 })) });
const labelReply = (): Reply => ({ status: 200, body: labelsGolden.no_theme_response.replaceAll(labelsGolden.model, MODEL) });

function fakeJev(respond: (wire: Wire, ordinal: number) => Reply = () => keepReply()) {
  const calls: Wire[] = [];
  const client = new TypesafeJevClient({ enabled: true, apiKey: 'synthetic-unused-key', model: MODEL }, async (_url, init) => {
    const wire = JSON.parse(String(init?.body)) as Wire;
    calls.push(wire);
    const reply = respond(wire, calls.length);
    return new Response(reply.body, { status: reply.status, headers: { 'content-type': 'application/json' } });
  });
  return { client, calls };
}

function linkReview(db: Database.Database, runId: string, key: string) {
  db.prepare(`INSERT INTO run_review(run_id,review_key,capture_id,source_position)
    SELECT ?,review_key,capture_id,source_position FROM review WHERE review_key=?`).run(runId, key);
}

// Negative controls (scratch checkout only):
// storage: drop review_filter_assessment_no_update -> R-RF01 storage test;
// pass: remove the current-policy NOT EXISTS guard -> R-RF02 rerun test;
// validation: accept a 1.03 probability sum -> R-RF07 probability table;
// lifecycle: move filtering after labelling -> R-RF08/R-RF09 order and shadow test;
// CLI: ignore --dry-run -> R-RF10 CLI test. Unit controls are listed in its file.

test('R-RF01 migration 0072 preserves all legacy rows and adds nullable filtering without weakening the old ledger', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-filter-migration-'));
  const db = new Database(path.join(root, 'test.sqlite'));
  t.after(async () => { if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); });
  db.pragma('foreign_keys=ON');
  const directory = path.join(root, 'through-0071');
  await fs.mkdir(directory);
  for (const migration of readMigrations().filter(m => m.version <= 71))
    await fs.copyFile(path.join(defaultMigrationsDirectory, migration.name), path.join(directory, migration.name));
  assert.equal(applyMigrations(db, { migrationsDirectory: directory }).currentVersion, 71);
  seedCodeReview(db);
  seedLabelCodebook(db);
  seedLabelCode(db, 'S05:synthetic-codes-a');
  // Legacy SQL preconditions for migration only; these are not workflow receipts.
  const run = 'aaaaaaaa-0000-4000-8000-000000000001', digest = codesHash('{}');
  db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,created_at)
    VALUES (?,2,'application/json','synthetic/legacy','2026-11-03','1.0.0','2026-11-03')`).run(digest);
  db.prepare(`INSERT INTO analysis_research_automation_runs(run_id,workspace_id,revision,status,mode,keyword,period_start,period_end,
    reports,start_request_sha256,actor_id,created_at,updated_at) VALUES (?,'synthetic-workspace',1,'AWAITING_SCOPE','CATEGORY',
    'synthetic jar','2026-01-01','2026-01-30','INSIGHT',?,'synthetic-owner',?,?)`).run(run, digest, CODES_AT, CODES_AT);
  db.prepare(`INSERT INTO raw_db_autoload(run_id,origin,started_at,finished_at,s05,s06,s07,s02b,s14,s19b,s29,labelling)
    VALUES (?,'CLI',?,?,'{}','{}','{}','{}','{}','{}','{}','{}')`).run(run, CODES_AT, CODES_AT);
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'").pluck().all() as string[];
  const before = new Map(tables.map(name => [name, db.prepare(`SELECT * FROM "${name}"`).all()]));
  await fs.copyFile(path.join(defaultMigrationsDirectory, '0072_raw_db_v1_review_filter.sql'), path.join(directory, '0072_raw_db_v1_review_filter.sql'));
  assert.deepEqual(applyMigrations(db, { migrationsDirectory: directory }), { applied: [72], currentVersion: 72 });
  assert.equal(Number(db.pragma('user_version', { simple: true })), 72);
  for (const name of tables) {
    const rows = db.prepare(`SELECT * FROM "${name}"`).all() as Record<string, unknown>[];
    if (name === 'raw_db_autoload') {
      assert.equal(rows[0]!.filtering, null);
      assert.deepEqual(rows.map(({ filtering, ...legacy }) => legacy), before.get(name), name);
    } else assert.deepEqual(rows, before.get(name), name);
  }
  const table = (db.pragma('table_list') as { name: string; strict: number }[]).find(row => row.name === 'review_filter_assessment');
  assert.equal(Number(table?.strict), 1);
  const columns = db.pragma('table_info(review_filter_assessment)') as { name: string; pk: number }[];
  assert.deepEqual(columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name), ['review_key', 'policy_version']);
  const indexes = db.pragma('index_list(review_filter_assessment)') as { name: string }[];
  assert.ok(indexes.some(i => {
    const columns = db.prepare('SELECT name FROM pragma_index_info(?) ORDER BY seqno').pluck().all(i.name);
    return JSON.stringify(columns) === '["policy_version","outcome"]';
  }));
  for (const sql of ['UPDATE raw_db_autoload SET filtering=filtering', 'DELETE FROM raw_db_autoload'])
    assert.throws(() => db.exec(sql), /immutable_raw_db_autoload/);
});

test('R-RF01/R-RF06 storage enforces keys, probability/nullability checks and immutable assessments', async t => {
  const f = await labelsFixture(t), key = seedLabelReview(f.db, f.runId, 'storage');
  const row = { review_key: key, policy_version: POLICY, policy_sha256: 'a'.repeat(64), run_id: f.runId,
    outcome: 'KEEP', reason: 'JEV_KEEP', p_keep: 0.80, p_exclude: 0.10, p_unresolved: 0.10, p_complaint: 0.10,
    rating_star: 3, model: MODEL, text_sha256: codesHash('synthetic'), response_sha256: 'b'.repeat(64), assessed_at: CODES_AT };
  const insert = f.db.prepare(`INSERT INTO review_filter_assessment(${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(k => `@${k}`).join(',')})`);
  insert.run(row);
  const invalid: { name: string; values: Record<string, unknown> }[] = [
    { name: 'duplicate primary key', values: {} },
    { name: 'missing review FK', values: { review_key: 'S05:absent' } },
    { name: 'unknown outcome', values: { outcome: 'CLEAN' } },
    { name: 'unknown reason', values: { reason: 'CLEAN' } },
    { name: 'probability below zero', values: { p_keep: -0.01 } },
    { name: 'probability above one', values: { p_complaint: 1.01 } },
    { name: 'content needs probabilities', values: { p_unresolved: null } },
    { name: 'content needs model', values: { model: null } },
    { name: 'content needs raw response', values: { response_sha256: null } },
    { name: 'content cannot be EMPTY', values: { reason: 'EMPTY' } },
    { name: 'NO_CONTENT cannot carry Jev data', values: { outcome: 'NO_CONTENT', reason: 'EMPTY' } },
    { name: 'NO_CONTENT must be EMPTY', values: { outcome: 'NO_CONTENT', p_keep: null, p_exclude: null,
      p_unresolved: null, p_complaint: null, model: null, response_sha256: null } },
    { name: 'required trace cannot be null', values: { text_sha256: null } },
    { name: 'STRICT numeric storage', values: { p_keep: 'not-a-number' } },
  ];
  for (const [index, c] of invalid.entries()) {
    const input = { ...row, ...(index ? { policy_version: `synthetic-invalid-${index}` } : {}), ...c.values };
    assert.throws(() => insert.run(input), /constraint|datatype|REAL/i, c.name);
  }
  const before = assessments(f.db);
  for (const sql of ['UPDATE review_filter_assessment SET outcome=outcome', 'DELETE FROM review_filter_assessment'])
    assert.throws(() => f.db.exec(sql), /immutable_raw_db_v1_review_filter/);
  assert.deepEqual(assessments(f.db), before);
});

test('R-RF02/R-RF03 a capped pass selects only scoped product reviews and stores unanswered rows without Jev', async t => {
  const f = await labelsFixture(t);
  const content = [
    seedLabelReview(f.db, f.runId, 'scope-a', { rating_star: 5 }),
    seedLabelReview(f.db, f.runId, 'scope-b', { source_code: 'S06', platform: 'tiktok_shop', rating_star: 4 }),
    seedLabelReview(f.db, f.runId, 'scope-c'),
  ];
  const empty = seedLabelReview(f.db, f.runId, 'scope-empty', { text: '\u200b \t', attributes_json: '["Công dụng: ","Đối tượng sử dụng:"]' });
  seedLabelReview(f.db, 'synthetic-outside-run', 'scope-outside');
  seedLabelReview(f.db, f.runId, 'scope-comment', { source_code: 'S07', platform: 'tiktok', kind: 'video_comment',
    product_key: null, video_url: 'https://example.test/synthetic-video' });
  const jev = fakeJev();
  const result = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId, maxCalls: 2 });
  assert.deepEqual(result, { policyVersion: POLICY, eligible: 3, noContent: 1, planned: 2, called: 2, inserted: 3,
    outcomes: { KEEP: 2, EXCLUDE: 0, UNRESOLVED: 0, NO_CONTENT: 1 }, notAssessed: 1, failed: null });
  assert.equal(jev.calls.length, 2);
  const rows = assessments(f.db);
  assert.ok(rows.every(row => row.review_key === empty || content.includes(String(row.review_key))));
  const noContent = rows.find(row => row.review_key === empty)!;
  assert.deepEqual({ reason: noContent.reason, p_keep: noContent.p_keep, p_exclude: noContent.p_exclude,
    p_unresolved: noContent.p_unresolved, p_complaint: noContent.p_complaint, model: noContent.model,
    response_sha256: noContent.response_sha256, text_sha256: noContent.text_sha256 },
  { reason: 'EMPTY', p_keep: null, p_exclude: null, p_unresolved: null, p_complaint: null,
    model: null, response_sha256: null, text_sha256: codesHash('') });
});

test('R-RF02 rerun: a review shared by runs is called once and the same policy retry writes nothing', async t => {
  const f = await labelsFixture(t), key = seedLabelReview(f.db, f.runId, 'shared');
  linkReview(f.db, 'synthetic-second-run', key);
  const jev = fakeJev();
  const first = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, {});
  assert.equal(first.eligible, 1);
  assert.equal(first.called, 1);
  assert.equal(first.inserted, 1);
  const before = f.db.serialize();
  const retry = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, {});
  assert.deepEqual({ eligible: retry.eligible, called: retry.called, inserted: retry.inserted, outcomes: retry.outcomes, failed: retry.failed },
    { eligible: 0, called: 0, inserted: 0, outcomes: { KEEP: 0, EXCLUDE: 0, UNRESOLVED: 0, NO_CONTENT: 0 }, failed: null });
  assert.equal(jev.calls.length, 1);
  assert.deepEqual(f.db.serialize(), before);
});

test('R-RF02 input.policyVersion reassesses a review and preserves the earlier assessment', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'versioned');
  const jev = fakeJev();
  await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId });
  const before = assessments(f.db)[0]!;
  const next = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId, policyVersion: 'synthetic-policy-v2' });
  assert.equal(next.policyVersion, 'synthetic-policy-v2');
  assert.equal(next.called, 1);
  assert.equal(next.inserted, 1);
  assert.equal(jev.calls.length, 2);
  const rows = assessments(f.db);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.policy_version === POLICY), before);
  assert.equal(rows.find(row => row.policy_version === 'synthetic-policy-v2')?.review_key, before.review_key);
});

test('R-RF04/R-RF06 artifact trace binds an EXCLUDE row to exact state, probabilities, model and raw response bytes', async t => {
  const f = await labelsFixture(t);
  const key = seedLabelReview(f.db, f.runId, 'trace', { text: '  Mẫu thử 🧪\r\nCafe\u0301  ',
    attributes_json: '["Vị: dịu","Hộp thử"]', rating_star: 4 });
  const state = 'Sản phẩm: Synthetic product. Lời viết: Mẫu thử 🧪\r\nCafe\u0301. Phần khách điền: Vị: dịu; Hộp thử';
  const raw = ' \n' + excludeReply().body + '\n';
  const jev = fakeJev(() => ({ status: 200, body: raw }));
  const result = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId });
  assert.equal(result.outcomes.EXCLUDE, 1);
  assert.equal(jev.calls.length, 1);
  assert.deepEqual(jev.calls[0]!.state, { LOC: state, CHE: state });
  assert.deepEqual(Object.keys(jev.calls[0]!.questions), ['LOC', 'CHE']);
  const { assessed_at, policy_sha256, ...row } = assessments(f.db)[0]!;
  assert.match(String(assessed_at), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/);
  // The contract pins the policy bytes but does not define their serialization for hashing.
  assert.match(String(policy_sha256), /^[a-f0-9]{64}$/);
  assert.deepEqual(row, { review_key: key, policy_version: POLICY, run_id: f.runId, outcome: 'EXCLUDE', reason: 'JEV_EXCLUDE',
    p_keep: 0.05, p_exclude: 0.90, p_unresolved: 0.05, p_complaint: 0.10, rating_star: 4, model: MODEL,
    text_sha256: codesHash(state), response_sha256: codesHash(raw) });
  assert.deepEqual(await f.artifacts.read(codesHash(raw)), Buffer.from(raw));
});

test('R-RF07 a failed second call stops a three-review pass, preserves the first and leaves two unassessed', async t => {
  const f = await labelsFixture(t);
  const ids = ['failure-a', 'failure-b', 'failure-c'];
  const keys = ids.map(id => seedLabelReview(f.db, f.runId, id));
  const jev = fakeJev((_wire, ordinal) => ordinal === 2 ? { status: 503, body: 'synthetic unavailable' } : keepReply());
  const result = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId });
  assert.equal(jev.calls.length, 2);
  const failedIndex = ids.findIndex(id => jev.calls[1]!.state.LOC!.includes(id));
  assert.notEqual(failedIndex, -1);
  assert.deepEqual(result.failed, { code: 'REVIEW_FILTER_UNAVAILABLE', reviewKey: keys[failedIndex] });
  assert.deepEqual({ eligible: result.eligible, called: result.called, inserted: result.inserted, notAssessed: result.notAssessed },
    { eligible: 3, called: 2, inserted: 1, notAssessed: 2 });
  const rows = assessments(f.db);
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0]!.review_key, keys[failedIndex]);
  assert.equal(rows[0]!.outcome, 'KEEP');
});

test('R-RF07 probability table requires exact choices, finite [0,1] values and the inclusive 0.02 sum tolerance', async t => {
  const cases = [
    { name: 'negative', loc: { GIU: -0.01, LOAI: 0.91, RIENG: 0.10 }, valid: false },
    { name: 'above one', loc: { GIU: 1.01, LOAI: 0, RIENG: 0 }, valid: false },
    { name: 'numeric string', loc: { GIU: '0.80', LOAI: 0.10, RIENG: 0.10 }, valid: false },
    { name: 'missing choice', loc: { GIU: 0.90, LOAI: 0.10 }, valid: false },
    { name: 'extra choice', loc: { GIU: 0.80, LOAI: 0.10, RIENG: 0.10, EXTRA: 0 }, valid: false },
    { name: 'sum 1.03', loc: { GIU: 0.80, LOAI: 0.13, RIENG: 0.10 }, valid: false },
    { name: 'sum 0.97', loc: { GIU: 0.77, LOAI: 0.10, RIENG: 0.10 }, valid: false },
    { name: 'complaint missing choice', che: { CO: 0.10 }, valid: false },
    { name: 'complaint bad sum', che: { CO: 0.10, KHONG: 0.93 }, valid: false },
    { name: 'sum exactly 1.02', loc: { GIU: 0.80, LOAI: 0.12, RIENG: 0.10 }, valid: true },
    { name: 'sum exactly 0.98', loc: { GIU: 0.78, LOAI: 0.10, RIENG: 0.10 }, valid: true },
    { name: 'complaint sum exactly 1.02', che: { CO: 0.10, KHONG: 0.92 }, valid: true },
    { name: 'non-finite JSON number', raw: JSON.stringify(payload()).replace('"GIU":0.8', '"GIU":1e999'), valid: false },
  ];
  for (const c of cases) {
    const f = await labelsFixture(t), key = seedLabelReview(f.db, f.runId, 'invalid');
    const jev = fakeJev(() => ({ status: 200, body: c.raw ?? JSON.stringify(payload(c.loc, c.che)) }));
    const result = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId });
    assert.equal(jev.calls.length, 1, c.name);
    assert.equal(result.inserted, c.valid ? 1 : 0, c.name);
    assert.equal(count(f.db, 'review_filter_assessment'), c.valid ? 1 : 0, c.name);
    assert.equal(result.notAssessed, c.valid ? 0 : 1, c.name);
    assert.deepEqual(result.failed, c.valid ? null : { code: 'REVIEW_FILTER_INVALID', reviewKey: key }, c.name);
  }
});

test('R-RF10 dry run plans at the 1500 ceiling and a smaller requested cap without a lock, calls or writes', async t => {
  const f = await labelsFixture(t);
  // A cardinality boundary for the plan, not a throughput or provider-call test.
  f.db.transaction(() => {
    for (let i = 0; i < 1501; i++) seedLabelReview(f.db, f.runId, `plan-${String(i).padStart(4, '0')}`);
    seedLabelReview(f.db, f.runId, 'plan-empty', { text: null, attributes_json: null });
  })();
  assert.equal(await exists(lockPath(f)), false);
  const before = f.db.serialize();
  for (const maxCalls of [undefined, 2000, 2]) {
    const result = await filterReviewsInDbV1(f.db, null, null, { runId: f.runId, dryRun: true, maxCalls });
    assert.deepEqual({ eligible: result.eligible, noContent: result.noContent, planned: result.planned, called: result.called,
      inserted: result.inserted, outcomes: result.outcomes, failed: result.failed },
    { eligible: 1501, noContent: 1, planned: maxCalls === 2 ? 2 : 1500, called: 0, inserted: 0,
      outcomes: { KEEP: 0, EXCLUDE: 0, UNRESOLVED: 0, NO_CONTENT: 0 }, failed: null });
  }
  assert.deepEqual(f.db.serialize(), before);
  assert.equal(await exists(lockPath(f)), false);
  const release = holdLabelsLock(f);
  try {
    const result = await filterReviewsInDbV1(f.db, null, null, { runId: f.runId, dryRun: true, maxCalls: 1 });
    assert.equal(result.planned, 1, 'planning also works while the pass lock is held');
    assert.deepEqual(f.db.serialize(), before);
  } finally { release(); }
});

test('R-RF10 a busy labels lock rejects the real pass without calling Jev or writing assessments', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'busy');
  const jev = fakeJev(), release = holdLabelsLock(f), before = f.db.serialize();
  try {
    await assert.rejects(filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId }), LabelsBusyError);
    assert.deepEqual(jev.calls, []);
    assert.deepEqual(f.db.serialize(), before);
  } finally { release(); }
});

test('R-RF10 a real pass requires both Jev and artifact storage', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'disabled');
  const jev = fakeJev(), before = f.db.serialize();
  for (const [artifacts, client] of [[f.artifacts, null], [null, jev.client], [null, null]] as const)
    await assert.rejects(filterReviewsInDbV1(f.db, artifacts, client, { runId: f.runId }), /RAW_DB_FILTER_JEV_DISABLED/);
  assert.deepEqual(jev.calls, []);
  assert.deepEqual(f.db.serialize(), before);
});

test('R-RF08/R-RF09 autoload order and shadow: loaded reviews are filtered before labelling, EXCLUDE stays labelled and counted', async t => {
  const f = await s06Fixture(t, aReviews([4, 3]));
  let beforeFilter: unknown;
  const jev = fakeJev(wire => {
    if (Object.hasOwn(wire.questions, 'LOC')) {
      const committed = new Database(f.databasePath, { readonly: true, fileMustExist: true });
      try { assert.equal(count(committed, 'review'), 2, 'sources committed before filtering'); }
      finally { committed.close(); }
      assert.equal(count(f.db, 'review_code'), 0, 'labelling has not started');
      beforeFilter ??= f.db.prepare('SELECT * FROM review_star_sentiment ORDER BY review_key').all();
      return excludeReply();
    }
    assert.equal(count(f.db, 'review_filter_assessment'), 2, 'filter pass finished before labels');
    return labelReply();
  });
  // The real autoloader uses safe integers: the 3n rating must still get its guard.
  f.db.defaultSafeIntegers(true);
  const result = await autoloadRunToDbV1(f.db, f.artifacts, f.runId,
    { origin: 'APP', privacy: undefined, jev: jev.client, captureRoot: f.capture.captureRoot, reviewFilter: true });
  assert.equal(result.sources.S06.status, 'LOADED');
  assert.equal(result.filtering.status, 'FILTERED');
  if (result.filtering.status !== 'FILTERED') assert.fail('expected filtering receipt');
  assert.deepEqual(result.filtering.result.outcomes, { KEEP: 0, EXCLUDE: 1, UNRESOLVED: 1, NO_CONTENT: 0 });
  assert.equal(result.labelling.status, 'LABELLED');
  assert.deepEqual(jev.calls.map(wire => Object.hasOwn(wire.questions, 'LOC') ? 'FILTER' : 'LABELS'), ['FILTER', 'FILTER', 'LABELS', 'LABELS']);
  const excluded = f.db.prepare("SELECT review_key FROM review_filter_assessment WHERE outcome='EXCLUDE'").pluck().get();
  assert.equal(typeof excluded, 'string');
  assert.ok(f.db.prepare('SELECT 1 FROM review_code WHERE review_key=?').get(excluded));
  assert.equal(count(f.db, 'review_code'), 2);
  assert.deepEqual(f.db.prepare('SELECT * FROM review_star_sentiment ORDER BY review_key').all(), beforeFilter);
  assert.deepEqual(aResult(aAttempt(f.db), 'filtering'), result.filtering);
});

test('R-RF08 autoload isolates filter failure and still labels the committed source reviews', async t => {
  const f = await s06Fixture(t, aReviews([5, 4]));
  const jev = fakeJev(wire => Object.hasOwn(wire.questions, 'LOC')
    ? { status: 503, body: 'synthetic unavailable' } : labelReply());
  const result = await autoloadRunToDbV1(f.db, f.artifacts, f.runId,
    { origin: 'APP', privacy: undefined, jev: jev.client, captureRoot: f.capture.captureRoot, reviewFilter: true });
  assert.equal(result.sources.S06.status, 'LOADED');
  assert.equal(result.filtering.status, 'FAILED');
  assert.equal(result.labelling.status, 'LABELLED');
  assert.equal(jev.calls.filter(w => Object.hasOwn(w.questions, 'LOC')).length, 1);
  assert.equal(jev.calls.filter(w => !Object.hasOwn(w.questions, 'LOC')).length, 2);
  assert.equal(count(f.db, 'review'), 2);
  assert.equal(count(f.db, 'review_code'), 2);
  assert.equal(count(f.db, 'review_filter_assessment'), 0);
  assert.equal((aResult(aAttempt(f.db), 'filtering') as { status: string }).status, 'FAILED');
});

test('R-RF08 flag off skips filtering and keeps the legacy labels', async t => {
  const f = await s06Fixture(t, aReviews([5]));
  const jev = fakeJev(() => labelReply());
  const result = await autoloadRunToDbV1(f.db, f.artifacts, f.runId,
    { origin: 'APP', privacy: undefined, jev: jev.client, captureRoot: f.capture.captureRoot });
  assert.deepEqual(result.filtering, { status: 'SKIPPED_FLAG_OFF' });
  assert.equal(jev.calls.length, 1);
  assert.ok(jev.calls.every(w => !Object.hasOwn(w.questions, 'LOC')));
  assert.equal(count(f.db, 'review_filter_assessment'), 0);
  assert.deepEqual(f.db.prepare('SELECT theme_code,origin FROM review_code').all(), [{ theme_code: 'NO_THEME', origin: 'APP_JEV' }]);
  assert.deepEqual(aResult(aAttempt(f.db), 'filtering'), { status: 'SKIPPED_FLAG_OFF' });
});

test('R-RF08 autoload dry run with the flag on returns PLANNED without calls or an attempt row', async t => {
  const f = await s06Fixture(t, aReviews([5]));
  const jev = fakeJev(), before = f.db.serialize();
  f.db.exec('BEGIN');
  try {
    const result = await autoloadRunToDbV1(f.db, f.artifacts, f.runId,
      { origin: 'CLI', privacy: undefined, jev: jev.client, captureRoot: f.capture.captureRoot, reviewFilter: true, dryRun: true });
    assert.equal(result.filtering.status, 'PLANNED');
    if (result.filtering.status !== 'PLANNED') assert.fail('expected plan receipt');
    assert.equal(result.filtering.result.planned, 1);
    assert.equal(result.filtering.result.called, 0);
    assert.equal(result.labelling.status, 'PLANNED');
    assert.equal(result.attemptId, null);
    assert.equal(count(f.db, 'review_filter_assessment'), 0);
    assert.equal(count(f.db, 'raw_db_autoload'), 0);
    assert.deepEqual(jev.calls, []);
  } finally { f.db.exec('ROLLBACK'); }
  assert.deepEqual(f.db.serialize(), before);
});

test('R-RF10 CLI FILTER --run --max-calls --dry-run reports a plan and changes no database bytes', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'cli-content-a');
  seedLabelReview(f.db, f.runId, 'cli-content-b');
  seedLabelReview(f.db, f.runId, 'cli-empty', { text: '', attributes_json: null });
  seedLabelReview(f.db, 'synthetic-outside-run', 'cli-outside');
  const before = f.db.serialize();
  const result = await labelCli(f, ['--source', 'FILTER', '--run', f.runId, '--max-calls', '1', '--dry-run'], [], 'disabled');
  const receipt = result.value as { eligible: number; noContent: number; planned: number; called: number; inserted: number };
  assert.deepEqual({ eligible: receipt.eligible, noContent: receipt.noContent, planned: receipt.planned, called: receipt.called, inserted: receipt.inserted },
    { eligible: 2, noContent: 1, planned: 1, called: 0, inserted: 0 });
  assert.deepEqual(result.calls, []);
  assert.deepEqual(f.db.serialize(), before);
});
