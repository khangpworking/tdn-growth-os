/** Pure per-platform topic × polarity ranking for retained review coding. */
export type ReviewPlatform = 'SHOPEE' | 'TIKTOK';
export type ReviewPolarity = 'KHEN' | 'CHE' | 'KHONG_RO';

export interface ReviewTopicMention {
  readonly platform: ReviewPlatform;
  readonly recordIndex: number;
  readonly topic: string | null;
  readonly polarity: ReviewPolarity;
  readonly quote?: string | { readonly text: string; readonly context?: string | null };
  readonly context?: string | null;
}

export interface ReviewTopicQuote {
  readonly recordIndex: number;
  readonly quote: string;
  readonly context: string | null;
}

export interface ReviewTopicRankedRow {
  readonly rank: number;
  readonly topic: string;
  readonly polarity: Exclude<ReviewPolarity, 'KHONG_RO'>;
  readonly mentionCount: number;
  readonly quotes: ReviewTopicQuote[];
}

export interface ReviewTopicRanking {
  readonly platform: ReviewPlatform;
  readonly rows: ReviewTopicRankedRow[];
  readonly khac: { readonly mentionCount: number; readonly quotes: ReviewTopicQuote[] };
  readonly khongRoCount: number;
  readonly khacShare: number;
  readonly needsTopUp: boolean;
}

export interface ReviewTopicRankingOptions { readonly platform?: ReviewPlatform; readonly topUpRoundsDone?: number }

/** Count each record once per topic × polarity, fold small/unassigned topics into Khác, and rank strictly. */
export function rankReviewTopicMentions(mentions: readonly ReviewTopicMention[], options: ReviewTopicRankingOptions = {}): ReviewTopicRanking {
  const platform = options.platform ?? mentions.find(m => m.platform)?.platform ?? 'SHOPEE';
  const scoped = mentions.filter(m => m.platform === platform);
  const unique = new Map<string, ReviewTopicMention>();
  for (const mention of scoped) {
    if (!Number.isInteger(mention.recordIndex) || (mention.polarity !== 'KHEN' && mention.polarity !== 'CHE' && mention.polarity !== 'KHONG_RO')) continue;
    const topic = mention.topic?.trim() || null;
    const key = `${mention.recordIndex}\u0000${mention.polarity}\u0000${topic ?? ''}`;
    const normalized = { ...mention, topic };
    const existing = unique.get(key);
    if (!existing || mentionOrder(normalized, existing) < 0) unique.set(key, normalized);
  }
  const khongRoCount = [...unique.values()].filter(m => m.polarity === 'KHONG_RO').length;
  const counts = new Map<string, { topic: string; polarity: 'KHEN' | 'CHE'; mentions: ReviewTopicMention[] }>();
  const khacMentions: ReviewTopicMention[] = [];
  for (const mention of unique.values()) {
    if (mention.polarity === 'KHONG_RO') continue;
    if (mention.topic === null) { khacMentions.push(mention); continue; }
    const key = `${mention.topic}\u0000${mention.polarity}`;
    const group = counts.get(key) ?? { topic: mention.topic, polarity: mention.polarity, mentions: [] };
    group.mentions.push(mention); counts.set(key, group);
  }
  for (const [key, group] of [...counts]) {
    if (group.mentions.length < 3) { khacMentions.push(...group.mentions); counts.delete(key); }
  }
  const quote = (m: ReviewTopicMention): ReviewTopicQuote => ({ recordIndex: m.recordIndex, quote: typeof m.quote === 'string' ? m.quote : (m.quote?.text ?? ''), context: typeof m.quote === 'object' ? (m.quote.context ?? m.context ?? null) : (m.context ?? null) });
  const orderedQuotes = (values: readonly ReviewTopicMention[]) => [...values].sort(mentionOrder).map(quote);
  const codePointCompare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
  const polarityOrder = (polarity: 'KHEN' | 'CHE') => polarity === 'KHEN' ? 0 : 1;
  const groups = [...counts.values()].sort((a, b) => b.mentions.length - a.mentions.length ||
    codePointCompare(a.topic, b.topic) || polarityOrder(a.polarity) - polarityOrder(b.polarity) ||
    codePointCompare(`${a.topic}\u0000${a.polarity}`, `${b.topic}\u0000${b.polarity}`));
  let previous = -1, rank = 0;
  const rows = groups.map((group, index) => {
    if (group.mentions.length !== previous) { rank = index + 1; previous = group.mentions.length; }
    return { rank, topic: group.topic, polarity: group.polarity, mentionCount: group.mentions.length, quotes: orderedQuotes(group.mentions) };
  });
  const denominator = rows.reduce((sum, row) => sum + row.mentionCount, 0) + khacMentions.length;
  const khacShare = denominator === 0 ? 0 : khacMentions.length / denominator;
  return { platform, rows, khac: { mentionCount: khacMentions.length, quotes: orderedQuotes(khacMentions).slice(0, 3) }, khongRoCount,
    khacShare, needsTopUp: khacShare > 0.20 && (options.topUpRoundsDone ?? 0) < 1 };
}

function mentionOrder(a: ReviewTopicMention, b: ReviewTopicMention): number {
  const text = (mention: ReviewTopicMention) => typeof mention.quote === 'string' ? mention.quote : (mention.quote?.text ?? '');
  const context = (mention: ReviewTopicMention) => typeof mention.quote === 'object' ? (mention.quote.context ?? mention.context ?? '') : (mention.context ?? '');
  return a.recordIndex - b.recordIndex || (text(a) < text(b) ? -1 : text(a) > text(b) ? 1 : 0) ||
    (context(a) < context(b) ? -1 : context(a) > context(b) ? 1 : 0);
}

/** Group a mixed corpus without pooling platform counts. */
export function rankReviewTopicsByPlatform(mentions: readonly ReviewTopicMention[], topUpRoundsDone = 0): Record<ReviewPlatform, ReviewTopicRanking> {
  if (mentions.some(mention => mention.platform !== 'SHOPEE' && mention.platform !== 'TIKTOK')) {
    throw new TypeError('rankReviewTopicsByPlatform requires platform on every mention');
  }
  return { SHOPEE: rankReviewTopicMentions(mentions, { platform: 'SHOPEE', topUpRoundsDone }), TIKTOK: rankReviewTopicMentions(mentions, { platform: 'TIKTOK', topUpRoundsDone }) };
}
