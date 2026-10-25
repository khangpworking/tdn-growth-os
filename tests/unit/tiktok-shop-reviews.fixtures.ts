import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';

export const REVIEW_TEXT = 'Synthetic private review: lid fits sample container.';
export const REVIEW_TEXTS = [REVIEW_TEXT, 'Synthetic fallback review.', 'Synthetic top-level fallback.'] as const;
export const PRIVATE_FIELDS = {
  reviewer_name: 'SYNTHETIC_NAME_SENTINEL', avatar: 'SYNTHETIC_AVATAR_SENTINEL',
  user_id: 'SYNTHETIC_USER_SENTINEL', seller: 'SYNTHETIC_SELLER_SENTINEL',
};

export function reviewPayload(productId: string) {
  return { success: true, data: { product_id: productId, country_code: 'VN', cached_at: '2026-10-02',
    original_comments: [{ product_id: productId, ...PRIVATE_FIELDS, sku_specification: 'Synthetic blue',
      review: { review_id: '901', display_text: REVIEW_TEXT, review_timestamp: 1789741801752, ...PRIVATE_FIELDS } },
    { product_id: productId, review: { review_id: '902', comment: REVIEW_TEXTS[1] } },
    { product_id: productId, review_id: '903', display_text: REVIEW_TEXTS[2] },
    { product_id: productId, review: { review_id: '904' } }],
    pain_points: [{ view_point: 'Synthetic fit concern', id_list: ['901', '902'] }],
    positive_points: [{ view_point: 'Synthetic fit benefit', id_list: ['903'] }],
    usage_scenarios: [{ view_point: 'Synthetic storage use', id_list: ['904'] }],
  } };
}

export interface Exchange { url: URL; method: string; body: string | null; headers: Headers }
export function offlineTransport(options: {
  before?: number; after?: number; balanceStatus?: number;
  paidReply?: (productId: string, index: number) => { status: number; payload: unknown };
} = {}) {
  const calls: Exchange[] = [];
  let balanceReads = 0, paid = 0, clock = Date.parse('2026-10-02T00:00:00Z');
  const transport: ProviderTransport = {
    now: () => clock, sleep: async ms => { clock += ms; },
    fetch: async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body == null ? null : String(init.body);
      calls.push({ url, method: init?.method ?? 'GET', body, headers: new Headers(init?.headers) });
      let reply: { status: number; payload: unknown };
      if (url.pathname === '/openapi/v1/credit/balance') {
        reply = options.balanceStatus ? { status: options.balanceStatus, payload: { success: false } }
          : { status: 200, payload: { success: true, data: { totalRemain: balanceReads++ === 0 ? options.before ?? 10 : options.after ?? 9 } } };
      } else if (url.pathname === '/openapi/v1/tiktok/product/comment/insight') {
        const productId = (JSON.parse(body!) as { product_id: string }).product_id;
        reply = options.paidReply?.(productId, paid++) ?? { status: 200, payload: reviewPayload(productId) };
      } else throw new Error('Unexpected offline endpoint');
      return new Response(JSON.stringify(reply.payload), { status: reply.status, headers: { 'content-type': 'application/json' } });
    },
  };
  return { calls, transport };
}
