import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import document from './raw-db-v1-s02b.synthetic.json' with { type: 'json' };
import { s07Hash } from './raw-db-v1-s07.js';

export const S02B_FILE = fileURLToPath(new URL('./raw-db-v1-s02b.synthetic.json', import.meta.url));
export const S02B_RUN = 'synthetic-s02b-file';
function videoRecord(index: number) {
  const record = document.records[index]!;
  if (!Array.isArray(record.response.data) || !record.requestBody) throw new Error('invalid synthetic video fixture');
  return { ...record, requestBody: record.requestBody, response: { ...record.response, data: record.response.data } };
}
// Keep the known fixture positions typed without inventing a production input schema.
export const S02B_DOCUMENT = { ...document, records: [videoRecord(0), document.records[1]!, videoRecord(2), videoRecord(3)] as
  [ReturnType<typeof videoRecord>, (typeof document.records)[number], ReturnType<typeof videoRecord>, ReturnType<typeof videoRecord>] };
export const S02B_RECEIPT = { runId: S02B_RUN, captures: 3, videos: 5, videosAlreadyPresent: 0, snapshots: 5, productsInserted: 1 };
export const S02B_URLS = [
  'https://www.tiktok.com/@synthetic_creator_a/video/1001',
  'https://www.tiktok.com/@synthetic_video_b/video/81002',
  'https://www.tiktok.com/@synthetic_video_c/video/81003',
  'https://www.tiktok.com/@synthetic_video_d/video/81004',
  'https://www.tiktok.com/@synthetic_video_e/video/81005',
] as const;

export async function s02bCapturePrefix() {
  return `S02b:${s07Hash(await fs.readFile(S02B_FILE)).slice(0, 12)}`;
}

// Literal expectations own the mapping; no production normalizer produces these values.
export function expectedVideoSnapshots(productCapture: string, keywordCapture: string) {
  const empty = { title: null, published_at: null, revenue_vnd: null, revenue_growth_rate: null,
    views: null, likes: null, shares: null, comments: null, is_ad: null,
    ad_revenue_share_pct: null, ad_view_share_pct: null, ads_roas: null, is_ai_video: null };
  const product = { source_code: 'S02b', window_start: '2026-09-01', window_end: '2026-09-30', precision: 'provider_estimate', capture_id: productCapture };
  const keyword = { ...product, window_start: '2026-10-01', window_end: '2026-10-30', capture_id: keywordCapture };
  return [
    { ...product, video_url: S02B_URLS[0], rank: 1n, title: '  Exact @synthetic_mention 😀 #synthetic #tag\r\nCafe\u0301  ',
      published_at: '2026-09-03T04:05:06+07:00', revenue_vnd: 123456.75, revenue_growth_rate: -0.25,
      views: 1200n, likes: 31n, shares: 4n, comments: 5n, is_ad: 1n,
      ad_revenue_share_pct: 80, ad_view_share_pct: 12.5, ads_roas: 2.25, is_ai_video: 0n },
    { ...empty, ...product, video_url: S02B_URLS[1], rank: 2n, revenue_growth_rate: -12.5, comments: 7n },
    { ...product, video_url: S02B_URLS[2], rank: 3n, title: 'Synthetic observed zero', published_at: '2026-09-30T23:59:59+07:00',
      revenue_vnd: 0, revenue_growth_rate: 0, views: 0n, likes: 0n, shares: 0n, comments: 0n, is_ad: 0n,
      ad_revenue_share_pct: 0, ad_view_share_pct: 0, ads_roas: 0, is_ai_video: 1n },
    { ...empty, ...keyword, video_url: S02B_URLS[3], rank: 1n, title: '', revenue_vnd: 25, views: 50n },
    { ...empty, ...keyword, video_url: S02B_URLS[4], rank: 2n, title: 'Synthetic missing metrics' },
  ];
}

/** Synthetic stored envelopes follow the existing Google fixture's manifest/capture insertion boundary. */
export async function saveKalodataCapture(
  f: { db: Database.Database; artifacts: ContentAddressedArtifactStore; runId: string },
  ordinal: number, operation: 'kalodata.video.rank' | 'kalodata.product.rank' | 'kalodata.product.detail',
  requestParameters: Record<string, unknown>, response: { success: boolean; code?: number; data: unknown },
  options: { requestedAt?: string; completedAt?: string; httpStatus?: number; responseSha256?: string; truncated?: boolean } = {},
) {
  const requestedAt = options.requestedAt ?? '2026-11-03T01:00:00Z';
  const completedAt = options.completedAt ?? '2026-11-03T01:00:01Z';
  const responseBytes = Buffer.from(JSON.stringify(response));
  const dateRange = typeof requestParameters.date_range === 'string' ? requestParameters.date_range.split('~') : null;
  const window = dateRange ? { startDate: dateRange[0]!, endDate: dateRange[1]! } : null;
  const envelope = {
    contractVersion: 'research-automation-capture-v1', captureId: `synthetic-kalodata-${ordinal}`,
    provider: 'KALODATA', operation, billing: 'PAID_CREDITS', method: 'POST',
    endpoint: `https://www.kalodata.com/openapi/v1/tiktok/${operation.slice('kalodata.'.length).replaceAll('.', '/')}`,
    requestParameters, requestBodyBytesBase64: Buffer.from(JSON.stringify(requestParameters)).toString('base64'),
    queryWindow: window, pageNumber: 1,
    productRef: typeof requestParameters.product_id === 'string' ? `kalodata:${requestParameters.product_id}` : null,
    requestedAt, completedAt, outcome: response.success ? 'OK' : 'PROVIDER_REJECTED', httpStatus: options.httpStatus ?? 200,
    responseBytesBase64: responseBytes.toString('base64'), responseSha256: options.responseSha256 ?? s07Hash(responseBytes),
    responseByteLength: responseBytes.byteLength, providerCode: response.code === undefined ? null : String(response.code), responseHeaders: {},
  };
  const stored = await f.artifacts.put(Buffer.from(JSON.stringify(envelope)));
  f.db.prepare(`INSERT OR IGNORE INTO artifact_manifests
    (sha256,byte_size,media_type,relative_path,acquired_at,contract_version,created_at)
    VALUES (?,?,'application/json',?,?,'synthetic-kalodata-response-v1',?)`)
    .run(stored.sha256, stored.byteSize, stored.relativePath, completedAt, completedAt);
  f.db.prepare(`INSERT INTO analysis_research_automation_captures
    (run_id,step_id,ordinal,artifact_sha256,media_type,provider,operation,retrieved_at,window_start,window_end,truncated,retained_at)
    VALUES (?,'COLLECTION',?,?,'application/json','kalodata',?,?,?,?,?,?)`)
    .run(f.runId, ordinal, stored.sha256, operation, completedAt, window?.startDate ?? null, window?.endDate ?? null, options.truncated ? 1 : 0, completedAt);
  return { ...stored, envelope };
}
