import { S3Client } from '@aws-sdk/client-s3';
import { copyVerifiedObject, createR2Client, R2ArchiveError } from './r2-media-archive.js';

export const RESEARCH_ARCHIVE_MAX_BYTES = 32 * 1024 * 1024;
export const RESEARCH_ARCHIVE_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'application/json',
  'image/jpeg',
  'image/png',
] as const;
export type ResearchType = (typeof RESEARCH_ARCHIVE_TYPES)[number];

/** Explicit research-evidence copy only. No delete, no list, no public URL. */
export class R2ResearchArchive {
  constructor(private readonly client: S3Client, private readonly bucket: string) {
    if (bucket !== 'tdn-media') throw new R2ArchiveError('configuration');
  }

  async copy(bytes: Buffer, sha256: string, mediaType: ResearchType): Promise<{
    key: string; sha256: string; byteSize: number; status: 'copied' | 'verified_existing';
  }> {
    const key = `tdn/v1/research/sha256/${sha256.slice(0, 2)}/${sha256}`;
    return copyVerifiedObject(this.client, this.bucket, {
      key, bytes, sha256, mediaType, maxBytes: RESEARCH_ARCHIVE_MAX_BYTES, allowedTypes: RESEARCH_ARCHIVE_TYPES,
    });
  }
}

export function createR2ResearchArchive(env: NodeJS.ProcessEnv): { archive: R2ResearchArchive; close: () => void } {
  const client = createR2Client(env);
  return { archive: new R2ResearchArchive(client, 'tdn-media'), close: () => client.destroy() };
}
