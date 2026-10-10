import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';

/**
 * Eligible-only replay of a retained U22 private-review view for draft coding. Only SELECTED_TEXT
 * rows with readable non-null text reach the model; other-listing, unresolved, and unreadable rows
 * stay out with their reasons preserved in the view. Author identities never appear in the closed
 * projection, so nothing author-identifying can cross into the coding context: only the sanitized
 * locator, page identity, listing refs, and text travel.
 */
export interface ShopeeCodingEligibleRow {
  readonly recordIndex: number;
  readonly text: string;
  readonly shopId: string | null;
  readonly itemId: string | null;
  readonly createdAt: string | null;
  readonly locator: string;
  readonly pageSha256: string;
}

export interface ShopeeCodingContext {
  readonly corpusSha256: string;
  readonly rows: readonly ShopeeCodingEligibleRow[];
  readonly excluded: number;
  readonly unreadable: number;
}

export class ShopeeCodingContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShopeeCodingContextError';
  }
}

function fail(message: string): never {
  throw new ShopeeCodingContextError(message);
}

/** Replay the retained view into an eligible-only coding context. Refuses before any model call. */
export function buildShopeeCodingContext(view: PrivateReviewReportView, corpusSha256: string,
  recordIndexes?: readonly number[]): ShopeeCodingContext {
  if (!/^[a-f0-9]{64}$/.test(corpusSha256)) fail('corrupt digest');
  if (view.contractVersion !== 'private-review-report-view-v1') fail('not a private review view');
  const wanted = recordIndexes === undefined ? undefined : new Set(recordIndexes);
  const rows: ShopeeCodingEligibleRow[] = [];
  let excluded = 0, unreadable = 0;
  view.records.forEach((record, recordIndex) => {
    const eligible = record.admission === 'SELECTED_TEXT' && record.textState === 'READABLE' && record.text !== null;
    if (!eligible) {
      if (record.textState === 'UNREADABLE' || (record.admission === 'SELECTED_TEXT' && record.text === null)) unreadable++;
      else excluded++;
      return;
    }
    if (wanted !== undefined && !wanted.has(recordIndex)) return;
    if (!/^[a-f0-9]{64}$/.test(record.locator.pageSha256)) fail('record without retained source identity');
    rows.push({ recordIndex, text: record.text as string, shopId: record.shopId, itemId: record.itemId,
      createdAt: record.createdAt, locator: record.locator.textPointer, pageSha256: record.locator.pageSha256 });
  });
  if (wanted !== undefined) {
    for (const index of wanted) {
      if (!Number.isInteger(index) || index < 0 || index >= view.records.length) fail('unknown record index');
      if (!rows.some(row => row.recordIndex === index)) fail('requested record is not eligible coding evidence');
    }
  }
  if (rows.length === 0) fail('no eligible retained review records to code');
  return { corpusSha256, rows, excluded, unreadable };
}
