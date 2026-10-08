import type { LocatedInsightMethods } from '../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

type Input = LocatedInsightMethods['input'];
type Corpus = Input['corpora'][number];
type Section = LocatedInsightMethods['sections']['I10'];
type Summary = Section['corpora'][number];
type Provenance = Corpus['assignments'][number]['provenance'];

const unresolved = (provenance: Provenance): boolean => provenance.basis === 'PENDING_AI' || provenance.disagreement !== null;

function fail(code: string): never { throw new TypeError(`INVALID_INSIGHT_CORPUS:${code}`); }

function recordKey(input: Input, index: number): string {
  const record = input.records[index];
  if (!record) fail('UNKNOWN_RECORD_INDEX');
  return canonicalJson([record.sourceSha256, record.locator]);
}

function summarize(input: Input, corpus: Corpus, corpusIndex: number): Summary {
  const members = new Map<string, number>();
  const memberIndexes = new Set(corpus.recordIndexes);
  for (const index of corpus.recordIndexes) {
    const key = recordKey(input, index);
    const previous = members.get(key);
    if (previous !== undefined && canonicalJson(input.records[previous]) !== canonicalJson(input.records[index])) {
      fail('CONFLICTING_RECORD_REFERENCE');
    }
    if (previous === undefined) members.set(key, index);
  }
  const codeRecords = new Map<string, Map<string, string[]>>();
  const literalPhrases = new Map<string, string>();
  for (const code of corpus.codebook.codes) {
    if (codeRecords.has(code.code)) fail('DUPLICATE_CODEBOOK_CODE');
    codeRecords.set(code.code, new Map());
    literalPhrases.set(code.code, code.phrase);
    if ((code.firstRecordIndex === null) !== (code.firstSpan === null)) fail('INCOMPLETE_CODEBOOK_FIRST_REFERENCE');
    if (code.firstRecordIndex !== null && !memberIndexes.has(code.firstRecordIndex)) fail('CODEBOOK_RECORD_OUTSIDE_CORPUS');
    if (code.firstSpan !== null && code.firstSpan.quote !== code.phrase) fail('CODEBOOK_FIRST_PHRASE_MISMATCH');
    if (corpus.sectionId === 'I13' && code.label !== code.phrase) fail('I13_LITERAL_CODE_LABEL_REQUIRED');
  }
  const states = new Map<string, Corpus['dispositions'][number]>();
  const pending = new Set<string>();
  for (const disposition of corpus.dispositions) {
    if (!memberIndexes.has(disposition.recordIndex)) fail('DISPOSITION_RECORD_OUTSIDE_CORPUS');
    const key = recordKey(input, disposition.recordIndex);
    const previous = states.get(key);
    if (previous && canonicalJson({ ...previous, recordIndex: 0 }) !== canonicalJson({ ...disposition, recordIndex: 0 })) {
      fail('CONFLICTING_CODING_DISPOSITION');
    }
    states.set(key, disposition);
    if (disposition.state === 'PENDING' || unresolved(disposition.provenance)) pending.add(key);
  }
  const recordCodes = new Map<string, Set<string>>();
  for (const [assignmentIndex, assignment] of corpus.assignments.entries()) {
    if (!memberIndexes.has(assignment.recordIndex)) fail('ASSIGNMENT_RECORD_OUTSIDE_CORPUS');
    const counted = codeRecords.get(assignment.code);
    if (!counted) fail('UNKNOWN_CODE_REFERENCE');
    if (corpus.sectionId === 'I13' && assignment.span.quote !== literalPhrases.get(assignment.code)) {
      fail('I13_LITERAL_ASSIGNMENT_MISMATCH');
    }
    const key = recordKey(input, assignment.recordIndex);
    if (unresolved(assignment.provenance)) {
      pending.add(key);
      continue;
    }
    if (input.records[assignment.recordIndex]!.disposition !== 'INCLUDED') continue;
    const codes = recordCodes.get(key) ?? new Set<string>();
    codes.add(assignment.code);
    recordCodes.set(key, codes);
    const pointers = counted.get(key) ?? [];
    pointers.push(`/input/corpora/${corpusIndex}/assignments/${assignmentIndex}`);
    counted.set(key, pointers);
  }

  let includedRecordCount = 0;
  let excludedCount = 0;
  let unreadableCount = 0;
  let pendingCount = 0;
  let unclearCount = 0;
  let uncodedCount = 0;
  let codedCount = 0;
  let multiCodedCount = 0;
  for (const [key, index] of members) {
    const record = input.records[index]!;
    if (record.disposition === 'EXCLUDED') { excludedCount++; continue; }
    if (record.disposition === 'UNREADABLE') { unreadableCount++; continue; }
    includedRecordCount++;
    const codes = recordCodes.get(key);
    if ((codes?.size ?? 0) > 1) {
      if (!corpus.multiCode) fail('MULTICODE_NOT_ALLOWED');
      multiCodedCount++;
    }
    const disposition = states.get(key);
    if (!disposition || pending.has(key)) { pendingCount++; continue; }
    if (disposition.state === 'CODED') {
      if (!codes?.size) fail('CODED_WITHOUT_ACCEPTED_ASSIGNMENT');
      codedCount++;
    } else {
      if (codes?.size) fail('UNCODED_DISPOSITION_WITH_ACCEPTED_ASSIGNMENT');
      if (disposition.state === 'UNCLEAR') unclearCount++;
      else if (disposition.state === 'UNCODED') uncodedCount++;
    }
  }
  const codingComplete = pendingCount === 0;
  const blockers: string[] = [];
  if (!corpus.membershipComplete) blockers.push('CORPUS_MEMBERSHIP_INCOMPLETE');
  if (corpus.frame === null) blockers.push('CORPUS_FRAME_MISSING');
  if (corpus.period === null) blockers.push('CORPUS_PERIOD_MISSING');
  if (corpus.sectionId === 'I13' && corpus.channel === null) blockers.push('CORPUS_CHANNEL_MISSING');
  if (!codingComplete) blockers.push('CORPUS_CODING_PENDING');
  if (includedRecordCount === 0) blockers.push('CORPUS_ZERO_DENOMINATOR');
  const ratioStatus = blockers.length === 0 ? 'COMPLETE' as const
    : blockers.length === 1 && includedRecordCount === 0 ? 'ZERO_DENOMINATOR' as const : 'PARTIAL' as const;
  const countsBase = {
    corpusIndex, membershipCount: members.size, includedRecordCount, excludedCount, unreadableCount,
    pendingCount, unclearCount, uncodedCount, codedCount, multiCodedCount,
    duplicateReferenceCount: corpus.recordIndexes.length - members.size,
    codingComplete, ratioStatus,
    counts: corpus.codebook.codes.map(code => {
      const records = codeRecords.get(code.code)!;
      return {
        code: code.code, recordCount: records.size,
        ratio: ratioStatus === 'COMPLETE' ? { numerator: records.size, denominator: includedRecordCount } : null,
        annotationPointers: [...members.keys()].flatMap(key => records.get(key) ?? []),
      };
    }),
    blockers,
  };
  // U-03 draft eligibility is additive and opt-in: without the flag the output
  // keeps the historical accepted-only bytes exactly. Draft assignments are
  // all disagreement-free assignments (eligible accepted rows plus eligible
  // retained AI proposals) on INCLUDED records with a matching eligible CODED
  // disposition. PENDING, UNCLEAR, UNCODED or missing dispositions never enter
  // draft code counts. Drafts never unlock ratios, rewrite provenance, or
  // clear the pending tallies above.
  if (input.draftCountsVersion === undefined) return countsBase;
  if (input.semanticsVersion !== '1.1.0') fail('DRAFT_REQUIRES_CURRENT_SEMANTICS');
  const eligibleDisposition = new Set<string>();
  for (const [key, disposition] of states) {
    if (disposition.state === 'CODED' && disposition.provenance.disagreement === null) eligibleDisposition.add(key);
  }
  const draftRecords = new Map<string, Map<string, string[]>>();
  for (const code of corpus.codebook.codes) draftRecords.set(code.code, new Map());
  const draftCodes = new Map<string, Set<string>>();
  for (const [assignmentIndex, assignment] of corpus.assignments.entries()) {
    if (assignment.provenance.disagreement !== null) continue;
    if (input.records[assignment.recordIndex]!.disposition !== 'INCLUDED') continue;
    const key = recordKey(input, assignment.recordIndex);
    if (!eligibleDisposition.has(key)) continue;
    if (!corpus.multiCode) {
      const codes = draftCodes.get(key) ?? new Set<string>();
      codes.add(assignment.code);
      draftCodes.set(key, codes);
      if (codes.size > 1) fail('DRAFT_MULTICODE_NOT_ALLOWED');
    }
    const perCode = draftRecords.get(assignment.code)!;
    const pointers = perCode.get(key) ?? [];
    pointers.push(`/input/corpora/${corpusIndex}/assignments/${assignmentIndex}`);
    perCode.set(key, pointers);
  }
  return { ...countsBase,
    draftCounts: corpus.codebook.codes.map(code => {
      const records = draftRecords.get(code.code)!;
      return { code: code.code, recordCount: records.size,
        annotationPointers: [...records.values()].flat(),
        label: 'đề xuất, chờ chủ duyệt' as const };
    }),
    draftLabel: 'đề xuất, chờ chủ duyệt' as const, draftCountsVersion: input.draftCountsVersion };
}

/** Called by the located-method boundary after schema and exact-span validation. */
export function buildInsightCorpusCounts(input: Input): Pick<LocatedInsightMethods['sections'], 'I10' | 'I13'> {
  const section = (sectionId: 'I10' | 'I13'): Section => {
    const corpora = input.corpora.flatMap((corpus, index) => corpus.sectionId === sectionId ? [summarize(input, corpus, index)] : []);
    const mentionPointers: string[] = [];
    const pendingMentionPointers: string[] = [];
    if (sectionId === 'I13') {
      const seen = new Set<string>();
      const sourceOrder = new Map(input.sources.map((source, index) => [source.sha256, index]));
      const mentions = input.i13Mentions.map((mention, index) => ({ mention, index }));
      mentions.sort((a, b) => {
        const first = input.records[a.mention.recordIndex]!;
        const second = input.records[b.mention.recordIndex]!;
        const sourceDifference = sourceOrder.get(first.sourceSha256)! - sourceOrder.get(second.sourceSha256)!;
        return sourceDifference || (first.locator < second.locator ? -1 : first.locator > second.locator ? 1 : 0)
          || a.mention.span.start - b.mention.span.start || a.mention.span.end - b.mention.span.end || a.index - b.index;
      });
      mentions.forEach(({ mention, index }) => {
        if (input.records[mention.recordIndex]!.disposition !== 'INCLUDED') fail('I13_MENTION_RECORD_NOT_INCLUDED');
        const key = canonicalJson([recordKey(input, mention.recordIndex), mention.span, mention.provenance]);
        if (seen.has(key)) return;
        seen.add(key);
        const pointers = unresolved(mention.provenance) ? pendingMentionPointers : mentionPointers;
        pointers.push(`/input/i13Mentions/${index}`);
      });
    }
    return {
      corpora, mentionPointers, pendingMentionPointers,
      semanticValidation: 'DECLARED_NOT_VERIFIED', countUnit: 'LOCATED_RECORDS',
      blockers: [...new Set([
        ...(corpora.length ? [] : ['NO_CORPUS_INPUT']),
        ...corpora.flatMap(corpus => corpus.blockers),
        ...(sectionId === 'I13' ? ['I13_UNRANKED_MENTIONS_NO_PEER_OR_ENTITY_RESOLUTION'] : []),
      ])],
    };
  };
  return { I10: section('I10'), I13: section('I13') };
}
