/**
 * review-insights-v1: Jev labels read from a readonly synthetic SQLite database,
 * ten codebook themes, bounded comments and per-link buckets. Synthetic M3 evidence;
 * no collector, provider, database write or network is used.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { reviewInsightsView } from '../../scripts/module-review-data.js';
import { DEFAULT_CODEBOOK_FILE, codingText, parseLabelCodebook } from '../../src/modules/raw-db/review-labeller.js';
import { LINKS, addLegacySource, createModuleRun, moduleRow, sha256, type NativeRow } from '../fixtures/shopee-module-review-data.js';

const BOOK = parseLabelCodebook(await fs.readFile(DEFAULT_CODEBOOK_FILE, 'utf8'));

type Polarity = 'khen' | 'che' | 'ke' | 'khong_ro_huong';
interface TagSeed { code: string; polarity: Polarity; status: 'kept' | 'unclear'; choice: string | null; stale?: boolean }
interface LabelSeed { row: NativeRow; productName: string; tags: TagSeed[] }

async function fixture(t: TestContext): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-insights-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  return base;
}

function useDatabase(t: TestContext, file: string | null): void {
  const before = process.env.TDN_WORKSPACE_DB;
  if (file === null) delete process.env.TDN_WORKSPACE_DB;
  else process.env.TDN_WORKSPACE_DB = file;
  t.after(() => {
    if (before === undefined) delete process.env.TDN_WORKSPACE_DB;
    else process.env.TDN_WORKSPACE_DB = before;
  });
}

function createInsightDatabase(file: string, seeds: readonly LabelSeed[]): void {
  const db = new Database(file);
  db.exec(`
    CREATE TABLE product (product_key TEXT PRIMARY KEY, product_name TEXT);
    CREATE TABLE review (review_key TEXT PRIMARY KEY, source_code TEXT, external_id TEXT, kind TEXT,
      product_key TEXT, text TEXT, attributes_json TEXT);
    CREATE TABLE review_code (review_key TEXT, codebook_version TEXT, theme_code TEXT, polarity TEXT,
      status TEXT, choice TEXT, text_sha256 TEXT, origin TEXT);
  `);
  const product = db.prepare('INSERT OR IGNORE INTO product(product_key, product_name) VALUES (?, ?)');
  const review = db.prepare(`INSERT INTO review(review_key, source_code, external_id, kind, product_key, text, attributes_json)
    VALUES (?, 'S05', ?, 'product_review', ?, ?, ?)`);
  const code = db.prepare(`INSERT INTO review_code(review_key, codebook_version, theme_code, polarity, status, choice,
    text_sha256, origin) VALUES (?, ?, ?, ?, ?, ?, ?, 'APP_JEV')`);
  for (const seed of seeds) {
    const reviewId = seed.row.reviewId!;
    const reviewKey = `key-${reviewId}`;
    const productKey = `product-${seed.row.shopId}-${seed.row.itemId}`;
    const attributesJson = seed.row.attributes.length ? JSON.stringify(seed.row.attributes) : null;
    product.run(productKey, seed.productName);
    review.run(reviewKey, reviewId, productKey, seed.row.comment, attributesJson);
    const hash = sha256(codingText(seed.row.comment, attributesJson));
    for (const tag of seed.tags)
      code.run(reviewKey, BOOK.version, tag.code, tag.polarity, tag.status, tag.choice,
        tag.stale ? '0'.repeat(64) : hash);
  }
  db.close();
}

function labelRow(row: NativeRow, productName: string, tags: TagSeed[]): LabelSeed {
  return { row, productName, tags };
}

function themeOf(bucket: any, code: string): any {
  const theme = bucket.themes.find((item: any) => item.code === code);
  assert.ok(theme, `theme ${code} must be present`);
  return theme;
}

test('insights aggregate ten themes, polarities, comments and per-link buckets', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-insights' });
  const [a, b] = run.links;
  const a1 = moduleRow(a!, 'review-a1', { comment: 'Kem thấm nhanh', ratingStar: 5 });
  const a2 = moduleRow(a!, 'review-a2', { comment: 'Mùi hơi nồng', ratingStar: 2 });
  const b1 = moduleRow(b!, 'review-b1', { comment: 'Hộp đẹp, dùng tiện', ratingStar: 4 });
  await addLegacySource(run, { rowsByLink: [[a1, a2], [b1]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [
    labelRow(a1, 'Kem A', [
      { code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'CO_HIEUQUA' },
      { code: 'T-GIA', polarity: 'che', status: 'kept', choice: 'DAT' },
    ]),
    labelRow(a2, 'Kem A', [
      { code: 'T-TRAINGHIEM', polarity: 'khong_ro_huong', status: 'unclear', choice: null },
    ]),
    labelRow(b1, 'Kem B', [
      { code: 'T-THIETKE', polarity: 'khen', status: 'kept', choice: 'DEP' },
      { code: 'T-NHUCAU', polarity: 'ke', status: 'kept', choice: 'HANG_NGAY' },
    ]),
  ]);
  useDatabase(t, database);
  const databaseBytes = await fs.readFile(database);

  const view = await reviewInsightsView(run.runDir) as any;
  assert.equal(view.format, 'review-insights-v1');
  assert.equal(view.runId, 'run-insights');
  assert.equal(view.codebookVersion, '2026-11-04.1');
  assert.equal(view.sources.length, 1);
  const source = view.sources[0];
  assert.deepEqual([source.kind, source.status, source.completedAt], ['legacy', 'SUCCEEDED', '2026-11-10T00:05:00.000Z']);
  assert.deepEqual(source.all.themes.map((theme: any) => theme.code), BOOK.core.map(theme => theme.code));
  assert.equal(source.all.themes.length, 10);

  const all = source.all;
  assert.deepEqual(all.comments.map((comment: any) => comment.id), ['review-a1', 'review-a2', 'review-b1']);
  const first = all.comments[0];
  assert.deepEqual([first.text, first.rating, first.date, first.productName, first.url],
    ['Kem thấm nhanh', 5, '2026-11-03T03:04:00+07:00', 'Kem A', a!.url]);
  assert.deepEqual(first.tags, [
    { code: 'T-CONGDUNG', name: 'Kết quả sau khi dùng', polarity: 'khen', status: 'kept', choice: 'CO_HIEUQUA' },
    { code: 'T-GIA', name: 'Giá, ưu đãi, quà kèm', polarity: 'che', status: 'kept', choice: 'DAT' },
  ]);

  assert.deepEqual(themeOf(all, 'T-CONGDUNG'), { code: 'T-CONGDUNG', name: 'Kết quả sau khi dùng', count: 1,
    unclearCount: 0, share: 1 / 3, polarityCounts: { khen: 1, che: 0, ke: 0, khong_ro_huong: 0 },
    comments: [first] });
  assert.equal(themeOf(all, 'T-GIA').polarityCounts.che, 1);
  assert.equal(themeOf(all, 'T-THIETKE').polarityCounts.khen, 1);
  assert.equal(themeOf(all, 'T-NHUCAU').polarityCounts.ke, 1);
  const unclear = themeOf(all, 'T-TRAINGHIEM');
  assert.equal(unclear.polarityCounts.khong_ro_huong, 1);
  assert.equal(unclear.unclearCount, 1);
  for (const theme of all.themes)
    if (!['T-CONGDUNG', 'T-GIA', 'T-THIETKE', 'T-NHUCAU', 'T-TRAINGHIEM'].includes(theme.code))
      assert.deepEqual([theme.count, theme.share, theme.comments.length], [0, 0, 0], theme.code);

  assert.equal(all.summary.status, 'READY');
  assert.equal(all.summary.model, 'jev-derived-v1');
  assert.equal(all.summary.generatedAt, '2026-11-10T00:05:00.000Z');
  assert.ok(all.summary.text.includes('Đã gắn nhãn Jev cho 3 trong 3 bình luận'), all.summary.text);
  assert.ok(all.summary.text.includes('2 khen, 1 chê và 2 trung lập'), all.summary.text);
  assert.ok(all.summary.text.includes('Chủ đề được nhắc nhiều nhất: '), all.summary.text);

  const linkA = source.links.find((link: any) => link.shopId === a!.shopId);
  const linkB = source.links.find((link: any) => link.shopId === b!.shopId);
  assert.deepEqual(linkA.insights.comments.map((comment: any) => comment.id), ['review-a1', 'review-a2']);
  assert.equal(linkA.insights.comments[0].productName, 'Kem A');
  assert.equal(themeOf(linkA.insights, 'T-CONGDUNG').count, 1);
  assert.equal(themeOf(linkA.insights, 'T-GIA').count, 1);
  assert.equal(themeOf(linkA.insights, 'T-THIETKE').count, 0);
  assert.deepEqual(linkB.insights.comments.map((comment: any) => comment.id), ['review-b1']);
  assert.equal(themeOf(linkB.insights, 'T-THIETKE').count, 1);
  assert.ok(linkB.insights.summary.text.includes('1 trong 1 bình luận'), linkB.insights.summary.text);
  assert.deepEqual(await fs.readFile(database), databaseBytes, 'review-insights must not write the application database');
});

test('an attributes-only labelled row shows its attributes instead of blank text', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-attributes', links: [LINKS[0]!] });
  const [a] = run.links;
  const row = moduleRow(a!, 'review-attributes', { comment: '', ratingStar: 5,
    attributes: ['Phân loại: Hộp 50ml', 'Mùi: nhẹ'] });
  await addLegacySource(run, { rowsByLink: [[row]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [labelRow(row, 'Kem A', [
    { code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'OK' },
  ])]);
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const all = view.sources[0].all;
  assert.deepEqual(all.comments.map((comment: any) => comment.id), ['review-attributes']);
  assert.equal(all.comments[0].text, 'Phân loại: Hộp 50ml · Mùi: nhẹ');
  assert.equal(themeOf(all, 'T-CONGDUNG').comments[0].text, 'Phân loại: Hộp 50ml · Mùi: nhẹ');
});

test('a stale text hash suppresses the whole label group without hiding other comments', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-stale' });
  const [a, b] = run.links;
  const a1 = moduleRow(a!, 'review-a1', { comment: 'Đã đổi nội dung' });
  const b1 = moduleRow(b!, 'review-b1', { comment: 'Nội dung còn khớp' });
  await addLegacySource(run, { rowsByLink: [[a1], [b1]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [
    labelRow(a1, 'Kem A', [
      { code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'OK' },
      { code: 'T-GIA', polarity: 'che', status: 'kept', choice: 'DAT', stale: true },
    ]),
    labelRow(b1, 'Kem B', [
      { code: 'T-THIETKE', polarity: 'khen', status: 'kept', choice: 'DEP' },
    ]),
  ]);
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const all = view.sources[0].all;
  assert.deepEqual(all.comments.map((comment: any) => comment.id), ['review-b1']);
  assert.equal(themeOf(all, 'T-CONGDUNG').count, 0);
  assert.equal(themeOf(all, 'T-GIA').count, 0);
  assert.equal(themeOf(all, 'T-THIETKE').count, 1);
  assert.equal(all.summary.status, 'READY');
  assert.ok(all.summary.text.includes('Đã gắn nhãn Jev cho 1 trong 2 bình luận'), all.summary.text);
});

test('missing database is UNAVAILABLE, an unlabelled database is EMPTY and no sources stay valid', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-states', links: [LINKS[0]!] });
  const [a] = run.links;
  const a1 = moduleRow(a!, 'review-a1', { comment: 'Có nội dung nhưng chưa gắn nhãn' });
  await addLegacySource(run, { rowsByLink: [[a1]] });

  useDatabase(t, null);
  const unavailable = await reviewInsightsView(run.runDir) as any;
  assert.equal(unavailable.sources[0].all.summary.status, 'UNAVAILABLE');
  assert.deepEqual(unavailable.sources[0].all.comments, []);
  assert.equal(unavailable.sources[0].all.themes.length, 10);
  assert.ok(unavailable.sources[0].all.themes.every((theme: any) => theme.count === 0));

  const database = path.join(base, 'empty.db');
  createInsightDatabase(database, []);
  useDatabase(t, database);
  const empty = await reviewInsightsView(run.runDir) as any;
  assert.equal(empty.sources[0].all.summary.status, 'EMPTY');
  assert.deepEqual(empty.sources[0].all.comments, []);

  const noSources = await createModuleRun(base, { runId: 'run-no-sources' });
  const none = await reviewInsightsView(noSources.runDir) as any;
  assert.deepEqual(none, { format: 'review-insights-v1', runId: 'run-no-sources',
    codebookVersion: BOOK.version, sources: [] });
});

test('label batches read every wanted id and keep stale groups suppressed across chunks', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-batch' });
  const [a, b] = run.links;
  const rowsA = Array.from({ length: 300 }, (_, index) =>
    moduleRow(a!, `batch-a-${String(index).padStart(3, '0')}`, { comment: `Bình luận batch A ${index}` }));
  const rowsB = Array.from({ length: 300 }, (_, index) =>
    moduleRow(b!, `batch-b-${String(index).padStart(3, '0')}`, { comment: `Bình luận batch B ${index}` }));
  const rows = [...rowsA, ...rowsB];
  await addLegacySource(run, { cap: 300, rowsByLink: [rowsA, rowsB] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, rows.map((row, index) => labelRow(row, 'Kem Batch', index === 599
    ? [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'OK' },
       { code: 'T-GIA', polarity: 'che', status: 'kept', choice: 'DAT', stale: true }]
    : [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'OK' }])));
  const db = new Database(database);
  db.prepare('INSERT INTO product(product_key, product_name) VALUES (?, ?)').run('product-unrelated', 'Kem Unrelated');
  db.prepare(`INSERT INTO review(review_key, source_code, external_id, kind, product_key, text, attributes_json)
    VALUES (?, 'S05', ?, 'product_review', ?, ?, NULL)`)
    .run('key-unrelated', 'unrelated-1', 'product-unrelated', 'Ngoài lượt');
  db.prepare(`INSERT INTO review_code(review_key, codebook_version, theme_code, polarity, status, choice,
    text_sha256, origin) VALUES (?, ?, ?, ?, ?, ?, ?, 'APP_JEV')`)
    .run('key-unrelated', BOOK.version, 'T-GIA', 'che', 'kept', 'DAT', sha256(codingText('Ngoài lượt', null)));
  db.close();
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const all = view.sources[0].all;
  assert.equal(all.comments.length, 200);
  assert.equal(themeOf(all, 'T-CONGDUNG').count, 599);
  assert.equal(themeOf(all, 'T-GIA').count, 0);
  assert.equal(all.summary.status, 'READY');
  assert.ok(all.summary.text.includes('Đã gắn nhãn Jev cho 599 trong 600 bình luận'), all.summary.text);
});

test('the overall and per-theme comment cap keeps the first 200 labelled comments deterministically', async t => {
  const base = await fixture(t);
  const link = LINKS[0]!;
  const run = await createModuleRun(base, { runId: 'run-cap', links: [link] });
  const rows = Array.from({ length: 205 }, (_, index) =>
    moduleRow(link, `cap-${String(index).padStart(3, '0')}`, { comment: `Bình luận ${index}` }));
  await addLegacySource(run, { cap: 205, rowsByLink: [rows] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, rows.map(row =>
    labelRow(row, 'Kem Cap', [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'OK' }])));
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const all = view.sources[0].all;
  assert.equal(all.comments.length, 200);
  assert.deepEqual(all.comments.map((comment: any) => comment.id), rows.slice(0, 200).map(row => row.reviewId));
  const theme = themeOf(all, 'T-CONGDUNG');
  assert.equal(theme.count, 205);
  assert.equal(theme.comments.length, 200);
  assert.equal(theme.share, 1);
});
