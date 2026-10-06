import type { InsightProposedAnnotations } from '../../../../contracts/analysis/automation-insight-coding.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

type Input = LocatedInsightMethods['input'];
const provenance = () => ({
  // The existing located-method contract uses PENDING_AI for unreviewed machine
  // suggestions. coderRole distinguishes this deterministic matcher from a model.
  basis: 'PENDING_AI' as const, coderRole: 'literal-codebook-matcher-v1 (no model)',
  adjudication: null, disagreement: null,
});

/** Candidate discovery only. The owning coding service verifies sources/rules
 * before calling and validates the complete result before persistence. */
export function proposeLiteralCodebook(input: Input, previous?: InsightProposedAnnotations): InsightProposedAnnotations {
  const annotations: InsightProposedAnnotations = previous ? structuredClone(previous)
    : { i06: [], i09: [], i13Mentions: [], corpora: [] };
  // Bound expansion while constructing it, not only after serializing a large
  // proposal at the write boundary. The latter also includes its envelope.
  let bytes = Buffer.byteLength(canonicalJson(annotations));
  const append = <T>(list: T[], value: T) => {
    bytes += Buffer.byteLength(canonicalJson(value)) + 1;
    if (list.length >= 10_000 || bytes > 8 * 1024 * 1024) throw new TypeError('INSIGHT_LITERAL_PROPOSAL_TOO_LARGE');
    list.push(value);
  };
  const key = (index: number) => canonicalJson([input.records[index]!.sourceSha256, input.records[index]!.locator]);
  const mentions = new Set(annotations.i13Mentions.map(row => canonicalJson([key(row.recordIndex), row.span])));
  for (const [corpusIndex, corpus] of input.corpora.entries()) {
    let coding = annotations.corpora.find(row => row.corpusIndex === corpusIndex);
    if (!coding) { coding = { corpusIndex, assignments: [], dispositions: [] }; append(annotations.corpora, coding); }
    const assignments = new Set(coding.assignments.map(row => canonicalJson([key(row.recordIndex), row.code, row.span])));
    const dispositions = new Set(coding.dispositions.map(row => key(row.recordIndex)));
    const members = new Set<string>();
    for (const recordIndex of corpus.recordIndexes) {
      const identity = key(recordIndex);
      if (members.has(identity)) continue;
      members.add(identity);
      const record = input.records[recordIndex]!;
      if (record.disposition !== 'INCLUDED' || record.text === null) continue;
      let matched = false;
      for (const code of corpus.codebook.codes) {
        // Literal, case-sensitive UTF-16 positions; no aliasing or normalization.
        for (let start = record.text.indexOf(code.phrase); start >= 0; start = record.text.indexOf(code.phrase, start + 1)) {
          const span = { start, end: start + code.phrase.length, quote: code.phrase };
          const assignmentKey = canonicalJson([identity, code.code, span]);
          matched = true;
          if (!assignments.has(assignmentKey)) {
            append(coding.assignments, { recordIndex, code: code.code, span, provenance: provenance() });
            assignments.add(assignmentKey);
          }
          if (corpus.sectionId === 'I13') {
            const mentionKey = canonicalJson([identity, span]);
            if (!mentions.has(mentionKey)) {
              append(annotations.i13Mentions, { recordIndex, span, provenance: provenance() });
              mentions.add(mentionKey);
            }
          }
        }
      }
      if (!dispositions.has(identity)) {
        // No literal hit is not proof that a semantic theme is absent.
        append(coding.dispositions, { recordIndex, state: matched ? 'CODED' : 'PENDING', provenance: provenance() });
        dispositions.add(identity);
      }
    }
  }
  return annotations;
}
