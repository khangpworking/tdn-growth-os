import { createHash } from 'node:crypto';
import { buildDescriptiveMarketMethods } from '../../src/modules/analysis/descriptive-market-methods.js';
import type { RetainedKeywordListDraftRecord } from '../../src/modules/analysis/keyword-list-draft-record.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import type { CaptureRecord, StepComtrade, StepOfficialStats, StepSearchAds, StepWebResult, StepWorldBank } from '../../src/modules/analysis/research-automation/model.js';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { renderComtradeCharts, renderWorldBankCharts } from '../../src/modules/analysis/reader-report/macro-charts.js';
import { businessInput } from './package-r-business-fixture.js';
import { businessByteInput } from './package-r-business-byte-input.js';
import { fullComtrade, fullOfficialStats, fullWorldBank } from './market14-full-fixture.js';
import { descriptiveReaderFixture } from './descriptive-reader-fixture.js';
import { syntheticExpandedOrganic, syntheticExpandedSource, SYNTHETIC_SHARED_URL } from './expanded-search-synthetic.js';
import { syntheticSearchGeo } from './search-geo-synthetic.js';
import { worldBankFixture } from './world-bank-source-fixture.js';

export const G_SHAPES = ['G1', 'G2', 'G3'] as const;
export type GShape = typeof G_SHAPES[number];
export const G_CLOCK = '2026-10-19T00:00:00.000Z';
export const G_RETRIEVED = '2026-10-02T03:04:05.678Z';
export const G_QUOTED_TITLE = '/ Mẫu -- Shopee -- 7%';
export const G_FOOTNOTE = 'Ghi chú mẫu: số liệu có điều chỉnh phạm vi.';
export const G_MACRO_NAMES = ['Chỉ số mẫu toàn quốc (đơn vị mẫu)', 'Chỉ số mẫu B (đơn vị mẫu)'] as const;
export const G_OFFICIAL_LABELS = ['II. Nhóm mẫu A', 'III. Nhóm mẫu B'] as const;
export const G_SCOPE_LIMIT = 'Phạm vi mã hàng có thể rộng hơn nhóm sản phẩm đang xét.';
export const G_QUOTE_CONTEXTS = '<q id="g-q">Shopee <span>TikTok Shop</span></q>'
  + '<blockquote id="g-block"><span>Shopee</span> TikTok Shop</blockquote>'
  + '<div data-quote id="g-data"><span>Shopee <b>TikTok Shop</b></span></div>'
  + '<div data-quote id="g-nested"><span data-quote>Shopee</span> TikTok Shop</div>';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

/** Raw retained step shapes, independent of the proposed presentation implementation. */
export function gTrade(shape: Exclude<GShape, 'G3'>): StepComtrade {
  const base = fullComtrade();
  const year = shape === 'G1' ? '2022' : '2024';
  const mirror = shape === 'G1' ? ['6543210.75', '4321987.65', '1234567.89', '234567.45', '12.34']
    : ['7000000.4', '2000000.2', '1000000.1'];
  return { ...base, hsCode: shape === 'G1' ? '999999' : '888888',
    officialDescription: shape === 'G1' ? 'Synthetic commodity alpha' : 'Synthetic commodity beta',
    descriptionVi: shape === 'G1' ? 'Nhóm hàng mẫu' : null, reasonVi: G_SCOPE_LIMIT,
    rows: [
      { ...base.rows[0]!, year, value: '5130000.55' },
      { ...base.rows[1]!, year, value: '1270000.25' },
      ...mirror.map((value, i) => ({ ...base.rows[2]!, year: '2024', value,
        reporter: shape === 'G1' && i === 4 ? '999' : `Nước mẫu ${String.fromCharCode(65 + i)}` })),
    ], mirrorReporterCount: shape === 'G1' ? 7 : 3 };
}

export function gOfficial(shape: Exclude<GShape, 'G3'>): StepOfficialStats {
  const base = fullOfficialStats();
  const nationalIndex = shape === 'G1' ? 30 : 31;
  const provinceIndex = shape === 'G1' ? 30 : 32;
  const file = (captureIndex: number, listedAt: string) => ({ ...base.files[0]!, captureIndex,
    title: `Tệp mẫu ${captureIndex}`, url: `https://example.invalid/table-${captureIndex}.xlsx`,
    listedAt, retrievedAt: G_RETRIEVED, sha256: sha(`official-${captureIndex}`), revised: shape === 'G2' && captureIndex === 31 });
  return { ...base, categoryGroup: 'Nhóm mẫu',
    files: shape === 'G1' ? [file(30, '2026-10-01T00:00:00')]
      : [file(31, '2026-10-03T00:00:00'), file(32, '2026-10-08T00:00:00')],
    tables: base.tables.flatMap(table => shape === 'G1' ? [{ ...table, captureIndex: nationalIndex }]
      : [{ ...table, captureIndex: nationalIndex }, { ...table, captureIndex: provinceIndex }]),
    values: G_OFFICIAL_LABELS.map((label, i) => ({ ...base.values[0]!, label,
      captureIndex: shape === 'G2' && i ? provinceIndex : nationalIndex,
      row: 14 + i, cell: `C${14 + i}`, value: i ? '108.75' : '102.25', shown: i ? '108.75' : '102.25' })),
    provinces: { ...base.provinces!, captureIndex: provinceIndex,
      provinces: ['Tỉnh mẫu A', 'Tỉnh mẫu B'], values: base.provinces!.values.map((value, i) => ({ ...value,
        label: G_OFFICIAL_LABELS[Math.floor(i / 2)]!, province: i % 2 ? 'Tỉnh mẫu B' : 'Tỉnh mẫu A' })) } };
}

export function gMacro(shape: Exclude<GShape, 'G3'>): StepWorldBank {
  const base = fullWorldBank();
  return { ...base, indicators: base.indicators.map((indicator, i) => {
    // Reuse the retained endpoint-shape helper, without a transport or source request.
    const raw = worldBankFixture(indicator.code, ['123.5', '121.25', '120'], G_MACRO_NAMES[i]!);
    const records = (JSON.parse(raw.observations.toString()) as [unknown, { value: number; date: string }[]])[1];
    return { ...indicator, row: { ...indicator.row!, indicatorName: G_MACRO_NAMES[i]!, unit: 'điểm mẫu',
      value: '123.5', year: '2025', footnote: shape === 'G2' && i === 0 ? G_FOOTNOTE : i ? '' : null },
    series: records.map(record => ({ year: record.date, value: String(record.value) })).reverse() };
  }) };
}

export function gWeb(shape: GShape): StepWebResult[] {
  // Reuse the pure synthetic answers' positions and duplicate URL; never call collect().
  const answers = syntheticExpandedOrganic(new URL('https://example.invalid/?q=sample')) as { position: number; link: string }[];
  const kinds = shape === 'G1' ? [undefined, 'WINDOW', 'SHOPEE'] as const : [undefined];
  return kinds.flatMap((origin, group) => answers.filter(answer => answer.link !== SYNTHETIC_SHARED_URL).map((answer, i) => ({
    position: answer.position, title: shape === 'G1' && group === 0 && i === 0 ? G_QUOTED_TITLE
      : shape === 'G2' && i === 0 ? 'Mẫu TikTok Shop' : `Mẫu tin ${group + 1}-${i + 1}`,
    url: `https://example.invalid/tin-tuc/sample-${group}-${answer.position}`, snippet: 'Mẫu tin tổng hợp', site: 'Trang mẫu',
    published: shape === 'G2' ? i ? null : 'ngày không xác định' : i ? '2025-12-17' : '15 tháng 12, 2025',
    retrievedAt: G_RETRIEVED, captureIndex: 40 + group, ...(origin ? { origin } : {}),
  })));
}

type AdsBrand = StepSearchAds['brands'][number];
export function gAds(shape: Exclude<GShape, 'G3'>): StepSearchAds {
  const brand = (label: string, count: number | null, status: AdsBrand['status'] = 'OK'): AdsBrand => ({
    label, domain: status === 'SKIPPED_NO_DOMAIN' ? null : 'example.invalid', status, reason: null,
    creativeCount: count, totalResults: count, maxDaysShown: count === null ? null : count ? 4 : 0,
    formats: status === 'OK' ? { text: count ?? 0, image: 0, video: 0 } : null,
    firstShown: count ? '2026-01-03' : null, lastShown: count ? '2026-01-06' : null,
    overlapCount: null, invalidCount: null, captureIndex: status === 'OK' ? 50 : null,
    retrievedAt: status === 'OK' ? G_RETRIEVED : null, responseSha256: status === 'OK' ? sha(label) : null, usageOrdinal: null });
  const zero = brand('Nhãn mẫu A', 0), positive = brand('Nhãn mẫu B', 3);
  // The retained contract caps one result at 3 brands. Two independently valid result variants
  // cover all five states without constructing an impossible five-brand stored document.
  return { profile: 'search-ads-v1', status: 'OK', brands: shape === 'G1'
    ? [zero, brand('Nhãn mẫu ngoài', null), brand('Nhãn mẫu lỗi', null, 'FAILED')]
    : [zero, positive] };
}

export function gAdsUnchecked(): StepSearchAds {
  const base = gAds('G1').brands[2]!;
  return { profile: 'search-ads-v1', status: 'OK', brands: [gAds('G1').brands[0]!,
    { ...base, label: 'Nhãn mẫu chưa kiểm', status: 'CANCELLED' },
    { ...base, label: 'Nhãn mẫu thiếu trang', status: 'SKIPPED_NO_DOMAIN', domain: null }] };
}

function gGeo(shape: GShape) {
  const top = shape === 'G1' ? ['Hà Nội', 'Hải Phòng', 'Bắc Ninh', 'Hải Dương', 'Hưng Yên', 'Thái Bình', 'Hồ Chí Minh', 'Đà Nẵng', 'Thanh Hóa', 'Nghệ An']
    : ['Hà Nội', 'Hồ Chí Minh', 'Đà Nẵng', 'Đắk Lắk', 'Cần Thơ', 'Lào Cai', 'Thanh Hóa', 'Bình Dương', 'Bắc Ninh', 'Nghệ An'];
  const base = syntheticSearchGeo(top);
  return shape === 'G2' ? { ...base, provinces: [
    { name: 'Tỉnh Thanh Hoá', index: 100 }, { name: 'Khu vực mẫu sáp nhập', index: 99 },
    ...base.provinces.filter(row => !/Thanh|Hoá/u.test(row.name)).map(row => ({ ...row, index: row.index === null ? null : row.index - 2 })),
  ] } : base;
}

/** Full public-builder input. businessInput reuses package E inventory and R presentation fixtures. */
export async function gEvidenceInput(shape: GShape): Promise<AutomationReportInput> {
  const base = await businessInput(shape === 'G1' ? 'P1' : shape === 'G2' ? 'P2' : 'P3');
  const webResults = gWeb(shape);
  // The synthetic source's identity supplies lineage vocabulary, with no provider name in new fixture data.
  const sourceIdentity = syntheticExpandedSource(() => { throw new Error('No transport call permitted'); }).id.toLowerCase();
  const captures: CaptureRecord[] = [...base.captures, ...[10, 11, 20, 30, 31, 32, 40, 41, 42, 50].map(ordinal => ({
    stepId: 'COLLECTION' as const, ordinal, artifactSha256: sha(`capture-${ordinal}`), mediaType: 'application/json',
    provider: ordinal >= 40 && ordinal <= 42 ? sourceIdentity : 'synthetic-source', operation: 'synthetic.search',
    retrievedAt: G_RETRIEVED, window: null, truncated: false,
  }))];
  const draft = { output: { contractVersion: 'l9-keyword-data-v1', dataVersion: 'synthetic-evidence-v1', category: 'synthetic',
    provenance: 'OPERATOR_SUPPLIED', keywords: ['Mẫu'], exclusions: [] } } as unknown as RetainedKeywordListDraftRecord;
  const sourceEvidence = buildSourceEvidence({ draft, draftDigest: sha('draft'), unavailableReason: null, webResults, captures, pageTypes: true });
  const { worldBank: _macro, comtrade: _trade, officialStats: _official, searchAds: _ads, ...collection } = base.collection!;
  const trade = shape === 'G3' ? undefined : gTrade(shape), macro = shape === 'G3' ? undefined : gMacro(shape);
  const presentation = base.marketPresentation!;
  const descriptive = descriptiveReaderFixture();
  // Membership is retained on the current sample; selection itself is never recalculated by tests.
  const marketPresentation = { ...presentation, input: { ...presentation.input,
    rows: presentation.input.rows.map((row, i) => ({ ...row, brand: i % 2 ? 'Nhãn mẫu B' : 'Nhãn mẫu A' })) } };
  return { ...base, marketPresentation, start: { ...base.start, sourceEvidenceVersion: 'automation-source-evidence-v1' }, sourceEvidence,
    // The M07-only fixture caption trips main's unrelated business gate when composed into a full report.
    // G owns M05/M06 notes; omit unrelated peer observations and retain those source-backed methods.
    descriptiveMethods: buildDescriptiveMarketMethods({ ...descriptive.input, m07: [] }, { methodVersion: '1.1.0' }).output, captures,
    collection: { ...collection, searchGeo: gGeo(shape), webResults,
      ...(trade ? { comtrade: trade } : {}), ...(macro ? { worldBank: macro } : {}),
      ...(shape === 'G3' ? {} : { officialStats: gOfficial(shape), searchAds: gAds(shape) }) },
    comtradeCharts: await renderComtradeCharts(trade), worldBankCharts: await renderWorldBankCharts(macro) };
}

/** Trusted rendered-fragment boundary: exercise every quote container through the public builder.
 * This is prepared presentation HTML, not markup accepted from an untrusted source title.
 */
export function gWithQuoteContexts(input: AutomationReportInput): AutomationReportInput {
  const charts = input.marketPresentationCharts!;
  return { ...input, marketPresentationCharts: charts.map((chart, i) => i ? chart : { ...chart,
    svg: chart.svg.replace('</svg>',
      '<text id="g-svg-axis" x="2" y="12">Shopee</text><text id="g-svg-legend" x="2" y="24">TikTok Shop</text></svg>')
      // Put quote contexts beside the chart, so they cannot affect chart-fragment parsing.
      + '</div>' + G_QUOTE_CONTEXTS + '<p id="g-authored">Shopee và TikTok Shop</p><div>' }) };
}

/** Rich legacy/Insight control also traverses shared icon handling and keeps raw trade input. */
export async function gByteInput(): Promise<AutomationReportInput> {
  const base = businessByteInput();
  return { ...base, comtradeCharts: await renderComtradeCharts(gTrade('G1'), { flint: false }),
    collection: { ...base.collection!, comtrade: gTrade('G1'), officialStats: gOfficial('G2'),
    webResults: gWeb('G1') }, scope: { ...base.scope, definition: 'Phạm vi mẫu trên Shopee và TikTok Shop' } };
}
