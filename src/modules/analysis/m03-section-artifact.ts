import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/m03-section-artifact-request.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/m03-section-artifact.schema.json' with { type: 'json' };
import type { M03SectionArtifactRequest } from '../../../contracts/analysis/m03-section-artifact-request.generated.js';
import type { M03SectionArtifact } from '../../../contracts/analysis/m03-section-artifact.generated.js';
import type { M03VerifiedMetricSet } from '../../../contracts/analysis/m03-verified-metric-set.generated.js';
import type { M03ChartBundle, ScopeChart, SensitivityChart } from '../../../contracts/analysis/m03-chart-bundle.generated.js';
import type { M03NarrativeEvidence } from '../../../contracts/analysis/m03-narrative-evidence.generated.js';
import type { M03FactualNarrative } from '../../../contracts/analysis/m03-factual-narrative.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { verifyM03VerifiedMetricSet } from './m03-section-recipe.js';
import { verifyM03ChartBundle } from './m03-chart-bundle.js';
import { verifyM03NarrativeEvidence } from './m03-narrative-evidence.js';
import { verifyM03FactualNarrative } from './m03-factual-narrative.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(requestSchema);
const validateRequest = ajv.getSchema<M03SectionArtifactRequest>(requestSchema.$id)!;
const validateResult = ajv.compile<M03SectionArtifact>(resultSchema);

export class M03SectionArtifactValidationError extends Error {}
export class M03SectionArtifactIntegrityError extends Error {}

const FIXED_LIMITATIONS = [
  'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO',
  'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE',
  'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH',
  'CONTENT_IS_COPIED_FROM_VERIFIED_DEPENDENCIES_NOT_GENERATED',
  'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED',
] as const;

export function verifyM03SectionArtifact(
  value: unknown,
  expectedSha256?: string,
  exactMetricSet?: unknown,
  exactChartBundle?: unknown,
  exactEnvelope?: unknown,
  exactNarrative?: unknown,
): M03SectionArtifact {
  if (!validateResult(value)) throw new M03SectionArtifactIntegrityError('M03 section artifact breaks its contract');
  const result = JSON.parse(canonicalJson(value)) as M03SectionArtifact;
  const { artifactSha256, ...content } = result;
  if (digest(Buffer.from(canonicalJson(content), 'utf8')) !== artifactSha256 ||
      (expectedSha256 !== undefined && artifactSha256 !== expectedSha256)) {
    throw new M03SectionArtifactIntegrityError('M03 section artifact identity does not match exact content');
  }
  if (result.request.narrativeSha256 !== result.dependencies.narrativeSha256 ||
      canonicalJson(result.limitations) !== canonicalJson(FIXED_LIMITATIONS)) {
    throw new M03SectionArtifactIntegrityError('M03 section artifact lineage or canonical ordering is inconsistent');
  }
  const exactDeps = [exactMetricSet, exactChartBundle, exactEnvelope, exactNarrative];
  if (exactDeps.every(dependency => dependency !== undefined)) {
    const replay = renderM03SectionArtifact(result.request, exactMetricSet, exactChartBundle, exactEnvelope, exactNarrative);
    if (canonicalJson(replay.artifact) !== canonicalJson(result)) {
      throw new M03SectionArtifactIntegrityError('M03 section artifact does not replay from exact dependencies');
    }
  } else if (exactDeps.some(dependency => dependency !== undefined)) {
    throw new M03SectionArtifactIntegrityError('All exact M03 section artifact dependencies are required for replay');
  }
  return result;
}

export function renderM03SectionArtifact(
  untrustedRequest: unknown,
  untrustedMetricSet: unknown,
  untrustedChartBundle: unknown,
  untrustedEnvelope: unknown,
  untrustedNarrative: unknown,
): { html: string; artifact: M03SectionArtifact } {
  if (!validateRequest(untrustedRequest)) {
    throw new M03SectionArtifactValidationError(`Invalid M03 section artifact request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  const request = JSON.parse(canonicalJson(untrustedRequest)) as M03SectionArtifactRequest;
  const metricSet = verifyM03VerifiedMetricSet(untrustedMetricSet);
  const chartBundle = verifyM03ChartBundle(untrustedChartBundle, undefined, metricSet);
  const envelope = verifyM03NarrativeEvidence(untrustedEnvelope, undefined, metricSet, chartBundle);
  const narrative = verifyM03FactualNarrative(untrustedNarrative, request.narrativeSha256, envelope, metricSet, chartBundle);

  const html = renderM03SectionHtml(metricSet, chartBundle, envelope, narrative);
  const htmlBytes = Buffer.from(html, 'utf8');
  const content = {
    contractVersion: '1.0.0' as const,
    request,
    section: { sectionId: 'M03' as const, title: 'Quy mô và diễn biến' as const },
    renderer: { rendererProfile: 'm03-section-artifact-html-vi-v1' as const },
    dependencies: {
      metricSetSha256: metricSet.metricSetSha256,
      chartBundleSha256: chartBundle.chartBundleSha256,
      envelopeSha256: envelope.envelopeSha256,
      narrativeSha256: narrative.narrativeSha256,
    },
    html: { sha256: digest(htmlBytes), byteSize: htmlBytes.length },
    limitations: [...FIXED_LIMITATIONS] as M03SectionArtifact['limitations'],
    status: 'DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED' as const,
  };
  const result: M03SectionArtifact = {
    ...content,
    artifactSha256: digest(Buffer.from(canonicalJson(content), 'utf8')),
  };
  if (!validateResult(result)) {
    throw new M03SectionArtifactIntegrityError(`M03 section artifact breaks its contract: ${ajv.errorsText(validateResult.errors)}`);
  }
  return { html, artifact: verifyM03SectionArtifact(result, result.artifactSha256) };
}

const SCOPE_LABEL: Record<'all' | 'wide' | 'core', string> = {
  all: 'ALL · Toàn bộ dữ liệu',
  wide: 'WIDE · Phạm vi rộng',
  core: 'CORE · Nhóm lõi',
};

const SCOPE_WARNING_TEXT: Record<string, string> = {
  EMPTY_SCOPE: 'Phạm vi chưa có dòng dữ liệu.',
  MISSING_REVENUE: 'Thiếu doanh thu ở một số dòng.',
  MISSING_UNITS: 'Thiếu sản lượng ở một số dòng.',
  NON_EXACT_REVENUE: 'Nguồn có doanh thu làm tròn, ước tính hoặc chưa rõ độ chính xác.',
  NON_EXACT_UNITS: 'Nguồn có sản lượng làm tròn, ước tính hoặc chưa rõ độ chính xác.',
  ZERO_REVENUE: 'Doanh thu quan sát bằng 0.',
  LABELS_REQUIRE_ADJUDICATION: 'Nhãn phân loại cần được xác định lại trước khi tin cậy đầy đủ.',
};

const METRIC_SET_LIMITATION_TEXT: Record<string, string> = {
  NORMALIZED_INPUT_ONLY: 'Chỉ dùng dữ liệu đã chuẩn hóa, không đọc lại file nguồn gốc.',
  MISSING_VALUES_ARE_NOT_ZERO: 'Giá trị thiếu không được hiểu là bằng 0.',
  ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE: 'ALL, WIDE và CORE chồng lấp nhau; không được cộng.',
  UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE: 'UNKNOWN vẫn được giữ trong ALL và loại khỏi WIDE.',
  LISTING_IS_NOT_A_UNIQUE_PRODUCT: 'Một listing không đồng nghĩa một sản phẩm duy nhất.',
  MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION: 'Chênh lệch theo membership không phải tăng trưởng thị trường hay quan hệ nhân quả.',
};

const CHART_BUNDLE_LIMITATION_TEXT: Record<string, string> = {
  NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO: 'Giá trị null phải hiển thị là thiếu, không đổi thành 0.',
  SCOPES_OVERLAP_AND_MUST_NOT_BE_STACKED_OR_SUMMED: 'Các phạm vi chồng lấp; không được xếp chồng hoặc cộng dồn.',
  SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH: 'Độ nhạy là chênh lệch theo membership, không phải tăng trưởng.',
};

const AUTHORING_RULE_TEXT: Record<string, string> = {
  EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE: 'Mọi con số phải copy đúng một giá trị đã được trích dẫn.',
  MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO: 'Giá trị thiếu không được hiển thị hoặc mô tả là bằng 0.',
  NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS: 'Không suy luận nhân quả, dự báo, thị phần hoặc nhận định sức khỏe.',
  NO_CROSS_PERIOD_COMPARISON: 'Không so sánh giữa các kỳ đo khác nhau.',
  NO_ADDITION_OF_OVERLAPPING_SCOPES: 'Không cộng các phạm vi chồng lấp.',
  LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS: 'Chỉ giới hạn trong các fact quan sát của M03 và các giới hạn đã nêu rõ.',
};

const ARTIFACT_LIMITATION_TEXT: Record<string, string> = {
  NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO: 'Giá trị null phải hiển thị là thiếu, không đổi thành 0.',
  ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE: 'ALL, WIDE và CORE chồng lấp nhau; không được cộng.',
  SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH: 'Độ nhạy là chênh lệch theo membership, không phải tăng trưởng.',
  CONTENT_IS_COPIED_FROM_VERIFIED_DEPENDENCIES_NOT_GENERATED: 'Toàn bộ nội dung được copy từ các artifact đã xác minh; tài liệu này không tự sinh diễn giải mới.',
  DETERMINISTIC_FACTUAL_DRAFT_NOT_OWNER_APPROVED: 'Đây là bản nháp factual xác định, chưa được OWNER duyệt.',
};

const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);

function formatValue(value: string, unitLabel: string): string {
  const negative = value.startsWith('-');
  const digits = negative ? value.slice(1) : value;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}${grouped} ${unitLabel}`;
}

function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function absoluteBigInt(value: string): bigint {
  const parsed = BigInt(value);
  return parsed < 0n ? -parsed : parsed;
}

function widthPercent(value: string, max: bigint): number {
  return max === 0n ? 0 : Number(absoluteBigInt(value) * 10000n / max) / 100;
}

function shortDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function scopeBarFigure(chart: ScopeChart, unitLabel: string): string {
  const max = chart.points.reduce((accumulator, point) => {
    if (point.value === null) return accumulator;
    const magnitude = absoluteBigInt(point.value);
    return magnitude > accumulator ? magnitude : accumulator;
  }, 0n);
  const rows = chart.points.map(point => {
    const label = SCOPE_LABEL[point.scope];
    if (point.value === null) {
      const missingNote = point.missingCount > 0 ? ` Thiếu ${point.missingCount} dòng.` : '';
      return `<div class="plot-row"><span>${escape(label)}</span><p class="missing">Chưa có số đủ điều kiện.${missingNote}</p></div>`;
    }
    return `<div class="plot-row"><span>${escape(label)}</span><span class="value">${escape(formatValue(point.value, unitLabel))}</span><div class="track" aria-hidden="true"><span style="width:${widthPercent(point.value, max)}%"></span></div></div>`;
  }).join('');
  return `<figure><figcaption>${escape(chart.title)}</figcaption>${rows}<p class="caption">Cùng kỳ đo; các phạm vi ALL/WIDE/CORE chồng lấp nhau và không được cộng lại. Độ dài thanh so với giá trị lớn nhất trong biểu đồ này.</p></figure>`;
}

function sensitivityFigure(chart: SensitivityChart): string {
  const max = chart.points.reduce((accumulator, point) => {
    if (point.value === null) return accumulator;
    const magnitude = absoluteBigInt(point.value);
    return magnitude > accumulator ? magnitude : accumulator;
  }, 0n);
  const rows = chart.points.map(point => {
    const label = point.to === 'wide' ? 'ALL → WIDE' : 'ALL → CORE';
    if (point.value === null) {
      return `<div class="plot-row"><span>${escape(label)}</span><p class="missing">Chưa đủ dữ liệu để tính chênh lệch.</p></div>`;
    }
    const negative = point.value.startsWith('-');
    const percent = widthPercent(point.value, max) / 2;
    return `<div class="plot-row"><span>${escape(label)}</span><span class="value">${escape(formatValue(point.value, 'VND'))}</span><div class="signed-track" aria-hidden="true"><span class="zero-line"></span><span class="signed-bar ${negative ? 'negative' : 'positive'}" style="width:${percent}%"></span></div><small>${formatCount(point.removedRecordIndices.length)} dòng bị loại khỏi membership.</small></div>`;
  }).join('');
  return `<figure><figcaption>${escape(chart.title)}</figcaption>${rows}<p class="caption">Đường 0 nằm ở giữa; thanh trái là chênh âm và thanh phải là chênh dương. Đây là độ nhạy membership khi đổi từ ALL, không phải tăng trưởng, dự báo hay quan hệ nhân quả.</p></figure>`;
}

function metricsTable(metricSet: M03VerifiedMetricSet): string {
  const rows = metricSet.scopes.map(scope => {
    const revenue = scope.revenue.value === null
      ? '<span class="missing-inline">Chưa có số đủ điều kiện</span>'
      : escape(formatValue(scope.revenue.value, 'VND'));
    const units = scope.units.value === null
      ? '<span class="missing-inline">Chưa có số đủ điều kiện</span>'
      : escape(formatValue(scope.units.value, 'đơn vị'));
    const warnings = scope.warnings.length
      ? `<ul class="limits">${scope.warnings.map(code => `<li>${escape(SCOPE_WARNING_TEXT[code] ?? code)}</li>`).join('')}</ul>`
      : 'Không có cảnh báo.';
    return `<tr><th scope="row">${escape(SCOPE_LABEL[scope.key])}</th><td>${escape(formatCount(scope.listingCount))}</td><td>${escape(formatCount(scope.shopCount))}</td><td>${revenue}<br><small>${scope.revenue.observedCount} quan sát · ${scope.revenue.missingCount} thiếu · ${scope.revenue.nonExactCount} không chính xác tuyệt đối · ${scope.revenue.complete ? 'đầy đủ' : 'chưa đầy đủ'}</small></td><td>${units}<br><small>${scope.units.observedCount} quan sát · ${scope.units.missingCount} thiếu · ${scope.units.nonExactCount} không chính xác tuyệt đối · ${scope.units.complete ? 'đầy đủ' : 'chưa đầy đủ'}</small></td><td>${warnings}</td></tr>`;
  }).join('');
  return `<div class="table-wrap" role="region" aria-label="Số liệu theo phạm vi" tabindex="0"><table><caption>Số liệu quan sát theo phạm vi ALL/WIDE/CORE. Các phạm vi chồng lấp; không cộng giữa các dòng.</caption><thead><tr><th scope="col">Phạm vi</th><th scope="col">Listing</th><th scope="col">Shop</th><th scope="col">Doanh thu quan sát</th><th scope="col">Sản lượng quan sát</th><th scope="col">Cảnh báo</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function lineageMeta(metricSet: M03VerifiedMetricSet): string {
  const scope = metricSet.scope;
  return `<dl><dt>Nền tảng</dt><dd>${escape(scope.platform)} · bộ lọc ${escape(scope.selection)}</dd><dt>Kỳ đo</dt><dd>${escape(shortDate(scope.start))} → ${escape(shortDate(scope.end))}<br><small>${escape(scope.periodBasis)}</small></dd><dt>Thu nhận nguồn</dt><dd>${scope.acquiredAt === null ? 'Chưa xác nhận' : escape(shortDate(scope.acquiredAt))}</dd><dt>Chính sách nhãn</dt><dd>${escape(metricSet.labelPolicy.codebookVersion)}<br><small>UNKNOWN được giữ trong ALL và loại khỏi WIDE.</small></dd></dl>`;
}

function sourcesList(metricSet: M03VerifiedMetricSet): string {
  return `<ul class="sources">${metricSet.sources.map(source => `<li><strong>${escape(source.label)}</strong> · ${escape(source.representationRole)} · ${escape(source.evidenceFamily)}<br><small>${escape(source.provenanceBasis)}</small><br><code>${escape(source.sha256)}</code></li>`).join('')}</ul>`;
}

function narrativeSection(narrative: M03FactualNarrative): string {
  return narrative.paragraphs.map(paragraph => `<p class="${paragraph.kind === 'CAVEAT' ? 'caveat' : 'fact'}" id="${escape(paragraph.paragraphId)}">${escape(paragraph.text)}</p>`).join('');
}

function limitationsSection(
  metricSet: M03VerifiedMetricSet,
  chartBundle: M03ChartBundle,
  envelope: M03NarrativeEvidence,
): string {
  const metricItems = metricSet.limitations.map(code => `<li>${escape(METRIC_SET_LIMITATION_TEXT[code] ?? code)}</li>`).join('');
  const chartItems = chartBundle.limitations.map(code => `<li>${escape(CHART_BUNDLE_LIMITATION_TEXT[code] ?? code)}</li>`).join('');
  const ruleItems = envelope.authoringRules.map(code => `<li>${escape(AUTHORING_RULE_TEXT[code] ?? code)}</li>`).join('');
  const artifactItems = FIXED_LIMITATIONS.map(code => `<li>${escape(ARTIFACT_LIMITATION_TEXT[code] ?? code)}</li>`).join('');
  return `<h2>Giới hạn</h2><h3>Giới hạn số liệu (M03)</h3><ul class="limits">${metricItems}</ul><h3>Giới hạn biểu đồ</h3><ul class="limits">${chartItems}</ul><h3>Quy tắc soạn nội dung</h3><ul class="limits">${ruleItems}</ul><h3>Giới hạn của tài liệu này</h3><ul class="limits">${artifactItems}</ul>`;
}

function provenanceSection(
  metricSet: M03VerifiedMetricSet,
  chartBundle: M03ChartBundle,
  envelope: M03NarrativeEvidence,
  narrative: M03FactualNarrative,
): string {
  return `<dl><dt>Metric set</dt><dd><code>${escape(metricSet.metricSetSha256)}</code></dd><dt>Chart bundle</dt><dd><code>${escape(chartBundle.chartBundleSha256)}</code></dd><dt>Evidence envelope</dt><dd><code>${escape(envelope.envelopeSha256)}</code></dd><dt>Factual narrative</dt><dd><code>${escape(narrative.narrativeSha256)}</code></dd><dt>Readiness catalog</dt><dd><code>${escape(metricSet.readiness.catalogId)}</code> · ${escape(metricSet.readiness.catalogVersion)}</dd></dl>${sourcesList(metricSet)}`;
}

const STYLE = ':root{color-scheme:light;--ink:#172e43;--muted:#536a7c;--line:#dfe7ed;--canvas:#dfe8ed;--teal:#087e8b;--blue:#2457c5}*{box-sizing:border-box}html{scroll-padding-top:20px}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}::selection{background:#e1ebff;color:var(--ink)}a{color:var(--blue);text-underline-offset:3px}:focus-visible{outline:3px solid var(--blue);outline-offset:4px}.skip{position:absolute;left:12px;top:-80px;padding:12px;background:white}.skip:focus{top:12px}main{max-width:920px;margin:32px auto;background:white;padding:32px;border-radius:14px}h1{font-size:32px;line-height:1.2;letter-spacing:-.03em;margin:0 0 16px;text-wrap:balance}h2{font-size:22px;margin:0 0 12px}h3{font-size:16px;margin:20px 0 8px}p{max-width:75ch}header{padding-bottom:24px;border-bottom:1px solid var(--line)}.status{display:inline-block;padding:5px 12px;border-radius:99px;background:#fff4d5;color:#79520e;font-weight:700}.meta{color:var(--muted)}dl{display:grid;grid-template-columns:170px minmax(0,1fr);gap:10px 16px;margin:16px 0 0}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}nav{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0 0}section{margin-top:36px}small,.caption,.muted{color:var(--muted)}figure{margin:0;padding:20px 0;border-top:1px solid var(--line)}figcaption{font-size:18px;font-weight:700;margin-bottom:16px}.plot-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;margin:16px 0}.value{font-variant-numeric:tabular-nums;font-weight:700;overflow-wrap:anywhere}.track{grid-column:1/-1;height:12px;background:#edf2f5;overflow:hidden;border-radius:3px}.track span{display:block;height:100%;background:var(--teal)}.signed-track{grid-column:1/-1;height:12px;background:#edf2f5;position:relative;overflow:hidden;border-radius:3px}.signed-track .zero-line{position:absolute;left:50%;top:0;bottom:0;width:2px;background:var(--ink);transform:translateX(-1px)}.signed-track .signed-bar{position:absolute;top:0;height:100%;background:var(--teal)}.signed-track .negative{right:50%}.signed-track .positive{left:50%}.plot-row small,.plot-row .missing{grid-column:1/-1}.missing,.missing-inline{color:#79520e;background:#fff4d5}.missing{padding:12px;margin:0}.missing-inline{padding:2px 6px;border-radius:4px}.caption{font-size:13px}.limits{padding-left:20px;max-width:75ch}.limits li{margin:6px 0;overflow-wrap:anywhere}code{font-size:13px;overflow-wrap:anywhere}.table-wrap{overflow:auto;max-width:100%}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}thead th{background:#edf2f5}caption{text-align:left;padding:0 0 10px;color:var(--muted);font-size:13px}.sources{padding-left:20px}.sources li{margin:10px 0}p.fact{margin:12px 0}p.caveat{color:#79520e;background:#fff4d5;padding:12px;border-radius:8px}footer{border-top:1px solid var(--line);margin-top:36px;padding-top:20px;color:var(--muted);font-size:13px}@page{size:A4;margin:16mm}@media(max-width:700px){main{margin:0;padding:20px;border-radius:0}h1{font-size:26px}.plot-row{grid-template-columns:1fr}.value{justify-self:start}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:12px}th,td{padding:8px}section{margin-top:28px}}@media print{body{background:white;font-size:10pt}main{max-width:none;margin:0;padding:0}.skip,nav{display:none}a{color:inherit}figure,tr{break-inside:avoid}.table-wrap{overflow:visible}.track,.signed-track{-webkit-print-color-adjust:exact;print-color-adjust:exact}}';

function renderM03SectionHtml(
  metricSet: M03VerifiedMetricSet,
  chartBundle: M03ChartBundle,
  envelope: M03NarrativeEvidence,
  narrative: M03FactualNarrative,
): string {
  const revenueChart = chartBundle.charts[0] as ScopeChart;
  const unitsChart = chartBundle.charts[1] as ScopeChart;
  const sensitivityChart = chartBundle.charts[2] as SensitivityChart;
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>M03 · Quy mô và diễn biến</title><style>${STYLE}</style></head>
<body>
<a class="skip" href="#main">Đến nội dung</a>
<main id="main">
<header>
<h1>M03 · Quy mô và diễn biến</h1>
<p class="status">Bản nháp factual xác định · Chưa duyệt bởi OWNER</p>
${lineageMeta(metricSet)}
<nav aria-label="Mục section"><a href="#metrics">Số liệu</a><a href="#charts">Biểu đồ</a><a href="#narrative">Diễn giải</a><a href="#limitations">Giới hạn</a><a href="#provenance">Nguồn và nhận diện</a></nav>
</header>
<section id="metrics"><h2>Số liệu quan sát theo phạm vi</h2>${metricsTable(metricSet)}</section>
<section id="charts"><h2>Biểu đồ</h2>${scopeBarFigure(revenueChart, 'VND')}${scopeBarFigure(unitsChart, 'đơn vị')}${sensitivityFigure(sensitivityChart)}</section>
<section id="narrative"><h2>Diễn giải factual</h2>${narrativeSection(narrative)}</section>
<section id="limitations">${limitationsSection(metricSet, chartBundle, envelope)}</section>
<section id="provenance"><h2>Nguồn và nhận diện</h2>${provenanceSection(metricSet, chartBundle, envelope, narrative)}</section>
<footer>TDN Growth OS · M03 section artifact. Toàn bộ nội dung được copy từ artifact đã xác minh; không có lời gọi AI, nhà cung cấp hoặc quyết định kinh doanh nào được thực hiện khi tạo tài liệu này.</footer>
</main>
</body></html>
`;
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
