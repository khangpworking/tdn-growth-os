import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { MetricWebSnapshotError } from '../../src/modules/analysis/research-automation/metric-web-snapshot.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import {
  buildMarketReport,
  computeReaderReportData,
  lint,
  publishReaderReport,
  READER_SECTION_ANCHORS,
  ReaderReportInputError,
  visibleText,
} from '../../src/modules/analysis/reader-report/index.js';
import {
  checkDerivedSource,
  deriveReaderSource,
  inSampleLabel,
  ReaderSourceError,
  reconcileWebWithRows,
  setWebBundleKeys,
  verifyWebSnapshot,
  WEB_FAMILY_LABEL,
  webMonthlyStats,
  webSnapshotDigest,
} from '../../src/modules/analysis/reader-report/web-facts.js';
import { Bundle } from '../../src/modules/analysis/reader-report/bundle.js';
import apiSchema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import readerApiSchema from '../../contracts/api/research-automation-reader-report-api.schema.json' with { type: 'json' };
import readerInputSchema from '../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import defaultPeerSchema from '../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };

// P2 reader report over the metric web snapshot: contract versions, derived
// source, bundle keys, exhibits, lint, reconciliation and citations.

const snapshot = (name = 'full'): Record<string, unknown> =>
  JSON.parse(readFileSync(new URL(`../fixtures/metric-web-snapshot/${name}.json`, import.meta.url), 'utf8'));

const titles = ['Bình nhỏ 500ml quà tặng', 'Bình lớn 1 lít', 'Bình nhỏ 350ml', 'Ly giữ nhiệt 600ml', 'Nước giặt tặng bình'];
type P = 'shopee' | 'tiktok';
const rows = (platforms: readonly P[]) => platforms.flatMap((platform, k) => Array.from({ length: 12 }, (_, j) => {
  const i = k * 100 + j, rev = (13 - j) * 1_000_000 * (k ? 3 : 7), units = 10 + j;
  return {
    i, platform, listing: `L${i}`, shop: `shop${j % 5}`, shopName: `Gian hàng ${String.fromCharCode(65 + (j % 5))}`, cat: 'Bình',
    rev, units, asp: rev / units, brand: j % 3 ? 'X' : '(không ghi)', title: titles[j % titles.length] ?? 'Bình',
    start: j % 4 === 0 ? '2026-01-15' : j % 4 === 1 ? '2024-03-01' : j % 4 === 2 ? '1970-01-01' : null,
  };
}));
const profile = (): ReaderReportInput['profile'] => ({
  slug: 'synthetic', product: 'Bình thử', status: 'proposed',
  segments: { S1: 'Bình nhỏ', S2: 'Bình lớn', N1: 'Hàng tặng kèm' }, short: { S1: 'Nhỏ', S2: 'Lớn' },
  core: ['S1', 'S2'], non: ['N1'],
  measure: { unit: 'ml', re: '(\\d+(?:\\.\\d+)?)\\s*(ml|lít)', toBase: { ml: 1, 'lít': 1000 } },
  rules: [{ seg: 'N1', when: { titleRe: 'nước giặt' }, why: 'Không phải bình' }, { seg: 'S2', when: { measureGte: 600 } }, { seg: 'S1', when: {} }],
  signals: [['Quà tặng', 'quà'], ['Giữ nhiệt', 'giữ nhiệt']],
});
const input10 = (): ReaderReportInput => ({
  contractVersion: '1.0.0',
  profile: profile(),
  platforms: ['shopee', 'tiktok'],
  rows: rows(['shopee', 'tiktok']) as ReaderReportInput['rows'],
  source: {
    measurementPeriod: { start: '2025-10-05', end: '2026-10-02' },
    rowCap: 5000,
    displayedHeadlines: { revenueVnd: 2e9, soldListings: 40, shops: 12, units: 900 },
    platformBreakdown: { shopee: { displayedRevenueVnd: 1e9 }, tiktok: { displayedRevenueVnd: 1e9 } },
  },
});
const input11 = (mutate?: (x: Record<string, unknown>) => void): ReaderReportInput => {
  const s = snapshot();
  const x = {
    contractVersion: '1.1.0',
    profile: profile(),
    platforms: ['shopee', 'tiktok'],
    rows: rows(['shopee', 'tiktok']),
    webSnapshot: s,
    webSnapshotSha256: webSnapshotDigest(s),
  } as unknown as Record<string, unknown>;
  mutate?.(x);
  return x as unknown as ReaderReportInput;
};
const options = { limitations: ['Phân loại sản phẩm chưa được chủ duyệt.'], builtOn: '06/10/2026', flint: false } as const;

test('snapshot build API accepts explicit new version without source and rejects legacy or unpaired snapshot fields', () => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js');
  const ajv = new Ajv2020({ strict: true });
  require('ajv-formats')(ajv);
  ajv.addSchema(defaultPeerSchema).addSchema(apiSchema).addSchema(readerInputSchema).addSchema(readerApiSchema);
  const valid = ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/buildRequest` });
  const s = snapshot();
  const body = { contractVersion: 'reader-report-build-v1.1', requestKey: '10000000-0000-4000-8000-000000000001',
    metricPackageId: '20000000-0000-4000-8000-000000000001', platforms: ['shopee', 'tiktok'], profile: profile(), cover: null,
    webSnapshot: s, webSnapshotSha256: webSnapshotDigest(s) };
  assert.ok(valid(body), JSON.stringify(valid.errors));
  assert.ok(!valid({ ...body, contractVersion: 'reader-report-build-v1', source: input10().source }));
  const { webSnapshotSha256: _digest, ...withoutDigest } = body;
  assert.ok(!valid(withoutDigest));
  assert.ok(!valid({ ...body, unexpected: 'untrusted' }));
});

async function withStore<T>(f: (store: ContentAddressedArtifactStore) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-web-'));
  try { return await f(new ContentAddressedArtifactStore(root)); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('contract versions: 1.0.0 keeps source required and forbids snapshots; 1.1.0 fills source from the snapshot', () => {
  assert.doesNotThrow(() => verifyWebSnapshot(snapshot(), webSnapshotDigest(snapshot())));
  const derived = computeReaderReportData(input11());
  assert.deepEqual(derived.input.source, {
    measurementPeriod: { start: '2025-09-15', end: '2026-09-20' },
    rowCap: 24,
    displayedHeadlines: { revenueVnd: 12312345678, soldListings: 850210, shops: 4512, units: 1234567 },
    platformBreakdown: { shopee: { displayedRevenueVnd: 8012345678 }, tiktok: { displayedRevenueVnd: 4300000000 } },
  });
  assert.doesNotThrow(() => computeReaderReportData(input11(x => { delete x['source']; })), 'source is optional in 1.1.0');
  const noSource = computeReaderReportData(input11());
  assert.deepEqual(noSource.input.source?.measurementPeriod, { start: '2025-09-15', end: '2026-09-20' });
  assert.throws(() => verifyWebSnapshot(snapshot(), '0'.repeat(64)), /webSnapshotSha256/,
    'a wrong digest is rejected');
  assert.throws(() => computeReaderReportData(input11(x => { x['webSnapshotSha256'] = '0'.repeat(64); })),
    (e: unknown) => e instanceof MetricWebSnapshotError, 'sha mismatch fails closed');
  assert.throws(() => computeReaderReportData(input11(x => {
    const s = x['webSnapshot'] as Record<string, Record<string, unknown>>;
    (s['groups'] as Record<string, unknown>)['W2_kpi'] = { absent: true, reason: 'NOT_ON_PAGE' };
  })), (e: unknown) => e instanceof MetricWebSnapshotError && e.code === 'METRIC_UI_CHANGED',
  'an absent W2 is a UI change');
  const v10 = input10() as unknown as Record<string, unknown>;
  v10['webSnapshot'] = snapshot();
  assert.throws(() => computeReaderReportData(v10), /1\.1\.0/, '1.0.0 forbids webSnapshot');
  const bare10 = input10() as unknown as Record<string, unknown>;
  delete bare10['source'];
  assert.throws(() => computeReaderReportData(bare10), (e: unknown) => e instanceof ReaderReportInputError,
    '1.0.0 still requires source');
});

test('deriveReaderSource: a null value names the field and is never read as 0', () => {
  const base = verifyWebSnapshot(snapshot(), webSnapshotDigest(snapshot()));
  assert.equal(deriveReaderSource(base, 5000).rowCap, 5000);
  const missing = verifyWebSnapshot(snapshot(), webSnapshotDigest(snapshot()));
  const broken = { ...missing, kpi: { ...missing.kpi, revenue: { ...missing.kpi.revenue, current: { ...missing.kpi.revenue.current, value: null } } } };
  assert.throws(() => deriveReaderSource(broken, 5000),
    (e: unknown) => e instanceof ReaderSourceError && e.code === 'READER_SOURCE_UNDERIVABLE' && /displayedHeadlines\.revenueVnd/.test(e.message));
  assert.throws(() => deriveReaderSource(base, 0),
    (e: unknown) => e instanceof ReaderSourceError && e.code === 'READER_SOURCE_UNDERIVABLE' && /rowCap/.test(e.message));
  assert.throws(() => checkDerivedSource(
    { ...deriveReaderSource(base, 5000), rowCap: 4999 }, deriveReaderSource(base, 5000)),
  (e: unknown) => e instanceof ReaderSourceError && e.code === 'READER_SOURCE_MISMATCH' && /rowCap/.test(e.message));
  assert.throws(() => computeReaderReportData(input11(x => {
    x['source'] = { ...deriveReaderSource(base, 24), rowCap: 24, displayedHeadlines: { revenueVnd: 1, soldListings: 850210, shops: 4512, units: 1234567 } };
  })), (e: unknown) => e instanceof ReaderSourceError && e.code === 'READER_SOURCE_MISMATCH',
  'a request source that differs from the derived source is rejected');
});

test('helpers: digest, labels and monthly stats', () => {
  const s = snapshot();
  assert.equal(webSnapshotDigest(s), createHash('sha256').update(canonicalJson(s), 'utf8').digest('hex'));
  assert.equal(inSampleLabel(24), 'trong mẫu 24 sản phẩm');
  assert.ok(WEB_FAMILY_LABEL.length > 0);
  const facts = verifyWebSnapshot(s, webSnapshotDigest(s));
  assert.ok(!('absent' in facts.monthly));
  const stats = webMonthlyStats(facts.monthly.shopee ?? {});
  assert.deepEqual([stats.peak?.month, stats.low?.month], ['2026-09', '2025-09']);
  assert.ok(stats.last3vsPrev3 !== null && Math.abs(stats.last3vsPrev3 - 9.26) < 0.02, `last3 ${stats.last3vsPrev3}`);
  assert.deepEqual(webMonthlyStats({}), { peak: null, low: null, last3vsPrev3: null });
  const twoMonths = Object.fromEntries(Object.entries(facts.monthly.shopee ?? {}).slice(0, 2));
  assert.equal(webMonthlyStats(twoMonths).last3vsPrev3, null, 'fewer than six months gives no last3');
  assert.throws(() => verifyWebSnapshot(snapshot(), 'not-a-digest'),
    (e: unknown) => e instanceof MetricWebSnapshotError, 'a non-digest sha is rejected');
});

test('monthly comparisons require six consecutive calendar months with values', () => {
  const facts = verifyWebSnapshot(snapshot(), webSnapshotDigest(snapshot()));
  assert.ok(!('absent' in facts.monthly));
  const template = Object.values(facts.monthly.shopee ?? {})[0]!;
  const months = Object.fromEntries(['2026-01', '2026-02', '2026-03', '2026-07', '2026-08', '2026-09']
    .map((month, i) => [month, { ...template, revenue: { ...template.revenue, value: i < 3 ? 100 : 200 } }]));
  assert.equal(webMonthlyStats(months).last3vsPrev3, null);
  const nullLast = { ...months, '2026-10': { ...template, revenue: { ...template.revenue, value: null } } };
  assert.equal(webMonthlyStats(nullLast).last3vsPrev3, null);
});

test('web lint checks block boundaries, platform sums and all captured provider names', () => {
  const fails = (html: string) => lint(html).filter(r => !r.ok && r.rule.startsWith('W')).map(r => r.rule.slice(0, 2));
  assert.deepEqual(fails('<div class="webex"><div><p>12,3 tỷ</p></div></div><p>toàn kết quả tìm kiếm</p>'), ['W1']);
  assert.deepEqual(fails('<p>Tổng hai sàn đạt 10 tỷ toàn kết quả tìm kiếm.</p>'), ['W3']);
  for (const provider of ['OpenCLI', 'Apify', 'PageIndex', 'SerpApi', 'Agent-Reach', 'zen-studio']) {
    assert.deepEqual(fails(`<div class="webex" data-web-label="${provider}">toàn kết quả tìm kiếm</div>`), ['W6']);
  }
});

test('1.1.0 cites every web result and quoted snippet, and M10 historical numbers', async () => {
  const r = await buildMarketReport(computeReaderReportData(input11()), { ...options,
    webResults: [{ position: 1, title: 'Synthetic independent source', url: 'https://example.org/evidence?token=discard',
      snippet: 'Verbatim synthetic quote.', retrievedAt: '2026-10-06T00:00:00Z' }] });
  const m10 = r.html.match(/<section id="phan-10">[\s\S]*?<\/section>/)![0];
  assert.match(m10, /class="cite"/);
  const webTable = r.html.match(/<table class="pl-web">[\s\S]*?<\/table>/)![0];
  assert.equal([...webTable.matchAll(/class="cite"/g)].length, 2);
  const register = r.html.match(/<section class="citation-register">[\s\S]*?<\/section>/)![0];
  assert.match(register, /https:\/\/example.org\/evidence<\/a>/);
  const providers = await buildMarketReport(computeReaderReportData(input11()), { ...options,
    webResults: [{ position: 1, title: 'OpenCLI synthetic title', site: 'Apify source', url: 'https://example.org/evidence',
      snippet: 'PageIndex synthetic quote.', retrievedAt: '2026-10-06T00:00:00Z' }] });
  assert.doesNotMatch(visibleText(providers.html), /OpenCLI|Apify|PageIndex/);
});

test('monthly fallback is a line with an actual gap and no fabricated missing point', async () => {
  const s = snapshot();
  const groups = s['groups'] as Record<string, unknown>;
  groups['W4_monthly'] = (groups['W4_monthly'] as { platform: string; month: string }[])
    .filter(point => !(point.platform === 'shopee' && point.month === '2026-03'));
  const r = await buildMarketReport(computeReaderReportData(input11(x => {
    x['webSnapshot'] = s; x['webSnapshotSha256'] = webSnapshotDigest(s);
  })), options);
  const figure = r.html.match(/<figure class="ex">(?:(?!<figure class="ex">)[\s\S])*?Hình 3\.2[\s\S]*?<\/figure>/)![0];
  assert.match(figure, /<polyline/);
  assert.match(figure, /data-month="2026-03" data-series="TikTok Shop"/);
  assert.doesNotMatch(figure, /data-month="2026-03" data-series="Shopee"/);
  assert.equal([...figure.matchAll(/<polyline/g)].length, 3, 'Shopee line breaks into two segments; TikTok remains continuous');
});

test('all rounded web exhibits show their precision and lineage rows never invent a source', async () => {
  const s = snapshot();
  const round = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if ('precision' in object) object['precision'] = 'display_rounded';
    for (const child of Object.values(object)) round(child);
  };
  round(s);
  const r = await buildMarketReport(computeReaderReportData(input11(x => {
    x['webSnapshot'] = s; x['webSnapshotSha256'] = webSnapshotDigest(s); x['rowLineage'] = { sha256: 'b'.repeat(64) };
  })), options);
  for (const number of ['3.2', '4.2', '4.3', '4.4', '6.3', '7.2', '7.3', '7.4', '7.5', '7.6', '8.3']) {
    const escaped = number.replace('.', '\\.');
    const table = r.html.match(new RegExp(`<div class="ex">(?:(?!<div class="ex">)[\\s\\S])*?Bảng ${escaped}[\\s\\S]*?</table>[\\s\\S]*?</div>`))![0];
    assert.match(table, /số làm tròn như trên trang/, number);
  }
  assert.doesNotMatch(r.html, /Chưa có nguồn/);
  const numbers = [...r.html.matchAll(/<sup class="cite">\[(\d+)\]<\/sup>/g)].map(match => Number(match[1]));
  assert.deepEqual([...new Set(numbers)], [...new Set(numbers)].map((_, index) => index + 1));
  const uncited = await buildMarketReport(computeReaderReportData(input11()), options);
  assert.match(uncited.html, /Chưa có nguồn/);
});

test('1.0.0 computes and renders without any web key', async () => {
  const d = computeReaderReportData(input10());
  assert.equal(d.webFacts, null);
  assert.deepEqual(d.webKeys, []);
  assert.deepEqual(d.webReconciliation, []);
  assert.ok(!d.bundle.toJSON().some(m => m.id.startsWith('web.') || m.id.startsWith('cite.')));
  await withStore(async store => {
    const r = await buildMarketReport(d, options);
    assert.equal(createHash('sha256').update(r.html).digest('hex'), 'e2094fdf8d70fb529f5bdd7db974bbe475839693086506a662a4ae8e48682535',
      'legacy fixture HTML remains byte-identical to the pre-fix renderer at 42b2787');
    const pub = await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk });
    assert.ok(pub.lint.every(x => x.ok), JSON.stringify(pub.lint.filter(x => !x.ok)));
    assert.doesNotMatch(r.html, /webex|Nguồn tham khảo/);
  });
});

test('web bundle keys cover every group and never sum platforms', () => {
  const d = computeReaderReportData(input11());
  for (const id of ['web.kpi.rev', 'web.kpi.units', 'web.kpi.listings', 'web.kpi.shops',
    'web.kpi.rev.chg', 'web.kpi.units.chg', 'web.kpi.listings.chg',
    'web.shopee.rev', 'web.shopee.share', 'web.tiktok.rev', 'web.tiktok.share',
    'web.shopee.m.2025-10', 'web.tiktok.m.2026-09',
    'web.shopee.peak', 'web.shopee.low', 'web.shopee.last3vsPrev3',
    'web.top10.brand', 'web.top10.shop', 'web.shopType.mall',
    'web.loc.0', 'web.cat.0.rev', 'web.price.0.rev',
    'web.top.product.0.rev', 'web.top.product.0.chg', 'web.top.product.0.units',
    'web.top.shop.0.rev', 'web.top.shop.0.rankNew', 'web.top.brand.0.rev']) {
    assert.ok(d.bundle.has(id), id);
  }
  assert.ok(!d.bundle.has('web.kpi.shops.chg'), 'a null change stays missing, never 0');
  assert.ok(!d.bundle.toJSON().some(m => /^web\.(all|total|sum)/.test(m.id)), 'no summed platform key');
  const b = new Bundle();
  const keys = setWebBundleKeys(b, d.webFacts ?? (() => { throw new Error('unreachable'); })());
  assert.deepEqual([...keys].sort(), [...d.webKeys].sort());
  assert.deepEqual(d.webReconciliation, [], 'consistent sample rows stay quiet');
});

test('reconciliation R1–R4 fire on crafted breaches with numbers', () => {
  const facts = verifyWebSnapshot(snapshot(), webSnapshotDigest(snapshot()));
  const checks = (rows: { platform: string; rev: number; units: number }[]) =>
    reconcileWebWithRows(facts, rows).map(w => w.check);
  assert.deepEqual(checks([{ platform: 'shopee', rev: 20000000000, units: 1 }]).sort(), ['R1', 'R4']);
  assert.deepEqual(checks([{ platform: 'shopee', rev: 1, units: 2000000 }]), ['R2']);
  const fewListings = {
    ...facts,
    kpi: { ...facts.kpi, soldListings: { ...facts.kpi.soldListings, current: { ...facts.kpi.soldListings.current, value: 2 } } },
  };
  assert.deepEqual(reconcileWebWithRows(fewListings,
    [{ platform: 'shopee', rev: 1, units: 1 }, { platform: 'shopee', rev: 1, units: 1 }, { platform: 'shopee', rev: 1, units: 1 }]).map(w => w.check), ['R3']);
  const r4 = reconcileWebWithRows(facts, [{ platform: 'tiktok', rev: 5000000000, units: 1 }]);
  assert.deepEqual(r4.map(w => w.check), ['R4']);
  assert.equal(r4[0]?.code, 'METRIC_WEB_XLSX_MISMATCH');
  assert.ok((r4[0]?.numbers['tiktok'] ?? 0) > 0 && (r4[0]?.numbers['web.tiktok'] ?? 0) > 0, 'R4 carries both numbers');
  assert.match(r4[0]?.detail ?? '', /TikTok Shop/);
  assert.doesNotMatch(r4[0]?.detail ?? '', /\btiktok\b/);
});

test('rendered reconciliation warnings retain bundle evidence, citations and web precision', async () => {
  const s = snapshot();
  const groups = s['groups'] as Record<string, any>;
  groups['W2_kpi'].soldListings.current.value = 2;
  groups['W2_kpi'].soldListings.current.displayed = '2';
  for (const key of ['revenue', 'units', 'soldListings']) groups['W2_kpi'][key].current.precision = 'display_rounded';
  for (const split of groups['W3_platformSplit']) split.revenue.precision = 'display_rounded';
  const d = computeReaderReportData(input11(x => {
    x['rows'] = rows(['shopee', 'tiktok']).map(row => ({ ...row, rev: 3_750_000_000, units: 100_005.5 }));
    x['webSnapshot'] = s; x['webSnapshotSha256'] = webSnapshotDigest(s);
    x['rowLineage'] = { sha256: 'b'.repeat(64) };
  }));
  assert.deepEqual(d.webReconciliation.map(w => w.check), ['R1', 'R2', 'R3', 'R4']);
  const r = await buildMarketReport(d, options);
  const warningBox = r.html.match(/<div class="box"><h3>Đối chiếu tệp mẫu với trang<\/h3><ul>([\s\S]*?)<\/ul><\/div>/)![1]!;
  assert.equal([...warningBox.matchAll(/<sup class="cite">/g)].length, 10, 'every sample and web warning amount has a source');
  assert.equal([...warningBox.matchAll(/class="web-precision"/g)].length, 5, 'rounded KPI and platform amounts keep the page precision notice');
  for (const value of ['90.000.000.000', '12.312.345.678', '2.400.132', '1.234.567', '24', '2', '45.000.000.000', '8.012.345.678', '4.300.000.000']) {
    assert.ok(warningBox.includes(`${value}<sup class="cite">`), value);
  }
  const sourceOf = (value: string): string => warningBox.match(new RegExp(` ${value.replaceAll('.', '\\.') }<sup class="cite">\\[(\\d+)\\]`))![1]!;
  assert.notEqual(sourceOf('90.000.000.000'), sourceOf('12.312.345.678'), 'sample and web amounts cite distinct evidence');
  assert.equal(sourceOf('90.000.000.000'), sourceOf('2.400.132'));
  assert.equal(sourceOf('90.000.000.000'), sourceOf('24'));
  assert.equal(sourceOf('12.312.345.678'), sourceOf('1.234.567'));
  assert.equal(sourceOf('12.312.345.678'), sourceOf('2'));
  assert.notEqual(sourceOf('12.312.345.678'), sourceOf('8.012.345.678'), 'platform evidence uses its own snapshot group');
  assert.equal(sourceOf('8.012.345.678'), sourceOf('4.300.000.000'));
  const warnings = r.narrator.entries.filter(entry => entry.where.startsWith('M02.reconcile.'));
  assert.equal(warnings.length, 4, 'the number gate checks every warning');
  assert.deepEqual(r.narrator.checkHardcoded(r.extraOk).hardcoded.filter(entry => entry.where.startsWith('M02.reconcile.')), []);
  assert.deepEqual(r.narrator.notInBundle(r.extraOk).filter(entry => entry.where.startsWith('M02.reconcile.')), []);
  assert.match(visibleText(warningBox), /Shopee/);
  assert.match(visibleText(warningBox), /TikTok Shop/);
  assert.doesNotMatch(visibleText(warningBox), /\b(?:shopee|tiktok)\b/);
});

test('1.1.0 renders web exhibits, the monthly chart, citations and passes every gate', async () => {
  await withStore(async store => {
    const build = async () => {
      const r = await buildMarketReport(computeReaderReportData(input11()), options);
      return { r, pub: await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk }) };
    };
    const a = await build(), b = await build();
    assert.equal(a.pub.html.sha256, b.pub.html.sha256, 'same facts give the same page');
    assert.ok(a.pub.lint.every(x => x.ok), JSON.stringify(a.pub.lint.filter(x => !x.ok)));
    const vis = visibleText(a.r.html);
    for (const s of ['Bảng 2.3', 'Bảng 3.2', 'Hình 3.2', 'Bảng 4.2', 'Bảng 4.3', 'Bảng 4.4',
      'Bảng 6.3', 'Bảng 7.2', 'Bảng 7.3', 'Bảng 7.4', 'Bảng 7.5', 'Bảng 7.6', 'Bảng 8.3',
      WEB_FAMILY_LABEL, 'Nguồn tham khảo', 'Đối chiếu tệp mẫu với trang: khớp']) {
      assert.ok(vis.includes(s) || a.r.html.includes(s), s);
    }
    assert.match(a.r.html, /<figure class="ex">[\s\S]*?Hình 3\.2[\s\S]*?<svg/, 'monthly chart per platform');
    assert.ok(a.r.html.includes('class="webex"'));
    const marks = [...a.r.html.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
    assert.ok(marks.length > 0, 'citation marks');
    const ids = [...a.r.html.matchAll(/id="cite-(\d+)"/g)].map(m => Number(m[1])).sort((x, y) => x - y);
    assert.deepEqual(ids, ids.map((_, i) => i + 1), 'register has no gaps');
    assert.ok(Math.max(...marks) <= ids.length, 'every mark matches the register');
    assert.ok(a.r.charts.some(c => c.id === 'm03-web-monthly'), 'monthly chart tracked');
    assert.ok(a.r.charts.every(c => c.engine === 'svg-fallback'));
  });
});

test('monthly chart renders through the chart engine without network', async () => {
  const r = await buildMarketReport(computeReaderReportData(input11()), { ...options, flint: true });
  assert.equal(r.charts.find(c => c.id === 'm03-web-monthly')?.engine, 'flint');
  assert.ok(lint(r.html, { sectionIds: READER_SECTION_ANCHORS }).every(x => x.ok));
});

test('each exhibit appears only when its group is present', async () => {
  const s = snapshot();
  (s['groups'] as Record<string, unknown>)['W4_monthly'] = { absent: true, reason: 'NOT_ON_PAGE' };
  (s['groups'] as Record<string, unknown>)['W5_category'] = { absent: true, reason: 'NOT_ON_PAGE' };
  const x = input11(y => { y['webSnapshot'] = s; y['webSnapshotSha256'] = webSnapshotDigest(s); });
  const r = await buildMarketReport(computeReaderReportData(x), options);
  assert.doesNotMatch(r.html, /Hình 3\.2/);
  assert.match(visibleText(r.html), /chưa có số theo tháng/);
  assert.doesNotMatch(r.html, /Bảng 4\.2/);
  assert.match(r.html, /Bảng 3\.2/, 'W2 stays while W4 is absent');
});

test('lint W-rules reject crafted breaches and pass consistent pages', async () => {
  const r = await buildMarketReport(computeReaderReportData(input11()), options);
  const ok = lint(r.html, { sectionIds: READER_SECTION_ANCHORS });
  assert.ok(ok.every(x => x.ok), JSON.stringify(ok.filter(x => !x.ok)));
  const fails = (html: string): string[] => lint(html).filter(x => !x.ok && x.rule.startsWith('W')).map(x => x.rule);
  assert.deepEqual(fails('<div class="webex" data-web-label="x"><p>12,3 tỷ</p></div>'), ['W1 số web mang nhãn họ']);
  assert.deepEqual(fails('<p>Trong mẫu 5 sản phẩm đạt 1 tỷ + 2 tỷ toàn kết quả tìm kiếm.</p>'), ['W2 không cộng trừ hai họ số']);
  assert.deepEqual(fails('<p>Tệp trong mẫu 5 sản phẩm phủ 10% toàn kết quả tìm kiếm.</p>'), [], 'the M02 coverage ratio is allowed');
  assert.deepEqual(fails('<p>Trong mẫu 5 sản phẩm phủ 1 tỷ + 2 tỷ toàn kết quả tìm kiếm.</p>'), ['W2 không cộng trừ hai họ số'], 'coverage wording does not exempt cross-family addition');
  assert.deepEqual(fails('<p>Trong mẫu 5 sản phẩm phủ 1.200 tỷ + 2.300 tỷ toàn kết quả tìm kiếm.</p>'), ['W2 không cộng trừ hai họ số'], 'grouping dots do not split a cross-family statement');
  assert.deepEqual(fails('<p>Tổng hai sàn đạt 10 tỷ.</p>'), ['W3 không cộng gộp sàn khi trang không ghi tổng']);
  assert.deepEqual(fails('<p>Thị phần Shopee là 60%.</p>'), ['W4 không dùng từ "thị phần"']);
  assert.deepEqual(fails('<section id="phan-10"><p>Dự báo đạt 15 tỷ.</p></section>'), ['W5 M10 không có số dự báo']);
  assert.deepEqual(fails('<section id="phan-10"><p>Dự báo đạt 15.000 tỷ.</p></section>'), ['W5 M10 không có số dự báo']);
  assert.deepEqual(fails('<section id="phan-10"><p>Chưa dự báo: không có chuỗi.</p></section>'), []);
  assert.deepEqual(fails('<div class="webex" data-web-label="Số liệu Metric">ok</div>'),
    ['W1 số web mang nhãn họ', 'W6 nhãn thu thập không nêu tên nhà cung cấp']);
});
