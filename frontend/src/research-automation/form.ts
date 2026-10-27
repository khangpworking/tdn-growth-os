// Local editor model for the steps before Start. Only `startBody` crosses the API boundary, and it
// returns the generated request type.
import type { MetricV3PresetSpec } from '../../../src/shared/metric-v3-preset';
import type { ResearchAutomationInterview, ResearchAutomationStartBody } from './api';
import type { PeriodDraft } from './period';

export type ResearchMode = 'PRODUCT' | 'CATEGORY';
export type ReportChoice = 'BOTH' | 'MARKET' | 'INSIGHT';
export type InterviewIntent = keyof ResearchAutomationInterview;

export interface InterviewAnswer {
  readonly text: string;
  readonly unknown: boolean;
}

export interface ResearchDraft {
  readonly mode: ResearchMode;
  readonly keyword: string;
  readonly description: string;
  readonly interview: Readonly<Record<InterviewIntent, InterviewAnswer>>;
  readonly period: PeriodDraft;
  readonly reports: ReportChoice;
}

/** Fixed category interview (ADR 0003): what the user means, never what needs research to answer. */
export const interviewQuestions: readonly { readonly intent: InterviewIntent; readonly question: string; readonly hint: string; readonly label: string }[] = [
  { intent: 'productType', label: 'Loại sản phẩm', question: 'Bạn đang nghĩ đến loại hoặc dạng sản phẩm nào?', hint: 'Ví dụ: dạng viên, dạng bột, giày chạy bộ, đồ chơi gỗ.' },
  { intent: 'audience', label: 'Dành cho ai', question: 'Sản phẩm dành cho ai?', hint: 'Ví dụ: người lớn tuổi, bà bầu, trẻ 3–6 tuổi.' },
  { intent: 'useCase', label: 'Dùng khi nào', question: 'Người dùng dùng nó khi nào, cho việc gì?', hint: 'Ví dụ: chạy bộ hằng ngày, bổ sung sau sinh.' },
  { intent: 'priceRange', label: 'Mức giá', question: 'Bạn đang nghĩ tới mức giá nào?', hint: 'Ví dụ: dưới 300.000đ một hộp.' },
  { intent: 'knownProduct', label: 'Sản phẩm giống ý', question: 'Có sản phẩm nào giống ý bạn không?', hint: 'Tên hoặc link một sản phẩm đang bán. Không bắt buộc.' },
];

export function emptyDraft(period: PeriodDraft): ResearchDraft {
  const blank: InterviewAnswer = { text: '', unknown: false };
  return {
    mode: 'CATEGORY', keyword: '', description: '', period, reports: 'BOTH',
    interview: { productType: blank, audience: blank, useCase: blank, priceRange: blank, knownProduct: blank },
  };
}

/** Product mode needs a description; category mode only the keyword. */
export function draftProblem(draft: ResearchDraft): string | null {
  if (!draft.keyword.trim()) return 'Nhập từ khóa để tiếp tục.';
  if (draft.mode === 'PRODUCT' && !draft.description.trim()) return 'Thêm mô tả hoặc link sản phẩm để tiếp tục.';
  return null;
}

/** A whole product text pasted into the keyword box (ADR 0013). */
export function looksDetailed(text: string): boolean {
  const value = text.trim();
  return /\n/.test(value) || /https?:\/\//.test(value) || value.length > 70
    || (/\d[\d.,]*\s*(đ|vnđ|vnd|k|ml|mg|viên|gói|hộp)(?=[\s,.;)]|$)/i.test(value) && value.split(/\s+/).length > 6);
}

/** Keeps the product name (first chunk, at most 8 words) as keyword; the full text becomes the description. */
export function splitPastedKeyword(text: string): { readonly keyword: string; readonly description: string } {
  const withoutUrls = text.replace(/https?:\/\/\S+/g, ' ').trim();
  const name = (withoutUrls.split(/\n|[,;:|(]|\.\s|\s[-–—]\s/)[0] ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
  return { keyword: name, description: text.trim() };
}

export function reportKinds(choice: ReportChoice): ResearchAutomationStartBody['reports'] {
  return choice === 'MARKET' ? ['MARKET'] : choice === 'INSIGHT' ? ['INSIGHT'] : ['MARKET', 'INSIGHT'];
}

/** Start-v2 extras. Without any option the body stays on start-v1, as older callers expect. */
export interface StartOptions {
  readonly waitForKeyword2?: boolean;
  readonly metricV3Preset?: MetricV3PresetSpec;
}

/** Request body without the idempotency key. Unknown and empty answers are omitted, never invented. */
export function startBody(draft: ResearchDraft, requestKey: string, options: StartOptions = {}): ResearchAutomationStartBody {
  const interview: Partial<Record<InterviewIntent, string>> = {};
  if (draft.mode === 'CATEGORY') {
    for (const { intent } of interviewQuestions) {
      const answer = draft.interview[intent];
      if (!answer.unknown && answer.text.trim()) interview[intent] = answer.text.trim();
    }
  }
  // A confirmed preset already fixes both keywords and windows, so the wait flag would be ignored.
  const versioned = options.metricV3Preset !== undefined || options.waitForKeyword2 !== undefined;
  return {
    contractVersion: versioned ? 'research-automation-start-v2' : 'research-automation-start-v1',
    requestKey,
    mode: draft.mode,
    keyword: draft.keyword.trim(),
    ...(draft.mode === 'PRODUCT' ? { description: draft.description.trim() } : {}),
    requestedPeriod: { startDate: draft.period.startDate, endDate: draft.period.endDate },
    reports: reportKinds(draft.reports),
    ...(draft.mode === 'CATEGORY' ? { interview } : {}),
    ...(options.metricV3Preset !== undefined ? { metricV3Preset: { ...options.metricV3Preset } } : {}),
    ...(versioned && options.metricV3Preset === undefined ? { waitForKeyword2: options.waitForKeyword2 === true } : {}),
  };
}
