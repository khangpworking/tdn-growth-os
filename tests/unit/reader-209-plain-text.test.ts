import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import type { AutomationMarketMethodSnapshot } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { metricMethodSection } from '../../src/modules/analysis/research-automation/metric-method-report.js';
import { quoteMethodSection } from '../../src/modules/analysis/research-automation/quote-method-report.js';
import type { AutomationQuoteMethodSnapshot } from '../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import {
  formatReaderNumber, formatReaderValue, readerDateBasis, readerJsonLiteral, readerLocator, readerMeasureName,
  readerExactNumber, readerMethodName, readerPriceState, readerProductLabel, readerQuoteLabel, readerQuotePriceState,
  readerQuoteRange, readerQuoteValueState, readerScopeText,
} from '../../src/modules/analysis/research-automation/reader-plain-text.js';
import { descriptiveMarketFixture } from '../helpers/descriptive-market-fixture.js';

test('reader plain text formats exact numbers without float conversion', () => {
  assert.equal(formatReaderNumber('85991856.58', 'money'), '85.991.857');
  assert.equal(formatReaderNumber('183248.41', 'money'), '183.248');
  assert.equal(formatReaderNumber('127792.55', 'decimal'), '127.792,55');
  assert.equal(formatReaderNumber('9007199254740993.25', 'money'), '9.007.199.254.740.993');
  assert.equal(formatReaderNumber('-1234567.5', 'money'), '-1.234.568');
  assert.equal(formatReaderNumber('1.235', 'decimal'), '1,24');
  assert.equal(formatReaderNumber('9.999', 'decimal'), '10');
  assert.equal(formatReaderNumber('0.995', 'decimal'), '1');
  assert.equal(formatReaderNumber('-0.004', 'decimal'), '0');
  assert.equal(formatReaderNumber('1.2e5', 'decimal'), '120.000');
  assert.equal(formatReaderNumber('-3E-2', 'decimal'), '-0,03');
  assert.equal(formatReaderNumber('9.999', 'money'), '10');
  assert.equal(formatReaderNumber('9.999', 'count'), '10');
  assert.equal(formatReaderNumber('0', 'count'), '0');
  assert.equal(formatReaderNumber(null, 'money'), null);
  assert.equal(formatReaderValue('7082', { measure: 'sales_volumn' }), '7.082');
  assert.equal(formatReaderValue('111598280.07', { measure: 'revenue', unit: 'VND' }), '111.598.280');
});

test('reader plain text maps measures, JSON literals, prices, scope and locators', () => {
  assert.equal(readerMeasureName('revenue'), 'Doanh thu');
  assert.equal(readerMeasureName('sales_volumn'), 'Sản lượng bán');
  assert.equal(readerMeasureName('sales_volume'), 'Sản lượng bán');
  assert.equal(readerMeasureName('untrusted_field'), 'chỉ số nguồn');
  assert.equal(readerJsonLiteral('{"revenue":111598280.07}'), 'Doanh thu: 111.598.280');
  assert.equal(readerJsonLiteral('{"revenue":9007199254740993.25}'), 'Doanh thu: 9.007.199.254.740.993');
  assert.equal(readerJsonLiteral('{"sales_volumn":7082}'), 'Sản lượng bán: 7.082');
  assert.equal(readerJsonLiteral('{"launch_date":"2024-08-31"}'), 'ngày ra mắt do nguồn khai báo: 2024-08-31');
  assert.equal(readerJsonLiteral('{"broken": [1, 2]}'), 'Giá trị nguồn được giữ trong bản lưu');
  assert.equal(readerPriceState('NON_EXACT'), 'giá ước tính, chưa chính xác tuyệt đối');
  assert.equal(readerPriceState('REPORTED_NON_EXACT'), 'nguồn ghi giá không chính xác tuyệt đối');
  assert.equal(readerPriceState('RANGE'), 'khoảng giá');
  assert.equal(readerPriceState('MISSING'), 'không có giá');
  assert.equal(readerPriceState('UNREADABLE'), 'không đọc được giá');
  assert.equal(readerPriceState('OBSERVED_ZERO'), 'giá ghi nhận bằng 0');
  assert.equal(readerPriceState('EXACT'), 'giá chính xác');
  assert.equal(readerPriceState('FUTURE'), 'trạng thái giá chưa rõ');
  assert.equal(readerQuoteLabel('capture-12-unit-price', 1), 'Bản ghi giá #12 · giá đơn vị');
  assert.equal(readerQuoteLabel('capture-40-price-range', 1), 'Bản ghi giá #40 · khoảng giá');
  assert.equal(readerQuotePriceState('LISTED'), 'giá niêm yết');
  assert.equal(readerQuoteValueState('UNKNOWN'), 'chưa rõ');
  assert.equal(readerQuoteRange('127792.55', '132237.87', 'VND'), '127.793 đến 132.238');
  assert.equal(readerExactNumber('9007199254740993'), '9.007.199.254.740.993');
  assert.equal(readerScopeText('Source-declared M05 observation scope; not a market universe.'), 'Phạm vi quan sát do nguồn khai báo; không phải toàn bộ thị trường.');
  assert.equal(readerScopeText('Source text not approved'), 'Phạm vi và nội dung được giữ trong bản lưu nguồn');
  assert.equal(readerScopeText('Synthetic area'), 'Phạm vi và nội dung được giữ trong bản lưu nguồn');
  assert.equal(readerLocator('/data/revenue'), 'mục Doanh thu');
  assert.equal(readerLocator('/data/sales_volumn'), 'mục Sản lượng bán');
  assert.equal(readerLocator('/data/launch_date'), 'mục dữ liệu nguồn');
  assert.equal(readerMethodName('M05'), 'Nhu cầu');
  assert.equal(readerDateBasis('Ngày do nguồn khai báo tại launch_date, không phải ngày thu thập.'), 'Ngày do nguồn khai báo (ngày ra mắt theo nguồn), không phải ngày thu thập.');
  assert.equal(readerProductLabel('kalodata:sku_101', 'Bình giữ nhiệt tổng hợp'), 'Bình giữ nhiệt tổng hợp');
  assert.equal(readerProductLabel('123456', null, 2), 'Sản phẩm #2');
});

test('visible reader text uses quote and metric render paths without raw IDs or states', () => {
  const sourceSha256 = 'a'.repeat(64);
  const quoteInput = {
    quoteId: 'capture-12-unit-price', source: { sourceSha256, locator: '/offer/price', fieldPointer: '/offer/price' }, acquiredAt: '2026-01-01T00:00:00Z', observedAt: null,
    identity: { variantId: null, variantState: 'UNKNOWN' }, offerText: null, packText: '1 item',
    price: { value: '85991856.58', range: null, currency: 'VND', priceState: 'LISTED', conditions: [], tax: 'UNKNOWN', shipping: 'UNKNOWN' },
  };
  const available = { status: 'AVAILABLE', basis: 'SOURCED', reasons: [], exact: { numerator: '1234567', denominator: '100' }, display: '1234567.89' };
  const quoteSnapshot = { output: { input: { quotes: [quoteInput] }, quotes: [{ ...Object.fromEntries([
    ['pricePerPurchasedPack', available], ['pricePerPhysicalItem', available], ['pricePer100gNet', available], ['pricePer100gDrained', available],
  ]) }] }, sourceMetadata: [{ sha256: sourceSha256, path: '', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic source' }] } as unknown as AutomationQuoteMethodSnapshot;
  const quoteHtml = quoteMethodSection(quoteSnapshot, { mark: () => '[1]' });
  assert.match(quoteHtml, /Bản ghi giá #12/);
  assert.match(quoteHtml, /85\.991\.857 VND/);
  assert.match(quoteHtml, /1\.234\.567,89/);
  assert.doesNotMatch(quoteHtml, /capture-12|UNKNOWN|1234567/);

  const metricResult = calculateMetricScopes(metricFixture());
  const metricInput = { ...metricResult.input, records: metricResult.input.records.map((row, index) => index === 0 ? { ...row, listingId: '123456', shopId: '987654', title: '' } : row) };
  const metricSnapshot = { result: { ...metricResult, input: metricInput }, readiness: { sections: [{ sectionId: 'M03', state: 'BLOCKED' }, { sectionId: 'M04', state: 'BLOCKED' }] }, limitations: [], originalSourcePackage: { manifestArtifactSha256: 'b'.repeat(64) }, preparation: { normalizationReceiptSha256: 'c'.repeat(64) } } as unknown as AutomationMetricMethodSnapshot;
  const metricHtml = metricMethodSection(metricSnapshot, 'M03', undefined, { mark: () => '[1]' });
  assert.match(metricHtml, /Sản phẩm #1/);
  assert.match(metricHtml, /Gian hàng #1/);
  assert.match(metricHtml, /chưa rõ/);
  assert.doesNotMatch(metricHtml, /123456|987654|UNKNOWN/);
});

function inventory(): AutomationMarketMethodSnapshot {
  const source = { sourceSha256: 'a'.repeat(64), fieldPointer: '/data/revenue' };
  return {
    contractVersion: 'automation-market-method-snapshot-v1', runId: '11111111-1111-4111-8111-111111111111',
    sourcePackage: {} as AutomationMarketMethodSnapshot['sourcePackage'], mappingRevision: 'kalodata-product-detail-market-inventory-v1',
    sourceRequirements: { temporal: [], quotes: [] },
    temporal: { input: { observations: [
      { subjectMemberKeys: ['kalodata:sku_101'], measure: { literal: 'revenue', unit: null, currency: 'VND' }, value: { literal: '{"revenue":111598280.07}' }, requestedWindow: { start: '2026-01-01', end: '2026-01-31' }, source,
      },
      { subjectMemberKeys: ['kalodata:sku_101'], measure: { literal: 'sales_volumn', unit: 'units', currency: null }, value: { literal: '{"sales_volumn":7082}' }, requestedWindow: { start: '2026-01-01', end: '2026-01-31' }, source,
      },
    ] } } as AutomationMarketMethodSnapshot['temporal'],
    quotes: { input: { quotes: [
      { quoteId: 'capture-12-unit-price', price: { value: '85991856.58', range: null, currency: 'VND', state: 'NON_EXACT' }, source },
      { quoteId: 'capture-40-price-range', price: { value: null, range: { minimum: '127792.55', maximum: '132237.87' }, currency: 'VND', state: 'RANGE' }, source },
    ] } } as AutomationMarketMethodSnapshot['quotes'],
  } as AutomationMarketMethodSnapshot;
}

test('Market HTML hides machine literals in visible text while retaining technical details', () => {
  const fixture = descriptiveMarketFixture();
  const descriptor = {
    ...fixture.descriptor,
    scope: { ...fixture.descriptor.scope, universe: 'Source-declared M05 observation scope; not a market universe.' },
    m05: fixture.descriptor.m05.map(row => ({ ...row, scope: { ...row.scope, universe: 'Source-declared M05 observation scope; not a market universe.' }, sourceWording: '{"sales_volumn":7082}', measureLiteral: 'sales_volumn', unit: 'units', observation: { ...row.observation, value: '7082' } })),
    m09: [{
      source: fixture.descriptor.m05[0]!.source, statementType: 'UNCLASSIFIED' as const, sourceWording: '{"launch_date":"2024-08-31"}', attribution: 'Synthetic source',
      publicationDate: '2024-08-31', eventDate: '2024-08-31', dateBasis: 'Ngày do nguồn khai báo tại launch_date, không phải ngày thu thập hoặc kỳ đo lường.',
      namedScope: 'Synthetic product', targetLink: null, affectedMetricLiteral: 'revenue', conflictRefs: [],
    }],
  };
  const methods = buildDescriptiveMarketMethods({ ...descriptor, sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) } }, { methodVersion: '1.1.0' }).output;
  const runId = '11111111-1111-4111-8111-111111111111';
  const product = { productId: 'kalodata:sku_101', provider: 'kalodata', sourceProductId: '101', role: 'PRINCIPAL' as const, title: 'Bình giữ nhiệt tổng hợp', sourceUrl: null, imageUrl: null, description: null, descriptionState: 'EMPTY' as const, observedWindow: null, retrievedAt: '2026-02-01T00:00:00.000Z' };
  const sourceEvidence = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const input = {
    run: { contractVersion: 'research-automation-run-v1' as const, runId, workspaceId: '22222222-2222-4222-8222-222222222222', revision: 1, status: 'RENDERING' as const, country: 'VN' as const, mode: 'CATEGORY' as const, keyword: 'synthetic', description: null, interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 }, reports: ['MARKET'] as ['MARKET'], definition: null, productCards: [product], coverage: { requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 }, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' },
    start: { contractVersion: 'research-automation-start-snapshot-v1' as const, workspaceId: '22222222-2222-4222-8222-222222222222', country: 'VN' as const, mode: 'CATEGORY' as const, keyword: 'synthetic', description: null, interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31', dayCount: 31 }, reports: ['MARKET'] as ['MARKET'], sourceEvidenceVersion: 'automation-source-evidence-v1' as const },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1' as const, workspaceId: '22222222-2222-4222-8222-222222222222', runId, definition: 'Synthetic', includeTerms: [], excludeTerms: [], selectedProductIds: ['kalodata:sku_101'], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1' as const, runId, stepId: 'COLLECTION' as const, outcome: 'SUCCEEDED' as const, productCards: [product], comparables: [], coverage: [], limitations: [] }, captures: [], sourceEvidence, descriptiveMethods: methods, marketInventory: inventory(),
  } as Parameters<typeof buildResearchAutomationReport>[0];
  const document = new JSDOM(buildResearchAutomationReport(input, 'MARKET').html.toString()).window.document;
  for (const selector of ['details', 'script', 'style']) document.querySelectorAll(selector).forEach(node => node.remove());
  const visible = document.body.textContent ?? '';
  assert.doesNotMatch(visible, /\{"[a-z_]+":/);
  assert.doesNotMatch(visible, /\b[a-z]+_[a-z_]+\b/);
  assert.doesNotMatch(visible, /\b[A-Z]{2,}_[A-Z_]+\b/);
  assert.deepEqual(visible.match(/\b\d{5,}(\.\d+)?\b/g) ?? [], [], 'visible large-number leaks');
  assert.doesNotMatch(visible, /capture-\d+/);
  assert.doesNotMatch(visible, /\/data\//);
  assert.doesNotMatch(visible, /UNKNOWN/);
  assert.doesNotMatch(visible, /Source-declared M05 observation scope; not a market universe\./);
  assert.match(visible, /Doanh thu: 111\.598\.280/);
  assert.match(visible, /Sản lượng bán: 7\.082/);
  assert.match(visible, /Bản ghi giá #12 · giá đơn vị/);
  assert.match(visible, /85\.991\.857 VND/);
  assert.match(visible, /ngày ra mắt do nguồn khai báo: 2024-08-31/);
  assert.match(visible, /Chỉ số nêu: Doanh thu/);
  assert.match(visible, /Phạm vi quan sát do nguồn khai báo; không phải toàn bộ thị trường\./);
});
