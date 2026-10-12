import { createHash } from 'node:crypto';
import type { FinalizedSourcePackageReader } from '../../foundation/source-package-reader.js';
import type { VerifiedPrivateShopeeCollection } from '../../foundation/shopee-collection-service.js';
import { projectPrivateShopeeCollection } from '../../foundation/shopee-private-projection.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { normalizeMetricWorkbookInput } from '../metric-source-profile.js';
import type { AutomationMetricMethodBridge, MetricRunInput } from './metric-method-bridge.js';

const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const equal = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
type Receipt = ReturnType<typeof normalizeMetricWorkbookInput>['receipt'];

/** Mechanical thresholds from Ultimate 6.3; not a source admission or release policy. */
export const REVIEW_COLLECTION_THRESHOLDS = Object.freeze({ targetReviews: 300, hardMaximum: 500,
  textBatchSize: 25, baselineBatches: 2, maximumNewCodePercent: 5, comparisonTextMinimum: 30 });

/** A read of the existing authenticated method receipt, not a second workbook parser.
 * Original cells remain literal; dates declared by the operator never unlock coverage.
 * This intermediate projection is not a persisted contract or an API admission.
 */
export async function readMetricReviewCoverageBoundary(reader: FinalizedSourcePackageReader,
  bridge: Pick<AutomationMetricMethodBridge, 'verify'>, value: unknown, binding: MetricRunInput) {
  const snapshot = await bridge.verify(value, binding);
  const source = await reader.readFinalizedSourcePackage(snapshot.sourcePackage.packageId,
    { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
  if (!equal(snapshot.sourcePackage, { packageId: source.packageId,
    manifestArtifactSha256: source.manifestArtifactSha256, packageContentSha256: source.packageContentSha256 }))
    throw new Error('Review coverage method package identity differs');
  const file = source.files.find(member => member.path === 'methods/metric-normalization-receipt.json');
  if (!file || file.sha256 !== snapshot.preparation.normalizationReceiptSha256)
    throw new Error('Review coverage normalization receipt identity differs');
  const receipt = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)) as Receipt;
  const profile = snapshot.result.input.profileId;
  const brandColumn = profile === 'metric-shopee-product-list-sheet1-v1' ? 6
    : ['metric-shopee-product-list-sheet1-v2', 'metric-marketplace-product-list-sheet1-v3'].includes(profile) ? 5 : null;
  if (brandColumn === null || receipt.profileId !== profile || receipt.inputSha256 !== snapshot.result.inputSha256 ||
      receipt.sourceSha256 !== snapshot.preparation.selectedSources.workbook.sha256 ||
      !Array.isArray(receipt.evidence) || receipt.evidence.length !== snapshot.result.input.records.length)
    throw new Error('Review coverage original profile or row membership differs');
  const candidates = receipt.evidence.map((row, index) => {
    const record = snapshot.result.input.records[index]!;
    const brand = row.cells[brandColumn];
    if (!brand || row.rowSha256 !== digest(row.cells) || !Number.isSafeInteger(row.row) || row.row < 2 ||
        row.shopId !== record.shopId || row.listingId !== record.listingId || row.locator !== record.source.locator ||
        row.locator !== `Sheet1!A${row.row}:T${row.row}` || row.cells[0]?.value !== record.title)
      throw new Error('Review coverage literal row identity differs');
    return { platform: record.measurement.platform, shopId: record.shopId, listingId: record.listingId,
      title: record.title, source: record.source, revenue: record.revenue, measurement: record.measurement,
      brand: { value: brand.value, cell: structuredClone(brand),
        source: { sourceSha256: receipt.sourceSha256, locator: `Sheet1!${brandColumn === 6 ? 'G' : 'F'}${row.row}` } } };
  });
  return { sourcePackage: snapshot.originalSourcePackage, methodPackage: snapshot.sourcePackage,
    candidates, coverageAvailable: false as const, shortage: 'AUTHENTIC_MEASUREMENT_PERIOD_UNAVAILABLE' as const,
    limits: ['OPERATOR_DECLARED_PERIOD_IS_NOT_AUTHENTICATED', 'CORE_MEMBERSHIP_REQUIRES_EXACT_ACCEPTED_RECEIPTS',
      'LITERAL_BRAND_CELL_IS_NOT_PERSON_OR_CROSS_PLATFORM_IDENTITY'] as const };
}

/** Only finalized sanitized source records enter mechanical sample accounting.
 * Existing capture boundaries remain unchanged; no saturation is invented without coding evidence.
 */
export function privateProductReviewAccounting(source: VerifiedPrivateShopeeCollection) {
  if (source.packet.selected.length !== 1) throw new Error('Review stop accounting requires one exact product listing');
  const projection = projectPrivateShopeeCollection(source);
  const selected = source.packet.selected[0]!;
  const records = projection.records.filter(row => row.shopId === selected.shopId && row.itemId === selected.itemId);
  if (records.length > REVIEW_COLLECTION_THRESHOLDS.hardMaximum)
    throw new Error('Review collection exceeds the unchanged hard maximum');
  const textReviews = records.filter(row => row.admission === 'SELECTED_TEXT').length;
  const stop = records.length >= REVIEW_COLLECTION_THRESHOLDS.targetReviews ? 'A_FIXED_COUNT'
    : source.packet.actor.stopReason === 'dataset_exhausted' ? 'SOURCE_EXHAUSTED'
    : 'CAPTURE_STOPPED_BEFORE_TARGET';
  return { listing: { platform: selected.platform, shopId: selected.shopId, itemId: selected.itemId },
    collectionId: source.packet.collectionId, collectionSha256: source.sha256,
    retainedReviews: records.length, textReviews, targetReviews: REVIEW_COLLECTION_THRESHOLDS.targetReviews,
    hardMaximum: REVIEW_COLLECTION_THRESHOLDS.hardMaximum, meetsComparisonTextMinimum: textReviews >= REVIEW_COLLECTION_THRESHOLDS.comparisonTextMinimum,
    stop, collectorStopReason: source.packet.actor.stopReason, saturation: 'SOURCE_BOUND_CODING_UNAVAILABLE' as const,
    /** Provider dataset size is not a product's total reviews or a platform population. */
    providerDatasetRows: source.packet.actor.providerTotalRows,
    limits: ['RETAINED_CAPTURE_ONLY_NOT_ALL_PLATFORM_REVIEWS', 'NO_PERSON_VERIFICATION', 'NO_REVENUE_COVERAGE_ADMISSION'] as const };
}
