import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { VerifiedSourcePackageFile } from '../../foundation/source-package-service.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
ajv.addSchema(schema);
type Record = LocatedInsightMethods['input']['records'][number];
const validateRecord = ajv.getSchema<Record>(`${schema.$id}#/$defs/record`)!;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_RECORDS = 10_000;
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export class DamiLocatedReviewMappingError extends TypeError {}
function fail(code: string): never { throw new DamiLocatedReviewMappingError(code); }
export interface DamiSelectedListing { shopId: string; itemId: string }
export interface DamiMappedReviewRow {
  recordIndex: number;
  rowPointer: string;
  textPointer: string;
  rowTypePresent: boolean;
  originalRowType: unknown;
  rowTypeAdmission: 'REVIEW_ROW' | 'NON_REVIEW_ROW' | 'UNRESOLVED_ROW_TYPE';
  shopId: string | null;
  itemId: string | null;
  listingAdmission: 'SELECTED_LISTING' | 'WRONG_LISTING' | 'UNRESOLVED_LISTING';
  nativeReviewId: string | null;
  nativeIdState: 'VALID' | 'MISSING' | 'UNRESOLVED';
  originalNativeReviewId: unknown;
  ratingPresent: boolean;
  ratingStar: unknown;
  reviewDatePresent: boolean;
  originalReviewDate: unknown;
  sourceReviewDate: string | null;
  ctimePresent: boolean;
  ctime: unknown;
  collectedAtPresent: boolean;
  collectedAt: unknown;
  modelNamePresent: boolean;
  modelName: unknown;
  nativeIdConflicts: ('NATIVE_ID_TEXT_CONFLICT' | 'NATIVE_ID_RATING_CONFLICT' | 'NATIVE_ID_LISTING_CONFLICT')[];
  quarantined: boolean;
}
export interface DamiLocatedReviewMapping {
  mappingRevision: 'dami-shop-sweep-review-row-v1';
  source: { logicalPath: string; sha256: string; byteSize: number; providerProvenance: VerifiedSourcePackageFile['providerProvenance'] };
  selected: DamiSelectedListing;
  rows: DamiMappedReviewRow[];
  coverage: {
    rawRows: number; includedRows: number; excludedRows: number; unreadableRows: number;
    emptyTextRows: number; wrongListingRows: number; unresolvedListingRows: number; nativeIdConflictRows: number;
    nonReviewRows: number; unresolvedRowTypeRows: number;
  };
  limitations: string[];
}

function id(value: unknown): string | null {
  if (typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value)) return value;
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}
type SourceRow = { [key: string]: unknown };
const original = (row: SourceRow, key: string): unknown => Object.hasOwn(row, key) ? row[key] : null;

/** Maps exact Dami row fields only; source authenticity and scope admission remain caller-owned. */
export function mapDamiLocatedReviewSource(
  source: VerifiedSourcePackageFile,
  selected: DamiSelectedListing,
): { records: LocatedInsightMethods['input']['records']; mapping: DamiLocatedReviewMapping } {
  if (typeof selected.shopId !== 'string' || typeof selected.itemId !== 'string' ||
    id(selected.shopId) !== selected.shopId || id(selected.itemId) !== selected.itemId) fail('DAMI_SELECTED_LISTING_ID_INVALID');
  if (source.mediaType !== 'application/json') fail('DAMI_JSON_SOURCE_REQUIRED');
  if (!(source.bytes instanceof Uint8Array) || source.bytes.byteLength > MAX_BYTES) fail('DAMI_SOURCE_SIZE_INVALID');
  if (!Number.isSafeInteger(source.byteSize) || source.byteSize !== source.bytes.byteLength || sha(source.bytes) !== source.sha256)
    fail('DAMI_SOURCE_BYTES_MISMATCH');
  let decoded: string;
  try { decoded = new TextDecoder('utf-8', { fatal: true }).decode(source.bytes); }
  catch { return fail('DAMI_SOURCE_NOT_UTF8'); }
  let parsed: unknown;
  try { parsed = JSON.parse(decoded); } catch { return fail('DAMI_SOURCE_NOT_JSON'); }
  if (!Array.isArray(parsed)) fail('DAMI_SOURCE_NOT_ARRAY');
  if (parsed.length > MAX_RECORDS) fail('DAMI_SOURCE_RECORD_LIMIT');
  const records: Record[] = [];
  const rows: DamiMappedReviewRow[] = [];
  const groups = new Map<string, { indexes: number[]; texts: Set<string>; ratings: Set<string>; listings: Set<string> }>();
  for (const [recordIndex, raw] of parsed.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`DAMI_ROW_NOT_OBJECT:${recordIndex}`);
    const row = raw as SourceRow;
    if (!Object.hasOwn(row, 'comment')) fail(`DAMI_COMMENT_POINTER_MISSING:${recordIndex}`);
    if (row.comment !== null && typeof row.comment !== 'string') fail(`DAMI_COMMENT_TYPE_UNSUPPORTED:${recordIndex}`);
    const text = row.comment as string | null;
    const rowTypeAdmission: DamiMappedReviewRow['rowTypeAdmission'] = row.type === 'review' ? 'REVIEW_ROW'
      : typeof row.type === 'string' ? 'NON_REVIEW_ROW' : 'UNRESOLVED_ROW_TYPE';
    const shopId = id(row.shopid); const itemId = id(row.itemid);
    const listingAdmission: DamiMappedReviewRow['listingAdmission'] = shopId === null || itemId === null ? 'UNRESOLVED_LISTING'
      : shopId === selected.shopId && itemId === selected.itemId ? 'SELECTED_LISTING' : 'WRONG_LISTING';
    const nativeReviewId = id(row.cmtid);
    const nativeIdState: DamiMappedReviewRow['nativeIdState'] = nativeReviewId !== null ? 'VALID'
      : row.cmtid === null || !Object.hasOwn(row, 'cmtid') ? 'MISSING' : 'UNRESOLVED';
    const sourceReviewDate = typeof row.review_date === 'string' && row.review_date.length > 0 ? row.review_date : null;
    const reasons = [
      ...(rowTypeAdmission === 'REVIEW_ROW' ? [] : [rowTypeAdmission]),
      ...(listingAdmission === 'SELECTED_LISTING' ? [] : [listingAdmission]),
      ...(text === null ? ['UNREADABLE_TEXT'] : !text.trim() ? ['EMPTY_TEXT'] : []),
    ];
    const record: Record = {
      sourceSha256: source.sha256, locator: `/${recordIndex}/comment`, text,
      sourceAttribution: 'Dami shop-sweep row; structural listing match, authors, dates and complete history not independently verified',
      timeText: sourceReviewDate,
      disposition: text === null ? 'UNREADABLE' : reasons.length ? 'EXCLUDED' : 'INCLUDED',
      dispositionReason: reasons.length ? reasons.join(',') : null,
    };
    if (!validateRecord(record)) fail(`DAMI_LOCATED_RECORD_INVALID:${recordIndex}`);
    records.push(record);
    rows.push({ recordIndex, rowPointer: `/${recordIndex}`, textPointer: record.locator,
      rowTypePresent: Object.hasOwn(row, 'type'), originalRowType: original(row, 'type'), rowTypeAdmission,
      shopId, itemId, listingAdmission,
      nativeReviewId, nativeIdState, originalNativeReviewId: original(row, 'cmtid'),
      ratingPresent: Object.hasOwn(row, 'rating_star'), ratingStar: original(row, 'rating_star'),
      reviewDatePresent: Object.hasOwn(row, 'review_date'), originalReviewDate: original(row, 'review_date'), sourceReviewDate,
      ctimePresent: Object.hasOwn(row, 'ctime'), ctime: original(row, 'ctime'),
      collectedAtPresent: Object.hasOwn(row, 'collected_at'), collectedAt: original(row, 'collected_at'),
      modelNamePresent: Object.hasOwn(row, 'model_name'), modelName: original(row, 'model_name'),
      nativeIdConflicts: [], quarantined: rowTypeAdmission !== 'REVIEW_ROW' || listingAdmission !== 'SELECTED_LISTING',
    });
    if (nativeReviewId !== null) {
      const group = groups.get(nativeReviewId) ?? { indexes: [], texts: new Set<string>(), ratings: new Set<string>(), listings: new Set<string>() };
      group.indexes.push(recordIndex);
      group.texts.add(canonicalJson(text));
      group.ratings.add(canonicalJson([Object.hasOwn(row, 'rating_star'), original(row, 'rating_star')]));
      group.listings.add(canonicalJson([shopId, itemId]));
      groups.set(nativeReviewId, group);
    }
  }
  for (const group of groups.values()) {
    const conflicts: DamiMappedReviewRow['nativeIdConflicts'] = [
      ...(group.texts.size > 1 ? ['NATIVE_ID_TEXT_CONFLICT' as const] : []),
      ...(group.ratings.size > 1 ? ['NATIVE_ID_RATING_CONFLICT' as const] : []),
      ...(group.listings.size > 1 ? ['NATIVE_ID_LISTING_CONFLICT' as const] : []),
    ];
    if (!conflicts.length) continue;
    for (const index of group.indexes) {
      const record = records[index]!; const mapped = rows[index]!;
      mapped.nativeIdConflicts = [...conflicts]; mapped.quarantined = true;
      if (record.text !== null) record.disposition = 'EXCLUDED';
      record.dispositionReason = [record.dispositionReason, ...conflicts].filter(Boolean).join(',');
    }
  }
  const mapping: DamiLocatedReviewMapping = {
    mappingRevision: 'dami-shop-sweep-review-row-v1',
    source: { logicalPath: source.path, sha256: source.sha256, byteSize: source.byteSize, providerProvenance: source.providerProvenance },
    selected: { shopId: selected.shopId, itemId: selected.itemId }, rows,
    coverage: {
      rawRows: records.length, includedRows: records.filter(record => record.disposition === 'INCLUDED').length,
      excludedRows: records.filter(record => record.disposition === 'EXCLUDED').length,
      unreadableRows: records.filter(record => record.disposition === 'UNREADABLE').length,
      emptyTextRows: records.filter(record => record.text !== null && !record.text.trim()).length,
      wrongListingRows: rows.filter(row => row.listingAdmission === 'WRONG_LISTING').length,
      unresolvedListingRows: rows.filter(row => row.listingAdmission === 'UNRESOLVED_LISTING').length,
      nativeIdConflictRows: rows.filter(row => row.nativeIdConflicts.length > 0).length,
      nonReviewRows: rows.filter(row => row.rowTypeAdmission === 'NON_REVIEW_ROW').length,
      unresolvedRowTypeRows: rows.filter(row => row.rowTypeAdmission === 'UNRESOLVED_ROW_TYPE').length,
    },
    limitations: [
      'DAMI_SHOP_SWEEP_SELECTED_LISTING_SUBSET_NOT_FULL_REVIEW_HISTORY',
      'STRUCTURAL_ROW_MAPPING_NOT_PROVIDER_ACTOR_INPUT_OR_AUTHOR_AUTHENTICATION',
      'REVIEW_DATE_AND_CTIME_PROVIDER_REPORTED_NOT_INDEPENDENT_EVENT_DATE_ATTESTATION',
      'ORIGINAL_REVIEW_DATE_STRING_ONLY_NO_CTIME_OR_ACQUISITION_DATE_SUBSTITUTION',
      'NO_PERIOD_WIDE_CATEGORY_VARIANT_OR_COMPLETE_COVERAGE_ADMISSION',
      'RATING_STAR_VALUE_AND_TYPE_RETAINED_NOT_TEXTUAL_SENTIMENT',
      'NATIVE_IDS_AND_EQUAL_DUPLICATE_ROWS_NOT_UNIQUE_PEOPLE_OR_REPRESENTATIVE_COUNTS',
      'NO_SEMANTIC_ANNOTATIONS_OR_PROVENANCE_APPROVAL_CREATED',
    ],
  };
  if (Buffer.byteLength(canonicalJson({ records, mapping })) > MAX_BYTES) fail('DAMI_MAPPING_OUTPUT_TOO_LARGE');
  return { records, mapping };
}
