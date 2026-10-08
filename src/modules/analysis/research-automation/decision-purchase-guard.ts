/** U16/L8, new packets only. Source artifacts and historical candidates never enter this guard. */
export const DECISION_PURCHASE_GUARD_VERSION = 'u16-no-purchase-v1';

// Bounded lexical guard, not a language classifier. Match proposed purchase verbs;
// a quality/test qualifier is not required because L8 prohibits purchase proposals generally.
const PURCHASE = /(?<![\p{L}\p{N}_])(?:mua|đặt\s+(?:mua|(?:một\s+)?(?:đơn\s+)?hàng)|buy(?:ing)?|purchas(?:e|ing)|order(?:ing)?|place\s+(?:an?\s+)?(?:(?:trial|sample|test)\s+)?order)(?![\p{L}\p{N}_])/giu;
const CLAUSE = /[.;:!?\n,]|\b(?:but|instead|then|and)\b|(?:\s)(?:nhưng|thay vào đó|sau đó|và)(?:\s)/iu;
// The negation must immediately govern this verb, not a different earlier action.
const PROHIBITION = /(?:không(?:\s+(?:được|nên|cần|đề xuất|khuyến nghị|yêu cầu|phải|thực hiện))?|tránh|cấm|chưa được phép|do not|don't|must not|should not|never|without|no need to|do not (?:suggest|recommend|propose)|avoid|prohibit)\s*$/iu;
const NON_NEGATION = /(?:không chỉ|không thể không|không phải không|không ngừng|not only|cannot not)\s*$/iu;
const REPORTED_PAST = /^(?:khách hàng|người (?:dùng|viết|mua)|chủ|tôi|họ)\s+(?:đã|từng|vừa)\s*$/iu;
const SOURCE_DESCRIPTION = /(?:nguồn(?:\s+[\p{L}'’-]+){0,3}\s+(?:ghi nhận|ghi|nêu|cho biết|tự báo cáo)|theo (?:nguồn|review)|source (?:reports|states)|review (?:reports|states))(?:\s+(?:(?!nên|cần|hãy|phải|should|must|recommend).){0,60})?$/iu;
const DATA_NOUN = /(?:lịch sử|dữ liệu|bằng chứng|hồ sơ|hành vi|history of|records of|evidence of)\s*$/iu;

export function hasAuthoredPurchaseProposal(text: string): boolean {
  // Normalize a temporary matching view; never rewrite or return source/proposal bytes.
  const view = text.normalize('NFC').replace(/[\t\r ]+/gu, ' ');
  for (const clause of view.split(CLAUSE)) {
    let prohibited: boolean = false;
    let previousEnd = 0;
    for (const match of clause.matchAll(PURCHASE)) {
      const before = clause.slice(0, match.index).trimEnd();
      const after = clause.slice(match.index + match[0].length);
      const directProhibition = !NON_NEGATION.test(before) && PROHIBITION.test(before);
      const coordinatedProhibition: boolean = prohibited && /^(?:\s+[\p{L}\p{N}'’-]+){0,5}\s+(?:or|hay|hoặc)\s*$/iu.test(clause.slice(previousEnd, match.index));
      prohibited = directProhibition || coordinatedProhibition;
      previousEnd = match.index + match[0].length;
      if (prohibited) continue;
      if (REPORTED_PAST.test(before) || SOURCE_DESCRIPTION.test(before) || DATA_NOUN.test(before)) continue;
      // English noun phrases describing retained evidence are not proposed actions.
      if (/^(?:purchase|order)$/iu.test(match[0]) && /^\s+(?:history|records|receipts|data|evidence|behavior)\b/iu.test(after)) continue;
      // Ordering source records / "in order to" are not orders for goods.
      if (/^order(?:ing)?$/iu.test(match[0]) && !/^\s+(?:(?:a|an|the|one|two|three|competitor|competitor's)\s+){0,3}(?:product|products|sample|samples|trial|test|goods|merchandise)\b/iu.test(after)) continue;
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
