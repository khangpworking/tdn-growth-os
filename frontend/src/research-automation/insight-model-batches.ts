// Planning and read-back checks for explicit model coding. Nothing here sends a request,
// accepts a candidate or decides which records matter: it splits the exact eligible corpus
// and says why a returned proposal may not be treated as verified progress.
import type { InsightModelRequest } from './insight-coding-api';
import { canonical, codingHistory, type Annotations, type Provenance, type SourceRecord, type View } from './insight-coding-ui';

/** The server bound for one model request. */
export const MODEL_BATCH_SIZE = 100;
const semanticFamilies = ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i13Mentions'] as const;

/** Eligible is exactly INCLUDED with text; original indexes stay in source order, and nothing is capped. */
export function modelCorpus(records: readonly SourceRecord[]) {
  const eligible: number[] = [];
  let excluded = 0, unreadable = 0, withoutText = 0;
  records.forEach((record, index) => {
    if (record.disposition === 'EXCLUDED') excluded++;
    else if (record.disposition === 'UNREADABLE') unreadable++;
    else if (record.text === null) withoutText++;
    else eligible.push(index);
  });
  return { eligible, excluded, unreadable, withoutText };
}

/** Deterministic sequential batches of at most MODEL_BATCH_SIZE indexes. */
export function modelBatches(indexes: readonly number[], size = MODEL_BATCH_SIZE): number[][] {
  const batches: number[][] = [];
  for (let at = 0; at < indexes.length; at += size) batches.push(indexes.slice(at, at + size));
  return batches;
}

/** Human-declared rows on records about to be sent; the server replaces each sent record's rows in the next snapshot. */
export function declaredRowsOn(annotations: Annotations, indexes: ReadonlySet<number>): number {
  type Row = { recordIndex: number; provenance: Provenance };
  const rows: Row[] = [
    ...semanticFamilies.flatMap(family => (annotations[family] ?? []) as readonly Row[]),
    ...annotations.corpora.flatMap(coding => [...coding.assignments, ...coding.dispositions] as Row[]),
  ];
  return rows.filter(row => indexes.has(row.recordIndex) && row.provenance.basis !== 'PENDING_AI').length;
}

/** The read-back must hold the proposal this exact request created, not merely a receipt. */
export function proposalMatches(view: View, request: InsightModelRequest, proposalId: string): boolean {
  const item = view.evidence.find(evidence => evidence.evidenceId === proposalId);
  return Boolean(item && item.kind === 'PROPOSAL' && item.request.contractVersion === 'insight-coding-propose-v1'
    && item.request.requestKey === request.requestKey && item.request.adoptionId === request.adoptionId
    && item.request.previousProposalId === request.previousProposalId);
}

/** Why the next batch may not chain from predecessorId: changed source, newer rule or another proposal after it. */
export function chainProblem(view: View, binding: string, adoptionId: string, predecessorId: string | null): string | null {
  if (canonical(view.context.binding) !== binding) return 'Nguồn của cặp báo cáo đã khác lúc xác nhận.';
  const history = codingHistory(view);
  const adoption = history.adoptions.find(item => item.evidence.evidenceId === adoptionId);
  if (!adoption) return 'Không còn thấy quy tắc đã xác nhận trong lịch sử.';
  if (!adoption.current) return 'Quy tắc đã xác nhận vừa có bản mới hơn.';
  const latest = history.proposals.get(adoptionId)?.find(item => item.latest)?.evidence.evidenceId ?? null;
  return latest === predecessorId ? null : 'Quy tắc này vừa có một đề xuất khác mới hơn.';
}
