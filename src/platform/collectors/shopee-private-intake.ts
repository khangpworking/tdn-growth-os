import { createHmac } from 'node:crypto';
import { validatePrivateProfile, validatePrivateRows } from '../../modules/foundation/shopee-private-contracts.js';
import { jsonBytes, parseJsonBytes } from '../../modules/foundation/shopee-selection.js';

/** Fixed, publicly documented authorId binding. Names and locators are never fallback IDs. */
export const SHOPEE_PRIVATE_MAPPING = Object.freeze({
  profileVersion: 'shopee-author-id-hmac-v1' as const,
  platform: 'shopee' as const,
  namespace: 'tdn:shopee.vn:author:v1' as const,
  field: 'authorId' as const,
  algorithm: 'HMAC-SHA256' as const,
  documentationUrl: 'https://apify.com/zen-studio/shopee-product-reviews-scraper' as const,
  documentationSha256: '798f1078e4b52991129ec29d34346cf3980495061fc14f0026c3fe4c0578d1c6' as const,
  documentationRetrievedAt: '2026-10-08' as const,
});

/** Configuration is explicit and local, never an environment/default salt. keyId is a public UUID, not key material. */
export function createShopeePrivateIntake(configuration: { salt: Uint8Array; keyId: string }) {
  if (!(configuration.salt instanceof Uint8Array) || configuration.salt.byteLength < 32 ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(configuration.keyId)) {
    throw new TypeError('Private intake requires at least 32 salt bytes and a separate nonsecret key UUID');
  }
  // HMAC-SHA256 key length is an engineering minimum, not a business sampling default.
  const salt = Buffer.from(configuration.salt);
  if (['utf8', 'hex', 'base64', 'base64url'].some(encoding => salt.toString(encoding as BufferEncoding) === configuration.keyId)) {
    throw new TypeError('Private key identifier must not contain salt material');
  }
  const profile = Object.freeze(validatePrivateProfile({ ...SHOPEE_PRIVATE_MAPPING, keyId: configuration.keyId,
    // Opaque key-continuity witness, independent of author IDs and public UUID.
    keyCommitment: createHmac('sha256', salt).update('tdn:shopee.vn:key-continuity:v1').digest('hex') }));
  const sanitizePage = (bytes: Buffer): Buffer => {
    const values = parseJsonBytes(bytes);
    if (!Array.isArray(values) || values.length > 2500) throw new TypeError('Invalid bounded private Shopee page');
    const rows = values.map(value => {
      const row = value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : {};
      const authorId = sourceId(row.authorId);
      const identity = authorId === null
        ? { state: Object.hasOwn(row, 'authorId') ? 'INVALID' as const : 'MISSING' as const, hash: null }
        : { state: 'HASHED' as const, hash: createHmac('sha256', salt)
          .update(profile.namespace).update('\0').update(authorId).digest('hex') };
      if (typeof row.comment === 'string' && row.comment.length > 20000) throw new TypeError('Private review text exceeds supported source bound');
      // A closed metadata allowlist. Free prose is deliberately verbatim and may itself contain PII.
      return { reviewId: sourceId(row.reviewId), shopId: sourceId(row.shopId), itemId: sourceId(row.itemId),
        rating: { fieldPresent: Object.hasOwn(row, 'ratingStar'),
          state: !Object.hasOwn(row, 'ratingStar') ? 'ABSENT' as const : row.ratingStar === null ? 'MISSING' as const
            : typeof row.ratingStar === 'number' && Number.isInteger(row.ratingStar) && row.ratingStar >= 1 && row.ratingStar <= 5 ? 'VALID' as const : 'INVALID' as const,
          value: typeof row.ratingStar === 'number' && Number.isFinite(row.ratingStar) && Math.abs(row.ratingStar) <= Number.MAX_SAFE_INTEGER ? row.ratingStar : null },
        comment: typeof row.comment === 'string' ? row.comment : null,
        createdAt: typeof row.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(row.createdAt) && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : null,
        region: typeof row.region === 'string' && /^[A-Z]{2}$/.test(row.region) ? row.region : null,
        authorIdentity: identity };
    });
    return jsonBytes(validatePrivateRows(rows));
  };
  // Neither the copied salt nor a hash-to-raw map is returned or retained.
  return Object.freeze({ profile, sanitizePage });
}

export type ShopeePrivateIntake = ReturnType<typeof createShopeePrivateIntake>;

function sourceId(value: unknown): string | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
  return typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) ? value : null;
}
