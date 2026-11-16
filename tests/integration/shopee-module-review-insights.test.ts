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
import { prepareLabelledReviewExport, reviewInsightsView } from '../../scripts/module-review-data.js';
import { readReviewExportBytes } from '../../src/modules/foundation/shopee-module-review-data.js';
import { DEFAULT_CODEBOOK_FILE, codingText, parseLabelCodebook } from '../../src/modules/raw-db/review-labeller.js';
import { LINKS, addCustomAttempt, addLegacySource, createModuleRun, moduleRow, sha256, type NativeRow } from '../fixtures/shopee-module-review-data.js';

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
    summary: { status: 'READY', model: 'jev-extractive-theme-v1', generatedAt: '2026-11-10T00:05:00.000Z',
      text: 'Chỉ có 1 bình luận đủ bằng chứng cho chủ đề này: “Kem thấm nhanh” (khen).' },
    comments: [first] });
  assert.equal(themeOf(all, 'T-GIA').polarityCounts.che, 1);
  assert.equal(themeOf(all, 'T-GIA').summary.text,
    'Chỉ có 1 bình luận đủ bằng chứng cho chủ đề này: “Kem thấm nhanh” (chê).');
  assert.equal(themeOf(all, 'T-THIETKE').polarityCounts.khen, 1);
  assert.equal(themeOf(all, 'T-NHUCAU').polarityCounts.ke, 1);
  const unclear = themeOf(all, 'T-TRAINGHIEM');
  assert.equal(unclear.polarityCounts.khong_ro_huong, 1);
  assert.equal(unclear.unclearCount, 1);
  assert.deepEqual(unclear.summary, { status: 'EMPTY', text: null, model: null, generatedAt: null });
  for (const theme of all.themes) {
    assert.equal(typeof theme.summary.status, 'string', theme.code);
    if (!['T-CONGDUNG', 'T-GIA', 'T-THIETKE', 'T-NHUCAU', 'T-TRAINGHIEM'].includes(theme.code)) {
      assert.deepEqual([theme.count, theme.share, theme.comments.length], [0, 0, 0], theme.code);
      assert.equal(theme.summary.status, 'EMPTY', theme.code);
      assert.equal(theme.summary.text, null, theme.code);
    }
  }

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
  assert.equal(themeOf(linkA.insights, 'T-THIETKE').summary.status, 'EMPTY');
  assert.deepEqual(linkB.insights.comments.map((comment: any) => comment.id), ['review-b1']);
  assert.equal(themeOf(linkB.insights, 'T-THIETKE').count, 1);
  assert.ok(themeOf(linkB.insights, 'T-THIETKE').summary.text.includes('“Hộp đẹp, dùng tiện” (khen)'));
  assert.ok(!themeOf(linkA.insights, 'T-THIETKE').summary.text?.includes('Hộp đẹp'), 'no cross-link quote');
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
  assert.equal(themeOf(all, 'T-CONGDUNG').summary.status, 'EMPTY');
  assert.equal(themeOf(all, 'T-GIA').summary.status, 'EMPTY');
  assert.ok(themeOf(all, 'T-THIETKE').summary.text.includes('“Nội dung còn khớp” (khen)'));
  assert.ok(!themeOf(all, 'T-THIETKE').summary.text.includes('Đã đổi nội dung'));
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
  assert.ok(unavailable.sources[0].all.themes.every((theme: any) =>
    theme.summary.status === 'UNAVAILABLE' && theme.summary.text === null && theme.summary.model === null));

  const database = path.join(base, 'empty.db');
  createInsightDatabase(database, []);
  useDatabase(t, database);
  const empty = await reviewInsightsView(run.runDir) as any;
  assert.equal(empty.sources[0].all.summary.status, 'EMPTY');
  assert.deepEqual(empty.sources[0].all.comments, []);
  assert.ok(empty.sources[0].all.themes.every((theme: any) =>
    theme.summary.status === 'EMPTY' && theme.summary.text === null));

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
  assert.equal(themeOf(all, 'T-GIA').summary.status, 'EMPTY');
  assert.ok(!themeOf(all, 'T-CONGDUNG').summary.text.includes('Ngoài lượt'), 'labels outside the run are not evidence');
  assert.ok(themeOf(all, 'T-CONGDUNG').summary.text.startsWith('Nội dung tiêu biểu từ các bình luận'));
  assert.ok(themeOf(all, 'T-CONGDUNG').summary.text.includes('Bình luận batch'));
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
  assert.equal(theme.summary.status, 'READY');
  assert.ok(theme.summary.text.startsWith('Nội dung tiêu biểu từ các bình luận'));
  assert.ok(theme.summary.text.includes('“Bình luận 0” (khen)'));

  const again = await reviewInsightsView(run.runDir);
  assert.deepEqual(again, view, 'theme summaries must be deterministic');
});

test('theme summaries synthesise kept evidence per theme and keep sources isolated', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-theme-summaries' });
  const [a, b] = run.links;
  const a1 = moduleRow(a!, 'review-a1', { comment: 'Kem thấm nhanh' });
  const a2 = moduleRow(a!, 'review-a2', { comment: 'Mùi hơi nồng' });
  const a3 = moduleRow(a!, 'review-a3', { comment: 'Dùng hằng ngày tiện' });
  const a4 = moduleRow(a!, 'review-a4', { comment: 'Chưa rõ kết quả' });
  const b1 = moduleRow(b!, 'review-b1', { comment: 'Hộp đẹp' });
  await addLegacySource(run, { rowsByLink: [[a1, a2, a3, a4], [b1]] });
  const c1 = moduleRow(a!, 'review-c1', { comment: 'Nguồn custom A' });
  const c2 = moduleRow(b!, 'review-c2', { comment: 'Nguồn custom B' });
  await addCustomAttempt(run, { rowsByLink: [[c1], [c2]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [
    labelRow(a1, 'Kem A', [
      { code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' },
      { code: 'T-GIA', polarity: 'che', status: 'kept', choice: 'CHE' },
    ]),
    labelRow(a2, 'Kem A', [
      { code: 'T-CONGDUNG', polarity: 'che', status: 'kept', choice: 'CHE' },
      { code: 'T-TRAINGHIEM', polarity: 'khong_ro_huong', status: 'unclear', choice: null },
    ]),
    labelRow(a3, 'Kem A', [
      { code: 'T-CONGDUNG', polarity: 'ke', status: 'kept', choice: 'KE' },
      { code: 'T-NHUCAU', polarity: 'ke', status: 'kept', choice: 'MUC_TIEU' },
    ]),
    labelRow(a4, 'Kem A', [
      { code: 'T-CONGDUNG', polarity: 'khen', status: 'unclear', choice: 'KHEN' },
    ]),
    labelRow(b1, 'Kem B', [
      { code: 'T-THIETKE', polarity: 'khen', status: 'kept', choice: 'KHEN' },
    ]),
    labelRow(c1, 'Kem C', [
      { code: 'T-CONGDUNG', polarity: 'che', status: 'kept', choice: 'CHE' },
    ]),
    labelRow(c2, 'Kem C', [
      { code: 'T-THIETKE', polarity: 'khen', status: 'kept', choice: 'KHEN' },
    ]),
  ]);
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  assert.equal(view.sources.length, 2);
  const legacy = view.sources.find((source: any) => source.kind === 'legacy');
  const custom = view.sources.find((source: any) => source.kind === 'custom');
  assert.ok(legacy && custom);
  const legacyA = legacy.links.find((link: any) => link.shopId === a!.shopId);
  const legacyB = legacy.links.find((link: any) => link.shopId === b!.shopId);
  assert.ok(legacyA && legacyB);

  const legacyTheme = themeOf(legacy.all, 'T-CONGDUNG');
  assert.equal(legacyTheme.summary.status, 'READY');
  assert.equal(legacyTheme.summary.text,
    'Nội dung tiêu biểu từ các bình luận đã gắn nhãn cho chủ đề này: ' +
    '“Dùng hằng ngày tiện” (trung lập); “Kem thấm nhanh” (khen); “Mùi hơi nồng” (chê).');
  assert.ok(!legacyTheme.summary.text.includes('Nguồn custom A'), 'no cross-source quote');
  assert.ok(!legacyTheme.summary.text.includes('Chưa rõ kết quả'), 'unclear comments never become evidence');
  assert.equal(themeOf(legacy.all, 'T-TRAINGHIEM').summary.status, 'EMPTY');
  assert.ok(themeOf(legacy.all, 'T-GIA').summary.text.includes('“Kem thấm nhanh” (chê)'));
  assert.ok(themeOf(legacy.all, 'T-NHUCAU').summary.text.includes('“Dùng hằng ngày tiện” (trung lập)'));
  assert.equal(themeOf(legacyB.insights, 'T-CONGDUNG').summary.status, 'EMPTY');
  assert.ok(themeOf(legacyB.insights, 'T-THIETKE').summary.text.includes('“Hộp đẹp” (khen)'));
  assert.equal(themeOf(legacyA.insights, 'T-THIETKE').summary.status, 'EMPTY');

  const customTheme = themeOf(custom.all, 'T-CONGDUNG');
  assert.equal(customTheme.summary.status, 'READY');
  assert.ok(customTheme.summary.text.includes('“Nguồn custom A” (chê)'));
  assert.ok(!customTheme.summary.text.includes('Kem thấm nhanh'), 'legacy quotes stay out of the custom source');

  assert.deepEqual(await reviewInsightsView(run.runDir), view);
});

test('a later, recurring sentence outranks an earlier generic comment', async t => {
  const base = await fixture(t);
  const link = LINKS[0]!;
  const run = await createModuleRun(base, { runId: 'run-centrality', links: [link] });
  const generic = moduleRow(link, 'central-generic', { comment: 'Mình thấy sản phẩm này cũng được' });
  const useful = moduleRow(link, 'central-useful', { comment: 'Kem thấm nhanh, mùi thơm nhẹ' });
  const later = moduleRow(link, 'central-later', { comment: 'Kem thấm nhanh, mùi thơm dễ chịu' });
  await addLegacySource(run, { rowsByLink: [[generic, useful, later]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [generic, useful, later].map(row =>
    labelRow(row, 'Kem A', [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' }])));
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const summary = themeOf(view.sources[0].all, 'T-CONGDUNG').summary;
  assert.equal(summary.status, 'READY');
  assert.ok(summary.text.startsWith('Nội dung tiêu biểu từ các bình luận'), summary.text);
  assert.ok(!summary.text.includes('khen, 1 chê'), 'polarity counts belong to the bar, not the summary');
  const quotes = [...summary.text.matchAll(/“([^”]+)”/g)].map(match => match[1]);
  assert.equal(quotes[0], 'Kem thấm nhanh, mùi thơm dễ chịu', 'the later recurring sentence must outrank the generic opener');
  assert.ok(quotes.includes('Mình thấy sản phẩm này cũng được'));
  assert.deepEqual(await reviewInsightsView(run.runDir), view);
});

test('a single kept comment gets cautious evidence wording, not a trend claim', async t => {
  const base = await fixture(t);
  const link = LINKS[0]!;
  const run = await createModuleRun(base, { runId: 'run-single-evidence', links: [link] });
  const row = moduleRow(link, 'single-1', { comment: 'Kem thấm nhanh sau vài ngày' });
  await addLegacySource(run, { rowsByLink: [[row]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [labelRow(row, 'Kem A', [
    { code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' },
  ])]);
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const summary = themeOf(view.sources[0].all, 'T-CONGDUNG').summary;
  assert.equal(summary.model, 'jev-extractive-theme-v1');
  assert.equal(summary.text,
    'Chỉ có 1 bình luận đủ bằng chứng cho chủ đề này: “Kem thấm nhanh sau vài ngày” (khen).');
  assert.ok(!summary.text.includes('Nội dung tiêu biểu'));
  assert.ok(!summary.text.includes('các bình luận'));
  assert.deepEqual(await reviewInsightsView(run.runDir), view);
});

test('normalised duplicate sentences are quoted once', async t => {
  const base = await fixture(t);
  const link = LINKS[0]!;
  const run = await createModuleRun(base, { runId: 'run-dedup', links: [link] });
  const first = moduleRow(link, 'dedup-1', { comment: 'Kem  thấm nhanh, mùi thơm nhẹ' });
  const duplicate = moduleRow(link, 'dedup-2', { comment: 'KEM THẤM NHANH, MÙI THƠM NHẸ!!!' });
  const distinct = moduleRow(link, 'dedup-3', { comment: 'Hộp chắc chắn, dễ mở' });
  await addLegacySource(run, { rowsByLink: [[first, duplicate, distinct]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [first, duplicate, distinct].map(row =>
    labelRow(row, 'Kem A', [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' }])));
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const summary = themeOf(view.sources[0].all, 'T-CONGDUNG').summary;
  assert.equal(summary.status, 'READY');
  assert.equal((summary.text.match(/thấm nhanh/gi) ?? []).length, 1, 'normalised duplicates must be quoted once');
  assert.ok(!summary.text.includes('KEM THẤM'));
  assert.ok(summary.text.includes('“Kem thấm nhanh, mùi thơm nhẹ” (khen)'));
  assert.ok(summary.text.includes('“Hộp chắc chắn, dễ mở” (khen)'));
});

test('blank rows fall back to attributes and never become blank quotes', async t => {
  const base = await fixture(t);
  const link = LINKS[0]!;
  const run = await createModuleRun(base, { runId: 'run-blank', links: [link] });
  const blank = moduleRow(link, 'blank-empty', { comment: '', attributes: [] });
  const content = moduleRow(link, 'blank-content', { comment: 'Kem thấm nhanh' });
  const attributes = moduleRow(link, 'blank-attributes', { comment: '', attributes: ['Phân loại: Hộp 50ml'] });
  await addLegacySource(run, { rowsByLink: [[blank, content, attributes]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [
    labelRow(blank, 'Kem A', [
      { code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' },
      { code: 'T-GIA', polarity: 'che', status: 'kept', choice: 'CHE' },
    ]),
    labelRow(content, 'Kem A', [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' }]),
    labelRow(attributes, 'Kem A', [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' }]),
  ]);
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const all = view.sources[0].all;
  const summary = themeOf(all, 'T-CONGDUNG').summary;
  assert.equal(summary.status, 'READY');
  assert.ok(!summary.text.includes('“”'), 'blank rows must not become blank quotes');
  assert.ok(summary.text.includes('“Kem thấm nhanh” (khen)'));
  assert.ok(summary.text.includes('“Phân loại: Hộp 50ml” (khen)'));
  const blankOnly = themeOf(all, 'T-GIA');
  assert.equal(blankOnly.count, 1);
  assert.deepEqual(blankOnly.summary, { status: 'EMPTY', text: null, model: null, generatedAt: null });
});

test('extracted theme summaries stay bounded for long comments', async t => {
  const base = await fixture(t);
  const link = LINKS[0]!;
  const run = await createModuleRun(base, { runId: 'run-bounded', links: [link] });
  const long = (suffix: string) => `Kem thấm nhanh, ${'rất tốt '.repeat(80)}cho ${suffix}`;
  const rows = ['da khô', 'da dầu', 'da thường'].map((suffix, index) =>
    moduleRow(link, `bounded-${index}`, { comment: long(suffix) }));
  await addLegacySource(run, { rowsByLink: [rows] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, rows.map(row =>
    labelRow(row, 'Kem A', [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'KHEN' }])));
  useDatabase(t, database);

  const view = await reviewInsightsView(run.runDir) as any;
  const summary = themeOf(view.sources[0].all, 'T-CONGDUNG').summary;
  assert.equal(summary.status, 'READY');
  assert.ok(summary.text.length < 1000, `summary must stay bounded, got ${summary.text.length}`);
  const quotes = [...summary.text.matchAll(/“([^”]+)”/g)].map(match => match[1]);
  assert.equal(quotes.length, 3);
  assert.ok(quotes.every(quote => quote.length <= 161), JSON.stringify(quotes.map(quote => quote.length)));
  assert.ok(quotes.every(quote => quote.endsWith('…')));
});

test('the labelled comments download holds every collected row with its current Jev tags', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-labelled' });
  const [a, b] = run.links;
  const a1 = moduleRow(a!, 'review-a1', { comment: 'Kem thấm nhanh', ratingStar: 5 });
  const a2 = moduleRow(a!, 'review-a2', { comment: 'Chưa gắn nhãn', ratingStar: 3 });
  const b1 = moduleRow(b!, 'review-b1', { comment: 'Hộp đẹp', ratingStar: 4 });
  await addLegacySource(run, { rowsByLink: [[a1, a2], [b1]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [
    labelRow(a1, 'Kem A', [{ code: 'T-CONGDUNG', polarity: 'khen', status: 'kept', choice: 'CO_HIEUQUA' }]),
  ]);
  useDatabase(t, database);
  const [source] = (await reviewInsightsView(run.runDir) as any).sources;

  const receipt = await prepareLabelledReviewExport(run.runDir, source.sourceSha256);
  assert.deepEqual([receipt.exportFormat, receipt.rowCount, receipt.reused], ['labelled-json', 3, false]);
  assert.equal(receipt.fileName, `shopee-run-labelled-${source.sourceSha256.slice(0, 12)}-binh-luan-nhan.json`);
  const file = JSON.parse((await readReviewExportBytes(run.runDir, receipt.exportSha256)).toString('utf8'));
  assert.deepEqual([file.format, file.sourceSha256, file.codebookVersion, file.total, file.labelled],
    ['shopee-labelled-comments-v1', source.sourceSha256, BOOK.version, 3, 1]);
  assert.deepEqual(file.comments.map((c: any) => [c.id, c.tags.map((tag: any) => tag.code), c.productName]),
    [['review-a1', ['T-CONGDUNG'], 'Kem A'], ['review-a2', [], null], ['review-b1', [], null]]);
  assert.equal((await prepareLabelledReviewExport(run.runDir, source.sourceSha256)).reused, true, 'same labels reuse the saved file');
});

test('the download reads labels like the result tab when two results share a review id', async t => {
  const base = await fixture(t);
  const run = await createModuleRun(base, { runId: 'run-shared-id' });
  const [a, b] = run.links;
  const legacy = moduleRow(a!, 'review-shared', { comment: 'Bản cũ của bình luận' });
  await addLegacySource(run, { rowsByLink: [[legacy], [moduleRow(b!, 'review-b1', { comment: 'Hộp đẹp' })]] });
  const custom = moduleRow(a!, 'review-shared', { comment: 'Bản mới của bình luận' });
  await addCustomAttempt(run, { rowsByLink: [[custom], [moduleRow(b!, 'review-c2', { comment: 'Nguồn custom B' })]] });
  const database = path.join(base, 'app.db');
  createInsightDatabase(database, [labelRow(legacy, 'Kem A', [{ code: 'T-GIA', polarity: 'che', status: 'kept', choice: 'DAT' }])]);
  useDatabase(t, database);
  const view = await reviewInsightsView(run.runDir) as any;
  assert.equal(view.sources.length, 2);
  const expected: Record<string, string[]> = { legacy: ['T-GIA'], custom: [] };
  for (const source of view.sources) {
    const onScreen = source.all.comments.find((c: any) => c.id === 'review-shared')?.tags ?? [];
    const receipt = await prepareLabelledReviewExport(run.runDir, source.sourceSha256);
    const file = JSON.parse((await readReviewExportBytes(run.runDir, receipt.exportSha256)).toString('utf8'));
    const inFile = file.comments.find((c: any) => c.id === 'review-shared').tags;
    assert.deepEqual(inFile, onScreen, source.kind + ': file and result tab agree');
    assert.deepEqual(inFile.map((tag: any) => tag.code), expected[source.kind], source.kind + ': the labelled text keeps its tag');
  }
});
