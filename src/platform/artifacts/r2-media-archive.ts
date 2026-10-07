import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 30_000;
type ImageType = 'image/png' | 'image/jpeg';

export class R2ArchiveError extends Error {
  constructor(readonly code: 'invalid_input' | 'integrity' | 'unavailable' | 'configuration') {
    super(`Private R2 media archive failed: ${code}`);
  }
}

/** Explicit archive copy only. The local artifact and SQLite remain authoritative. */
export class R2MediaArchive {
  constructor(private readonly client: S3Client, private readonly bucket: string) {
    if (bucket !== 'tdn-media') throw new R2ArchiveError('configuration');
  }

  async copy(bytes: Buffer, sha256: string, mediaType: ImageType): Promise<{
    key: string; sha256: string; byteSize: number; status: 'copied' | 'verified_existing';
  }> {
    const key = `tdn/v1/media/sha256/${sha256.slice(0, 2)}/${sha256}`;
    return copyVerifiedObject(this.client, this.bucket, {
      key, bytes, sha256, mediaType, maxBytes: MAX_BYTES, allowedTypes: ['image/png', 'image/jpeg'],
    });
  }
}

export interface CopyVerifiedObjectOptions {
  key: string;
  bytes: Buffer;
  sha256: string;
  mediaType: string;
  maxBytes: number;
  allowedTypes: readonly string[];
}

/** Shared conditional copy with read-back verification. No overwrite, no delete, no list. */
export async function copyVerifiedObject(client: S3Client, bucket: string, options: CopyVerifiedObjectOptions): Promise<{
  key: string; sha256: string; byteSize: number; status: 'copied' | 'verified_existing';
}> {
  const { key, bytes, sha256, mediaType, maxBytes, allowedTypes } = options;
  // Snapshot before any await so a caller cannot change the payload in flight.
  const snapshot = Buffer.from(bytes);
  if (!/^[0-9a-f]{64}$/.test(sha256) || snapshot.length === 0 || snapshot.length > maxBytes ||
    !allowedTypes.includes(mediaType) || digest(snapshot) !== sha256) {
    throw new R2ArchiveError('invalid_input');
  }
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  let status: 'copied' | 'verified_existing' = 'copied';
  try {
    try {
      await client.send(new PutObjectCommand({
        Bucket: bucket, Key: key, Body: snapshot, ContentLength: snapshot.length,
        ContentType: mediaType, CacheControl: 'private, no-store',
        IfNoneMatch: '*', Metadata: { sha256 },
      }), { abortSignal: signal });
    } catch (error) {
      if (httpStatus(error) !== 412) throw error;
      status = 'verified_existing';
    }
    const output = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), { abortSignal: signal });
    const body = output.Body;
    if (!(body instanceof Readable)) throw new R2ArchiveError('integrity');
    const abort = (): void => { body.destroy(new R2ArchiveError('unavailable')); };
    signal.addEventListener('abort', abort, { once: true });
    try {
      if (signal.aborted) throw new R2ArchiveError('unavailable');
      if (output.ContentLength !== snapshot.length || output.ContentType !== mediaType) {
        throw new R2ArchiveError('integrity');
      }
      let size = 0;
      const hash = createHash('sha256');
      for await (const chunk of body) {
        const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
        size += part.length;
        if (size > snapshot.length) throw new R2ArchiveError('integrity');
        hash.update(part);
      }
      if (size !== snapshot.length || hash.digest('hex') !== sha256) throw new R2ArchiveError('integrity');
    } finally {
      signal.removeEventListener('abort', abort);
      body.destroy();
    }
    return { key, sha256, byteSize: snapshot.length, status };
  } catch (error) {
    if (error instanceof R2ArchiveError) throw error;
    // Never expose SDK error text, signed headers, endpoints or credentials.
    throw new R2ArchiveError('unavailable');
  }
}

export function createR2Client(env: NodeJS.ProcessEnv): S3Client {
  const accountId = env.TDN_R2_ACCOUNT_ID;
  const accessKeyId = env.TDN_R2_ACCESS_KEY_ID;
  const secretAccessKey = env.TDN_R2_SECRET_ACCESS_KEY;
  if (env.TDN_R2_ENABLED !== 'true' || !accountId || !/^[0-9a-f]{32}$/.test(accountId) ||
    !accessKeyId || !/^[A-Za-z0-9]{16,128}$/.test(accessKeyId) ||
    !secretAccessKey || !/^[A-Za-z0-9/+_=\-]{32,256}$/.test(secretAccessKey) ||
    env.TDN_R2_BUCKET !== 'tdn-media') throw new R2ArchiveError('configuration');
  return new S3Client({
    region: 'auto', endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true, credentials: { accessKeyId, secretAccessKey },
    maxAttempts: 1,
    requestChecksumCalculation: 'WHEN_REQUIRED', responseChecksumValidation: 'WHEN_REQUIRED',
    requestHandler: { connectionTimeout: 5_000, requestTimeout: TIMEOUT_MS },
  });
}

export function createR2MediaArchive(env: NodeJS.ProcessEnv): { archive: R2MediaArchive; close: () => void } {
  const client = createR2Client(env);
  return { archive: new R2MediaArchive(client, 'tdn-media'), close: () => client.destroy() };
}

function digest(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }
function httpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object' || !('$metadata' in error)) return undefined;
  const metadata = error.$metadata;
  return metadata && typeof metadata === 'object' && 'httpStatusCode' in metadata && typeof metadata.httpStatusCode === 'number'
    ? metadata.httpStatusCode : undefined;
}
