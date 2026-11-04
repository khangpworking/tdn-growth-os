import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { afterEach, beforeEach, mock } from 'node:test';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { TypesafeJevClient } from '../../src/platform/ai/typesafe-jev-client.js';
import { applyMigrations, defaultMigrationsDirectory, readMigrations } from '../../src/platform/db/migrations.js';
import { loadReviewCodesToDbV1 } from '../../src/modules/raw-db/review-code-loader.js';
import { labelReviewsInDbV1 } from '../../src/modules/raw-db/review-labeller.js';
import { filterReviewsInDbV1 } from '../../src/modules/raw-db/review-filter.js';
import { CODES_AT, codesHash, seedCodeReview, writeCodeInputs } from '../fixtures/raw-db-v1-codes.js';
import { labelCli, labelsFixture, seedLabelReview, type LabelReceipt } from '../fixtures/raw-db-v1-labels.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());

const MODEL = 'synthetic-review-labels-10';
const POLICY = '2026-11-04.2';
const bookFile = fileURLToPath(new URL('../fixtures/review-labels-10-codebook.json', import.meta.url));
const book = JSON.parse(readFileSync(bookFile, 'utf8')) as {
  guide: string; core: { code: string; name: string; include: string; exclude: string; options?: Option[] }[]; options: Option[];
};
type Option = { key: string; meaning: string };
type Wire = { model: string; state: Record<string, string>; questions: Record<string, {
  type: string; instructions: string; criteria: Record<string, string>;
}> };
type Probabilities = Record<string, number>;

// Same TypesafeJevClient transport fixture as raw-db-v1-review-filter.test.ts.
// The only response path is synthetic; the parent fetch guard catches accidental fallback.
function fakeJev(respond: (wire: Wire, ordinal: number) => string) {
  const calls: Wire[] = [];
  const client = new TypesafeJevClient({ enabled: true, apiKey: 'synthetic-unused-key', model: MODEL }, async (_url, init) => {
    const wire = JSON.parse(String(init?.body)) as Wire;
    calls.push(wire);
    return new Response(respond(wire, calls.length), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  return { client, calls };
}

function labelPayload(overrides: Record<string, Probabilities> = {}) {
  return { model: MODEL, answers: Object.fromEntries(book.core.map(theme => {
    const values = overrides[theme.code] ?? { KHONG_NHAC: 1 };
    return [theme.code, { type: 'choice', choice: 'KHONG_NHAC', confidence: 0.123,
      probabilities: Object.fromEntries((theme.options ?? book.options).map(option => [option.key, values[option.key] ?? 0])) }];
  })) };
}

const labelReply = (overrides: Record<string, Probabilities> = {}) => JSON.stringify(labelPayload(overrides));
const runLabels = (f: Awaited<ReturnType<typeof labelsFixture>>, client: TypesafeJevClient) =>
  labelReviewsInDbV1(f.db, f.artifacts, client, { runId: f.runId, codebookFile: bookFile,
    captureRoot: path.join(f.root, 'metric-captures') });

function filterReply(che: Probabilities = { CO: 0.1, KHONG: 0.9, RIENG: 0 }) {
  return JSON.stringify({ model: MODEL, answers: {
    LOC: { type: 'choice', choice: 'GIU', confidence: 0.9, probabilities: { GIU: 0.1, LOAI: 0.8, RIENG: 0.1 } },
    CHE: { type: 'choice', choice: 'KHONG', confidence: 0.9, probabilities: che },
  } });
}

test('R-RV01: the real CLI asks the same ten ordered questions across keywords and applied categories', async t => {
  for (const [keyword, category] of [['canxi', 'Thực phẩm'], ['serum', 'Mỹ phẩm']]) {
    const f = await labelsFixture(t, keyword);
    const directory = path.join(f.root, 'metric-captures', f.runId);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, 'scope.json'), JSON.stringify({
      contractVersion: 'autorun-scope-record-v2', runId: f.runId, keyword1: keyword,
      capture2: { outcome: 'OK', keywords: [keyword], category },
    }));
    seedLabelReview(f.db, f.runId, 'ten-questions');
    const result = await labelCli(f, ['--source', 'LABELS', '--run', f.runId], [{ raw: labelReply() }], 'enabled', MODEL);
    assert.equal((result.value as LabelReceipt).failed, null);
    assert.equal(result.calls.length, 1);
    assert.deepEqual(Object.keys((result.calls[0]!.body as Wire).questions), book.core.map(theme => theme.code));
    assert.equal(Object.keys((result.calls[0]!.body as Wire).questions).length, 10);
    assert.deepEqual(f.db.prepare('SELECT block_key FROM review_code').all(), [{ block_key: null }]);
  }
});

test('R-RV02/R-RV03: label prompts preserve the exact state, guide, per-theme meanings and old coding-text hash', async t => {
  const f = await labelsFixture(t);
  const key = seedLabelReview(f.db, f.runId, 'prompt', { text: ' Tốt ', attributes_json: '["Công dụng: ok","Mùi: nhẹ"]', rating_star: 1 });
  const jev = fakeJev(() => labelReply());
  assert.equal((await runLabels(f, jev.client)).failed, null);
  assert.equal(jev.calls.length, 1);
  const state = 'Sản phẩm đang được đánh giá: Synthetic product\nLời viết: Tốt\nCác mục khách điền, gồm tên mục và câu trả lời: Công dụng: ok; Mùi: nhẹ';
  assert.deepEqual(jev.calls[0]!.state, Object.fromEntries(book.core.map(theme => [theme.code, state])));
  assert.deepEqual(jev.calls[0]!.questions, Object.fromEntries(book.core.map(theme => [theme.code, {
    type: 'choice',
    instructions: `${book.guide}\n\n${theme.code} ${theme.name}. Tính khi: ${theme.include}. Không tính khi: ${theme.exclude}.\nNội dung có nhắc đến chủ đề này không, và thuộc lựa chọn nào?`,
    criteria: Object.fromEntries((theme.options ?? book.options).map(option => [option.key, option.meaning])),
  }])));
  assert.equal(f.db.prepare('SELECT text_sha256 FROM review_code WHERE review_key=?').pluck().get(key),
    codesHash(' Tốt   Công dụng: ok  Mùi: nhẹ'));
});

test('R-RV02: missing label prompt fields use the literal fallback strings', async t => {
  const cases = [
    { name: 'attribute-only text', text: ' \t ', attributes_json: '["Mùi: nhẹ"]',
      state: 'Sản phẩm đang được đánh giá: không rõ\nLời viết: (trống)\nCác mục khách điền, gồm tên mục và câu trả lời: Mùi: nhẹ' },
    { name: 'no attributes', text: ' Tốt ', attributes_json: null,
      state: 'Sản phẩm đang được đánh giá: không rõ\nLời viết: Tốt\nCác mục khách điền, gồm tên mục và câu trả lời: (trống)' },
  ];
  for (const c of cases) await t.test(c.name, async t => {
    const f = await labelsFixture(t);
    // Product and review rows are append-only; create the unnamed product as input.
    seedCodeReview(f.db);
    f.db.prepare(`INSERT INTO product(product_key,platform,item_id,product_name,first_capture_id)
      VALUES ('shopee:synthetic-unnamed','shopee','synthetic-unnamed','','synthetic-codes-capture')`).run();
    seedLabelReview(f.db, f.runId, 'fallback', { product_key: 'shopee:synthetic-unnamed', text: c.text, attributes_json: c.attributes_json });
    const jev = fakeJev(() => labelReply());
    assert.equal((await runLabels(f, jev.client)).failed, null);
    assert.equal(jev.calls.length, 1);
    assert.deepEqual(jev.calls[0]!.state, Object.fromEntries(book.core.map(theme => [theme.code, c.state])));
  });
});

test('R-RV03: wrong option keys for a theme reject the entire review with JEV_THEME_INVALID', async t => {
  const cases = [
    { name: 'global six options on T-PHANUNG', code: 'T-PHANUNG', probabilities: { KHEN: 0, CHE: 0, HAI: 0, KE: 0, CHUA_DANHGIA: 0, KHONG_NHAC: 1 } },
    { name: 'reaction options on a global theme', code: 'T-GIA', probabilities: { CO: 0, PHU_DINH: 0, HAI: 0, KHONG_NHAC: 1 } },
    { name: 'missing own option even at zero', code: 'T-PHANUNG', probabilities: { CO: 0, HAI: 0, KHONG_NHAC: 1 } },
    { name: 'extra global option even at zero', code: 'T-PHANUNG', probabilities: { CO: 0, PHU_DINH: 0, HAI: 0, KHONG_NHAC: 1, KHEN: 0 } },
  ];
  for (const c of cases) await t.test(c.name, async t => {
    const f = await labelsFixture(t), key = seedLabelReview(f.db, f.runId, 'bad-option-keys');
    const payload = labelPayload({ 'T-CONGDUNG': { HAI: 0.8, KHONG_NHAC: 0.2 } });
    payload.answers[c.code]!.probabilities = c.probabilities;
    const jev = fakeJev(() => JSON.stringify(payload));
    const result = await runLabels(f, jev.client);
    assert.equal(jev.calls.length, 1);
    assert.deepEqual(result.failed, { code: 'JEV_THEME_INVALID', reviewKey: key });
    assert.equal(result.rowsInserted, 0);
    assert.deepEqual(f.db.prepare('SELECT * FROM review_code').all(), [], 'a valid earlier theme cannot leak a row');
  });
});

test('R-RV04: HAI and per-theme choices persist their own polarity, confidence and null block', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'choices');
  const jev = fakeJev(() => labelReply({
    'T-CONGDUNG': { HAI: 0.8, KHONG_NHAC: 0.2 },
    'T-GIA': { KHEN: 0.3, CHE: 0.25, KE: 0.2, KHONG_NHAC: 0.25 },
    'T-NHUCAU': { QUA_TANG: 0.75, KHONG_NHAC: 0.25 },
    'T-PHANUNG': { PHU_DINH: 0.85, KHONG_NHAC: 0.15 },
  }));
  const result = await runLabels(f, jev.client);
  assert.equal(result.failed, null);
  assert.equal(result.rowsInserted, 4);
  assert.deepEqual(f.db.prepare(`SELECT theme_code,confidence,polarity,status,choice,block_key
    FROM review_code ORDER BY theme_code`).all(), [
    { theme_code: 'T-CONGDUNG', confidence: 0.8, polarity: 'khong_ro_huong', status: 'kept', choice: 'HAI', block_key: null },
    { theme_code: 'T-GIA', confidence: 0.75, polarity: 'khong_ro_huong', status: 'kept', choice: null, block_key: null },
    { theme_code: 'T-NHUCAU', confidence: 0.75, polarity: 'ke', status: 'kept', choice: 'QUA_TANG', block_key: null },
    { theme_code: 'T-PHANUNG', confidence: 0.85, polarity: 'khen', status: 'kept', choice: 'PHU_DINH', block_key: null },
  ]);
});

test('R-RV05: only waitTheme gets the unclear wait row and that row suppresses NO_THEME', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'wait');
  const jev = fakeJev(() => labelReply({
    'T-CONGDUNG': { CHUA_DANHGIA: 0.9, KHONG_NHAC: 0.1 },
    'T-GIA': { CHUA_DANHGIA: 0.92, KHONG_NHAC: 0.05, KHEN: 0.03 },
  }));
  const result = await runLabels(f, jev.client);
  assert.equal(result.failed, null);
  assert.equal(result.rowsInserted, 1);
  assert.equal(result.noTheme, 0);
  assert.deepEqual(f.db.prepare('SELECT theme_code,status,polarity,choice,confidence FROM review_code').all(), [
    { theme_code: 'T-CONGDUNG', status: 'unclear', polarity: 'khong_ro_huong', choice: 'CHUA_DANHGIA', confidence: 0.9 },
  ]);
});

test('R-RV05: below direction no wait row is written and the NO_THEME sentinel has null choice', async t => {
  const f = await labelsFixture(t);
  seedLabelReview(f.db, f.runId, 'below-wait');
  const jev = fakeJev(() => labelReply({
    'T-CONGDUNG': { CHUA_DANHGIA: 0.49, KHONG_NHAC: 0.48, KHEN: 0.03 },
  }));
  const result = await runLabels(f, jev.client);
  assert.equal(result.failed, null);
  assert.equal(result.noTheme, 1);
  assert.deepEqual(f.db.prepare('SELECT theme_code,choice FROM review_code').all(), [{ theme_code: 'NO_THEME', choice: null }]);
});

test('R-RV06: punctuation-only text bypasses Jev while emoji reaches it', async t => {
  const f = await labelsFixture(t);
  const empty = seedLabelReview(f.db, f.runId, 'punctuation', { text: '.', attributes_json: null, rating_star: 5 });
  const emoji = seedLabelReview(f.db, f.runId, 'emoji', { text: '👍', attributes_json: null, rating_star: 5 });
  const jev = fakeJev(() => filterReply());
  const result = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId });
  assert.equal(result.failed, null);
  assert.equal(result.called, 1);
  assert.equal(result.noContent, 1);
  assert.equal(jev.calls.length, 1);
  const state = 'Sản phẩm đang được đánh giá: Synthetic product\nLời viết: 👍\nCác mục khách điền, gồm tên mục và câu trả lời: (trống)';
  assert.deepEqual(jev.calls[0]!.state, { LOC: state, CHE: state });
  assert.deepEqual(f.db.prepare(`SELECT review_key,outcome,reason FROM review_filter_assessment
    WHERE policy_version=? ORDER BY review_key`).all(POLICY), [
    { review_key: emoji, outcome: 'EXCLUDE', reason: 'JEV_EXCLUDE' },
    { review_key: empty, outcome: 'NO_CONTENT', reason: 'EMPTY' },
  ]);
});

test('R-RV06: CHE.RIENG participates in the complaint guard and the sum is clamped for storage', async t => {
  const cases = [
    { name: 'owner guard scenario', che: { CO: 0.30, RIENG: 0.25, KHONG: 0.45 }, p: 0.55, outcome: 'UNRESOLVED', reason: 'GUARD_COMPLAINT' },
    { name: 'negative control below guard', che: { CO: 0.30, RIENG: 0.19, KHONG: 0.51 }, p: 0.49, outcome: 'EXCLUDE', reason: 'JEV_EXCLUDE' },
    { name: 'accepted tolerance sum above one', che: { CO: 0.60, RIENG: 0.41, KHONG: 0 }, p: 1, outcome: 'UNRESOLVED', reason: 'GUARD_COMPLAINT' },
  ];
  for (const c of cases) await t.test(c.name, async t => {
    const f = await labelsFixture(t);
    seedLabelReview(f.db, f.runId, 'complaint', { text: ' Tốt ', attributes_json: '["Công dụng: ok","Mùi: nhẹ"]', rating_star: 5 });
    const jev = fakeJev(() => filterReply(c.che));
    const result = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId });
    assert.equal(result.failed, null);
    assert.equal(result.inserted, 1);
    const state = 'Sản phẩm đang được đánh giá: Synthetic product\nLời viết: Tốt\nCác mục khách điền, gồm tên mục và câu trả lời: Công dụng: ok; Mùi: nhẹ';
    assert.deepEqual(f.db.prepare(`SELECT policy_version,p_complaint,outcome,reason,text_sha256
      FROM review_filter_assessment`).all(), [{ policy_version: POLICY, p_complaint: c.p,
      outcome: c.outcome, reason: c.reason, text_sha256: codesHash(state) }]);
  });
});

test('R-RV06: the new default policy appends an assessment without touching the old-policy row', async t => {
  const f = await labelsFixture(t);
  const key = seedLabelReview(f.db, f.runId, 'old-policy', { rating_star: 5 });
  // Historical ledger input, not a fabricated execution receipt.
  f.db.prepare(`INSERT INTO review_filter_assessment(review_key,policy_version,policy_sha256,run_id,outcome,reason,
    p_keep,p_exclude,p_unresolved,p_complaint,rating_star,model,text_sha256,response_sha256,assessed_at)
    VALUES (?,'2026-11-04.1',?,?,'EXCLUDE','JEV_EXCLUDE',0.1,0.8,0.1,0.1,5,?,?,?,?)`)
    .run(key, codesHash('synthetic-old-policy'), f.runId, MODEL, codesHash('synthetic-old-state'), codesHash('synthetic-old-response'), CODES_AT);
  const before = f.db.prepare('SELECT * FROM review_filter_assessment').get();
  const jev = fakeJev(() => filterReply({ CO: 0.3, RIENG: 0.25, KHONG: 0.45 }));
  const result = await filterReviewsInDbV1(f.db, f.artifacts, jev.client, { runId: f.runId });
  assert.equal(result.failed, null);
  assert.equal(result.policyVersion, POLICY);
  assert.equal(result.called, 1);
  assert.equal(result.inserted, 1);
  assert.equal(jev.calls.length, 1);
  assert.deepEqual(f.db.prepare("SELECT * FROM review_filter_assessment WHERE policy_version='2026-11-04.1'").get(), before);
  assert.deepEqual(f.db.prepare('SELECT outcome,reason FROM review_filter_assessment WHERE policy_version=?').get(POLICY),
    { outcome: 'UNRESOLVED', reason: 'GUARD_COMPLAINT' });
});

test('R-RV07: migration 0073 keeps legacy imported and APP_JEV rows, adds nullable choice and preserves both immutability triggers', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-labels-10-migration-'));
  const db = new Database(path.join(root, 'test.sqlite'));
  t.after(async () => { if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); });
  db.pragma('foreign_keys=ON');
  const directory = path.join(root, 'through-0072');
  await fs.mkdir(directory);
  for (const migration of readMigrations().filter(m => m.version <= 72))
    await fs.copyFile(path.join(defaultMigrationsDirectory, migration.name), path.join(directory, migration.name));
  assert.equal(applyMigrations(db, { migrationsDirectory: directory }).currentVersion, 72);
  seedCodeReview(db);
  const inputs = await writeCodeInputs(root);
  await loadReviewCodesToDbV1(db, inputs.input);
  const imported = db.prepare('SELECT * FROM review_code').get() as Record<string, unknown>;
  const appRow = { ...imported, theme_code: 'T-VI', origin: 'APP_JEV' };
  db.prepare(`INSERT INTO review_code(${Object.keys(appRow).join(',')}) VALUES (${Object.keys(appRow).map(() => '?').join(',')})`)
    .run(...Object.values(appRow));
  const before = db.prepare('SELECT * FROM review_code ORDER BY theme_code').all();
  const booksBefore = db.prepare('SELECT * FROM codebook').all();
  const migration = '0073_raw_db_v1_review_code_choice.sql';
  await fs.copyFile(path.join(defaultMigrationsDirectory, migration), path.join(directory, migration));
  assert.deepEqual(applyMigrations(db, { migrationsDirectory: directory }), { applied: [73], currentVersion: 73 });
  assert.equal(Number(db.pragma('user_version', { simple: true })), 73);
  assert.equal(db.prepare('SELECT name FROM schema_migrations WHERE version=73').pluck().get(), migration);
  const after = db.prepare('SELECT * FROM review_code ORDER BY theme_code').all() as Record<string, unknown>[];
  assert.deepEqual(after.map(({ choice, ...legacy }) => { assert.equal(choice, null); return legacy; }), before);
  assert.deepEqual(db.prepare('SELECT * FROM codebook').all(), booksBefore);
  assert.deepEqual(db.prepare("SELECT type,\"notnull\" FROM pragma_table_info('review_code') WHERE name='choice'").get(),
    { type: 'TEXT', notnull: 0 });
  for (const origin of ['MCP_IMPORT', 'APP_JEV']) {
    assert.throws(() => db.prepare("UPDATE review_code SET choice='KHEN' WHERE origin=?").run(origin), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    assert.throws(() => db.prepare('DELETE FROM review_code WHERE origin=?').run(origin), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  }
  assert.deepEqual(db.prepare('SELECT * FROM review_code ORDER BY theme_code').all(), after);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
});
