/**
 * Fixed per-section questions, local quote verification and verified-quote
 * artifacts for the optional document-indexing connector. One fixed question
 * per eligible section from `section-methods-v1`; caps of at most one question
 * per section per PDF and at most N per run (default 10, configurable). A
 * question is asked at most once: there is no retry. Report rendering is out
 * of scope here (package P8): this module only produces verified quotes ready
 * for `CitationRegistry`.
 */
export type PageIndexVerifierDropReason = 'PAGE_OUT_OF_RANGE' | 'QUOTE_NOT_ON_PAGE';

export interface PageIndexLocalPage {
  readonly page: number;
  readonly text: string;
}

export interface PageIndexQuoteCandidate {
  readonly page: number;
  readonly quote: string;
}

export interface PageIndexVerifiedQuote {
  readonly sourceSha256: string;
  readonly cloudDocId: string;
  readonly sectionId: string;
  readonly page: number;
  readonly quote: string;
  readonly quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED';
}

/** Eligible sections: evidence-bearing sections, not synthesis, scope, method or appendix. */
export const PAGEINDEX_ELIGIBLE_SECTIONS: readonly string[] = [
  'M03', 'M04', 'M05', 'M06', 'M07', 'M08', 'M09',
  'I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I11', 'I12', 'I13', 'I16',
];

const FIXED_QUESTIONS: Readonly<Record<string, string>> = {
  M03: 'Trích nguyên văn con số quy mô hoặc diễn biến thị trường nêu trong tài liệu?',
  M04: 'Trích nguyên văn câu mô tả cơ cấu hoặc thành phần thị trường trong tài liệu?',
  M05: 'Trích nguyên văn câu mô tả nhu cầu của khách hàng trong tài liệu?',
  M06: 'Trích nguyên văn câu mô tả nguồn cung hoặc nhà bán trong tài liệu?',
  M07: 'Trích nguyên văn câu mô tả đối thủ cạnh tranh trong tài liệu?',
  M08: 'Trích nguyên văn mức giá hoặc phép tính đơn vị nêu trong tài liệu?',
  M09: 'Trích nguyên văn câu mô tả động lực hoặc rủi ro thị trường trong tài liệu?',
  I02: 'Trích nguyên văn câu mô tả khách hàng và hoàn cảnh sử dụng trong tài liệu?',
  I04: 'Trích nguyên văn câu mô tả hành vi của khách hàng trong tài liệu?',
  I05: 'Trích nguyên văn câu thể hiện cảm nhận hoặc thái độ của khách hàng trong tài liệu?',
  I06: 'Trích nguyên văn câu mô tả hành trình mua của khách hàng trong tài liệu?',
  I07: 'Trích nguyên văn câu nêu lý do khách hàng lựa chọn sản phẩm trong tài liệu?',
  I08: 'Trích nguyên văn câu nêu rào cản khiến khách hàng chưa mua trong tài liệu?',
  I09: 'Trích nguyên văn câu nêu nhu cầu chưa được đáp ứng trong tài liệu?',
  I10: 'Trích nguyên văn câu nêu chủ đề hoặc mối quan tâm của khách hàng trong tài liệu?',
  I11: 'Trích nguyên văn câu so sánh sự khác biệt giữa các nhóm khách hàng trong tài liệu?',
  I12: 'Trích nguyên văn câu mô tả điểm tiếp xúc giữa khách hàng và thương hiệu trong tài liệu?',
  I13: 'Trích nguyên văn câu nhận xét về thương hiệu hoặc đối thủ trong tài liệu?',
  I16: 'Trích nguyên văn câu mô tả cách thử nghiệm hoặc đo lường trong tài liệu?',
};

const CATALOG_ORDER: Readonly<Record<string, number>> = {
  M03: 3, M04: 4, M05: 5, M06: 6, M07: 7, M08: 8, M09: 9,
  I02: 15, I04: 17, I05: 18, I06: 19, I07: 20, I08: 21, I09: 22, I10: 23,
  I11: 24, I12: 25, I13: 26, I16: 29,
};

export interface PageIndexPlannedQuestion {
  readonly sectionId: string;
  readonly pdfIndex: number;
  readonly question: string;
}

/** Returns the single fixed question for an eligible section, or null when ineligible. */
export function fixedPageIndexQuestion(sectionId: string): string | null {
  return FIXED_QUESTIONS[sectionId] ?? null;
}

export interface PageIndexQuestionPlanInput {
  readonly sections: readonly string[];
  readonly pdfCount: number;
  /** Maximum questions per run. Defaults to 10. */
  readonly maxPerRun?: number;
}

/**
 * Plans at most one question per section per PDF, capped at `maxPerRun`
 * questions per run in catalog order. Deterministic; duplicates and
 * ineligible sections are dropped.
 */
export function planPageIndexQuestions(input: PageIndexQuestionPlanInput): readonly PageIndexPlannedQuestion[] {
  const maxPerRun = input.maxPerRun ?? 10;
  if (!Number.isSafeInteger(input.pdfCount) || input.pdfCount < 0 ||
    !Number.isSafeInteger(maxPerRun) || maxPerRun < 0) {
    throw new PageIndexQuestionError('INVALID_QUESTION_PLAN');
  }
  const eligible = [...new Set(input.sections)].filter(section => FIXED_QUESTIONS[section] !== undefined)
    .sort((a, b) => (CATALOG_ORDER[a] ?? 99) - (CATALOG_ORDER[b] ?? 99));
  const planned: PageIndexPlannedQuestion[] = [];
  for (let pdfIndex = 0; pdfIndex < input.pdfCount && planned.length < maxPerRun; pdfIndex += 1) {
    for (const sectionId of eligible) {
      if (planned.length >= maxPerRun) break;
      planned.push({ sectionId, pdfIndex, question: FIXED_QUESTIONS[sectionId]! });
    }
  }
  return planned;
}

export type PageIndexQuestionErrorCode = 'INVALID_QUESTION_PLAN' | 'INVALID_QUOTE_INPUT';

export class PageIndexQuestionError extends Error {
  constructor(readonly code: PageIndexQuestionErrorCode) {
    super(`PageIndex question rejected: ${code}`);
    this.name = 'PageIndexQuestionError';
  }
}

const normaliseQuote = (text: string): string => text.normalize('NFC').replace(/\s+/gu, ' ').trim();

export interface VerifyPageIndexQuotesInput {
  readonly candidates: readonly PageIndexQuoteCandidate[];
  readonly localPages: readonly PageIndexLocalPage[];
  readonly pageCount: number;
  readonly sourceSha256: string;
  readonly cloudDocId: string;
  readonly sectionId: string;
  /** Called for every dropped candidate. Must not throw; exceptions are ignored. */
  readonly onDrop?: (dropped: { readonly page: number; readonly quote: string; readonly reason: PageIndexVerifierDropReason }) => void;
}

/**
 * Verifies every `{page, quote}` candidate against locally extracted PDF text
 * (never Cloud OCR). A quote not found on its page, or a page outside the
 * page count, is dropped and reported via `onDrop`.
 */
export function verifyPageIndexQuotes(input: VerifyPageIndexQuotesInput): readonly PageIndexVerifiedQuote[] {
  if (!Number.isSafeInteger(input.pageCount) || input.pageCount < 1 || input.pageCount > 1000 ||
    !/^[0-9a-f]{64}$/.test(input.sourceSha256) || typeof input.cloudDocId !== 'string' || !input.cloudDocId ||
    typeof input.sectionId !== 'string' || !input.sectionId || !Array.isArray(input.candidates) || !Array.isArray(input.localPages)) {
    throw new PageIndexQuestionError('INVALID_QUOTE_INPUT');
  }
  const byPage = new Map<number, string>();
  for (const entry of input.localPages) {
    if (entry && Number.isSafeInteger(entry.page) && typeof entry.text === 'string' && !byPage.has(entry.page)) {
      byPage.set(entry.page, normaliseQuote(entry.text));
    }
  }
  const verified: PageIndexVerifiedQuote[] = [];
  for (const candidate of input.candidates) {
    if (!candidate || !Number.isSafeInteger(candidate.page) || typeof candidate.quote !== 'string') {
      throw new PageIndexQuestionError('INVALID_QUOTE_INPUT');
    }
    const drop = (reason: PageIndexVerifierDropReason): void => {
      try {
        input.onDrop?.({ page: candidate.page, quote: candidate.quote, reason });
      } catch {
        // Dropping is logged best effort only.
      }
    };
    if (candidate.page < 1 || candidate.page > input.pageCount) {
      drop('PAGE_OUT_OF_RANGE');
      continue;
    }
    const comparable = normaliseQuote(candidate.quote);
    const local = byPage.get(candidate.page) ?? '';
    if (!comparable || !local.includes(comparable)) {
      drop('QUOTE_NOT_ON_PAGE');
      continue;
    }
    verified.push({
      sourceSha256: input.sourceSha256,
      cloudDocId: input.cloudDocId,
      sectionId: input.sectionId,
      page: candidate.page,
      quote: candidate.quote,
      quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED',
    });
  }
  return verified;
}

export interface PageIndexQuotesArtifact {
  readonly contractVersion: 'pageindex-verified-quotes-v1';
  readonly approvalState: 'UNREVIEWED';
  readonly runId: string;
  readonly quotes: readonly PageIndexVerifiedQuote[];
}

/**
 * Builds the run artifact holding verified quotes. Only verified quotes enter;
 * the vendor answer text is never stored as report content.
 */
export function buildVerifiedQuotesArtifact(runId: string, quotes: readonly PageIndexVerifiedQuote[]): PageIndexQuotesArtifact {
  if (typeof runId !== 'string' || !runId || !Array.isArray(quotes) ||
    quotes.some(quote => !quote || quote.quoteVerification !== 'EXTERNAL_VERIFIER_ATTESTED' ||
      !Number.isSafeInteger(quote.page) || quote.page < 1 || typeof quote.quote !== 'string' || !quote.quote)) {
    throw new PageIndexQuestionError('INVALID_QUOTE_INPUT');
  }
  return {
    contractVersion: 'pageindex-verified-quotes-v1',
    approvalState: 'UNREVIEWED',
    runId,
    quotes: [...quotes],
  };
}

export interface PageIndexCitationInput {
  readonly sourceKind: 'PDF_PAGE';
  readonly identity: string;
  readonly locator: { readonly kind: 'pdf'; readonly page: number; readonly fragment: null };
  readonly label: string;
  readonly retrievedAt: string | null;
  readonly url: null;
  readonly quote: string;
  readonly quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED';
}

/**
 * Shapes a verified quote for `CitationRegistry` as `PDF_PAGE` with a `pdf`
 * page locator. The label is plain reader text: no vendor name, no digest.
 */
export function toCitationInput(quote: PageIndexVerifiedQuote, fileName: string): PageIndexCitationInput {
  if (!quote || quote.quoteVerification !== 'EXTERNAL_VERIFIER_ATTESTED' || typeof fileName !== 'string' || !fileName.trim()) {
    throw new PageIndexQuestionError('INVALID_QUOTE_INPUT');
  }
  return {
    sourceKind: 'PDF_PAGE',
    identity: quote.sourceSha256,
    locator: { kind: 'pdf', page: quote.page, fragment: null },
    label: `Tài liệu ${fileName.trim()}, trang ${quote.page}`,
    retrievedAt: null,
    url: null,
    quote: quote.quote,
    quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED',
  };
}
