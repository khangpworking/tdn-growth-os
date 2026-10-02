import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/research-review-corpus.schema.json' with { type: 'json' };
import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import type { VerifiedExactShopeeCollection } from '../../foundation/shopee-collection-service.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { selectExactShopeeListings, validateExactShopeeCollection } from '../../foundation/shopee-exact-selection.js';
import { digest, jsonBytes, parseJsonBytes } from '../../foundation/shopee-selection.js';
import { shopeeActorInputSha256 } from '../../../platform/collectors/apify-shopee.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile<ResearchReviewCorpus>(schema);
const MAX_BYTES = 8 * 1024 * 1024;
type RecordGroup = ResearchReviewCorpus['records'][number];
type Version = RecordGroup['versions'][number];
export class ResearchReviewCorpusValidationError extends TypeError {}
function fail(code: string): never { throw new ResearchReviewCorpusValidationError(code); }
const hash = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

function platformId(value: unknown): string | null {
  if (typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value)) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

function nativeId(value: unknown): string | null {
  if (typeof value === 'string' && value.trim() && value.length <= 2000) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

/** Raw structural admission only; the caller supplies the Foundation-verified collection. */
export function buildResearchReviewCorpus(source: VerifiedExactShopeeCollection): { output: ResearchReviewCorpus; bytes: Buffer } {
  const packet = validateExactShopeeCollection(source.packet);
  if (digest(jsonBytes(packet)) !== source.sha256) fail('COLLECTION_DIGEST_MISMATCH');
  const selection = selectExactShopeeListings(source.request);
  if (source.request.runKey !== packet.runKey || canonicalJson(selection.selected) !== canonicalJson(packet.selected) ||
      canonicalJson(selection.warnings) !== canonicalJson(packet.selectionWarnings)) fail('COLLECTION_SELECTION_MISMATCH');
  if (packet.actor.inputSha256 !== shopeeActorInputSha256(packet.selected,
    packet.actor.settings.maxReviewsPerProduct, packet.actor.settings.contentFilter)) fail('COLLECTOR_INPUT_MISMATCH');
  if (source.pages.length !== packet.pages.length) fail('SOURCE_PAGE_MEMBERSHIP_MISMATCH');
  const selectedListings: ResearchReviewCorpus['selectedListings'] = packet.selected.map(row => ({
    platform: row.platform, shopId: row.shopId, itemId: row.itemId,
    listingKey: `shopee:${row.shopId}:${row.itemId}`, productUrl: row.productUrl,
  }));
  const selected = new Set(selectedListings.map(row => row.listingKey));
  const records: RecordGroup[] = [];
  const groups = new Map<string, RecordGroup>();
  const sourcePages: ResearchReviewCorpus['sourcePages'] = [];
  const perListing = new Map<string, number>();
  const blockers = new Set(['CATEGORY_ADMISSION_NOT_PERFORMED', 'SEMANTIC_CODING_NOT_PERFORMED']);
  const coverage: ResearchReviewCorpus['coverage'] = {
    rawRows: 0, recordGroups: 0, collapsedEqualDuplicateRows: 0, conflictingRecordGroups: 0,
    selectedListingRawRows: 0, quarantinedRawRows: 0, readableRawRows: 0, emptyTextRawRows: 0,
    unreadableRawRows: 0, invalidRatingRawRows: 0, missingNativeIdRawRows: 0, unresolvedNativeIdRawRows: 0,
  };
  for (const [pageIndex, page] of source.pages.entries()) {
    const metadata = packet.pages[pageIndex]!;
    if (page.sha256 !== metadata.sha256 || digest(page.bytes) !== metadata.sha256 || page.bytes.length !== metadata.byteSize ||
        page.offset !== metadata.offset || page.offset !== coverage.rawRows) fail('SOURCE_PAGE_INTEGRITY_MISMATCH');
    const rows = parseJsonBytes(page.bytes);
    if (!Array.isArray(rows)) fail('SOURCE_PAGE_NOT_ARRAY');
    if (coverage.rawRows + rows.length > selected.size * packet.actor.settings.maxReviewsPerProduct) fail('SOURCE_ROW_BOUND_EXCEEDED');
    sourcePages.push({ sha256: page.sha256, pageIndex, byteSize: page.bytes.length, offset: page.offset, rowCount: rows.length });
    for (const [rowIndex, raw] of rows.entries()) {
      coverage.rawRows++;
      const row = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : null;
      const shopId = platformId(row?.shopId); const itemId = platformId(row?.itemId);
      const listingKey = shopId && itemId ? `shopee:${shopId}:${itemId}` : null;
      const listingAdmission: RecordGroup['listingAdmission'] = listingKey === null ? 'UNRESOLVED_LISTING'
        : selected.has(listingKey) ? 'SELECTED_LISTING' : 'WRONG_LISTING';
      if (listingAdmission === 'SELECTED_LISTING') {
        coverage.selectedListingRawRows++;
        const count = (perListing.get(listingKey!) ?? 0) + 1;
        if (count > packet.actor.settings.maxReviewsPerProduct) fail('SOURCE_LISTING_ROW_BOUND_EXCEEDED');
        perListing.set(listingKey!, count);
      } else {
        coverage.quarantinedRawRows++;
        blockers.add(listingAdmission === 'WRONG_LISTING' ? 'WRONG_LISTING_ROWS_QUARANTINED' : 'UNRESOLVED_LISTING_ROWS_QUARANTINED');
      }
      const text = typeof row?.comment === 'string' ? row.comment : null;
      const textState: Version['textState'] = text === null ? 'UNREADABLE' : text.trim() ? 'READABLE' : 'EMPTY';
      if (textState === 'READABLE') coverage.readableRawRows++;
      else if (textState === 'EMPTY') { coverage.emptyTextRawRows++; blockers.add('EMPTY_TEXT_ROWS_RETAINED'); }
      else { coverage.unreadableRawRows++; blockers.add('UNREADABLE_ROWS_RETAINED'); }
      const ratingValue = typeof row?.ratingStar === 'number' && Number.isInteger(row.ratingStar) &&
        row.ratingStar >= 1 && row.ratingStar <= 5 ? row.ratingStar : null;
      const ratingState: Version['rating']['state'] = ratingValue !== null ? 'VALID'
        : row?.ratingStar === undefined || row.ratingStar === null ? 'MISSING' : 'INVALID';
      if (ratingState === 'INVALID') { coverage.invalidRatingRawRows++; blockers.add('INVALID_RATING_ROWS_RETAINED'); }
      const nativeReviewId = nativeId(row?.reviewId);
      const missingId = row?.reviewId === undefined || row.reviewId === null;
      if (missingId) { coverage.missingNativeIdRawRows++; blockers.add('MISSING_NATIVE_REVIEW_ID'); }
      else if (nativeReviewId === null) { coverage.unresolvedNativeIdRawRows++; blockers.add('UNRESOLVED_NATIVE_REVIEW_ID'); }
      const sourceRef: Version['sourceRefs'][number] = { pageSha256: page.sha256, pageIndex, rowIndex,
        rowPointer: `/${rowIndex}`, textPointer: text === null ? null : `/${rowIndex}/comment` };
      const reasons = [...(listingAdmission === 'SELECTED_LISTING' ? [] : [listingAdmission]),
        ...(textState === 'READABLE' ? [] : [textState === 'EMPTY' ? 'EMPTY_TEXT' : 'UNREADABLE_TEXT']),
        ...(ratingState === 'VALID' ? [] : [ratingState === 'MISSING' ? 'RATING_MISSING' : 'RATING_INVALID']),
        ...(nativeReviewId !== null ? [] : [missingId ? 'NATIVE_ID_MISSING' : 'NATIVE_ID_UNRESOLVED'])];
      const version: Version = { rawRowSha256: hash(raw), text, textState, rating: { state: ratingState, value: ratingValue },
        sourceRefs: [sourceRef], reasons };
      // Missing listing identity never merges native IDs across unidentified listings.
      const groupKey = nativeReviewId && listingKey ? canonicalJson([listingKey, nativeReviewId]) : null;
      const previous = groupKey === null ? undefined : groups.get(groupKey);
      if (previous) {
        previous.occurrenceCount++;
        const equal = previous.versions.find(candidate => candidate.rawRowSha256 === version.rawRowSha256);
        if (equal) { equal.sourceRefs.push(sourceRef); coverage.collapsedEqualDuplicateRows++; }
        else {
          previous.versions.push(version);
          previous.disposition = 'UNRESOLVED_CONFLICT';
          blockers.add('CONFLICTING_NATIVE_REVIEW_RECORDS');
        }
      } else {
        const record: RecordGroup = {
          identity: { kind: nativeReviewId !== null ? 'NATIVE_REVIEW_ID' : missingId ? 'SOURCE_ROW_LOCATOR' : 'UNRESOLVED',
            nativeReviewId, listingKey, internalLocator: missingId ? `collection:${packet.collectionId}:page:${pageIndex}:row:${rowIndex}` : null },
          listingAdmission, disposition: listingAdmission === 'SELECTED_LISTING' ? 'RETAINED_RAW' : 'QUARANTINED',
          occurrenceCount: 1, versions: [version],
        };
        records.push(record);
        if (groupKey !== null) groups.set(groupKey, record);
      }
    }
  }
  if (packet.actor.providerTotalRows !== null && packet.actor.providerTotalRows < coverage.rawRows) fail('PROVIDER_ROW_TOTAL_MISMATCH');
  coverage.recordGroups = records.length;
  coverage.conflictingRecordGroups = records.filter(row => row.disposition === 'UNRESOLVED_CONFLICT').length;
  if (packet.actor.stopReason !== 'fixture_complete' && packet.actor.stopReason !== 'dataset_exhausted') blockers.add('CAPTURE_NOT_EXHAUSTED');
  const body: Omit<ResearchReviewCorpus, 'corpusId'> = {
    contractVersion: 'research-review-corpus-v1', mappingRevision: 'apify-shopee-review-row-v1',
    collectionId: packet.collectionId, collectionSha256: source.sha256,
    requestSha256: packet.requestSha256, selectionBasis: packet.selectionBasis, selectedListings, sourcePages,
    capture: { mode: packet.mode, actorStatus: packet.actor.status, stopReason: packet.actor.stopReason, warnings: [...packet.collectorWarnings] },
    corpusState: 'RAW_CAPTURE_ONLY', codingState: 'NOT_CODED', records, coverage, blockers: [...blockers],
    limitations: ['STRUCTURAL_LISTING_MATCH_NOT_PRODUCT_USE_OR_SEMANTIC_ADMISSION', 'REVIEW_RECORDS_NOT_UNIQUE_PEOPLE',
      'CAPTURE_WINDOW_NOT_REVIEW_DATE_OR_VARIANT_SELECTION', 'NO_SOURCE_AUTHENTICATION_OR_REPRESENTATIVENESS_ATTESTATION',
      'NO_CALCIUM_FILTER_OR_CATEGORY_CODEBOOK_APPLIED', 'NO_COMPLETE_I03_I10_I17_OR_REPORT_CLAIM'],
  };
  const output: ResearchReviewCorpus = { ...body, corpusId: hash(body) };
  if (!validate(output)) fail(`INVALID_RESEARCH_REVIEW_CORPUS:${ajv.errorsText(validate.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  if (bytes.length > MAX_BYTES) fail('REVIEW_CORPUS_OUTPUT_TOO_LARGE');
  return { output, bytes };
}

/** Binds the entire snapshot to the reread source; does not accept a self-issued digest as admission. */
export function verifyResearchReviewCorpus(untrusted: unknown, source: VerifiedExactShopeeCollection): { output: ResearchReviewCorpus; bytes: Buffer } {
  if (Buffer.byteLength(canonicalJson(untrusted)) > MAX_BYTES) fail('REVIEW_CORPUS_OUTPUT_TOO_LARGE');
  if (!validate(untrusted)) fail(`INVALID_RESEARCH_REVIEW_CORPUS:${ajv.errorsText(validate.errors)}`);
  const rebuilt = buildResearchReviewCorpus(source);
  if (canonicalJson(untrusted) !== canonicalJson(rebuilt.output)) fail('REVIEW_CORPUS_REPLAY_MISMATCH');
  return rebuilt;
}
