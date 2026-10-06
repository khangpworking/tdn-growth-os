import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/index.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { ReaderReportInputError, verifyReaderProfile } from './build.js';
import type { CoverImage } from './layout.js';

// Profile and cover photo of a reader report live in the artifact store, so a
// build reads only local bytes: no network fetch, no path outside the store.

export type ReaderAssetErrorCode =
  | 'PROFILE_INVALID' | 'COVER_TYPE' | 'COVER_TOO_LARGE' | 'COVER_META_INVALID' | 'COVER_HASH_MISMATCH' | 'ASSET_MISSING';
export class ReaderAssetError extends Error {
  constructor(readonly code: ReaderAssetErrorCode, message: string) { super(message); }
}

export type ReaderProfile = ReaderReportInput['profile'];
export type CoverLicence = 'CC0' | 'public-domain' | 'owner-supplied';
export type StoredCoverImage = { coverSha256: string; imageSha256: string; mime: CoverImage['mime'] };

const PROFILE_CONTRACT = 'reader-profile-v1';
const COVER_CONTRACT = 'reader-cover-v1';
const PROFILE_MAX_BYTES = 1024 * 1024;
const COVER_META_MAX_BYTES = 64 * 1024;
export const READER_COVER_MAX_BYTES = 3 * 1024 * 1024;
const CREDIT_MAX_CHARS = 200;
const LICENCES: readonly CoverLicence[] = ['CC0', 'public-domain', 'owner-supplied'];
const DIGEST = /^[0-9a-f]{64}$/;

function verifiedProfile(value: unknown): ReaderProfile {
  try { return verifyReaderProfile(value); } catch (error) {
    if (error instanceof ReaderReportInputError) throw new ReaderAssetError('PROFILE_INVALID', error.message);
    throw error;
  }
}

/** Stores the canonical profile; the same profile with keys in another order yields the same sha. */
export async function storeReaderProfile(store: ContentAddressedArtifactStore, profile: unknown): Promise<{ sha256: string; status: ReaderProfile['status'] }> {
  const verified = verifiedProfile(profile);
  const stored = await store.put(Buffer.from(canonicalJson({ contractVersion: PROFILE_CONTRACT, profile: verified }), 'utf8'));
  return { sha256: stored.sha256, status: verified.status };
}

export async function loadReaderProfile(store: ContentAddressedArtifactStore, sha256: string): Promise<ReaderProfile> {
  const value = parseJson(await readAsset(store, sha256, PROFILE_MAX_BYTES), 'PROFILE_INVALID');
  if (!isRecord(value) || value.contractVersion !== PROFILE_CONTRACT || Object.keys(value).length !== 2) {
    throw new ReaderAssetError('PROFILE_INVALID', 'tệp profile bản đọc sai khuôn');
  }
  return verifiedProfile(value.profile);
}

/** Identifies the image by its leading bytes, never by a file name; SVG and anything else are refused. */
export function sniffCoverMime(bytes: Uint8Array): CoverImage['mime'] | null {
  const at = (offset: number, sig: readonly number[]) => sig.every((b, i) => bytes[offset + i] === b);
  if (at(0, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (bytes.length >= 12 && at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50])) return 'image/webp';
  return null;
}

export async function storeCoverImage(
  store: ContentAddressedArtifactStore, bytes: Uint8Array, meta: { licence: CoverLicence; credit?: string },
): Promise<StoredCoverImage> {
  if (!LICENCES.includes(meta.licence)) throw new ReaderAssetError('COVER_META_INVALID', 'giấy phép ảnh bìa không hợp lệ');
  if (meta.credit !== undefined && (typeof meta.credit !== 'string' || meta.credit.length > CREDIT_MAX_CHARS)) {
    throw new ReaderAssetError('COVER_META_INVALID', `ghi công ảnh bìa tối đa ${CREDIT_MAX_CHARS} ký tự`);
  }
  if (bytes.byteLength > READER_COVER_MAX_BYTES) throw new ReaderAssetError('COVER_TOO_LARGE', 'ảnh bìa vượt 3 MiB');
  const mime = sniffCoverMime(bytes);
  if (!mime) throw new ReaderAssetError('COVER_TYPE', 'ảnh bìa phải là JPEG, PNG hoặc WebP');
  const image = await store.put(bytes);
  const sidecar = await store.put(Buffer.from(canonicalJson({
    contractVersion: COVER_CONTRACT, imageSha256: image.sha256, mime, byteLength: bytes.byteLength, licence: meta.licence,
    ...(meta.credit === undefined ? {} : { credit: meta.credit }),
  }), 'utf8'));
  return { coverSha256: sidecar.sha256, imageSha256: image.sha256, mime };
}

export async function loadCoverImage(store: ContentAddressedArtifactStore, coverSha256: string): Promise<CoverImage> {
  const meta = parseJson(await readAsset(store, coverSha256, COVER_META_MAX_BYTES), 'COVER_META_INVALID');
  const allowed = new Set(['contractVersion', 'imageSha256', 'mime', 'byteLength', 'licence', 'credit']);
  if (!isRecord(meta) || Object.keys(meta).some(k => !allowed.has(k)) || meta.contractVersion !== COVER_CONTRACT
    || typeof meta.imageSha256 !== 'string' || !DIGEST.test(meta.imageSha256)
    || (meta.mime !== 'image/jpeg' && meta.mime !== 'image/png' && meta.mime !== 'image/webp')
    || !Number.isSafeInteger(meta.byteLength) || (meta.byteLength as number) < 1 || (meta.byteLength as number) > READER_COVER_MAX_BYTES
    || !LICENCES.includes(meta.licence as CoverLicence)
    || (meta.credit !== undefined && (typeof meta.credit !== 'string' || meta.credit.length > CREDIT_MAX_CHARS))) {
    throw new ReaderAssetError('COVER_META_INVALID', 'tệp mô tả ảnh bìa sai khuôn');
  }
  const bytes = await readAsset(store, meta.imageSha256, READER_COVER_MAX_BYTES);
  if (bytes.byteLength !== meta.byteLength || sniffCoverMime(bytes) !== meta.mime) {
    throw new ReaderAssetError('COVER_HASH_MISMATCH', 'ảnh bìa không khớp tệp mô tả');
  }
  return { bytes, mime: meta.mime };
}

async function readAsset(store: ContentAddressedArtifactStore, sha256: string, maxBytes: number): Promise<Buffer> {
  if (!DIGEST.test(sha256)) throw new ReaderAssetError('ASSET_MISSING', 'mã artifact không hợp lệ');
  try { return await store.read(sha256, { maxBytes }); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new ReaderAssetError('ASSET_MISSING', `không tìm thấy artifact ${sha256}`);
    throw error;
  }
}

function parseJson(bytes: Buffer, code: ReaderAssetErrorCode): unknown {
  try { return JSON.parse(bytes.toString('utf8')); } catch { throw new ReaderAssetError(code, 'tệp artifact không phải JSON hợp lệ'); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
