import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import type { ReaderReportInput } from '../../contracts/analysis/reader-report-input.generated.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import {
  READER_SECTION_ANCHORS, buildMarketReport, computeReaderReportData, lint, publishReaderReport, readerWebResults, visibleText,
} from '../../src/modules/analysis/reader-report/index.js';
import { flintFallbacks } from '../../src/modules/analysis/reader-report/flint.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertFlintCharts } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

type P = 'shopee' | 'tiktok';
const titles = ['Bình nhỏ 500ml quà tặng', 'Bình lớn 1 lít', 'Bình nhỏ 350ml', 'Ly giữ nhiệt 600ml', 'Nước giặt tặng bình'];
const rows = (platforms: readonly P[]) => platforms.flatMap((platform, k) => Array.from({ length: 12 }, (_, j) => {
  const i = k * 100 + j, rev = (13 - j) * 1_000_000 * (k ? 3 : 7), units = 10 + j;
  return {
    i, platform, listing: `L${i}`, shop: `shop${j % 5}`, shopName: `Gian hàng ${String.fromCharCode(65 + (j % 5))}`, cat: 'Bình',
    rev, units, asp: rev / units, brand: j % 3 ? 'X' : '(không ghi)', title: titles[j % titles.length]!,
    start: j % 4 === 0 ? '2026-01-15' : j % 4 === 1 ? '2024-03-01' : j % 4 === 2 ? '1970-01-01' : null,
  };
}));
const input = (platforms: readonly P[] = ['shopee', 'tiktok']): ReaderReportInput => ({
  contractVersion: '1.0.0',
  profile: {
    slug: 'synthetic', product: 'Bình thử', status: 'proposed',
    segments: { S1: 'Bình nhỏ', S2: 'Bình lớn', N1: 'Hàng tặng kèm' }, short: { S1: 'Nhỏ', S2: 'Lớn' },
    core: ['S1', 'S2'], non: ['N1'],
    measure: { unit: 'ml', re: '(\\d+(?:\\.\\d+)?)\\s*(ml|lít)', toBase: { ml: 1, 'lít': 1000 } },
    rules: [{ seg: 'N1', when: { titleRe: 'nước giặt' }, why: 'Không phải bình' }, { seg: 'S2', when: { measureGte: 600 } }, { seg: 'S1', when: {} }],
    signals: [['Quà tặng', 'quà'], ['Giữ nhiệt', 'giữ nhiệt']],
    benchmark: { label: 'Bình ghi đúng 500 ml', measureRange: [450, 550] },
  },
  platforms: [...platforms] as ReaderReportInput['platforms'],
  rows: rows(platforms) as ReaderReportInput['rows'],
  source: {
    measurementPeriod: { start: '2025-10-05', end: '2026-10-02' },
    rowCap: 5000,
    displayedHeadlines: { revenueVnd: 2e9, soldListings: 40, shops: 12, units: 900 },
    platformBreakdown: Object.fromEntries(platforms.map(p => [p, { displayedRevenueVnd: 1e9 }])),
  },
});
const LIMITS = ['Phân loại sản phẩm chưa được chủ duyệt.', 'Tệp chỉ có tổng cả kỳ, chưa có số theo tháng.'];
const options = { limitations: LIMITS, builtOn: '06/10/2026', flint: false } as const;

async function withStore<T>(f: (store: ContentAddressedArtifactStore) => Promise<T>): Promise<T> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'reader-template-'));
  try { return await f(new ContentAddressedArtifactStore(root)); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('two-platform market report passes every gate and is deterministic', async () => {
  await withStore(async store => {
    const build = async () => {
      const r = await buildMarketReport(computeReaderReportData(input()), options);
      return { r, pub: await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk }) };
    };
    const a = await build(), b = await build();
    assert.equal(a.pub.html.sha256, b.pub.html.sha256, 'same input gives the same html');
    assert.ok(a.pub.lint.every(x => x.ok), JSON.stringify(a.pub.lint.filter(x => !x.ok)));
    const vis = visibleText(a.r.html);
    for (const s of LIMITS) assert.ok(vis.includes(s), `limitation restated: ${s}`);
    for (const id of READER_SECTION_ANCHORS) assert.ok(a.r.html.includes(`<section id="${id}">`), id);
    assert.match(vis, /chờ chủ duyệt/);
    assert.match(vis, /TikTok Shop/);
    assert.equal(a.r.html.match(/<tr><td>\d+<\/td><td><span class="plat/g)?.length, 24, 'appendix lists every row');
    assert.ok(a.r.charts.length >= 5 && a.r.charts.every(c => c.engine === 'svg-fallback'));
  });
});

test('one-platform report has no second marketplace and still passes', async () => {
  await withStore(async store => {
    const r = await buildMarketReport(computeReaderReportData(input(['shopee'])), options);
    const pub = await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk });
    assert.ok(pub.lint.every(x => x.ok));
    assert.doesNotMatch(visibleText(r.html), /TikTok/);
  });
});

test('approved profile and missing signals or benchmark still render', async () => {
  await withStore(async store => {
    const x = input();
    x.profile.status = 'approved';
    x.profile.signals = [];
    delete x.profile.benchmark;
    const r = await buildMarketReport(computeReaderReportData(x), { ...options, limitations: [] });
    const pub = await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk });
    assert.ok(pub.lint.every(l => l.ok), JSON.stringify(pub.lint.filter(l => !l.ok)));
    assert.doesNotMatch(r.html, /Bảng 8\.2|Hình 5\.1/);
    assert.match(visibleText(r.html), /đã được chủ duyệt/);
  });
});

test('web search results are cited in the appendix with links, kept despite their own wording, and pass every gate', async () => {
  await withStore(async store => {
    const at = '2026-10-01T18:30:00.000Z';
    const webResults = [
      { position: 2, title: 'Bình giữ nhiệt <b>mẫu mới</b>', url: 'https://example.test/b?x=1&y=2', snippet: 'Đánh giá "thật"', retrievedAt: at, site: 'Báo Mẫu', published: '15 thg 3, 2026' },
      { position: 1, title: 'Hướng dẫn chọn bình', url: 'https://example.test/a', snippet: null, retrievedAt: at },
      { position: 3, title: 'Bình rẻ nhất', url: 'http://example.test/plain', snippet: null, retrievedAt: at },
      { position: 4, title: 'Thị phần bình 2026 xếp hạng toàn thị trường', url: 'https://example.test/share', snippet: null, retrievedAt: at },
      { position: 5, title: 'Xem Bảng 3 ở đây, Phần 14', url: 'https://example.test/table', snippet: null, retrievedAt: at },
      { position: 6, title: 'Bình theo Kalodata', url: 'https://example.test/kalodata-review', snippet: 'Số liệu SerpApi và metric', retrievedAt: at, site: 'Dami blog', published: null },
      { position: 7, title: 'Bình', url: 'https://example.test/c', snippet: 'giá {{x}} null NaN', retrievedAt: at },
      { position: 8, title: 'Mẹo trang trí', url: `https://example.test/${'a'.repeat(400)}?ref=1`, snippet: 'Dùng url(https://example.test/x.png) làm nền', retrievedAt: at },
      { position: 9, title: 'Trang của nguồn số liệu', url: 'https://www.kalodata.com/products/1', snippet: null, retrievedAt: at },
    ];
    assert.deepEqual(readerWebResults(webResults).map(w => w.position), [1, 2, 4, 5, 6, 7, 8],
      'only non-https pages and pages hosted by a data provider are left out');
    const r = await buildMarketReport(computeReaderReportData(input()), { ...options, webResults });
    const pub = await publishReaderReport(store, { html: r.html, narrator: r.narrator, extraOk: r.extraOk });
    assert.ok(pub.lint.every(x => x.ok), JSON.stringify(pub.lint.filter(x => !x.ok)));
    assert.deepEqual(r.webResults.map(w => w.position), [1, 2, 4, 5, 6, 7, 8]);
    const masked = r.webResults.find(w => w.position === 6)!;
    assert.deepEqual([masked.title, masked.snippet, masked.site], ['Bình theo […]', 'Số liệu […] và […]', '[…] blog'], 'provider names are masked, the rest is quoted');
    assert.match(r.html, /\.pl-url\{overflow-wrap:anywhere/, 'long addresses wrap instead of widening the page');
    const vis = visibleText(r.html);
    assert.match(vis, /Bảng PL\.3/);
    assert.match(vis, /Kết quả tìm kiếm tại Việt Nam cho từ khóa của báo cáo, thu ngày 02\/10\/2026/, 'retrieval day is shown in Vietnam time');
    assert.ok(r.html.includes('<a href="https://example.test/b?x=1&amp;y=2" target="_blank" rel="noopener noreferrer">Bình giữ nhiệt &lt;b&gt;mẫu mới&lt;/b&gt;</a>'),
      'the title links to the page and is escaped');
    assert.match(vis, /Báo Mẫu · đăng 15 thg 3, 2026/, 'site and publish date are cited');
    assert.match(vis, /https:\/\/example\.test\/b\?x=1&amp;y=2/, 'the address stays readable on paper');
    assert.match(vis, /Thị phần bình 2026 xếp hạng toàn thị trường/, 'a page title is quoted as written');
    assert.match(vis, /kết quả không cho biết tác giả/);\n    assert.doesNotMatch(vis, /Google/);
    assert.match(vis, /chép theo kết quả tìm kiếm, không phải từ trang gốc: đoạn mô tả có thể bị cắt ngắn/, 'the note says where the text comes from');
    assert.doesNotMatch(vis, /nguyên văn/, 'search-result text is not claimed to be verbatim from the page');
    assert.doesNotMatch(r.html, /src="https?:/);
    assert.doesNotMatch(vis, /SerpApi|Kalodata|\bDami\b|\bmetric\b/i);

    const none = await buildMarketReport(computeReaderReportData(input()), options);
    assert.doesNotMatch(none.html, /Bảng PL\.3|Kết quả tìm kiếm tại Việt Nam/);
    assert.deepEqual(none.webResults, []);
  });
});

test('charts render through the chart engine without network', async () => {
  const fetch0 = globalThis.fetch;
  globalThis.fetch = (() => { throw new Error('network blocked in test'); }) as typeof fetch;
  try {
    const r = await buildMarketReport(computeReaderReportData(input()), { ...options, flint: true, cover: null });
    assert.deepEqual(r.charts.filter(c => c.engine !== 'flint'), []);
    assert.ok(lint(r.html, { sectionIds: READER_SECTION_ANCHORS }).every(x => x.ok));
  } finally {
    globalThis.fetch = fetch0;
  }
});

// Every Market report carries three Flint charts: concentration, revenue by platform and product rows.
const REQUIRED_CHARTS = ['market.concentration', 'market.platform-revenue', 'market.product-ranking'];
const chartDivs = (html: string): string[] => [...html.matchAll(/<div\b[^>]*\bclass="[^"]*\bchart\b[^"]*"[^>]*>/gu)].map(match => match[0]);
const v2Data = () => {
  const x = sync1ReaderFixture('1.4.0');
  x.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(x.rows);
  x.unitPrices = units.packet;
  return computeReaderReportData(x, units.retained);
};

test('Market 1.4 shows the page-type column only when the run stored the flag; no engine name is visible either way', async () => {
  const webResults = [
    { position: 1, title: 'Cách làm thạch dừa', url: 'https://blog.example.test/a', site: 'Blog', snippet: 'Mô tả', published: null, retrievedAt: '2026-10-02T00:00:00.000Z' },
    { position: 2, title: 'Thạch dừa 500g', url: 'https://shopee.vn/thach-dua-i.1.2', site: 'Shopee', snippet: 'Xem cách sử dụng bên dưới', published: null, retrievedAt: '2026-10-02T00:00:00.000Z' },
  ];
  const base = { ...sync1Options, flint: false, webResults };
  const flagless = await buildMarketReport(v2Data(), base);
  const flagged = await buildMarketReport(v2Data(), { ...base, webPageTypes: true });
  const none = await buildMarketReport(v2Data(), { ...sync1Options, flint: false });
  assert.match(flagless.html, /Trang tìm thấy/);
  assert.doesNotMatch(visibleText(flagless.html), /Loại trang|Bài hướng dẫn|Trang khác|Tin tức/, 'a flagless packet shows no page type');
  assert.doesNotMatch(visibleText(none.html), /Loại trang/, 'no packet and no web results: no column');
  assert.match(visibleText(flagged.html), /Loại trang/);
  assert.match(visibleText(flagged.html), /Bài hướng dẫn/);
  assert.match(visibleText(flagged.html), /Trang khác/);
  for (const r of [flagless, flagged, none]) assert.doesNotMatch(visibleText(r.html), /Google/);
});

test('Market 1.4 without monthly web facts still draws the three required charts with Flint', async () => {
  const d = v2Data();
  assert.equal(d.webFacts, null, 'no monthly web facts in this fixture');
  const r = await buildMarketReport(d, { ...sync1Options, flint: true });
  assert.deepEqual(REQUIRED_CHARTS.filter(id => !r.charts.some(c => c.id === id)), []);
  assert.deepEqual(r.charts.filter(c => c.engine !== 'flint'), []);
  const divs = chartDivs(r.html);
  assert.ok(divs.length >= 3, `chart figures: ${divs.length}`);
  for (const div of divs) assert.match(div, /data-engine="flint"/);
  for (const title of ['Doanh thu trong mẫu, từng sàn', 'Mức tập trung doanh thu theo gian hàng, từng sàn', 'Sản phẩm có doanh thu cao trong mẫu']) assert.match(visibleText(r.html), new RegExp(title));
  assert.match(visibleText(r.html), /Hình 4\.1[\s\S]*Hình 4\.2[\s\S]*Hình 7\.1/);
  assert.match(r.html, /data-market-chart-rows="12"/);
  const rule11 = auditMarket14(r.html).find(item => item.rule === '11')!;
  assert.equal(rule11.ok, true, rule11.detail);
});

test('Market 1.2 (V1 template) draws the three required charts beside its core concentration line, all with Flint', async () => {
  const r = await buildMarketReport(computeReaderReportData(sync1ReaderFixture('1.2.0')), { ...sync1Options, flint: true });
  for (const id of ['m04-pareto', ...REQUIRED_CHARTS]) assert.ok(r.charts.some(c => c.id === id), id);
  assert.deepEqual(r.charts.filter(c => c.engine !== 'flint'), []);
  const divs = chartDivs(r.html);
  assert.ok(divs.length >= 4, `chart figures: ${divs.length}`);
  for (const div of divs) assert.match(div, /data-engine="flint"/);
  assert.match(visibleText(r.html), /Hình 4\.2[\s\S]*Hình 4\.3[\s\S]*Hình 4\.4[\s\S]{0,40}Mức tập trung doanh thu theo gian hàng, từng sàn[\s\S]*Hình 7\.1/);
});

test('V1 records every drawn required chart, so a forced Flint failure on any of them is refused', async () => {
  const vega = await import('vega');
  const toSVG = vega.View.prototype.toSVG;
  vega.View.prototype.toSVG = () => { throw new Error('forced Flint failure'); };
  let r;
  try { r = await buildMarketReport(computeReaderReportData(sync1ReaderFixture('1.2.0')), { ...sync1Options, flint: true }); } finally { vega.View.prototype.toSVG = toSVG; }
  for (const id of REQUIRED_CHARTS) assert.equal(r.charts.find(c => c.id === id)?.engine, 'svg-fallback', id);
  assert.throws(() => assertFlintCharts(r.charts), (error: Error) => /^FLINT_REQUIRED:.*market\.concentration/.test(error.message));
});

test('one platform: the revenue chart shows only that platform and nothing is invented', async () => {
  const x = sync1ReaderFixture('1.2.0');
  x.platforms = ['shopee'];
  x.rows = x.rows.filter(row => row.platform === 'shopee') as typeof x.rows;
  const r = await buildMarketReport(computeReaderReportData(x), { ...sync1Options, flint: true });
  assert.deepEqual(r.charts.filter(c => c.engine !== 'flint'), []);
  assert.doesNotMatch(visibleText(r.html), /TikTok/);
});

test('a forced Flint failure is recorded as svg-fallback and the revision build refuses it', async () => {
  const vega = await import('vega');
  const toSVG = vega.View.prototype.toSVG;
  const before = flintFallbacks().length;
  vega.View.prototype.toSVG = () => { throw new Error('forced Flint failure'); };
  let r;
  try { r = await buildMarketReport(v2Data(), { ...sync1Options, flint: true }); } finally { vega.View.prototype.toSVG = toSVG; }
  assert.ok(r.charts.length >= 3 && r.charts.every(c => c.engine === 'svg-fallback' && c.error === 'forced Flint failure'));
  assert.ok(flintFallbacks().length > before, 'the fallback is logged');
  for (const div of chartDivs(r.html)) assert.match(div, /data-engine="svg-fallback"/);
  assert.equal(auditMarket14(r.html).find(item => item.rule === '11')!.ok, false, 'rule 11 rejects svg-fallback charts');
  assert.equal(auditMarket14(r.html, undefined, { requireFlint: false }).find(item => item.rule === '11')!.ok, true, 'the explicit opt-out accepts drawn svg-fallback charts');
  const unmarked = r.html.replace(/ data-engine="svg-fallback"/g, '');
  assert.equal(auditMarket14(unmarked, undefined, { requireFlint: false }).find(item => item.rule === '11')!.ok, false, 'the opt-out still needs an engine marker');
  assert.throws(() => assertFlintCharts(r.charts), (error: Error) => error instanceof ResearchAutomationValidationError && /^FLINT_REQUIRED:.*market\.concentration/.test(error.message));
  assert.doesNotThrow(() => assertFlintCharts(r.charts, false), 'flint: false stays an explicit opt-out');
});
