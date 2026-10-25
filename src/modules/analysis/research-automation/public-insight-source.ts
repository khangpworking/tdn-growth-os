import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import projectionSchema from '../../../../contracts/analysis/public-insight-source-projection.schema.json' with { type: 'json' };
import type { PublicInsightSourceProjection } from '../../../../contracts/analysis/public-insight-source-projection.generated.js';
import type { ResearchReviewCorpusV2 } from '../../../../contracts/analysis/research-review-corpus-v2.generated.js';
import type { AutomationTikTokShopReviews } from '../../../../contracts/analysis/automation-tiktok-shop-reviews.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput } from '../located-insight-methods.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: false });
const valid = ajv.compile<PublicInsightSourceProjection>(projectionSchema);
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
function corrupt(): never { throw new TypeError('PUBLIC_INSIGHT_SOURCE_INTEGRITY'); }

/** Logical source paths of the coding input; one per retained page or document. */
export const PUBLIC_INSIGHT_SHOPEE_PAGE_PATH = (pageIndex: number) => `shopee-public/pages/${pageIndex}.json`;
export const PUBLIC_INSIGHT_TIKTOK_SHOP_PATH = 'tiktok-shop/reviews.json';

export interface PublicInsightSourceInput {
  /** The public Shopee corpus, rebuilt and replay-verified by the owning report reader. */
  readonly shopee?: ResearchReviewCorpusV2;
  /** The S06 document, read from its exact artifact and checked against its COLLECTION step pointer. */
  readonly tiktokShop?: { readonly document: AutomationTikTokShopReviews; readonly documentSha256: string };
}

export interface PublicInsightSource {
  readonly input: LocatedInsightMethods['input'];
  readonly projection: PublicInsightSourceProjection;
  /** Set only when every record comes from the verified Shopee corpus; never inferred from text. */
  readonly verifiedPlatform?: 'SHOPEE';
}

type Row = LocatedInsightMethods['input']['records'][number];
type Meta = PublicInsightSourceProjection['records'][number];

/**
 * Deterministic coding source of the free review sources of one run. Shopee records come first (corpus order), then
 * S06 records (product order, then review order). Verbatim text is kept for coding; it is not a report field.
 * No writer name, avatar or raw user id is read: neither source gives a per-writer id, so writerKey is null.
 */
export function projectPublicInsightSource(source: PublicInsightSourceInput): PublicInsightSource {
  if (!source.shopee && !source.tiktokShop) corrupt();
  const sources: LocatedInsightMethods['input']['sources'] = [];
  const records: Row[] = [];
  const metadata: Meta[] = [];
  const push = (row: Row, meta: Omit<Meta, 'recordIndex'>) => { metadata.push({ recordIndex: records.length, ...meta }); records.push(row); };
  if (source.shopee) {
    const corpus = source.shopee;
    const pages = new Map(corpus.sourcePages.map(page => [page.pageIndex, page.sha256]));
    for (const page of corpus.sourcePages) sources.push({ logicalPath: PUBLIC_INSIGHT_SHOPEE_PAGE_PATH(page.pageIndex), sha256: page.sha256 });
    for (const record of corpus.records) {
      const version = record.versions[0];
      const ref = version?.sourceRefs[0];
      const productKey = record.identity.listingKey;
      if (!version || !ref || pages.get(ref.pageIndex) !== ref.pageSha256 || productKey === null || !/^shopee:[1-9][0-9]{0,19}:[1-9][0-9]{0,19}$/.test(productKey)) corrupt();
      const retained = record.disposition === 'RETAINED_RAW';
      const attributesOnly = version.reasons.includes('ATTRIBUTES_ONLY');
      const text = version.text;
      const disposition: Row['disposition'] = text === null ? 'UNREADABLE'
        : retained && version.textState === 'READABLE' && !attributesOnly ? 'INCLUDED' : 'EXCLUDED';
      const dispositionReason = disposition === 'INCLUDED' ? null : text === null ? 'SOURCE_TEXT_UNREADABLE'
        : !retained ? record.disposition : attributesOnly ? 'ATTRIBUTES_ONLY' : 'SOURCE_TEXT_EMPTY';
      push({ sourceSha256: ref.pageSha256, locator: ref.textPointer ?? ref.rowPointer, text, sourceAttribution: 'SHOPEE_SOURCE_REPORTED_REVIEW',
        timeText: null, disposition, dispositionReason },
      { platform: 'SHOPEE', productKey,
        rating: record.versions.length === 1 && version.rating.state === 'VALID' ? version.rating.value : null, writerKey: null });
    }
  }
  if (source.tiktokShop) {
    const { document, documentSha256 } = source.tiktokShop;
    if (!/^[a-f0-9]{64}$/.test(documentSha256)) corrupt();
    sources.push({ logicalPath: PUBLIC_INSIGHT_TIKTOK_SHOP_PATH, sha256: documentSha256 });
    for (const [productIndex, product] of document.products.entries()) {
      const seen = new Map<string, string | null>();
      for (const [reviewIndex, review] of product.reviews.entries()) {
        const text = review.text;
        const prior = seen.has(review.id) ? { text: seen.get(review.id) } : undefined;
        if (!prior) seen.set(review.id, text);
        const disposition: Row['disposition'] = text === null ? 'UNREADABLE' : !prior && text.trim() ? 'INCLUDED' : 'EXCLUDED';
        const dispositionReason = disposition === 'INCLUDED' ? null : text === null ? 'SOURCE_TEXT_UNREADABLE'
          : prior ? prior.text === text ? 'DUPLICATE_SOURCE_NATIVE_RECORD' : 'CONFLICTING_SOURCE_NATIVE_RECORD' : 'SOURCE_TEXT_EMPTY';
        push({ sourceSha256: documentSha256, locator: `/products/${productIndex}/reviews/${reviewIndex}/text`, text,
          sourceAttribution: 'TIKTOK_SHOP_SOURCE_REPORTED_REVIEW', timeText: review.dateRaw?.trim() ? review.dateRaw : null, disposition, dispositionReason },
        // The S06 document carries no star rating (ratingAvailable is false).
        { platform: 'TIKTOK_SHOP', productKey: `tiktok-shop:${product.productId}`, rating: null, writerKey: null });
      }
    }
  }
  const input: LocatedInsightMethods['input'] = {
    contractVersion: '1.0.0', codebookId: 'located-evidence-v1-draft',
    // These are the existing located method constants, not a public-source profile or owner adoption.
    profileSha256: '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded',
    adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7',
    question: null, inclusionRule: 'PUBLIC_REVIEWS_SELECTED_READABLE_RECORD_V1',
    codingUnit: 'LOCATED_RECORD', adjudicationRule: 'PENDING_AI_REQUIRES_EXPLICIT_OWNER_REVIEW',
    sources, records, brief: null, i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], corpora: [], i13Mentions: [],
  };
  validateLocatedInsightInput(input);
  const projection: PublicInsightSourceProjection = { contractVersion: 'public-insight-source-projection-v1',
    shopeePublic: source.shopee ? { corpusId: source.shopee.corpusId, collectionSha256: source.shopee.collectionSha256 } : null,
    tiktokShop: source.tiktokShop ? { documentSha256: source.tiktokShop.documentSha256 } : null, records: metadata };
  if (!valid(projection)) corrupt();
  return { input, projection, ...(metadata.length && metadata.every(row => row.platform === 'SHOPEE') ? { verifiedPlatform: 'SHOPEE' as const } : {}) };
}

/** The binding digest of the projection; the input is bound separately by its own digest. */
export const publicInsightSourceSha256 = (projection: PublicInsightSourceProjection) => digest(projection);

export type { PublicInsightSourceProjection };
