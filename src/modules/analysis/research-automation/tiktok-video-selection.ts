import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import keywordSchema from '../../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import selectionSchema from '../../../../contracts/analysis/tiktok-comment-collection-v1.schema.json' with { type: 'json' };
import type { TikTokRunBinding, TikTokVideoSelection, TikTokVideoSelectionRequest } from '../../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import type { AutomationSourcePackageLookup, FinalizedSourcePackageReader, SourceAttachmentOriginReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { parseVideoTable, verifyPreparedVideoSource, videoPackageKeyPrefix, VIDEO_READ_BUDGET, VIDEO_TABLE_PATH } from './kalodata-video-intake.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv); ajv.addSchema(keywordSchema); ajv.addSchema(selectionSchema);
const validateSelection = ajv.compile<TikTokVideoSelection>({ $ref: `${selectionSchema.$id}#/$defs/selection` });
export type TikTokVideoSelectionBinding = Omit<TikTokRunBinding, 'sourcePeriod'>;

export class TikTokVideoSelectionError extends Error { readonly code = 'INVALID_TIKTOK_VIDEO_SELECTION'; }
function fail(): never { throw new TikTokVideoSelectionError('Tập video không khớp nguồn và phạm vi đã chọn.'); }
import { exactTikTokVideoUrl } from '../../../platform/collectors/apify-tiktok-comments.js';
export { exactTikTokVideoUrl } from '../../../platform/collectors/apify-tiktok-comments.js';
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const scaled = (value: string): bigint => {
  if (!/^(0|[1-9][0-9]{0,39})(\.[0-9]{1,10})?$/.test(value)) fail();
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole! + fraction.padEnd(10, '0'));
};

export interface TopSellingTikTokVideos {
  /** Exact TikTok videos of the run's stored video tables, best seller first. Never invented: a row without a usable video id or URL is only counted. */
  readonly videos: readonly { readonly videoId: string; readonly url: string }[];
  readonly rowsWithoutUsableVideo: number;
  readonly tablesNotVerified: number;
}
/**
 * The run's own top-selling TikTok videos from verified rows linked to confirmed, collected products, ranked by revenue then units (largest first, a missing value
 * last, never zero), ties in stored order. Read-only: no network, no paid call, no selection step. A table that fails verification is left out.
 */
export async function topSellingTikTokVideos(reader: FinalizedSourcePackageReader & SourceAttachmentOriginReader & AutomationSourcePackageLookup,
  bound: { readonly workspaceId: string; readonly runId: string }, collectedProductUrls: readonly string[] = []): Promise<TopSellingTikTokVideos> {
  const ranked: { videoId: string; url: string; revenue: bigint | null; units: bigint | null; order: number }[] = [];
  const products = new Set(collectedProductUrls);
  const identities = new Set<string>();
  let rowsWithoutUsableVideo = 0, tablesNotVerified = 0, order = 0;
  for (const entry of (await reader.findAutomationAttachmentPackagesByKeyPrefix(videoPackageKeyPrefix(bound.runId))).slice(0, 100)) {
    try {
      const source = await reader.readFinalizedSourcePackage(entry.packageId, VIDEO_READ_BUDGET);
      await verifyPreparedVideoSource(reader, bound, source, { packageId: source.packageId, packageKey: source.manifest.packageKey,
        manifestArtifactSha256: source.manifestArtifactSha256, version: source.manifest.version });
      const member = source.files.find(file => file.path === VIDEO_TABLE_PATH);
      const table = member && sha(member.bytes) === member.sha256 ? parseVideoTable(member.bytes) : undefined;
      if (!table) { tablesNotVerified++; continue; }
      if (!table.tables.includes('video')) continue;
      for (const row of table.videos) {
        if (row.productLink === null || !products.has(row.productLink)) continue;
        let video: ReturnType<typeof exactTikTokVideoUrl>;
        try { video = exactTikTokVideoUrl(row.video ?? ''); } catch { rowsWithoutUsableVideo++; continue; }
        const number = (read: () => bigint | null): bigint | null => { try { return read(); } catch { return null; } };
        ranked.push({ videoId: video.videoId, url: video.url, revenue: number(() => row.revenue === null ? null : scaled(row.revenue)),
          units: number(() => row.units === null ? null : BigInt(row.units)), order: order++ });
      }
    } catch { tablesNotVerified++; }
  }
  const value = (n: bigint | null): bigint => n ?? -1n;
  ranked.sort((a, b) => value(a.revenue) !== value(b.revenue) ? (value(a.revenue) > value(b.revenue) ? -1 : 1)
    : value(a.units) !== value(b.units) ? (value(a.units) > value(b.units) ? -1 : 1) : a.order - b.order);
  const videos = ranked.flatMap(({ videoId, url }) => {
    if (identities.has(videoId)) return [];
    identities.add(videoId);
    return [{ videoId, url }];
  });
  return { videos, rowsWithoutUsableVideo, tablesNotVerified };
}

/** Uses the existing P4 parser/verified reader; owning caller supplies frozen binding. */
export async function selectTikTokVideos(reader: FinalizedSourcePackageReader & SourceAttachmentOriginReader,
  bound: TikTokVideoSelectionBinding,
  request: Pick<TikTokVideoSelectionRequest, 'sourcePackage' | 'option' | 'reviewVideoUrls'>) {
  if (!['A_TOP_20_PERCENT', 'C_CUMULATIVE_80_PERCENT'].includes(request.option) || request.reviewVideoUrls.length > 30) fail();
  const source = await reader.readFinalizedSourcePackage(request.sourcePackage.packageId, VIDEO_READ_BUDGET);
  if (source.manifestArtifactSha256 !== request.sourcePackage.manifestArtifactSha256 || source.packageContentSha256 !== request.sourcePackage.packageContentSha256) fail();
  await verifyPreparedVideoSource(reader, { workspaceId: bound.workspaceId, runId: bound.runId }, source, { packageId: source.packageId,
    packageKey: source.manifest.packageKey, manifestArtifactSha256: source.manifestArtifactSha256, version: source.manifest.version });
  const member = source.files.find(file => file.path === VIDEO_TABLE_PATH);
  if (!member || sha(member.bytes) !== member.sha256) fail();
  const table = parseVideoTable(member.bytes); if (!table || !table.tables.includes('video')) fail();
  const excluded: { line: string; reason: 'MISSING_VIDEO' | 'INVALID_VIDEO_URL' | 'MISSING_REVENUE' | 'ZERO_REVENUE' }[] = [];
  const identities = new Set<string>();
  const candidates = table.videos.flatMap((row, sourceOrder) => {
    if (row.video === null) { excluded.push({ line: row.line, reason: 'MISSING_VIDEO' }); return []; }
    let video: ReturnType<typeof exactTikTokVideoUrl>;
    try { video = exactTikTokVideoUrl(row.video); }
    catch { excluded.push({ line: row.line, reason: 'INVALID_VIDEO_URL' }); return []; }
    if (identities.has(video.videoId)) fail(); identities.add(video.videoId);
    if (row.revenue === null) { excluded.push({ line: row.line, reason: 'MISSING_REVENUE' }); return []; }
    if (scaled(row.revenue) === 0n) { excluded.push({ line: row.line, reason: 'ZERO_REVENUE' }); return []; }
    return [{ videoId: video.videoId, url: video.url, kind: 'SELLER_VIDEO' as const,
      sourceLine: row.line, sourceOrder, revenue: row.revenue, amount: scaled(row.revenue) }];
  });
  const ranked = [...candidates].sort((a, b) => a.amount === b.amount ? a.sourceOrder - b.sourceOrder : a.amount > b.amount ? -1 : 1);
  const total = ranked.reduce((n, row) => n + row.amount, 0n); if (total === 0n) fail();
  let chosen: typeof ranked;
  if (request.option === 'A_TOP_20_PERCENT') chosen = ranked.slice(0, Math.ceil(ranked.length / 5));
  else {
    let cumulative = 0n; chosen = [];
    for (const row of ranked) { if (cumulative * 5n >= total * 4n) break; chosen.push(row); cumulative += row.amount; }
  }
  const videos: { videoId: string; url: string; kind: 'SELLER_VIDEO' | 'REVIEW_VIDEO'; sourceLine: string | null; revenue: string | null }[] =
    chosen.map(({ videoId, url, kind, sourceLine, revenue }) => ({ videoId, url, kind, sourceLine, revenue }));
  const selectedIds = new Set(videos.map(video => video.videoId));
  for (const url of request.reviewVideoUrls) {
    const video = exactTikTokVideoUrl(url);
    if (selectedIds.has(video.videoId) || identities.has(video.videoId)) fail(); selectedIds.add(video.videoId);
    videos.push({ videoId: video.videoId, url: video.url, kind: 'REVIEW_VIDEO', sourceLine: null, revenue: null });
  }
  if (videos.length > 30) fail();
  const selection: TikTokVideoSelection = { contractVersion: 'tiktok-video-selection-v1' as const, ...bound, sourcePeriod: { state: 'UNKNOWN_UNVERIFIED', startDate: null, endDate: null },
    sourcePackage: { ...request.sourcePackage }, tableSha256: member.sha256,
    option: request.option, tieRule: 'EXACT_SOURCE_ORDER' as const, maximumVideos: 30 as const,
    sampleVideoCount: candidates.length, excluded, videos };
  if (!validateSelection(selection) || bound.requestedPeriod.startDate > bound.requestedPeriod.endDate) fail();
  return { selection, selectionSha256: sha(canonicalJson(selection)) };
}
