/** U16/L8, new packets only. Source artifacts and historical candidates never enter this guard. */
export const DECISION_PURCHASE_GUARD_VERSION = 'u16-no-purchase-v1';

// Bounded lexical guard, not a language classifier. Match proposed purchase verbs;
// a quality/test qualifier is not required because L8 prohibits purchase proposals generally.
const PURCHASE = /(?<![\p{L}\p{N}_])(?:mua|đặt\s+(?:mua|hàng)|buy(?:ing)?|purchas(?:e|ing)|order(?:ing)?|place\s+(?:an?\s+)?order)(?![\p{L}\p{N}_])/giu;
const CLAUSE = /[.;:!?\n,]|\b(?:but|instead|then|and)\b|(?:\s)(?:nhưng|thay vào đó|sau đó|và)(?:\s)/iu;
// The negation must immediately govern this verb, not a different earlier action.
const PROHIBITION = /(?:không(?:\s+(?:được|nên|cần|đề xuất|khuyến nghị|yêu cầu|phải|thực hiện))?|tránh|cấm|chưa được phép|do not|don't|must not|should not|never|without|no need to|do not (?:suggest|recommend|propose)|avoid|prohibit)\s*$/iu;
const NON_NEGATION = /(?:không chỉ|không thể không|không phải không|không ngừng|not only|cannot not)\s*$/iu;
const REPORTED_PAST = /^(?:khách hàng|người (?:dùng|viết|mua)|chủ|tôi|họ)\s+(?:đã|từng|vừa)\s*$/iu;
const SOURCE_DESCRIPTION = /(?:nguồn (?:ghi nhận|cho biết|tự báo cáo)|theo (?:nguồn|review)|source (?:reports|states)|review (?:reports|states))\s+(?:(?!nên|cần|hãy|phải|should|must|recommend).){0,60}$/iu;
const DATA_NOUN = /(?:lịch sử|dữ liệu|bằng chứng|hồ sơ|history of|records of|evidence of)\s*$/iu;

export function hasAuthoredPurchaseProposal(text: string): boolean {
  // Normalize a temporary matching view; never rewrite or return source/proposal bytes.
  const view = text.normalize('NFC').replace(/[\t\r ]+/gu, ' ');
  for (const clause of view.split(CLAUSE)) {
    for (const match of clause.matchAll(PURCHASE)) {
      const before = clause.slice(0, match.index).trimEnd();
      const after = clause.slice(match.index + match[0].length);
      if (!NON_NEGATION.test(before) && PROHIBITION.test(before)) continue;
      if (REPORTED_PAST.test(before) || SOURCE_DESCRIPTION.test(before) || DATA_NOUN.test(before)) continue;
      // English noun phrases describing retained evidence are not proposed actions.
      if (/^(?:purchase|order)$/iu.test(match[0]) && /^\s+(?:history|records|receipts|data|evidence)\b/iu.test(after)) continue;
      if (/^order$/iu.test(match[0]) && /(?:in|in order)$/iu.test(before) && /^\s+to\b/iu.test(after)) continue;
      return true;
    }
  }
  return false;
}

/** Every authored field, including nested relations and future schema-admitted prose. */
export function hasDecisionPurchaseProposal(candidates: unknown): boolean {
  if (typeof candidates === 'string') return hasAuthoredPurchaseProposal(candidates);
  if (Array.isArray(candidates)) return candidates.some(hasDecisionPurchaseProposal);
  if (candidates !== null && typeof candidates === 'object') return Object.entries(candidates)
    .filter(([key]) => !['candidateType', 'citedClaimRefs', 'counterevidenceRefs', 'claimRef'].includes(key))
    .some(([, value]) => hasDecisionPurchaseProposal(value));
  return false;
}
