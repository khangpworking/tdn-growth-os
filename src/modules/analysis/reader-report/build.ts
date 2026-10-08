import { createRequire } from 'node:module';
import inputSchema from '../../../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import defaultPeerSchema from '../../../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../../platform/artifacts/index.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { MetricWebFacts } from '../research-automation/metric-web-facts.js';
import { Bundle, type HardcodedNumber, type Narrator } from './bundle.js';
import { classify, profileRe, type Profile, type NullableRow as Row, type LegacyRow } from './classify.js';
import { computeNullableReaderMetrics } from './nullable-metrics.js';
import { readerDefaultPeers } from './default-peers.js';
import type { DefaultMarketPeers } from '../../../../contracts/analysis/default-market-peers.generated.js';
import { READER_SECTION_ANCHORS } from './layout.js';
import { lint, type LintResult } from './lint.js';
import { scopeMetrics, type Scope } from './scope-metrics.js';
import {
  checkDerivedSource,
  deriveReaderSource,
  reconcileWebWithRows,
  setWebBundleKeys,
  verifyWebSnapshot,
  type WebReconciliationWarning,
} from './web-facts.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(defaultPeerSchema);
const validateInput = ajv.compile<ReaderReportInput>(inputSchema);
const validateProfile = ajv.getSchema<ReaderReportInput['profile']>(`${inputSchema.$id}#/$defs/profile`)!;

export type ReaderPlatform = ReaderReportInput['platforms'][number];
export class ReaderReportInputError extends Error {}
export class ReaderReportGateError extends Error {
  constructor(message: string, readonly lint: LintResult[], readonly hardcoded: HardcodedNumber[], readonly notInBundle: { where: string; t: string }[]) {
    super(message);
  }
}

const fail = (msg: string): never => { throw new ReaderReportInputError(msg); };
const shapeErrors = (errors: readonly { instancePath: string; message?: string }[] | null | undefined): string =>
  (errors ?? []).slice(0, 5).map(e => `${e.instancePath || '/'} ${e.message ?? ''}`).join('; ');

/** Profile schema plus its cross-field rules; shared by the full input check and the stored profile asset. */
export function verifyReaderProfile(value: unknown): ReaderReportInput['profile'] {
  if (!validateProfile(value)) fail(`profile bản đọc sai khuôn: ${shapeErrors(validateProfile.errors)}`);
  const p = value as ReaderReportInput['profile'];
  const segs = new Set(Object.keys(p.segments));
  for (const k of [...p.core, ...p.non, ...p.rules.map(r => r.seg)]) if (!segs.has(k)) fail(`nhóm ${k} chưa khai báo trong profile`);
  if (p.core.some(k => p.non.includes(k))) fail('một nhóm vừa là lõi vừa là ngoài lõi');
  const patterns = [p.stripBeforePrimary, p.measure?.re, p.benchmark?.titleRe, p.benchmark?.excludeRe,
    ...Object.values(p.primaryNouns ?? {}), ...p.signals.flat(), ...p.rules.flatMap(r => conditionPatterns(r.when))];
  for (const s of patterns) if (s !== undefined) { try { profileRe(s); } catch { fail(`mẫu chữ không hợp lệ: ${s}`); } }
  if (p.signals.some(x => x.length !== 2)) fail('mỗi tín hiệu cần đúng nhãn và mẫu chữ');
  return p;
}

/** Schema plus the cross-field rules a JSON schema cannot express. */
export function verifyReaderReportInput(value: unknown): ReaderReportInput {
  if (typeof value === 'object' && value !== null && 'contractVersion' in value && value.contractVersion === '1.0.0' &&
    ('webSnapshot' in value || 'webSnapshotSha256' in value || 'rowLineage' in value)) {
    fail('webSnapshot và nguồn dòng chỉ dùng với contractVersion 1.1.0');
  }
  if (!validateInput(value)) throw new ReaderReportInputError(`đầu vào bản đọc sai khuôn: ${shapeErrors(validateInput.errors)}`);
  const input = value;
  if (input.contractVersion === '1.0.0') {
    if (input.webSnapshot !== undefined || input.webSnapshotSha256 !== undefined) {
      fail('webSnapshot chỉ dùng với contractVersion 1.1.0');
    }
    const source = input.source;
    if (source === undefined) throw new ReaderReportInputError('thiếu nguồn số liệu của bản đọc');
    return checkRowsAndSource(input, source);
  }
  if ((input.contractVersion === '1.2.0' || input.contractVersion === '1.3.0') && input.webSnapshot === undefined) {
    if (input.webSnapshotSha256 !== undefined) fail('thiếu webSnapshot');
    if (input.source === undefined) fail('thiếu nguồn số liệu của bản đọc');
    return checkRowsAndSource(input, input.source!);
  }
  if (input.webSnapshot === undefined || input.webSnapshotSha256 === undefined) {
    fail('đầu vào 1.1.0 thiếu webSnapshot hoặc webSnapshotSha256');
  }
  const facts = verifyWebSnapshot(input.webSnapshot, input.webSnapshotSha256);
  const rowCap = input.source?.rowCap ?? input.rows.length;
  const derived = deriveReaderSource(facts, rowCap, { nullable: input.contractVersion === '1.2.0' || input.contractVersion === '1.3.0' });
  if (input.source !== undefined) checkDerivedSource(input.source, derived);
  return checkRowsAndSource({ ...input, source: derived }, derived);
}

/** Row/platform/period/rowCap rules shared by both contract versions. */
function checkRowsAndSource(
  input: ReaderReportInput,
  source: NonNullable<ReaderReportInput['source']>,
): ReaderReportInput {
  const { platforms, rows } = input;
  verifyReaderProfile(input.profile);
  const ids = new Set<number>();
  for (const r of rows) {
    if (ids.has(r.i)) fail(`dòng ${r.i} lặp số thứ tự`);
    ids.add(r.i);
    if (!platforms.includes(r.platform)) fail(`dòng ${r.i} thuộc sàn ${r.platform} không có trong danh sách sàn`);
  }
  for (const P of platforms) {
    if (!rows.some(r => r.platform === P)) fail(`sàn ${P} không có dòng nào`);
    if (!source.platformBreakdown[P]) fail(`thiếu số màn hình nguồn của sàn ${P}`);
  }
  if (source.measurementPeriod.start > source.measurementPeriod.end) fail('kỳ đo có ngày bắt đầu sau ngày kết thúc');
  if (rows.length > source.rowCap) fail('số dòng vượt giới hạn tải của nguồn');
  return { ...input, source };
}

function conditionPatterns(c: ReaderReportInput['profile']['rules'][number]['when']): string[] {
  return [c.titleRe, c.notTitleRe, ...(c.any ?? []).flatMap(conditionPatterns)].filter((s): s is string => s !== undefined);
}

export type ReaderReportData = {
  input: ReaderReportInput; profile: Profile; rows: Row[]; bundle: Bundle;
  scopes: Partial<Record<ReaderPlatform, Scope>>; ruleHits: Record<number, number>;
  /** Normalised web facts; null for 1.0.0 inputs without a snapshot. */
  webFacts: MetricWebFacts | null;
  /** Web bundle ids set from the snapshot, in deterministic order. */
  webKeys: string[];
  /** R1–R4 reconciliation warnings between the xlsx rows and the snapshot. */
  webReconciliation: WebReconciliationWarning[];
  defaultMarketPeers: DefaultMarketPeers | null;
};

/**
 * Classifies rows and computes versioned metrics. New inputs keep platform
 * scopes separate; historical inputs retain their original "both.*" arithmetic.
 * "src.*" states how much of the displayed source the exported rows cover.
 */
export function computeReaderReportData(value: unknown): ReaderReportData {
  const input = verifyReaderReportInput(value);
  const { brandAlias, ...rest } = input.profile;
  const profile: Profile = { ...rest, signals: rest.signals.map(([label = '', re = '']) => [label, re] as [string, string]) } as Profile;
  const rows: Row[] = input.rows.map(r => ({ ...r }));
  for (const r of rows) {
    const alias = brandAlias?.[r.brand.toLowerCase()];
    if (alias) r.brand = alias;
  }
  const ruleHits = classify(rows, profile);
  const B = new Bundle();
  const scopes: Partial<Record<ReaderPlatform, Scope>> = {};
  if (input.contractVersion === '1.2.0' || input.contractVersion === '1.3.0') {
    const completePositive = rows.every(row => row.rev !== null && row.rev > 0 && row.units !== null && row.units > 0 && row.asp !== null) && input.platforms.every(P => {
      const core = rows.filter(row => row.platform === P && profile.core.includes(row.seg!));
      return core.length > 0 && core.reduce((s, row) => s + row.rev!, 0) > 0 && core.reduce((s, row) => s + row.units!, 0) > 0;
    });
    if (completePositive) for (const P of input.platforms) scopes[P] = scopeMetrics(B, P, rows.filter(row => row.platform === P) as LegacyRow[], profile);
    computeNullableReaderMetrics(B, input, rows, profile);
    for (const [key, value, fmt] of [['src.hl.rev', input.source!.displayedHeadlines.revenueVnd, 'ty1'], ['src.hl.listings', input.source!.displayedHeadlines.soldListings, 'num'], ['src.hl.shops', input.source!.displayedHeadlines.shops, 'num'], ['src.hl.units', input.source!.displayedHeadlines.units, 'num'], ['src.rowCap', input.source!.rowCap, 'num']] as const) {
      if (value === null) B.setMissing(key, fmt); else B.set(key, value, fmt);
    }
    B.setMissing('src.cover.rev', 'pct0'); B.setMissing('src.cover.listings', 'pct0');
    for (const P of input.platforms) B.set(`src.${P}.rows`, rows.filter(row => row.platform === P).length, 'num');
    const webFacts = input.webSnapshot === undefined ? null : verifyWebSnapshot(input.webSnapshot, input.webSnapshotSha256);
    return { input, profile, rows, bundle: B, scopes, ruleHits, webFacts, webKeys: webFacts === null ? [] : setWebBundleKeys(B, webFacts), webReconciliation: webFacts === null ? [] : reconcileWebWithRows(webFacts, rows, { perPlatformOnly: true }), defaultMarketPeers: readerDefaultPeers(input, rows) };
  }
  for (const P of input.platforms) scopes[P] = scopeMetrics(B, P, rows.filter(r => r.platform === P) as LegacyRow[], profile);

  const both = input.platforms.map(P => scopes[P]!);
  if (both.length === 2) {
    const [a, b] = both as [Scope, Scope];
    B.set('both.all.rev', a.total + b.total, 'ty'); B.set('both.all.n', rows.length, 'num');
    B.set('both.core.rev', a.cr + b.cr, 'ty'); B.set('both.core.units', a.cu + b.cu, 'num');
    B.set('both.core.n', a.core.length + b.core.length, 'num');
    B.set('both.non.n', rows.length - B.v('both.core.n'), 'num');
    B.set('both.non.rev', B.v('both.all.rev') - B.v('both.core.rev'), 'ty');
    B.set('both.non.share', 100 * B.v('both.non.rev') / B.v('both.all.rev'), 'pct0');
  }
  B.set('both.minRev', Math.min(...rows.map(r => r.rev!)), 'tr');

  const src = input.source;
  if (src === undefined) throw new ReaderReportInputError('thiếu nguồn số liệu của bản đọc');
  const { displayedHeadlines: hl, platformBreakdown: pb, rowCap } = src as typeof src & { displayedHeadlines: { revenueVnd: number; soldListings: number; shops: number; units: number }; platformBreakdown: Partial<Record<ReaderPlatform, { displayedRevenueVnd: number }>> };
  B.set('src.hl.rev', hl.revenueVnd, 'ty1'); B.set('src.hl.listings', hl.soldListings, 'num');
  B.set('src.hl.shops', hl.shops, 'num'); B.set('src.hl.units', hl.units, 'num');
  B.set('src.rows', rows.length, 'num'); B.set('src.rowCap', rowCap, 'num');
  B.set('src.cover.listings', 100 * rows.length / hl.soldListings, 'pct0');
  B.set('src.cover.rev', 100 * rows.reduce((s, r) => s + r.rev!, 0) / hl.revenueVnd, 'pct0');
  for (const P of input.platforms) {
    B.set(`src.hl.${P}.rev`, pb[P]!.displayedRevenueVnd, 'ty1');
    B.set(`src.${P}.rows`, rows.filter(r => r.platform === P).length, 'num');
    B.set(`src.${P}.cover`, 100 * scopes[P]!.total / pb[P]!.displayedRevenueVnd, 'pct');
  }
  let webFacts: MetricWebFacts | null = null;
  let webKeys: string[] = [];
  let webReconciliation: WebReconciliationWarning[] = [];
  if (input.webSnapshot !== undefined && input.webSnapshotSha256 !== undefined) {
    webFacts = verifyWebSnapshot(input.webSnapshot, input.webSnapshotSha256);
    webKeys = setWebBundleKeys(B, webFacts);
    webReconciliation = reconcileWebWithRows(webFacts, rows as LegacyRow[]);
  }
  return { input, profile, rows, bundle: B, scopes, ruleHits, webFacts, webKeys, webReconciliation, defaultMarketPeers: null };
}

export type PublishedReaderReport = {
  html: StoredArtifact; metrics: StoredArtifact; claims: StoredArtifact; lint: LintResult[];
};

/**
 * Gates and stores one rendered reader report. Fails closed: any lint failure,
 * literal number in a template, or rendered number no metric can produce stops
 * the publish before anything is written.
 */
export async function publishReaderReport(
  store: ContentAddressedArtifactStore,
  { html, narrator, extraOk = [], sectionIds = READER_SECTION_ANCHORS }:
    { html: string; narrator: Narrator; extraOk?: readonly string[]; sectionIds?: readonly string[] },
): Promise<PublishedReaderReport> {
  const lintResults = lint(html, { sectionIds });
  const { checked, hardcoded } = narrator.checkHardcoded(extraOk);
  const notInBundle = narrator.notInBundle(extraOk);
  const failed = lintResults.filter(r => !r.ok);
  if (failed.length || hardcoded.length || notInBundle.length) {
    throw new ReaderReportGateError(
      `bản đọc chưa qua cổng kiểm: ${failed.map(r => r.rule).join(', ') || 'lint ok'}; số viết tay ${hardcoded.length}; số ngoài bundle ${notInBundle.length}`,
      lintResults, hardcoded, notInBundle);
  }
  const bundle = narrator.bundle;
  const htmlArtifact = await store.put(Buffer.from(html, 'utf8'));
  const metrics = await store.put(Buffer.from(canonicalJson(bundle.toJSON()), 'utf8'));
  const claims = await store.put(Buffer.from(canonicalJson({
    contractVersion: '1.0.0',
    htmlSha256: htmlArtifact.sha256,
    metricsSha256: metrics.sha256,
    usedMetricIds: [...bundle.used].sort(),
    narrative: narrator.entries.map(x => ({ where: x.where, template: x.template })),
    narrativeChecked: checked,
    lint: lintResults,
  }), 'utf8'));
  return { html: htmlArtifact, metrics, claims, lint: lintResults };
}
