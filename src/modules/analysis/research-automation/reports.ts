import { populationBaselineSection } from './population-baseline.js';
import { publicReviewReportHtml } from './public-review-report.js';
import { lint as lintReaderReport } from '../reader-report/lint.js';
import { hasHiddenName } from '../report-language/index.js';
import type { PersonaSelectedReportSnapshot } from '../../../../contracts/analysis/automation-insight-persona-report.generated.js';
import { checkPersonaSelectedReport, personaDigest as personaViewDigest } from './insight-persona-contracts.js';
import { insightPersonaSection } from './insight-persona-report.js';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import reviewSampleSchema from '../../../../contracts/analysis/automation-review-sample.schema.json' with { type: 'json' };
import type { AutomationReviewSample } from '../../../../contracts/analysis/automation-review-sample.generated.js';
import { registerPrivateReviewSchemas } from './private-review-contracts.js';
import { privateReviewReportView } from './private-review-contracts.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';
import type { AutomationMarketPresentationMethod } from '../../../../contracts/analysis/automation-market-presentation-method.generated.js';
import { verifyAutomationMarketPresentation } from './market-presentation-method.js';
import { marketChartRowInputs, marketChartRowSource, marketChartSource, renderAutomationMarketFindings, renderAutomationMarketUnitPrices, renderCaptureSampleSentences, type MarketHeadline, type MarketTitleUnitRow } from './market-presentation-report.js';
import { admitWebResults, checkSourceEvidence } from './source-evidence.js';
import { collectionWebRows, webReaderDay, webReaderRetrieved, expandedSearchReaderLabel, EXPANDED_SEARCH_COLUMN, EXPANDED_SEARCH_LABEL, EXPANDED_SEARCH_NOTE } from './expanded-search-lane.js';
import { CURRENT_MARKET_READER_TERMS, MARKET_READER_TERMS } from './market-reader-glossary.js';
import { marketReaderCitations } from './market-reader-citations.js';
import { sourceEvidenceHtml } from './source-evidence-report.js';
import { classifyWebPage, WEB_LINK_WITHHELD, WEB_PAGE_TYPE_LABEL, WEB_SITE_WITHHELD, WEB_TITLE_WITHHELD, webTextHidden } from './web-page-type.js';
import fs from 'node:fs';
import type { AutomationBoundedMethodSnapshot } from '../../../../contracts/analysis/automation-bounded-method-snapshot.generated.js';
import type { AutomationQuoteMethodSnapshot } from '../../../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import type { AutomationDecisionPacket } from '../../../../contracts/analysis/automation-decision-packets.generated.js';
import { quoteMethodSection, quoteMethodUsable } from './quote-method-report.js';
import { renderReportMethodPacketSection } from '../report-method-packets-pages.js';
import type { DescriptiveMarketMethods } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { DefaultMarketPeers } from '../../../../contracts/analysis/default-market-peers.generated.js';
import { classifiedMetricDefaultPeers } from '../default-market-peers.js';
import type { AutomationSourceClaims } from '../../../../contracts/analysis/automation-source-claims.generated.js';
import type { AutomationM01EvidenceInventory } from '../../../../contracts/analysis/automation-m01-evidence-inventory.generated.js';
import type { AutomationI14EvidenceAdmission } from '../../../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import { decisionPacketSection, m01InventorySection, i14AdmissionSection, i14SynthesisSection, SYNTHESIS_EVIDENCE_CSS } from './synthesis-evidence-report.js';
import type { AutomationI14ExecutionOutcome } from './i14-synthesis-execution.js';
import type { AutomationDecisionSectionId } from './decision-packets.js';
import type { AutomationDecisionExecutionOutcome } from './decision-synthesis-execution.js';
import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import { verifyInsightLiteralEvidence, type InsightLiteralEvidence } from '../insight-literal-evidence.js';
import { reviewCorpusSection, privateReviewCorpusSection, insightLiteralSection } from './review-corpus-report.js';
import { projectCorpusTrace, type CorpusTrace } from './corpus-trace-projection.js';
import { projectMarketSourceScope, marketSourceScopeSection } from './market-scope-report.js';
import type { AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import type { AutomationMetricMethodSnapshot, MetricMethodFailureCode } from './metric-method-bridge.js';
import type { AutomationClassifiedMetricSnapshot } from '../../../../contracts/analysis/automation-classified-metric.generated.js';
import { metricMethodSection } from './metric-method-report.js';
import type { AutomationLocatedReviewSnapshot } from './located-review-bridge.js';
import type { NativeSourceReviewSnapshot } from './native-source-review-bridge.js';
import { renderLocatedInsightSection } from '../report-located-insight-pages.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { AutomationInsightCodingSnapshot } from '../../../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import type { LiteralFamily, LiteralPendingReason } from './literal-review-coding.js';
import { marketInventorySection } from './market-inventory-report.js';
import { marketRawScaleSection, marketRawScopeSection, type MarketRawReportInput } from './market-raw-report.js';
import { MarketNumberTraceCollector, marketNumberTraceActive, traceMarketNumber, withMarketNumberTrace, type MarketTraceInput } from './market-trace-map.js';
import { resolveMarketRawSource } from './market-raw-series.js';
import { scopePeriodInputs, storedInput } from './market-trace-inputs.js';
import { marketMainQuarter, marketNumberTokens } from './market-number-trace.js';
import type { ResearchAutomationRun } from '../../../../contracts/api/research-automation-api.generated.js';
import { REPORT_KIT_CSS as REPORT_KIT_BASE_CSS } from '../report-kit-theme.js';
import { reportKitFontCss } from '../report-kit-fonts.js';
import { attributionText, describeDescriptiveSection, descriptiveAppendix, escapeHtml, isDescriptiveSectionId, readerSafe, readerPointer, reviewRecordMark, retainedEvidenceHtml, retainedQuoteHtml, technicalLiteral, sourceMemberLabel, storedLiteral, type DescriptiveSectionView, type ReportCitations } from './descriptive-report.js';
import type { InsightCrosscheckSnapshot } from '../../../../contracts/analysis/automation-insight-crosscheck.generated.js';
import { crosscheckSnapshotValid } from './insight-crosscheck-contracts.js';
import { insightCrosscheckAppendix } from './insight-crosscheck-report.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { DEFAULT_INSIGHT_MULTICODE_LIMIT } from './insight-default-coding.js';
import type { CaptureRecord, ScopeSnapshot, StartSnapshot, StepOfficialStats, StepResultDocument, StepWebResult, TypedComparable } from './model.js';
import { CitationRegistry, type CitationInput } from '../citation-registry.js';
import { orderReportCitations, renderCitationMarkOrMissing, renderCitationRegister } from '../citation-register-html.js';
import { lintVisibleReportText } from '../report-visible-text-lint.js';
import { partialRowTotals, type PartialRowTotal } from './market-business-gate.js';
import { assertMarketReport } from './market-report-check.js';
import { formatReaderValue, readerProductLabel, readerShopLabel } from './reader-plain-text.js';
import type { AutomationQualitativeDraft } from '../../../../contracts/analysis/automation-qualitative-draft-v1.generated.js';
import { qualitativeDraftSection, qualitativeDraftSummary } from '../reader-report/qualitative-draft-report.js';
import { platIcons } from '../reader-report/layout.js';
import { ACTION_DEADLINE_DAYS, ACTION_LEAD, dayPlus, OPPORTUNITY_HEADINGS, OPPORTUNITY_UNIT_READING,OPTION_HEADINGS, QUICK_WIN_HEADING, QUICK_WIN_HEADINGS, actionStartDay, marketActionPlan, missingBandText, NO_DERIVED_PRICE, opportunityExplanation, opportunityHeadings, opportunityRows, platformPriceBands, type ActionRow, type MarketActionPlan } from '../reader-report/market-actions.js';
import { NO_PRICE_COMPARISON, chooseUnitProfile, convertedLine, projectTitleUnitPrices, type UnitProfile } from '../reader-report/market-title-quantity.js';
import { deliverMarketReader, type MarketChartReadingTrace, marketReaderGuide, numberMarketExhibits } from './market-reader-delivery.js';
import { plainCaptureNumbers } from '../reader-report/format.js';
import { TOP_GROUPS, UNKNOWN_SHOP, marketChartPlatformLabel, marketChartRows, marketRankingRowLabel, marketShareMembers, type MarketChartRow, marketRankedRows, marketShares, marketShopsUnrecorded, thinSearchAxisLabels, type CaptureCountChart, type MarketChart } from '../reader-report/market-charts.js';
import type { RenderedChart } from '../reader-report/flint.js';
import { comtradeChartCount, worldBankChartCount, type MacroChart } from '../reader-report/macro-charts.js';
import { pdfDiscoverySourceRows, pdfExcerptBlockHtml, pdfExcerptReaderCitation, PDF_EXCERPT_NOTE, PDF_EXCERPT_SECTION, PDF_EXCERPT_SRC } from './pdf-excerpt.js';
import { sellerVideoBlockHtml, sellerVideoNote, sellerVideoSrc, SELLER_VIDEO_SECTION } from './seller-video.js';
import { searchAdsBrandNotice, searchAdsNotice, searchAdsOkBrands, SEARCH_ADS_NOTE, SEARCH_ADS_SOURCE_LABEL, SEARCH_ADS_SOURCE_NOTE, SEARCH_ADS_TABLE_TITLE } from './google-ads-lane.js';
import { officialStatsCitation, officialStatsTechnicalCitation, officialStatsNotice, officialStatsProvinceCellText, officialStatsProvinceCitation, officialStatsProvinceContext, officialStatsProvinceRowLabel, officialStatsProvinceRows, officialStatsRenderable, officialStatsRenderableRows, officialStatsRowLabel, officialStatsStatusText, officialStatsUnitText, officialStatsValueText, OFFICIAL_STATS_LIMIT, OFFICIAL_STATS_NOTE, OFFICIAL_STATS_PROVINCE_LIMIT, OFFICIAL_STATS_PROVINCE_NOTE, OFFICIAL_STATS_PROVINCE_TITLE, OFFICIAL_STATS_SOURCE_LABEL, OFFICIAL_STATS_SRC, OFFICIAL_STATS_TABLE_TEXT, OFFICIAL_STATS_TABLE_TITLE } from './official-statistics-lane.js';
import { comtradeFlowText, comtradeReaderLabel, comtradeReaderSide, comtradeWholeUsd, comtradeNotice, comtradeOfficialText, comtradeRenderableRows, comtradeRowNote, comtradeSideText, COMTRADE_NOTE, COMTRADE_SOURCE_LABEL, COMTRADE_SRC, COMTRADE_TABLE_TITLE } from './comtrade-lane.js';
import { formatWorldBankValue, worldBankReaderNote, WORLD_BANK_READER_SRC, worldBankRenderable, worldBankRenderableRows, worldBankSourceNote, worldBankTableNote, worldBankUnitText, WORLD_BANK_LIMIT, WORLD_BANK_SOURCE_LABEL, WORLD_BANK_SRC, WORLD_BANK_TITLE } from './world-bank-lane.js';
import { E13_ATTRIBUTION } from '../source-appendix-projection.js';
import { withKalodataReplayNotice } from './kalodata-replay.js';
import { exactTestReviewSample, exactTestReviewSection, exactTestReviewSourceRows, TEST_REVIEW_SOURCE_TYPE } from './test-review-sample.js';
import { SEARCH_INTEREST_EMPTY, searchInterestIntervalText, searchInterestIsDaily, searchInterestPeriodText, searchInterestReadingPoints, searchInterestRenderable,SEARCH_INTEREST_FIGURE_TITLE, SEARCH_INTEREST_LIMIT, SEARCH_INTEREST_NOTE, SEARCH_INTEREST_READER_TITLE, SEARCH_INTEREST_SOURCE_LABEL, searchInterestSourceText, SEARCH_INTEREST_UNIT } from './search-interest.js';
import { searchGeoAverageText, searchGeoNoteText, searchGeoRenderable, searchGeoText, summarizeSearchGeo, SEARCH_GEO_DONT, SEARCH_GEO_HEADERS, SEARCH_GEO_TABLE_NO, SEARCH_GEO_TABLE_TITLE } from './search-geo.js';

/**
 * Current Market reader print layout (L14, M7e). Forced page breaks stay structural: each top-level section (`.sheet`,
 * the appendix included) starts a page and nothing else forces one. A figure keeps its label, a definition term keeps its
 * definition and each key/value list stays whole (every `dl` on this reader is a short metadata block of at most eight
 * pairs), an exhibit label keeps the exhibit it names; long tables still split, with the header row repeated.
 */
export const MARKET_READER_PRINT_CSS = '@media print{figure.market-chart,.capture-sample{break-inside:avoid}.exh{break-after:avoid}dl{break-inside:avoid}dt{break-after:avoid}dd{break-before:avoid}.table-wrap>.exh+table{break-before:avoid}}';

const reportRequire = createRequire(import.meta.url);
const { Ajv2020 } = reportRequire('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const sampleAjv = new Ajv2020({ strict: true, allErrors: true });
(reportRequire('ajv-formats') as typeof import('ajv-formats')).default(sampleAjv);
registerPrivateReviewSchemas(sampleAjv);
const validateSample = sampleAjv.compile<AutomationReviewSample>({ $ref: reviewSampleSchema.$id });
const sampleHash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

const REPORT_KIT_CSS = REPORT_KIT_BASE_CSS + SYNTHESIS_EVIDENCE_CSS;
const COVER_ART_CSS = '.cv-art{display:block;width:100%;height:auto;aspect-ratio:16/9;object-fit:cover;border-radius:12px;margin:0 0 20px;background:var(--navy)}'
  + '@media(max-width:600px){.cv-art{border-radius:8px;margin-bottom:16px}}@media print{.cover{break-inside:avoid;break-after:page}.cv-art{max-height:90mm;break-inside:avoid}}';
export interface MarketCoverInput {
  readonly mime: 'image/jpeg'; readonly base64: string; readonly alt: string;
  readonly provenance: 'ai-generated' | 'fallback'; readonly model: 'gpt-image-2' | null; readonly width: number; readonly height: number;
}

export interface AutomationReportInput {
  readonly publicReviewSource?: import('./public-shopee-bridge.js').PublicReviewSource;
  readonly publicReviewCorpus?: import('../../../../contracts/analysis/research-review-corpus-v2.generated.js').ResearchReviewCorpusV2;
  /** Replay test instance only: adds a visible test notice to the HTML (and so the PDF). */
  readonly kalodataReplayNotice?: true;
  readonly sourceEvidence?: import('./source-evidence.js').AutomationSourceEvidence;
  /** Verified document excerpts (Market only); present only when the packet carries the pdfExcerpts marker. */
  readonly pdfExcerpts?: readonly import('./pdf-excerpt.js').PdfExcerpt[];
  /** Owner/operator video uploads (Market only); present only when the packet carries the sellerVideos marker. */
  readonly sellerVideos?: import('./seller-video.js').SellerVideos;
  /** Confirmed Meta ad-library pages (S15), read when the Insight reader is built. Seller voice only; never an input to coding, personas or counts. */
  readonly metaAds?: readonly import('./meta-ad-report.js').MetaAdPage[];
  readonly boundedMethods?: AutomationBoundedMethodSnapshot;
  readonly quoteMethods?: AutomationQuoteMethodSnapshot;
  readonly run: ResearchAutomationRun;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
  readonly sourceClaims?: AutomationSourceClaims;
  readonly decisionPackets?: readonly AutomationDecisionPacket[];
  readonly decisionSourceClaims?: AutomationSourceClaims;
  /** Settled outcomes verified and retained by the decision synthesis owner; absent for historical reports. Presentation only. */
  readonly decisionSynthesis?: Partial<Record<AutomationDecisionSectionId, AutomationDecisionExecutionOutcome>>;
  readonly m01Inventory?: AutomationM01EvidenceInventory;
  readonly i14Admission?: AutomationI14EvidenceAdmission;
  readonly i14Synthesis?: AutomationI14ExecutionOutcome;
  /** Produced and verified by the production service; absent for runs without a connected descriptive method. */
  readonly descriptiveMethods?: DescriptiveMarketMethods;
  readonly descriptiveMethodFailure?: 'DESCRIPTIVE_METHOD_FAILED';
  readonly privateReviewCorpus?: PrivateReviewReportView;
  readonly reviewSample?: AutomationReviewSample;
  readonly reviewCorpus?: ResearchReviewCorpus;
  readonly reviewCorpusFailure?: 'REVIEW_CORPUS_FAILED' | 'REVIEW_CORPUS_REPORT_TOO_LARGE';
  readonly locatedReview?: AutomationLocatedReviewSnapshot;
  readonly locatedReviewFallback?: { readonly sourcePackage: Extract<AutomationLocatedReviewSnapshot, { contractVersion: 'automation-located-review-snapshot-v2' }>['sourcePackage'] };
  readonly nativeReview?: NativeSourceReviewSnapshot;
  readonly nativeReviewFallback?: Pick<NativeSourceReviewSnapshot, 'sourcePackage'>;
  readonly nativeReviewFailure?: 'NATIVE_REVIEW_METHOD_FAILED' | 'NATIVE_REVIEW_REPORT_TOO_LARGE';
  readonly locatedReviewFailure?: 'LOCATED_REVIEW_METHOD_FAILED';
  /** Verified coding selections; v2 also supplies explicitly selected semantic families. Original source snapshots remain retained. */
  readonly insightCoding?: AutomationInsightCodingSnapshot;
  readonly insightCrosscheck?: InsightCrosscheckSnapshot;
  readonly insightLiteral?: InsightLiteralEvidence;
  readonly insightPersona?: PersonaSelectedReportSnapshot;
  readonly marketInventory?: AutomationMarketMethodSnapshot;
  readonly marketInventoryFailure?: 'MARKET_INVENTORY_FAILED';
  /** Raw-response numbers of the market capture (`readMarketRawSeries`) and its search settings. Optional: without it the Market report keeps its current blocks. */
  readonly marketRawSeries?: MarketRawReportInput;
  readonly marketPresentation?: AutomationMarketPresentationMethod;
  /** Flint charts drawn from `marketPresentation.input.rows` before the synchronous build (see renderMarketCharts). */
  readonly marketPresentationCharts?: readonly MarketChart[];
  /** Flint record-count bars of the capture sample, drawn before the synchronous build (see renderCaptureCountCharts). */
  readonly marketCaptureCharts?: readonly CaptureCountChart[];
  /** Flint line of the stored search-interest series, drawn before the synchronous build; present only when that series is rendered. */
  readonly searchInterestChart?: RenderedChart;
  /** Flint yearly lines of the stored World Bank series (S23), drawn before the synchronous build; present only when one is drawn. */
  readonly worldBankCharts?: readonly MacroChart[];
  /** Flint bars of the stored UN Comtrade rows (S24), drawn before the synchronous build; present only when one is drawn. */
  readonly comtradeCharts?: readonly MacroChart[];
  /** Build-time cover (AI illustration or procedural fallback), embedded as a data URI; Market presentation only. */
  readonly marketCover?: MarketCoverInput;
  readonly metricMethods?: AutomationMetricMethodSnapshot;
  readonly metricClassified?: AutomationClassifiedMetricSnapshot;
  readonly metricMethodsFailure?: MetricMethodFailureCode;
  /** Canonical source-bound qualitative draft; injected only after backend verification. */
  readonly qualitativeDraft?: AutomationQualitativeDraft;
}
/** Fixed copy per closed code; the generic entry keeps the original wording so existing output is unchanged. */
const metricFailureCopy: Readonly<Record<MetricMethodFailureCode, { explanation: string; next: string }>> = {
  METRIC_SOURCE_AMBIGUOUS: {
    explanation: 'Lượt này có nhiều hơn một gói số liệu thị trường được gắn. Hệ thống không tự chọn một gói nên chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Tạo lượt mới và chỉ gắn đúng một gói số liệu thị trường cho lượt đó. Các gói đã gắn được giữ nguyên, không bị xóa hoặc gộp.',
  },
  METRIC_SOURCE_UNSUPPORTED: {
    explanation: 'Gói số liệu thị trường được gắn có phiên bản, tệp mô tả, manifest hoặc hồ sơ tệp xuất chưa được hỗ trợ. Chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Tạo lại gói gắn từ tệp xuất số liệu thị trường theo hồ sơ được hỗ trợ, có đủ tệp mô tả và manifest, rồi tạo lượt mới.',
  },
  METRIC_SOURCE_INTEGRITY_FAILED: {
    explanation: 'Dữ liệu đã lưu của gói số liệu thị trường không khớp dấu kiểm toàn vẹn khi đọc lại. Chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Không sửa tệp đã lưu. Gắn lại tệp xuất gốc vào một lượt mới; nếu lỗi lặp lại, báo người vận hành kiểm tra kho lưu trữ.',
  },
  METRIC_SOURCE_RUN_MISMATCH: {
    explanation: 'Gói số liệu thị trường được gắn không liên kết với đúng lượt, workspace hoặc keyword đã xác nhận này. Chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Không dùng lại gói của lượt khác. Ở lượt mới, gắn tệp xuất số liệu thị trường sau khi xác nhận phạm vi để gói được liên kết với đúng lượt đó.',
  },
  METRIC_SOURCE_PERIOD_CONFLICT: {
    explanation: 'Kỳ đo khai báo của tệp số liệu thị trường nằm ngoài kỳ báo cáo yêu cầu. Hệ thống không cắt, kéo dài hoặc chia tỷ lệ số liệu theo ngày nên chưa tính M03/M04.',
    next: 'Xuất lại số liệu thị trường với kỳ đo nằm trong kỳ yêu cầu, hoặc tạo lượt mới có kỳ yêu cầu bao trùm kỳ đo của tệp xuất.',
  },
  METRIC_SOURCE_INPUT_REJECTED: {
    explanation: 'Tệp xuất số liệu thị trường hoặc manifest không khớp hồ sơ tệp xuất đã khai báo, ví dụ mã băm, tiêu đề cột, số dòng, kỳ khai báo hoặc mã định danh. Hệ thống không tự sửa hay bỏ dòng nên chưa tính M03/M04.',
    next: 'Dùng đúng tệp tải trực tiếp từ nguồn số liệu, chưa chỉnh sửa hoặc lưu lại; kiểm tra manifest khai báo đúng tệp và số dòng đó, rồi tạo lượt mới.',
  },
  METRIC_CALCULATION_FAILED: {
    explanation: 'Đầu vào số liệu thị trường đã qua kiểm tra hồ sơ, nhưng kết quả tính hoặc bản lưu không khớp khi kiểm tra lại. Không dùng kết quả chưa xác minh và không tự gọi lại nguồn.',
    next: 'Không cần sửa tệp nguồn. Báo người vận hành kèm mã đối chiếu này trước khi tạo lượt mới.',
  },
  METRIC_METHOD_FAILED: {
    explanation: 'Gói số liệu thị trường được gắn với lượt này chưa vượt qua kiểm tra nguồn, kỳ hoặc phương pháp. Không dùng số liệu chưa xác minh; cần sửa gói đầu vào cho lượt mới. Không tự gọi lại nguồn.',
    next: 'Chưa tính được từ gói số liệu thị trường gắn với lượt này. Kiểm tra nguồn, kỳ đo và liên kết phạm vi trước khi tạo lượt mới.',
  },
};
const WEB_DISCOVERY_DATASET = 'web_discovery_current';
const WEB_SOURCE_FAILED_TEXT = 'Nguồn kết quả tìm kiếm trên web không phản hồi kịp hoặc trả về dữ liệu không dùng được; lượt này không dùng kết quả tìm kiếm web.';
const readerPlatform = (platform: string): string => platform === 'shopee' ? 'Shopee' : platform === 'tiktok' ? 'TikTok Shop' : platform;
const captureSalesPlatforms = (capture: NonNullable<AutomationMetricMethodSnapshot['capture']>): string[] => capture.platforms
  .filter(({ platform, result }) => !capture.rowPolicyVersion || result.input.records.length > 0 ||
    capture.platformHeadlines?.some(figure => figure.platform === platform && figure.revenue.value !== null))
  .map(value => value.platform);
/** The appendix source list states what this run actually used, so a missing or failed source is never shown as present. */
export function marketSourceRows(input: AutomationReportInput, webResultCount: number, webFailed: boolean): readonly (readonly [string, string])[] {
  const capture = input.metricMethods?.capture;
  const missing = capture ? capture.capture.platforms.filter(platform => !captureSalesPlatforms(capture).includes(platform)) : [];
  const sales = input.metricMethods
    ? capture?.rowPolicyVersion && missing.length === capture.capture.platforms.length ? 'Không có số liệu bán hàng dùng được sau khi lọc trong lượt này.'
      : missing.length ? `Dùng một phần: không có số liệu cho ${missing.map(readerPlatform).join(', ')} trong lượt này.` : 'Đã dùng số liệu của lượt này.'
    : input.metricMethodsFailure ? 'Không dùng được trong lượt này: gói số liệu không qua kiểm tra.' : 'Chưa có trong lượt này.';
  const testSample = input.publicReviewSource ? null : exactTestReviewSample(input);
  const trialRows = testSample ? exactTestReviewSourceRows(testSample) : null;
  const native = trialRows ? trialRows.native : input.nativeReview ? 'Đã dùng trong lượt này.'
    : input.nativeReviewFailure ? 'Không dùng được trong lượt này: bước xử lý không qua kiểm tra.' : 'Chưa có trong lượt này.';
  const web = webResultCount ? `Đã lưu ${webResultCount} kết quả trong lượt này.` : webFailed ? WEB_SOURCE_FAILED_TEXT : 'Chưa có trong lượt này.';
  const comments = input.publicReviewSource ? 'review công khai trên Shopee; bản ghi thô, chưa mã hóa.' : trialRows ? trialRows.comments : input.reviewCorpus ? 'Đã dùng trong lượt này.'
    : input.reviewCorpusFailure ? 'Không dùng được trong lượt này: bộ bình luận không qua kiểm tra.' : 'Chưa có trong lượt này.';
  const interest: readonly (readonly [string, string])[] = searchInterestRenderable(input.collection?.searchInterest) || searchGeoRenderable(input.collection?.searchGeo)
    ? [[SEARCH_INTEREST_SOURCE_LABEL, 'Đã dùng trong lượt này: chỉ số tương đối, không phải doanh số.']] : [];
  const macro: readonly (readonly [string, string])[] = worldBankRenderable(input.collection?.worldBank)
    ? [[WORLD_BANK_SOURCE_LABEL, 'Đã dùng trong lượt này: số liệu cả nước, chỉ là bối cảnh.']] : [];
  const trade: readonly (readonly [string, string])[] = comtradeRenderableRows(input.collection?.comtrade, Boolean(input.marketPresentation)).length
    ? [[COMTRADE_SOURCE_LABEL, 'Đã dùng trong lượt này: số liệu cả nước, chỉ là bối cảnh.']] : [];
  const searchAds: readonly (readonly [string, string])[] = searchAdsOkBrands(input.collection?.searchAds).length
    ? [[SEARCH_ADS_SOURCE_LABEL, SEARCH_ADS_SOURCE_NOTE]] : [];
  const official: readonly (readonly [string, string])[] = officialStatsRenderable(input.collection?.officialStats)
    ? [[OFFICIAL_STATS_SOURCE_LABEL, officialStatsProvinceRows(input.collection?.officialStats).length
      ? 'Đã dùng trong lượt này: số liệu thống kê cả nước theo nhóm hàng và chỉ số giá theo tỉnh, thành phố, chỉ là bối cảnh.'
      : 'Đã dùng trong lượt này: số liệu thống kê cả nước theo nhóm hàng, chỉ là bối cảnh.']] : [];
  const pdf = pdfDiscoverySourceRows(input.collection?.pdfDiscovery, input.sourceEvidence?.pdfExcerpts === true ? input.pdfExcerpts ?? [] : []);
  return [...(input.publicReviewSource ? [['review công khai trên Shopee', 'Bản đọc có giới hạn; bản ghi thô, chưa mã hóa.'] as const] : []), ['Dữ liệu bán hàng', sales], ['Dữ liệu đánh giá sản phẩm trên nền tảng', native], ['Kết quả tìm kiếm', web], ['Bình luận đã thu thập', comments], ...pdf, ...interest, ...macro, ...trade, ...searchAds, ...official];
}
/** Reader appendix (market14): the plain source TYPES used, from the same predicates as marketSourceRows; core types this run lacks go in one sentence. */
export function marketSourceTypes(input: AutomationReportInput, webResultCount: number, salesPlatforms: readonly string[]): { used: string[]; missing: string[] } {
  const capture = input.metricMethods?.capture;
  const testSample = !input.publicReviewSource && exactTestReviewSample(input)?.listings.some(row => row.reviews > 0);
  const present = capture ? captureSalesPlatforms(capture) : salesPlatforms;
  const sales = capture?.rowPolicyVersion ? present.length > 0 : Boolean(input.metricMethods || input.marketPresentation?.input.metric);
  const platforms = ['shopee', 'tiktok'].filter(platform => present.includes(platform));
  const lacking = capture ? capture.capture.platforms.filter(platform => !present.includes(platform)) : [];
  const collection = input.collection;
  const used = [
    ...(input.publicReviewSource ? ['review công khai trên Shopee'] : []),
    ...(sales ? platforms.length ? platforms.map(platform => `Dữ liệu bán hàng trên ${readerPlatform(platform)}`) : ['Dữ liệu bán hàng'] : []),
    ...(input.nativeReview ? ['Dữ liệu đánh giá sản phẩm trên Shopee'] : []),
    ...(webResultCount ? ['Kết quả tìm kiếm trên web'] : []),
    ...(testSample ? [TEST_REVIEW_SOURCE_TYPE]
      : input.reviewCorpus ? ['Dữ liệu bình luận của khách trên Shopee'] : []),
    ...(searchInterestRenderable(collection?.searchInterest) ? ['Mức quan tâm tìm kiếm theo thời gian'] : []),
    ...(searchGeoRenderable(collection?.searchGeo) ? ['Mức quan tâm tìm kiếm theo khu vực'] : []),
    ...(worldBankRenderable(collection?.worldBank) ? [input.marketPresentation ? 'Ngân hàng Thế giới' : 'Ngân hàng Thế giới (World Bank Open Data)'] : []),
    ...(comtradeRenderableRows(collection?.comtrade, Boolean(input.marketPresentation)).length ? [COMTRADE_SOURCE_LABEL] : []),
    ...(searchAdsOkBrands(collection?.searchAds).length ? [SEARCH_ADS_TABLE_TITLE] : []),
    ...(officialStatsRenderable(collection?.officialStats) ? [OFFICIAL_STATS_SOURCE_LABEL] : []),
    ...(input.pdfExcerpts?.length && input.sourceEvidence?.pdfExcerpts === true ? ['Tài liệu PDF đã lưu'] : []),
    ...(input.sellerVideos && input.sourceEvidence?.sellerVideos === true ? ['Video bán hàng của người bán'] : []),
  ];
  const missing = [
    ...(!sales ? ['dữ liệu bán hàng'] : lacking.map(platform => `dữ liệu bán hàng trên ${readerPlatform(platform)}`)),
    ...(input.nativeReview || testSample || input.publicReviewSource ? [] : ['dữ liệu đánh giá sản phẩm']),
    ...(webResultCount ? [] : ['kết quả tìm kiếm trên web']),
    ...(input.reviewCorpus || testSample || input.publicReviewSource ? [] : ['dữ liệu bình luận của khách']),
  ];
  return { used, missing };
}
/** The main sales sample's stored scope when valid; null when the report has no sales sample. */
function marketSamplePeriod(input: AutomationReportInput): { start: string; end: string } | null {
  const validDay = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
  };
  const scopes = [input.marketPresentation?.input.metric?.input.scope, input.metricMethods?.result.input.scope];
  return scopes.flatMap(scope => scope && validDay(scope.start) && validDay(scope.end) && scope.start <= scope.end
    ? [{ start: scope.start, end: scope.end }] : [])[0] ?? null;
}
/** Trace inputs of the sales-sample period: the capture snapshot's scope, or the metric method input's scope. */
function marketSamplePeriodInputs(input: AutomationReportInput, period: { start: string; end: string }): MarketTraceInput[] {
  const capture = input.metricMethods?.capture;
  if (capture) return scopePeriodInputs(capture.snapshotSha256, period);
  const identity = input.metricMethods?.result.inputSha256 ?? 'automation-market-presentation-method';
  return [storedInput('stored-source', identity, '/input/scope/start', period.start, 'start'), storedInput('stored-source', identity, '/input/scope/end', period.end, 'end')];
}
/** The sales-sample quarter holding most of its inclusive days, the later one on a tie. A requested period is not evidence of data. */
export function marketReportQuarter(input: AutomationReportInput): { quarter: string; range: string } {
  const period = marketSamplePeriod(input);
  if (!period) return { quarter: 'Chưa xác định quý dữ liệu', range: 'Chưa có kỳ số liệu bán hàng hợp lệ' };
  const main = marketMainQuarter(period.start, period.end), inputs = marketSamplePeriodInputs(input, period);
  const record = (token: string, formula: string, formulaId: 'quarter' | 'year'): string => traceMarketNumber(token, 'page.cover.quarter', 'computed', inputs, formula, formulaId);
  const day = (value: string, at: number): string => traceMarketNumber(readerDay(value), 'page.cover.period', 'raw', [inputs[at]!], 'stored day dd/mm/yyyy', 'vi-date');
  return { quarter: `Quý ${record(String(main.quarter), 'quarter holding most inclusive days of the sample period, later on a tie', 'quarter')} năm ${record(String(main.year), 'year of that quarter', 'year')}`,
    range: `Dữ liệu từ ${escape(day(period.start, 0))} đến ${escape(day(period.end, 1))}` };
}
interface CatalogSection { sectionId: string; title: string; methodId: string; methodVersion: string; requiredInputs: string[] }
export interface MethodOutputRef { methodOutputId: string; locatedRecordCount: number; unresolvedPointers: readonly string[]; blockers: readonly string[] }
interface DraftSection { sectionId: string; title: string; state: 'SOURCE_CONTEXT' | 'SOURCE_TABLE' | 'EVIDENCE_INVENTORY' | 'METHOD_OUTPUT' | 'METHOD_NO_USABLE_RECORDS' | 'BLOCKED'; method: string; explanation: string; rows: readonly TypedComparable[]; methodOutput?: MethodOutputRef }
const catalog = JSON.parse(fs.readFileSync(new URL('../../../../docs/research/report-section-catalog-v1.json', import.meta.url), 'utf8')) as { sections: CatalogSection[] };
const escape = escapeHtml;
const stepLabel = (stepId: CaptureRecord['stepId']): string => stepId === 'QUICK_SEARCH' ? 'Tìm sản phẩm' : 'Thu dữ liệu';
/** The catalog method id is a lookup code; one that carries a provider name stays in the stored semantic only. */
const methodReference = (method: string): string => readerSafe(method) ? escape(method) : 'mã phương pháp kỹ thuật chỉ có trong bản lưu';
const measureLabel: Readonly<Record<TypedComparable['metric'], string>> = { GMV_VND: 'Doanh thu (VND)', UNITS_SOLD: 'Sản lượng bán' };
// The registry refuses a malformed timestamp, so a legacy or unexpected value loses its date instead of failing the build.
const STORED_ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;
const storedDate = (value: string | null): string | null =>
  value !== null && STORED_ISO_DATE.test(value) && !Number.isNaN(Date.parse(value)) ? value : null;
/** One number per stored capture: provider, operation and step stay in the technical trace only. */
function captureMark(capture: CaptureRecord, citations: ReportCitations, label = 'Bản thu dữ liệu nguồn'): string {
  return citations.mark({ sourceKind: 'CAPTURE', identity: capture.artifactSha256.trim() === '' ? null : capture.artifactSha256, locator: null,
    label, retrievedAt: storedDate(capture.retrievedAt), url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: { provider: capture.provider, operation: capture.operation, step: capture.stepId } });
}
/** Only a canonical https URL can be linked; anything else keeps no lineage and shows "Chưa có nguồn". */
function webMark(row: StepWebResult, citations: ReportCitations): string {
  const canonical = ((): string | null => {
    try { const url = new URL(row.url); return url.protocol === 'https:' ? `${url.origin}${url.pathname}` : null; } catch { return null; }
  })();
  // URL canonicalization is a structural safety check, not reader prose. The
  // reader sanitizer rejects slash-heavy technical paths, which must not make
  // an otherwise valid https citation disappear.
  const url = canonical;
  // An address naming a provider or the search engine is never cited: the register would print it.
  if (url !== null && (webTextHidden(url) || hasHiddenName(url, 'CITATION'))) return escape(WEB_LINK_WITHHELD);
  const site = row.site ?? '';
  return citations.mark({ sourceKind: 'WEB_RESULT', identity: url, locator: null,
    label: site !== '' && readerSafe(site) && !webTextHidden(site) && !hasHiddenName(site, 'CITATION') ? site : 'Kết quả tìm kiếm trên web', retrievedAt: storedDate(row.retrievedAt), url,
    quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: { position: String(row.position), capture: String(row.captureIndex), ...(site === '' ? {} : { site }) } });
}
/** Copied search-result text follows the stored-literal rule and is also withheld when it names a provider or the search engine. */
const webText = (value: string, withheld: string, currentReader = false): string => webTextHidden(value) || (currentReader && /\bM(?:0[1-9]|1[0-3])\b/u.test(value)) ? withheld : currentReader ? storedLiteral(value, withheld, true) : storedLiteral(value, withheld);
/** A title, site name or free-form publication label is source wording, not the report's own claim. */
const webSourceText = (value: string, withheld: string, currentReader = false): string => { const text = webText(value, withheld, currentReader); return text === withheld ? text : `<q data-quote>${text}</q>`; };

/** Current-reader prose transforms leave copied evidence and opaque markup intact. */
function currentReaderProse(html: string, rewrite: (text: string) => string): string {
  const quoted: string[] = [];
  return html.split(/(<!--[\s\S]*?-->|<head\b[\s\S]*?<\/head\s*>|<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>|<svg\b[\s\S]*?<\/svg\s*>|<select\b[\s\S]*?<\/select\s*>|<(?:[^<>"']|"[^"]*"|'[^']*')+>)/giu).map((part, index) => {
    if (index % 2) {
      if (/^<!--|^<(?:head|script|style|svg|select)\b/iu.test(part)) return part;
      const tag = /^<(\/?)\s*([\w-]+)/u.exec(part);
      if (tag?.[1] && tag[2]?.toLowerCase() === quoted.at(-1)) quoted.pop();
      else if (tag && !tag[1] && !/\/>$/u.test(part) && !/^(?:br|hr|img|input|wbr|area|base|col|embed|link|meta|param|source|track)$/iu.test(tag[2]!)) {
        if (quoted.length || /^(?:q|blockquote)$/iu.test(tag[2]!) || /\sdata-quote(?:\s|=|>)/iu.test(part.replace(/"[^"]*"|'[^']*'/gu, ''))) quoted.push(tag[2]!.toLowerCase());
      }
      return part;
    }
    return quoted.length ? part : rewrite(part);
  }).join('');
}
/** A closed machine code stays in the report's technical trace without sitting in the reader's sentence. */
const codeNote = (code: string): string => `<details class="evidence-trace"><summary>Mã đối chiếu của trạng thái này</summary><p><code>${escape(code)}</code></p></details>`;
const literalFamilies: readonly LiteralFamily[] = ['I02', 'I04', 'I05', 'I07', 'I08'];
const isLiteralFamily = (id: string): id is LiteralFamily => literalFamilies.some(family => family === id);

/** A retained source is not a usable coding result. Failure flags come from the source-owning service. */
function retainedReviewStatus(input: AutomationReportInput): string | null {
  if (input.reviewCorpusFailure === 'REVIEW_CORPUS_REPORT_TOO_LARGE' || input.nativeReviewFailure === 'NATIVE_REVIEW_REPORT_TOO_LARGE')
    return 'Nguồn review đã được lưu và vẫn được giữ đầy đủ, nhưng phần trích dẫn hoặc phương pháp vượt giới hạn kích thước bản báo cáo này. Chưa đưa phần đó vào kết quả hiển thị; không cắt dữ liệu hoặc tự thu lại nguồn.';
  if (input.reviewCorpusFailure || input.nativeReviewFailure || input.locatedReviewFailure)
    return 'Nguồn review đã được lưu, nhưng bước xử lý hoặc mã hóa chưa vượt qua kiểm tra. Chưa dùng phần chưa xác minh làm kết quả; cần kiểm tra phương pháp, không tự thu lại nguồn.';
  if (input.reviewCorpus || input.locatedReview || input.locatedReviewFallback || input.nativeReviewFallback || input.collection?.nativeReview || input.collection?.exactShopee)
    return 'Nguồn review đã được lưu nhưng chưa có lớp mã hóa đã kiểm tra cho mục này.';
  return null;
}

/**
 * Insight sections that read the review corpus, so a missing Shopee review collection affects them:
 * - I02, I04, I05, I07, I08: literal reading of located reviews (`literalFamilies`, `renderLocatedInsightSection`);
 * - I06, I09, I10, I13 (and the five above): coding families over the same records (`codingFamilies`, `semanticCodingFamilies`);
 * - I03, I17: review source status, corpus trace and quotes (`reviewCorpusSection`, `corpusTraceSection`, `retainedReviewStatus`).
 * No market section reads reviews.
 */
export const REVIEW_DEPENDENT_SECTIONS: readonly { readonly sectionId: string; readonly title: string }[] = [
  { sectionId: 'I02', title: 'Khách hàng và hoàn cảnh' }, { sectionId: 'I03', title: 'Phương pháp nghiên cứu' },
  { sectionId: 'I04', title: 'Hành vi' }, { sectionId: 'I05', title: 'Cảm nhận và thái độ' }, { sectionId: 'I06', title: 'Hành trình' },
  { sectionId: 'I07', title: 'Lý do lựa chọn' }, { sectionId: 'I08', title: 'Rào cản' }, { sectionId: 'I09', title: 'Nhu cầu chưa được đáp ứng' },
  { sectionId: 'I10', title: 'Chủ đề và mối quan tâm' }, { sectionId: 'I13', title: 'Thương hiệu và đối thủ' }, { sectionId: 'I17', title: 'Phụ lục và bằng chứng' },
];

type ReviewOutcome = NonNullable<StepResultDocument['exactShopeeOutcome']>;
const REVIEW_TARGET = 300;
/** A non-OK outcome bound to this report's exact collection; old runs, OK runs and replaced review sources show nothing. */
function missingReviewOutcome(input: AutomationReportInput): ReviewOutcome | null {
  const value = input.collection?.exactShopeeOutcome;
  return value && !input.publicReviewSource && input.collection?.exactShopee && value.testReviewCap === undefined && value.outcome !== 'OK' ? value : null;
}
/** dd/mm/yyyy in Vietnam time (UTC+7, no daylight saving). */
const vietnamDate = (iso: string): string => {
  const day = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString();
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
};
const reviewOutcomeLead = (value: ReviewOutcome): string => {
  const withReviews = value.listings.filter(row => row.reviews > 0).length;
  const short = value.listings.filter(row => row.shortfallReason !== undefined || row.reviews === 0);
  return value.outcome === 'PARTIAL_LISTINGS'
    ? `Lần thu ngày ${vietnamDate(value.attemptedAt)} chỉ lấy được đánh giá Shopee cho ${withReviews}/${value.listings.length} sản phẩm đã chọn. ${short.length > 0 ? `Có ${short.length} sản phẩm chưa đạt mốc ${REVIEW_TARGET} bình luận (${short.map(row => `${row.reviews}/${REVIEW_TARGET}`).join(', ')}). ` : ''}Phần ý kiến khách hàng chỉ dựa trên các sản phẩm có đánh giá.`
    : `Lần thu ngày ${vietnamDate(value.attemptedAt)} không lấy được đánh giá Shopee nào cho ${value.listings.length} sản phẩm đã chọn. Phần ý kiến khách hàng trong báo cáo này chưa có dữ liệu.`;
};
function reviewOutcomeNotice(value: ReviewOutcome, kind: 'MARKET' | 'INSIGHT'): string {
  const short = value.listings.filter(row => row.shortfallReason !== undefined || row.reviews === 0);
  // The listing URL is a source locator, not reader text (readerSafe refuses it, and the
  // Market presentation audit fails rule 3 on its /product/<id> path). Keep it in the link
  // target only; the reader sees the same ordinal the review sample table uses.
  return `<div class="warning review-outcome-notice" role="note"><p><strong>${value.outcome === 'PARTIAL_LISTINGS' ? 'Thiếu một phần đánh giá khách hàng Shopee.' : 'Thiếu đánh giá khách hàng Shopee.'}</strong> ${escape(reviewOutcomeLead(value))}</p>`
    + `<p>Sản phẩm chưa đạt mốc ${REVIEW_TARGET} bình luận:</p><ul>${short.map(row => `<li><a href="${escape(row.listingUrl)}" rel="noopener noreferrer">Sản phẩm #${value.listings.indexOf(row) + 1}</a> — Sản phẩm này chỉ lấy được ${row.reviews}/${REVIEW_TARGET} bình luận.</li>`).join('')}</ul>`
    + `<p><strong>Phần bị ảnh hưởng${kind === 'MARKET' ? ' (trong báo cáo insight)' : ''}:</strong> ${escape(REVIEW_DEPENDENT_SECTIONS.map(section => `${section.sectionId} ${section.title}`).join('; '))}.</p>`
    + '<p><strong>Phần vẫn dùng được:</strong> doanh thu, giá, đối thủ, nhu cầu tìm kiếm.</p></div>';
}

export type DeclarationSnapshot = Extract<AutomationLocatedReviewSnapshot, { contractVersion: 'automation-located-review-snapshot-v2' }> | NativeSourceReviewSnapshot;
export function literalPendingSection(snapshot: DeclarationSnapshot, family: LiteralFamily, citations: ReportCitations): { notice: string; details: string } {
  const pending = snapshot.projection.pending.filter(row => row.family === family);
  const blocked = snapshot.projection.blocked.filter(row => row.family === family);
  const coverage = snapshot.projection.coverage.families[family];
  const notice = `<p class="warning">Kết quả từng phần: ${coverage.admittedCandidates} khai báo được đưa vào, thuộc ${coverage.admittedRecords} bản ghi nguồn; ${pending.length} mục còn chờ xử lý. Đây không phải số người hoặc tỷ lệ của thị trường. Chưa tìm thấy mẫu phù hợp với quy tắc không có nghĩa là nguồn phủ nhận hành vi hay cảm nhận đó.</p>`;
  if (pending.length === 0 && blocked.length === 0) return { notice, details: '' };
  const rows = pending.slice(0, 20).map(row => {
    const record = snapshot.output.input.records[row.recordIndex]!;
    return `<tr><td>${row.span ? `${retainedQuoteHtml(row.span.quote)}` : 'Chưa xác lập đoạn đọc; giữ nguyên toàn văn trong hồ sơ nguồn.'}</td><td>${reviewRecordMark(record, citations)} ${attributionText(record.sourceAttribution, 'Chưa có ghi nhận nguồn')}<br><code class="loc">${technicalLiteral(record.locator)}</code>${row.trigger ? `<details><summary>Từ đánh dấu, không thay thế đoạn đọc</summary>${retainedQuoteHtml(row.trigger.quote)}</details>` : ''}</td><td>${glossedCodes(row.reason, pendingReasonGloss)}</td></tr>`;
  }).join('');
  return { notice, details: `<details><summary>Xem phần còn chờ xử lý (${pending.length})</summary><p>Phần này chưa được đưa vào kết quả mã hóa. ${blocked.length} khai báo ứng viên bị giữ lại theo quy tắc đọc; con số này không cộng với số mục chờ thành số review.</p>${rows ? `<div class="table-wrap" role="region" aria-label="Các đoạn nguồn còn chờ xử lý" tabindex="0"><table><caption>Đoạn nguồn chưa đủ điều kiện mã hóa</caption><thead><tr><th scope="col">Đoạn đọc</th><th scope="col">Vị trí nguồn</th><th scope="col">Lý do chờ (mã đối chiếu)</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}${pending.length > 20 ? `<p>Trang này hiển thị 20 trong ${pending.length} mục chờ theo thứ tự nguồn. Toàn bộ được giữ trong hồ sơ phương pháp đã lưu.</p>` : ''}</details>` };
}

function nativeReviewContext(snapshot: NativeSourceReviewSnapshot, readerPlainText = true): string {
  const records = snapshot.output.input.records;
  const counts = (disposition: string): number => records.filter(record => record.disposition === disposition).length;
  const selected = snapshot.nativeSource.selected;
  const summary = `<h3>Tập phản hồi nguồn đã lưu</h3><dl><dt>Nguồn</dt><dd>Tập con phản hồi của một mục sản phẩm Shopee, đã được lưu cùng lượt này</dd><dt>Sản phẩm đã chọn</dt><dd>${readerPlainText ? `${escape(readerShopLabel(selected.shopId))} · ${escape(readerProductLabel(selected.itemId, undefined))}` : `Gian hàng ${escape(selected.shopId)} · Sản phẩm ${escape(selected.itemId)}`}</dd><dt>Thời điểm thu nguồn</dt><dd>${escape(snapshot.nativeSource.sourcePackage.manifest.sourceAcquiredAt ?? 'Chưa khai báo')}</dd><dt>Độ phủ bản ghi</dt><dd>${records.length} dòng nguồn: ${counts('INCLUDED')} đưa vào đọc, ${counts('EXCLUDED')} loại khỏi đọc, ${counts('UNREADABLE')} không đọc được.</dd></dl><p class="warning">Đây là bản thu có sẵn, không phải lượt gọi nhà cung cấp mới. Mã sản phẩm khớp cấu trúc; chưa xác thực tác giả, biến thể hay toàn bộ lịch sử phản hồi. Ngày nguồn không tự xác lập độ phủ kỳ báo cáo. Số dòng không phải số người. Nguồn này được giữ riêng, không gộp hoặc đổi tên thành tập thu của nhà cung cấp khác.</p>`;
  return summary;
}

export function corpusTraceSection(trace: CorpusTrace, sectionId: 'I03' | 'I17', citations: ReportCitations): string {
  const c = trace.counts;
  const summary = `<h3>Độ phủ của lớp mã hóa lời nguồn</h3><p>Đơn vị đếm là bản ghi ở đúng mã băm tệp và vị trí nguồn, không phải người dùng. Tập này có thể nhỏ hơn toàn bộ dữ liệu thu vì còn dòng tách riêng ở lớp nguồn thô.</p><dl><dt>Dòng đầu vào phương pháp</dt><dd>${c.inputRows}</dd><dt>Bản ghi duy nhất</dt><dd>${c.uniqueRecords} (${c.duplicateRows} dòng trùng đồng nhất)</dd><dt>Trạng thái đọc</dt><dd>${c.included} đưa vào đọc, ${c.excluded} loại khỏi đọc, ${c.unreadable} không đọc được</dd><dt>Khai báo được đưa vào</dt><dd>${c.admittedCandidates} khai báo thuộc ${c.admittedRecords} bản ghi</dd><dt>Còn chờ xử lý</dt><dd>${c.pendingItems} mục thuộc ${c.pendingRecords} bản ghi</dd><dt>Ứng viên bị giữ lại</dt><dd>${c.blockedCandidates} ứng viên thuộc ${c.blockedRecords} bản ghi</dd></dl><p class="warning">Một bản ghi có thể vừa có khai báo được đưa vào, vừa có mục chờ hoặc ứng viên bị giữ lại. Không cộng các nhóm này thành tổng review. Quy tắc được duyệt chỉ cho phép đọc khai báo bám lời nguồn; không có nghĩa OWNER đã duyệt từng nhãn hoặc nhận định phân tích. Chưa có tỷ lệ chủ đề hay mẫu số khách hàng.</p>`;
  if (sectionId === 'I03') return summary + `<div class="table-wrap" role="region" aria-label="Độ phủ theo nhóm mã hóa lời nguồn" tabindex="0"><table><caption>Các nhóm có thể dùng chung một bản ghi, không cộng dồn thành số người</caption><thead><tr><th scope="col">Mục báo cáo</th><th scope="col">Khai báo được đưa vào</th><th scope="col">Bản ghi duy nhất</th></tr></thead><tbody>${trace.families.map(row => `<tr><th scope="row"><a href="#${row.family}">${row.family}</a></th><td>${row.admittedCandidates}</td><td>${row.admittedRecords}</td></tr>`).join('')}</tbody></table></div>`;
  const rows = trace.records.map(record => `<tr><td>${reviewRecordMark(record, citations)}<br><code>${escape(record.sourceSha256)}</code><br><code class="loc">${technicalLiteral(record.locator)}</code><br>${attributionText(record.sourceAttribution, 'Chưa có ghi nhận nguồn')}</td><td>${record.text === null ? 'Không có văn bản đọc được' : `${retainedQuoteHtml(record.text)}`}<br>${record.timeText === null ? 'Ngày nguồn chưa có' : storedLiteral(record.timeText, 'Ngày nguồn được giữ trong bản lưu')}</td><td>${glossedCodes(record.disposition, dispositionGloss)}${record.dispositionReason ? `<br>${glossedCodes(record.dispositionReason, dispositionGloss)}` : ''}<br>${record.admitted} khai báo đưa vào; ${record.pending} mục chờ; ${record.blocked} ứng viên giữ lại${record.inputIndexes.length > 1 ? `<br>${record.inputIndexes.length} dòng đầu vào trùng đồng nhất` : ''}</td></tr>`).join('');
  return `<h3>Đối chiếu bản ghi với lớp mã hóa</h3><p>Giữ nguyên toàn văn, ngày nguồn và trạng thái đọc. Nội dung tự do có thể chứa thông tin cá nhân. Các số trong mỗi hàng đếm những loại mục khác nhau, không cộng thành số review hoặc số người. ${recordNumberNote}</p><details class="evidence-trace"><summary>Hồ sơ đối chiếu gói phương pháp của lớp mã hóa</summary><p>Gói phương pháp: <code>${escape(trace.sourcePackage.packageId)}</code>. Bản kê: <code>${escape(trace.sourcePackage.manifestArtifactSha256)}</code>. Kết quả: <code>${escape(trace.methodOutputId)}</code>. Bản chiếu khai báo: <code>${escape(trace.projectionSha256)}</code>. Quy tắc: <code>${escape(trace.policySha256)}</code>.</p></details><details><summary>Đối chiếu ${c.uniqueRecords} bản ghi duy nhất trong lớp mã hóa</summary><div class="table-wrap" role="region" aria-label="Bản ghi và trạng thái mã hóa lời nguồn" tabindex="0"><table><caption>Vị trí nguồn chính xác và trạng thái từng bản ghi</caption><thead><tr><th scope="col">Mã băm / Vị trí / Ghi nguồn</th><th scope="col">Nguyên văn / Ngày nguồn</th><th scope="col">Trạng thái đọc và mã hóa</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Không có bản ghi đầu vào phương pháp; không suy ra không có phản hồi khách hàng.</td></tr>'}</tbody></table></div></details>`;
}

export type CodingFamily = 'I02' | 'I04' | 'I05' | 'I06' | 'I07' | 'I08' | 'I09' | 'I10' | 'I13';
const codingFamilies: readonly CodingFamily[] = ['I06', 'I09', 'I10', 'I13'];
const semanticCodingFamilies: readonly CodingFamily[] = ['I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I13'];
const usesCodingFamily = (coding: AutomationInsightCodingSnapshot | undefined, id: string): boolean => {
  if (!coding) return false;
  // Draft snapshots carry no selection version: their explicit draft marker routes all semantic families.
  if ('draftSelection' in coding) return semanticCodingFamilies.some(family => family === id);
  return (('selectionContractVersion' in coding && coding.selectionContractVersion === 'automation-insight-selection-v2') ? semanticCodingFamilies : codingFamilies).some(family => family === id);
};
const codingCaveat = 'Biên nhận chỉ ghi nhận lựa chọn trên đề xuất mã hóa. Không nâng cấp bằng chứng nguồn, không xác thực ý nghĩa, không thêm hoặc bỏ bản ghi; phần chưa chọn vẫn chờ xử lý.';

function codedRecordIndex(output: LocatedInsightMethods, pointer: string): number {
  const match = /^\/input\/(?:i13Mentions\/(0|[1-9]\d*)|corpora\/(0|[1-9]\d*)\/assignments\/(0|[1-9]\d*))$/.exec(pointer);
  const row = match?.[1] !== undefined ? output.input.i13Mentions[Number(match[1])] : match ? output.input.corpora[Number(match[2])]?.assignments[Number(match[3])] : undefined;
  if (!row) throw new Error('Report insight coding pointer mismatch');
  return row.recordIndex;
}

/** Usability comes from the calculated section contract, never from the mere presence of a selection snapshot. */
export function insightCodingView(coding: AutomationInsightCodingSnapshot, family: CodingFamily, citations: ReportCitations): { usable: boolean; explanation: string; html: string; methodOutput: MethodOutputRef } {
  const output = coding.output;
  const draft = 'draftSelection' in coding;
  let usable: boolean, records: number, pending: readonly string[], blockers: readonly string[], completeRatio = false;
  // Draft classified counts exist only for I02 summaries and I10/I13 corpus
  // counts. Other families keep their raw accepted-only method output; the
  // explanation below qualifies it explicitly instead of relabelling it.
  let draftUnsupportedFamily: string | null = null;
  if (family !== 'I10' && family !== 'I13') {
    const section = output.sections[family];
    // Only I02 summaries ever carry draft fields; I04/I07/I08 share the
    // section shape but the builder never emits them, and I05/I06/I09 keep
    // accepted-only output by contract.
    const draftPointers = draft && 'draftAnnotationPointers' in section ? section.draftAnnotationPointers ?? [] : [];
    const draftRecords = draft && 'draftLocatedRecordCount' in section ? section.draftLocatedRecordCount ?? section.locatedRecordCount : section.locatedRecordCount;
    if (draft && !('draftAnnotationPointers' in section && section.draftAnnotationPointers !== undefined)) draftUnsupportedFamily = family;
    const remainingPending = draft ? section.pendingAnnotationPointers.filter(pointer => !draftPointers.includes(pointer)) : section.pendingAnnotationPointers;
    usable = draftUnsupportedFamily ? false : section.annotationPointers.length > 0 || draftPointers.length > 0;
    records = draft && !draftUnsupportedFamily ? draftRecords : section.locatedRecordCount;
    pending = draft ? remainingPending : section.pendingAnnotationPointers;
    blockers = section.blockers;
  } else {
    const section = output.sections[family];
    const coded = new Set([...section.mentionPointers, ...section.corpora.flatMap(corpus => corpus.counts.flatMap(count => count.annotationPointers))].map(pointer => codedRecordIndex(output, pointer)));
    completeRatio = section.corpora.some(corpus => corpus.codingComplete && corpus.ratioStatus === 'COMPLETE');
    // Draft record totals deduplicate stable source identity across codes and
    // corpora; per-code memberships are never summed into a record count.
    const draftKeys = draft ? new Set(
      section.corpora.flatMap(corpus => corpus.draftCounts ?? []).flatMap(count => count.annotationPointers)
        .map(pointer => {
          const record = output.input.records[codedRecordIndex(output, pointer)]!;
          return `${record.sourceSha256}${record.locator}`;
        }),
    ) : undefined;
    const draftRecords = draftKeys?.size ?? 0;
    usable = coded.size > 0 || completeRatio || draftRecords > 0;
    records = draft ? draftRecords : coded.size;
    pending = [...section.pendingMentionPointers, ...section.corpora.flatMap((corpus, index) => corpus.pendingCount > 0 ? [`/sections/${family}/corpora/${index}`] : [])];
    blockers = [...new Set([...section.blockers, ...section.corpora.flatMap(corpus => corpus.blockers)])];
  }
  const state = draftUnsupportedFamily
    ? `Bản nháp chưa tính số đề xuất cho mục ${draftUnsupportedFamily} (chỉ hỗ trợ I02/I10/I13).`
    : usable
    ? `${draft ? 'Đề xuất có kết quả dùng được (đề xuất, chờ chủ duyệt)' : 'Phần đã chọn có kết quả dùng được'}${pending.length ? '; phần chưa chọn vẫn chờ xử lý' : ''}.${completeRatio && !draft ? ' n/N chỉ tính trong tập bản ghi đã khai báo, không phải tỷ lệ thị trường.' : ''}`
    : pending.length ? 'Chưa có phần được chọn dùng được cho mục này; đề xuất chưa chọn vẫn chờ xử lý. Đây không phải kết quả bằng 0.'
    : blockers.length ? 'Chưa có kết quả dùng được vì hồ sơ phương pháp còn điều kiện chặn. Đây không phải kết quả bằng 0.'
    : 'Đề xuất không có mã hóa cho mục này. Không suy ra nguồn không nhắc tới nội dung đó.';
  const notice = draft
    ? `<p class="warning">Dựa trên đề xuất mã hóa (đề xuất, chờ chủ duyệt). Bản nháp này không dùng biên nhận chấp nhận; biên nhận đã lưu (nếu có) vẫn được giữ nguyên. Số liệu là đề xuất AI, không phải kết quả đã duyệt; bản ghi gốc, tập mẫu và phần chờ được giữ nguyên; dấu vết đối chiếu ở <a href="#I17">I17</a>.</p><p class="sec-note">Trên màn hình hẹp, cuộn ngang bảng để xem đủ nội dung và tỷ lệ. Có thể dùng phím mũi tên khi bảng được chọn bằng Tab.</p>`
    : `<p class="warning">Dựa trên ${coding.receipts.length} biên nhận lựa chọn cho một đề xuất mã hóa. Biên nhận xác nhận lựa chọn của người dùng, không xác thực lời kể hoặc khai báo của người mã hóa. Bản ghi gốc, tập mẫu và phần chờ được giữ nguyên; dấu vết đối chiếu ở <a href="#I17">I17</a>.</p><p class="sec-note">Trên màn hình hẹp, cuộn ngang bảng để xem đủ nội dung và tỷ lệ. Có thể dùng phím mũi tên khi bảng được chọn bằng Tab.</p>`;
  return {
    usable, html: notice + renderLocatedInsightSection(output, family, { bundleDownload: false, citations })!,
    explanation: `${draft ? 'Đoạn đề xuất là mã hóa bám lời nguồn trên đề xuất, chưa được chọn hay duyệt' : 'Đoạn được chọn là mã hóa bám lời nguồn trên đề xuất, theo quy tắc đã duyệt'}; không phải quan sát độc lập và chưa phải mục phân tích hoàn chỉnh.${draftUnsupportedFamily ? ` Số cho mục ${draftUnsupportedFamily} là số cũ theo khai báo đã lưu, không phải số đề xuất của bản nháp và chưa được chủ duyệt.` : ''} ${state}`,
    methodOutput: { methodOutputId: output.methodOutputId, locatedRecordCount: records, unresolvedPointers: pending, blockers },
  };
}

export function draftInsightGroupsView(coding: Extract<AutomationInsightCodingSnapshot, { contractVersion: 'automation-insight-coding-snapshot-v3' | 'automation-insight-coding-snapshot-v4' | 'automation-insight-coding-snapshot-v5' }>, citations: ReportCitations): string {
  const result = coding.groupCounts;
  let html = '<p>Số đề xuất từ cùng hồ sơ mã hóa đã lưu; bản nháp này không dùng biên nhận chấp nhận. Mỗi tập giữ riêng bộ mã, kỳ, khung thu thập và thành viên; không cộng các tập hoặc các mã thành một tổng.</p><p>Chưa có bằng chứng phân biệt mua lẻ và mua sỉ; không tự đoán từ tên người viết hoặc câu chữ. Chưa công bố tỷ lệ hay chênh lệch từ mã hóa bản nháp; kiểm chéo và điều kiện so nhóm còn thiếu.</p>';
  if (!result.groups.length) return html + '<p>Chưa có nhóm với bằng chứng nền tảng và mã hóa tương thích; chưa có số đếm dùng được. Đây không phải kết quả bằng 0.</p>';
  for (const group of result.groups) {
    const corpus = coding.output.input.corpora[group.corpusIndex]!;
    const metadata = (value: string | null) => value === null ? 'Chưa khai báo' : storedLiteral(value, 'Thông tin được giữ trong hồ sơ nguồn');
    html += `<h4>Shopee · ${group.sectionId === 'I10' ? 'Chủ đề và mối quan tâm' : 'Thương hiệu và đối thủ'}</h4><p data-classified="pending">Phạm vi nhóm có ${group.memberCount} bản ghi có chữ (đề xuất, chờ chủ duyệt); đây là thành viên nguồn, chưa phải số đã mã hóa xong.</p><dl><dt>Kỳ</dt><dd>${metadata(group.scope.period)}</dd><dt>Khung thu thập</dt><dd>${metadata(group.scope.frame)}</dd><dt>Đơn vị</dt><dd>${metadata(group.scope.unit)}</dd><dt>Phiên bản bộ mã</dt><dd>${metadata(group.codebookRevision)}</dd></dl>`;
    const rows = group.counts.slice(0, 20).map(count => {
      const code = corpus.codebook.codes.find(item => item.code === count.code)!;
      const refs = count.recordPointers.slice(0, 20).map(pointer => {
        const record = coding.output.input.records[Number(pointer.slice('/input/records/'.length))]!;
        return `<li>${reviewRecordMark(record, citations)}</li>`;
      }).join('');
      return `<tr><td>${metadata(code.label)}</td><td${count.recordCount === null ? '' : ' data-classified="pending"'}>${count.recordCount === null ? 'Chưa có số đề xuất dùng được' : `${count.recordCount} bản ghi (${escape(count.label)})`}</td><td>${refs ? `<ul>${refs}</ul>` : 'Chưa có đoạn được đưa vào số đề xuất'}</td></tr>`;
    }).join('');
    html += `<div class="table-wrap"><table class="obs"><caption>Số theo mã trong nhóm (đề xuất, chờ chủ duyệt)</caption><thead><tr><th>Mã hóa đề xuất</th><th>Số bản ghi</th><th>Vị trí nguồn</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    if (group.counts.length > 20) html += '<p>Bảng hiển thị một phần theo thứ tự bộ mã; hồ sơ đã lưu giữ toàn bộ kết quả.</p>';
  }
  return html + '<p>Chỉ có nguồn Shopee trong hồ sơ này; chưa có đối chiếu nền tảng khác. Đơn vị là bản ghi trong mẫu, không phải người hoặc tỷ lệ khách hàng.</p>';
}

export function insightCodingTrace(coding: AutomationInsightCodingSnapshot, sectionId: 'I03' | 'I17'): string {
  if (coding.contractVersion === 'automation-insight-coding-snapshot-v4' || coding.contractVersion === 'automation-insight-coding-snapshot-v5') {
    const binding = coding.binding;
    return `<h3>${sectionId === 'I03' ? 'Phương pháp mã hóa mặc định' : 'Dấu vết mã hóa mặc định'} (đề xuất, chờ chủ duyệt)</h3><p>Quy tắc và bộ mã là đề xuất theo nguồn đã lưu; chưa có duyệt của chủ. Không dùng biên nhận chấp nhận. ${codingCaveat}</p><p>${escape(DEFAULT_INSIGHT_MULTICODE_LIMIT)}</p><details class="evidence-trace"><summary>Hồ sơ đối chiếu đề xuất mặc định</summary><dl><dt>Quy tắc đề xuất</dt><dd><code>${escape(coding.defaultRuleId)}</code> · <code>${escape(coding.defaultRuleSha256)}</code></dd><dt>Đề xuất</dt><dd><code>${escape(coding.selection.proposalId)}</code> · <code>${escape(coding.proposalSha256)}</code></dd><dt>Bộ mã SHA-256</dt><dd><code>${escape(coding.codebookSha256)}</code></dd><dt>Lần thực thi model</dt><dd><code>${escape(coding.executionId)}</code></dd><dt>Cặp nguồn</dt><dd><code>${escape(binding.pairId)}</code></dd><dt>Gói nguồn</dt><dd><code>${escape(binding.sourcePackageSha256)}</code></dd><dt>Đầu vào</dt><dd><code>${escape(binding.inputSha256)}</code></dd></dl></details>`;
  }
  const count = coding.receipts.length;
  const draft = 'draftSelection' in coding;
  const families = ('draftSelection' in coding) || ('selectionContractVersion' in coding && coding.selectionContractVersion === 'automation-insight-selection-v2') ? semanticCodingFamilies : codingFamilies;
  if (sectionId === 'I03') return `<h3>${draft ? 'Đề xuất mã hóa (đề xuất, chờ chủ duyệt)' : 'Mã hóa đã chọn'} cho ${families.join(', ')}</h3><p>${draft ? 'Một đề xuất mã hóa theo quy tắc đã duyệt. Bản nháp này không dùng biên nhận chấp nhận; biên nhận đã lưu (nếu có) vẫn được giữ nguyên. ' : `Đã chọn một đề xuất mã hóa theo quy tắc đã duyệt, ghi bằng ${count} biên nhận. `}${codingCaveat} Dấu vết đối chiếu ở <a href="#I17">I17</a>.</p><details class="evidence-trace"><summary>Hồ sơ đối chiếu mã hóa${draft ? ' đề xuất' : ' đã chọn'}</summary><p>Đề xuất: <code>${escape(coding.selection.proposalId)}</code>. Quy tắc đã duyệt: <code>${escape(coding.adoptionId)}</code>.</p></details>`;
  const binding = coding.binding;
  const rows = coding.receipts.map(receipt => `<tr><td><code>${escape(receipt.receiptId)}</code></td><td><code>${escape(receipt.sha256)}</code></td></tr>`).join('');
  return `<h3>${draft ? 'Dấu vết đề xuất mã hóa (đề xuất, chờ chủ duyệt)' : 'Dấu vết mã hóa đã chọn'}</h3><p class="warning">${codingCaveat}</p><details class="evidence-trace"><summary>Hồ sơ đối chiếu mã hóa${draft ? ' đề xuất' : ' đã chọn'}</summary><dl><dt>Đề xuất</dt><dd><code>${escape(coding.selection.proposalId)}</code></dd><dt>SHA-256 đề xuất</dt><dd><code>${escape(coding.proposalSha256)}</code></dd><dt>Quy tắc đã duyệt</dt><dd><code>${escape(coding.adoptionId)}</code></dd><dt>Nguồn gắn</dt><dd>${binding.sourceKind === 'NATIVE' ? 'Review native của listing đã chọn' : 'Collection Shopee chính xác'}</dd><dt>SHA-256 gói nguồn</dt><dd><code>${escape(binding.sourcePackageSha256)}</code></dd><dt>SHA-256 đầu vào</dt><dd><code>${escape(binding.inputSha256)}</code></dd><dt>Cặp báo cáo nguồn</dt><dd><code>${escape(binding.pairId)}</code></dd><dt>Kết quả phương pháp</dt><dd><code>${escape(coding.output.methodOutputId)}</code></dd></dl></details>${draft ? '<p>Bản nháp này không dùng biên nhận chấp nhận; biên nhận đã lưu (nếu có) vẫn được giữ nguyên.</p>' : `<details><summary>Biên nhận lựa chọn (${count})</summary><div class="table-wrap" role="region" aria-label="Biên nhận lựa chọn mã hóa" tabindex="0"><table><caption>Biên nhận lựa chọn đã lưu cho đề xuất này</caption><thead><tr><th scope="col">Mã biên nhận</th><th scope="col">SHA-256</th></tr></thead><tbody>${rows}</tbody></table></div></details>`}`;
}
const inputLabels: Readonly<Record<string, string>> = {
  'validated-metrics': 'số liệu đã kiểm tra', 'source-bound-claims': 'nhận định có tham chiếu nguồn', 'owner-review': 'duyệt của người dùng',
  'source-manifest': 'bản kê nguồn', 'source-package-manifest': 'bản kê gói nguồn', 'verified-locators': 'vị trí bằng chứng đã xác minh',
  'normalized-metric-rows': 'số liệu thị trường đã chuẩn hóa', 'frozen-label-decisions': 'nhãn phân loại đã chốt', 'source-scope': 'phạm vi của nguồn',
  'metric-result': 'kết quả tính từ số liệu thị trường', 'denominators': 'mẫu số đã xác định', 'scope': 'phạm vi nghiên cứu',
  'verified-method-artifacts': 'kết quả phương pháp đã xác minh', 'comparable-groups': 'các nhóm có thể so sánh',
  'compatible-daily-series': 'chuỗi theo ngày cùng định nghĩa', 'normalization-receipt': 'biên nhận chuẩn hóa', 'owner-question': 'câu hỏi của người dùng',
  'resolved-fact-claim-pointers': 'liên kết dữ kiện và nhận định đã kiểm tra', 'domain-specific-evidence': 'bằng chứng chuyên ngành',
  'measurement-design': 'thiết kế đo lường', 'existing-relevant-outcomes': 'kết quả liên quan đã quan sát', 'held-out-horizon': 'kỳ kiểm tra độc lập',
  'adjudication-provenance': 'dấu vết xử lý bất đồng', 'case-locators': 'vị trí bằng chứng từng trường hợp',
  'canonical-tablet-quote-input': 'đầu vào báo giá viên theo hợp đồng', 'exact-raw-quote-source-and-locator': 'báo giá gốc và vị trí chính xác',
  'exact-source-package-lineage': 'dấu vết gói nguồn chính xác', 'explicit-price-state-and-observation-time': 'trạng thái giá và thời điểm quan sát',
  'optional-owner-declared-tablet-count': 'số viên do người dùng khai báo nếu có', 'verified-locators-and-denominators': 'vị trí bằng chứng và mẫu số đã xác minh',
};
/** Vietnamese gloss shown next to the raw code; the raw code stays visible for lookup. */
const pendingReasonGloss: Readonly<Record<LiteralPendingReason, string>> = {
  NON_NFC_TEXT: 'văn bản chưa ở dạng Unicode chuẩn', NO_RULE_MATCH: 'không khớp quy tắc đọc nào',
  INFORMAL_OR_UNACCENTED_MARKER: 'có từ viết tắt, không dấu hoặc khẩu ngữ', QUESTION_SENTENCE: 'câu hỏi, không phải khai báo',
  CONDITIONAL_SCOPE: 'nằm trong mệnh đề điều kiện', FUTURE_OR_INTENT_SCOPE: 'nói về dự định hoặc tương lai',
  TENSE_OR_MODALITY_MIXED: 'lẫn thì hoặc tình thái', NEGATION_SCOPE_UNCLEAR: 'chưa rõ phạm vi phủ định',
  POST_VERBAL_NEGATION_OR_QUESTION: 'phủ định hoặc hỏi đặt sau động từ', MULTIPLE_NEGATORS: 'có nhiều từ phủ định',
  NEGATED_ABILITY_ATTEMPT_OR_COMPLETION: 'phủ định khả năng, việc thử hoặc việc hoàn tất', NEGATED_VERB_AMBIGUOUS: 'động từ bị phủ định chưa rõ nghĩa',
  UNSUPPORTED_EVENT_PATTERN: 'mẫu sự kiện chưa được quy tắc hỗ trợ', THIRD_PARTY_ACTOR: 'người thực hiện là bên thứ ba',
  UNRECOGNIZED_SUBJECT: 'chưa nhận diện được chủ ngữ', MIXED_EVENT_READINGS_IN_CLAUSE: 'một mệnh đề có nhiều cách đọc sự kiện',
  MULTIPLE_EVENTS_IN_CLAUSE: 'một mệnh đề có nhiều sự kiện', INABILITY_WITHOUT_LOCATED_TASK: 'nói không làm được nhưng chưa định vị việc cần làm',
  NOT_YET_NEGATION: 'phủ định dạng “chưa”', MULTIPLE_TARGETS: 'có nhiều đối tượng được nhắc',
  UNRESOLVED_SPEECH_FRAME: 'chưa rõ ai đang nói', THIRD_PARTY_ATTITUDE_HOLDER: 'thái độ thuộc về bên thứ ba',
  REASON_WITHOUT_LOCATED_CHOICE: 'có lý do nhưng chưa định vị lựa chọn', NEGATED_OR_UNCLEAR_CHOICE: 'lựa chọn bị phủ định hoặc chưa rõ',
  NEGATED_CONDITIONAL_REASON: 'lý do bị phủ định hoặc có điều kiện', AMBIGUOUS_RESULT_LINKER: 'từ nối kết quả có nhiều cách hiểu',
  TASK_CLAUSE_UNRESOLVED: 'chưa xác định mệnh đề nhiệm vụ', NO_ACTION_TASK: 'nhiệm vụ không kèm hành động',
  NEGATED_CONTEXT: 'bối cảnh bị phủ định', HEARSAY_CONTEXT: 'bối cảnh là lời kể lại',
  CONFLICTING_RULE_READINGS: 'các quy tắc cho cách đọc trái nhau', QUOTED_TEXT_SCOPE: 'nằm trong phần trích dẫn',
  NEGATED_OBSTACLE: 'trở ngại bị phủ định', NEGATED_ATTITUDE: 'thái độ bị phủ định',
  TASK_OBSTACLE_RELATION_UNVERIFIED: 'chưa kiểm chứng quan hệ nhiệm vụ và trở ngại', ATTITUDE_HOLDER_UNRESOLVED: 'chưa xác định người có thái độ',
};
const dispositionGloss: Readonly<Record<string, string>> = {
  INCLUDED: 'đưa vào đọc', EXCLUDED: 'loại khỏi đọc', UNREADABLE: 'không đọc được',
  EMPTY_TEXT: 'văn bản trống', UNREADABLE_TEXT: 'không đọc được văn bản', QUARANTINED: 'bị cách ly theo quy tắc nguồn',
  WRONG_LISTING: 'không thuộc listing đã chọn', UNRESOLVED_LISTING: 'chưa xác định được listing',
  NON_REVIEW_ROW: 'dòng không phải review', UNRESOLVED_ROW_TYPE: 'chưa xác định loại dòng', UNRESOLVED_CONFLICT: 'xung đột phiên bản chưa xử lý',
  NATIVE_ID_TEXT_CONFLICT: 'cùng mã review nhưng nội dung khác', NATIVE_ID_RATING_CONFLICT: 'cùng mã review nhưng điểm khác',
  NATIVE_ID_LISTING_CONFLICT: 'cùng mã review nhưng listing khác',
};
const glossedCodes = (codes: string, gloss: Readonly<Record<string, string>>): string => codes.split(',').map(code =>
  `<code>${escape(code)}</code>${gloss[code] ? ` <small>(${escape(gloss[code])})</small>` : ''}`).join('<br>');
const recordNumberNote = 'Số “Bản ghi N” trên trang đếm từ 1; con trỏ trong hồ sơ phương pháp đếm từ 0, nên Bản ghi N ứng với chỉ số N − 1.';

function collectionCaptureMap(input: AutomationReportInput): ReadonlyMap<number, CaptureRecord> {
  const captures = new Map<number, CaptureRecord>();
  for (const capture of input.captures) {
    if (capture.stepId !== 'COLLECTION') continue;
    if (!Number.isSafeInteger(capture.ordinal) || capture.ordinal < 0 || captures.has(capture.ordinal)) throw new Error('Report capture ordinal mismatch');
    captures.set(capture.ordinal, capture);
  }
  return captures;
}

function observedRows(input: AutomationReportInput, captures: ReadonlyMap<number, CaptureRecord>): readonly TypedComparable[] {
  const selected = new Set([...input.scope.selectedProductIds, ...input.scope.peerProductIds]);
  return (input.collection?.comparables ?? []).filter(row => {
    const capture = captures.get(row.captureIndex);
    return selected.has(row.productId) && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.value) &&
      capture?.provider === row.provider && !capture.truncated &&
      capture.window?.startDate === row.window.startDate && capture.window.endDate === row.window.endDate &&
      row.window.startDate <= row.window.endDate && row.window.startDate >= input.start.requestedPeriod.startDate && row.window.endDate <= input.start.requestedPeriod.endDate;
  });
}

function productLabels(input: AutomationReportInput): ReadonlyMap<string, string> {
  // Collection cards first; the run's own cards cover runs whose collection result kept none.
  const labels = new Map<string, string>();
  for (const card of [...(input.collection?.productCards ?? []), ...(input.run.productCards ?? [])]) {
    const title = card.title?.trim();
    if (title && !labels.has(card.productId)) labels.set(card.productId, title);
  }
  return labels;
}

/** The descriptive bridge may retain a source-local ID when its detail has no name. */
function descriptiveProductLabels(input: AutomationReportInput): ReadonlyMap<string, string> {
  const labels = new Map(productLabels(input));
  const localLabels = new Map<string, string | null>();
  for (const card of input.collection?.productCards ?? []) {
    // A bare ID shared by providers is ambiguous, even if only one card has a title.
    localLabels.set(card.sourceProductId, localLabels.has(card.sourceProductId) ? null : card.title?.trim() || null);
  }
  for (const [id, label] of localLabels) if (label && !labels.has(id)) labels.set(id, label);
  return labels;
}

function readerDay(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

/** Phần 11/12 rows, in the precedence the Market charts use; Metric records labelled outside the scope are left out. */
function marketActionRows(input: AutomationReportInput, presentationRows: readonly MarketTitleUnitRow[]): MarketTitleUnitRow[] {
  const metric = input.metricMethods;
  if (presentationRows.length || !metric) return [...presentationRows];
  const value = (stored: string | null): number | null => {
    const parsed = stored === null ? Number.NaN : Number(stored);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };
  const records = metric.capture ? metric.capture.platforms.flatMap(({ platform, result }) => result.input.records.map(record => ({ platform, record })))
    : metric.result.input.records.map(record => ({ platform: record.measurement.platform, record }));
  return records.filter(({ record }) => record.label?.classification !== 'OUTSIDE')
    .map(({ platform, record }, i) => ({ i, listing: record.listingId, platform, rev: value(record.revenue.value), units: value(record.units.value), title: record.title }));
}

/** Title pack sizes over the same rows (UNIT-209 C2/C3): one profile for the report, a unit price per row, and per-platform k/n lines. */
/** `packProfile` names the pack kind for the quantity column; `profile` (null with raw-series input) prices rows. */
type MarketUnitRows = { rows: (MarketTitleUnitRow & ActionRow)[]; profile: UnitProfile | null; packProfile: UnitProfile | null; lines: string[]; withoutAveragePrice?: true };
function marketUnitRows(input: AutomationReportInput, presentationRows: readonly MarketTitleUnitRow[]): MarketUnitRows {
  const base = marketActionRows(input, presentationRows);
  const titled = base.map(row => ({ title: row.title ?? '', revenue: row.rev, units: row.units, platform: row.platform }));
  const packProfile = chooseUnitProfile(titled);
  // A title-unit price is revenue ÷ units ÷ pack size: raw-series reports print none (owner F118/F119, 23/10/2026).
  if (input.marketRawSeries) return { rows: base.map(row => ({ ...row, unitPrice: null })), profile: null, packProfile, lines: [], withoutAveragePrice: true };
  const profile = packProfile, projection = projectTitleUnitPrices(titled, profile);
  const rows = base.map((row, index) => ({ ...row, unitPrice: projection.rows[index]!.unitPrice }));
  const lines = !profile ? [] : platformPriceBands(rows, true).map(({ platform, name }) => {
    const own = rows.filter(row => row.platform === platform);
    return `${name}: ${convertedLine(own.filter(row => row.unitPrice !== null).length, own.length)}`;
  });
  return { rows, profile, packProfile, lines };
}
const unitLines = (unit: MarketUnitRows): string => unit.withoutAveragePrice ? `<p>${escape(NO_DERIVED_PRICE)}</p>` : unit.profile ? unit.lines.map(line => `<p class="lim">${escape(line)}</p>`).join('') : `<p>${escape(NO_PRICE_COMPARISON)}</p>`;

/** One bar of a Market chart (Hình 4.1, 4.2, 7.1) with the stored rows it plots: `part` (÷ `total` for a share). */
type MarketChartDatum = { readonly kind: MarketChart['kind']; readonly label: string; readonly group: string; readonly part: readonly MarketChartRow[]; readonly total?: readonly MarketChartRow[] };

/**
 * Number trace of the Market charts: their value labels (drawn by the chart engine before the build) and the
 * delivery's chart readings are recorded against the rows each bar plots. Null outside a traced build.
 */
function marketChartTrace(input: AutomationReportInput, presentation: AutomationMarketPresentationMethod | undefined): { embed: (chart: MarketChart) => void; reading: MarketChartReadingTrace } | null {
  if (!presentation || !marketNumberTraceActive()) return null;
  const source = marketChartSource(presentation.input.rows, input.metricMethods), rows = source.rows;
  const rowSource = marketChartRowSource(presentation.input.rows, presentation.binding, input.metricMethods);
  const usable = marketChartRows(rows), platforms = (['shopee', 'tiktok'] as const).filter(P => usable.some(row => row.platform === P));
  const datums: MarketChartDatum[] = [
    ...platforms.map(P => ({ kind: 'platform-revenue' as const, label: marketChartPlatformLabel(P), group: '', part: usable.filter(row => row.platform === P) })),
    ...marketShares(rows).filter(share => share.shops).flatMap(share => TOP_GROUPS.flatMap((k, j) => share.shops![j] === null ? [] : [(() => {
      const members = marketShareMembers(rows, share.platform, 'shops', k);
      return { kind: 'concentration' as const, label: `${k} gian hàng doanh thu cao`, group: marketChartPlatformLabel(share.platform), part: members.part, total: members.total };
    })()])),
    ...marketRankedRows(rows).map(row => ({ kind: 'product-ranking' as const, label: marketRankingRowLabel(row, source), group: marketChartPlatformLabel(row.platform), part: [row] })),
  ];
  const block = (kind: MarketChart['kind']): string => `${kind === 'product-ranking' ? 'M07' : 'M04'}.chart.${kind}`;
  const find = (kind: MarketChart['kind'] | undefined, point: { label: string; group: string }): MarketChartDatum | undefined =>
    datums.find(datum => datum.kind === kind && datum.label === point.label && (point.group === '' || datum.group === '' || datum.group === point.group));
  const value = (kind: MarketChart['kind'] | undefined, point: { label: string; group: string }, token: string): string => {
    const datum = find(kind, point);
    const part = datum && marketChartRowInputs(datum.part, rowSource, 'part'), total = datum?.total ? marketChartRowInputs(datum.total, rowSource, 'total') : undefined;
    if (!datum || !part || total === null) return token;
    return traceMarketNumber(token, block(datum.kind), 'computed', [...part, ...(total ?? [])],
      total ? '100 × sum(leading shops) ÷ sum(platform rows), at the printed precision' : 'sum(row revenue) ÷ 1e6, at the printed precision', 'chart-label');
  };
  const kindOf = (html: string): MarketChart['kind'] | undefined => input.marketPresentationCharts?.find(chart => html.includes(`<span class="ext">${escape(chart.title)}</span>`))?.kind;
  const unescape = (text: string): string => text.replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&amp;/gu, '&');
  return {
    // Value labels are the text marks of the drawn bars; their aria label names the bar.
    embed: chart => {
      for (const group of chart.svg.matchAll(/<g class="mark-text role-mark[^"]*"[^>]*>([\s\S]*?)<\/g>/gu)) {
        for (const [, aria = '', label = ''] of group[1]!.matchAll(/<text\b[^>]*aria-label="([^"]*)"[^>]*>([^<]*)<\/text>/gu)) {
          const bar = /^([^;]+): (-?[\d.,]+);\s+: ([^;]+)(?:;.*?\b[Ss](?:àn|an): ([^;]+))?/u.exec(unescape(aria));
          if (bar && marketNumberTokens(label).length) value(chart.kind, { label: bar[3]!.trim(), group: (bar[4] ?? '').trim() }, unescape(label).trim());
        }
      }
    },
    reading: {
      value: (html, point, text) => value(kindOf(html), point, text),
      count: (html, points) => {
        const kind = kindOf(html), found = points.map(point => find(kind, point));
        const inputs = found.every(datum => datum !== undefined) ? marketChartRowInputs(found.map(datum => datum!.part[0]!), rowSource) : null;
        return inputs ? traceMarketNumber(String(points.length), block(kind!), 'computed', inputs, 'count(bars), one row per bar', 'count') : String(points.length);
      },
      label: (html, point) => {
        const kind = kindOf(html), datum = find(kind, point), numbers = marketNumberTokens(point.label);
        // A ranking label is the product title, platform and row ref: its numbers are recorded against that row.
        const at = datum && datum.kind === 'product-ranking' ? rowSource(datum.part[0]!) : null;
        if (at && numbers.length) for (const number of numbers) traceMarketNumber(number, block(datum!.kind), 'raw',
          [storedInput('capture-table', at.sourceSha256, at.locator, datum!.part[0]!.title ?? ''), storedInput('capture-table', at.sourceSha256, at.locator, datum!.part[0]!.ref ?? String(datum!.part[0]!.i + 1))],
          'number as written in the row title or row ref', 'as-stored');
        return point.label;
      },
    },
  };
}

/** Candidate start days of the proposal deadlines, in order, each with where it is stored. */
function marketActionStartCandidates(input: AutomationReportInput): [string | null | undefined, MarketTraceInput][] {
  const created = Date.parse(input.run.createdAt);
  const vietnamDay = new Date(created + 7 * 3_600_000);
  const run = (pointer: string, value: string): MarketTraceInput => storedInput('run-record', input.run.runId, pointer, value, 'base');
  const scopeEnd = input.marketPresentation?.input.metric?.input.scope.end;
  return [
    [Number.isFinite(vietnamDay.getTime()) ? vietnamDay.toISOString().slice(0, 10) : null, run('/createdAt', input.run.createdAt)],
    [input.start.requestedPeriod.endDate, run('/start/requestedPeriod/endDate', input.start.requestedPeriod.endDate ?? '')],
    [input.start.requestedPeriod.startDate, run('/start/requestedPeriod/startDate', input.start.requestedPeriod.startDate ?? '')],
    [scopeEnd, storedInput('stored-source', 'automation-market-presentation-method', '/input/metric/input/scope/end', scopeEnd ?? '', 'base')],
  ];
}
/** Vietnam calendar day the report run was created; the proposal deadlines count from it. */
function marketActionStartDay(input: AutomationReportInput): string | null {
  return actionStartDay(...marketActionStartCandidates(input).map(([day]) => day));
}
/** The start day the deadlines count from and its stored source. */
function marketActionStart(input: AutomationReportInput): { day: string; input: MarketTraceInput } | null {
  const day = marketActionStartDay(input);
  const found = day === null ? undefined : marketActionStartCandidates(input).find(([candidate]) => candidate === day);
  return found ? { day: day!, input: found[1] } : null;
}

const marketReviewsCollected = (input: AutomationReportInput): boolean =>
  input.publicReviewSource ? input.publicReviewSource.products.some(row => row.records > 0)
    : Boolean(input.nativeReview?.output.input.records.length || input.reviewCorpus?.records.length || exactTestReviewSample(input)?.listings.some(row => row.reviews > 0));

/** Phần 1 figures, each from the function behind its exhibit: Hình 4.1/4.2 shares, Bảng 11.1 price groups, Hình 5.2 weeks, Phần 12 options. */
function marketHeadline(input: AutomationReportInput, presentation: AutomationMarketPresentationMethod): MarketHeadline {
  const drawn = (chartKind: MarketChart['kind']): boolean => Boolean(input.marketPresentationCharts?.some(chart => chart.kind === chartKind));
  const unit = marketUnitRows(input, presentation.input.rows), rows = unit.rows;
  const plan = marketActionPlan(rows, { reviewsCollected: marketReviewsCollected(input), startDay: marketActionStartDay(input), currentReader: true, unitStandard: unit.profile?.standard ?? null, withoutAveragePrice: unit.withoutAveragePrice === true });
  const interest = input.collection?.searchInterest;
  const weeks = searchInterestRenderable(interest) && input.searchInterestChart
    ? searchInterestReadingPoints(interest).flatMap(point => point.index === null ? [] : [{ period: point.period, index: point.index }]) : [];
  const peak = weeks.reduce<(typeof weeks)[number] | undefined>((top, week) => top && top.index >= week.index ? top : week, undefined);
  // The stored points behind the reading: the peak's period and index, and every point with a number.
  const daily = interest ? searchInterestIsDaily(interest) : false;
  const searchStore = `COLLECTION#${interest?.captureIndex ?? 'unknown'}`;
  const pointAt = (period: string) => interest?.points.findIndex(point => point.index !== null && searchInterestPeriodText(point.period, daily) === period) ?? -1;
  const peakAt = peak ? pointAt(peak.period) : -1;
  const counted = weeks.map(week => pointAt(week.period));
  const searchTrace = interest && peakAt >= 0 && counted.every(at => at >= 0) ? {
    period: storedInput('stored-source', searchStore, `/points/${peakAt}/period`, interest.points[peakAt]!.period),
    index: storedInput('stored-source', searchStore, `/points/${peakAt}/index`, interest.points[peakAt]!.index!),
    weeks: counted.map(at => storedInput('stored-source', searchStore, `/points/${at}/index`, interest.points[at]!.index!)),
    daily,
  } : undefined;
  const chartRows = marketChartSource(presentation.input.rows, input.metricMethods).rows;
  const shares = drawn('platform-revenue') ? marketShares(chartRows).map(share => drawn('concentration') ? share : { ...share, shops: null }) : [];
  const ranked = drawn('product-ranking') ? marketRankedRows(chartRows) : [];
  return {
    rows: chartRows,
    rowSource: marketChartRowSource(presentation.input.rows, presentation.binding, input.metricMethods),
    shares,
    products: shares.flatMap(share => {
      const shown = ranked.filter(row => row.platform === share.platform).length;
      return shown ? [{ ...share, top5: shown >= 5 ? share.top5 : null }] : [];
    }),
    bands: plan.signals.flatMap(signal => signal.band && signal.band.low > 0 && signal.band.revenue > 0
      ? [{ ...signal, n: rows.filter(row => row.platform === signal.platform).length }] : []),
    unitStandard: unit.profile?.standard ?? null,
    search: peak && peak.index > 0 ? { ...peak, weeks: weeks.length, ...(searchInterestIsDaily(interest!) ? { periodUnit: 'ngày' as const } : {}), ...(searchTrace ? { trace: searchTrace } : {}) } : null,
    options: plan.hasFigures,
  };
}

function marketActionTable(no: string, title: string, extraClass: string, headings: readonly string[], rows: readonly (readonly string[])[], attributes = ''): string {
  return `<div class="table-wrap${extraClass}"><div class="exh"><span class="exn">Bảng ${no}</span><span class="ext">${escape(title)}</span></div><table${attributes}><caption>${escape(title)}</caption>` +
    `<thead><tr>${headings.map(heading => `<th scope="col">${escape(heading)}</th>`).join('')}</tr></thead>` +
    `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Phần 11: the two in-sample opportunities per platform, or one plain line when no platform has enough revenue rows. */
function marketOpportunitySection(plan: MarketActionPlan, reviewsCollected: boolean, unit: MarketUnitRows): string {
  const title = 'Cơ hội trong mẫu, ghi riêng từng sàn (đề xuất, chờ chủ duyệt)';
  // C6: revenue columns stay whenever price bands are unavailable, including partial conversion.
  if (!unit.profile || !plan.hasFigures) {
    if (!plan.signals.some(signal => signal.leaders)) return unitLines(unit);
    const rows = opportunityRows(plan.signals).map(row => [row[0]!, row[4]!, row[5]!].map(cell => escape(cell)));
    return `<p>${escape('Cơ hội trong mẫu đọc từ nhóm sản phẩm doanh thu lớn của từng sàn. Các đề xuất ở Phần 12 là những bước kiểm tra kinh doanh, chờ chủ duyệt; chưa xác định khả năng sinh lời.')}</p>` +
      marketActionTable('11.1', title, '', ['Sàn', OPPORTUNITY_HEADINGS[4], OPPORTUNITY_HEADINGS[5]], rows,
        ` data-reading="${escape('Mỗi sàn đọc riêng: nhóm sản phẩm doanh thu lớn gồm tối đa năm sản phẩm của sàn đó.')}"`) + unitLines(unit);
  }
  const explanation = `<p>${escape(opportunityExplanation(plan.hasFigures, reviewsCollected, true))}</p>`;
  return explanation +
    marketActionTable('11.1', title, '', opportunityHeadings(unit.profile.standard), opportunityRows(plan.signals, missingBandText(true, unit.profile.standard)).map(row => row.map(cell => escape(cell))),
      ` data-reading="${escape(OPPORTUNITY_UNIT_READING)}"`) + unitLines(unit);
}

/** Phần 12: three options with in-sample related revenue, then the no-cost quick wins; every row is a proposal awaiting the owner. */
function marketActionSection(plan: MarketActionPlan, unit: MarketUnitRows, plannedDates = false, start: { day: string; input: MarketTraceInput } | null = null): string {
  // A deadline is the start day plus one of the plan's offsets; it is recorded with the start day's source.
  const deadline = (text: string, block: string): string => {
    const days = start ? ACTION_DEADLINE_DAYS.find(offset => dayPlus(start.day, offset) === text) : undefined;
    return start && days !== undefined ? traceMarketNumber(text, block, 'computed',
      [start.input, storedInput('stored-source', 'template:market-actions', '/ACTION_DEADLINE_DAYS', days, 'offset')], 'start day + deadline offset, dd/mm/yyyy', 'date-plus-days') : text;
  };
  const options = marketActionTable('12.1', 'Phương án đề xuất, chờ chủ duyệt', ` market14-proposals${plan.hasFigures ? ' has-figures' : ''}`, OPTION_HEADINGS,
    plan.options.map(option => [escape(option.name), option.related.map(line => escape(line)).join('<br>'), escape(option.firstStep), escape(option.owner), escape(deadline(option.deadline, 'M12.options'))])) + unitLines(unit);
  const quick = marketActionTable('12.2', 'Việc làm ngay, không tốn chi phí (đề xuất, chờ chủ duyệt)', ' market14-proposals', QUICK_WIN_HEADINGS,
    plan.quickWins.map(win => [win.task, win.owner, deadline(win.deadline, 'M12.quick'), win.output].map(cell => escape(cell))));
  return `${options}<h3>${escape(QUICK_WIN_HEADING)}</h3>${quick}<p>${escape('Phương án, người phụ trách và hạn là đề xuất của TDN, chờ chủ duyệt; chủ dự án có thể sửa. Các bước kiểm tra chưa xác nhận khả năng sinh lời hay mức tăng doanh số.')}${plannedDates ? ' Mọi hạn trong hai bảng là ngày dự kiến.' : ''}</p>`;
}

function observationTable(rows: readonly TypedComparable[], captures: ReadonlyMap<number, CaptureRecord>, citations: ReportCitations, labels: ReadonlyMap<string, string>, readerPlainText = false, productOrder: readonly string[] = []): string {
  if (!rows.length) return '';
  const ordinals = new Map<string, number>();
  const ordinal = (productId: string): number => ordinals.get(productId) ?? ordinals.set(productId, ordinals.size + 1).get(productId)!;
  for (const productId of productOrder) ordinal(productId);
  if (!readerPlainText) return `<div class="table-wrap" role="region" aria-label="Giá trị nguồn theo từng sản phẩm và kỳ truy vấn" tabindex="0"><table class="observations"><caption>Giá trị nguồn theo từng sản phẩm và kỳ truy vấn. Không phải tổng thị trường.</caption><thead><tr><th scope="col">Sản phẩm nguồn</th><th scope="col">Phép đo / đơn vị</th><th scope="col">Giá trị nguồn</th><th scope="col">Kỳ đo</th><th scope="col">Nguồn</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(sourceMemberLabel(row.productId, false))}</td><td>${escape(row.metric === 'GMV_VND' ? 'Doanh thu (VND)' : 'Lượt bán')}</td><td>${escape(row.value)}</td><td>${escape(row.window.startDate)} đến ${escape(row.window.endDate)}</td><td>${captureMark(captures.get(row.captureIndex)!, citations)}</td></tr>`).join('')}</tbody></table></div>`;
  return `<div class="table-wrap" role="region" aria-label="Giá trị nguồn theo từng sản phẩm và kỳ truy vấn" tabindex="0"><table class="observations"><caption>Giá trị nguồn theo từng sản phẩm và kỳ truy vấn. Không phải tổng thị trường.</caption><thead><tr><th scope="col">Sản phẩm nguồn</th><th scope="col">Phép đo / đơn vị</th><th scope="col">Giá trị nguồn</th><th scope="col">Kỳ đo</th><th scope="col">Nguồn</th></tr></thead><tbody>${rows.map(row => { const measure = row.metric === 'GMV_VND' ? 'revenue' : 'sales_volumn'; return `<tr><td>${escape(readerProductLabel(sourceMemberLabel(row.productId, true), labels.get(row.productId), ordinal(row.productId)))}</td> <td>${escape(measureLabel[row.metric])}</td> <td>${escape(/^0+(?:\.0+)?$/.test(row.value) ? 'Không ghi nhận trong kỳ' : formatReaderValue(row.value, { measure, unit: row.metric === 'GMV_VND' ? 'VND' : 'đơn vị' }) ?? 'Giá trị được giữ trong bản lưu nguồn')}</td> <td>${escape(readerDay(row.window.startDate))} đến ${escape(readerDay(row.window.endDate))}</td> <td>${captureMark(captures.get(row.captureIndex)!, citations)}</td></tr>`; }).join('')}</tbody></table></div>`;
}

/** Deliberately narrower than the complete M07 method: no universe, share or rank inference. */
function peerEvidence(input: AutomationReportInput, captures: ReadonlyMap<number, CaptureRecord>): readonly TypedComparable[] {
  const peers = input.scope.peerProductIds;
  if (peers.length < 2 || input.collection === null) return [];
  const candidates = input.collection.comparables.filter(row => peers.includes(row.productId));
  const groups = new Map<string, TypedComparable[]>();
  for (const row of candidates) {
    const key = JSON.stringify([row.provider, row.metric, row.window.startDate, row.window.endDate]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([, matches]) => {
    if (matches.length !== peers.length || !peers.every(id => matches.filter(row => row.productId === id).length === 1)) return [];
    if (!matches.every(row => {
      const capture = captures.get(row.captureIndex);
      return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.value) && capture?.provider === row.provider && !capture.truncated &&
        capture.window?.startDate === row.window.startDate && capture.window.endDate === row.window.endDate &&
        row.window.startDate <= row.window.endDate && row.window.startDate >= input.start.requestedPeriod.startDate && row.window.endDate <= input.start.requestedPeriod.endDate;
    })) return [];
    return peers.map(id => matches.find(row => row.productId === id)!);
  });
}

/** `owner` is the market14 owner reader; `rankingShown` says the in-sample top-revenue figure follows the section text. */
function defaultPeerSection(snapshot: DefaultMarketPeers, citations: ReportCitations, labels: ReadonlyMap<string, string>, readerPlainText = false,
  owner?: { readonly rankingShown: boolean }): string {
  const mark = (ref: DefaultMarketPeers['input']['records'][number]['source']): string => {
    if (ref === null) return 'Chưa có nguồn';
    const pointer = readerPointer(ref.locator, readerPlainText);
    return citations.mark({ sourceKind: 'CAPTURE', identity: ref.sourceSha256, locator: pointer.locator,
      label: 'Doanh thu trong tệp nguồn đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { sourceSha256: ref.sourceSha256, ...(pointer.technical === null ? {} : { locator: pointer.technical }) } });
  };
  const states: Record<DefaultMarketPeers['frames'][number]['state'], string> = {
    SELECTED: 'Tập mặc định đã tính từ doanh thu nhóm trong mẫu.',
    NO_SALES: 'Chưa có doanh số tương thích; không hiển thị phần thiếu bằng 0.',
    ZERO_REVENUE: 'Doanh thu nhóm được nguồn ghi bằng 0; chưa chọn đối thủ.',
    INCOMPLETE: 'Chưa đủ nguồn, doanh thu, nhóm hoặc danh tính để chọn đối thủ.',
  };
  if (readerPlainText) {
    states.NO_SALES = 'Chưa có doanh số tương thích; không coi phần thiếu là bằng không.';
    states.ZERO_REVENUE = 'Nguồn ghi nhận doanh thu bằng không; chưa chọn đối thủ.';
  }
  const peerLabel = (identity: DefaultMarketPeers['frames'][number]['members'][number]['identity'], ordinal: number): string => {
    if (identity.kind !== 'SHOP') return readerProductLabel(identity.label, labels.get(identity.label) ?? identity.label, ordinal);
    const record = snapshot.input.records.find(row => row.shopId !== null && canonicalJson(['SHOP', row.shopId]) === identity.key
      && row.shopLabel?.trim() === identity.label && row.shopLabel.trim() !== row.shopId);
    return readerShopLabel(identity.label, record?.shopLabel, ordinal);
  };
  const frames = snapshot.frames.map(stored => {
    // Older classified capture results can retain the placeholder as a shop.
    // Keep those frozen bytes verifiable, but do not present an inferred peer
    // or selected revenue when the group's shop identities are incomplete.
    const result = stored.members.some(member => member.identity.kind === 'SHOP' && member.identity.key === canonicalJson(['SHOP', UNKNOWN_SHOP]))
      ? { ...stored, state: 'INCOMPLETE' as const, totalRevenue: null, selectedRevenue: null, selected: [] } : stored;
    const frame = result.frame;
    const platform = frame.platform === 'shopee' ? 'Shopee' : frame.platform === 'tiktok' ? 'TikTok Shop' : storedLiteral(frame.platform, 'Sàn được giữ trong bản lưu');
    const revenue = (value: string): string => readerPlainText ? formatReaderValue(value, { currency: 'VND' }) ?? 'Doanh thu được giữ trong bản lưu' : value;
    const amount = (value: string): string => readerPlainText && /^0(?:\.0+)?$/.test(value) ? 'Không ghi nhận doanh thu' : `${revenue(value)} VND`;
    const rows = result.selected.map((member, index) => `<tr><td>${readerPlainText ? `${escape(peerLabel(member.identity, index + 1))} ` : ''}${readerPlainText ? '' : escape(storedLiteral(member.identity.label, 'Danh tính nguồn được giữ trong bản lưu'))}</td><td>${member.identity.kind === 'TITLE_LABEL' ? 'Nhãn thương hiệu theo tiêu đề người bán' : 'Gian hàng nguồn; chưa rõ thương hiệu'}</td><td>${escape(amount(member.revenue))} ${member.sources.map(mark).join('')}</td></tr>`).join('');
    const total = result.totalRevenue === null ? 'Chưa đủ dữ liệu' : amount(result.totalRevenue);
    const selected = result.selectedRevenue === null ? 'Chưa đủ dữ liệu' : amount(result.selectedRevenue);
    return `<h3>${platform} · ${storedLiteral(frame.group, 'Nhóm được giữ trong bản lưu')}</h3><p>${states[result.state]} Kỳ ${escape(readerPlainText ? readerDay(frame.period.start) : frame.period.start)} đến ${escape(readerPlainText ? readerDay(frame.period.end) : frame.period.end)}.</p><p>Doanh thu nhóm trong mẫu: ${escape(total)}; doanh thu tập đã chọn: ${escape(selected)}. ${result.eligible.map(mark).join('')}</p>${rows ? `<table><caption>Đối thủ mặc định trong nhóm, đặt cạnh nhau</caption><thead><tr><th>Nhãn nguồn</th><th>Căn cứ danh tính</th><th>Doanh thu ước tính</th></tr></thead><tbody>${rows}</tbody></table>` : ''}`;
  }).join('');
  const exclusions = snapshot.frames.flatMap(frame => frame.excluded);
  const additions = snapshot.input.ownerAdditions.length
    ? `<ul>${snapshot.input.ownerAdditions.map(id => `<li>Đối tượng nguồn: ${escape(sourceMemberLabel(id, readerPlainText))}</li>`).join('')}</ul>`
    : '<p>Chưa có bổ sung của chủ.</p>';
  const record = `<details><summary>Hồ sơ đối chiếu tập đối thủ</summary><p>Phiên bản quy tắc: <code>${escape(snapshot.input.rule.version)}</code>. Đầu vào, thành viên, lý do loại và kết quả chính xác được giữ trong bản lưu bất biến. Số lần loại dòng ở các nhóm và sàn: ${escape(exclusions.length)}.</p><ul>${exclusions.map(row => `<li><code>${escape(row.reason)}</code> ${mark(row.source)}</li>`).join('')}</ul></details>`;
  if (owner) {
    // The section explanation already says whether peers were chosen; the body gives the rule in plain words, without tie-break or identity-order notes.
    const rule = `<p>Cách chọn đối thủ mặc định, chốt trước khi đọc doanh số: chọn đối thủ theo doanh thu giảm dần trong cùng nhóm, cùng sàn cho tới khi đạt tối thiểu ${escape(snapshot.input.rule.thresholdPercent)} phần trăm doanh thu của nhóm trong mẫu.</p>`;
    const empty = owner.rankingShown ? '<p>Hình dưới chỉ liệt kê sản phẩm có doanh thu cao trong mẫu, chưa phải đối thủ đã chọn.</p>' : '';
    const ownerAdditions = snapshot.input.ownerAdditions.length
      ? `<h3>Đối thủ do chủ bổ sung, giữ riêng</h3>${additions}<p>Phần bổ sung không thay đổi cách chọn mặc định.</p>` : '<p>Chưa có đối thủ do chủ bổ sung.</p>';
    return `${rule}${frames || empty}<p>Số bán hàng là số ước tính của nguồn, chưa đối chiếu với người bán. Không cộng doanh thu giữa các sàn, không coi hai sản phẩm là cùng thương hiệu chỉ vì tên giống nhau.</p>${ownerAdditions}${record}`;
  }
  return `<p>Quy tắc đã chốt trước khi đọc doanh số: chọn theo doanh thu giảm dần tới khi đạt ít nhất ${escape(snapshot.input.rule.thresholdPercent)}${readerPlainText ? ' phần trăm' : '%'} doanh thu cùng nhóm trong mẫu; khi bằng nhau dùng mã danh tính ổn định. Bảng hiển thị theo danh tính, không xếp ưu tiên.</p>${frames || `<p>Chưa có nhóm doanh số đã phân loại tương thích. Quan sát sản phẩm và thẻ tìm kiếm không cung cấp thành viên doanh số; phần thiếu không phải ${readerPlainText ? 'bằng không' : '0'}.</p>`}<p>Số bán hàng ước tính chưa đối chiếu với người bán, chỉ dùng tham khảo. Không cộng doanh thu giữa các sàn hoặc suy cùng thương hiệu từ tên giống nhau.</p><h3>Bổ sung của chủ, giữ riêng</h3>${additions}<p>Bổ sung không thay đổi mẫu số hoặc quy tắc mặc định.</p>${record}`;
}

/**
 * Row sums with a missing member among every calculation the Market report
 * renders, less the values it also states as complete page figures.
 */
export function marketPartialRowTotals(input: Pick<AutomationReportInput, 'marketPresentation' | 'metricMethods' | 'metricClassified'>): PartialRowTotal[] {
  const pageFigures = (input.metricMethods?.capture?.platformHeadlines ?? []).flatMap(figure => [
    ...(figure.revenue.value === null ? [] : [{ measure: 'revenue' as const, value: figure.revenue.value }]),
    ...(figure.units === null || figure.units.value === null ? [] : [{ measure: 'units' as const, value: figure.units.value }])]);
  return partialRowTotals([input.marketPresentation?.input.metric, input.metricMethods?.result,
    ...(input.metricMethods?.capture?.platforms.map(platform => platform.result) ?? []), input.metricClassified?.result], pageFigures);
}

export function buildResearchAutomationReport(input: AutomationReportInput, kind: 'MARKET' | 'INSIGHT'): { semantic: object; html: Buffer; traceHtml?: Buffer } {
  // A raw-series Market draft records every number it prints; blocks deep in the build record through traceMarketNumber.
  const numberTrace = kind === 'MARKET' && input.marketRawSeries ? new MarketNumberTraceCollector() : null;
  const report = withMarketNumberTrace(numberTrace, () => buildResearchAutomationReportBody(input, kind, numberTrace));
  // Replay test instance only: the field is never set in production, so production bytes are unchanged.
  return input.kalodataReplayNotice ? { ...report, html: withKalodataReplayNotice(report.html) } : report;
}

function buildResearchAutomationReportBody(input: AutomationReportInput, kind: 'MARKET' | 'INSIGHT', numberTrace: MarketNumberTraceCollector | null): { semantic: object; html: Buffer; traceHtml?: Buffer } {
  if (input.qualitativeDraft && kind !== 'INSIGHT') throw new Error('Qualitative draft is an Insight-only report dependency');
  if (input.qualitativeDraft) {
    const draft = input.qualitativeDraft;
    if (draft.binding.workspaceId !== input.run.workspaceId || draft.binding.runId !== input.run.runId ||
      draft.binding.requestedPeriod.startDate !== input.start.requestedPeriod.startDate ||
      draft.binding.requestedPeriod.endDate !== input.start.requestedPeriod.endDate)
      throw new Error('Qualitative draft lineage differs from the authenticated report run');
  }
  if (input.start.sourceEvidenceVersion) {
    if (!input.sourceEvidence) throw new Error('New report requires retained source admission');
    checkSourceEvidence(input.sourceEvidence);
    if (input.collection) { const { expandedSearch: _expanded, ...plain } = input.collection; input = { ...input, collection: { ...plain, webResults: admitWebResults(input.sourceEvidence, collectionWebRows(input.collection), input.captures, input.sourceEvidence.jevTriage ?? null) } }; }
  } else if (input.sourceEvidence) throw new Error('Historical report cannot acquire source policy');
  if (input.run.runId !== input.scope.runId || input.run.workspaceId !== input.start.workspaceId || input.run.workspaceId !== input.scope.workspaceId) throw new Error('Report lineage mismatch');
  if (input.collection && (input.collection.runId !== input.run.runId || input.collection.stepId !== 'COLLECTION')) throw new Error('Report collection lineage mismatch');
  if (input.insightCoding) {
    const { binding, receipts, selection } = input.insightCoding;
    if (binding.workspaceId !== input.run.workspaceId || binding.runId !== input.run.runId) throw new Error('Report insight coding lineage mismatch');
    const receiptIds = new Set(receipts.map(receipt => receipt.receiptId));
    if (receiptIds.size !== receipts.length || selection.receiptIds.length !== receipts.length || !selection.receiptIds.every(id => receiptIds.has(id))) throw new Error('Report insight coding receipt mismatch');
    // PUBLIC_REVIEWS is coding only (no per-platform counts, text-free rendering or S06 gate yet): never rendered.
    if (binding.sourceKind === 'PUBLIC_REVIEWS') throw new Error('Public review coding is not yet supported in reports');
    if (binding.sourceKind === 'NATIVE' ? input.locatedReview || input.locatedReviewFallback : input.nativeReview || input.nativeReviewFallback) throw new Error('Report insight coding source kind mismatch');
  }
  const privateView = kind === 'INSIGHT' && input.privateReviewCorpus ? privateReviewReportView(input.privateReviewCorpus) : undefined;
  const sample = kind === 'INSIGHT' ? input.reviewSample : undefined;
  if (sample) {
    if (!validateSample(sample) || !input.start.reviewCollectionPolicy || !privateView || !input.collection?.reviewSample ||
      canonicalJson(sample) !== canonicalJson(input.collection.reviewSample) || sample.binding.runId !== input.run.runId ||
      sample.binding.workspaceId !== input.run.workspaceId || sample.policySha256 !== sampleHash(input.start.reviewCollectionPolicy) ||
      sample.collection.collectionSha256 !== privateView.corpus.collectionSha256) throw new Error('Report sample source lineage differs');
    const { sampleId, ...body } = sample;
    if (sampleId !== sampleHash(body)) throw new Error('Report sample digest differs');
  }
  if (input.start.reviewCollectionPolicy && privateView && !sample) throw new Error('Policy report lacks sample accounting');
  if (privateView && (!input.start.privateShopeeSource || input.reviewCorpus || input.locatedReview || input.nativeReview || !input.collection?.privateShopee ||
    privateView.corpus.collectionSha256 !== input.collection.privateShopee.collectionSha256)) throw new Error('Private report source lineage mismatch');
  if (input.insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v5' &&
      (kind !== 'INSIGHT' || !privateView || input.insightCoding.binding.sourceKind !== 'PRIVATE_SHOPEE' ||
       canonicalJson(input.insightCoding.privateSource.corpus) !== canonicalJson(privateView.corpus)))
    throw new Error('Private default report source lineage mismatch');
  const insightCoding = kind === 'INSIGHT' ? input.insightCoding : undefined;
  const insightCrosscheck = kind === 'INSIGHT' ? input.insightCrosscheck : undefined;
  if (insightCrosscheck && (!crosscheckSnapshotValid(insightCrosscheck) || insightCoding?.contractVersion !== 'automation-insight-coding-snapshot-v4' ||
    insightCrosscheck.request.firstProposalId !== insightCoding.selection.proposalId || insightCrosscheck.request.firstProposalSha256 !== insightCoding.proposalSha256 ||
    canonicalJson(insightCrosscheck.request.binding) !== canonicalJson(insightCoding.binding))) throw new TypeError('INVALID_INSIGHT_CROSSCHECK_REPORT_BINDING');
  const marketPresentation = kind === 'MARKET' && input.marketPresentation
    ? verifyAutomationMarketPresentation(input.marketPresentation, input.marketPresentation.binding) : undefined;
  if (marketPresentation && (marketPresentation.binding.workspaceId !== input.run.workspaceId || marketPresentation.binding.runId !== input.run.runId))
    throw new Error('Market presentation run binding differs');
  const insightLiteral = kind === 'INSIGHT' && input.insightLiteral ? verifyInsightLiteralEvidence(input.insightLiteral) : undefined;
  if (insightLiteral && (insightLiteral.input.binding.runId !== input.run.runId || insightLiteral.input.binding.workspaceId !== input.run.workspaceId))
    throw new Error('Literal Insight run binding differs');
  const insightPersona = kind === 'INSIGHT' && input.insightPersona ? checkPersonaSelectedReport(input.insightPersona) : undefined;
  if (insightPersona && (!input.start.privateShopeeSource || insightPersona.source.binding.workspaceId !== input.run.workspaceId ||
    insightPersona.source.binding.runId !== input.run.runId || !input.privateReviewCorpus || insightPersona.source.viewSha256 !== personaViewDigest(input.privateReviewCorpus)))
    throw new Error('Persona report source/run binding differs');
  const captures = collectionCaptureMap(input);
  const evidence = peerEvidence(input, captures);
  const observations = observedRows(input, captures);
  const prefix = kind === 'MARKET' ? 'M' : 'I';
  const contextSections = kind === 'MARKET' ? ['M02', 'M13'] : ['I01', 'I03', 'I17'];
  const descriptive = kind === 'MARKET' ? input.descriptiveMethods : undefined;
  const defaultMarketPeers = kind === 'MARKET' && input.start.defaultPeerRule !== undefined
    ? classifiedMetricDefaultPeers(input.metricClassified?.result.input, input.start.defaultPeerRule, [...input.scope.peerProductIds]) : undefined;
  if (input.nativeReview && (input.locatedReview || input.reviewCorpus)) throw new Error('Native and exact-collection review lineage cannot be substituted');
  const located = kind === 'INSIGHT' ? input.nativeReview ?? (input.locatedReview?.contractVersion === 'automation-located-review-snapshot-v2' ? input.locatedReview : undefined) : undefined;
  if (located && located.runId !== input.run.runId) throw new Error('Report corpus trace lineage mismatch');
  const corpusTrace = located ? projectCorpusTrace(located) : undefined;
  const views = new Map<string, DescriptiveSectionView>();
  // Views are composed on first render so that [n] numbers follow the page, not the section-array build order.
  const locatedViews = new Map<string, () => string>();
  const registry = new CitationRegistry({ publicReviewSource: Boolean(input.publicReviewSource) });
  const publicReviewCitation = input.publicReviewSource?.reference ? registry.cite({ sourceKind: 'REVIEW', identity: input.publicReviewSource.reference.collectionSha256, locator: null, label: 'review công khai trên Shopee', retrievedAt: input.publicReviewSource.outcome.attemptedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' }) : null;
  // A source-policy marker opts in only when this report actually carries a
  // reader-owned method projection. Source-only drafts with no such method
  // retain the historical renderer bytes.
  const readerPlainText = Boolean(marketPresentation || (input.start.sourceEvidenceVersion &&
    (input.descriptiveMethods || input.metricMethods || input.quoteMethods || input.marketInventory || input.sourceEvidence?.jevTriage)));
  const citations: ReportCitations = { distinctEntityWording: readerPlainText, readerPlainText, mark: (input: CitationInput): string => renderCitationMarkOrMissing(registry.cite(input)) };
  // Sections whose retained decision synthesis is VALID; candidate prose never makes a section analytically complete.
  const decisionGeneratedIds: string[] = [];
  const decisionProposedIds: string[] = [];
  // Catalog fallbacks: the stored method stays the catalog reference; the page says it did not run here.
  const fallbackIds = new Set<string>();
  const customerInsight = marketPresentation ? 'hiểu biết về khách hàng' : 'insight khách hàng';
  const sourceObservationNote = observations.length
    ? ` Quan sát sản phẩm đã thu được giữ ở ${kind === 'MARKET' ? 'M13' : 'báo cáo thị trường'}; không đủ để tự suy ra quy mô thị trường hoặc ${customerInsight}.`
    : ` Không tự suy ra quy mô thị trường hoặc ${customerInsight} từ phần còn thiếu.`;
  /** Display-only reason built from inputs actually present in this run; it never changes state or eligibility. */
  const blockedGuidance = (section: CatalogSection): string => {
    const needs = ` Mục cần: ${section.requiredInputs.map(id => inputLabels[id] ?? id).join(', ')}.`;
    const id = section.sectionId;
    if (kind === 'MARKET' && id === 'M08') return 'Lượt này chưa có gói báo giá bổ sung nên chưa chạy phép tính giá theo đơn vị generic-quote-unit-v1@1.0.0. '
      + 'Phép tính chỉ dùng giá, quy cách mỗi gói (khối lượng hoặc số món) và biến thể được nguồn ghi rõ kèm vị trí; không suy ra quy cách hay biến thể từ tên sản phẩm. '
      + `Danh mục còn ghi phương pháp ${section.methodId}@${section.methodVersion} với đầu vào riêng; chưa xác lập phương pháp đó áp dụng cho sản phẩm của lượt này. `
      + 'Đây chưa phải phân tích kinh tế đơn vị.' + sourceObservationNote;
    if (kind === 'MARKET' && isDescriptiveSectionId(id)) return `Phương pháp mô tả không có kết quả trong lượt này: ${input.collection?.comparables.length
      ? 'các quan sát sản phẩm đã thu chưa tạo được kết quả phương pháp được lưu'
      : 'lượt này không có quan sát sản phẩm từ bản thu nguồn mới'}.${needs}${sourceObservationNote}`;
    if (kind === 'MARKET' && (id === 'M03' || id === 'M04')) return `Lượt này không có gói số liệu thị trường gắn kèm${id === 'M03' ? ' và không có inventory từ bản thu nguồn' : ''}, nên chưa tính mục này.${needs}${sourceObservationNote}`;
    // The owner reader says plainly what a forecast would need instead of naming the method's input profile.
    if (marketPresentation && id === 'M10' && input.marketInventory?.temporal.input.observations.some(row =>
      row.subjectMemberKeys.length && ((row.rawQuery?.start && row.rawQuery.end) || (row.requestedWindow?.start && row.requestedWindow.end)))) return 'Chưa dự báo: mẫu đã lưu mô tả các sản phẩm trong kỳ báo cáo. Báo cáo cũng giữ riêng số liệu theo từng kỳ của các sản phẩm được chọn. '
      + 'Các chuỗi này chưa xác minh đủ tính tương thích về phép đo, biên kỳ và độ phủ; chưa có bộ đầu vào cùng khoảng thời gian riêng để kiểm tra dự báo.' + sourceObservationNote;
    if (marketPresentation && id === 'M10') return 'Chưa dự báo: cần chuỗi doanh số theo từng ngày, đo cùng một cách và đủ dài, cùng một khoảng thời gian riêng để kiểm tra lại dự báo. '
      + `Lượt này chỉ có mẫu đã lưu trong kỳ báo cáo nên chưa đủ để dự báo hay dựng kịch bản.${sourceObservationNote}`;
    if (['M10', 'I11', 'I12', 'I16'].includes(id)) return `Phương pháp kiểm tra điều kiện của mục này chỉ chạy trên hồ sơ nguồn bổ sung do người dùng chọn; lượt này chưa có hồ sơ đó.${needs}${sourceObservationNote}`;
    if (kind === 'INSIGHT' && (isLiteralFamily(id) || codingFamilies.some(family => family === id))) {
      const records = located?.output.input.records.length;
      return (records !== undefined
        ? `Lượt này có ${records} bản ghi review trong lớp mã hóa, nhưng chưa có kết quả cho ${id}: quy tắc đọc bám lời nguồn đã duyệt chỉ áp dụng cho ${literalFamilies.join(', ')}, và chưa có biên nhận lựa chọn mã hóa cho mục này.`
        : retainedReviewStatus(input) !== null
          ? `${retainedReviewStatus(input)} Xem trạng thái nguồn ở I03 và hồ sơ đối chiếu ở I17.`
          : 'Lượt này chưa có review nguồn gắn kèm.') + ` Không suy ra nguồn không nhắc tới nội dung này.${needs}`;
    }
    return marketPresentation ? `Chưa có dữ liệu cho mục này trong lượt; đây không phải kết quả bằng 0.${needs}${sourceObservationNote}`
      : `Chưa có kết quả cho mục này trong lượt. Bản nháp không đủ thông tin để xác định riêng nguyên nhân là thiếu đầu vào, còn chờ duyệt hay phương pháp chưa chạy.${needs}${sourceObservationNote}`;
  };
  // The owner reader names Phần 4 for what it shows: the split inside the stored sample, not the whole market's.
  const readerTitles: Readonly<Record<string, string>> = marketPresentation ? { M04: 'Cơ cấu trong mẫu', M08: 'Giá và quy cách sản phẩm' } : {};
  const sections: DraftSection[] = catalog.sections.filter(section => section.sectionId.startsWith(prefix))
    .map(entry => ({ ...entry, title: readerTitles[entry.sectionId] ?? entry.title })).map(section => {
    if (insightPersona && section.sectionId === 'I02') {
      locatedViews.set(section.sectionId, () => insightPersonaSection(insightPersona.snapshot, insightPersona.source, 'I02', citations));
      return { sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [], method: 'insight-persona-report-snapshot-v1',
        explanation: 'Chân dung và thẻ bằng chứng là đề xuất AI từ lời nguồn đã lưu, chờ chủ duyệt; chưa đủ điều kiện phát hành kết luận.' };
    }
    if (marketPresentation && (section.sectionId === 'M01' || section.sectionId === 'M08')) {
      const unit = marketUnitRows(input, marketPresentation.input.rows);
      locatedViews.set(section.sectionId, () => section.sectionId === 'M01'
        ? renderAutomationMarketFindings(marketPresentation, citations, readerPlainText, input.metricMethods?.capture,
          readerPlainText && input.metricMethods?.capture ? marketHeadline(input, marketPresentation) : undefined) : renderAutomationMarketUnitPrices(marketPresentation, citations, readerPlainText, Boolean(input.marketInventory?.quotes.input.quotes.length),
            unit.profile, unit.rows));
      return { sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
        method: marketPresentation.methodVersion,
        explanation: section.sectionId === 'M01' ? 'Nhận định chỉ mô tả dữ liệu đã lưu trong phạm vi khai báo.'
          : 'Đối chiếu quy cách và giá theo đúng bản lưu; sản phẩm thiếu quy cách hoặc giá được tách riêng.' };
    }
    // Phần 11/12 are built from the sample rows alone: per-platform figures, proposals awaiting the owner, no AI text.
    if (marketPresentation && (section.sectionId === 'M11' || section.sectionId === 'M12')) {
      const reviewsCollected = marketReviewsCollected(input);
      const unit = marketUnitRows(input, marketPresentation.input.rows);
      const plan = marketActionPlan(unit.rows, { reviewsCollected, startDay: marketActionStartDay(input), currentReader: true, unitStandard: unit.profile?.standard ?? null, withoutAveragePrice: unit.withoutAveragePrice === true });
      locatedViews.set(section.sectionId, () => section.sectionId === 'M11' ? marketOpportunitySection(plan, reviewsCollected, unit) : marketActionSection(plan, unit, Boolean(input.marketRawSeries), marketActionStart(input)));
      return { sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [], method: marketPresentation.methodVersion,
        explanation: section.sectionId === 'M11' ? 'Cơ hội đọc từ doanh thu quan sát trong mẫu, ghi riêng từng sàn; là đề xuất của TDN, chờ chủ duyệt.' : ACTION_LEAD };
    }
    const decisionPacket = input.decisionPackets?.find(packet => packet.sectionId === section.sectionId);
    if (decisionPacket && input.decisionSourceClaims) {
      const synthesis = input.decisionSynthesis?.[decisionPacket.sectionId];
      const proposed = synthesis?.status === 'VALID' && synthesis.candidates.artifact.aiCandidates.length > 0;
      if (synthesis?.status === 'VALID') decisionGeneratedIds.push(section.sectionId);
      if (proposed) decisionProposedIds.push(section.sectionId);
      locatedViews.set(section.sectionId, () => decisionPacketSection(decisionPacket, input.decisionSourceClaims!, synthesis, citations, readerPlainText));
      return { sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
        method: `${decisionPacket.methodId}@${decisionPacket.methodVersion}`,
        explanation: !synthesis ? 'Đã nối bằng chứng của đúng phiên bản báo cáo. Chưa sinh giả thuyết, phương án hoặc hành động; không có quyết định thay người dùng.'
          : proposed ? 'Đã nối bằng chứng của đúng phiên bản báo cáo. Đề xuất AI đã lưu là bản nháp chờ người dùng xem xét, không phải phương án đã chọn; không có quyết định thay người dùng.'
          : synthesis.status === 'VALID' ? 'Đã nối bằng chứng của đúng phiên bản báo cáo. Lần xử lý AI đã lưu không đưa ra đề xuất; không có quyết định thay người dùng.'
          : 'Đã nối bằng chứng của đúng phiên bản báo cáo. Chưa có đề xuất AI được đưa vào báo cáo; không có quyết định thay người dùng.' };
    }
    if (kind === 'MARKET' && section.sectionId === 'M08' && input.quoteMethods) {
      const methods = input.quoteMethods;
      const usable = quoteMethodUsable(methods);
      locatedViews.set(section.sectionId, () => quoteMethodSection(methods, citations, readerPlainText));
      return { sectionId: section.sectionId, title: section.title, state: usable ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', rows: [],
        method: `${methods.output.methodId}@${methods.output.methodVersion}`,
        explanation: 'Đã kiểm tra trường nguồn và tính riêng từng cơ sở giá có đủ dữ liệu. Kết quả giới hạn trong các chào bán được chọn; chưa phải phân tích kinh tế đơn vị hoàn chỉnh.' };
    }
    if (kind === 'INSIGHT' && section.sectionId === 'I11' && (insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v3' || insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v4' || insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v5')) {
      const groups = insightCoding.groupCounts;
      const usable = groups.groups.some(group => group.counts.some(count => count.recordCount !== null && count.recordCount > 0));
      locatedViews.set(section.sectionId, () => draftInsightGroupsView(insightCoding, citations));
      return { sectionId: section.sectionId, title: section.title, state: usable ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', rows: [],
        method: groups.contractVersion,
        explanation: 'Số đếm theo cách xếp nhóm do AI đề xuất, chờ chủ duyệt, từ đúng bộ mã và bản ghi đã lưu. Nhóm theo sàn được xác định từ nguồn đã đối chiếu; chưa có bằng chứng phân biệt mua lẻ và mua sỉ. Chưa công bố tỷ lệ, chênh lệch hoặc suy luận giữa nhóm.',
        methodOutput: { methodOutputId: insightCoding.output.methodOutputId,
          locatedRecordCount: new Set(groups.groups.flatMap(group => group.counts.flatMap(count => count.recordPointers))).size,
          unresolvedPointers: [], blockers: groups.blockers } };
    }
    if (input.boundedMethods && ['M10', 'I11', 'I12', 'I16'].includes(section.sectionId)) {
      const html = renderReportMethodPacketSection({ gates: input.boundedMethods.output }, section.sectionId, { evidenceAnchorId: 'bounded-method-evidence' });
      if (html !== undefined) locatedViews.set(section.sectionId, () => html);
      return { sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
        method: `${input.boundedMethods.output.methodId}@${input.boundedMethods.output.methodVersion}`,
        explanation: 'Đã xử lý hồ sơ nguồn được chọn cho phiên bản này. Chỉ kiểm tra điều kiện phương pháp; chưa thực hiện dự báo, suy luận nhân quả hoặc xác nhận insight. Kỳ và phạm vi của hồ sơ không mặc nhiên trùng kỳ báo cáo.' };
    }
    if (kind === 'MARKET' && section.sectionId === 'M01' && input.m01Inventory && input.sourceClaims) return {
      sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
      method: `${input.m01Inventory.methodId}@${input.m01Inventory.methodVersion}`,
      explanation: input.m01Inventory.items.length
        ? 'Bằng chứng đầu nguồn đã được chốt với phiên bản này. Danh sách không thay thế kết luận chính hoặc quyết định của người dùng.'
        : 'Đã kiểm tra nguồn đã chốt với phiên bản này; chưa có mục bằng chứng nào đủ điều kiện cho M01. Nguồn đã chốt vẫn được giữ; khoảng trống này không phải kết luận.',
    };
    if (kind === 'INSIGHT' && section.sectionId === 'I14' && input.i14Admission && input.sourceClaims) return {
      sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
      method: `${input.i14Admission.methodId}@${input.i14Admission.methodVersion}`,
      explanation: 'Đã kiểm tra điều kiện bằng chứng cho I14. Kiểm tra này không tự tạo hoặc duyệt một hướng cơ hội.',
    };
    if (located && isLiteralFamily(section.sectionId) && !usesCodingFamily(insightCoding, section.sectionId)) {
      const result = located.output.sections[section.sectionId];
      const pending = literalPendingSection(located, section.sectionId, citations);
      locatedViews.set(section.sectionId, () => pending.notice + renderLocatedInsightSection(located.output, section.sectionId, { bundleDownload: false, showAnnotationPendingCount: false, citations })! + pending.details);
      return {
        sectionId: section.sectionId, title: section.title,
        state: result.annotationPointers.length ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', rows: [],
        method: `literal-source-bound-v1/${located.output.methodId}@${located.output.methodVersion}`,
        explanation: 'Khai báo bám sát lời nguồn được đưa vào theo quy tắc đã duyệt cho phạm vi hẹp. Giữ nguyên lời kể, điều chưa rõ và các phần chờ xử lý; chưa phải kết luận insight hoặc mục phân tích hoàn chỉnh.',
        methodOutput: { methodOutputId: located.output.methodOutputId, locatedRecordCount: result.locatedRecordCount,
          unresolvedPointers: located.projection.pending.flatMap((row, index) => row.family === section.sectionId ? [`/projection/pending/${index}`] : []), blockers: result.blockers },
      };
    }
    if (insightCoding && usesCodingFamily(insightCoding, section.sectionId)) {
      const view = insightCodingView(insightCoding, section.sectionId as CodingFamily, citations);
      locatedViews.set(section.sectionId, () => view.html);
      return {
        sectionId: section.sectionId, title: section.title, state: view.usable ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', rows: [],
        method: `source-bound-insight-coding-v1/${insightCoding.output.methodId}@${insightCoding.output.methodVersion}`,
        explanation: view.explanation, methodOutput: view.methodOutput,
      };
    }
    if (kind === 'MARKET' && input.metricMethods && (section.sectionId === 'M03' || section.sectionId === 'M04')) return {
      sectionId: section.sectionId, title: section.title, state: input.metricClassified ? 'METHOD_OUTPUT' : 'SOURCE_TABLE', rows: [],
      method: input.metricMethods.result.methodVersion,
      explanation: input.metricClassified ? (readerPlainText ? 'Đã tính các phạm vi toàn bộ mẫu, phạm vi rộng và phạm vi cốt lõi bằng phân loại được chủ dự án chấp nhận. Kết quả có giới hạn trong mẫu xuất, chưa chứng minh độ phủ toàn thị trường hoặc hoàn tất mọi yêu cầu của mục.' : 'Đã tính các phạm vi toàn bộ mẫu (ALL), rộng (WIDE) và cốt lõi (CORE) bằng phân loại được chủ dự án chấp nhận. Kết quả có giới hạn trong mẫu xuất, chưa chứng minh độ phủ toàn thị trường hoặc hoàn tất mọi yêu cầu của mục.') : marketPresentation ? section.sectionId === 'M04' && input.metricMethods.capture ? 'Cơ cấu doanh thu của mẫu đã lưu theo từ khóa, đọc riêng từng sàn; chưa phân loại thành thị trường.' : 'Đã tính theo công thức đã chốt từ các dòng số liệu nguồn gốc. Tổng và mức tập trung dưới đây chỉ áp dụng cho mẫu xuất theo từ khóa, chưa phân loại thành thị trường.' : 'Đã tính theo công thức đã chốt từ các dòng số liệu nguồn gốc. Tổng và mức tập trung dưới đây chỉ áp dụng cho mẫu xuất theo từ khóa; chưa phải thị trường đã phân loại hoặc mục phân tích hoàn chỉnh.',
    };
    if (kind === 'MARKET' && input.metricMethodsFailure && (section.sectionId === 'M03' || section.sectionId === 'M04')) return {
      sectionId: section.sectionId, title: section.title, state: 'BLOCKED', rows: [], method: 'metric-scope-v1',
      explanation: metricFailureCopy[input.metricMethodsFailure].explanation,
    };
    if (kind === 'MARKET' && input.marketInventory && (section.sectionId === 'M03' || section.sectionId === 'M08')) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_TABLE', rows: [],
      method: section.sectionId === 'M03' ? 'source-compatible-temporal-v1@1.0.0' : 'generic-quote-unit-v1@1.0.0',
      explanation: 'Đã lập danh sách quan sát từ nguồn lưu sẵn. Chưa tính được vì thiếu điều kiện nguồn; danh sách này chưa phải kết quả phân tích hoàn chỉnh.',
    };
    if (contextSections.includes(section.sectionId)) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_CONTEXT', method: 'automation-source-context-v1', rows: section.sectionId === 'M13' ? observations : [],
      explanation: section.sectionId === 'I01' ? 'Yêu cầu nghiên cứu ghi lại từ phạm vi đã xác nhận; không phải nhận định AI hay insight đã duyệt.'
        : marketPresentation && section.sectionId === 'M13' ? 'Dấu vết nguồn, kết quả tìm kiếm đã lưu và tài liệu tham khảo của lượt này.' : 'Phạm vi yêu cầu, độ phủ thực tế và dấu vết nguồn của lượt này. Không thay thế phương pháp tính chuyên biệt của từng mục.',
    };
    if (section.sectionId === 'M07' && defaultMarketPeers) {
      const owner = marketPresentation ? { rankingShown: input.marketPresentationCharts?.some(chart => chart.kind === 'product-ranking') === true } : undefined;
      locatedViews.set(section.sectionId, () => defaultPeerSection(defaultMarketPeers, citations, productLabels(input), readerPlainText || Boolean(input.publicReviewSource), owner));
      const usable = defaultMarketPeers.frames.some(frame => frame.state === 'SELECTED' || frame.state === 'ZERO_REVENUE');
      // The owner reader's explanation must agree with the body: no "rule applied" line when no group could be chosen.
      const chosen = defaultMarketPeers.frames.some(frame => frame.state === 'SELECTED');
      return { sectionId: section.sectionId, title: section.title, state: usable ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS',
        method: defaultMarketPeers.input.rule.version, rows: [],
        explanation: marketPresentation ? (chosen ? 'Đối thủ mặc định được chọn theo doanh thu cùng nhóm, cùng sàn và cùng kỳ trong mẫu đã lưu; đối thủ do chủ bổ sung được giữ riêng. Kết quả chỉ mô tả mẫu đã lưu, không thay quyết định của chủ.'
          : defaultMarketPeers.frames.length ? 'Chưa chọn được đối thủ mặc định: các nhóm doanh số trong mẫu chưa đủ dữ liệu để chọn.'
            : 'Chưa chọn được đối thủ mặc định vì chưa có nhóm doanh số đã phân loại.')
          : 'Đã áp dụng quy tắc đối thủ mặc định trên doanh thu cùng nhóm, kỳ và khung nguồn đã lưu; phần thiếu giữ nguyên, bổ sung của chủ giữ riêng. Kết quả có giới hạn trong mẫu, chưa phải mục phân tích hoàn chỉnh hoặc quyết định đã duyệt.' };
    }
    const view = descriptive && isDescriptiveSectionId(section.sectionId) ? describeDescriptiveSection(descriptive, section.sectionId, citations, readerPlainText,
      { productLabels: descriptiveProductLabels(input), requestedPeriod: input.start.requestedPeriod, ...(marketPresentation ? { market14: true } : {}),
        // Phần 3 prints the inventory rows unless the metric step failed and no method is retained.
        ...(marketPresentation && input.marketInventory && (input.metricMethods || !input.metricMethodsFailure) ? { periodRowsInM03: true } : {}) }) : undefined;
    if (view) views.set(section.sectionId, view);
    const methodOutput = view && descriptive ? { methodOutputId: descriptive.methodOutputId, locatedRecordCount: view.locatedRecordCount, unresolvedPointers: view.unresolvedPointers, blockers: view.blockers } : undefined;
    if (view?.usable && methodOutput) return {
      sectionId: section.sectionId, title: section.title, state: 'METHOD_OUTPUT', method: `${descriptive!.methodId}@${descriptive!.methodVersion}`, rows: [], methodOutput,
      explanation: marketPresentation ? 'Số liệu mô tả từ nguồn đã lưu của lượt này; chỉ nói về dữ liệu đã thu, không suy rộng ra toàn thị trường.'
        : 'Kết quả phương pháp mô tả có giới hạn từ gói nguồn đã lưu. Phương pháp đã chạy, nhưng mục này chưa phải phân tích hoàn chỉnh và chưa được duyệt.',
    };
    if (section.sectionId === 'M07' && evidence.length > 0) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_TABLE', method: 'automation-explicit-peer-evidence-v1', rows: evidence,
      explanation: 'Bảng quan sát cho nhóm sản phẩm đối chiếu được chọn rõ ràng, cùng nguồn, đơn vị và kỳ đo. Không đại diện toàn thị trường; chưa thực hiện đầy đủ phương pháp M07.',
    };
    if (methodOutput) return {
      sectionId: section.sectionId, title: section.title, state: 'METHOD_NO_USABLE_RECORDS', method: `${descriptive!.methodId}@${descriptive!.methodVersion}`, rows: [], methodOutput,
      explanation: `Phương pháp mô tả đã chạy nhưng không có bản ghi nguồn dùng được cho mục này. Đây không phải kết quả bằng 0. Mục vẫn cần: ${section.requiredInputs.map(id => inputLabels[id] ?? id).join(', ')}.`,
    };
    if (kind === 'MARKET' && input.descriptiveMethodFailure && isDescriptiveSectionId(section.sectionId)) return {
      sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [],
      explanation: 'Đã thử chạy phương pháp mô tả nhưng đầu vào hoặc phương pháp không vượt qua kiểm tra. Không có kết quả dùng được cho mục này; xem mã lỗi và dấu vết nguồn tại phụ lục M13. Không tự động gọi lại nguồn.',
    };
    if (kind === 'MARKET' && input.marketInventoryFailure && (section.sectionId === 'M03' || section.sectionId === 'M08')) return {
      sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [],
      explanation: 'Phương pháp đã được nối nhưng dữ liệu nguồn không vượt qua kiểm tra inventory. Chưa có kết quả được xác minh; không tự gọi lại nguồn.',
    };
    if (insightLiteral && ['I05', 'I07', 'I08', 'I13'].includes(section.sectionId)) return {
      sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
      method: `${insightLiteral.methodId}@${insightLiteral.methodVersion}`,
      explanation: section.sectionId === 'I05'
        ? 'Đã giữ riêng số sao từ nguồn và trạng thái phần chữ. Đây là hồ sơ bản ghi, chưa phải phân loại cảm nhận hoặc kết luận về khách hàng.'
        : 'Lớp lời người bán được đối chiếu riêng theo trường và vị trí nguồn; phần thiếu được ghi rõ. Không thay thế lời khách hoặc kết quả mã hóa.',
    };
    fallbackIds.add(section.sectionId);
    return { sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [], explanation: blockedGuidance(section) };
  });
  const ids = (state: DraftSection['state']): string[] => sections.filter(section => section.state === state).map(section => section.sectionId);
  const completion = {
    completedAnalyticalSections: 0,
    boundedMethodOutputSections: ids('METHOD_OUTPUT').length, boundedMethodOutputSectionIds: ids('METHOD_OUTPUT'),
    boundedMethodNoUsableRecordSectionIds: ids('METHOD_NO_USABLE_RECORDS'),
    evidenceInventorySectionIds: ids('EVIDENCE_INVENTORY'),
    contextSections: ids('SOURCE_CONTEXT').length, sourceTableSections: ids('SOURCE_TABLE').length, blockedSections: ids('BLOCKED').length,
  };
  const sourceScope = kind === 'MARKET' ? projectMarketSourceScope(input) : undefined;
  // The frozen peer policy selects v14 even for Metric-only drafts. Marker-free
  // Market drafts retain v12/v13 dispatch; every Insight keeps its original identity.
  // Draft Insight reports carry their own renderer identity, gated only on the
  // snapshot-v2 draft marker; marker-free output keeps byte-identical dispatch.
  const descriptiveVersion = kind === 'MARKET' ? input.descriptiveMethods?.methodVersion : undefined;
  const draftInsight = kind === 'INSIGHT' && input.insightCoding !== undefined && 'draftSelection' in input.insightCoding;
  const testReviewSample = kind === 'MARKET' && !input.publicReviewSource ? exactTestReviewSample(input) : null;
  const rendererVersion = input.publicReviewSource ? 'automation-report-kit-v31' : testReviewSample ? 'automation-report-kit-v30' : input.qualitativeDraft ? 'automation-report-kit-v28' : insightPersona ? 'automation-report-kit-v26' : kind === 'INSIGHT' && input.insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v5' ? 'automation-report-kit-v25' : marketPresentation ? 'automation-report-kit-v20' : kind === 'INSIGHT' && input.start.privateShopeeSource ? (sample ? 'automation-report-kit-v27' : 'automation-report-kit-v22') : insightCrosscheck ? 'automation-report-kit-v23' : kind === 'INSIGHT' && input.insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v4' ? 'automation-report-kit-v21' : insightLiteral ? 'automation-report-kit-v19' : kind === 'MARKET' && input.sourceEvidence?.jevTriage ? 'automation-report-kit-v29' : input.sourceEvidence ? 'automation-report-kit-v18'
    : draftInsight && input.insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v3' ? 'automation-report-kit-v17'
    : draftInsight ? 'automation-report-kit-v15'
    : defaultMarketPeers ? 'automation-report-kit-v14'
    // Generated admission alone does not change historical dispatch. Only a
    // retained execution of this packet uses the new generic guard renderer.
    : input.decisionPackets?.some(packet => packet.methodVersion === '1.3.0' &&
        ['VALID', 'INVALID', 'DISPATCH_UNKNOWN'].includes(input.decisionSynthesis?.[packet.sectionId]?.status ?? '')) ? 'automation-report-kit-v24'
    : descriptiveVersion && descriptiveVersion !== '1.0.0' ? 'automation-report-kit-v13' : 'automation-report-kit-v12';
  /** Everything except the citation trace, which only exists once every renderer has run. */
  const semanticBase = {
    ...(testReviewSample ? { exactTestReviewSample: { collection: input.collection!.exactShopee, outcome: testReviewSample } } : {}),
    ...(marketPresentation ? { marketPresentation } : {}),
    ...(input.sourceEvidence ? { sourceEvidence: input.sourceEvidence } : {}),
    ...(sourceScope ? { sourceScope } : {}),
    ...(defaultMarketPeers ? { defaultMarketPeers } : {}),
    ...(kind === 'MARKET' && input.quoteMethods ? { quoteMethods: input.quoteMethods } : {}),
    ...(input.boundedMethods ? { boundedMethods: input.boundedMethods } : {}),
    ...(input.publicReviewSource ? { publicReviewSource: input.publicReviewSource, ...(input.publicReviewCorpus ? { publicReviewCorpus: input.publicReviewCorpus } : {}) } : {}),
    contractVersion: 'research-automation-report-v1', rendererVersion, kind, state: 'PARTIAL_UNREVIEWED_DRAFT',
    runId: input.run.runId, workspaceId: input.run.workspaceId, createdAt: input.run.createdAt,
    keyword: input.start.keyword, country: input.start.country, requestedPeriod: input.start.requestedPeriod,
    scope: input.scope, scopeApplication: 'OWNER_CONTEXT_ONLY_SOURCE_FILTER_MAPPING_PENDING', coverage: input.run.coverage, usage: input.run.usage,
    collectionOutcome: input.collection?.outcome ?? null, limitations: input.collection?.limitations ?? [],
    captures: input.captures, sections, ...(kind === 'INSIGHT' ? { reviewCorpus: input.reviewCorpus ?? null, locatedReview: input.locatedReview ?? null, nativeReview: input.nativeReview ?? null,
      ...(input.nativeReviewFallback ? { nativeReviewFallback: input.nativeReviewFallback } : {}),
      ...(input.insightCoding ? { insightCoding: input.insightCoding } : {}),
      ...(insightPersona ? { insightPersona } : {}),
      ...(insightCrosscheck ? { insightCrosscheck } : {}),
      ...(privateView ? { privateReviewCorpus: privateView } : {}),
      ...(sample ? { reviewSample: sample } : {}),
      ...(insightLiteral ? { insightLiteral } : {}),
      ...(input.nativeReviewFailure ? { nativeReviewFailure: input.nativeReviewFailure } : {}),
      ...(input.locatedReviewFailure ? { locatedReviewFailure: input.locatedReviewFailure } : {}), ...(input.reviewCorpusFailure ? { reviewCorpusFailure: input.reviewCorpusFailure } : {}), ...(input.qualitativeDraft ? { qualitativeDraft: input.qualitativeDraft } : {}) } : {}), ...(kind === 'MARKET' ? { marketInventory: input.marketInventory ?? null, ...(input.marketInventoryFailure ? { marketInventoryFailure: input.marketInventoryFailure } : {}), descriptiveMethods: input.descriptiveMethods ?? null,
      ...(input.descriptiveMethodFailure ? { descriptiveMethodFailure: input.descriptiveMethodFailure } : {}),
      metricMethods: input.metricMethods ?? null, ...(input.metricClassified ? { metricClassified: input.metricClassified } : {}), ...(input.metricMethodsFailure ? { metricMethodsFailure: input.metricMethodsFailure } : {}) } : {}), completion,
  };
  const title = kind === 'MARKET' ? 'Báo cáo thị trường' : 'Báo cáo insight';
  const period = `${input.start.requestedPeriod.startDate} đến ${input.start.requestedPeriod.endDate} · ${input.start.requestedPeriod.dayCount} ngày`;
  const retainedSources = (kind === 'MARKET' ? [
    input.metricMethods || input.metricMethodsFailure ? 'gói số liệu thị trường gắn kèm (M03, M04)' : '', input.quoteMethods ? 'gói báo giá bổ sung (M08)' : '',
    input.m01Inventory ? 'bằng chứng đầu nguồn (M01)' : '', input.boundedMethods ? 'hồ sơ nguồn bổ sung (M10)' : '',
  ] : [
    input.nativeReview || input.collection?.nativeReview ? 'review native đã lưu (I03, I17)' : '', input.reviewCorpus ? 'collection review đã lưu (I03, I17)' : '',
    input.i14Admission ? 'bằng chứng bối cảnh sử dụng (I14)' : '', input.boundedMethods ? 'hồ sơ nguồn bổ sung (I11, I12, I16)' : '',
  ]).filter(Boolean);
  const noCaptureRow = `<tr><td colspan="4">Lượt này không có bản thu từ truy vấn nguồn mới.${retainedSources.length ? ` Nguồn đã lưu và gắn với lượt vẫn được dùng ở: ${retainedSources.join('; ')}.` : ''}</td></tr>`;
  const labels = productLabels(input);
  const inventoryReader = marketPresentation ? { platforms: new Map([...(input.collection?.productCards ?? []), ...(input.run.productCards ?? [])]
    .map(card => [card.productId, card.provider === 'kalodata' ? 'tiktok' : card.productId.startsWith('shopee:') ? 'shopee' : ''] as const)),
    scope: input.scope, sampleWindow: marketSamplePeriod(input), captures: input.captures, ...(input.marketRawSeries ? { withoutAveragePrice: true } : {}) } : undefined;
  // Discovery exchanges are technical receipts; only verified PDF excerpts earn visible S25 citations.
  const discoverySearchIndex = input.collection?.pdfDiscovery?.search.captureIndex;
  const visibleCaptures = input.captures.filter(capture => !(capture.stepId === 'COLLECTION' &&
    (capture.provider === 'pdf-discovery' || (discoverySearchIndex != null && capture.ordinal === discoverySearchIndex))));
  // Build the original citations before filtering the reader so retained semantic bytes stay stable.
  const retainedSourceTable = `<p>Kỳ truy vấn là khoảng ngày đã gửi tới nguồn, không chứng minh đã thu đủ dữ liệu.</p><div class="table-wrap" role="region" aria-label="Bản thu từ truy vấn nguồn" tabindex="0"><table><caption>Bản thu từ truy vấn nguồn của lượt này</caption><thead><tr><th scope="col">Thao tác</th><th scope="col">Kỳ truy vấn</th><th scope="col">Lượt gọi kết thúc</th><th scope="col">Nguồn</th></tr></thead><tbody>${visibleCaptures.map(capture => `<tr><td>${escape(stepLabel(capture.stepId))}</td><td>${capture.window ? escape(`${capture.window.startDate} đến ${capture.window.endDate}`) : 'Không áp dụng kỳ truy vấn'}</td><td>${escape(capture.retrievedAt)}</td><td>${captureMark(capture, citations)}${capture.truncated ? '<br>Bản thu bị cắt; không dùng để tính' : ''}</td></tr>`).join('') || noCaptureRow}</tbody></table></div>`;
  const sourceTable = marketPresentation ? `<template data-market14-source-trace>${retainedSourceTable}</template>` : retainedSourceTable;
  const webResults = input.collection?.webResults ?? [];
  const pageTypes = input.sourceEvidence?.webPageTypes === true;
  const expandedRows = Boolean(marketPresentation) || webResults.some(row => row.origin !== undefined);
  const webGroupKey = (row: StepWebResult): string => `${row.origin ?? 'BASIC'}:${row.captureIndex}`;
  const webGroups = [...new Set(webResults.map(webGroupKey))];
  const webRowHtml = (row: StepWebResult): string => `<tr><td>${row.position}</td><td>${webSourceText(row.title, WEB_TITLE_WITHHELD, Boolean(marketPresentation))}</td><td>${row.site === undefined || row.site === null ? 'Chưa rõ trang' : webSourceText(row.site, WEB_SITE_WITHHELD, Boolean(marketPresentation))}</td>${expandedRows ? `<td>${escape(kind === 'MARKET' && readerPlainText ? expandedSearchReaderLabel(row, Boolean(marketPresentation)) : row.origin ? EXPANDED_SEARCH_LABEL[row.origin] : '')}</td>` : ''}${pageTypes ? `<td>${pageTypeCell(row)}</td>` : ''}${marketPresentation ? `<td>${escape(webReaderDay(row.published))}</td>` : ''}<td>${escape(marketPresentation ? webReaderRetrieved(row.retrievedAt) : row.retrievedAt)}</td><td>${webMark(row, citations)}</td></tr>`;
  const webGroupedRows = (): string => {
    let previous = '';
    return webResults.map(row => {
      const group = webGroupKey(row), changed = group !== previous;
      const label = expandedSearchReaderLabel(row, true) + (webGroups.filter(key => key.startsWith(`${row.origin ?? 'BASIC'}:`)).length > 1 ? ` · lượt thu ${webGroups.indexOf(group) + 1}` : '');
      const opening = changed ? `${previous ? '</tbody>' : ''}<tbody data-web-search-group aria-label="${escape(label)}">` : '';
      previous = group;
      return opening + webRowHtml(row);
    }).join('') + '</tbody>';
  };
  // Unparseable source labels remain copied evidence; the separate current-reader date column states availability.
  const pageTypeCell = (row: StepWebResult): string => {
    const type = classifyWebPage(row);
    const quotedLabel = type === 'S26' && row.published && (!marketPresentation || webReaderDay(row.published) === 'Chưa có ngày đăng');
    return `${WEB_PAGE_TYPE_LABEL[type]}${quotedLabel ? `<br>Đăng ${webSourceText(row.published!, 'Ngày đăng được giữ trong bản lưu', Boolean(marketPresentation))}` : ''}`;
  };
  // A web source that failed or timed out leaves no rows; the reader is told
  // plainly instead of seeing an empty area.
  const webSourceFailed = !webResults.length && (input.collection?.coverage ?? [])
    .some(value => value.dataset === WEB_DISCOVERY_DATASET && value.state === 'FAILED');
  const webResultsTable = webResults.length ? `<div class="table-wrap" role="region" aria-label="Kết quả tìm kiếm trên web đã lưu" tabindex="0"><table><caption>Kết quả tìm kiếm trên web đã lưu của lượt này, theo thứ tự nguồn trả về</caption><thead><tr><th scope="col">Vị trí</th><th scope="col">Tiêu đề</th><th scope="col">Trang</th>${expandedRows ? `<th scope="col">${EXPANDED_SEARCH_COLUMN}</th>` : ''}${pageTypes ? '<th scope="col">Loại trang</th>' : ''}${marketPresentation ? '<th scope="col">Ngày đăng</th>' : ''}<th scope="col">Thời điểm thu</th><th scope="col">Nguồn</th></tr></thead>${marketPresentation ? webGroupedRows() : `<tbody>${webResults.map(webRowHtml).join('')}</tbody>`}</table></div><p>${marketPresentation ? 'Giữ nguyên vị trí nguồn trả về trong từng lượt tìm; các vị trí bị khuyết do gộp kết quả trùng. Khoảng ngày là yêu cầu tìm kiếm, không xác nhận ngày đăng nằm trong kỳ báo cáo. Nhãn ngày do nguồn ghi được trích nguyên văn; cột Ngày đăng ghi ngày đã chuẩn hóa hoặc tình trạng thiếu ngày.' : 'Thứ tự trên là thứ tự kết quả nguồn trả về, không phải xếp hạng.'} Đoạn trích và liên kết đầy đủ được giữ trong hồ sơ thu đã lưu.</p>${webResults.some(row => row.origin !== undefined) ? `<p>${EXPANDED_SEARCH_NOTE}</p>` : ''}` : webSourceFailed ? `<p class="warning">${WEB_SOURCE_FAILED_TEXT}</p>` : '';
  // The owner reader prints the period the numbers come from; the requested period alone would contradict the cover.
  const samplePeriod = marketPresentation ? marketSamplePeriod(input) : null;
  const requested = input.start.requestedPeriod;
  const sampleDays = samplePeriod ? Math.round((Date.parse(samplePeriod.end) - Date.parse(samplePeriod.start)) / 86_400_000) + 1 : 0;
  const sampleInputs = samplePeriod ? marketSamplePeriodInputs(input, samplePeriod) : [];
  const sampleDay = (value: string, at: number): string => traceMarketNumber(readerDay(value), 'M02.period.sample', 'raw', [sampleInputs[at]!], 'stored day dd/mm/yyyy', 'vi-date');
  // The requested period is a field of the run record.
  const requestedDay = (value: string | undefined, field: 'startDate' | 'endDate'): string => value
    ? traceMarketNumber(readerDay(value), 'M02.period.requested', 'raw', [storedInput('run-record', input.run.runId, `/start/requestedPeriod/${field}`, value)], 'run record day dd/mm/yyyy', 'vi-date')
    : readerDay('chưa rõ ngày');
  // Describe retained product windows separately, using the same query-window precedence as E's period table.
  const windowTexts = new Map<string, MarketTraceInput[]>();
  if (marketPresentation) (input.marketInventory?.temporal.input.observations ?? []).forEach((row, at) => {
    const raw = Boolean(row.rawQuery?.start && row.rawQuery.end), window = raw ? row.rawQuery : row.requestedWindow;
    const valid = (day: string): boolean => /^\d{4}-\d{2}-\d{2}$/u.test(day) && Number.isFinite(Date.parse(day))
      && new Date(day).toISOString().slice(0, 10) === day;
    if (!(window?.start && window.end && valid(window.start) && valid(window.end) && window.start <= window.end
      && (!samplePeriod || window.start !== samplePeriod.start || window.end !== samplePeriod.end))) return;
    const text = `${readerDay(window.start)}–${readerDay(window.end)}`, field = raw ? 'rawQuery' : 'requestedWindow';
    // Each window is printed once, recorded with the stored observation it was first read from.
    if (!windowTexts.has(text)) windowTexts.set(text, [storedInput('stored-source', 'market-inventory', `/temporal/input/observations/${at}/${field}/start`, window.start, 'start'),
      storedInput('stored-source', 'market-inventory', `/temporal/input/observations/${at}/${field}/end`, window.end, 'end')]);
  });
  const seriesWindows = [...windowTexts].map(([text, inputs]) => traceMarketNumber(text, 'M02.period.windows', 'raw', inputs, 'stored window dd/mm/yyyy–dd/mm/yyyy', 'vi-date-range'));
  const crossesQuarter = samplePeriod && `${samplePeriod.start.slice(0, 4)}-${Math.floor((Number(samplePeriod.start.slice(5, 7)) - 1) / 3)}`
    !== `${samplePeriod.end.slice(0, 4)}-${Math.floor((Number(samplePeriod.end.slice(5, 7)) - 1) / 3)}`;
  const quarterConvention = marketPresentation && crossesQuarter
    ? '<p>Quý báo cáo là quý chứa phần lớn số ngày của kỳ mẫu bán hàng; nếu hai quý có số ngày bằng nhau, chọn quý sau.</p>' : '';
  const periodRows = !marketPresentation ? `<dt>Kỳ báo cáo yêu cầu</dt><dd>${escape(period)}</dd>`
    : `<dt>Kỳ số liệu bán hàng</dt><dd>${samplePeriod ? `Mẫu ${traceMarketNumber(String(sampleDays), 'M02.period.sample', 'computed', sampleInputs, 'inclusive days of the sample period', 'day-count')} ngày, từ ${escape(sampleDay(samplePeriod.start, 0))} đến ${escape(sampleDay(samplePeriod.end, 1))}`
      : 'Chưa có kỳ số liệu bán hàng hợp lệ'}</dd>${seriesWindows.length
      ? `<dt>Kỳ số liệu từng sản phẩm</dt><dd>Các kỳ đã lưu: ${escape(seriesWindows.join('; '))}. Các kỳ này tách riêng với kỳ mẫu bán hàng.</dd>` : input.descriptiveMethods
      ? `<dt>Diễn biến từng sản phẩm</dt><dd>Theo từng kỳ trong khoảng từ ${escape(requestedDay(requested.startDate, 'startDate'))} đến ${escape(requestedDay(requested.endDate, 'endDate'))}</dd>` : ''}`;
  // Only v3 adopts the sample-filter copy; retained v1/v2 reports keep their exact wording.
  const captureFiltered = Boolean(marketPresentation && input.metricMethods?.capture?.rowPolicyVersion === 'automation-metric-capture-v3');
  const periodWarning = marketPresentation ? 'Mỗi nguồn chỉ có số trong kỳ của nguồn đó; không kéo dài hay chia tỷ lệ cho khớp kỳ khác.'
    : 'Kỳ yêu cầu không chứng minh mọi nguồn có đủ dữ liệu trong kỳ này.';
  // Auto-run captures carry fixed scope lines: keyword 2 and the category chosen from data, or why all categories were kept.
  const searchScopeLines = kind === 'MARKET' ? input.metricMethods?.capture?.searchScope?.lines ?? [] : [];
  const searchScope = searchScopeLines.length ? `<dt>Phạm vi tìm kiếm</dt><dd>${searchScopeLines.map(line => escape(line)).join('<br>')}</dd>` : '';
  const scope = `<dl><dt>Thị trường</dt><dd>Việt Nam</dd><dt>Định nghĩa đã xác nhận</dt><dd>${storedLiteral(input.scope.definition, 'Định nghĩa được giữ trong bản lưu')}</dd>${periodRows}<dt>Điều kiện bao gồm</dt><dd>${storedLiteral(input.scope.includeTerms.join(', ') || (captureFiltered ? 'Mọi sản phẩm trả về cho từ khóa đã tìm' : 'Không thêm điều kiện'),'Điều kiện được giữ trong bản lưu')}</dd><dt>Điều kiện loại trừ</dt><dd>${storedLiteral(input.scope.excludeTerms.join(', ') || (captureFiltered ? 'Không có điều kiện riêng ngoài bộ lọc mẫu' : 'Không thêm điều kiện'), 'Điều kiện được giữ trong bản lưu')}</dd>${searchScope}${captureFiltered
    ? '<dt>Bộ lọc mẫu</dt><dd>Loại phụ kiện, linh kiện, sản phẩm khác và dòng có doanh thu hoặc đơn vị bán bất thường khỏi mẫu tính; số dòng đã loại của từng sàn ghi tại mục Phạm vi từng nguồn.</dd>' : ''}</dl><p class="warning">${captureFiltered
    ? 'Điều kiện bao gồm và loại trừ là ý định nghiên cứu đã lưu; chưa xác nhận truy vấn nguồn áp dụng đầy đủ. Bộ lọc mẫu do hệ thống áp dụng trên bảng kết quả đã lưu.'
    : 'Điều kiện trên là ý định nghiên cứu đã lưu. Chưa xác nhận các truy vấn nguồn áp dụng đầy đủ điều kiện này.'} ${input.metricClassified ? (readerPlainText ? 'Mẫu số liệu thị trường đã được phân loại theo phạm vi toàn bộ mẫu, phạm vi rộng và phạm vi cốt lõi theo quy tắc và biên nhận được chốt; không suy rộng phân loại đó sang nguồn khác.' : 'Mẫu số liệu thị trường đã được phân loại CORE/WIDE theo quy tắc và biên nhận được chốt; không suy rộng phân loại đó sang nguồn khác.') : captureFiltered ? 'Chưa chia nhóm sản phẩm.' : (readerPlainText ? 'Chưa phân loại phạm vi.' : 'Chưa phân loại CORE/WIDE.')} ${periodWarning} Kết quả tìm kiếm hiện tại và danh sách top sản phẩm không phải tổng doanh số thị trường.</p>${quarterConvention}`;
  const stateLabel: Readonly<Record<DraftSection['state'], string>> = {
    EVIDENCE_INVENTORY: 'Kiểm tra bằng chứng · Chưa có kết luận',
    BLOCKED: 'Chưa đủ dữ liệu / phương pháp', SOURCE_TABLE: 'Bảng bằng chứng · Chưa duyệt', SOURCE_CONTEXT: 'Ngữ cảnh nguồn · Chưa duyệt',
    METHOD_OUTPUT: kind === 'INSIGHT' ? 'Mã hóa lời nguồn · Kết quả từng phần' : 'Kết quả phương pháp mô tả · Chưa phải phân tích hoàn chỉnh', METHOD_NO_USABLE_RECORDS: 'Phương pháp đã chạy · Không có bản ghi dùng được',
  };
  const analyticalCompletion = kind === 'MARKET' && input.publicReviewSource && completion.completedAnalyticalSections === 0
    ? 'Chưa có mục phân tích hoàn chỉnh' : `Mục phân tích hoàn chỉnh: ${completion.completedAnalyticalSections}`;
  const coverSummary = `Trong ${sections.length} mục: ${([
    [completion.boundedMethodOutputSections, 'có kết quả phương pháp từng phần'], [completion.evidenceInventorySectionIds.length, 'kiểm tra bằng chứng'],
    [completion.contextSections, 'ngữ cảnh nguồn'], [completion.sourceTableSections, 'bảng nguồn'],
    [completion.boundedMethodNoUsableRecordSectionIds.length, 'đã chạy phương pháp nhưng không có bản ghi dùng được'], [completion.blockedSections, 'chưa có kết quả'],
  ] as const).flatMap(([count, label]) => count ? [`${count} mục ${label}`] : []).join('; ')}. ${analyticalCompletion}; không tuyên bố báo cáo hoàn chỉnh.`;
  const methodIds = completion.boundedMethodOutputSectionIds;
  const emptyIds = completion.boundedMethodNoUsableRecordSectionIds;
  const literalIds = methodIds.filter(id => isLiteralFamily(id) && !usesCodingFamily(insightCoding, id));
  const codingIds = methodIds.filter(id => usesCodingFamily(insightCoding, id));
  const headline = [
    kind === 'MARKET' && input.metricMethods ? input.metricClassified ? (readerPlainText ? 'Đã tính các phạm vi toàn bộ mẫu, phạm vi rộng và phạm vi cốt lõi bằng phân loại đã duyệt. Kết quả giới hạn trong mẫu nguồn và kỳ đo đã lưu; chưa đánh dấu M03/M04 hoàn chỉnh.' : 'Đã tính các phạm vi ALL/WIDE/CORE bằng phân loại đã duyệt. Kết quả giới hạn trong mẫu nguồn và kỳ đo đã lưu; chưa đánh dấu M03/M04 hoàn chỉnh.') : 'Đã tính tổng và độ tập trung từ các dòng số liệu nguồn gốc của đúng lượt này. Mẫu theo từ khóa chưa được phân loại thành thị trường; không đánh dấu M03/M04 hoàn chỉnh.' : '',
    kind === 'MARKET' && input.descriptiveMethodFailure ? 'Chưa tính được các mục mô tả thị trường vì đầu vào hoặc phương pháp không vượt qua kiểm tra. Bản nháp này chỉ giữ ngữ cảnh và dấu vết nguồn. Cần kiểm tra lỗi trước khi tạo phiên bản mới; không tự động gọi lại nguồn.' : '',
    `${analyticalCompletion}.`,
    completion.evidenceInventorySectionIds.length ? `Đã kiểm tra bằng chứng, chưa có kết luận: ${completion.evidenceInventorySectionIds.join(', ')}.` : '',
    decisionProposedIds.length ? `Đề xuất AI đã lưu ở ${decisionProposedIds.join(', ')} là bản nháp chưa duyệt, không tính là mục phân tích hoàn chỉnh.` : '',
    kind === 'MARKET' ? descriptive ? `Kết quả phương pháp mô tả có giới hạn, chưa duyệt: ${methodIds.length} mục${methodIds.length ? ` (${methodIds.join(', ')})` : ''}.` : input.descriptiveMethodFailure ? '' : `Không có kết quả phương pháp mô tả thị trường: ${input.collection?.comparables.length ? 'các quan sát sản phẩm đã thu chưa tạo được kết quả được lưu' : 'lượt này không có quan sát sản phẩm từ bản thu nguồn mới'}.` : '',
    located ? `Mã hóa lời nguồn có giới hạn: ${literalIds.length} mục${literalIds.length ? ` (${literalIds.join(', ')})` : ''}. ${located.projection.pending.length} mục chờ xử lý vẫn được giữ riêng. Chưa có kết luận hoặc tỷ lệ đại diện thị trường.` : '',
    insightCoding ? `Mã hóa ${'draftSelection' in insightCoding ? 'đề xuất (đề xuất, chờ chủ duyệt)' : 'đã chọn'} trên đề xuất (${(('draftSelection' in insightCoding) || ('selectionContractVersion' in insightCoding && insightCoding.selectionContractVersion === 'automation-insight-selection-v2') ? semanticCodingFamilies : codingFamilies).join(', ')}): có kết quả dùng được ở ${codingIds.length ? codingIds.join(', ') : 'chưa mục nào'}. Đây là mã hóa bám lời nguồn, không phải quan sát độc lập${sections.some(section => usesCodingFamily(insightCoding, section.sectionId) && section.methodOutput?.unresolvedPointers.length) ? '; phần chưa chọn vẫn chờ xử lý' : ''}.` : '',
    emptyIds.length ? `Phương pháp đã chạy nhưng không có bản ghi dùng được: ${emptyIds.join(', ')}.` : '',
    `Ngữ cảnh hoặc bảng nguồn: ${completion.contextSections + completion.sourceTableSections} mục. Chưa có kết quả: ${completion.blockedSections + emptyIds.length} mục.`,
    'Ngữ cảnh, bảng nguồn, kết quả phương pháp từng phần và tệp PDF không đồng nghĩa với phân tích hoàn chỉnh.',
  ].filter(Boolean).join(' ');
  const reviewOutcome = missingReviewOutcome(input);
  const marketSectionLabel = (sectionId: string): string => {
    const match = /^M(0[1-9]|1[0-3])$/u.exec(sectionId);
    if (!match) return sectionId;
    const number = Number(match[1]);
    return number === 13 ? 'Phụ lục' : `Phần ${number}`;
  };
  const marketReaderLabels = (source: string): string => {
    const rewrite = (part: string): string => part.replace(/(?<![\p{L}\p{N}_-])M(0[1-9]|1[0-3])(?![\p{L}\p{N}_-])/gu, (_match, digits: string) => marketSectionLabel(`M${digits}`));
    return marketPresentation ? currentReaderProse(source, rewrite) : source.split(/(<[^>]+>)/gu).map((part, index) => index % 2 ? part : rewrite(part)).join('');
  };
  const marketSourceList = `<div class="table-wrap market14-sources"><div class="exh"><span class="exn">Bảng PL.1</span><span class="ext">Nguồn dữ liệu của báo cáo</span></div><table><caption>Nguồn dữ liệu của báo cáo</caption><thead><tr><th>Hạng mục</th><th>Trạng thái</th></tr></thead><tbody>` +
    marketSourceRows(input, webResults.length, webSourceFailed).map(([label, status]) => `<tr><td>${label}</td><td>${escape(status)}</td></tr>`).join('') +
    '</tbody></table></div>';
  const missingPdfRows = pdfDiscoverySourceRows(input.collection?.pdfDiscovery, input.sourceEvidence?.pdfExcerpts === true ? input.pdfExcerpts ?? [] : []);
  // Reader appendix: source types used, plus a plain status when the automatic PDF attempt yielded no excerpt.
  const market14Sources = (): string => {
    const types = marketSourceTypes(input, webResults.length, marketPresentation ? marketChartSource(marketPresentation.input.rows, input.metricMethods).rows.map(row => row.platform) : []);
    return `<div class="ex market14-sources"><div class="exh"><span class="exn">Bảng PL.1</span><span class="ext">Nguồn số liệu</span></div><ul class="pl-srclist">${types.used.map(label => `<li>${escape(label)}</li>`).join('')}</ul>` +
      (types.missing.length ? `<p>Báo cáo chưa có ${escape(types.missing.join(', '))}; phần nào cần các nguồn này ghi rõ là chưa có dữ liệu.</p>` : '') +
      (missingPdfRows.length ? `<table><caption>Trạng thái tài liệu ngành</caption><thead><tr><th>Hạng mục</th><th>Trạng thái</th></tr></thead><tbody>${missingPdfRows.map(([label, status]) => `<tr><td>${escape(label)}</td><td>${escape(status)}</td></tr>`).join('')}</tbody></table>` : '') + '</div>' +
      '<p class="ex-note"><b>Chú thích:</b> Mọi hình và bảng được dựng tự động từ cùng một bộ dữ liệu đã lưu. Chi tiết kỹ thuật của từng nguồn nằm trong hồ sơ kỹ thuật riêng, không in trong bản đọc.</p>';
  };
  const market14Appendix = (marketPresentation ? market14Sources() : '') +
    '<div class="table-wrap market14-glossary"><div class="exh"><span class="exn">Bảng PL.2</span><span class="ext">Thuật ngữ và chữ viết tắt</span></div><table data-glossary="true"><caption>Thuật ngữ và chữ viết tắt</caption><thead><tr><th>Thuật ngữ</th><th>Nghĩa tiếng Việt</th></tr></thead><tbody>' +
    (marketPresentation ? CURRENT_MARKET_READER_TERMS : MARKET_READER_TERMS).map(([term, meaning]) => `<tr><td>${escape(term)}</td><td>${escape(meaning)}</td></tr>`).join('') +
    '</tbody></table></div>';
  // Presentation charts: revenue by platform and concentration in Phần 4, product rows in Phần 7.
  const chartTrace = kind === 'MARKET' ? marketChartTrace(input, marketPresentation) : null;
  const presentationChart = (chartKind: MarketChart['kind'], no: string): string => {
    const chart = marketPresentation ? input.marketPresentationCharts?.find(item => item.kind === chartKind) : undefined;
    if (chart) chartTrace?.embed(chart);
    return chart === undefined ? '' : `<figure class="market-chart"><div class="exh"><span class="exn">Hình ${no}</span> <span class="ext">${escape(chart.title)}</span> <span class="exu">(${escape(chart.unit)})</span></div>` +
      `<div class="chart flint" data-engine="${escape(chart.engine)}">${chart.svg}</div>` +
      `<p class="lim"><b>Chú thích:</b> ${escape(chart.note)}</p><p class="ex-src">Nguồn: dữ liệu bán hàng đã lưu, chỉ tính trong mẫu.</p></figure>`;
  };
  // Rows that do not record their shop get no concentration chart; the section says why instead of staying silent.
  const shopsUnrecorded = (): boolean => marketPresentation !== undefined && marketShopsUnrecorded(marketChartSource(marketPresentation.input.rows, input.metricMethods).rows);
  const presentationCharts = (sectionId: string): string => {
    // Bands use the title-unit price of convertible rows only (UNIT-209 C5); no profile → one sentence (C6).
    const priceBandTables = (): string => {
      if (!marketPresentation) return '';
      const unit = marketUnitRows(input, marketPresentation.input.rows), standard = unit.profile?.standard;
      if (!standard) return unitLines(unit);
      return platformPriceBands(unit.rows, true).map((signal, index) => {
        const line = `<p class="lim">${escape(unit.lines[index]!)}</p>`;
        if (!signal.bands.length || signal.bands.some(band => band.low <= 0 || band.high <= 0)) return `<p>${escape(signal.name)}: chưa đủ dữ liệu giá để chia khoảng giá trong mẫu.</p>${line}`;
        return marketActionTable('4.3', `Cơ cấu khoảng giá trong mẫu · ${signal.name}`, '',
          ['Sàn', `Khoảng giá (${standard})`, 'Số dòng trong khoảng giá', 'Số sản phẩm quy đổi được', 'Số dòng được giữ'],
          signal.bands.map(band => [escape(signal.name), `${band.low.toLocaleString('vi-VN')}–${band.high.toLocaleString('vi-VN')}`, String(band.count), String(signal.eligible), String(signal.retained)]),
          ` data-market-price-bands="true" data-platform="${signal.platform}" data-reading="${escape('Mỗi dòng là một khoảng giá của riêng sàn này, tính trên giá quy đổi theo quy cách trong tên sản phẩm; số sản phẩm quy đổi được và số dòng được giữ là mẫu số của sàn, không đếm lặp qua các khoảng giá.')}"`) + line;
      }).join('');
    };
    return sectionId === 'M04'
    ? priceBandTables() + presentationChart('platform-revenue', '4.1') + (presentationChart('concentration', '4.2') ||
      (shopsUnrecorded() ? '<p>Không có hình mức tập trung theo gian hàng: nguồn không ghi gian hàng cho từng sản phẩm trong mẫu, nên báo cáo không đếm số gian hàng.</p>' : ''))
    : sectionId === 'M07' ? presentationChart('product-ranking', '7.1') : '';
  };
  // The stored relative search-interest series sits in the demand section on its own axis, never with sales; the same predicate marks the source as used.
  const searchInterestFigure = (sectionId: string): string => {
    const interest = input.collection?.searchInterest;
    if (kind !== 'MARKET' || sectionId !== 'M05' || !searchInterestRenderable(interest)) return '';
    if (marketPresentation && !searchInterestReadingPoints(interest).some(point => point.index !== null)) return `<p>${escape(searchInterestIntervalText(interest, SEARCH_INTEREST_EMPTY))}</p>`;
    if (!input.searchInterestChart) throw new TypeError('SEARCH_INTEREST_CHART_MISSING');
    const capture = input.captures.find(item => item.stepId === 'COLLECTION' && item.ordinal === interest.captureIndex);
    // Current reader: the unit is stated once (in the unit span) and a weekly axis keeps at most SEARCH_AXIS_LABEL_MAX labels.
    const searchSvg = marketPresentation && input.searchInterestChart.engine !== 'svg-fallback' ? thinSearchAxisLabels(input.searchInterestChart.svg) : input.searchInterestChart.svg;
    return `<p>Mức quan tâm tìm kiếm của từ khóa được ghi riêng ở Hình 5.2: chỉ số tương đối, không cộng hay so với số bán.</p><figure class="market-chart"${marketPresentation ? ' data-search-interest="1"' : ''}><div class="exh"><span class="exn">Hình 5.2</span> <span class="ext">${escape(searchInterestIntervalText(interest, marketPresentation ? SEARCH_INTEREST_READER_TITLE : SEARCH_INTEREST_FIGURE_TITLE))}</span> <span class="exu">(${escape(SEARCH_INTEREST_UNIT)})</span></div>` +
      `<div class="chart flint" data-engine="${escape(input.searchInterestChart.engine)}">${searchSvg}</div>` +
      `<p class="lim"><b>Chú thích:</b> ${escape(searchInterestIntervalText(interest, SEARCH_INTEREST_NOTE))} ${escape(SEARCH_INTEREST_LIMIT)}</p><p class="ex-src">Nguồn: ${escape(searchInterestSourceText(interest))}${capture ? captureMark(capture, citations) : ''}</p></figure>`;
  };
  // The stored province map sits right after Hình 5.2, as regions only; a pure rule picks a region or says nationwide. Never with sales.
  const searchGeoBlock = (sectionId: string): string => {
    const geo = input.collection?.searchGeo;
    if (kind !== 'MARKET' || sectionId !== 'M05' || !searchGeoRenderable(geo)) return '';
    const summary = summarizeSearchGeo(geo.provinces), text = searchGeoText(summary, !marketPresentation);
    const capture = input.captures.find(item => item.stepId === 'COLLECTION' && item.ordinal === geo.captureIndex);
    // The visible heading already names the table, so the table and its scroll region carry the name as aria-label, not a second caption.
    return `<div class="table-wrap" role="region" aria-label="${escape(SEARCH_GEO_TABLE_TITLE)}" tabindex="0"><div class="exh"><span class="exn">Bảng ${SEARCH_GEO_TABLE_NO}</span><span class="ext">${escape(SEARCH_GEO_TABLE_TITLE)}</span></div><table aria-label="${escape(SEARCH_GEO_TABLE_TITLE)}">` +
      `<thead><tr>${SEARCH_GEO_HEADERS.map(head => `<th>${escape(head)}</th>`).join('')}</tr></thead><tbody>` +
      summary.regions.map(row => `<tr><td>${escape(row.region)}</td><td>${escape(searchGeoAverageText(row.average))}</td><td>${marketPresentation && row.inTop === 0 ? 'không có tỉnh nào đạt ngưỡng' : row.inTop}</td></tr>`).join('') +
      `</tbody></table><p class="lim"><b>Chú thích:</b> ${escape(marketPresentation ? searchGeoNoteText(geo, false) + ' Số liệu cho Việt Nam; không cộng các vùng với nhau.' : searchGeoNoteText(geo, true))}</p><p class="ex-src">Nguồn: ${escape(searchInterestSourceText(geo))}${capture ? captureMark(capture, citations) : ''}</p></div>` +
      [text.topLine, text.result, text.seen, text.use, text.dont].filter(Boolean).map(line => `<p>${escape(line)}</p>`).join('');
  };
  // Country-level exhibits carry a marker so the market14 reader never counts them as data about the product; legacy bytes stay unmarked.
  const national = marketPresentation ? ' data-exhibit-scope="national"' : '';
  // Open country-level figures sit beside the sales numbers in the same demand section; the same predicate marks S23 as used.
  const worldBankTable = (sectionId: string): string => {
    const rows = kind === 'MARKET' && sectionId === 'M05' ? worldBankRenderableRows(input.collection?.worldBank) : [];
    if (rows.length === 0) return '';
    const showNotes = !marketPresentation || rows.some(item => worldBankReaderNote(item.row));
    return `<div class="table-wrap"><div class="exh"><span class="exn">Bảng 5.3</span><span class="ext">${escape(WORLD_BANK_TITLE)}</span></div><table${national}><caption>${escape(WORLD_BANK_TITLE)}</caption>` +
      `<thead><tr><th>Chỉ số</th><th>Nguồn</th><th>Giá trị</th><th>Năm</th><th>Cập nhật</th>${showNotes ? '<th>Ghi chú của nguồn</th>' : ''}</tr></thead><tbody>` +
      rows.map(item => {
        const capture = input.captures.find(entry => entry.stepId === 'COLLECTION' && entry.ordinal === item.captureIndex);
        return `<tr><td>${escape(item.row.indicatorName)}</td><td>${escape(marketPresentation ? 'Ngân hàng Thế giới' : E13_ATTRIBUTION)}</td><td>${escape(`${formatWorldBankValue(item.row.value, item.row.decimal)} ${worldBankUnitText(item.row, item.code, !marketPresentation)}`)}${capture ? captureMark(capture, citations) : ''}</td>` +
          `<td>${escape(item.row.year)}</td><td>${escape(item.row.lastUpdated)}</td>${showNotes ? `<td>${escape(marketPresentation ? worldBankReaderNote(item.row) : worldBankSourceNote(item.row))}</td>` : ''}</tr>`;
      }).join('') + `</tbody></table><p class="lim"><b>Chú thích:</b> ${escape(worldBankTableNote(rows))} ${escape(WORLD_BANK_LIMIT)}</p><p class="ex-src">Nguồn: ${escape(marketPresentation ? WORLD_BANK_READER_SRC : WORLD_BANK_SRC)}</p></div>` +
      macroFigures(input.worldBankCharts, worldBankChartCount(input.collection?.worldBank), 'WORLD_BANK_CHARTS_MISSING', 5, 3);
  };
  // Pre-drawn country-level figures (S23 lines after table 5.3, S24 bars after table 6.2), each on its own axis; none is drawn without its table.
  const macroFigures = (drawn: readonly MacroChart[] | undefined, expected: number, missing: string, sectionNo: number, first: number): string => {
    if (expected === 0) return '';
    if (!drawn || drawn.length !== expected) throw new TypeError(missing);
    return drawn.map((original, i) => { const chart = marketPresentation ? original.currentReader ?? original : original; return `<figure class="market-chart"${national}><div class="exh"><span class="exn">Hình ${sectionNo}.${first + i}</span> <span class="ext">${escape(chart.title)}</span> <span class="exu">(${escape(chart.unit)})</span></div>` +
      `<div class="chart flint" data-engine="${escape(chart.engine)}" data-chart-id="${escape(chart.id)}">${chart.svg}</div>` +
      `<p class="lim"><b>Chú thích:</b> ${escape(chart.note)}</p><p class="ex-src">Nguồn: ${escape(chart.src)}</p></figure>`; }).join('');
  };
  // Cục Thống kê figures (S21) follow table 5.3; the same predicate marks S21 as used. Never combined with sample numbers.
  // No chart for table 5.4: each run reads one month only, so there is no series to draw.
  const officialStatsTable = (sectionId: string): string => {
    const stored = kind === 'MARKET' && sectionId === 'M05' ? input.collection?.officialStats : undefined;
    if (!stored) return '';
    const rows = officialStatsRenderableRows(stored);
    if (rows.length === 0) return `<p>${escape(officialStatsNotice(stored))}</p>`;
    const showStatus = !marketPresentation || rows.some(row => officialStatsStatusText(stored, row, false, true));
    return `${stored.status === 'OK' ? '' : `<p>${escape(officialStatsNotice(stored))}</p>`}<div class="table-wrap"><div class="exh"><span class="exn">Bảng 5.4</span><span class="ext">${escape(OFFICIAL_STATS_TABLE_TITLE)}</span></div>` +
      `<table${national}><caption>${escape(OFFICIAL_STATS_TABLE_TITLE)}</caption><thead><tr><th>Bảng</th><th>Dòng</th><th>Kỳ</th><th>Giá trị</th><th>Đơn vị</th>${showStatus ? '<th>Trạng thái</th>' : ''}</tr></thead><tbody>` +
      rows.map(row => {
        const capture = input.captures.find(entry => entry.stepId === 'COLLECTION' && entry.ordinal === row.captureIndex);
        return `<tr><td>${escape(OFFICIAL_STATS_TABLE_TEXT[row.table])}</td><td>${escape(officialStatsRowLabel(row, !marketPresentation, Boolean(marketPresentation)))}</td><td>${escape(row.period)}</td><td>${escape(officialStatsValueText(row))}${capture ? captureMark(capture, citations) : ''}</td>` +
          `<td>${escape(officialStatsUnitText(row, !marketPresentation))}</td>${showStatus ? `<td>${escape(officialStatsStatusText(stored, row, !marketPresentation, Boolean(marketPresentation)))}</td>` : ''}</tr>`;
      }).join('') + `</tbody></table><p class="lim"><b>Chú thích:</b> ${escape(OFFICIAL_STATS_NOTE)} ${escape(OFFICIAL_STATS_LIMIT)}</p>` +
      `<p class="ex-src">Nguồn: ${escape(OFFICIAL_STATS_SRC)}; ${rows.map(row => escape(officialStatsCitation(stored, row, !marketPresentation, Boolean(marketPresentation)))).filter((text, i, all) => all.indexOf(text) === i).join('; ')}</p>` + (marketPresentation ? `<details class="evidence-trace"><summary>Chi tiết nguồn</summary><pre>${escape(JSON.stringify(rows.map(row => officialStatsTechnicalCitation(stored, row))))}</pre></details>` : '') + `</div>` +
      officialStatsProvinceTable(stored);
  };
  // S22: CPI by province from the same stored CPI workbook, right after table 5.4 and only when 5.4 is drawn.
  const officialStatsProvinceTable = (stored: StepOfficialStats): string => {
    const rows = officialStatsProvinceRows(stored);
    if (rows.length === 0 || !stored.provinces) return '';
    const sheet = stored.provinces;
    const capture = input.captures.find(entry => entry.stepId === 'COLLECTION' && entry.ordinal === sheet.captureIndex);
    return `<p>${escape(officialStatsProvinceContext(stored, !marketPresentation, Boolean(marketPresentation)))}</p><div class="table-wrap"><div class="exh"><span class="exn">Bảng 5.5</span><span class="ext">${escape(OFFICIAL_STATS_PROVINCE_TITLE)}</span></div>` +
      `<table${national}><caption>${escape(OFFICIAL_STATS_PROVINCE_TITLE)}</caption><thead><tr><th>Dòng</th>${sheet.provinces.map(name => `<th>${escape(name)}</th>`).join('')}</tr></thead><tbody>` +
      rows.map(row => `<tr><td>${escape(officialStatsProvinceRowLabel(row.label, sheet.base, !marketPresentation, Boolean(marketPresentation)))}${capture ? captureMark(capture, citations) : ''}</td>${row.cells.map(cell => `<td>${escape(officialStatsProvinceCellText(cell))}</td>`).join('')}</tr>`).join('') +
      `</tbody></table><p class="lim"><b>Chú thích:</b> ${escape(OFFICIAL_STATS_PROVINCE_NOTE)} ${marketPresentation ? `Các tỉnh, thành phố có trong bảng nguồn: ${sheet.provinces.map(escape).join(', ')}. ` : ''}${escape(OFFICIAL_STATS_PROVINCE_LIMIT)}</p>` +
      `<p class="ex-src">Nguồn: ${escape(OFFICIAL_STATS_SRC)}; ${rows.map(row => escape(officialStatsProvinceCitation(stored, row, !marketPresentation, Boolean(marketPresentation)))).filter((text, i, all) => !marketPresentation || all.indexOf(text) === i).join('; ')}</p>` + (marketPresentation ? `<details class="evidence-trace"><summary>Chi tiết nguồn</summary><pre>${escape(JSON.stringify(rows.map(row => officialStatsTechnicalCitation(stored, { captureIndex: sheet.captureIndex, sheet: sheet.sheet!, row: row.row }))))}</pre></details>` : '') + `</div>`;
  };
  // Country-level trade figures sit in the supply section as background; the same predicate marks S24 as used. Never summed or compared with sample numbers.
  const comtradeTable = (sectionId: string): string => {
    const stored = kind === 'MARKET' && sectionId === 'M06' ? input.collection?.comtrade : undefined;
    if (!stored) return '';
    const rows = comtradeRenderableRows(stored, Boolean(marketPresentation));
    if (rows.length === 0) return `<p>${escape(comtradeNotice(stored))}</p>`;
    return `${stored.status === 'OK' ? '' : `<p>${escape(comtradeNotice(stored))}</p>`}<div class="table-wrap"><div class="exh"><span class="exn">Bảng 6.2</span><span class="ext">${escape(COMTRADE_TABLE_TITLE)}</span></div>` +
      (marketPresentation ? `<p>${escape(comtradeReaderLabel(stored))}. Mã hàng ước tính: ${escape(stored.hsCode!)}.${stored.reasonVi ? ` Phạm vi áp dụng: ${escape(stored.reasonVi)}` : ''} Phạm vi theo mã hàng là ước tính, chưa xác nhận trùng với phạm vi sản phẩm.</p>` : `<p>Mã hàng ước tính: ${escape(stored.hsCode!)}. ${stored.reasonVi ? `Phạm vi áp dụng (diễn giải tự động): ${escape(stored.reasonVi)} ` : ''}Mô tả chính thức (tiếng Anh): ${escape(comtradeOfficialText(stored))}. Diễn giải tự động: ${escape(stored.descriptionVi!)}</p>`) +
      `<table${national}><caption>${escape(COMTRADE_TABLE_TITLE)}</caption><thead><tr><th>Bên báo số</th><th>Chiều</th><th>Năm</th><th>Giá trị (USD, theo bên báo)</th><th>Ghi chú</th></tr></thead><tbody>` +
      rows.map(row => {
        const capture = input.captures.find(entry => entry.stepId === 'COLLECTION' && entry.ordinal === row.captureIndex);
        return `<tr><td>${escape(marketPresentation ? comtradeReaderSide(row) : comtradeSideText(row))}</td><td>${escape(comtradeFlowText(row.flow))}</td><td>${escape(row.year)}</td><td>${escape(marketPresentation ? comtradeWholeUsd(row.value) : formatWorldBankValue(row.value))}${capture ? captureMark(capture, citations) : ''}</td><td>${escape(comtradeRowNote(row))}</td></tr>`;
      }).join('') + `</tbody></table><p class="lim"><b>Chú thích:</b> ${escape(COMTRADE_NOTE)}${stored.mirrorReporterCount === null || stored.mirrorReporterCount === 0 ? '' : marketPresentation ? ` Hiển thị ${rows.filter(row => row.side === 'MIRROR').length} trong ${stored.mirrorReporterCount} nước báo số hàng xuất sang Việt Nam đã lưu.` : ` Số nước báo số hàng xuất sang Việt Nam: ${stored.mirrorReporterCount}.`}</p><p class="ex-src">Nguồn: ${escape(COMTRADE_SRC)}</p></div>` +
      macroFigures(input.comtradeCharts, comtradeChartCount(stored, Boolean(marketPresentation)), 'COMTRADE_CHARTS_MISSING', 6, 1);
  };
  // Public search-ads library counts (S17) for the top brands' own websites sit in the competitor section. Empty values read "không có"; no advertiser detail exists to print.
  const searchAdsTable = (sectionId: string): string => {
    const stored = kind === 'MARKET' && sectionId === 'M07' ? input.collection?.searchAds : undefined;
    if (!stored) return '';
    if (marketPresentation) {
      if (!stored.brands.length) return `<p>${escape(searchAdsNotice(stored))}</p>`;
      const key = (label: string): string => label.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi-VN');
      const sampleBrands = new Set(marketPresentation.input.rows.map(row => key(row.brand)));
      const count = (value: number | null): string => value === null ? 'Chưa có số liệu' : value === 0 ? 'không có mẫu quảng cáo' : String(value);
      const state = (brand: typeof stored.brands[number]): string => brand.status === 'SKIPPED_NO_DOMAIN' ? 'Chưa có trang web để kiểm tra'
        : brand.status === 'SKIPPED_AMBIGUOUS_DOMAIN' || brand.status === 'CANCELLED' ? 'Chưa kiểm tra'
          : brand.status !== 'OK' ? 'Kiểm tra thất bại' : brand.creativeCount === null ? 'Đã kiểm tra; chưa có số liệu' : 'Đã kiểm tra';
      return `<div class="table-wrap"><div class="exh"><span class="exn">Bảng 7.3</span><span class="ext">${escape(SEARCH_ADS_TABLE_TITLE)}</span></div>` +
        `<table><caption>${escape(SEARCH_ADS_TABLE_TITLE)}</caption><thead><tr><th>Thương hiệu</th><th>Trang web</th><th>Trạng thái kiểm tra</th><th>Số mẫu quảng cáo</th><th>Chữ / Hình / Video</th><th>Hiện lần đầu – lần cuối</th><th>Số ngày hiện của mẫu dài ngày</th></tr></thead><tbody>` +
        stored.brands.map(brand => {
          const checked = brand.status === 'OK';
          const capture = input.captures.find(entry => entry.stepId === 'COLLECTION' && entry.ordinal === brand.captureIndex);
          const day = (value: string | null): string => value ? value.split('-').reverse().join('/') : 'Chưa có ngày';
          return `<tr><td><span data-quote>${escape(brand.label)}</span>${checked && !sampleBrands.has(key(brand.label)) ? '<br>Ngoài mẫu hiện tại' : ''}</td><td>${escape(brand.domain ?? 'Chưa có trang web')}</td><td>${state(brand)}</td>` +
            `<td>${checked ? count(brand.creativeCount) : 'Chưa có số liệu'}${capture ? captureMark(capture, citations, SEARCH_ADS_SOURCE_LABEL) : ''}</td>` +
            `<td>${checked && brand.formats ? [brand.formats.text, brand.formats.image, brand.formats.video].map(value => value === 0 ? 'không có' : String(value)).join(' / ') : 'Chưa có số liệu'}</td>` +
            `<td>${checked ? `${day(brand.firstShown)} – ${day(brand.lastShown)}` : 'Chưa có ngày'}</td><td>${checked ? brand.maxDaysShown === 0 ? 'không có ngày ghi nhận' : count(brand.maxDaysShown) : 'Chưa có số liệu'}</td></tr>`;
        }).join('') + `</tbody></table><p class="lim"><b>Chú thích:</b> Các thương hiệu được chọn theo doanh thu trong danh sách sản phẩm đã lưu khi chọn thương hiệu, lấy lần lượt các thương hiệu khác nhau; danh sách đó có thể khác mẫu hiện tại. ${escape(SEARCH_ADS_NOTE)}</p><p class="ex-src">Nguồn: ${escape(SEARCH_ADS_SOURCE_LABEL)}</p></div>`;
    }
    const okBrands = searchAdsOkBrands(stored);
    const notices = (brands: typeof stored.brands) => brands.map(brand => `<p><span data-quote>${escape(brand.label)}</span>: ${escape(searchAdsBrandNotice(brand, stored.profile))}</p>`).join('');
    if (okBrands.length === 0) return `<p>${escape(searchAdsNotice(stored))}</p>` + notices(stored.brands);
    const num = (v: number | null): string => v === null || v === 0 ? 'không có' : String(v);
    const day = (v: string | null): string => v === null ? 'không có' : v.split('-').reverse().join('/');
    return `<div class="table-wrap"><div class="exh"><span class="exn">Bảng 7.3</span><span class="ext">${escape(SEARCH_ADS_TABLE_TITLE)}</span></div>` +
      `<table><caption>${escape(SEARCH_ADS_TABLE_TITLE)}</caption><thead><tr><th>Thương hiệu</th><th>Trang web</th><th>Số mẫu quảng cáo</th><th>Chữ / Hình / Video</th><th>Hiện lần đầu – lần cuối</th><th>Số ngày hiện của mẫu dài ngày</th></tr></thead><tbody>` +
      okBrands.map(brand => {
        const capture = input.captures.find(entry => entry.stepId === 'COLLECTION' && entry.ordinal === brand.captureIndex);
        const f = brand.formats!;
        return `<tr><td data-quote>${escape(brand.label)}</td><td>${escape(brand.domain!)}</td><td>${escape(num(brand.creativeCount))}${capture ? captureMark(capture, citations, SEARCH_ADS_SOURCE_LABEL) : ''}</td><td>${escape(`${num(f.text)} / ${num(f.image)} / ${num(f.video)}`)}</td><td>${escape(`${day(brand.firstShown)} – ${day(brand.lastShown)}`)}</td><td>${escape(num(brand.maxDaysShown))}</td></tr>`;
      }).join('') + `</tbody></table><p class="lim"><b>Chú thích:</b> ${escape(SEARCH_ADS_NOTE)}</p><p class="ex-src">Nguồn: ${escape(SEARCH_ADS_SOURCE_LABEL)}</p></div>` +
      notices(stored.brands.filter(brand => brand.status !== 'OK'));
  };
  // Verified document excerpts sit in the context section; the same predicate marks S25 as used.
  const pdfExcerptBlock = (sectionId: string): string => kind === 'MARKET' && sectionId === PDF_EXCERPT_SECTION && input.pdfExcerpts?.length && input.sourceEvidence?.pdfExcerpts === true
    ? pdfExcerptBlockHtml(input.pdfExcerpts, escape, marketPresentation ? excerpt => citations.mark(pdfExcerptReaderCitation(excerpt)) : undefined) + `<p class="lim"><b>Chú thích:</b> ${escape(PDF_EXCERPT_NOTE)}</p><p class="ex-src">Nguồn: ${escape(PDF_EXCERPT_SRC)}</p>` : '';
  const sellerVideoBlock = (sectionId: string): string => kind === 'MARKET' && sectionId === SELLER_VIDEO_SECTION && input.sellerVideos && input.sourceEvidence?.sellerVideos === true
    ? sellerVideoBlockHtml(input.sellerVideos, escape) + `<p class="lim"><b>Chú thích:</b> ${escape(sellerVideoNote(input.sellerVideos))}</p><p class="ex-src">Nguồn: ${escape(sellerVideoSrc(input.sellerVideos))}</p>` : '';
  // market14 reader: M13 trace receipts and evidence details stay in semantic (sourceEvidence, quoteMethods, boundedMethods), not the reader.
  const traceAppendix = (sectionId: string): boolean => !(marketPresentation && sectionId === 'M13');
  // Raw-response scale blocks are built once, so the number trace records each printed number once.
  const rawScale = numberTrace ? marketRawScaleSection(input.marketRawSeries!, numberTrace) : '';
  const rawScope = numberTrace ? marketRawScopeSection(input.marketRawSeries!, numberTrace) : '';
  const rawBlock = (sectionId: string): string => !numberTrace ? '' : sectionId === 'M02' ? rawScope : sectionId === 'M03' ? rawScale : '';
  const appendix = (sectionId: string): string =>
    (input.publicReviewSource && (sectionId === 'M13' || sectionId === 'I03' || sectionId === 'I17') ? publicReviewReportHtml(input.publicReviewSource) + (publicReviewCitation === null ? '' : renderCitationMarkOrMissing(publicReviewCitation)) : '') +
    (testReviewSample && sectionId === 'M13'
      ? exactTestReviewSection(testReviewSample, undefined, marketPresentation ? { currentReader: true, productLabels: new Map([
        ...labels, ...[...(input.collection?.productCards ?? []), ...(input.run.productCards ?? [])].flatMap(card =>
          card.sourceUrl && labels.has(card.productId) ? [[card.sourceUrl, labels.get(card.productId)!] as const] : []),
      ]) } : undefined) : '') +
    rawBlock(sectionId) + presentationCharts(sectionId) + searchInterestFigure(sectionId) + searchGeoBlock(sectionId) + worldBankTable(sectionId) + officialStatsTable(sectionId) + comtradeTable(sectionId) + searchAdsTable(sectionId) + pdfExcerptBlock(sectionId) + sellerVideoBlock(sectionId) +
    (kind === 'INSIGHT' && sectionId === 'I02' ? populationBaselineSection(input.collection) : '') +
    (reviewOutcome && kind === 'INSIGHT' && (sectionId === 'I03' || sectionId === 'I17') ? `<p class="warning">${escape(reviewOutcomeLead(reviewOutcome))}</p>` : '') +
    baseAppendix(sectionId) +
    (input.sourceEvidence && traceAppendix(sectionId) && (sectionId === 'M13' || sectionId === 'I17') ? sourceEvidenceHtml(input.sourceEvidence) +
      (input.sourceEvidence.jevTriage?.auditRows.some(row => row.gateOutcome === 'INCLUDED' || row.gateOutcome === 'EXCLUDED')
        ? `<p>Phân loại bổ sung cho các bản ghi chưa rõ: ${[...new Set(input.sourceEvidence.jevTriage.auditRows.filter(row => row.gateOutcome === 'INCLUDED' || row.gateOutcome === 'EXCLUDED').map(row => row.reason!))].map(escape).join('; ')}.</p>` : '') : '') +
    (kind === 'MARKET' && sectionId === 'M13' && traceAppendix(sectionId) && input.quoteMethods
      ? `<details open id="quote-method-evidence"><summary>Hồ sơ giá M08: nguồn, điều kiện và phép tính</summary><p>Xuất xứ trong manifest là khai báo đã lưu, không phải chứng nhận độc lập. Dữ liệu tổng hợp thủ công hoặc giả lập không trở thành dữ liệu nhà cung cấp đã xác minh.</p>${retainedEvidenceHtml(input.quoteMethods)}</details>` : '') +
    (insightCoding && (sectionId === 'I03' || sectionId === 'I17') ? insightCodingTrace(insightCoding, sectionId) : '') +
    (insightCrosscheck && sectionId === 'I17' ? insightCrosscheckAppendix(insightCrosscheck) : '') +
    (kind === 'MARKET' && sectionId === 'M13' ? marketPresentation ? market14Appendix
      : officialStatsRenderable(input.collection?.officialStats) || missingPdfRows.length ? marketSourceList : '' : '') +
    (kind === 'MARKET' && sectionId === 'M13' && !marketPresentation && searchAdsOkBrands(input.collection?.searchAds).length
      ? `<p>Nguồn: ${escape(SEARCH_ADS_SOURCE_LABEL)}. ${escape(SEARCH_ADS_SOURCE_NOTE)}</p>` : '') +
    (input.boundedMethods && traceAppendix(sectionId) && (sectionId === 'M13' || sectionId === 'I17')
      ? `<details open id="bounded-method-evidence"><summary>Hồ sơ phương pháp M10/I11/I12/I16 và vị trí nguồn</summary><p>Nguồn bổ sung do người dùng chọn, không phải dữ liệu tự thu hoặc xác nhận độ phủ. Hồ sơ giữ riêng kỳ, phạm vi và điều kiện còn thiếu; không cộng gộp với số liệu thị trường hoặc review.</p>${retainedEvidenceHtml(input.boundedMethods)}</details>` : '');
  const baseAppendix = (sectionId: string): string => {
    if (sourceScope && sectionId === 'M02') return marketSourceScopeSection(sourceScope, 'M02', citations, readerPlainText, marketPresentation ? input.metricMethods?.capture : undefined,
      { ...(marketPresentation ? { reviewsPresent: marketReviewsCollected(input) } : {}), currentReader: Boolean(input.publicReviewSource) });
    if (kind === 'MARKET' && sectionId === 'M01' && input.m01Inventory && input.sourceClaims) {
      const inventory = m01InventorySection(input.m01Inventory, input.sourceClaims, citations, readerPlainText);
      // Phần 1 states the per-platform findings; the per-period evidence rows stay in the technical copy.
      return marketPresentation && input.metricMethods?.capture ? `<details class="evidence-trace"><summary>Danh sách bằng chứng từng kỳ (hồ sơ đối chiếu)</summary>${inventory}</details>` : inventory;
    }
    if (kind === 'INSIGHT' && sectionId === 'I14' && input.i14Admission && input.sourceClaims) return i14SynthesisSection(input.i14Synthesis, citations, false) + i14AdmissionSection(input.i14Admission, input.sourceClaims, citations, false);
    if (kind === 'MARKET' && (sectionId === 'M03' || sectionId === 'M04')) {
       // The capture's per-platform tables already print in Phần 3; M04 points there instead of repeating them.
       if (sectionId === 'M04' && marketPresentation && input.metricMethods?.capture) return '<p>Danh sách sản phẩm và số liệu của từng sàn nằm ở Phần 3; phần này không in lại.</p>';
       if (input.metricMethods) return metricMethodSection(input.metricMethods, sectionId, input.metricClassified, citations, Boolean(marketPresentation), readerPlainText, Boolean(marketPresentation), marketPresentation ? marketUnitRows(input, marketPresentation.input.rows).packProfile : null) + (sectionId === 'M03' && input.marketInventory ? (readerPlainText ? '<h3>Số liệu từng kỳ của các sản phẩm được chọn (đọc riêng, không cộng vào bảng mẫu)</h3>' : '<h3>Bằng chứng riêng của nguồn sàn: không cộng vào số liệu nguồn</h3>') + marketInventorySection(input.marketInventory, sectionId, citations, labels, readerPlainText, inventoryReader) : '');
      if (input.metricMethodsFailure) return `<p class="warning">${escape(metricFailureCopy[input.metricMethodsFailure].next)}</p>` + codeNote(input.metricMethodsFailure);
    }
    if (kind === 'MARKET' && (sectionId === 'M03' || sectionId === 'M08')) {
      if (input.marketInventory) return marketInventorySection(input.marketInventory, sectionId, citations, labels, readerPlainText, inventoryReader);
      if (input.marketInventoryFailure) return '<p class="warning">Đã thử xử lý inventory nhưng nguồn hoặc phương pháp không vượt qua kiểm tra; không tự gọi lại nguồn.</p>' + codeNote('MARKET_INVENTORY_FAILED');
    }
    if (sourceScope && sectionId === 'M13' && traceAppendix(sectionId)) return marketSourceScopeSection(sourceScope, 'M13', citations, readerPlainText) + descriptiveAppendix(descriptive, input.descriptiveMethodFailure, readerPlainText, readerPlainText);
    if (kind === 'INSIGHT' && (sectionId === 'I03' || sectionId === 'I17')) {
      if (insightPersona) return insightPersonaSection(insightPersona.snapshot, insightPersona.source, sectionId, citations);
      if (privateView) return (sample && sectionId === 'I03' ? reviewSampleSection(sample, privateView, citations, readerPlainText) : '') + privateReviewCorpusSection(privateView, sectionId, citations);
      const codingNotice = located
        ? `<p class="warning">Đã áp dụng quy tắc đã duyệt để đưa các khai báo rõ nghĩa vào phạm vi hẹp, có vị trí nguyên văn. ${located.projection.pending.length} mục còn chờ được giữ cùng bản đề xuất ban đầu; không tính thành mục phân tích hoàn chỉnh. Khi mở lại, hệ thống đọc kết quả đã lưu, không chạy lại parser hoặc gọi nguồn.</p>`
        : input.locatedReview
          ? '<p class="warning">Bản này giữ đề xuất coding cùng phiên bản quy tắc và vị trí nguyên văn, chưa đưa ứng viên vào kết quả. Báo cáo cũ giữ nguyên bằng chứng và trạng thái đã lưu; không tự áp dụng quy tắc mới hoặc chạy lại parser khi mở.</p>'
        : input.locatedReviewFailure
          ? '<p class="warning">Dữ liệu review gốc vẫn được giữ, nhưng bước lưu đề xuất coding chưa vượt qua kiểm tra; không dùng đề xuất chưa xác minh hoặc tự thu lại nguồn.</p>' + codeNote('LOCATED_REVIEW_METHOD_FAILED') : '';
      const trace = corpusTrace ? corpusTraceSection(corpusTrace, sectionId, citations) : '';
      if (input.nativeReview) return codingNotice + nativeReviewContext(input.nativeReview, readerPlainText) + trace;
      if (input.collection?.nativeReview) {
        const oversized = input.nativeReviewFailure === 'NATIVE_REVIEW_REPORT_TOO_LARGE';
        return `<p class="warning">Nguồn review native của đúng listing đã được gắn và giữ nguyên. ${oversized
          ? 'Phần quote và phương pháp vượt giới hạn bản hiển thị này; toàn bộ dữ liệu và pending vẫn có trong gói phương pháp đã lưu, không cắt ngắn hoặc tự thu lại.'
          : 'Bước mã hóa chưa vượt qua kiểm tra; chưa đưa khai báo vào kết quả. Cần kiểm tra phương pháp, không thêm lại link hoặc tự gọi lại nguồn.'}</p>` + (input.nativeReviewFailure === undefined ? '' : codeNote(input.nativeReviewFailure));
      }
      if (input.reviewCorpus) return codingNotice + trace + '<h3>Collection nguồn thô, tách khỏi lớp mã hóa</h3>' + reviewCorpusSection(input.reviewCorpus, sectionId, citations);
      if (corpusTrace) return codingNotice + trace;
      if (input.reviewCorpusFailure === 'REVIEW_CORPUS_REPORT_TOO_LARGE') return '<p class="warning">Collection gốc vẫn được giữ đầy đủ nhưng phần quote vượt giới hạn kích thước báo cáo; chưa đưa quote vào bản này, không cắt ngắn dữ liệu hoặc tự thu lại. Cần xuất phần bằng chứng theo trang ở bước xử lý tiếp theo.</p>' + codeNote('REVIEW_CORPUS_REPORT_TOO_LARGE');
      if (input.reviewCorpusFailure) return '<p class="warning">Đã lưu collection nhưng corpus không vượt qua kiểm tra; không tự thu lại và không dùng dữ liệu chưa xác minh.</p>' + codeNote('REVIEW_CORPUS_FAILED');
      const retained = retainedReviewStatus(input);
      if (retained) return `<p class="warning">${escape(retained)} Việc lưu nguồn không có nghĩa nội dung hoặc nhãn phân tích đã được duyệt.</p>`;
      return '<p>Chưa có tập review gắn với lượt này. Thêm link Shopee chính xác ở bước duyệt phạm vi của lượt mới, rồi kiểm tra trạng thái nguồn. Không thay bằng review của sản phẩm gần giống.</p>';
    }
    return '';
  };
  const methodBody = (section: DraftSection): string => {
    const qualitative = input.qualitativeDraft && ['I02', 'I05', 'I06', 'I10', 'I17'].includes(section.sectionId)
      ? qualitativeDraftSection(input.qualitativeDraft, section.sectionId as 'I02' | 'I05' | 'I06' | 'I10' | 'I17', citations) : '';
    const literal = insightLiteral && ['I05', 'I07', 'I08', 'I13', 'I17'].includes(section.sectionId)
      ? insightLiteralSection(insightLiteral, section.sectionId as 'I05' | 'I07' | 'I08' | 'I13' | 'I17', citations) : '';
    const locatedView = locatedViews.get(section.sectionId);
    // Per-platform record counts need no owner-accepted classification, so an unclassified capture M03 shows them too.
    const captureFigures = (): string => kind === 'MARKET' && marketPresentation && section.sectionId === 'M03' && input.metricMethods?.capture
      ? renderCaptureSampleSentences(input.metricMethods.capture, citations) : '';
    if (section.state === 'EVIDENCE_INVENTORY') return (locatedView ? locatedView() : '') + literal + qualitative;
    if (section.state !== 'METHOD_OUTPUT' && section.state !== 'METHOD_NO_USABLE_RECORDS') return literal + qualitative + captureFigures();
    // Metric has its own scoped tables and source trace in appendix(), not a descriptive-method view.
    if (kind === 'MARKET' && input.metricMethods && (section.sectionId === 'M03' || section.sectionId === 'M04')) return qualitative + captureFigures();
    return (locatedView ? locatedView() : views.get(section.sectionId)!.html) + literal + qualitative;
  };
  // Same rows the charts were drawn from, so the chart gate counts the real sample.
  const chartRows = marketPresentation ? marketChartSource(marketPresentation.input.rows, input.metricMethods).rows : [];
  const marketPlatforms = [...new Set(chartRows.map(row => row.platform))];
  // market14 readers get a plain "Cách đọc báo cáo" paragraph; the completion counters stay in the semantic and the trace copy.
  const readerOpening = marketPresentation ? marketReaderGuide(marketPlatforms)
    : `<p class="warning">${escape(headline)}${input.qualitativeDraft ? ` ${escape(qualitativeDraftSummary(input.qualitativeDraft))}` : ''}</p>${reviewOutcome ? reviewOutcomeNotice(reviewOutcome, kind) : ''}<p class="reader-guide">Đọc trạng thái và phần diễn giải trước khi sử dụng số liệu. Bảng trình bày những gì nguồn hoặc phép tính đã ghi nhận; phần “Hồ sơ đối chiếu” giữ nguyên nội dung nguồn và thông tin kỹ thuật. Mục còn thiếu điều kiện chưa có kết luận, ${input.publicReviewSource ? 'không phải kết quả bằng không' : 'không phải kết quả bằng 0'}.</p>`;
  // Descriptive empty states already explain the gap; retain the detailed
  // method explanation in semantic data without repeating it in the reader.
  // market14 delivery reads this marker: a method with no usable records, or Phần 9 holding only source-declared launch dates
  // with no other Phần 9 statement, is a gap even when the section prints numbers. Legacy and Insight bytes stay unmarked.
  const sectionGap = (section: DraftSection): boolean => Boolean(marketPresentation) && (section.state === 'METHOD_NO_USABLE_RECORDS'
    || (section.sectionId === 'M09' && views.get('M09')?.partial === true && !(input.pdfExcerpts?.length && input.sourceEvidence?.pdfExcerpts === true)
      && !(input.sellerVideos && input.sourceEvidence?.sellerVideos === true)));
  const sectionReading = (section: DraftSection): string => readerPlainText && section.state === 'METHOD_NO_USABLE_RECORDS' && views.has(section.sectionId)
    ? '' : `<p class="section-reading">${escape(section.explanation)}</p>`;
  const body = orderReportCitations(readerOpening + sections.map(section => `<section class="sheet" id="${section.sectionId}"><header class="sh-head"><div><span class="sh-id">${readerPlainText && kind === 'MARKET' ? marketSectionLabel(section.sectionId) : section.sectionId}</span><h2>${escape(section.title)}</h2></div><span class="state"${sectionGap(section) ? ' data-section-gap="1"' : ''}>${escape(stateLabel[section.state])}</span></header>${sectionReading(section)}${methodBody(section)}${section.state === 'SOURCE_CONTEXT' ? marketPresentation && section.sectionId === 'M13' ? '<p>Phạm vi, kỳ số liệu và điều kiện của mẫu ghi ở Phần 2.</p>' : scope : ''}${section.sectionId === 'M13' || section.sectionId === 'I17' ? sourceTable + webResultsTable : ''}${observationTable(section.rows, captures, citations, labels, readerPlainText, [...input.scope.selectedProductIds, ...input.scope.peerProductIds])}${appendix(section.sectionId)}${readerPlainText && kind === 'MARKET' ? '' : `<details class="method-reference"><summary>Hồ sơ đối chiếu phương pháp</summary><p><small>${fallbackIds.has(section.sectionId) ? 'Phương pháp ghi trong danh mục, chưa chạy trong lượt này' : 'Phương pháp'}: ${methodReference(section.method)}</small></p></details>`}</section>`).join(''), registry);
  // Snapshot the original register, then renumber only citations still visible in the reader.
  const semanticCitations = { citations: registry.technicalTrace(), citationEntries: registry.entries() };
  const readerBody = marketPresentation ? orderReportCitations(body.replace(/<template data-market14-source-trace>[\s\S]*?<\/template>/gu, ''), registry) : body;
  const cover = kind === 'MARKET' && marketPresentation ? input.marketCover : undefined;
  // market14 cover: product name and data quarters only (owner B18); legacy and Insight keep the draft cover.
  const coverName = marketPresentation ? storedLiteral(input.start.keyword.trim().charAt(0).toLocaleUpperCase('vi') + input.start.keyword.trim().slice(1), '') : '';
  const coverTitle = `Báo cáo thị trường sản phẩm${coverName ? ` ${coverName}` : ''}`;
  const coverQuarter = marketPresentation ? marketReportQuarter(input) : null;
  const pageTitle = coverQuarter ? `${coverTitle} · ${coverQuarter.quarter}` : `${escape(title)} · ${storedLiteral(input.start.keyword, 'Từ khóa được giữ trong bản lưu')}`;
  const coverText = coverQuarter ? `<h1>${coverTitle}</h1><p class="cv-quarter">${coverQuarter.quarter}</p><p class="cv-period">${coverQuarter.range}</p></div><div class="cv-meta"></div>`
    : `<p class="cv-eyebrow">Bản nháp từ nguồn · Chưa được duyệt</p><h1>${escape(title)}</h1><h2>${storedLiteral(input.start.keyword, 'Từ khóa được giữ trong bản lưu')}</h2><p class="cv-lede">Hai lớp tách biệt: dữ liệu đã thu và những điều chưa đủ bằng chứng.</p></div><div class="cv-meta"><b>Việt Nam</b><span>${escape(period)}</span><span>${escape(coverSummary)}</span></div>`;
  const footerText = marketPresentation
    ? `${decisionGeneratedIds.length || input.i14Synthesis?.status === 'VALID' ? 'Nội dung do AI đề xuất chưa được chủ duyệt. ' : ''}Các phương án ở Phần 12 là đề xuất, chờ chủ duyệt; báo cáo không tự đưa ra quyết định kinh doanh. “Chưa có dữ liệu” nghĩa là nguồn chưa có số, không phải bằng không.`
    : `${insightPersona ? 'Chân dung và thẻ bằng chứng do AI đề xuất, chờ chủ duyệt; không phải một khách hàng có thật, kết luận đã phát hành hoặc quyết định kinh doanh.' : decisionGeneratedIds.length ? 'Kết quả xử lý AI được lưu riêng, chưa được người dùng duyệt; không phải sự thật đã xác minh, phương án đã chọn hoặc quyết định kinh doanh.' : input.i14Synthesis?.status === 'VALID' ? 'Nhận định AI được lưu riêng, chưa được người dùng duyệt; không phải sự thật đã xác minh hoặc quyết định kinh doanh.' : 'Không có nhận định AI hoặc quyết định kinh doanh tự động trong bản nháp này.'} Không có dữ liệu không đồng nghĩa với giá trị bằng ${input.publicReviewSource ? 'không' : '0'}.`;
  const coverArt = cover ?`<img class="cv-art" src="data:image/jpeg;base64,${cover.base64}" alt="${escape(cover.alt)}" width="${cover.width}" height="${cover.height}" data-cover-provenance="${escape(cover.provenance)}">` : '';
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'"><title>${pageTitle}</title><style>${reportKitFontCss()}\n${REPORT_KIT_CSS}\n.sheet{break-before:page}.sheet h2{font-size:26px}.state{font-size:12px;color:var(--warn-ink)}.warning{padding:12px;background:var(--warn-bg);color:var(--warn-ink)}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px}dt{font-weight:700}dd{margin:0}.table-wrap{overflow-x:auto}.table-wrap table{min-width:720px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:10px;text-align:left;border:1px solid var(--bd);vertical-align:top}code{word-break:break-all}code.loc{word-break:normal;overflow-wrap:break-word}`
  // Desktop cover: keep text off the diagonal (yellow stripe spans 61.5%→39.6% of the cover width, top→bottom).
  + `@media screen and (min-width:901px){.cover{container-type:inline-size}.cv-left>div:nth-child(2){max-width:calc(46cqi - 40px)}.cv-meta{max-width:calc(38cqi - 40px)}.cv-right{padding-left:11cqi}}`
  // Narrow screens: tables keep their width and scroll; say so, show edge shadows and keep captions in view.
  + `@media screen and (max-width:800px){.table-wrap:not(:has(>.evidence-table)){container-type:inline-size;background:linear-gradient(90deg,#fff 30%,#fff0) left/24px 100% no-repeat local,linear-gradient(270deg,#fff 30%,#fff0) right/24px 100% no-repeat local,radial-gradient(farthest-side at 0 50%,#0f172a33,#0000) left/10px 100% no-repeat scroll,radial-gradient(farthest-side at 100% 50%,#0f172a33,#0000) right/10px 100% no-repeat scroll}.table-wrap:not(:has(>.evidence-table))::before{content:"Nếu bảng vượt chiều rộng màn hình, vuốt ngang để xem đủ cột. Bàn phím: Tab để chọn bảng, rồi dùng phím mũi tên.";display:block;position:sticky;left:0;padding:0 0 6px;color:var(--mut);font-size:12px}.table-wrap:not(:has(>.evidence-table)) caption{position:sticky;left:0;max-width:100cqi;box-sizing:border-box}.table-wrap:focus-visible{outline-offset:-3px}}`
  + `.reader-summary,.section-reading,.reader-guide{max-width:72ch}.reader-context{margin-bottom:24px}.method-reference{margin-top:24px;color:var(--mut)}.method-reference summary{cursor:pointer}.reader-summary{font-weight:500}td,dd{font-variant-numeric:tabular-nums}`
  + `@media(max-width:600px){dl{grid-template-columns:1fr}.sheet{padding:20px}.cover{display:block}.cv-right{background:var(--blue);padding:24px}.cv-left{padding:24px}}@media print{@page{size:A4;margin:14mm}body{background:white}main{padding:0}.cover{min-height:240mm}.toc{gap:4px}.toc a{min-height:0}#sections>.reader-guide+.sheet{break-before:auto}.sh-head{break-after:avoid}.sheet{padding:16px 0;border:0;break-inside:auto}.sheet:after{display:none}.table-wrap{overflow:visible}.table-wrap table{min-width:0}tr{break-inside:avoid}thead{display:table-header-group}.jump{display:none}.sheet h3,.sheet h4,caption,summary{break-after:avoid}thead{break-after:avoid}tbody>tr:first-child{break-before:avoid}details{break-inside:auto}summary+p{break-before:avoid}.limits li{break-inside:avoid}${marketPresentation ? '' : '.citation-register a::after{content:" (" attr(href) ")"}'}.citation-register ol{padding-left:20px}.citation-register li{break-inside:avoid}}${coverArt ? COVER_ART_CSS : ''}${coverQuarter ? '.cv-quarter{margin:14px 0 0;font-size:20px;font-weight:800;color:var(--blue)}.cv-period{margin:6px 0 0;font-size:14px;color:var(--mut)}' : ''}${marketPresentation ? MARKET_READER_PRINT_CSS : ''}</style></head><body><a class="skip" href="#sections">Đến nội dung báo cáo</a><main><section class="cover"><div class="cv-left"><div class="brand"><i></i><b>TDN GROWTH OS</b></div><div>${coverArt}${coverText}</div><nav class="cv-right" aria-label="Mục lục"><h2>Nội dung</h2><ul class="toc">${sections.map(section => `<li><a href="#${section.sectionId}"><em>${section.sectionId}</em>${escape(marketPresentation && section.sectionId === 'M13' ? ` · ${section.title.replace(/^Phụ lục\s*(?:[·:–—-]\s*)?/iu, '')}` : section.title)}</a></li>`).join('')}</ul></nav></section><div id="sections">${readerBody}</div>${renderCitationRegister(registry.entries(), { format: 'web' })}<footer><p>${footerText}</p></footer></main></body></html>`;
  const labelledHtml = readerPlainText && kind === 'MARKET' ? marketReaderLabels(html) : html;
  const scopedHtml = marketPresentation ? labelledHtml.replace('<body', `<body data-market-platforms="${marketPlatforms.join(',')}" data-market-chart-rows="${marketChartRows(chartRows).length}"${marketShopsUnrecorded(chartRows) ? ' data-market-shops-unrecorded="1"' : ''}`) : labelledHtml;
  // Platform icons and reader labels apply to both copies; only the reader copy drops the trace and gains notes/interpretations.
  const sanitize = (page: string): string => currentReaderProse(platIcons(page, { shopee: '#c2410c', tiktok: '#1d2327' }, undefined, { compoundPlatformLabels: true, preserveQuotes: true }).html
    .replace(/<span class="cite-locator">[^<]*\bSheet1\b[^<]*<\/span>/giu, ''), part => part
      .replace(/\b[0-9a-f]{64}\b/giu, '[mã nguồn được giữ trong hồ sơ]')
      .replace(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/gu, 'chi tiết nguồn được giữ trong hồ sơ')
      .replace(/\bCORE\b/gu, 'phạm vi cốt lõi')
      .replace(/\bWIDE\b/gu, 'phạm vi rộng')
      .replace(/\bALL\b/gu, 'toàn bộ mẫu')
      .replace(/\bUNKNOWN\b/gu, 'chưa rõ'));
  // Delivery drops trace blocks; the reader renumbers the citations it still shows after semanticCitations and scopedHtml keep per-claim identity.
  const deliveredHtml = marketPresentation ? sanitize(marketReaderCitations(numberMarketExhibits(deliverMarketReader(scopedHtml, input.collection?.searchInterest ? searchInterestReadingPoints(input.collection.searchInterest) : undefined, Boolean(input.metricMethods?.capture), Boolean(input.publicReviewSource), chartTrace?.reading)), registry, { publicReviewSource: Boolean(input.publicReviewSource) })) : scopedHtml;
  const plainNumbers = kind === 'MARKET' && Boolean(input.metricMethods?.capture?.rowPolicyVersion || (marketPresentation && !input.metricMethods?.capture));
  const readerRenderedHtml = plainNumbers ? plainCaptureNumbers(deliveredHtml) : deliveredHtml;
  // Hidden technical copy for retrieval: the same page before reader delivery, trace blocks kept. Never linked from the reader.
  const traceHtml = marketPresentation ? Buffer.from(sanitize(scopedHtml), 'utf8') : undefined;
  // Source appendix v18 also serves existing Market and accepted Insight
  // methods. Preserve the family-draft lint boundary independently of the
  // renderer identity, so its source marker cannot bypass the applicable gate.
  if (insightPersona || (draftInsight && (input.insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v3' || input.insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v4' || insightCoding?.contractVersion === 'automation-insight-coding-snapshot-v5'))) {
    const failed = lintVisibleReportText(readerRenderedHtml).filter(check => !check.ok);
    if (failed.length) throw new TypeError(`INSIGHT_VISIBLE_TEXT_LINT_FAILED:${failed.map(check => check.rule).join(',')}`);
  }
  // Trace tokens as the delivered page prints them («12%» reads «12 phần trăm» when numbers are spelled out).
  const recordedTrace = numberTrace?.snapshot();
  const marketNumberTrace = recordedTrace && plainNumbers
    ? { ...recordedTrace, entries: recordedTrace.entries.map(entry => ({ ...entry, token: plainCaptureNumbers(entry.token) })) } : recordedTrace;
  // Raw-response pointers are re-read in the stored capture when the caller holds its content.
  const rawCaptures = new Map((input.marketRawSeries?.periods ?? []).flatMap(period => period.raw === undefined ? [] : [[period.captureId, period.raw] as const]));
  const traceCheck = marketNumberTrace ? { numberTrace: { trace: marketNumberTrace,
    resolve: (traceInput: MarketTraceInput) => 'store' in traceInput || !rawCaptures.has(traceInput.captureId) ? undefined : resolveMarketRawSource(rawCaptures.get(traceInput.captureId), traceInput) } } : {};
  // The Market check owns its order and errors: visible-text lint, business gate, 14 rules, public-review names, number trace.
  const marketCheck = kind === 'MARKET' ? assertMarketReport(readerRenderedHtml, marketPresentation
    ? { kind: 'DRAFT_PRESENTATION', publicReviewSource: Boolean(input.publicReviewSource), partialTotals: marketPartialRowTotals(input), ...traceCheck }
    : { kind: 'DRAFT_PLAIN', publicReviewSource: Boolean(input.publicReviewSource), ...traceCheck }) : undefined;
  if (kind === 'INSIGHT') {
    const nameFailure = lintReaderReport(readerRenderedHtml, { reportKind: kind, publicReviewSource: Boolean(input.publicReviewSource) }).filter(r => (r.rule.startsWith('F1 ') || r.rule.startsWith('W6 ')) && !r.ok);
    if (nameFailure.length) throw new TypeError(input.publicReviewSource ? 'PUBLIC_REVIEW_READER_NAME_REFUSED' : 'INSIGHT_READER_NAME_REFUSED');
  }
  const semanticTrace = marketNumberTrace ? { marketNumberTrace, ...(marketCheck?.numberTrace ? { marketNumberTraceGate: marketCheck.numberTrace } : {}) } : {};
  return { semantic: { ...semanticBase, ...semanticCitations, ...semanticTrace }, html: Buffer.from(readerRenderedHtml, 'utf8'), ...(traceHtml ? { traceHtml } : {}) };
}

/** Counts describe the retained capture, never a product/platform population or people. */
function reviewSampleSection(sample: AutomationReviewSample, view: PrivateReviewReportView, citations: ReportCitations, readerPlainText = false): string {
  const rows = sample.products.map((product, index) => {
    const stop = (product.shortfallReason === 'RETURNED_COUNT_BELOW_REQUESTED' || product.retainedReviews < product.targetReviews)
      ? `Sản phẩm này chỉ lấy được ${product.retainedReviews}/${product.targetReviews} bình luận.`
      : product.stop === 'A_FIXED_COUNT' ? 'Đã thu được 300 bản ghi' : product.stop === 'PROVIDER_DATASET_EXHAUSTED'
      ? 'Đã đọc hết tập dữ liệu trả về của lượt thu; chưa biết tổng review của sản phẩm' : 'Lượt thu dừng trước mốc 300';
    const mark = citations.mark({ sourceKind: 'CAPTURE', identity: sample.collection.collectionSha256,
      locator: `/selected/${index}`, label: 'Tập đánh giá của các mục sản phẩm đã chọn trên Shopee',
      retrievedAt: view.capture.retrievedAt, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return `<tr><td>${readerPlainText ? `${escape(readerShopLabel(product.listing.shopId, undefined, index + 1))} · ${escape(readerProductLabel(product.listing.itemId, undefined, index + 1))}` : escape(`shopee:${product.listing.shopId}:${product.listing.itemId}`)}</td><td>${product.retainedReviews}</td><td>${product.textReviews}</td><td>${product.meetsComparisonTextMinimum ? 'Đạt mốc 30 bản ghi có chữ; chưa cho phép suy rộng' : 'Chưa đủ 30 bản ghi có chữ để so sánh sản phẩm'}</td><td>${escape(stop)} ${mark}</td></tr>`;
  }).join('');
  return '<h3>Mẫu đánh giá đã thu</h3><p>Các mục sản phẩm do chủ sở hữu chọn, chưa phải mẫu theo độ phủ doanh thu 50% hoặc 80%. Kỳ doanh thu chưa được xác thực; chưa chứng minh đủ năm thương hiệu hoặc các nhóm cốt lõi. Mốc thu là 300 bản ghi mỗi mục sản phẩm, giới hạn cứng vẫn là 500. Chưa áp dụng dừng theo bão hòa mã nội dung.</p>'
    + `<div class="table-wrap"><table><caption>Số review trong tập thu đã giữ</caption><thead><tr><th>Mục sản phẩm</th><th>Review thu được</th><th>Có chữ đọc được</th><th>Mốc tối thiểu cho so sánh</th><th>Bằng chứng dừng</th></tr></thead><tbody>${rows}</tbody></table></div>`
    + '<p>Số bản ghi không phải số người. Số dòng tập dữ liệu trả về không phải tổng review của mỗi sản phẩm hay của nền tảng. Review từ TikTok Shop chưa có nguồn thu được hỗ trợ; bình luận video không thay thế review sản phẩm.</p>';
}
