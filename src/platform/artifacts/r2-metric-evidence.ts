import { createHash, createHmac } from 'node:crypto';
import { S3Client } from '@aws-sdk/client-s3';
import { copyVerifiedObject, createR2Client, R2ArchiveError } from './r2-media-archive.js';

export const METRIC_EVIDENCE_MAX_BYTES = 32 * 1024 * 1024;
export const METRIC_EVIDENCE_TYPES = ['image/png', 'application/json'] as const;
export type MetricEvidenceType = (typeof METRIC_EVIDENCE_TYPES)[number];
/** Presigned links last one day by default and never longer than seven days. */
export const METRIC_EVIDENCE_LINK_SECONDS = 86_400;
export const METRIC_EVIDENCE_LINK_MAX_SECONDS = 604_800;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const KEY = new RegExp(`^metric-evidence/${UUID}/${UUID}/${UUID}/(?:manifest\\.json|raw-responses\\.json|full-page\\.png|sections/[a-z-]+\\.png)$`);

/** `metric-evidence/<workspaceId>/<runId>/<captureId>/<file>`; anything else is refused. */
export function metricEvidenceKey(workspaceId: string, runId: string, captureId: string, file: string): string {
  const key = `metric-evidence/${workspaceId}/${runId}/${captureId}/${file}`;
  if (!KEY.test(key)) throw new R2ArchiveError('invalid_input');
  return key;
}

export interface MetricEvidencePresignCredentials {
  readonly accountId: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
}

/**
 * Private evidence copies of a Metric v3 capture in the `tdn-media` bucket. Conditional write with
 * read-back verification (no overwrite, delete or list), and short-lived GET links signed in the
 * app: the credentials never leave this object.
 */
export class R2MetricEvidenceStore {
  readonly #client: S3Client;
  readonly #credentials: MetricEvidencePresignCredentials;
  constructor(client: S3Client, private readonly bucket: string, credentials: MetricEvidencePresignCredentials) {
    if (bucket !== 'tdn-media') throw new R2ArchiveError('configuration');
    this.#client = client;
    this.#credentials = credentials;
  }

  async put(key: string, bytes: Buffer, sha256: string, mediaType: MetricEvidenceType): Promise<{ key: string; status: 'copied' | 'verified_existing' }> {
    if (!KEY.test(key)) throw new R2ArchiveError('invalid_input');
    const copied = await copyVerifiedObject(this.#client, this.bucket, {
      key, bytes, sha256, mediaType, maxBytes: METRIC_EVIDENCE_MAX_BYTES, allowedTypes: METRIC_EVIDENCE_TYPES,
    });
    return { key: copied.key, status: copied.status };
  }

  /** AWS Signature V4 query-string GET link (path style, region `auto`), as R2 accepts it. */
  presignGet(key: string, expiresInSeconds = METRIC_EVIDENCE_LINK_SECONDS, now = new Date()): { url: string; expiresAt: string } {
    if (!KEY.test(key)) throw new R2ArchiveError('invalid_input');
    if (!Number.isFinite(expiresInSeconds)) throw new R2ArchiveError('invalid_input');
    const expires = Math.min(METRIC_EVIDENCE_LINK_MAX_SECONDS, Math.max(1, Math.floor(expiresInSeconds)));
    const { accountId, accessKeyId, secretAccessKey } = this.#credentials;
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const day = amzDate.slice(0, 8);
    const scope = `${day}/auto/s3/aws4_request`;
    const path = `/${this.bucket}/${key.split('/').map(encode).join('/')}`;
    const query = [
      ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'], ['X-Amz-Credential', `${accessKeyId}/${scope}`], ['X-Amz-Date', amzDate],
      ['X-Amz-Expires', String(expires)], ['X-Amz-SignedHeaders', 'host'],
    ].map(([name, value]) => `${encode(name!)}=${encode(value!)}`).sort().join('&');
    const request = ['GET', path, query, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
    const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, createHash('sha256').update(request).digest('hex')].join('\n');
    let signingKey = hmac(`AWS4${secretAccessKey}`, day);
    for (const part of ['auto', 's3', 'aws4_request']) signingKey = hmac(signingKey, part);
    const signature = createHmac('sha256', signingKey).update(toSign).digest('hex');
    return { url: `https://${host}${path}?${query}&X-Amz-Signature=${signature}`, expiresAt: new Date(now.getTime() + expires * 1000).toISOString() };
  }
}

const hmac = (key: string | Buffer, value: string): Buffer => createHmac('sha256', key).update(value).digest();
/** RFC 3986 encoding, as Signature V4 requires. */
const encode = (value: string): string => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

/** Same TDN_R2_* environment and validation as the media archive. */
export function createR2MetricEvidenceStore(env: NodeJS.ProcessEnv): { store: R2MetricEvidenceStore; close: () => void } {
  const client = createR2Client(env);
  const store = new R2MetricEvidenceStore(client, 'tdn-media', {
    accountId: env.TDN_R2_ACCOUNT_ID!, accessKeyId: env.TDN_R2_ACCESS_KEY_ID!, secretAccessKey: env.TDN_R2_SECRET_ACCESS_KEY!,
  });
  return { store, close: () => client.destroy() };
}
