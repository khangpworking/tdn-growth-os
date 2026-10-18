import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildMarketReport, computeReaderReportData, publishReaderReport } from '../../src/modules/analysis/reader-report/index.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildResearchAutomationReport, marketSourceRows, marketSourceTypes } from '../../src/modules/analysis/research-automation/reports.js';
import { exactTestReviewSample, type ExactTestReviewContext } from '../../src/modules/analysis/research-automation/test-review-sample.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

const hash = (html: string) => createHash('sha256').update(html).digest('hex');
const readerData = (version: '1.2.0' | '1.3.0' | '1.4.0' = '1.4.0') => {
  const input = sync1ReaderFixture(version);
  if (version !== '1.2.0') input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  return computeReaderReportData(input);
};
const trialContext = (counts: readonly number[], cap = 20, outcome: 'PARTIAL_LISTINGS' | 'PROVIDER_BLOCKED' | 'PROVIDER_TIMEOUT_NO_REVIEWS' = 'PARTIAL_LISTINGS'): ExactTestReviewContext => ({
  scope: { testReviewCap: cap },
  collection: {
    exactShopee: { collectionId: 'synthetic', collectionSha256: 'a'.repeat(64), requestSha256: 'b'.repeat(64) },
    exactShopeeOutcome: { outcome, testReviewCap: cap,
      listings: counts.map((reviews, i) => ({ listingUrl: `https://shopee.vn/product/201/${101 + i}`, reviews })),
      attemptedAt: '2026-02-01T00:00:00Z', providerMessage: 'Apify zen-studio Google synthetic diagnostic', reused: false },
  },
});
const text = (node: Element) => node.textContent!.replace(/\s+/gu, ' ').trim();
const sampleText = (doc: Document) => {
  const block = doc.querySelector('.test-review-sample')!.cloneNode(true) as Element;
  block.querySelectorAll('.cite').forEach(node => node.remove());
  return text(block);
};

test('reader M13 and both older renderer paths agree on zero, short and full trial sample wording', async () => {
  const context = trialContext([0, 7, 20]);
  const built = await buildMarketReport(readerData(), { ...sync1Options, flint: true, testReviewSample: context });
  const doc = new JSDOM(built.html).window.document;
  const block = doc.querySelector('.test-review-sample')!;
  assert.equal(block.closest('section')?.id, 'phu-luc');
  assert.equal(doc.querySelector('#phan-1 .test-review-sample'), null);
  assert.equal(block.querySelector('h3')!.textContent, 'Mẫu đánh giá Shopee thu thử');
  assert.deepEqual([...block.querySelectorAll('p')].map(node => node.textContent), [
    'Đây là mẫu thử nhỏ, tối đa 20 đánh giá mỗi sản phẩm, được thu cho báo cáo thử nghiệm. Mẫu này không đại diện cho toàn bộ đánh giá.',
    'Đủ giới hạn thử không có nghĩa đã thu hết đánh giá của sản phẩm. Chưa mã hóa nội dung; không suy ra tỷ lệ ý kiến hay đặc điểm khách hàng. Ngày đánh giá có thể nằm ngoài kỳ báo cáo.',
    'Đây chỉ là đánh giá Shopee; không cộng với TikTok Shop, số liệu bán hàng hoặc số liệu cả nước. Số đánh giá không phải số người.',
  ]);
  const list = block.cloneNode(true) as Element;
  list.querySelectorAll('.cite').forEach(node => node.remove());
  assert.deepEqual([...list.querySelectorAll('li')].map(text), [
    'Sản phẩm #1: Chưa thu được đánh giá; chưa đạt giới hạn thử 20 đánh giá.',
    'Sản phẩm #2: Chỉ thu được 7 đánh giá, ít hơn giới hạn thử 20 đánh giá.',
    'Sản phẩm #3: Đã thu đủ giới hạn thử 20 đánh giá.',
  ]);
  assert.doesNotMatch(text(block), /https?:|%|\b0\b|apify|zen-studio|google|metric|kalodata|tradeint|dami|serpapi|pageindex|opencli/iu);
  for (const [index, link] of [...block.querySelectorAll('li a')].entries()) {
    assert.equal(link.textContent, `Sản phẩm #${index + 1}`);
    assert.equal(link.getAttribute('href'), context.collection!.exactShopeeOutcome!.listings[index]!.listingUrl);
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
    const mark = link.nextElementSibling!;
    assert.equal(mark.className, 'cite');
    const entry = doc.querySelector(`#cite-${mark.textContent!.replace(/\D/gu, '')}`)!;
    assert.equal(entry.querySelector('a')!.textContent, 'Mở nguồn');
    assert.equal(entry.querySelector('a')!.getAttribute('href'), link.getAttribute('href'));
  }
  const input = await fullMarket14Input();
  const trial = { ...input, scope: { ...input.scope, ...context.scope }, collection: { ...input.collection!, ...context.collection } };
  const rows = new Map(marketSourceRows(trial, 0, false));
  assert.equal(rows.get('Dữ liệu đánh giá sản phẩm trên nền tảng'), 'Đã thu mẫu thử Shopee, tối đa 20 đánh giá mỗi sản phẩm; chưa mã hóa nội dung.');
  assert.equal(rows.get('Bình luận đã thu thập'), 'Cùng mẫu đánh giá Shopee nêu trên; không phải một tập bình luận khác.');
  const sourceRows = [...doc.querySelectorAll('#phu-luc tr')];
  for (const key of ['Dữ liệu đánh giá sản phẩm trên nền tảng', 'Bình luận đã thu thập']) {
    assert.equal(text(sourceRows.find(row => row.children[0]?.textContent === key)!.children[1]!), rows.get(key));
  }
  const types = marketSourceTypes(trial, 0, []);
  assert.ok(types.used.includes('Dữ liệu đánh giá sản phẩm và dữ liệu bình luận trên Shopee: cùng mẫu thử nhỏ, chưa mã hóa nội dung'));
  assert.ok(!types.missing.some(value => /đánh giá|bình luận/u.test(value)));
  const { marketPresentation: _presentation, ...draft } = trial;
  for (const report of [trial, draft]) {
    const old = new JSDOM(buildResearchAutomationReport(report, 'MARKET').html.toString()).window.document;
    assert.equal(sampleText(old), sampleText(doc));
  }
  // Machine assertions remain active; evidence-only rules still require human reading.
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
  const rules = auditMarket14(built.html);
  assert.equal(rules.length, 14);
  assert.deepEqual(rules.filter(rule => rule.kind === 'machine' && !rule.ok), []);
  let writes = 0;
  await publishReaderReport({ put: async () => ({ sha256: 'a'.repeat(64), byteSize: ++writes, relativePath: 'synthetic' }) } as never,
    { html: built.html, narrator: built.narrator, extraOk: built.extraOk, visibleTextRules: true });
  assert.ok(writes > 0, 'uncoded sample passes the publication gate without coded-review sections');
});

test('an empty trial states the attempt and missing review types, without a zero count or customer claims', async () => {
  const context = trialContext([0]);
  const doc = new JSDOM((await buildMarketReport(readerData(), { ...sync1Options, testReviewSample: context })).html).window.document;
  assert.match(sampleText(doc), /Chưa thu được đánh giá; chưa đạt giới hạn thử 20 đánh giá\./u);
  assert.doesNotMatch(sampleText(doc), /\b0\b|%|https?:/u);
  assert.match(doc.querySelector('#phu-luc')!.textContent!, /Đã thử thu trên Shopee nhưng chưa có đánh giá trả về; không suy ra sản phẩm không có đánh giá\./u);
  const base = await fullMarket14Input();
  const input = { ...base, scope: { ...base.scope, ...context.scope }, collection: { ...base.collection!, ...context.collection } };
  assert.deepEqual(marketSourceTypes(input, 0, []).used.filter(label => /đánh giá|bình luận/u.test(label)), []);
  assert.ok(marketSourceTypes(input, 0, []).missing.includes('dữ liệu đánh giá sản phẩm'));
  assert.ok(marketSourceTypes(input, 0, []).missing.includes('dữ liệu bình luận của khách'));
  assert.equal(sampleText(new JSDOM(buildResearchAutomationReport(input, 'MARKET').html.toString()).window.document), sampleText(doc));
});

test('a blocked or timed-out source that returned nothing says so once instead of a per-product shortfall', async () => {
  for (const outcome of ['PROVIDER_BLOCKED', 'PROVIDER_TIMEOUT_NO_REVIEWS'] as const) {
    const context = trialContext([0, 0, 0], 20, outcome);
    const doc = new JSDOM((await buildMarketReport(readerData(), { ...sync1Options, testReviewSample: context })).html).window.document;
    const sample = sampleText(doc);
    assert.equal(sample.match(/nguồn tạm thời không trả dữ liệu/gu)?.length, 1);
    assert.doesNotMatch(sample, /chưa đạt giới hạn|\b0\b|%|https?:|apify|zen-studio|google/iu);
    const list = doc.querySelector('.test-review-sample')!.cloneNode(true) as Element;
    list.querySelectorAll('.cite').forEach(node => node.remove());
    assert.deepEqual([...list.querySelectorAll('li')].map(text), [1, 2, 3].map(n => `Sản phẩm #${n}: Chưa thu được đánh giá trong lượt này.`));
    assert.match(doc.querySelector('#phu-luc')!.textContent!, /Lượt thu thử này không lấy được đánh giá vì nguồn tạm thời không trả dữ liệu; không suy ra sản phẩm không có đánh giá\./u);
    const base = await fullMarket14Input();
    const input = { ...base, scope: { ...base.scope, ...context.scope }, collection: { ...base.collection!, ...context.collection } };
    assert.equal(sampleText(new JSDOM(buildResearchAutomationReport(input, 'MARKET').html.toString()).window.document), sample);
  }
  // A blocked outcome that still returned some reviews keeps the per-product wording.
  const partial = sampleText(new JSDOM((await buildMarketReport(readerData(), { ...sync1Options,
    testReviewSample: trialContext([0, 5], 20, 'PROVIDER_BLOCKED') })).html).window.document);
  assert.doesNotMatch(partial, /nguồn tạm thời không trả dữ liệu/u);
  assert.match(partial, /Chỉ thu được 5 đánh giá/u);
});

test('no sample keeps the frozen reader bytes; legacy inputs ignore the additive sample option', async () => {
  const expected = { '1.2.0': 'c45ee04895526bb20d5510f8a6dd1c3de37611e79a83d4ca5c172fe14059edb4',
    '1.3.0': 'b69c7b6d4220598e5a8a1fd53e82cc569d374945c6b95079b408903458838cd8',
    '1.4.0': 'b7d6b30e909cf32fec7082da051bb501e993e875b8746a8e6c96194e3ad1b798' };
  // Frozen from unmodified assigned HEAD 99003a3b803e1081be4d97d574273bb6b82f902a.
  for (const version of ['1.2.0', '1.3.0', '1.4.0'] as const) {
    assert.equal(hash((await buildMarketReport(readerData(version), sync1Options)).html), expected[version]);
    if (version !== '1.4.0') assert.equal(hash((await buildMarketReport(readerData(version), { ...sync1Options, testReviewSample: trialContext([20]) })).html), expected[version]);
  }
});

test('reader requires the exact collection and an integer cap from one to twenty matching scope', async () => {
  const baseline = (await buildMarketReport(readerData(), sync1Options)).html;
  for (const cap of [0, -1, 21, 300, 1.5, NaN]) {
    const context = trialContext([1], cap);
    assert.equal(exactTestReviewSample(context), null);
    assert.equal((await buildMarketReport(readerData(), { ...sync1Options, testReviewSample: context })).html, baseline);
  }
  const sample = trialContext([1]);
  for (const context of [{ ...sample, scope: {} }, { ...sample, scope: { testReviewCap: 19 } },
    { ...sample, collection: null }, { ...sample, collection: { exactShopeeOutcome: sample.collection!.exactShopeeOutcome! } },
    { ...sample, collection: { exactShopee: sample.collection!.exactShopee! } }]) {
    assert.equal(exactTestReviewSample(context), null);
    assert.equal((await buildMarketReport(readerData(), { ...sync1Options, testReviewSample: context })).html, baseline);
  }
  assert.ok(exactTestReviewSample(trialContext([1], 1)));
  assert.ok(exactTestReviewSample(trialContext([20], 20)));
});
