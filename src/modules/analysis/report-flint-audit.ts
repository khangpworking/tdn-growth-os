import { createHash } from 'node:crypto';
import type { DescriptiveMarketMethods } from '../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { ReportAssemblySnapshot } from '../../../contracts/analysis/report-assembly-snapshot.generated.js';
import type { ResearchChartSpec } from '../../../contracts/analysis/research-chart-spec.generated.js';
import type { ReportMethodArtifact } from './versioned-report-packet.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { createResearchReportPacket } from './versioned-report-packet.js';
import { buildResearchReportChartData, type ResearchReportChartData } from './research-report-charts.js';
import { verifyResearchChartSpec } from './research-chart-spec.js';
import { verifyDescriptiveMarketMethods } from './descriptive-market-methods.js';

/**
 * Flint is intentionally an injected compiler here.  The TDN application does
 * not depend on Flint at runtime; the offline script supplies the isolated
 * flint-chart@0.5.1 installation that was reviewed on Fedora.
 */
export const FLINT_PACKAGE = Object.freeze({
  name: 'flint-chart',
  version: '0.5.1',
  npmGitHead: '34ef4516554b323a740a426bd1a1e6ba31ee8245',
});

export interface FlintRuntimeInput {
  readonly name: string;
  readonly version: string;
  readonly npmGitHead?: string;
  readonly gitHeadVerification?: 'VERIFIED' | 'NOT_PRESENT';
}

export interface FlintRuntimeReceipt {
  readonly name: typeof FLINT_PACKAGE.name;
  readonly version: typeof FLINT_PACKAGE.version;
  readonly npmGitHead: string | null;
  readonly gitHeadVerification: 'VERIFIED' | 'NOT_PRESENT';
}

export const REPORT_FLINT_AUDIT_PROFILE = 'report-flint-audit-v1' as const;
const DIGEST = /^[0-9a-f]{64}$/;
const SECTION_IDS = ['M03', 'M04', 'M05'] as const;
type FlintSectionId = typeof SECTION_IDS[number];
type FlintBackend = 'vegaLite' | 'echarts' | 'chartjs' | 'plotly';

export interface FlintAssemblyInput {
  readonly data: { readonly values: readonly Record<string, unknown>[] };
  readonly semantic_types: Readonly<Record<string, string>>;
  readonly chart_spec: {
    readonly chartType: 'Bar Chart';
    readonly title: string;
    readonly encodings: { readonly x: { readonly field: string }; readonly y: { readonly field: string } };
    readonly baseSize: { readonly width: number; readonly height: number };
    readonly canvasSize: { readonly width: number; readonly height: number };
  };
}

export interface FlintAssemblerSet {
  readonly runtime: FlintRuntimeInput;
  readonly assembleVegaLite: (input: FlintAssemblyInput) => unknown;
  readonly assembleECharts: (input: FlintAssemblyInput) => unknown;
  readonly assembleChartjs: (input: FlintAssemblyInput) => unknown;
  readonly assemblePlotly: (input: FlintAssemblyInput) => unknown;
}

export interface ReportFlintSourcePins {
  readonly workspaceSnapshotSha256: string;
  readonly sourcePackageManifestSha256: string;
  readonly sourcePackageContentSha256: string;
  readonly normalizedInputArtifactSha256: string;
  readonly normalizedInputValueSha256: string;
  readonly metricResultSha256: string;
  readonly catalogSha256: string;
  readonly packetSha256: string;
  readonly chartDataSha256: string;
  readonly chartSpecSha256: string;
  readonly assemblySha256: string | null;
  readonly readinessSha256: string | null;
  readonly descriptiveMethodOutputId: string | null;
}

export interface ReportFlintSectionPin {
  readonly sectionId: string;
  readonly readinessState: 'READY_TO_CALCULATE' | 'BLOCKED' | 'INVALID' | 'UNKNOWN';
  readonly deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT' | 'METHOD_ONLY' | 'BLOCKED' | 'MANUAL_REVIEW_REQUIRED' | 'NOT_IMPLEMENTED' | 'UNKNOWN';
  readonly materialized: boolean;
  readonly sectionSha256: string | null;
  readonly blockers: readonly string[];
}

export interface ReportFlintAuditRequest {
  readonly chartData: ResearchReportChartData;
  readonly chartDataBytes: Uint8Array;
  readonly chartSpec: ResearchChartSpec;
  readonly chartSpecBytes: Uint8Array;
  readonly normalizedInputBytes: Uint8Array;
  readonly metricResultBytes: Uint8Array;
  readonly catalogBytes: Uint8Array;
  readonly packetBytes: Uint8Array;
  readonly sourcePins: ReportFlintSourcePins;
  readonly sections: readonly ReportFlintSectionPin[];
  readonly descriptiveMethods?: DescriptiveMarketMethods;
}

export interface FlintExpectedDatum {
  readonly category: string;
  readonly valueText: string;
  readonly value: number | null;
  readonly sourcePointer: string;
}

export interface ReportFlintVariantPlan {
  readonly variantId: string;
  readonly sectionId: FlintSectionId;
  readonly state: 'ELIGIBLE' | 'BLOCKED';
  readonly blockers: readonly string[];
  readonly chartSpecViewId: string | null;
  readonly chartSpecId: string | null;
  readonly methodOutputId: string | null;
  readonly input: FlintAssemblyInput | null;
  readonly expected: readonly FlintExpectedDatum[];
}

interface FlintWarning {
  readonly severity?: string;
  readonly code?: string;
  readonly message?: string;
  readonly channel?: string;
  readonly field?: string;
}

interface BackendAudit {
  readonly state: 'PASS' | 'REJECTED' | 'UNSUPPORTED';
  readonly outputSha256: string | null;
  readonly warnings: readonly FlintWarning[];
  readonly missingCategories: readonly string[];
  readonly extraCategories: readonly string[];
  readonly duplicateCategories: readonly string[];
  readonly valueMismatches: readonly string[];
  readonly aggregationDetected: boolean;
  readonly output: unknown | null;
  readonly error: string | null;
}

export interface ReportFlintVariantReceipt {
  readonly variantId: string;
  readonly sectionId: FlintSectionId;
  readonly state: 'COMPILED' | 'REJECTED' | 'BLOCKED';
  readonly blockers: readonly string[];
  readonly chartSpecViewId: string | null;
  readonly chartSpecId: string | null;
  readonly methodOutputId: string | null;
  readonly inputSha256: string | null;
  readonly expected: readonly FlintExpectedDatum[];
  readonly backends: Partial<Record<FlintBackend, BackendAudit>>;
}

export interface ReportFlintAuditReceipt {
  readonly contractVersion: '1.0.0';
  readonly auditProfile: typeof REPORT_FLINT_AUDIT_PROFILE;
  readonly runtime: FlintRuntimeReceipt;
  readonly providerCalls: 0;
  readonly inputs: ReportFlintSourcePins & {
    readonly chartDataContractVersion: ResearchReportChartData['contractVersion'];
    readonly chartSpecContractVersion: ResearchChartSpec['contractVersion'];
    readonly chartSpecId: string;
  };
  readonly sections: readonly ReportFlintSectionPin[];
  readonly variants: readonly ReportFlintVariantReceipt[];
  readonly status: 'PASS' | 'REJECTED' | 'BLOCKED';
  readonly interpretationBoundary: string;
  readonly limitations: readonly string[];
}

export interface ReportFlintAuditResult {
  readonly receipt: ReportFlintAuditReceipt;
  readonly bytes: Buffer;
}

const digest = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => Buffer.from(a).equals(Buffer.from(b));

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function asArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new TypeError(`Flint audit: ${label}: INVALID_DIGEST`);
}

function assertDigestOrNull(value: string | null, label: string): void {
  if (value !== null) assertDigest(value, label);
}

function normalizeDecimal(value: string): string {
  if (!/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(value)) throw new TypeError(`Flint audit: INVALID_DECIMAL:${value}`);
  const negative = value.startsWith('-');
  const unsigned = negative ? value.slice(1) : value;
  const [whole = '', fraction = ''] = unsigned.split('.');
  const normalizedWhole = whole.replace(/^0+(?=\d)/, '');
  const normalizedFraction = fraction.replace(/0+$/, '');
  const body = normalizedFraction ? `${normalizedWhole}.${normalizedFraction}` : normalizedWhole;
  return body === '0' ? '0' : `${negative ? '-' : ''}${body}`;
}

function safeNumber(valueText: string, _label: string): number | null {
  let normalized: string;
  try { normalized = normalizeDecimal(valueText); }
  catch { return null; }
  const value = Number(valueText);
  if (!Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER) return null;
  try {
    if (normalizeDecimal(String(value)) !== normalized) return null;
  } catch { return null; }
  return value;
}

function percentageNumber(valueText: string, label: string): number | null {
  const value = safeNumber(valueText, label);
  if (value === null) return null;
  const percent = value / 100;
  try {
    if (!Number.isFinite(percent) || normalizeDecimal(String(percent * 100)) !== normalizeDecimal(valueText)) return null;
  } catch { return null; }
  return percent;
}

function section(request: ReportFlintAuditRequest, sectionId: FlintSectionId): ReportFlintSectionPin | null {
  return request.sections.find(item => item.sectionId === sectionId) ?? null;
}

function sectionBlockers(pin: ReportFlintSectionPin | null, requireMaterialized: boolean): string[] {
  if (pin === null) return ['SECTION_READINESS_NOT_PINNED'];
  const blockers = [...pin.blockers];
  if (pin.readinessState !== 'READY_TO_CALCULATE') blockers.push(`SECTION_NOT_READY:${pin.readinessState}`);
  if (pin.deliveryState === 'BLOCKED') blockers.push(`SECTION_DELIVERY_BLOCKED:${pin.deliveryState}`);
  if (requireMaterialized && !pin.materialized) blockers.push('SECTION_OUTPUT_NOT_MATERIALIZED');
  return [...new Set(blockers)];
}

function baseInput(
  title: string,
  categoryField: string,
  valueField: string,
  valueSemanticType: string,
  values: readonly Record<string, unknown>[],
): FlintAssemblyInput {
  return {
    data: { values },
    semantic_types: { [categoryField]: 'CategoryCode', [valueField]: valueSemanticType },
    chart_spec: {
      chartType: 'Bar Chart', title,
      encodings: { x: { field: categoryField }, y: { field: valueField } },
      baseSize: { width: 400, height: 300 }, canvasSize: { width: 600, height: 400 },
    },
  };
}

function viewPlan(request: ReportFlintAuditRequest, viewId: string, sectionId: 'M03' | 'M04'): ReportFlintVariantPlan {
  const view = request.chartSpec.views.find(item => item.viewId === viewId);
  const blockers = sectionBlockers(section(request, sectionId), true);
  if (view === undefined) blockers.push(`CHART_SPEC_VIEW_MISSING:${viewId}`);
  if (view !== undefined && (view.state === 'BLOCKED' || view.state === 'EMPTY')) blockers.push(`CHART_SPEC_VIEW_BLOCKED:${view.state}`);
  if (view !== undefined && view.marks.length === 0) blockers.push('CHART_SPEC_VIEW_HAS_NO_MARKS');
  if (blockers.length > 0 || view === undefined) {
    return {
      variantId: sectionId === 'M03' ? 'M03_SCOPE_TOTALS_REVENUE' : 'M04_TOP_SHOP_SHARE_ALL',
      sectionId, state: 'BLOCKED', blockers: [...new Set(blockers)], chartSpecViewId: viewId,
      chartSpecId: request.chartSpec.chartSpecId, methodOutputId: null, input: null, expected: [],
    };
  }
  const marks = view.marks;
  const categoryField = sectionId === 'M03' ? 'scope' : 'tier';
  const valueField = sectionId === 'M03' ? 'value' : 'share';
  const semanticType = sectionId === 'M03' ? 'Revenue' : 'Percentage';
  const expected = marks.map((mark, index) => ({
    category: mark.categoryKey,
    valueText: mark.valueText,
    value: sectionId === 'M03' ? safeNumber(mark.valueText, `${viewId}:${index}`) : percentageNumber(mark.valueText, `${viewId}:${index}`),
    sourcePointer: mark.chartDataValuePointer,
  }));
  expected.forEach((item, index) => {
    if (item.value === null) blockers.push(`UNSAFE_NUMBER:${viewId}:${index}`);
  });
  const categories = view.axes.category.categoryOrder;
  if (new Set(expected.map(item => item.category)).size !== expected.length) blockers.push('DUPLICATE_SOURCE_CATEGORY');
  if (expected.some(item => !categories.includes(item.category))) blockers.push('SOURCE_CATEGORY_ORDER_MISMATCH');
  if (sectionId === 'M04' && (view.relationship !== 'CUMULATIVE_OVERLAPPING_NOT_DONUT' || view.axes.value.unit !== 'percent')) {
    blockers.push('M04_CUMULATIVE_CONTRACT_MISMATCH');
  }
  if (sectionId === 'M03' && (view.relationship !== 'OVERLAPPING_NON_ADDITIVE' || view.axes.value.unit !== 'VND')) {
    blockers.push('M03_REVENUE_CONTRACT_MISMATCH');
  }
  if (blockers.length > 0) {
    return {
      variantId: sectionId === 'M03' ? 'M03_SCOPE_TOTALS_REVENUE' : 'M04_TOP_SHOP_SHARE_ALL',
      sectionId, state: 'BLOCKED', blockers: [...new Set(blockers)], chartSpecViewId: viewId,
      chartSpecId: request.chartSpec.chartSpecId, methodOutputId: null, input: null, expected,
    };
  }
  const values = expected.map(item => ({ [categoryField]: item.category, [valueField]: item.value }));
  return {
    variantId: sectionId === 'M03' ? 'M03_SCOPE_TOTALS_REVENUE' : 'M04_TOP_SHOP_SHARE_ALL',
    sectionId, state: 'ELIGIBLE', blockers: view.state === 'PARTIAL' ? ['CHART_SPEC_VIEW_PARTIAL'] : [],
    chartSpecViewId: viewId, chartSpecId: request.chartSpec.chartSpecId, methodOutputId: null,
    input: baseInput(view.title, categoryField, valueField, semanticType, values), expected,
  };
}

function pointerRecord(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return undefined;
  let current: unknown = root;
  for (const segment of pointer.slice(1).split('/')) {
    const key = segment.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(key)) return undefined;
      current = current[Number(key)];
    } else {
      const object = asObject(current);
      if (object === null || !Object.prototype.hasOwnProperty.call(object, key)) return undefined;
      current = object[key];
    }
  }
  return current;
}

function m05Plans(request: ReportFlintAuditRequest): ReportFlintVariantPlan[] {
  const methods = request.descriptiveMethods;
  if (methods === undefined) return [];
  const pin = section(request, 'M05');
  const rootBlockers = sectionBlockers(pin, false);
  if (rootBlockers.length > 0) return [];
  return methods.sections.M05.partitions.map((partition, partitionIndex) => {
    const blockers = [...rootBlockers];
    const records = partition.recordPointers.map(pointer => pointerRecord(methods, pointer));
    if (partition.unit === null || partition.period === null) blockers.push('M05_UNIT_OR_PERIOD_MISSING');
    if (records.some(record => record === undefined || record === null)) blockers.push('M05_RECORD_POINTER_UNRESOLVED');
    const rows = records.map((record, index) => {
      const item = asObject(record);
      const observation = asObject(item?.observation);
      const label = typeof item?.entityLabel === 'string' && item.entityLabel.trim().length > 0 ? item.entityLabel : null;
      if (label === null) blockers.push(`M05_ENTITY_LABEL_MISSING:${index}`);
      const valueText = observation?.state === 'observed_zero' ? '0' : observation?.value;
      if (label === null || typeof valueText !== 'string' || (observation?.state !== 'observed_zero' && observation?.state !== 'observed_value') || observation?.precision !== 'exact') {
        blockers.push(`M05_NON_DRAWABLE_RECORD:${index}`);
        return null;
      }
      const value = safeNumber(valueText, `M05:${partitionIndex}:${index}`);
      if (value === null) blockers.push(`UNSAFE_NUMBER:M05:${partitionIndex}:${index}`);
      return { category: label, valueText, value, sourcePointer: partition.recordPointers[index]! };
    }).filter((item): item is FlintExpectedDatum => item !== null);
    if (rows.length < 2) blockers.push('M05_NEEDS_TWO_EXACT_OBSERVATIONS');
    if (new Set(rows.map(row => row.category)).size !== rows.length) blockers.push('M05_DUPLICATE_CATEGORY');
    const variantId = `M05_PARTITION_${partitionIndex}`;
    if (blockers.length > 0) return {
      variantId, sectionId: 'M05', state: 'BLOCKED', blockers: [...new Set(blockers)], chartSpecViewId: null,
      chartSpecId: null, methodOutputId: methods.methodOutputId, input: null, expected: rows,
    };
    const input = baseInput(
      `M05 · ${partition.measureLiteral}`,
      'observation', 'value', 'Quantity', rows.map(row => ({ observation: row.category, value: row.value })),
    );
    return {
      variantId, sectionId: 'M05', state: 'ELIGIBLE', blockers: [], chartSpecViewId: null, chartSpecId: null,
      methodOutputId: methods.methodOutputId, input, expected: rows,
    };
  });
}

function parseJsonBytes(bytes: Uint8Array, label: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new TypeError(`Flint audit: ${label} is not valid UTF-8 JSON`); }
}

function assertChartResultPins(value: unknown, expected: string, path = 'chartData'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertChartResultPins(item, expected, `${path}[${index}]`));
    return;
  }
  const object = asObject(value);
  if (object === null) return;
  if (Object.prototype.hasOwnProperty.call(object, 'resultSha256') && object.resultSha256 !== expected) {
    throw new TypeError(`Flint audit: ${path}.resultSha256 does not pin metric result`);
  }
  for (const [key, child] of Object.entries(object)) assertChartResultPins(child, expected, `${path}.${key}`);
}

/** Builds only chart inputs. It never invokes Flint or modifies the historical report. */
export function buildReportFlintVariants(request: ReportFlintAuditRequest): {
  readonly sections: readonly ReportFlintSectionPin[];
  readonly variants: readonly ReportFlintVariantPlan[];
} {
  validateRequestIdentity(request);
  const variants = [
    viewPlan(request, 'scope-totals-revenue', 'M03'),
    viewPlan(request, 'top-shop-share-all', 'M04'),
    ...m05Plans(request),
  ];
  return { sections: request.sections, variants };
}

function validateRequestIdentity(request: ReportFlintAuditRequest): void {
  for (const [label, value] of Object.entries(request.sourcePins)) {
    if (label === 'assemblySha256' || label === 'readinessSha256' || label === 'descriptiveMethodOutputId') assertDigestOrNull(value as string | null, label);
    else assertDigest(value as string, label);
  }
  if (!sameBytes(request.chartDataBytes, bytesOf(request.chartData)) || digest(request.chartDataBytes) !== request.sourcePins.chartDataSha256) {
    throw new TypeError('Flint audit: chart data bytes or digest mismatch');
  }
  if (!sameBytes(request.chartSpecBytes, bytesOf(request.chartSpec)) || digest(request.chartSpecBytes) !== request.sourcePins.chartSpecSha256) {
    throw new TypeError('Flint audit: chart spec bytes or digest mismatch');
  }
  const normalizedInputBytes = Buffer.from(request.normalizedInputBytes);
  const metricResultBytes = Buffer.from(request.metricResultBytes);
  const catalogBytes = Buffer.from(request.catalogBytes);
  const packetBytes = Buffer.from(request.packetBytes);
  if (digest(normalizedInputBytes) !== request.sourcePins.normalizedInputArtifactSha256 ||
      digest(metricResultBytes) !== request.sourcePins.metricResultSha256 ||
      digest(catalogBytes) !== request.sourcePins.catalogSha256 ||
      digest(packetBytes) !== request.sourcePins.packetSha256) {
    throw new TypeError('Flint audit: retained provenance bytes do not match source pins');
  }
  const normalizedInput = parseJsonBytes(normalizedInputBytes, 'normalized input');
  const metricResult = parseJsonBytes(metricResultBytes, 'metric result');
  const catalog = parseJsonBytes(catalogBytes, 'catalog');
  const packet = parseJsonBytes(packetBytes, 'packet');
  if (!sameBytes(normalizedInputBytes, Buffer.from(`${canonicalJson(normalizedInput)}\n`, 'utf8'))) {
    throw new TypeError('Flint audit: normalized input bytes are not canonical');
  }
  const metricResultObject = asObject(metricResult);
  if (metricResultObject === null || canonicalJson(metricResultObject.input) !== canonicalJson(normalizedInput) ||
      metricResultObject.inputSha256 !== request.sourcePins.normalizedInputValueSha256 ||
      digest(Buffer.from(canonicalJson(normalizedInput), 'utf8')) !== request.sourcePins.normalizedInputValueSha256) {
    throw new TypeError('Flint audit: metric result input does not pin normalized input');
  }
  const packetObject = asObject(packet);
  if (packetObject === null || packetObject.metricResultSha256 !== request.sourcePins.metricResultSha256 ||
      packetObject.catalogSha256 !== request.sourcePins.catalogSha256 ||
      packetObject.inputSha256 !== request.sourcePins.normalizedInputValueSha256) {
    throw new TypeError('Flint audit: packet provenance does not pin result/catalog/normalized input');
  }
  const methodArtifacts = asArray(packetObject.sections).flatMap(sectionValue => {
    const section = asObject(sectionValue);
    const methodArtifact = asObject(section?.methodArtifact);
    if (methodArtifact === null) return [];
    const catalogSection = asArray(asObject(catalog)?.sections).find(candidate => asObject(candidate)?.sectionId === section?.sectionId);
    const methodVersion = asObject(catalogSection)?.methodVersion;
    if (typeof section?.sectionId !== 'string' || typeof methodArtifact.fileName !== 'string' ||
        typeof methodArtifact.sha256 !== 'string' || typeof methodArtifact.methodOutputId !== 'string' ||
        methodVersion !== '2.0.0') {
      throw new TypeError('Flint audit: packet method artifact is malformed');
    }
    return [{
      sectionId: section.sectionId, methodVersion, fileName: methodArtifact.fileName,
      sha256: methodArtifact.sha256, methodOutputId: methodArtifact.methodOutputId,
    } as ReportMethodArtifact];
  });
  const rebuilt = createResearchReportPacket(
    metricResultBytes, request.sourcePins.metricResultSha256, catalogBytes, request.sourcePins.catalogSha256, methodArtifacts,
  );
  const rebuiltPacketBytes = Buffer.from(`${canonicalJson(rebuilt.packet)}\n`, 'utf8');
  if (!sameBytes(packetBytes, rebuiltPacketBytes)) throw new TypeError('Flint audit: packet is not a deterministic result/catalog replay');
  if (request.chartData.resultSha256 !== request.sourcePins.metricResultSha256 ||
      request.chartData.catalogSha256 !== request.sourcePins.catalogSha256 ||
      request.chartData.computation.inputSha256 !== request.sourcePins.normalizedInputValueSha256) {
    throw new TypeError('Flint audit: chart data provenance does not pin result/catalog/normalized input');
  }
  const rebuiltChartData = buildResearchReportChartData(
    metricResultBytes, request.sourcePins.metricResultSha256, catalogBytes, request.sourcePins.catalogSha256,
  );
  if (!sameBytes(request.chartDataBytes, bytesOf(rebuiltChartData))) {
    throw new TypeError('Flint audit: chart data is not a deterministic result/catalog replay');
  }
  assertChartResultPins(request.chartData, request.sourcePins.metricResultSha256);
  verifyResearchChartSpec(request.chartSpec, request.chartData, Buffer.from(request.chartDataBytes));
  if (request.chartSpec.chartDataSha256 !== request.sourcePins.chartDataSha256) throw new TypeError('Flint audit: chart spec does not pin chart data');
  if (request.descriptiveMethods !== undefined) {
    if (request.sourcePins.descriptiveMethodOutputId !== request.descriptiveMethods.methodOutputId) {
      throw new TypeError('Flint audit: descriptive method output identity mismatch');
    }
    const descriptiveInput = asObject(request.descriptiveMethods.input);
    const descriptiveSourcePackage = asObject(descriptiveInput?.sourcePackage);
    if (descriptiveSourcePackage === null ||
        descriptiveSourcePackage.manifestArtifactSha256 !== request.sourcePins.sourcePackageManifestSha256 ||
        descriptiveSourcePackage.packageContentSha256 !== request.sourcePins.sourcePackageContentSha256) {
      throw new TypeError('Flint audit: descriptive method source package identity mismatch');
    }
    const verified = verifyDescriptiveMarketMethods(request.descriptiveMethods).output;
    if (canonicalJson(verified) !== canonicalJson(request.descriptiveMethods)) {
      throw new TypeError('Flint audit: descriptive method output does not replay');
    }
  }
  for (const sectionPin of request.sections) {
    if (!SECTION_IDS.includes(sectionPin.sectionId as FlintSectionId)) continue;
    assertDigestOrNull(sectionPin.sectionSha256, `section:${sectionPin.sectionId}`);
  }
}

function warningsFrom(output: unknown): FlintWarning[] {
  const object = asObject(output);
  return asArray(object?._warnings).flatMap(item => {
    const warning = asObject(item);
    return warning === null ? [] : [{
      ...(typeof warning.severity === 'string' ? { severity: warning.severity } : {}),
      ...(typeof warning.code === 'string' ? { code: warning.code } : {}),
      ...(typeof warning.message === 'string' ? { message: warning.message } : {}),
      ...(typeof warning.channel === 'string' ? { channel: warning.channel } : {}),
      ...(typeof warning.field === 'string' ? { field: warning.field } : {}),
    }];
  });
}

function aggregationDetected(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(aggregationDetected);
  const object = asObject(value);
  if (object === null) return false;
  for (const [key, child] of Object.entries(object)) {
    if (key === 'aggregate' && child !== null && child !== false && child !== '') return true;
    if (key === 'stack' && child !== null && child !== false && child !== '') return true;
    if (aggregationDetected(child)) return true;
  }
  return false;
}

interface OutputDatum { readonly category: string; readonly value: number | null }

function outputNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  const object = asObject(value);
  if (object !== null && 'value' in object) return outputNumber(object.value);
  return null;
}

function outputData(output: unknown, categoryField: string, valueField: string): OutputDatum[] {
  const object = asObject(output);
  if (object === null) return [];
  const data = asObject(object.data);
  if (data !== null && Array.isArray(data.values)) {
    return data.values.flatMap(item => {
      const row = asObject(item);
      if (row === null || typeof row[categoryField] !== 'string') return [];
      const raw = row[valueField];
      return [{ category: row[categoryField] as string, value: outputNumber(raw) }];
    });
  }
  const xAxis = asObject(object.xAxis);
  const series = asArray(object.series);
  const firstSeries = asObject(series[0]);
  const axisCategories = xAxis === null ? [] : asArray(xAxis.data);
  const seriesValues = firstSeries === null ? [] : asArray(firstSeries.data);
  if (axisCategories.length > 0 && firstSeries !== null && seriesValues.length > 0) {
    return axisCategories.flatMap((category, index) => typeof category === 'string' ? [{
      category, value: outputNumber(seriesValues[index]),
    }] : []);
  }
  if (data !== null && Array.isArray(data.labels)) {
    const datasets = asArray(data.datasets);
    const dataset = asObject(datasets[0]);
    const datasetValues = dataset === null ? [] : asArray(dataset.data);
    return data.labels.flatMap((category, index) => {
      if (typeof category !== 'string' || dataset === null || datasetValues.length === 0) return [];
      const raw = datasetValues[index];
      return [{ category, value: outputNumber(raw) }];
    });
  }
  if (Array.isArray(object.data)) {
    return object.data.flatMap(traceValue => {
      const trace = asObject(traceValue);
      const traceCategories = trace === null ? [] : asArray(trace.x);
      const traceValues = trace === null ? [] : asArray(trace.y);
      if (trace === null || traceCategories.length === 0 || traceValues.length === 0) return [];
      return traceCategories.flatMap((category, index) => typeof category === 'string' ? [{
        category, value: outputNumber(traceValues[index]),
      }] : []);
    });
  }
  return [];
}

interface DeclarativeOutputNormalization {
  readonly value: unknown;
  readonly error: string | null;
}

/**
 * Flint's Vega-Lite adapter can leave optional object properties undefined.
 * Omit those properties exactly as declarative JSON serialization does, while
 * keeping undefined array/root values and executable callbacks unsupported.
 * No callback is invoked and no runtime object is represented as source code.
 */
function normalizeDeclarativeOutput(
  value: unknown,
  objectProperty = false,
  stack = new Set<object>(),
): DeclarativeOutputNormalization {
  if (value === undefined) {
    return objectProperty ? { value: undefined, error: null } : { value: null, error: 'UNSUPPORTED_UNDEFINED_OUTPUT' };
  }
  if (typeof value === 'function') return { value: null, error: 'UNSUPPORTED_CALLBACK_OUTPUT' };
  if (typeof value === 'bigint' || typeof value === 'symbol') return { value: null, error: 'UNSUPPORTED_NON_JSON_OUTPUT' };
  if (typeof value === 'number' && !Number.isFinite(value)) return { value: null, error: 'UNSUPPORTED_NON_FINITE_NUMBER' };
  if (value === null || typeof value !== 'object') return { value, error: null };
  if (stack.has(value)) return { value: null, error: 'UNSUPPORTED_CIRCULAR_OUTPUT' };
  stack.add(value);
  if (Array.isArray(value)) {
    const normalized: unknown[] = [];
    for (const item of value) {
      const child = normalizeDeclarativeOutput(item, false, stack);
      if (child.error !== null) return child;
      normalized.push(child.value);
    }
    stack.delete(value);
    return { value: normalized, error: null };
  }
  const normalized: Record<string, unknown> = {};
  for (const [key, childValue] of Object.entries(value)) {
    const child = normalizeDeclarativeOutput(childValue, true, stack);
    if (child.error !== null) return child;
    if (child.value !== undefined) normalized[key] = child.value;
  }
  stack.delete(value);
  return { value: normalized, error: null };
}

function backendAudit(
  output: unknown,
  expected: readonly FlintExpectedDatum[],
  categoryField: string,
  valueField: string,
): BackendAudit {
  const normalized = normalizeDeclarativeOutput(output);
  if (normalized.error !== null) {
    return {
      state: 'UNSUPPORTED', outputSha256: null, warnings: warningsFrom(output), missingCategories: [], extraCategories: [],
      duplicateCategories: [], valueMismatches: [], aggregationDetected: false, output: null, error: normalized.error,
    };
  }
  const declarativeOutput = normalized.value;
  const warnings = warningsFrom(declarativeOutput);
  // The authored x/y fields identify the one semantic pair for this variant.
  // Trying every possible field pair makes an ECharts/ChartJS/Plotly output
  // appear to contain the same categories two or three times.
  const data = outputData(declarativeOutput, categoryField, valueField);
  const byCategory = new Map<string, OutputDatum>();
  const duplicateCategories: string[] = [];
  for (const datum of data) {
    if (byCategory.has(datum.category)) duplicateCategories.push(datum.category);
    else byCategory.set(datum.category, datum);
  }
  const expectedCategories = expected.map(item => item.category);
  const missingCategories = expectedCategories.filter(category => !byCategory.has(category));
  const extraCategories = [...byCategory.keys()].filter(category => !expectedCategories.includes(category));
  const valueMismatches = expected.flatMap(item => {
    const actual = byCategory.get(item.category)?.value;
    return item.value !== null && actual !== undefined && (actual === null || !Number.isFinite(actual) || normalizeDecimal(String(actual)) !== normalizeDecimal(String(item.value)))
      ? [item.category] : [];
  });
  const aggregation = aggregationDetected(declarativeOutput);
  const overflow = warnings.some(warning => warning.code === 'overflow' || (warning.message ?? '').includes('omitted'));
  const state = !output || data.length === 0 || missingCategories.length > 0 || extraCategories.length > 0 || duplicateCategories.length > 0
    || valueMismatches.length > 0 || overflow || aggregation ? 'REJECTED' as const : 'PASS' as const;
  return {
    state, outputSha256: declarativeOutput === null ? null : digest(bytesOf(declarativeOutput)), warnings,
    missingCategories, extraCategories, duplicateCategories, valueMismatches, aggregationDetected: aggregation,
    output: declarativeOutput, error: null,
  };
}

function runBackend(
  assembler: (input: FlintAssemblyInput) => unknown,
  input: FlintAssemblyInput,
  expected: readonly FlintExpectedDatum[],
): BackendAudit {
  try {
    return backendAudit(
      assembler(input), expected, input.chart_spec.encodings.x.field, input.chart_spec.encodings.y.field,
    );
  }
  catch (error) {
    return {
      state: 'REJECTED', outputSha256: null, warnings: [], missingCategories: [], extraCategories: [], duplicateCategories: [],
      valueMismatches: [], aggregationDetected: false, output: null, error: error instanceof Error ? error.message : String(error),
    };
  }
}

function runtimePin(runtime: FlintRuntimeInput): FlintRuntimeReceipt {
  if (runtime.name !== FLINT_PACKAGE.name) throw new TypeError('Flint audit: UNSUPPORTED_PACKAGE');
  if (runtime.version !== FLINT_PACKAGE.version) throw new TypeError('Flint audit: UNSUPPORTED_VERSION');
  if (runtime?.npmGitHead !== undefined && runtime.npmGitHead !== FLINT_PACKAGE.npmGitHead) throw new TypeError('Flint audit: UNSUPPORTED_GIT_HEAD');
  const npmGitHead = runtime?.npmGitHead ?? null;
  const gitHeadVerification = runtime?.gitHeadVerification ?? (npmGitHead === null ? 'NOT_PRESENT' : 'VERIFIED');
  if ((gitHeadVerification === 'VERIFIED') !== (npmGitHead !== null)) {
    throw new TypeError('Flint audit: GIT_HEAD_VERIFICATION_MISMATCH');
  }
  return {
    name: FLINT_PACKAGE.name, version: FLINT_PACKAGE.version, npmGitHead, gitHeadVerification,
  };
}

/**
 * Compiles eligible authoring inputs and records a receipt separate from the
 * historical report. Compiler success is deliberately not business-method
 * correctness; backend warnings and data loss are fail-closed here.
 */
export function auditReportFlint(request: ReportFlintAuditRequest, assemblers: FlintAssemblerSet): ReportFlintAuditResult {
  const built = buildReportFlintVariants(request);
  const runtime = runtimePin(assemblers.runtime);
  const variants = built.variants.map(plan => {
    if (plan.state === 'BLOCKED' || plan.input === null) return {
      variantId: plan.variantId, sectionId: plan.sectionId, state: 'BLOCKED' as const,
      blockers: plan.blockers, chartSpecViewId: plan.chartSpecViewId, chartSpecId: plan.chartSpecId,
      methodOutputId: plan.methodOutputId, inputSha256: null, expected: plan.expected, backends: {},
    };
    const inputSha256 = digest(bytesOf(plan.input));
    const backendResults: Partial<Record<FlintBackend, BackendAudit>> = {
      vegaLite: runBackend(assemblers.assembleVegaLite, plan.input, plan.expected),
      echarts: runBackend(assemblers.assembleECharts, plan.input, plan.expected),
      chartjs: runBackend(assemblers.assembleChartjs, plan.input, plan.expected),
      plotly: runBackend(assemblers.assemblePlotly, plan.input, plan.expected),
    };
    const rejected = Object.values(backendResults).some(result => result?.state === 'REJECTED');
    const supported = Object.values(backendResults).some(result => result?.state === 'PASS');
    return {
      variantId: plan.variantId, sectionId: plan.sectionId,
      state: rejected || !supported ? 'REJECTED' as const : 'COMPILED' as const,
      blockers: plan.blockers, chartSpecViewId: plan.chartSpecViewId, chartSpecId: plan.chartSpecId,
      methodOutputId: plan.methodOutputId, inputSha256, expected: plan.expected, backends: backendResults,
    };
  });
  const status = variants.some(item => item.state === 'REJECTED') ? 'REJECTED' as const
    : variants.some(item => item.state === 'COMPILED') ? 'PASS' as const : 'BLOCKED' as const;
  const receipt: ReportFlintAuditReceipt = {
    contractVersion: '1.0.0', auditProfile: REPORT_FLINT_AUDIT_PROFILE, runtime, providerCalls: 0,
    inputs: {
      ...request.sourcePins, chartDataContractVersion: request.chartData.contractVersion,
      chartSpecContractVersion: request.chartSpec.contractVersion, chartSpecId: request.chartSpec.chartSpecId,
    },
    sections: request.sections, variants, status,
    interpretationBoundary: 'Flint assembles deterministic visualization specifications and reports layout overflow. It does not establish denominator validity, causal meaning, population representativeness, or whether a TDN section should be a chart.',
    limitations: [
      'COMPILER_SUCCESS_IS_NOT_BUSINESS_METHOD_CORRECTNESS',
      'BLOCKED_SECTIONS_NEVER_CALL_FLINT',
      'OVERFLOW_LOST_CATEGORIES_AND_IMPLICIT_AGGREGATION_REJECT_THE_VARIANT',
      'EXACT_DECIMAL_TEXT_MUST_ROUND_TRIP_TO_SAFE_NUMBER_OR_THE_VARIANT_IS_BLOCKED',
      'M03_AND_M04_REUSE_EXISTING_CHART_SPEC_MARKS;_M05_IS_CONDITIONAL_PARTITION_OBSERVATION_ONLY',
      'OPTIONAL_UNDEFINED_OBJECT_PROPERTIES_ARE_OMITTED_FOR_DECLARATIVE_JSON;_CALLBACKS_ARE_NOT_EXECUTED',
      'UNSUPPORTED_NON_DECLARATIVE_BACKENDS_ARE_REPORTED_WITHOUT_INVALIDATING_SUPPORTED_DECLARATIVE_BACKENDS',
      'RECEIPT_IS_ADDITIVE_AND_NEVER_REPLACES_HISTORICAL_REPORT_BYTES',
    ],
  };
  return { receipt, bytes: bytesOf(receipt) };
}

/** Converts the verified assembly snapshot into the small readiness pins used by the audit. */
export function reportFlintSectionsFromAssemblySnapshot(snapshot: ReportAssemblySnapshot): readonly ReportFlintSectionPin[] {
  return snapshot.sections.filter(section => SECTION_IDS.includes(section.sectionId as FlintSectionId)).map(section => ({
    sectionId: section.sectionId, readinessState: section.readiness.state, deliveryState: section.materialization.deliveryState,
    materialized: section.materialization.materialized, sectionSha256: section.materialization.sectionSha256,
    // Materialization blockers such as FULL_SECTION_METHOD_NOT_IMPLEMENTED
    // describe why the report is partial, not why an already-materialized
    // deterministic chart must be suppressed. Only readiness blockers (and a
    // genuinely BLOCKED delivery state) gate the compiler.
    blockers: [...section.readiness.blockingCodes, ...(section.materialization.deliveryState === 'BLOCKED' ? section.materialization.blockers : [])],
  }));
}

/** Builds a request from the existing source-backed output and assembly receipt. */
export function reportFlintRequestFromBundle(
  bundle: SourceBackedReportBundle,
  snapshot: ReportAssemblySnapshot,
  descriptiveMethods?: DescriptiveMarketMethods,
): ReportFlintAuditRequest {
  const chartDataBytes = bundle.files.get('charts.json');
  const chartSpecBytes = bundle.files.get('chart-spec.json');
  const normalizedInputBytes = bundle.files.get('normalized-input.json');
  const metricResultBytes = bundle.files.get('metric-result.json');
  const catalogBytes = bundle.files.get('section-catalog.json');
  const packetBytes = bundle.files.get('packet.json');
  if (chartDataBytes === undefined || chartSpecBytes === undefined || normalizedInputBytes === undefined ||
      metricResultBytes === undefined || catalogBytes === undefined || packetBytes === undefined) {
    throw new TypeError('Flint audit: retained provenance or chart files missing from source-backed bundle');
  }
  const artifact = bundle.envelope.artifacts;
  const sourcePins: ReportFlintSourcePins = {
    workspaceSnapshotSha256: artifact.workspaceSnapshotSha256,
    sourcePackageManifestSha256: artifact.sourcePackageManifestSha256,
    sourcePackageContentSha256: bundle.envelope.sourcePackage.packageContentSha256,
    normalizedInputArtifactSha256: artifact.normalizedInputSha256,
    normalizedInputValueSha256: bundle.receipt.inputSha256,
    metricResultSha256: artifact.metricResultSha256,
    catalogSha256: artifact.catalogSha256,
    packetSha256: artifact.packetSha256,
    chartDataSha256: artifact.chartSha256,
    chartSpecSha256: artifact.chartSpecSha256,
    assemblySha256: snapshot.assemblySha256,
    readinessSha256: snapshot.readinessSha256,
    descriptiveMethodOutputId: descriptiveMethods?.methodOutputId ?? null,
  };
  const base: ReportFlintAuditRequest = {
    chartData: bundle.charts, chartDataBytes, chartSpec: bundle.chartSpec, chartSpecBytes,
    normalizedInputBytes, metricResultBytes, catalogBytes, packetBytes,
    sourcePins, sections: reportFlintSectionsFromAssemblySnapshot(snapshot),
  };
  return descriptiveMethods === undefined ? base : { ...base, descriptiveMethods };
}
