import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { AutomationReportInput } from '../research-automation/reports.js';
import type { CitationInput } from '../citation-registry.js';
import { Bundle } from './bundle.js';

export const INSIGHT_TITLES = {
  I01: 'Câu hỏi kinh doanh', I02: 'Khách hàng và hoàn cảnh', I03: 'Phương pháp nghiên cứu',
  I04: 'Hành vi', I05: 'Cảm nhận và thái độ', I06: 'Hành trình', I07: 'Lý do lựa chọn',
  I08: 'Rào cản', I09: 'Nhu cầu chưa được đáp ứng', I10: 'Chủ đề và mối quan tâm',
  I11: 'Khác biệt giữa các nhóm', I12: 'Điểm tiếp xúc', I13: 'Thương hiệu và đối thủ',
  I14: 'Hướng cơ hội', I15: 'Định hướng chiến lược', I16: 'Thử nghiệm và đo lường', I17: 'Phụ lục và bằng chứng',
} as const;
export type InsightSectionId = keyof typeof INSIGHT_TITLES;
export const INSIGHT_SECTION_IDS = Object.keys(INSIGHT_TITLES) as InsightSectionId[];
export type InsightReaderMethods = Pick<AutomationReportInput,
  'insightCoding' | 'insightLiteral' | 'locatedReview' | 'nativeReview'>;
export interface InsightFinding {
  readonly sectionId: InsightSectionId;
  readonly template: string;
  readonly status: string;
  readonly citations: readonly CitationInput[];
  readonly scope: string;
}
export interface InsightFindings {
  readonly bundle: Bundle;
  readonly findings: readonly InsightFinding[];
}

const FAMILY_WORDING = {
  I02: 'khai báo về khách hàng và hoàn cảnh', I04: 'khai báo về hành vi',
  I05: 'khai báo về cảm nhận và thái độ', I06: 'khai báo về sự kiện trong cùng bản ghi',
  I07: 'lý do lựa chọn nêu trong lời nguồn', I08: 'khai báo về nhiệm vụ và trở ngại',
  I09: 'khai báo liên quan đến mong muốn hoặc trạng thái hiện tại',
} as const;

/** Reads an exact retained pointer. No method execution, inferred membership or count aggregation. */
function recordAt(output: LocatedInsightMethods, pointer: string): LocatedInsightMethods['input']['records'][number] {
  let value: unknown = output;
  for (const part of pointer.split('/').slice(1)) {
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, part)) throw new Error('Insight finding pointer is missing');
    value = (value as Record<string, unknown>)[part];
  }
  const index = (value as { recordIndex?: unknown } | undefined)?.recordIndex;
  if (typeof index !== 'number' || !Number.isSafeInteger(index) || !output.input.records[index]) throw new Error('Insight finding record is missing');
  return output.input.records[index]!;
}
function citeRecord(record: LocatedInsightMethods['input']['records'][number]): CitationInput {
  return { sourceKind: 'REVIEW', identity: record.sourceSha256, locator: record.locator,
    label: 'Bản ghi lời nguồn', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' };
}

/** Fixed family order is a reading order. Numbers copy existing method fields;
 * overlapping families and platforms are never added. No U11 release claim. */
export function projectInsightFindings(methods: InsightReaderMethods): InsightFindings {
  const coding = methods.insightCoding;
  const output = coding?.output ?? methods.nativeReview?.output ?? methods.locatedReview?.output;
  const draft = coding !== undefined && 'draftSelection' in coding;
  return projectRetainedInsightFindings(output, draft);
}

/** The service verifies method and source replay before calling this projection. */
export function projectRetainedInsightFindings(output: LocatedInsightMethods | undefined, draft: boolean): InsightFindings {
  const bundle = new Bundle(), findings: InsightFinding[] = [];
  if (!output) return { bundle, findings };
  const status = draft ? 'Đề xuất, chờ chủ duyệt; chưa đủ điều kiện phát hành.' : 'Khai báo bám lời nguồn; chưa đủ điều kiện phát hành.';
  const scope = 'Trong tập bản ghi nguồn đã lưu; đơn vị đếm là bản ghi, không phải số người. Các nhóm có thể dùng chung bản ghi.';
  for (const [family, wording] of Object.entries(FAMILY_WORDING) as [keyof typeof FAMILY_WORDING, string][]) {
    const section = output.sections[family];
    const count = draft ? section.draftLocatedRecordCount : section.locatedRecordCount;
    const pointers = draft ? section.draftAnnotationPointers : section.annotationPointers;
    // A missing draft method is unavailable, including when the accepted-only field is zero.
    if (count === undefined || count <= 0 || !pointers?.length) continue;
    const key = `insight.${family}.records`;
    bundle.set(key, count, 'int', `${output.methodOutputId}/sections/${family}/${draft ? 'draftLocatedRecordCount' : 'locatedRecordCount'}`);
    findings.push({ sectionId: family, status, scope, citations: pointers.map(pointer => citeRecord(recordAt(output, pointer))),
      template: `Trong mẫu lời nguồn, {{${key}}} bản ghi có ${wording}${draft ? ' (đề xuất, chờ chủ duyệt)' : ' theo khai báo được đưa vào'}.` });
    if (findings.length === 6) break;
  }
  return { bundle, findings };
}
