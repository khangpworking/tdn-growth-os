import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import type { AutomationInsightSelection } from '../../../../contracts/analysis/automation-insight-selection.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { InsightDraftGroupCounts } from '../../../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import { buildLocatedInsightMethods } from '../located-insight-methods.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const validateSelection = new Ajv2020({ strict: true, allErrors: false }).compile<AutomationInsightSelection>(schema);
type Provenance = LocatedInsightMethods['input']['i06'][number]['provenance'];

function fail(code: string): never { throw new TypeError(`INVALID_INSIGHT_SELECTION:${code}`); }

function indexes(values: readonly number[], size: number): Set<number> {
  if (values.some(index => index >= size)) fail('INDEX_OUT_OF_RANGE');
  return new Set(values);
}

function projectProvenance(original: Provenance, selected: boolean): Provenance {
  if (selected && original.disagreement !== null) fail('UNRESOLVED_DISAGREEMENT');
  // This is a calculation projection, not authentication. The retained proposal
  // keeps original provenance; an application receipt must authorize its use.
  return { ...original, basis: !selected ? 'PENDING_AI' : original.basis === 'PENDING_AI' ? 'DECLARED' : original.basis };
}

/**
 * Projects exact selected indexes without shrinking the corpus or inventing
 * approval. Callers must independently verify the immutable proposal, rule
 * adoption and authenticated receipts before using this result in a report.
 */
export function projectSelectedInsightCandidates(proposal: unknown, selection: unknown): ReturnType<typeof buildLocatedInsightMethods> {
  if (!validateSelection(selection)) fail('INVALID_CONTRACT');
  const count = selection.i06.length + selection.i09.length + selection.i13Mentions.length
    + (selection.i02?.length ?? 0) + (selection.i04?.length ?? 0) + (selection.i05?.length ?? 0)
    + (selection.i07?.length ?? 0) + (selection.i08?.length ?? 0)
    + selection.corpora.reduce((sum, corpus) => sum + corpus.assignments.length + corpus.dispositions.length, 0);
  if (!count) fail('EMPTY_SELECTION');
  // The existing method owns closed input, record identity, exact UTF-16 spans,
  // relation and codebook validation. It returns an independent input clone.
  const input = buildLocatedInsightMethods(proposal).output.input;
  // v1 retains the original literal source projection for historical replay.
  // v2 makes every proposed family subject to explicit receipt selection.
  if (selection.contractVersion === 'automation-insight-selection-v2') {
    for (const family of ['i02', 'i04', 'i05', 'i07', 'i08'] as const) {
      const selected = indexes(selection[family]!, input[family].length);
      input[family].forEach((annotation, index) => {
        annotation.provenance = projectProvenance(annotation.provenance, selected.has(index));
      });
    }
  }
  for (const family of ['i06', 'i09', 'i13Mentions'] as const) {
    const selected = indexes(selection[family], input[family].length);
    input[family].forEach((annotation, index) => {
      annotation.provenance = projectProvenance(annotation.provenance, selected.has(index));
    });
  }
  const corpusSelections = new Map<number, AutomationInsightSelection['corpora'][number]>();
  for (const corpus of selection.corpora) {
    if (corpus.corpusIndex >= input.corpora.length) fail('INDEX_OUT_OF_RANGE');
    if (corpusSelections.has(corpus.corpusIndex)) fail('DUPLICATE_CORPUS_SELECTION');
    corpusSelections.set(corpus.corpusIndex, corpus);
  }
  input.corpora.forEach((corpus, index) => {
    const selected = corpusSelections.get(index);
    const assignments = indexes(selected?.assignments ?? [], corpus.assignments.length);
    const dispositions = indexes(selected?.dispositions ?? [], corpus.dispositions.length);
    corpus.assignments.forEach((assignment, assignmentIndex) => {
      assignment.provenance = projectProvenance(assignment.provenance, assignments.has(assignmentIndex));
    });
    corpus.dispositions.forEach((disposition, dispositionIndex) => {
      const accepted = dispositions.has(dispositionIndex);
      if (accepted && disposition.state === 'PENDING') fail('PENDING_DISPOSITION');
      disposition.provenance = projectProvenance(disposition.provenance, accepted);
      if (!accepted) disposition.state = 'PENDING';
    });
  });
  // Pending assignments/dispositions and the original complete membership go
  // together to the calculator; a subset cannot unlock a final corpus ratio.
  return buildLocatedInsightMethods(input);
}

/** Counts-only I11 bridge. Platform proof is supplied by the owning replay-verified source service,
 * never inferred from source wording or model output. Corpus outputs own coding eligibility and dedupe. */
export function projectDraftInsightGroupCounts(output: LocatedInsightMethods, verifiedPlatform?: 'SHOPEE'): InsightDraftGroupCounts {
  if (output.input.draftCountsVersion !== 'draft-counts-v2') fail('GROUP_COUNTS_REQUIRE_DRAFT_V2');
  const key = (index: number) => {
    const record = output.input.records[index];
    if (!record) fail('UNKNOWN_GROUP_RECORD');
    return canonicalJson([record.sourceSha256, record.locator]);
  };
  const firstIndex = new Map<string, number>();
  output.input.records.forEach((_, index) => { if (!firstIndex.has(key(index))) firstIndex.set(key(index), index); });
  const distinctPointers = (indexes: number[]) => [...new Set(indexes.map(key))].map(identity => `/input/records/${firstIndex.get(identity)!}`);
  const blockers = ['I11_DRAFT_RATES_WITHHELD', 'I11_CROSS_CHECK_UNAVAILABLE', 'I11_BUYER_TYPE_EVIDENCE_UNAVAILABLE'];
  if (!verifiedPlatform) return { contractVersion: 'insight-draft-group-counts-v1', state: 'PARTIAL_UNREVIEWED_DRAFT',
    platform: null, groups: [], rates: null, differences: null, label: 'đề xuất, chờ chủ duyệt',
    blockers: [...blockers, 'I11_PLATFORM_EVIDENCE_UNAVAILABLE'] };
  const groups = output.input.corpora.flatMap((corpus, corpusIndex) => {
    const summary = output.sections[corpus.sectionId as 'I10' | 'I13'].corpora.find(item => item.corpusIndex === corpusIndex);
    if (!summary?.draftCounts) fail('MISSING_DRAFT_CORPUS_COUNTS');
    const members = distinctPointers(corpus.recordIndexes.filter(index => {
      const record = output.input.records[index]!;
      return record.disposition === 'INCLUDED' && record.text !== null && record.text.trim().length > 0;
    }));
    const membership = new Set(members);
    return [{ platform: verifiedPlatform, buyerType: null, corpusIndex, sectionId: corpus.sectionId,
      codebookRevision: corpus.codebook.revision,
      scope: { unit: corpus.unit, period: corpus.period, frame: corpus.frame, channel: corpus.channel, inclusionRule: corpus.inclusionRule },
      memberRecordPointers: members, memberCount: members.length,
      counts: summary.draftCounts.map(count => {
        const pointers = distinctPointers(count.annotationPointers.map(pointer => {
          const index = Number(pointer.slice(pointer.lastIndexOf('/') + 1));
          const assignment = corpus.assignments[index];
          if (!assignment) fail('UNKNOWN_GROUP_ASSIGNMENT');
          return assignment.recordIndex;
        })).filter(pointer => membership.has(pointer));
        // No located eligible assignment plus incomplete coding is missing, never a verified zero.
        const unavailable = pointers.length === 0 && !summary.codingComplete;
        return { code: count.code, recordPointers: pointers, recordCount: unavailable ? null : pointers.length,
          state: unavailable ? 'UNAVAILABLE' as const : 'PROPOSED_COUNT' as const, label: count.label };
      }),
      blockers: [...new Set([...summary.blockers,
        ...(!corpus.membershipComplete ? ['I11_MEMBERSHIP_INCOMPLETE'] : []),
        ...([corpus.unit, corpus.period, corpus.frame, corpus.channel].some(value => value === null) ? ['I11_CORPUS_SCOPE_INCOMPLETE'] : [])])],
    }];
  });
  return { contractVersion: 'insight-draft-group-counts-v1', state: 'PARTIAL_UNREVIEWED_DRAFT', platform: verifiedPlatform,
    groups, rates: null, differences: null, label: 'đề xuất, chờ chủ duyệt',
    blockers: [...blockers, 'I11_SINGLE_PLATFORM_ONLY', ...(groups.length ? [] : ['I11_CODING_CORPORA_UNAVAILABLE'])] };
}
