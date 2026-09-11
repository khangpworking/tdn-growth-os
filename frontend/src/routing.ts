import type { DemoState, ProductSection } from './model';

export type Route =
  | { readonly kind: 'portfolio' }
  | { readonly kind: 'market'; readonly marketId: string }
  | { readonly kind: 'product'; readonly marketId: string; readonly productId: string; readonly section: ProductSection }
  | { readonly kind: 'invalid'; readonly hash: string };

const sections = new Set<ProductSection>(['b8', 'sources', 'history', 'b9', 'b10']);

export function parseRoute(hash: string, state: DemoState): Route {
  const normalized = hash.replace(/^#/, '');
  if (!normalized || normalized === '/') return { kind: 'portfolio' };
  let parts: string[];
  try {
    parts = normalized.split('/').filter(Boolean).map((part) => decodeURIComponent(part));
  } catch {
    return { kind: 'invalid', hash };
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
  market: (marketId: string): string => `#/markets/${encodeURIComponent(marketId)}`,
  product: (marketId: string, productId: string, section: ProductSection = 'b8'): string => `#/markets/${encodeURIComponent(marketId)}/products/${encodeURIComponent(productId)}/${section}`,
};
