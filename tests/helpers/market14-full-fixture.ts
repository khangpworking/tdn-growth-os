import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import { renderComtradeCharts, renderWorldBankCharts } from '../../src/modules/analysis/reader-report/macro-charts.js';
import { renderMarketCharts, renderSearchInterestChart } from '../../src/modules/analysis/reader-report/market-charts.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import type { CaptureRecord, StepComtrade, StepComtradeRow, StepOfficialStats, StepWorldBank, StepWorldBankIndicator } from '../../src/modules/analysis/research-automation/model.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { searchInterestChartPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { descriptiveMarketFixture } from './descriptive-market-fixture.js';
import { syntheticSearchGeo } from './search-geo-synthetic.js';
import { syntheticSearchInterest } from './search-interest-synthetic.js';
import { sync1ReaderFixture } from './sync1-reader-fixture.js';
import { unitPriceFixture } from './market-unit-price-fixture.js';

/** A synthetic Market run with every optional market14 block present: sample tables, capture method, descriptive methods, search, macro, trade and official statistics. */
const SHA = 'a'.repeat(64);
const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';

function indicator(code: string, name: string, series: readonly { year: string; value: string | null }[]): StepWorldBankIndicator {
  const last = series[series.length - 1]!;
  return { code, status: 'COLLECTED', reason: null, retrievedAt: '2026-01-01T00:00:00.000Z', captureIndex: 10, metadataCaptureIndex: 11, sourceSha256: SHA, metadataSha256: SHA,
    row: { indicatorName: name, value: last.value!, unit: null, year: last.year, lastUpdated: '2026-01-01', statusLiteral: '', footnote: null, locator: '/1/0' }, series };
}
const years = (from: number, values: readonly (string | null)[]) => values.map((value, i) => ({ year: String(from + i), value }));
export const fullWorldBank = (): StepWorldBank => ({ profile: 'p', indicators: [
  indicator('SP.POP.TOTL', 'Chỉ số tổng hợp A', years(2015, ['91000000', null, '93000000', '94000000', '95000000', '96000000', '97000000', '98000000', '99000000', '100300000'])),
  indicator('NE.CON.PRVT.PC.KD', 'Chỉ số tổng hợp B', years(2022, ['2000', '2050.5', '2100.5'])),
] });
const row = (side: 'OWN' | 'MIRROR', reporter: string, flow: 'M' | 'X', year: string, value: string): StepComtradeRow => ({ side, reporter, flow, year, value, captureIndex: 20 });
export const fullComtrade = (): StepComtrade => {
  const rows = [row('OWN', 'Nước C', 'M', '2023', '5130000'), row('OWN', 'Nước C', 'X', '2023', '1270000'), row('MIRROR', 'Nước A', 'X', '2023', '3410000'), row('MIRROR', 'Nước B', 'X', '2023', '1270000')];
  return { profile: 'comtrade-v1', status: 'OK', hsCode: '999999', officialDescription: 'Synthetic goods', descriptionVi: 'Hàng tổng hợp', reasonVi: null, attempts: [], calls: [], rows, mirrorReporterCount: 2 };
};
export const fullOfficialStats = (): StepOfficialStats => ({
  profile: 'official-stats-v1', status: 'OK', categoryGroup: 'Đồ uống', reasonVi: null, listCaptureIndex: null,
  files: [{ role: 'CPI', captureIndex: 30, sha256: SHA, title: 'Tệp giả lập', revised: false,
    url: 'https://www.nso.gov.vn/wp-content/uploads/2026/10/CPI-synthetic.xlsx', listedAt: '2026-10-01T00:00:00', retrievedAt: '2026-10-01T00:00:00.000Z' }],
  tables: [{ table: 'CPI_WORKBOOK', captureIndex: 30, outcome: 'READ', sheet: 'Cả nước', variant: 'binh-quan-luy-ke' }],
  values: [{ table: 'CPI_WORKBOOK', captureIndex: 30, sheet: 'Cả nước', row: 14, cell: 'C14', label: 'II. Đồ uống và thuốc lá',
    period: 'Tháng 9 năm 2026', measure: 'INDEX', unit: null, base: 'tháng trước', value: '102.25', shown: '102.25', status: 'NOT_STATED' }],
  provinces: { captureIndex: 30, outcome: 'READ', sheet: 'Địa phương', variant: 'thang-truoc', period: 'Tháng 9 năm 2026', base: 'tháng trước',
    provinces: ['Tỉnh A', 'Thành phố B'], values: [
      { row: 9, cell: 'B9', label: 'CHỈ SỐ GIÁ TIÊU DÙNG', province: 'Tỉnh A', value: '100.25', shown: '100.25' },
      { row: 9, cell: 'C9', label: 'CHỈ SỐ GIÁ TIÊU DÙNG', province: 'Thành phố B', value: '101.25', shown: '101.25' },
      { row: 11, cell: 'B11', label: 'II. Đồ uống và thuốc lá', province: 'Tỉnh A', value: '102.25', shown: '102.25' },
      { row: 11, cell: 'C11', label: 'II. Đồ uống và thuốc lá', province: 'Thành phố B', value: '103.25', shown: '103.25' },
    ] },
} as StepOfficialStats);

function metricMethods(): AutomationMetricMethodSnapshot {
  const result = calculateMetricScopes(metricFixture());
  return { contractVersion: 'automation-metric-method-snapshot-v2', runId, runBindingSha256: 'b'.repeat(64),
    sourcePackage: { packageId: 'synthetic-method-package', manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64) },
    originalSourcePackage: { packageId: 'synthetic-capture-package', manifestArtifactSha256: 'e'.repeat(64), packageContentSha256: 'f'.repeat(64) },
    preparation: { preparationSha256: '1'.repeat(64), normalizedInput: { rowCount: result.input.records.length }, selectedSources: {} },
    readiness: { sections: [{ sectionId: 'M03', state: 'BLOCKED' }, { sectionId: 'M04', state: 'BLOCKED' }] },
    result, limitations: ['CAPTURE_RESULTS_PAGE_TOP_N_LIMITED'],
    capture: { provenance: 'RESULTS_PAGE_CAPTURE', snapshotSha256: '2'.repeat(64), manifestSha256: '3'.repeat(64), contextSha256: '4'.repeat(64), descriptorSha256: '5'.repeat(64),
      platforms: [{ platform: 'shopee', result }, { platform: 'tiktok', result }], unattributedRows: [],
      capture: { captureId: 'capture-synthetic-209', keyword: 'synthetic jar', specDigest: '6'.repeat(64),
        measurementPeriod: { startDate: result.input.scope.start, endDate: result.input.scope.end },
        platforms: ['shopee', 'tiktok'], truncation: { cap: 200, totalShown: null, pagesRead: 1, rowsRead: result.input.records.length, truncated: false } } },
  } as unknown as AutomationMetricMethodSnapshot;
}

const capture = (ordinal: number): CaptureRecord => ({ stepId: 'COLLECTION', ordinal, artifactSha256: String(ordinal).repeat(64), mediaType: 'application/json', provider: 'synthetic-provider',
  operation: 'synthetic.trends', retrievedAt: '2026-10-02T00:00:01.000Z', window: null, truncated: false });

export async function fullMarket14Input(): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows, unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  const searchInterest = syntheticSearchInterest(), searchGeo = syntheticSearchGeo();
  const worldBank = fullWorldBank(), comtrade = fullComtrade(), officialStats = fullOfficialStats();
  const fixture = descriptiveMarketFixture();
  const descriptiveMethods = buildDescriptiveMarketMethods({ ...fixture.descriptor, sourcePackage: { packageId: '55555555-5555-4555-8555-555555555555', version: 1,
    manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) } }, { methodVersion: '1.1.0' }).output;
  const collection = { runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', comparables: [], productCards: [], webResults: [], coverage: [], limitations: [],
    searchInterest, searchGeo, worldBank, comtrade, officialStats };
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection, captures: [capture(1), capture(2)], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows),
    searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)),
    worldBankCharts: await renderWorldBankCharts(worldBank), comtradeCharts: await renderComtradeCharts(comtrade),
    metricMethods: metricMethods(), descriptiveMethods } as unknown as AutomationReportInput;
}
