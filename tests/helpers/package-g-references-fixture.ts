import { createHash } from 'node:crypto';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { CitationRegistry, type CitationInput } from '../../src/modules/analysis/citation-registry.js';
import { renderCitationMarkOrMissing, renderCitationRegister } from '../../src/modules/analysis/citation-register-html.js';
import { buildAutomationMarketPresentation, marketPresentationDigest } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import type { CaptureRecord, TypedComparable } from '../../src/modules/analysis/research-automation/model.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import type { PdfExcerpt } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { businessInput, businessMonthlyCaptures } from './package-r-business-fixture.js';
import { periodInventory } from './package-e-period-fixture.js';
import { gOfficial } from './package-g-evidence-fixture.js';

export const REFERENCE_SHAPES = ['Q1', 'Q2', 'Q3'] as const;
export type ReferenceShape = typeof REFERENCE_SHAPES[number];
export const REFERENCE_CLOCK = '2026-10-19T00:00:00.000Z';
export const REFERENCE_DAY = '19/10/2026';
export const REFERENCE_LABEL = 'Bản thu dữ liệu nguồn';
export const REFERENCE_BRAND = '<div class="brand"><i></i><b>TDN GROWTH OS</b></div>';
export const REFERENCE_LONG_URL = 'https://example.invalid/' + '%E1%BA%A3nh-t%C6%B0-li%E1%BB%87u-'.repeat(12) + '%3Cph%E1%BB%A5-l%E1%BB%A5c%3E';
// Existing main quarter policy, counted inclusively, independently of the candidate.
export const REFERENCE_EXPECTED = {
  Q1: { start: '2026-09-04', end: '2026-10-03', days: 30, split: [27, 3], quarter: 'Quý 3 năm 2026',
    range: 'Dữ liệu từ 04/09/2026 đến 03/10/2026', identities: 3, title: 'Tư liệu mẫu HS <b> & "A"',
    keyword: 'Nhóm vật dụng tổng hợp dùng để khảo sát các quy cách và điều kiện chào bán trong mẫu',
    glossary: ['CPI', 'USD', 'VND', 'HS'], quoteOnly: 'HS' },
  Q2: { start: '2026-12-17', end: '2027-01-15', days: 30, split: [15, 15], quarter: 'Quý 1 năm 2027',
    range: 'Dữ liệu từ 17/12/2026 đến 15/01/2027', identities: 1, title: 'Tư liệu mẫu "B" & <i>',
    keyword: 'Nhóm vật dụng mẫu B', glossary: ['VND'], quoteOnly: 'NSX' },
  Q3: { start: '2026-07-02', end: '2026-07-31', days: 30, split: [30], quarter: 'Quý 3 năm 2026',
    range: 'Dữ liệu từ 02/07/2026 đến 31/07/2026', identities: 1, title: 'Vật dụng mẫu C',
    keyword: 'Nhóm vật dụng mẫu C', glossary: ['VND'], quoteOnly: 'NSX' },
} as const;
export const referenceIdentity = (index: number) => createHash('sha256').update(`synthetic reference ${index}`).digest('hex');

/** Exercise the existing registry/renderers to specify the input identity semantics.
 * Expectations in the unit file are literal counts, never read from this oracle.
 */
export function referenceRegistryFixture(shape: ReferenceShape) {
  const registry = new CitationRegistry();
  const entry = (index: number, locator: CitationInput['locator'] = null): CitationInput => ({
    sourceKind: 'CAPTURE', identity: referenceIdentity(index), label: REFERENCE_LABEL,
    retrievedAt: REFERENCE_CLOCK, locator, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
  });
  const identities = Array.from({ length: REFERENCE_EXPECTED[shape].identities }, (_, i) => registry.cite(entry(i + 1)));
  const locators = shape === 'Q1' ? [registry.cite(entry(1, '/data/revenue')), registry.cite(entry(1, '/data/sales_volumn'))] : [];
  return { entries: registry.entries(), trace: registry.technicalTrace(),
    marks: [...identities, ...locators].map(renderCitationMarkOrMissing),
    register: renderCitationRegister(registry.entries(), { format: 'web' }) };
}

const inherited: Partial<Record<ReferenceShape, Promise<AutomationReportInput>>> = {};
/** Full checked Market fixture through the R-business helper (which reuses market14-full-fixture).
 * E's retained monthly series stays in Q1. Q2 and Q3 deliberately omit tracked series.
 * Reuse G-evidence's neutral retained official-file inputs without changing G assertions.
 */
export async function referenceInput(shape: ReferenceShape): Promise<AutomationReportInput> {
  const base = structuredClone(await (inherited[shape] ??= businessInput(shape === 'Q1' ? 'P1' : 'P2')));
  const expected = REFERENCE_EXPECTED[shape];
  const rescope = (result: NonNullable<AutomationReportInput['metricMethods']>['result']) => calculateMetricScopes({
    ...result.input, scope: { ...result.input.scope, start: expected.start, end: expected.end, acquiredAt: REFERENCE_CLOCK },
    records: result.input.records.map(record => ({ ...record,
      measurement: { ...record.measurement, start: expected.start, end: expected.end } })),
  });
  const result = rescope(base.metricMethods!.result);
  const capture = base.metricMethods!.capture!;
  const metricMethods = { ...base.metricMethods!, result, capture: { ...capture,
    platforms: capture.platforms.map(value => ({ ...value, result: rescope(value.result) })),
    capture: { ...capture.capture, measurementPeriod: { startDate: expected.start, endDate: expected.end } },
    ...(shape === 'Q1' ? { platformHeadlines: [
      { platform: 'shopee' as const, revenue: { value: '8400000', precision: 'exact' as const, locator: '/data/revenue' },
        units: { value: '84', precision: 'exact' as const, locator: '/data/revenue' } },
      { platform: 'tiktok' as const, revenue: { value: '9600000', precision: 'exact' as const, locator: '/data/sales_volumn' }, units: null },
    ] } : {}),
  } };
  const rows = base.marketPresentation!.input.rows.map((row, index) => ({ ...row,
    title: index === 0 ? expected.title : `Vật dụng mẫu ${index + 1}`, brand: '', shopName: `Cửa hàng mẫu ${index % 3 + 1}` }));
  const binding = { ...base.marketPresentation!.binding, metric: { ...base.marketPresentation!.binding.metric!, resultSha256: marketPresentationDigest(result) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { ...base.marketPresentation!.input, metric: result, rows });
  const window = { startDate: expected.start, endDate: expected.end };
  const ids = Array.from({ length: expected.identities }, (_, i) => `sample-source-${i + 1}`);
  const captures: CaptureRecord[] = ids.map((_, index) => ({ ordinal: 81 + index, stepId: 'COLLECTION',
    artifactSha256: referenceIdentity(index + 1), mediaType: 'application/json', provider: 'synthetic',
    operation: 'synthetic.sample', retrievedAt: REFERENCE_CLOCK, window, truncated: false }));
  const comparables: TypedComparable[] = ids.flatMap((productId, index) => [
    { productId, provider: 'synthetic', metric: 'UNITS_SOLD' as const, value: String(11 + index), window, captureIndex: 81 + index },
    ...(shape === 'Q2' ? [{ productId, provider: 'synthetic', metric: 'UNITS_SOLD' as const, value: '23', window, captureIndex: 81 }] : []),
  ]);
  const { descriptiveMethods, marketInventory, ...withoutSeries } = base;
  const { searchInterest, searchGeo, worldBank, comtrade, officialStats, exactShopee, exactShopeeOutcome, ...collection } = base.collection!;
  const q1Collection = shape === 'Q1' ? { searchInterest, searchGeo, worldBank,
    comtrade: { ...comtrade!, officialDescription: 'Hàng tổng hợp', descriptionVi: 'Hàng tổng hợp' },
    officialStats: { ...officialStats!, files: gOfficial('G1').files },
    webResults: [{ position: 1, title: expected.title, site: 'Trang tư liệu mẫu', snippet: 'Tư liệu tổng hợp.',
      url: REFERENCE_LONG_URL, retrievedAt: REFERENCE_CLOCK, captureIndex: 81 }] } : { webResults: [] };
  return { ...withoutSeries, metricMethods, marketPresentation,
    ...(shape === 'Q1' ? { descriptiveMethods, marketInventory: periodInventory(businessMonthlyCaptures()) } : {}),
    run: { ...base.run, createdAt: REFERENCE_CLOCK },
    start: { ...base.start, keyword: expected.keyword,
      requestedPeriod: shape === 'Q1' ? { startDate: '2025-01-01', endDate: '2026-10-31', dayCount: 669 }
        : { startDate: expected.start, endDate: expected.end, dayCount: expected.days } },
    scope: { ...base.scope, definition: shape === 'Q2' ? 'Phạm vi Mai của mẫu tổng hợp.' : 'Phạm vi mẫu tổng hợp.',
      selectedProductIds: [...base.scope.selectedProductIds, ...ids], peerProductIds: [] },
    collection: { ...collection, ...q1Collection, comparables,
      productCards: [...collection.productCards, ...ids.map((productId, i) => ({ productId, title: `Vật dụng nguồn mẫu ${i + 1}` }))] },
    captures: [...base.captures, ...captures],
    // A fixed synthetic JPEG signature, using market-cover-report's existing offline cover input shape.
    marketCover: { mime: 'image/jpeg', base64: '/9j/2Q==', width: 1024, height: 576,
      provenance: 'ai-generated', model: null, alt: 'Hình minh họa tổng hợp của mẫu' },
  } as unknown as AutomationReportInput;
}

/** Companion public-builder input for locator preservation. PDF identity and page remain
 * distinct before the reader pass, unlike the current capture pointer display path.
 */
export function referencePdfInput(input: AutomationReportInput): AutomationReportInput {
  const excerpts: PdfExcerpt[] = [
    { sourceSha256: referenceIdentity(1), page: 4, text: 'Nội dung trích nguyên văn mẫu A.', label: 'Tài liệu tổng hợp mẫu, trang 4' },
    { sourceSha256: referenceIdentity(1), page: 5, text: 'Nội dung trích nguyên văn mẫu B.', label: 'Tài liệu tổng hợp mẫu, trang 5' },
  ];
  const packet = buildSourceEvidence({ draft: null, draftDigest: null,
    unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const sourceEvidence = sourceEvidenceForReport(packet,
    { collection: null, pdfExcerpts: excerpts } as Parameters<typeof sourceEvidenceForReport>[1], 'MARKET');
  return { ...input, start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' },
    sourceEvidence, pdfExcerpts: excerpts };
}
