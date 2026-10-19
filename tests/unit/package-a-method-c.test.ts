import assert from 'node:assert/strict';
import test from 'node:test';
import { type CaptureQualityRow, assessCaptureRows, assessCaptureRowsTitleOnly, assessCaptureTitle, captureRowExclusions, isMainCapturedProduct, CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { captureTitleSha256, classifyCaptureRelevance, readCaptureRelevanceRecord } from '../../src/modules/analysis/research-automation/capture-relevance.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { readerRowsFromMetricCapture } from '../../src/modules/analysis/reader-report/metric-capture-rows.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { relevanceHarness, relevanceNow, relevanceHash, retainedRelevance } from '../helpers/capture-relevance-fixture.js';
import { genuineProducts, inventedProducts, methodCArchive, normalRow, referenceRows } from '../helpers/method-c-fixture.js';

const states = ['absent', null, 'UNSURE', 'MAIN', 'NOT_MAIN'] as const;
for (const { keyword, title } of genuineProducts) for (const state of states) {
  test(`genuine ${keyword} retains exact revenue, shops and ranking membership with ${state}`, async () => {
    const rows = [...referenceRows(keyword), normalRow(title)];
    const record = state === 'absent' ? undefined : retainedRelevance(rows, keyword, t => t === title ? state : 'MAIN');
    const result = assessCaptureRows(rows, [keyword], 'BATCH', record);
    assert.equal(result.cohorts[0]!.categoryAvailable, true);
    assert.equal(result.decisions[40]!.evidence[0]!.rareCategory, true);
    assert.deepEqual([...result.exclusions], state === 'NOT_MAIN' ? [[40, 'NOT_MAIN_PRODUCT']] : []);
    assert.equal(result.decisions[40]!.reason, null);
    assert.deepEqual(assessCaptureRowsTitleOnly(rows, [keyword], CAPTURE_ROW_PROFILE, record).exclusions, result.exclusions);
    const archive = await methodCArchive(keyword, rows);
    const reader = readerRowsFromMetricCapture(archive.snapshot, ['shopee'], CAPTURE_ROW_PROFILE, record);
    const expectedTitles = rows.filter((_, i) => state !== 'NOT_MAIN' || i !== 40).map(r => r.title);
    assert.deepEqual(reader.rows.map(r => r.title), expectedTitles);
    assert.equal(reader.rows.reduce((sum, r) => sum + r.rev!, 0), state === 'NOT_MAIN' ? 4000 : 4100);
    assert.equal(new Set(reader.rows.map(r => r.shop)).size, expectedTitles.length);
    const input = metricFixture();
    const base = input.records[0]!;
    input.records = reader.rows.map(r => ({ ...base, label: null, listingId: r.listing, shopId: r.shop, title: r.title,
      revenue: { ...base.revenue, value: String(r.rev) }, units: { ...base.units, value: String(r.units) } }));
    const all = calculateMetricScopes(input).scopes.find(s => s.key === 'all')!;
    assert.equal(all.revenue.value, state === 'NOT_MAIN' ? '4000' : '4100');
    assert.equal(all.shopCount, expectedTitles.length);
    assert.deepEqual(new Set(all.shops.map(s => JSON.parse(s.shopKey)[1])), new Set(reader.rows.map(r => r.shop)));
  });
}

for (const { keyword, accessory, gift } of inventedProducts) {
  for (const title of [accessory, gift]) for (const state of states) test(`${title}: only retained NOT_MAIN drops (${state})`, async () => {
    const rows = [...referenceRows(keyword), normalRow(title)];
    const record = state === 'absent' ? undefined : retainedRelevance(rows, keyword, t => t === title ? state : 'MAIN');
    for (const mode of ['BATCH', 'TITLE_ONLY'] as const) {
      const result = assessCaptureRows(rows, [keyword], mode, record);
      assert.equal(result.decisions[40]!.evidence[0]!.title.reason, title === accessory ? 'ACCESSORY_FOR_TARGET' : 'SECONDARY_GIFT');
      assert.equal(result.decisions[40]!.reason, null);
      assert.equal(result.decisions[40]!.evidence[0]!.reason, null);
      assert.deepEqual([...result.exclusions], state === 'NOT_MAIN' ? [[40, 'NOT_MAIN_PRODUCT']] : []);
      assert.equal(result.decisions[40]!.aiExcluded, state === 'NOT_MAIN');
    }
    assert.equal(isMainCapturedProduct(title, keyword, CAPTURE_ROW_PROFILE), true);
    assert.deepEqual([...captureRowExclusions(rows, [keyword], CAPTURE_ROW_PROFILE)], []);
    const reader = readerRowsFromMetricCapture((await methodCArchive(keyword, rows)).snapshot, ['shopee'], CAPTURE_ROW_PROFILE, record);
    assert.equal(reader.rows.length, state === 'NOT_MAIN' ? 40 : 41);
    assert.deepEqual(reader.excluded.map(r => [r.title, r.reason]), state === 'NOT_MAIN' ? [[title, 'NOT_MAIN_PRODUCT']] : []);
  });

  test(`${keyword}: genuine marker, punctuation, language, accent and scope controls stay diagnostic`, async () => {
    const titles = [
      `Cho bé: ${keyword} mẫu nhỏ`, `Dành cho phòng nhỏ: ${keyword} mẫu nhỏ`, `Sinh nhật bé: tặng ${keyword} mẫu nhỏ`,
      `Dễ gói để tặng ${keyword}`, `Dễ gói để tặng: ${keyword}`, `Gọn nhẹ dễ đựng: ${keyword}`,
      `Cho bé tặng ${keyword}`, `Dành cho sinh nhật tặng ${keyword}`, `Cho bé, ${keyword}`, `Cho bé - ${keyword}`,
      `${keyword} tặng túi mẫu`, `Combo túi mẫu và ${keyword}`, `Set ${keyword} và túi mẫu`, `Ruột thay thế ${keyword}`,
      `Refill ${keyword}`, `${keyword} mẫu thử`, `Bộ 3 chiếc ${keyword}`, `Mua 2 tặng 1 ${keyword}`,
      `For children: ${keyword}`, `For a small room - ${keyword}`, `Case for ${keyword}`, `用途例: ${keyword}`,
      `${keyword}`.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd'), `Mini ${keyword}`,
    ].flatMap(t => [t, t.toUpperCase(), t.normalize('NFD')]);
    const rows = [...referenceRows(keyword), ...titles.map(t => normalRow(t))];
    for (const state of states) {
      const record = state === 'absent' ? undefined : retainedRelevance(rows, keyword, t => titles.includes(t) ? state : 'MAIN');
      for (const mode of ['BATCH', 'TITLE_ONLY'] as const) {
        const result = assessCaptureRows(rows, [keyword], mode, record);
        assert.deepEqual([...result.exclusions], state === 'NOT_MAIN' ? titles.map((_, i) => [40 + i, 'NOT_MAIN_PRODUCT']) : []);
        assert.ok(result.decisions.every(d => d.reason === null && d.evidence.every(e => e.reason === null)));
      }
    }
    // Preserve the probe's direct diagnostic assertions as well as membership controls.
    assert.equal(assessCaptureTitle(accessory, keyword).reason, 'ACCESSORY_FOR_TARGET');
    assert.equal(assessCaptureTitle(gift, keyword).reason, 'SECONDARY_GIFT');
    for (const title of [`${keyword} tặng túi mẫu`, `Combo túi mẫu và ${keyword}`, `Set ${keyword} và túi mẫu`, `Ruột thay thế ${keyword}`, `Refill ${keyword}`, `Bộ 3 chiếc ${keyword}`, `Mua 2 tặng 1 ${keyword}`, `${keyword} mẫu thử`, `Mini ${keyword}`]) {
      assert.equal(assessCaptureTitle(title, keyword).reason, null, title);
    }
  });
}

for (const { keyword } of inventedProducts.slice(0, 3)) test(`${keyword}: exact-title records and invariant relevance across hint, category and reference changes`, () => {
  for (const title of [`${keyword} mẫu`, `Bao dùng cho ${keyword}`, `Túi mẫu tặng ${keyword}`, `Giá dành cho ${keyword}`, `Vật mẫu chưa rõ`]) {
    for (const label of [null, 'UNSURE', 'MAIN', 'NOT_MAIN'] as const) for (const size of [0, 9, 40, 161]) {
      for (const platform of ['shopee', 'tiktok']) for (const categoryText of ['Danh mục chính mẫu', 'Danh mục hiếm mẫu', null]) {
        const rows = [...referenceRows(keyword).slice(0, size), ...Array.from({ length: Math.max(0, size - 40) }, (_, i) => normalRow(`Giá dành cho ${keyword} ${i}`)),
          { ...normalRow(title), platform, categoryText, price: 1 }];
        const record = retainedRelevance(rows, keyword, t => t === title ? label : 'MAIN');
        assert.ok(record.decisions.some(d => d.titleSha256 === captureTitleSha256(title) && d.label === label));
        const result = assessCaptureRows(rows, [keyword], 'BATCH', record);
        assert.deepEqual([...result.exclusions], label === 'NOT_MAIN' ? [[rows.length - 1, 'NOT_MAIN_PRODUCT']] : []);
      }
    }
  }
});

for (let n = 0; n < 3; n++) test(`keyword pair ${n}: all NOT_MAIN, normalized duplicates, exact cross-platform titles and missing lookup`, () => {
  const keywords = [inventedProducts[n]!.keyword, inventedProducts[n + 1]!.keyword];
  const title = `Bao dùng cho ${keywords[0]} và ${keywords[1]}`;
  const rows = [normalRow(title), { ...normalRow(title), platform: 'tiktok' }];
  for (const pair of [['NOT_MAIN', 'NOT_MAIN'], ['NOT_MAIN', 'MAIN'], ['NOT_MAIN', 'UNSURE'], ['NOT_MAIN', null], [null, 'NOT_MAIN']] as const) {
    const parts = keywords.map((keyword, i) => retainedRelevance(rows, keyword, () => pair[i]!));
    const record = readCaptureRelevanceRecord({ ...parts[0]!, decisions: parts.flatMap(p => p.decisions) }, rows, keywords);
    assert.equal(record.decisions.length, 2, 'exact duplicate titles share one decision per keyword');
    const result = assessCaptureRows(rows, [...keywords, keywords[0]!.toUpperCase().normalize('NFD')], 'BATCH', record);
    assert.equal(result.decisions[0]!.evidence.length, 2);
    assert.deepEqual([...result.exclusions], pair.every(l => l === 'NOT_MAIN') ? [[0, 'NOT_MAIN_PRODUCT'], [1, 'NOT_MAIN_PRODUCT']] : []);
    const missing = { ...record, decisions: record.decisions.slice(0, 1) };
    assert.deepEqual([...assessCaptureRows(rows, keywords, 'BATCH', missing).exclusions], [], 'direct helper preserves missing lookup');
    assert.throws(() => readCaptureRelevanceRecord(missing, rows, keywords), { constructor: TypeError, message: 'Retained capture relevance membership differs' });
  }
  assert.deepEqual([...assessCaptureRows(rows, [], 'BATCH', retainedRelevance(rows, keywords[0]!, () => 'NOT_MAIN')).exclusions], []);
});

for (const { keyword } of inventedProducts.slice(0, 3)) test(`${keyword}: financial floor remains exact with null and MAIN, with relevance before frozen median`, () => {
  const rows: CaptureQualityRow[] = [100, 100, 300, 300, 4000, 4001, 100, 100].map((revenue, i) => ({ ...normalRow(`${keyword} ${i}`), revenue }));
  rows.push({ ...normalRow(`${keyword} zero units`), units: 0 }, { ...normalRow(`${keyword} missing units`), units: null },
    { ...normalRow(`${keyword} zero revenue`), revenue: 0, units: 0 }, { ...normalRow(`${keyword} missing values`), revenue: null, units: null },
    { ...normalRow(`${keyword} other platform`), platform: 'tiktok', revenue: 9000000 });
  for (const label of [null, 'MAIN'] as const) {
    const result = assessCaptureRows(rows, [keyword], 'BATCH', retainedRelevance(rows, keyword, () => label));
    assert.deepEqual([...result.exclusions], [[8, 'REVENUE_WITHOUT_UNITS'], [9, 'REVENUE_WITHOUT_UNITS'], [5, 'UNIT_REVENUE_OUTLIER']]);
    assert.equal(result.exclusions.has(4), false, 'strict boundary: even median 200, ratio exactly 4000 survives');
    assert.ok(result.decisions.every(d => !d.aiExcluded));
  }
  const candidates = [100, 100, 2001, 50000, 60000, 70000].map((revenue, i) => ({ ...normalRow(`${keyword} candidate ${i}`), revenue }));
  assert.deepEqual([...assessCaptureRows(candidates, [keyword]).exclusions], []);
  const record = retainedRelevance(candidates, keyword, t => /[345]$/u.test(t) ? 'NOT_MAIN' : null);
  assert.deepEqual([...assessCaptureRows(candidates, [keyword], 'BATCH', record).exclusions], [[3, 'NOT_MAIN_PRODUCT'], [4, 'NOT_MAIN_PRODUCT'], [5, 'NOT_MAIN_PRODUCT'], [2, 'UNIT_REVENUE_OUTLIER']]);
});

for (const { keyword } of inventedProducts.slice(0, 3)) test(`${keyword}: capped audience and accessory nulls remain complete and pass relevance`, async t => {
  const rows = Array.from({ length: 1600 }, (_, i) => normalRow(`${keyword} anchor ${i}`));
  rows.push(normalRow(`Cho bé: ${keyword} mẫu nhỏ`), normalRow(`Vỏ dùng cho ${keyword}`));
  let calls = 0;
  const record = await classifyCaptureRelevance(rows, [keyword], { configuration: captureRelevanceConfiguration('synthetic-cap-model'), classifier: { async classify({ items }) {
    calls++; return items.map(({ id }) => ({ id, label: 'MAIN' as const }));
  } } });
  assert.equal(calls, 40);
  assert.deepEqual(record.methodNotes, { batches: 40, retriedBatches: 0, failedBatches: 0, cappedTitles: 2 });
  assert.deepEqual(record.decisions.slice(-2).map(d => d.label), [null, null]);
  assert.equal(readCaptureRelevanceRecord(record, rows, [keyword]).decisions.length, 1602);
  const retainedBytes = canonicalJson(record);
  const replay = readCaptureRelevanceRecord(JSON.parse(retainedBytes), rows, [keyword]);
  assert.equal(canonicalJson(replay), retainedBytes);
  assert.deepEqual(replay.decisions.slice(-2).map(d => d.label), [null, null]);
  assert.equal(calls, 40, 'replaying retained capped labels makes zero new calls');
  // The single-keyword capture archive is capped below 1600 titles. Exercise durable
  // record retention directly, without fabricating a bridge-admissible oversized archive.
  const f = await relevanceHarness(t);
  const bytes = Buffer.from(retainedBytes);
  const filePath = 'methods/capture-relevance.json';
  const stored = await f.packages.intake({ contractVersion: '1.0.0', packageKey: 'synthetic:capped-record', version: 1,
    sourceAcquiredAt: relevanceNow().toISOString(), sourceLabel: 'Synthetic capped relevance record', files: [{ path: filePath,
      sha256: relevanceHash(bytes), byteSize: bytes.length, mediaType: 'application/json', evidenceFamily: 'synthetic-relevance',
      representationRole: 'derived', independence: 'non_independent', providerProvenance: 'operator_supplied_unverified',
      provenanceBasis: 'Synthetic offline classifier decisions, retained for exact replay.' }] }, new Map([[filePath, bytes]]));
  const checkpoint = await f.packages.readVerified(stored.packageId);
  assert.deepEqual(checkpoint.files[0]!.bytes, bytes);
  const changes = f.db.prepare('SELECT total_changes() n').get();
  const reloaded = readCaptureRelevanceRecord(JSON.parse((await f.packages.readVerified(stored.packageId)).files[0]!.bytes.toString()), rows, [keyword]);
  assert.equal(canonicalJson(reloaded), retainedBytes);
  assert.deepEqual([...assessCaptureRows(rows, [keyword], 'BATCH', reloaded).exclusions], []);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  assert.equal(calls, 40);
  assert.deepEqual([...assessCaptureRows(rows, [keyword], 'BATCH', record).exclusions], []);
});

test('blank and unattributed rows keep separate structural boundaries and honest missing numbers in three categories', async () => {
  for (const { keyword } of inventedProducts.slice(0, 3)) {
    const rows = [normalRow(keyword), { ...normalRow(''), revenue: 100, units: null }, { ...normalRow(`Cho bé: ${keyword}`), platform: 'unknown', revenue: null, units: null },
      { ...normalRow(`${keyword} missing`), revenue: null, units: null }, { ...normalRow(`${keyword} zero`), revenue: 0, units: 0 }];
    const parsed = readerRowsFromMetricCapture((await methodCArchive(keyword, rows)).snapshot, ['shopee'], CAPTURE_ROW_PROFILE);
    assert.deepEqual(parsed.rows.map(r => [r.title, r.rev, r.units]), [[keyword, 100, 1], [`${keyword} missing`, null, null], [`${keyword} zero`, 0, 0]]);
    assert.deepEqual(parsed.excluded, []);
    assert.deepEqual(parsed.unattributed.map(r => [r.title, r.rev, r.units]), [[`Cho bé: ${keyword}`, null, null]]);
  }
});

for (const { keyword } of genuineProducts) test(`${keyword}: preserve probe bundle, refill, trial, multipack, head, modifier, accent and platform controls`, () => {
  const unaccent = (value: string) => value.normalize('NFD').replace(/\p{M}/gu, '').replaceAll('đ', 'd');
  for (const [title, reason] of [
    [`Vỏ dùng cho ${keyword}`, 'ACCESSORY_FOR_TARGET'], [`Túi mẫu tặng ${keyword}`, 'SECONDARY_GIFT'],
    [`${keyword} tặng túi mẫu`, null], [`Combo túi mẫu và ${keyword}`, null], [`Set ${keyword} và túi mẫu`, null],
    [`Ruột thay thế ${keyword}`, null], [`Refill ${keyword}`, null], [`Bộ 3 chiếc ${keyword}`, null],
    [`Mua 2 tặng 1 ${keyword}`, null], [`${keyword} mẫu thử`, null], [unaccent(`${keyword} mẫu thử`), null], [`Mini ${keyword} mẫu thử`, null],
  ] as const) assert.equal(assessCaptureTitle(title, keyword).reason, reason, title);
  const rows = [...referenceRows(keyword), normalRow(`Mini ${keyword} mẫu thử`), { ...normalRow(`Giá dành cho ${keyword}`), platform: 'tiktok' }];
  const result = assessCaptureRows(rows, [keyword]);
  assert.equal(result.cohorts.find(c => c.platform === 'shopee')!.categoryAvailable, true);
  assert.equal(result.cohorts.find(c => c.platform === 'tiktok')!.categoryAvailable, false);
  assert.equal(result.decisions[40]!.evidence[0]!.rareCategory, true);
  assert.deepEqual([...result.exclusions], []);
  for (const i of result.cohorts.flatMap(c => c.anchors)) assert.equal(result.exclusions.has(i), false);
});
