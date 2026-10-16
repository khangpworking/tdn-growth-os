// Owner/operator video uploads in the Market report: the S02 video table and S14 seller video speech. Read-only: the code reads
// packages already stored for the run, never asks for, transcribes or downloads anything. Values and speech are shown as stored,
// with no total, average, share, rank or ratio, and never the creator, link, file name, frames or on-screen text.
import { createHash } from 'node:crypto';
import type { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { formatMissingVideoValue, parseVideoTable, verifyPreparedVideoSource, videoPackageKeyPrefix, VIDEO_READ_BUDGET, VIDEO_TABLE_PATH } from './kalodata-video-intake.js';
import { p9PackagePrefix } from './p9-source-intake.js';
import { pdfPlainTextSafe } from './pdf-excerpt.js';

export const SELLER_VIDEO_SECTION = 'M09' as const;
export const SELLER_VIDEO_MAX_ROWS = 10;
export const SELLER_VIDEO_MAX_VIDEOS = 5;
export const SELLER_VIDEO_MAX_SEGMENTS = 3;
export const SELLER_VIDEO_MAX_WORDS = 30;
/** Foundation's bounded key lookup returns at most 101 entries; 101 cannot prove the list complete, so that kind is skipped. */
export const SELLER_VIDEO_LOOKUP_LIMIT = 101;
export const SELLER_VIDEO_TABLE_TITLE = 'Số liệu video do chủ tải lên cho lượt này (ước tính)';
export const SELLER_VIDEO_READING_TITLE = 'Lời nói trong video bán hàng do người vận hành ghi lại';
export const SELLER_VIDEO_PROVENANCE = 'do người vận hành ghi lại từ video, chưa xác minh';
export const SELLER_VIDEO_ESTIMATE = 'ước tính';
export const SELLER_VIDEO_NOTE = 'Các tệp video này do chủ hoặc người vận hành tải lên cho lượt này. Nội dung video là lời người bán hoặc người làm video review tự nói để bán hàng, không phải ý kiến khách hàng và không phải sự thật đã kiểm chứng. Số liệu video là số ước tính của công cụ, không cộng lại, không so sánh được với số liệu mẫu; kỳ của tệp chưa được kiểm tra nên không coi là cùng kỳ với báo cáo.';
export const SELLER_VIDEO_SRC = 'Tệp số liệu video và bản ghi lời nói trong video do chủ hoặc người vận hành tải lên cho lượt này.';
/** Automated (video-watch) readings: own title, provenance, note and source line; operator wording above stays unchanged. */
/** Covers both kinds the automated block holds (SELLER_VIDEO and REVIEW_VIDEO); each quote keeps its own voice label. */
export const SELLER_VIDEO_AUTO_TITLE = 'Lời nói trong video bán hàng và video đánh giá sản phẩm';
/** The automated title used before VW2; old drafts still carry it and must still be found by the gate. */
export const SELLER_VIDEO_AUTO_TITLE_V1 = 'Lời nói trong video bán hàng';
export const SELLER_VIDEO_AUTO_PROVENANCE = 'ghi lại tự động từ video, chưa xác minh';
export const SELLER_VIDEO_AUTO_NOTE = 'Lời nói trong video bán hàng và video đánh giá sản phẩm được ghi lại tự động từ video công khai liên quan tới sản phẩm, chưa có người kiểm tra. Đây là lời người bán hoặc người làm video review tự nói về sản phẩm, không phải ý kiến khách hàng và không phải sự thật đã kiểm chứng.';
export const SELLER_VIDEO_AUTO_SRC = 'Lời nói được ghi lại tự động từ video công khai của lượt này.';

const SELLER_VIDEO_VOICE_LABELS = new Set(['lời người bán', 'lời người làm video review']);
const sellerVideoVoiceLabelSafe = (value: string): value is 'lời người bán' | 'lời người làm video review' => SELLER_VIDEO_VOICE_LABELS.has(value);

export type SellerVideoLeftOutReason = 'OVER_10_ROWS' | 'OVER_5_VIDEOS' | 'OVER_3_SEGMENTS' | 'OVER_30_WORDS' | 'NOT_READER_SAFE' | 'EMPTY_SEGMENT'
  | 'NOT_VERIFIED' | 'NOT_VIDEO_TABLE' | 'NOT_FIRST_TABLE' | 'NO_SHOWN_SEGMENT' | 'SAME_READING' | 'TOO_MANY_PACKAGES' | 'NOT_ABOUT_PRODUCT';
export interface SellerVideoRef { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string }
/** An automated reading reference as the collection step stored it (readingSha256 pins the exact bytes). */
export interface SellerVideoAutomatedRef extends SellerVideoRef { readonly readingSha256: string }
/** One stored video row: only these four values, exactly as stored (decimal text or null). */
export interface SellerVideoRow { readonly revenue: string | null; readonly views: string | null; readonly units: string | null; readonly publishDate: string | null }
export interface SellerVideoExcerpt { readonly text: string; readonly startSeconds: number; readonly endSeconds: number }
export interface SellerVideoReading { readonly package: SellerVideoRef; readonly readingSha256: string; readonly voiceLabel: string; readonly excerpts: readonly SellerVideoExcerpt[];
  /** Present (true) only for an automated, model-transcribed reading; absent for operator readings. */
  readonly automated?: true }
/** Counted per package and reason, so a long table or reading stays a bounded record. */
export interface SellerVideoLeftOut { readonly kind: 'table' | 'reading'; readonly packageId: string | null; readonly reason: SellerVideoLeftOutReason; readonly count: number }
/** Every package considered at the first build, in package-key order; later builds re-read exactly these. */
export interface SellerVideoSources { readonly tables: readonly SellerVideoRef[] | 'TOO_MANY'; readonly readings: readonly SellerVideoRef[] | 'TOO_MANY';
  /** Automated readings considered, in candidate order; present only when there was at least one. */
  readonly automated?: readonly SellerVideoAutomatedRef[] }
export interface SellerVideos {
  readonly contractVersion: 'seller-videos-v1';
  readonly sources: SellerVideoSources;
  readonly table: { readonly package: SellerVideoRef; readonly rows: readonly SellerVideoRow[] } | null;
  readonly readings: readonly SellerVideoReading[];
  readonly leftOut: readonly SellerVideoLeftOut[];
}

type TableInput = { readonly ref: SellerVideoRef; readonly rows: readonly SellerVideoRow[] | 'NOT_VIDEO_TABLE' | 'NOT_VERIFIED' };
type ReadingInput = { readonly ref: SellerVideoRef; readonly reading: { readonly readingSha256: string; readonly voiceLabel: string; readonly segments: readonly SellerVideoExcerpt[] } | 'NOT_VERIFIED' };
export type AutomatedReadingInput = { readonly ref: SellerVideoAutomatedRef; readonly reading: Exclude<ReadingInput['reading'], 'NOT_VERIFIED'> | 'NOT_VERIFIED' | 'NOT_ABOUT_PRODUCT' };
export interface SellerVideoInputs { readonly tables: readonly TableInput[] | 'TOO_MANY'; readonly readings: readonly ReadingInput[] | 'TOO_MANY'; readonly automated?: readonly AutomatedReadingInput[] }

const words = (text: string): number => text.trim().split(/\s+/u).filter(Boolean).length;
/** Visible-text rules of the report that plain prose alone does not cover: a platform name needs its icon, notes and section codes are the report's own. */
const REPORT_OWN = /(?<![\p{L}\p{N}_])(?:shopee|tiktok|ghi\s+chú|chú\s+thích|trong\s+mẫu|[MI]\d{2}|n\s*[=:])(?![\p{L}\p{N}_])/iu;
export const sellerVideoSegmentSafe = (text: string): boolean => pdfPlainTextSafe(text) && !REPORT_OWN.test(text.normalize('NFC'));

/** Pure selection: the first verified video table (at most 10 rows in stored order), then up to 5 readings in package-key order, each with up to 3 segments in stored order. */
export function selectSellerVideos(inputs: SellerVideoInputs): SellerVideos | null {
  const leftOut: SellerVideoLeftOut[] = [];
  const out = (kind: SellerVideoLeftOut['kind'], packageId: string | null, reason: SellerVideoLeftOutReason, count = 1): void => {
    if (count <= 0) return;
    const prior = leftOut.findIndex(item => item.kind === kind && item.packageId === packageId && item.reason === reason);
    if (prior >= 0) leftOut[prior] = { ...leftOut[prior]!, count: leftOut[prior]!.count + count }; else leftOut.push({ kind, packageId, reason, count });
  };
  let table: SellerVideos['table'] = null;
  if (inputs.tables === 'TOO_MANY') out('table', null, 'TOO_MANY_PACKAGES');
  else for (const item of inputs.tables) {
    if (typeof item.rows === 'string') { out('table', item.ref.packageId, item.rows); continue; }
    if (table) { out('table', item.ref.packageId, 'NOT_FIRST_TABLE'); continue; }
    table = { package: item.ref, rows: item.rows.slice(0, SELLER_VIDEO_MAX_ROWS).map(({ revenue, views, units, publishDate }) => ({ revenue, views, units, publishDate })) };
    out('table', item.ref.packageId, 'OVER_10_ROWS', item.rows.length - SELLER_VIDEO_MAX_ROWS);
  }
  if (table && table.rows.length === 0) table = null;
  const readings: SellerVideoReading[] = [];
  const take = (ref: SellerVideoRef, reading: ReadingInput['reading'] | 'NOT_ABOUT_PRODUCT', automated: boolean): void => {
    const id = ref.packageId;
    if (reading === 'NOT_VERIFIED' || reading === 'NOT_ABOUT_PRODUCT') { out('reading', id, reading); return; }
    if (!sellerVideoVoiceLabelSafe(reading.voiceLabel)) { out('reading', id, 'NOT_READER_SAFE'); return; }
    if (readings.some(shown => shown.readingSha256 === reading.readingSha256)) { out('reading', id, 'SAME_READING'); return; }
    if (readings.length >= SELLER_VIDEO_MAX_VIDEOS) { out('reading', id, 'OVER_5_VIDEOS'); return; }
    const excerpts: SellerVideoExcerpt[] = [];
    for (const segment of reading.segments) {
      if (excerpts.length >= SELLER_VIDEO_MAX_SEGMENTS) out('reading', id, 'OVER_3_SEGMENTS');
      else if (!segment.text.trim()) out('reading', id, 'EMPTY_SEGMENT');
      else if (words(segment.text) > SELLER_VIDEO_MAX_WORDS) out('reading', id, 'OVER_30_WORDS');
      else if (!sellerVideoSegmentSafe(segment.text)) out('reading', id, 'NOT_READER_SAFE');
      else excerpts.push({ text: segment.text, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds });
    }
    if (!excerpts.length) { out('reading', id, 'NO_SHOWN_SEGMENT'); return; }
    const package_ = { packageId: ref.packageId, manifestArtifactSha256: ref.manifestArtifactSha256, packageContentSha256: ref.packageContentSha256 };
    readings.push({ package: package_, readingSha256: reading.readingSha256, voiceLabel: reading.voiceLabel, excerpts, ...(automated ? { automated: true as const } : {}) });
  };
  if (inputs.readings === 'TOO_MANY') out('reading', null, 'TOO_MANY_PACKAGES');
  else for (const item of inputs.readings) take(item.ref, item.reading, false);
  // Automated readings come after the operator ones, under the same 5-video cap and segment rules.
  const automated = inputs.automated ?? [];
  for (const item of automated) take(item.ref, item.reading, true);
  if (!table && !readings.length) return null;
  const refs = <T extends { ref: SellerVideoRef }>(list: readonly T[] | 'TOO_MANY') => list === 'TOO_MANY' ? 'TOO_MANY' as const : list.map(item => item.ref);
  const automatedRefs = automated.map(({ ref }) => ({ packageId: ref.packageId, manifestArtifactSha256: ref.manifestArtifactSha256, packageContentSha256: ref.packageContentSha256, readingSha256: ref.readingSha256 }));
  return { contractVersion: 'seller-videos-v1', sources: { tables: refs(inputs.tables), readings: refs(inputs.readings), ...(automatedRefs.length ? { automated: automatedRefs } : {}) }, table, readings, leftOut };
}

export interface SellerVideoReadDeps {
  readonly reader: FoundationSourcePackageReader;
  readonly workspaceId: string;
  readonly runId: string;
  /** The run's own network-free reading view (`AutomationP9SourceIntake.reading`), which projects stored v1 readings in memory. */
  readonly reading: (ref: SellerVideoRef) => Promise<{ readonly readingSha256: string; readonly rows: readonly { readonly text: string; readonly voiceLabel: string; readonly startSeconds: number; readonly endSeconds: number }[] }>;
  /** Automated (video-watch) readings: re-verifies exactly `pinned` when given, otherwise the collection step's stored refs. Absent = none. */
  readonly automated?: (pinned?: readonly SellerVideoAutomatedRef[]) => Promise<readonly AutomatedReadingInput[]>;
}
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const sameRef = (a: SellerVideoRef, b: SellerVideoRef): boolean => a.packageId === b.packageId && a.manifestArtifactSha256 === b.manifestArtifactSha256 && a.packageContentSha256 === b.packageContentSha256;

/** Lists the run's stored packages (or re-reads exactly the pinned ones) and verifies each; a package that fails is left out, never repaired. */
export async function readSellerVideoInputs(deps: SellerVideoReadDeps, pinned?: SellerVideoSources): Promise<SellerVideoInputs> {
  const list = async (prefix: string, kept: readonly SellerVideoRef[] | 'TOO_MANY' | undefined) => {
    if (kept === 'TOO_MANY') return 'TOO_MANY' as const;
    if (kept) return kept.map(ref => ({ ref, version: 1 }));
    const entries = await deps.reader.findAutomationAttachmentPackagesByKeyPrefix(prefix);
    if (entries.length >= SELLER_VIDEO_LOOKUP_LIMIT) return 'TOO_MANY' as const;
    return entries.map(entry => ({ ref: { packageId: entry.packageId, manifestArtifactSha256: entry.manifestArtifactSha256, packageContentSha256: '' }, version: entry.version }));
  };
  const tablePrefix = videoPackageKeyPrefix(deps.runId), readingPrefix = p9PackagePrefix(deps.runId, 'reading');
  const tableRefs = await list(tablePrefix, pinned?.tables), readingRefs = await list(readingPrefix, pinned?.readings);
  const open = async (candidate: { ref: SellerVideoRef; version: number }, prefix: string, budget: { maxFileBytes: number; maxTotalBytes: number }) => {
    const source = await deps.reader.readFinalizedSourcePackage(candidate.ref.packageId, budget);
    const ref = { packageId: source.packageId, manifestArtifactSha256: source.manifestArtifactSha256, packageContentSha256: source.packageContentSha256 };
    if (candidate.version !== 1 || source.manifestArtifactSha256 !== candidate.ref.manifestArtifactSha256 || !source.manifest.packageKey.startsWith(prefix)
      || (candidate.ref.packageContentSha256 && !sameRef(ref, candidate.ref))) throw new Error('package identity differs');
    return { source, ref };
  };
  const tables = tableRefs === 'TOO_MANY' ? tableRefs : await Promise.all(tableRefs.map(async (candidate): Promise<TableInput> => {
    try {
      const { source, ref } = await open(candidate, tablePrefix, VIDEO_READ_BUDGET);
      try {
        await verifyPreparedVideoSource(deps.reader, { workspaceId: deps.workspaceId, runId: deps.runId }, source,
          { packageId: source.packageId, packageKey: source.manifest.packageKey, manifestArtifactSha256: source.manifestArtifactSha256, version: source.manifest.version });
        const member = source.files.find(file => file.path === VIDEO_TABLE_PATH);
        const parsed = member && sha(member.bytes) === member.sha256 ? parseVideoTable(member.bytes) : undefined;
        if (!parsed) return { ref, rows: 'NOT_VERIFIED' };
        return { ref, rows: parsed.tables.includes('video') ? parsed.videos.map(({ revenue, views, units, publishDate }) => ({ revenue, views, units, publishDate })) : 'NOT_VIDEO_TABLE' };
      } catch { return { ref, rows: 'NOT_VERIFIED' }; }
    } catch { return { ref: candidate.ref, rows: 'NOT_VERIFIED' }; }
  }));
  const readings = readingRefs === 'TOO_MANY' ? readingRefs : await Promise.all(readingRefs.map(async (candidate): Promise<ReadingInput> => {
    let ref = candidate.ref;
    try {
      ref = (await open(candidate, readingPrefix, { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 })).ref;
      const read = await deps.reading(ref);
      const voiceLabel = read.rows[0]?.voiceLabel;
      if (!voiceLabel || !sellerVideoVoiceLabelSafe(voiceLabel) || read.rows.some(row => row.voiceLabel !== voiceLabel)) return { ref, reading: 'NOT_VERIFIED' };
      return { ref, reading: { readingSha256: read.readingSha256, voiceLabel, segments: read.rows.map(({ text, startSeconds, endSeconds }) => ({ text, startSeconds, endSeconds })) } };
    } catch { return { ref, reading: 'NOT_VERIFIED' }; }
  }));
  // A pinned draft without automated refs never gains any later; the first build takes what the collection step stored.
  const automated = !deps.automated ? [] : pinned ? (pinned.automated ? await deps.automated(pinned.automated) : []) : await deps.automated();
  return automated.length ? { tables, readings, automated } : { tables, readings };
}

/** The S02 and S14 registry bindings: the shown table's and each shown reading's package manifest. */
export function sellerVideoPackages(videos: SellerVideos | null | undefined): { readonly table: readonly string[]; readonly readings: readonly string[] } {
  return { table: videos?.table ? [videos.table.package.manifestArtifactSha256] : [], readings: (videos?.readings ?? []).map(reading => reading.package.manifestArtifactSha256) };
}

const seconds = (value: number): string => String(value).replace('.', ',');
/** The two blocks, shared by both Market renderers; the caller adds the one note and the source line. Speech sits in `data-quote` blockquotes. */
export function sellerVideoBlockHtml(videos: SellerVideos, esc: (value: string) => string): string {
  const cell = (value: string | null): string => esc(formatMissingVideoValue(value));
  const table = videos.table ? `<h3>${esc(SELLER_VIDEO_TABLE_TITLE)}</h3><div class="table-wrap"><table class="seller-videos"><thead><tr><th>Video</th><th>Doanh thu (${SELLER_VIDEO_ESTIMATE})</th><th>Lượt xem (${SELLER_VIDEO_ESTIMATE})</th><th>Đơn vị bán (${SELLER_VIDEO_ESTIMATE})</th><th>Ngày đăng</th></tr></thead><tbody>${
    videos.table.rows.map((row, index) => `<tr><td>Video ${index + 1}</td><td>${cell(row.revenue)}</td><td>${cell(row.views)}</td><td>${cell(row.units)}</td><td>${cell(row.publishDate)}</td></tr>`).join('')}</tbody></table></div>` : '';
  const block = (title: string, provenance: string, list: readonly SellerVideoReading[]): string => list.length ? `<h3>${esc(title)}</h3><ul class="seller-video-speech">${list.map(reading => reading.excerpts.map(excerpt =>
    `<li><blockquote data-quote><p>${esc(excerpt.text)}</p><footer>${esc(reading.voiceLabel.charAt(0).toUpperCase() + reading.voiceLabel.slice(1))}; giây ${seconds(excerpt.startSeconds)}–${seconds(excerpt.endSeconds)}; ${provenance}.</footer></blockquote></li>`).join('')).join('')}</ul>` : '';
  const safe = videos.readings.filter(reading => sellerVideoVoiceLabelSafe(reading.voiceLabel));
  const speech = block(SELLER_VIDEO_READING_TITLE, SELLER_VIDEO_PROVENANCE, safe.filter(reading => reading.automated !== true));
  const automated = block(SELLER_VIDEO_AUTO_TITLE, SELLER_VIDEO_AUTO_PROVENANCE, safe.filter(reading => reading.automated === true));
  return table + speech + automated;
}

const hasOperator = (videos: SellerVideos): boolean => Boolean(videos.table) || videos.readings.some(reading => reading.automated !== true);
const hasAutomated = (videos: SellerVideos): boolean => videos.readings.some(reading => reading.automated === true);
/** The one M09 note for the shown blocks: operator wording unchanged when only uploads are shown. */
export function sellerVideoNote(videos: SellerVideos): string {
  return [hasOperator(videos) ? SELLER_VIDEO_NOTE : '', hasAutomated(videos) ? SELLER_VIDEO_AUTO_NOTE : ''].filter(Boolean).join(' ');
}
/** The source line for the shown blocks: operator wording unchanged when only uploads are shown. */
export function sellerVideoSrc(videos: SellerVideos): string {
  return [hasOperator(videos) ? SELLER_VIDEO_SRC : '', hasAutomated(videos) ? SELLER_VIDEO_AUTO_SRC : ''].filter(Boolean).join(' ');
}

/** The uploads stored with a verified Market draft; only a draft whose packet carries the marker has any. */
export function storedSellerVideos(semantic: Readonly<Record<string, unknown>> | undefined): SellerVideos | null {
  const marked = (semantic?.sourceEvidence as { sellerVideos?: unknown } | undefined)?.sellerVideos === true;
  const value = semantic?.sellerVideos as SellerVideos | undefined;
  return marked && value && typeof value === 'object' && value.contractVersion === 'seller-videos-v1' ? value : null;
}
