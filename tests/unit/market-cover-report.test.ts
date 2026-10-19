import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { JSDOM } from 'jsdom';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { assertMarket14MachineRules, auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildMarketCover, marketCoverAlt, MARKET_COVER_MODEL } from '../../src/modules/analysis/research-automation/market-cover.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport, marketReportQuarter, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';
import { syntheticPng } from '../helpers/synthetic-png.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const CSP = `default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'`;

async function presentationInput(): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows;
  const unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: null, captures: [], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows) } as unknown as AutomationReportInput;
}

const coverInput = (cover: Awaited<ReturnType<typeof buildMarketCover>>, keyword: string): NonNullable<AutomationReportInput['marketCover']> => ({
  mime: 'image/jpeg', base64: cover.bytes.toString('base64'), alt: marketCoverAlt(keyword, cover.record.provenance), provenance: cover.record.provenance,
  model: cover.record.model, width: cover.record.width, height: cover.record.height });

test('a Market presentation embeds the AI cover inside the cover text column and every gate passes', async () => {
  const input = await presentationInput();
  const plain = buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');
  const ai = await buildMarketCover({ keyword: 'synthetic jar', ai: { generate: async () => ({ bytes: syntheticPng(1536, 1024, 3, (x, y) => [180, (x + y) & 255, 90]), model: MARKET_COVER_MODEL }) } });
  assert.equal(ai.record.provenance, 'ai-generated');
  const built = buildResearchAutomationReport({ ...input, marketCover: coverInput(ai, 'synthetic jar') }, 'MARKET');
  const html = built.html.toString('utf8');
  const document = new JSDOM(html).window.document;
  const images = [...document.querySelectorAll('img')];
  assert.equal(images.length, 1);
  const img = images[0]!;
  assert.equal(img.parentElement, document.querySelector('section.cover > .cv-left > div:nth-of-type(2)'));
  assert.equal(img.nextElementSibling?.tagName, 'H1');
  assert.equal(img.getAttribute('src'), `data:image/jpeg;base64,${ai.bytes.toString('base64')}`);
  assert.equal(img.getAttribute('alt'), marketCoverAlt('synthetic jar', 'ai-generated'));
  assert.equal(img.getAttribute('data-cover-provenance'), 'ai-generated');
  assert.equal(img.getAttribute('data-cover-model'), 'gpt-image-2');
  assert.deepEqual([img.getAttribute('width'), img.getAttribute('height')], ['1024', '576']);
  assert.equal(document.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content'), CSP);
  assert.equal(new JSDOM(plain).window.document.querySelector('meta[http-equiv="Content-Security-Policy"]')!.getAttribute('content'), CSP);
  assert.ok(html.includes('.cv-art{') && !plain.includes('.cv-art{') && !plain.includes('<img'));
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true }));
  assert.ok(lintVisibleReportText(html).every(check => check.ok));
  assert.deepEqual(providerNameViolations(html), []);
  assert.doesNotMatch(document.body.textContent ?? '', /licen[cs]|bản quyền|nguồn ảnh|credit/iu, 'no visible credit or licence text');
  const rule10 = auditMarket14(html).find(item => item.rule === '10')!;
  assert.equal(rule10.ok, true, rule10.detail);
  assert.equal(auditMarket14(plain).find(item => item.rule === '10')!.ok, false, 'no cover image stays a READ');
  assert.equal(JSON.stringify(built.semantic).includes(ai.bytes.toString('base64').slice(0, 64)), false, 'semantic never carries the image');
});

test('a full market14 reader shows a quarter cover, a plain source list and the glossary, and passes the 14 machine rules', async () => {
  const input = await presentationInput();
  const ai = await buildMarketCover({ keyword: 'synthetic jar', ai: { generate: async () => ({ bytes: syntheticPng(1536, 1024, 3, (x, y) => [180, (x + y) & 255, 90]), model: MARKET_COVER_MODEL }) } });
  const html = buildResearchAutomationReport({ ...input, marketCover: coverInput(ai, 'synthetic jar') }, 'MARKET').html.toString('utf8');
  const document = new JSDOM(html).window.document;
  const cover = document.querySelector('section.cover')!;
  const text = (node: Element | null): string => (node?.textContent ?? '').replace(/\s+/gu, ' ').trim();
  // The stored sales sample (2026-08-17..2026-09-15) wins over the requested period (2026-01).
  assert.equal(document.title, 'Báo cáo thị trường sản phẩm Synthetic jar · Quý 3 năm 2026');
  assert.equal(text(cover.querySelector('h1')), 'Báo cáo thị trường sản phẩm Synthetic jar');
  assert.equal(text(cover.querySelector('.cv-quarter')), 'Quý 3 năm 2026');
  assert.equal(text(cover.querySelector('.cv-period')), 'Dữ liệu từ 17/08/2026 đến 15/09/2026');
  assert.equal(cover.querySelector('.cv-eyebrow, .cv-lede'), null);
  assert.equal(text(cover.querySelector('.cv-meta')), 'Việt Nam');
  assert.doesNotMatch(text(cover.querySelector('.cv-left')), /bản nháp|\bmục\b|mẫu|phân loại|\d+ ngày|2026-/iu);
  assert.doesNotMatch(document.body.textContent ?? '', /Bản nháp từ nguồn|Bản thu từ truy vấn nguồn|Bản thu dữ liệu nguồn/u);
  assert.doesNotMatch(text(document.querySelector('footer')), /bản nháp/iu);
  assert.match(text(document.querySelector('footer')), /đề xuất, chờ chủ duyệt/u);
  const sources = document.querySelector('.market14-sources')!;
  assert.equal(text(sources.querySelector('.ext')), 'Nguồn số liệu');
  assert.deepEqual([...sources.querySelectorAll('ul.pl-srclist > li')].map(text), ['Dữ liệu bán hàng trên Shopee', 'Dữ liệu bán hàng trên TikTok Shop']);
  assert.equal(sources.querySelector('table'), null, 'no status table');
  assert.match(text(sources), /Báo cáo chưa có dữ liệu đánh giá sản phẩm, kết quả tìm kiếm trên web, dữ liệu bình luận của khách/u);
  const note = sources.nextElementSibling!;
  assert.equal(note.outerHTML, '<p class="ex-note"><b>Chú thích:</b> Mọi hình và bảng được dựng tự động từ cùng một bộ dữ liệu đã lưu. Chi tiết kỹ thuật của từng nguồn nằm trong hồ sơ kỹ thuật riêng, không in trong bản đọc.</p>');
  const glossary = document.querySelector('.market14-glossary')!;
  assert.equal(text(glossary.querySelector('.ext')), 'Thuật ngữ và chữ viết tắt');
  assert.ok(glossary.querySelector('table[data-glossary="true"]'));
  assert.doesNotMatch(text(glossary), /%/u);
  const links = [...cover.querySelectorAll<HTMLAnchorElement>('.toc a')];
  assert.equal(links.length, 13);
  for (const link of links) assert.ok(document.getElementById(link.hash.slice(1)), link.hash);
  assert.equal(document.querySelector('#M13 details, #quote-method-evidence, #bounded-method-evidence'), null);
  assert.doesNotMatch(document.body.textContent ?? '', /manifest|audit|capture|pipeline|fixture|\bSHA|sha256|\b(?:ALL|WIDE|CORE)\b|\bM0\d\b|\bM1[0-3]\b/iu);
  assert.doesNotThrow(() => assertMarket14MachineRules(html));
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true }));
  assert.ok(lintVisibleReportText(html).every(check => check.ok));
  assert.deepEqual(providerNameViolations(html), []);
});

test('a fallback cover renders but stays a READ; INSIGHT and non-presentation Market ignore the cover', async () => {
  const input = await presentationInput();
  const fallback = await buildMarketCover({ keyword: 'synthetic jar' });
  const html = buildResearchAutomationReport({ ...input, marketCover: coverInput(fallback, 'synthetic jar') }, 'MARKET').html.toString('utf8');
  assert.match(html, /data-cover-provenance="fallback"/);
  assert.doesNotMatch(html, /data-cover-model/);
  assert.equal(auditMarket14(html).find(item => item.rule === '10')!.ok, false);
  const { marketPresentation: _p, marketPresentationCharts: _c, ...legacy } = input;
  const legacyHtml = buildResearchAutomationReport({ ...legacy, marketCover: coverInput(fallback, 'synthetic jar') } as AutomationReportInput, 'MARKET').html.toString('utf8');
  assert.doesNotMatch(legacyHtml, /<img|cv-art/);
});


test('cover quarters count inclusive data days, break ties toward the later quarter, and disclose a missing sample', async () => {
  const input = await presentationInput();
  const metric = input.marketPresentation!.input.metric!;
  for (const [start, end, quarter, range] of [
    ['2025-10-01', '2026-09-30', 'Quý 3 năm 2026', 'Dữ liệu từ 01/10/2025 đến 30/09/2026'],
    ['2026-03-31', '2026-04-01', 'Quý 2 năm 2026', 'Dữ liệu từ 31/03/2026 đến 01/04/2026'],
    // 18 days in quarter 3 and 12 in quarter 4: the cover names quarter 3.
    ['2026-09-13', '2026-10-12', 'Quý 3 năm 2026', 'Dữ liệu từ 13/09/2026 đến 12/10/2026'],
    ['2026-01-01', '2026-03-31', 'Quý 1 năm 2026', 'Dữ liệu từ 01/01/2026 đến 31/03/2026'],
    ['2026-03-31', '2026-03-31', 'Quý 1 năm 2026', 'Dữ liệu từ 31/03/2026 đến 31/03/2026'],
    ['2026-03-30', '2026-04-01', 'Quý 1 năm 2026', 'Dữ liệu từ 30/03/2026 đến 01/04/2026'],
    ['2026-12-31', '2027-01-01', 'Quý 1 năm 2027', 'Dữ liệu từ 31/12/2026 đến 01/01/2027'],
    ['2024-02-29', '2024-02-29', 'Quý 1 năm 2024', 'Dữ liệu từ 29/02/2024 đến 29/02/2024'],
  ] as const) {
    const scoped = { ...metric, input: { ...metric.input, scope: { ...metric.input.scope, start, end } } };
    assert.deepEqual(marketReportQuarter({ ...input, marketPresentation: { ...input.marketPresentation!, input: { ...input.marketPresentation!.input, metric: scoped } } }), { quarter, range });
  }
  const marketPresentation = buildAutomationMarketPresentation({ ...input.marketPresentation!.binding, metric: null }, { metric: null, rows: [], unitSpec: null });
  const missing = { ...input, marketPresentation, marketPresentationCharts: [] };
  assert.deepEqual(marketReportQuarter(missing), { quarter: 'Chưa xác định quý dữ liệu', range: 'Chưa có kỳ số liệu bán hàng hợp lệ' });
  const document = new JSDOM(buildResearchAutomationReport(missing, 'MARKET').html.toString()).window.document;
  assert.equal(document.querySelector('.cv-period')!.textContent, 'Chưa có kỳ số liệu bán hàng hợp lệ');
  assert.match(document.querySelector('#M02')!.textContent!, /Chưa có kỳ số liệu bán hàng hợp lệ/u);
  assert.doesNotMatch(document.querySelector('.cover')!.textContent! + document.querySelector('#M02')!.textContent!, /01\/01\/2026|30\/01\/2026|NaN/u);
  assert.equal(document.querySelectorAll('.market14-sources li').length, 0);
  assert.match(document.querySelector('.market14-sources')!.textContent!, /Báo cáo chưa có dữ liệu bán hàng/u);
  assert.doesNotMatch(document.querySelector('.market14-sources')!.textContent!, /\b0\b/u);
});

test('cover rejects impossible, missing and reversed sample dates without using the requested range as data', async () => {
  const input = await presentationInput();
  const metric = input.marketPresentation!.input.metric!;
  const missing = { quarter: 'Chưa xác định quý dữ liệu', range: 'Chưa có kỳ số liệu bán hàng hợp lệ' };
  for (const [start, end] of [
    ['2026-13-01', '2026-13-30'], ['2026-02-30', '2026-03-01'], ['2026-02-29', '2026-03-01'],
    ['2026-00-01', '2026-01-01'], ['2026-01-00', '2026-01-01'], ['2026-09-01', '2026-08-01'],
    ['', '2026-09-01'], ['2026-09-01', ''], ['invalid', 'invalid'], ['<b>&', '<b>&'], [undefined, undefined],
  ]) {
    const scoped = { ...metric, input: { ...metric.input, scope: { ...metric.input.scope, start, end } } };
    const invalid = { ...input, marketPresentation: { ...input.marketPresentation!, input: { ...input.marketPresentation!.input, metric: scoped } } } as AutomationReportInput;
    assert.deepEqual(marketReportQuarter(invalid), missing);
    assert.deepEqual(marketReportQuarter({ ...invalid, metricMethods: { result: metric } } as AutomationReportInput), marketReportQuarter(input), 'a valid stored method scope is still usable');
  }
  const marketPresentation = buildAutomationMarketPresentation({ ...input.marketPresentation!.binding, metric: null }, { metric: null, rows: [], unitSpec: null });
  for (const requestedPeriod of [
    { startDate: 'invalid', endDate: 'invalid', dayCount: 30 },
    { startDate: '2026-09-01', endDate: '2026-08-01', dayCount: 30 },
    { dayCount: 30 },
  ]) {
    const noSample = { ...input, marketPresentation, marketPresentationCharts: [], start: { ...input.start, requestedPeriod } } as AutomationReportInput;
    const document = new JSDOM(buildResearchAutomationReport(noSample, 'MARKET').html.toString()).window.document;
    assert.equal(document.querySelector('.cv-quarter')!.textContent, missing.quarter);
    assert.equal(document.querySelector('.cv-period')!.textContent, missing.range);
    assert.doesNotMatch(document.querySelector('.cover')!.textContent! + document.querySelector('#M02')!.textContent!, /NaN|undefined|invalid/u);
  }
});

test('cover capitalizes Vietnamese and escapes product text in the heading and document title', async () => {
  const input = await presentationInput();
  const html = buildResearchAutomationReport({ ...input, start: { ...input.start, keyword: '  đèn <b> & "ấm"  ' } }, 'MARKET').html.toString();
  const document = new JSDOM(html).window.document;
  assert.equal(document.querySelector('.cover h1')!.textContent, 'Báo cáo thị trường sản phẩm Đèn <b> & "ấm"');
  assert.equal(document.title, 'Báo cáo thị trường sản phẩm Đèn <b> & "ấm" · Quý 3 năm 2026');
  assert.equal(document.querySelector('.cover h1 b'), null);
});

test('removing the source table preserves frozen semantic bytes and keeps only cited sources in the reader register', async () => {
  const input = await presentationInput();
  const captures = [null, { startDate: '2026-01-01', endDate: '2026-01-30' }].map((window, index) => ({
    stepId: 'COLLECTION' as const, ordinal: index + 1, artifactSha256: String(index + 1).repeat(64), mediaType: 'application/json',
    provider: 'synthetic', operation: 'synthetic.query', retrievedAt: '2026-01-31T00:00:00.000Z', window, truncated: false,
  }));
  const built = buildResearchAutomationReport({ ...input, captures }, 'MARKET');
  // Frozen at e0754a3b: includes the source-table-only capture and the original metadata of the shared capture.
  // Only the citation fields are pinned; reader delivery rewrites the market14 section wording.
  const { citations, citationEntries, captures: storedCaptures } = built.semantic as Record<string, unknown>;
  assert.equal(createHash('sha256').update(canonicalJson({ citations, citationEntries, captures: storedCaptures })).digest('hex'), '04bb0bbc89d7b12021d14fd7ae28fcadb3e12ecc44095b8e3f6de395ca246946');
  const document = new JSDOM(built.html.toString()).window.document;
  assert.equal(document.querySelector('template[data-market14-source-trace]'), null);
  assert.doesNotMatch(document.querySelector('#M13')!.textContent!, /Bản thu từ truy vấn nguồn/u);
  const cited = [...new Set([...document.querySelectorAll('sup.cite')].map(node => node.textContent))];
  const registered = [...document.querySelectorAll('.citation-register .cite-number')].map(node => node.textContent);
  assert.deepEqual(registered, cited);
  // The source capture is cited only inside the M02 trace block that reader delivery removes.
  assert.deepEqual(registered, Array.from({ length: 4 }, (_, index) => `[${index + 1}]`));
  assert.match(built.traceHtml!.toString(), /Bản thu dữ liệu nguồn/u);
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html.toString()));
});
