import { createHash } from 'node:crypto';
import type { FinalizedSourcePackageReader, SourceAttachmentOriginReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { parseVideoTable, verifyPreparedVideoSource, VIDEO_READ_BUDGET, VIDEO_TABLE_PATH, type VideoRunBinding } from './kalodata-video-intake.js';

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

/** Provisional request surface until the serial canonical phase; no persisted
 * request, hand-maintained schema, caller table or duplicate source parser. */
export async function selectTikTokVideos(reader: FinalizedSourcePackageReader & SourceAttachmentOriginReader,
  bound: VideoRunBinding, request: {
    sourcePackage: { packageId: string; manifestArtifactSha256: string; packageContentSha256: string };
    option: 'A_TOP_20_PERCENT' | 'C_CUMULATIVE_80_PERCENT';
    reviewVideoUrls: readonly string[];
  }) {
  if (!['A_TOP_20_PERCENT', 'C_CUMULATIVE_80_PERCENT'].includes(request.option) || request.reviewVideoUrls.length > 30) fail();
  const source = await reader.readFinalizedSourcePackage(request.sourcePackage.packageId, VIDEO_READ_BUDGET);
  if (source.manifestArtifactSha256 !== request.sourcePackage.manifestArtifactSha256 || source.packageContentSha256 !== request.sourcePackage.packageContentSha256) fail();
  await verifyPreparedVideoSource(reader, bound, source, { packageId: source.packageId,
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
  const selection = { contractVersion: 'tiktok-video-selection-v1' as const, ...bound,
    sourcePackage: { ...request.sourcePackage }, tableSha256: member.sha256,
    option: request.option, tieRule: 'EXACT_SOURCE_ORDER' as const, maximumVideos: 30 as const,
    sampleVideoCount: candidates.length, excluded, videos };
  return { selection, selectionSha256: sha(canonicalJson(selection)) };
}
