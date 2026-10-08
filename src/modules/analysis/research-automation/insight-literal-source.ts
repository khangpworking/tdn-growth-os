import { createHash } from 'node:crypto';
import type { VerifiedExactShopeeCollection } from '../../foundation/shopee-collection-service.js';
import type { VerifiedSourcePackageFile } from '../../foundation/source-package-service.js';
import { buildResearchReviewCorpus } from './review-corpus.js';
import { mapDamiLocatedReviewSource, type DamiSelectedListing } from './dami-located-review-mapping.js';
import { verifyAutomationDetailCaptures, type VerifyAutomationObservationsInput } from './verified-observations.js';

const rating = (present: boolean, value: unknown) => ({ fieldPresent: present,
  state: !present ? 'ABSENT' as const : value === null ? 'MISSING' as const
    : typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? 'VALID' as const : 'INVALID' as const,
  value: typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 5 ? value : null });
const textState = (text: string | null) => text === null ? 'UNREADABLE' as const : text.trim() ? 'READABLE' as const : 'EMPTY' as const;

/** The Foundation read already authenticates collection membership; corpus replay
 * preserves its native-ID collapse and conflict quarantine. No new raw fields. */
export function exactLiteralReviews(source: VerifiedExactShopeeCollection) {
  const corpus = buildResearchReviewCorpus(source).output;
  const pages = new Map(source.pages.map(page => [page.sha256, JSON.parse(page.bytes.toString('utf8')) as unknown[]]));
  return corpus.records.flatMap(record => record.versions.map(version => {
    const first = version.sourceRefs[0]!;
    const raw = pages.get(first.pageSha256)![first.rowIndex];
    const row = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
    return { sourceKind: 'EXACT_SHOPEE' as const, text: version.text, textState: version.textState,
      rating: rating(row !== null && Object.hasOwn(row, 'ratingStar'), row?.ratingStar),
      admitted: record.disposition === 'RETAINED_RAW' && record.listingAdmission === 'SELECTED_LISTING',
      exclusionReasons: record.disposition === 'UNRESOLVED_CONFLICT' ? ['UNRESOLVED_CONFLICT']
        : record.listingAdmission === 'SELECTED_LISTING' ? [] : [record.listingAdmission],
      sourceRefs: version.sourceRefs.map(ref => ({ sourceSha256: ref.pageSha256,
        rowLocator: ref.rowPointer, textLocator: ref.textPointer, ratingLocator: `${ref.rowPointer}/ratingStar` })) };
  }));
}

/** Uses the reviewed exact native mapping, including actual star-field presence
 * and native-ID conflicts. Empty/unreadable text does not erase a source rating. */
export function nativeLiteralReviews(source: VerifiedSourcePackageFile, selected: DamiSelectedListing) {
  const mapped = mapDamiLocatedReviewSource(source, selected);
  return mapped.mapping.rows.map(row => {
    const record = mapped.records[row.recordIndex]!;
    return { sourceKind: 'NATIVE_SHOPEE' as const, text: record.text, textState: textState(record.text),
      rating: rating(row.ratingPresent, row.ratingStar), admitted: !row.quarantined,
      exclusionReasons: [...(row.rowTypeAdmission === 'REVIEW_ROW' ? [] : [row.rowTypeAdmission]),
        ...(row.listingAdmission === 'SELECTED_LISTING' ? [] : [row.listingAdmission]), ...row.nativeIdConflicts],
      sourceRefs: [{ sourceSha256: source.sha256, rowLocator: row.rowPointer, textLocator: row.textPointer,
        ratingLocator: `${row.rowPointer}/rating_star` }] };
  });
}
export type LiteralReviewInput = ReturnType<typeof exactLiteralReviews>[number] | ReturnType<typeof nativeLiteralReviews>[number];

/** Seller provenance comes solely from successful, approved, request/response-
 * bound product details. Public card wording or review wording is never proof. */
export function literalSellerStatements(input: VerifyAutomationObservationsInput) {
  return verifyAutomationDetailCaptures(input).flatMap(detail => {
    const fields = [{ value: detail.data.product_name, locator: '/data/product_name', sourceType: 'LISTING_TITLE' as const },
      ...(Array.isArray(detail.data.product_description) ? detail.data.product_description.flatMap((block, index) =>
        block !== null && typeof block === 'object' && !Array.isArray(block)
          ? [{ value: (block as Record<string, unknown>).text, locator: `/data/product_description/${index}/text`, sourceType: 'LISTING_DESCRIPTION' as const }] : []) : [])];
    return fields.flatMap(field => typeof field.value === 'string' && field.value.trim() ? [{
      voice: 'SELLER' as const, platform: 'TIKTOK_SHOP' as const, productId: detail.productRef,
      sourceType: field.sourceType, text: field.value, sourceSha256: detail.capture.artifactSha256,
      responseSha256: createHash('sha256').update(detail.responseBytes).digest('hex'), locator: field.locator,
      period: { ...detail.capture.window! }, retrievedAt: detail.capture.retrievedAt,
    }] : []);
  });
}
export type LiteralSellerInput = ReturnType<typeof literalSellerStatements>[number];
