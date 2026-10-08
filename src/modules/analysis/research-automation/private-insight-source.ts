import { createHash } from 'node:crypto';
import type { ResearchPrivateReviewCorpus } from '../../../../contracts/analysis/research-private-review-corpus.generated.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput } from '../located-insight-methods.js';
import { buildPrivateReviewReportView } from './private-review-corpus.js';
import { privateReviewReportView } from './private-review-contracts.js';

const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
function corrupt(): never { throw new TypeError('PRIVATE_INSIGHT_SOURCE_INTEGRITY'); }

/**
 * Server-side projection after the owning reader authenticates the retained corpus.
 * The corpus is never returned: only closed source evidence crosses into coding.
 * Native review IDs are used locally for record deduplication, never person joins.
 * Verbatim free text is deliberately preserved; this is not free-text PII redaction.
 */
export function projectPrivateInsightSource(corpus: ResearchPrivateReviewCorpus, verifiedView: PrivateReviewReportView) {
  privateReviewReportView(verifiedView);
  const expected = buildPrivateReviewReportView(corpus);
  if (canonicalJson(expected) !== canonicalJson(verifiedView) ||
      corpus.projection.collectionId !== corpus.collection.collectionId ||
      corpus.projection.collectionSha256 !== corpus.collection.collectionSha256) corrupt();
  const view = expected;
  const pages = new Map<number, string>();
  const locators = new Set<string>();
  const firstNative = new Map<string, { index: number; evidence: string }>();
  const metadata = view.records.map((record, recordIndex) => {
    const row = corpus.projection.records[recordIndex]!;
    const locator = record.locator;
    if (locator.collectionId !== view.corpus.collectionId || locator.textPointer !== `/${locator.rowIndex}/comment`) corrupt();
    if (pages.has(locator.pageIndex) && pages.get(locator.pageIndex) !== locator.pageSha256) corrupt();
    pages.set(locator.pageIndex, locator.pageSha256);
    const identity = canonicalJson(locator);
    if (locators.has(identity)) corrupt();
    locators.add(identity);
    let duplicateOfRecordIndex: number | null = null;
    if (row.reviewId !== null && row.shopId !== null && row.itemId !== null) {
      const native = canonicalJson([row.shopId, row.itemId, row.reviewId]);
      // A changed source-visible version of one native ID is not silently discarded.
      const evidence = canonicalJson([record.text, record.textState, record.rating, record.createdAt, record.region, record.admission]);
      const first = firstNative.get(native);
      if (first && first.evidence !== evidence) corrupt();
      if (first) duplicateOfRecordIndex = first.index;
      else firstNative.set(native, { index: recordIndex, evidence });
    }
    return { recordIndex, recordId: record.recordId, shopId: record.shopId, itemId: record.itemId,
      textState: record.textState, rating: structuredClone(record.rating), region: record.region,
      admission: record.admission, locator: structuredClone(locator), duplicateOfRecordIndex };
  });
  const input: LocatedInsightMethods['input'] = {
    contractVersion: '1.0.0', codebookId: 'located-evidence-v1-draft',
    // These are the existing located method constants, not a private-source profile or owner adoption.
    profileSha256: '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded',
    adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7',
    question: null, inclusionRule: 'PRIVATE_SHOPEE_SELECTED_READABLE_NATIVE_RECORD_V1',
    codingUnit: 'LOCATED_RECORD', adjudicationRule: 'PENDING_AI_REQUIRES_EXPLICIT_OWNER_REVIEW',
    sources: [...pages.entries()].sort(([a], [b]) => a - b).map(([index, sha256]) => ({ logicalPath: `private/pages/${index}.json`, sha256 })),
    records: view.records.map((record, index) => {
      const duplicate = metadata[index]!.duplicateOfRecordIndex !== null;
      const disposition = record.text === null ? 'UNREADABLE' as const
        : record.admission !== 'SELECTED_TEXT' || duplicate ? 'EXCLUDED' as const : 'INCLUDED' as const;
      return { sourceSha256: record.locator.pageSha256,
        locator: `/pages/${record.locator.pageIndex}/rows/${record.locator.rowIndex}/comment`,
        text: record.text, sourceAttribution: 'SHOPEE_SOURCE_REPORTED_REVIEW', timeText: record.createdAt,
        disposition, dispositionReason: disposition === 'INCLUDED' ? null
          : duplicate ? 'DUPLICATE_SOURCE_NATIVE_RECORD' : record.text === null ? 'SOURCE_TEXT_UNREADABLE' : record.admission };
    }),
    brief: null, i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], corpora: [], i13Mentions: [],
  };
  validateLocatedInsightInput(input);
  const output = { contractVersion: 'private-insight-source-projection-v1' as const,
    corpus: structuredClone(view.corpus), input, records: metadata };
  return { output, sha256: digest(output) };
}

export type PrivateInsightSourceProjection = ReturnType<typeof projectPrivateInsightSource>['output'];
