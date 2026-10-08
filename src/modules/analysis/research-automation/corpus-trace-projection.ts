import type { AutomationLocatedReviewAdoptedSnapshot } from './located-review-bridge.js';
import type { NativeSourceReviewSnapshot } from './native-source-review-bridge.js';
import type { LiteralFamily } from './literal-review-coding.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

type Snapshot = AutomationLocatedReviewAdoptedSnapshot | NativeSourceReviewSnapshot;
type RecordInput = Snapshot['output']['input']['records'][number];
type TraceInput = Pick<Snapshot, 'projectionSha256' | 'policySha256'> & {
  projection: Pick<Snapshot['projection'], 'admitted' | 'pending' | 'blocked'>;
  sourcePackage: Pick<Snapshot['sourcePackage'], 'packageId' | 'manifestArtifactSha256' | 'packageContentSha256'>;
  output: Pick<Snapshot['output'], 'methodOutputId'> & { input: { records: RecordInput[] } };
};
const families: readonly LiteralFamily[] = ['I02', 'I04', 'I05', 'I07', 'I08'];

/** Read-only coverage of one retained corpus: counts per state plus the exact records behind them. */
export interface CorpusTrace {
  readonly sourcePackage: { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string };
  readonly methodOutputId: string;
  readonly projectionSha256: string;
  readonly policySha256: string;
  readonly counts: {
    readonly inputRows: number; readonly uniqueRecords: number; readonly duplicateRows: number;
    readonly included: number; readonly excluded: number; readonly unreadable: number;
    readonly admittedCandidates: number; readonly admittedRecords: number;
    readonly pendingItems: number; readonly pendingRecords: number;
    readonly blockedCandidates: number; readonly blockedRecords: number;
  };
  readonly families: readonly { readonly family: LiteralFamily; readonly admittedCandidates: number; readonly admittedRecords: number }[];
  readonly records: readonly (RecordInput & { readonly inputIndexes: readonly number[]; readonly admitted: number; readonly pending: number; readonly blocked: number })[];
}

/** Read projection only. Owning bridges verify retained artifacts before calling this. */
export function projectCorpusTrace(snapshot: TraceInput): CorpusTrace {
  const records: (RecordInput & { inputIndexes: number[]; admitted: number; pending: number; blocked: number })[] = [];
  const identities = new Map<string, number>();
  const inputIndexes: number[] = [];
  snapshot.output.input.records.forEach((record, index) => {
    const key = canonicalJson([record.sourceSha256, record.locator]);
    let uniqueIndex = identities.get(key);
    if (uniqueIndex === undefined) {
      uniqueIndex = records.length;
      identities.set(key, uniqueIndex);
      records.push({ ...structuredClone(record), inputIndexes: [], admitted: 0, pending: 0, blocked: 0 });
    } else if (canonicalJson(record) !== canonicalJson(snapshot.output.input.records[records[uniqueIndex]!.inputIndexes[0]!]!)) {
      throw new Error('Corpus trace has conflicting records at the same exact source locator');
    }
    records[uniqueIndex]!.inputIndexes.push(index);
    inputIndexes.push(uniqueIndex);
  });
  const coverage = new Map(families.map(family => [family, { admitted: 0, records: new Set<number>() }]));
  function locate(index: number, family: LiteralFamily): number {
    const uniqueIndex = inputIndexes[index];
    if (!Number.isInteger(index) || index < 0 || uniqueIndex === undefined || !coverage.has(family))
      throw new Error('Corpus trace candidate has an invalid record or family reference');
    return uniqueIndex;
  }
  for (const row of snapshot.projection.admitted) {
    const index = locate(row.recordIndex, row.family);
    records[index]!.admitted++;
    coverage.get(row.family)!.admitted++;
    coverage.get(row.family)!.records.add(index);
  }
  for (const row of snapshot.projection.pending) records[locate(row.recordIndex, row.family)]!.pending++;
  for (const row of snapshot.projection.blocked) records[locate(row.recordIndex, row.family)]!.blocked++;
  return {
    sourcePackage: { packageId: snapshot.sourcePackage.packageId,
      manifestArtifactSha256: snapshot.sourcePackage.manifestArtifactSha256, packageContentSha256: snapshot.sourcePackage.packageContentSha256 },
    methodOutputId: snapshot.output.methodOutputId,
    projectionSha256: snapshot.projectionSha256,
    policySha256: snapshot.policySha256,
    counts: {
      inputRows: inputIndexes.length, uniqueRecords: records.length, duplicateRows: inputIndexes.length - records.length,
      included: records.filter(row => row.disposition === 'INCLUDED').length,
      excluded: records.filter(row => row.disposition === 'EXCLUDED').length,
      unreadable: records.filter(row => row.disposition === 'UNREADABLE').length,
      admittedCandidates: snapshot.projection.admitted.length, admittedRecords: records.filter(row => row.admitted > 0).length,
      pendingItems: snapshot.projection.pending.length, pendingRecords: records.filter(row => row.pending > 0).length,
      blockedCandidates: snapshot.projection.blocked.length, blockedRecords: records.filter(row => row.blocked > 0).length,
    },
    families: families.map(family => ({ family, admittedCandidates: coverage.get(family)!.admitted,
      admittedRecords: coverage.get(family)!.records.size })),
    records,
  };
}
