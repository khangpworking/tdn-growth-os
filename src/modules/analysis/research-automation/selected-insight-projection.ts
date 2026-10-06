import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import type { AutomationInsightSelection } from '../../../../contracts/analysis/automation-insight-selection.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import { buildLocatedInsightMethods } from '../located-insight-methods.js';

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
