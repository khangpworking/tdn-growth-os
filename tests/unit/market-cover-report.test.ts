import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildMarketCover, marketCoverAlt, MARKET_COVER_MODEL } from '../../src/modules/analysis/research-automation/market-cover.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
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
  assert.equal(img.nextElementSibling?.className, 'cv-eyebrow');
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
