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
// "người mua" / "bên mua" name the buyer (a noun), not a proposed purchase,
// unless a directive governs it ("nhờ người mua ...") or a goods object follows.
const BUYER_NOUN = /(?<![\p{L}\p{N}_])(?:người|bên)$/iu;
const DIRECTIVE_BUYER = /(?<![\p{L}\p{N}_])(?:đề xuất|đề nghị|khuyến nghị|khuyến khích|kêu gọi|khuyên|nhờ|thuê|nên|hãy|cần|phải|yêu cầu|giao|cử|mời|recommend|suggest|propose|ask|encourage|urge|advise|tell|instruct|invite|hire)(?:\s+(?:cho|để|một|các|những|mọi|mỗi|từng|tất cả|cả|the|a|an|each|every|all|our)){0,3}\s+(?:người|bên)$/iu;
// "người mua hàng" alone is the shopper noun; a quantity + classifier or "hàng mẫu/thử" marks goods.
const GOODS_AFTER_BUYER = /^\s*(?:(?:thử|ngay|trước|luôn)(?![\p{L}\p{N}_])|(?:(?:một|hai|ba|vài|các|những|mỗi|\d+)\s+)?(?:sản phẩm|mẫu|đơn|lô|gói|hàng\s+(?:mẫu|thử|đối thủ))(?![\p{L}\p{N}_])|(?:một|hai|ba|vài|mỗi|\d+)\s+(?:chiếc|cái|hộp|bộ|chai|lọ|túi|thùng|hàng)(?![\p{L}\p{N}_])|(?:(?:a|an|one|two|some|the|\d+)\s+)?(?:competitor(?:'s|’s)?\s+)?(?:products?|samples?|units?|items?|goods)(?![\p{L}\p{N}_]))/iu;
// Line breaks end a clause for negation scope, but a buyer phrase split across lines
// ("Đề xuất\nngười mua\nsản phẩm") is read across them before it is exempted.
const CLAUSE_WITHIN_LINE = new RegExp(CLAUSE.source.replace('[.;:!?\\n,]', '[.;:!?,]'), 'iu');
const CLAUSE_SEPARATOR = new RegExp(CLAUSE.source, 'giu');

function clausesWithStart(view: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  let start = 0;
  for (const separator of view.matchAll(CLAUSE_SEPARATOR)) {
    out.push({ text: view.slice(start, separator.index), start });
    start = separator.index + separator[0].length;
  }
  out.push({ text: view.slice(start), start });
  return out;
}

export function hasAuthoredPurchaseProposal(text: string): boolean {
  // Normalize a temporary matching view; never rewrite or return source/proposal bytes.
  const view = text.normalize('NFC').replace(/[\t\r \u00a0]+/gu, ' ');
  for (const { text: clause, start } of clausesWithStart(view)) {
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
      // A directly negated purchase noun is a prohibition, not a buying verb.
      // It cannot exempt another purchase later in the same or a separate clause.
      if (/^purchase$/iu.test(match[0]) && /^\s*no$/iu.test(before) &&
          /^\s+(?:(?:is|was)\s+)?(?:needed|required|necessary)\b/iu.test(after)) continue;
      if (REPORTED_PAST.test(before) || SOURCE_DESCRIPTION.test(before) || DATA_NOUN.test(before)) continue;
      if (/^mua$/iu.test(match[0]) && BUYER_NOUN.test(before)) {
        const at = start + match.index;
        const lineBefore = (view.slice(0, at).split(CLAUSE_WITHIN_LINE).at(-1) ?? '').replace(/\s*\n\s*/gu, ' ').trimEnd();
        const lineAfter = (view.slice(at + match[0].length).split(CLAUSE_WITHIN_LINE)[0] ?? '').replace(/\s*\n\s*/gu, ' ');
        if (!DIRECTIVE_BUYER.test(lineBefore) && !GOODS_AFTER_BUYER.test(lineAfter)) continue;
      }
      // English noun phrases describing retained evidence are not proposed actions.
      if (/^(?:purchase|order)$/iu.test(match[0]) && /^\s+(?:history|records|receipts|data|evidence|behavior)\b/iu.test(after)) continue;
      // Ordering source records / "in order to" are not orders for goods.
      // Possessives, adjectives and quantities may precede a goods noun. Stop
      // before record/evidence nouns or purpose clauses used for source ordering.
      if (/^order(?:ing)?$/iu.test(match[0]) && !/^\s+(?:(?!to\b|for\b|by\b|records?\b|entries\b|reviews?\b|results?\b|history\b|data\b|evidence\b)[\p{L}\p{N}][\p{L}\p{N}'’-]*\s+){0,8}(?:product|products|sample|samples|trial|test|goods|merchandise)\b(?!\s+(?:records?|entries|reviews?|results?|history|data|evidence)\b)/iu.test(after)) continue;
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
