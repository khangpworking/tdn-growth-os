import type { DemoState, ProductSection } from './model';
import { slugOf, typeBySlug, type PromptType } from './prompt-data-source';

export type Route =
  | { readonly kind: 'portfolio' }
  | { readonly kind: 'market'; readonly marketId: string }
  | { readonly kind: 'product'; readonly marketId: string; readonly productId: string; readonly section: ProductSection }
  | { readonly kind: 'brands' }
  | { readonly kind: 'brand'; readonly brandId: string }
  | { readonly kind: 'catalog'; readonly brandId: string; readonly itemId: string | null }
  | { readonly kind: 'content' }
  | { readonly kind: 'campaign-new' }
  | { readonly kind: 'campaign'; readonly campaignId: string }
  | { readonly kind: 'campaign-insight'; readonly campaignId: string }
  | { readonly kind: 'campaign-ideas'; readonly campaignId: string; readonly ideaKind: 'BIG_IDEA' | 'ANGLE'; readonly parentIdeaId?: string }
  | { readonly kind: 'prompts'; readonly promptType: PromptType; readonly promptRef: string | null }
  | { readonly kind: 'invalid'; readonly hash: string };

const sections = new Set<ProductSection>(['b8', 'sources', 'history', 'b9', 'b10']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRoute(hash: string, state: DemoState): Route {
  const normalized = hash.replace(/^#/, '');
  if (!normalized || normalized === '/') return { kind: 'portfolio' };
  let parts: string[];
  try {
    parts = normalized.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return { kind: 'invalid', hash };
  }
  if (parts.length === 1 && parts[0] === 'brands') return { kind: 'brands' };
  if (parts.length === 2 && parts[0] === 'brands') return UUID.test(parts[1]!) ? { kind: 'brand', brandId: parts[1]! } : { kind: 'invalid', hash };
  if (parts.length === 1 && parts[0] === 'content') return { kind: 'content' };
  if (parts.length === 2 && parts[0] === 'content') {
    if (parts[1] === 'new') return { kind: 'campaign-new' };
    return UUID.test(parts[1]!) ? { kind: 'campaign', campaignId: parts[1]! } : { kind: 'invalid', hash };
  }
  if (parts.length === 3 && parts[0] === 'content' && parts[2] === 'insight') return UUID.test(parts[1]!) ? { kind: 'campaign-insight', campaignId: parts[1]! } : { kind: 'invalid', hash };
  if (parts.length === 3 && parts[0] === 'content' && (parts[2] === 'big-idea' || parts[2] === 'angle')) {
    return UUID.test(parts[1]!) ? { kind: 'campaign-ideas', campaignId: parts[1]!, ideaKind: parts[2] === 'big-idea' ? 'BIG_IDEA' : 'ANGLE' } : { kind: 'invalid', hash };
  }
  // The Angle step opened for one specific Big Idea ("Tạo góc nội dung" on that Big Idea).
  if (parts.length === 4 && parts[0] === 'content' && parts[2] === 'angle') {
    return UUID.test(parts[1]!) && UUID.test(parts[3]!) ? { kind: 'campaign-ideas', campaignId: parts[1]!, ideaKind: 'ANGLE', parentIdeaId: parts[3]! } : { kind: 'invalid', hash };
  }
  if (parts[0] === 'prompts' && parts.length <= 3) {
    const promptType = parts.length === 1 ? 'BIG_IDEA' : typeBySlug(parts[1]!);
    const promptRef = parts[2] ?? null;
    return promptType && (promptRef === null || UUID.test(promptRef) || /^system-[a-z0-9-]{3,60}$/.test(promptRef)) ? { kind: 'prompts', promptType, promptRef } : { kind: 'invalid', hash };
  }
  if ((parts.length === 3 || parts.length === 4) && parts[0] === 'brands' && parts[2] === 'products') {
    const itemId = parts[3] ?? null;
    return UUID.test(parts[1]!) && (itemId === null || UUID.test(itemId)) ? { kind: 'catalog', brandId: parts[1]!, itemId } : { kind: 'invalid', hash };
  }
  if (parts.length === 2 && parts[0] === 'markets') {
    return state.markets.some((market) => market.id === parts[1])
      ? { kind: 'market', marketId: parts[1]! }
      : { kind: 'invalid', hash };
  }
  if (parts.length >= 4 && parts.length <= 5 && parts[0] === 'markets' && parts[2] === 'products') {
    const marketId = parts[1]!;
    const productId = parts[3]!;
    const section = (parts[4] ?? 'b8') as ProductSection;
    const valid = sections.has(section) && state.markets.some((market) => market.id === marketId)
      && state.products.some((product) => product.id === productId && product.marketId === marketId);
    return valid ? { kind: 'product', marketId, productId, section } : { kind: 'invalid', hash };
  }
  return { kind: 'invalid', hash };
}

export const routeToHash = {
  portfolio: (): string => '#/',
  brands: (): string => '#/brands',
  brand: (brandId: string): string => `#/brands/${encodeURIComponent(brandId)}`,
  catalog: (brandId: string): string => `#/brands/${encodeURIComponent(brandId)}/products`,
  content: (): string => '#/content',
  campaignNew: (): string => '#/content/new',
  campaign: (campaignId: string): string => `#/content/${encodeURIComponent(campaignId)}`,
  campaignInsight: (campaignId: string): string => `#/content/${encodeURIComponent(campaignId)}/insight`,
  campaignBigIdea: (campaignId: string): string => `#/content/${encodeURIComponent(campaignId)}/big-idea`,
  campaignAngle: (campaignId: string, bigIdeaId?: string): string => `#/content/${encodeURIComponent(campaignId)}/angle${bigIdeaId ? `/${encodeURIComponent(bigIdeaId)}` : ''}`,
  prompts: (promptType: PromptType): string => `#/prompts/${slugOf(promptType)}`,
  prompt: (promptType: PromptType, promptRef: string): string => `#/prompts/${slugOf(promptType)}/${encodeURIComponent(promptRef)}`,
  catalogItem: (brandId: string, itemId: string): string => `#/brands/${encodeURIComponent(brandId)}/products/${encodeURIComponent(itemId)}`,
  market: (marketId: string): string => `#/markets/${encodeURIComponent(marketId)}`,
  product: (marketId: string, productId: string, section: ProductSection = 'b8'): string => `#/markets/${encodeURIComponent(marketId)}/products/${encodeURIComponent(productId)}/${section}`,
};
