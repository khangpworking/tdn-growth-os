import { createHash } from 'node:crypto';
import type { InsightCodingRules, InsightProposedAnnotations } from '../../../../contracts/analysis/automation-insight-coding.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { InsightDefaultModelCandidates } from '../../../../contracts/analysis/automation-insight-model.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateLocatedInsightInput } from '../located-insight-methods.js';

export const DEFAULT_INSIGHT_POLICY = 'source-default-coding-v1';
// No method decision authorizes multi-code when the retained corpus omits it.
// This bounded draft constraint rejects conflicting codes rather than choosing one.
export const DEFAULT_INSIGHT_MULTICODE_LIMIT = 'Khi nguồn chưa khai báo cho phép nhiều mã, đề xuất mặc định chỉ nhận một mã khác nhau cho mỗi bản ghi trong từng tập I10/I13. Nếu model gắn nhiều mã, lô không hợp lệ; giữ nguyên lời nguồn và kết quả không hợp lệ đã lưu, không tự chọn bỏ mã. Đây là giới hạn của bản nháp, chưa phải quyết định về mã hóa nhiều mã hay kiểm chéo U11.';
export const insightCodingDigest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

/** Source membership is frozen before dispatch. Empty codebooks are proposals, never owner rules. */
export function sourceDefaultInsightRules(input: LocatedInsightMethods['input']): InsightCodingRules {
  validateLocatedInsightInput(input);
  const question = input.question ?? input.workingQuestionProposal ?? 'Nguồn đã lưu nêu những bối cảnh, hành động, nhận xét và trạng thái nào?';
  const recordIndexes = input.records.flatMap((record, index) => record.disposition === 'INCLUDED' ? [index] : []);
  const corpora: InsightCodingRules['corpora'] = (['I10', 'I13'] as const).map(sectionId => {
    const source = input.corpora.find(corpus => corpus.sectionId === sectionId);
    return { sectionId, recordIndexes: [...recordIndexes], question, unit: 'source-native record',
      period: source?.period ?? null, frame: source?.frame ?? null, channel: source?.channel ?? null,
      inclusionRule: input.inclusionRule, membershipComplete: true, multiCode: source?.multiCode ?? false,
      externalSampling: source?.externalSampling ?? 'UNKNOWN',
      codebook: { revision: DEFAULT_INSIGHT_POLICY, codes: [] }, assignments: [], dispositions: [] };
  });
  return { ruleId: DEFAULT_INSIGHT_POLICY, revision: 1, question, inclusionRule: input.inclusionRule,
    adjudicationRule: input.adjudicationRule, corpora };
}

export function composeDefaultInsightInput(input: LocatedInsightMethods['input'], rules: InsightCodingRules,
  annotations?: InsightProposedAnnotations): LocatedInsightMethods['input'] {
  const composed = structuredClone(input);
  composed.question = rules.question; composed.inclusionRule = rules.inclusionRule; composed.adjudicationRule = rules.adjudicationRule;
  composed.corpora = structuredClone(rules.corpora);
  for (const family of ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i13Mentions'] as const)
    Object.assign(composed, { [family]: structuredClone(annotations?.[family] ?? []) });
  const seen = new Set<number>();
  for (const coding of annotations?.corpora ?? []) {
    const corpus = composed.corpora[coding.corpusIndex];
    if (!corpus || seen.has(coding.corpusIndex)) throw new TypeError('INVALID_DEFAULT_CORPUS');
    seen.add(coding.corpusIndex);
    corpus.assignments = structuredClone(coding.assignments); corpus.dispositions = structuredClone(coding.dispositions);
    if (!corpus.multiCode) {
      const codesByRecord = new Map<string, Set<string>>();
      for (const assignment of corpus.assignments) {
        const record = composed.records[assignment.recordIndex];
        if (!record) throw new TypeError('INVALID_DEFAULT_CORPUS');
        const identity = JSON.stringify([record.sourceSha256, record.locator]);
        const codes = codesByRecord.get(identity) ?? new Set<string>();
        codes.add(assignment.code); codesByRecord.set(identity, codes);
        if (codes.size > 1) throw new TypeError('DEFAULT_MULTICODE_NOT_ALLOWED');
      }
    }
  }
  return validateLocatedInsightInput(composed);
}

export function appendDefaultCodebooks(input: LocatedInsightMethods['input'], additions: InsightDefaultModelCandidates['codebooks'],
  recordIndexes: readonly number[]): LocatedInsightMethods['input'] {
  const composed = structuredClone(input), batch = new Set(recordIndexes), seen = new Set<number>();
  for (const addition of additions) {
    const corpus = composed.corpora[addition.corpusIndex];
    if (!corpus || seen.has(addition.corpusIndex)) throw new TypeError('INVALID_DEFAULT_CODEBOOK');
    seen.add(addition.corpusIndex);
    const codes = new Set(corpus.codebook.codes.map(code => code.code));
    for (const code of addition.codes) {
      if (codes.has(code.code) || code.firstRecordIndex === null || !batch.has(code.firstRecordIndex) ||
        !corpus.recordIndexes.includes(code.firstRecordIndex) || code.firstSpan === null || code.firstSpan.quote !== code.phrase ||
        (corpus.sectionId === 'I13' && code.label !== code.phrase)) throw new TypeError('INVALID_DEFAULT_CODEBOOK');
      codes.add(code.code); corpus.codebook.codes.push(structuredClone(code));
    }
  }
  return validateLocatedInsightInput(composed);
}

/** Replace only explicit batch rows. Prior source code meanings and other batches remain retained. */
export function mergeInsightBatch(current: InsightProposedAnnotations, previous: InsightProposedAnnotations | undefined,
  recordIndexes: readonly number[]): InsightProposedAnnotations {
  const annotations = structuredClone(current);
  if (!previous) return annotations;
  const batch = new Set(recordIndexes);
  for (const family of ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i13Mentions'] as const)
    Object.assign(annotations, { [family]: [...(previous[family] ?? []).filter(row => !batch.has(row.recordIndex)), ...annotations[family]!] });
  for (const old of previous.corpora) {
    const kept = { corpusIndex: old.corpusIndex, assignments: old.assignments.filter(row => !batch.has(row.recordIndex)),
      dispositions: old.dispositions.filter(row => !batch.has(row.recordIndex)) };
    const currentCorpus = annotations.corpora.find(corpus => corpus.corpusIndex === old.corpusIndex);
    if (currentCorpus) { currentCorpus.assignments.unshift(...kept.assignments); currentCorpus.dispositions.unshift(...kept.dispositions); }
    else annotations.corpora.push(kept);
  }
  return annotations;
}
