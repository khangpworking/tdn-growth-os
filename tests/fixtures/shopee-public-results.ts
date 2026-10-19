// Synthetic wire inputs. These are deliberately unsafe to persist verbatim.
export const AT = '2026-02-01T00:00:00.000Z';
export const TOKEN = 'synthetic-secret/%?echo';
export const RAW_SENTINELS = ['synthetic-author-only', 'synthetic-media-only', 'synthetic-composed-only', TOKEN, encodeURIComponent(TOKEN)] as const;
export const PRODUCTS = [
  { shopId: '91001', itemId: '92001', productUrl: 'https://shopee.vn/product/91001/92001' },
  { shopId: '91002', itemId: '92002', productUrl: 'https://shopee.vn/product/91002/92002' },
  { shopId: '91003', itemId: '92003', productUrl: 'https://shopee.vn/product/91003/92003' },
] as const;
export const IDS = ['10000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000003'] as const;
export const SHARED_ID = '900719925474099312345';
export function row(product = 0, values: Record<string, unknown> = {}) {
  return { review_id: SHARED_ID, author: RAW_SENTINELS[0], posted_at_local: '2024-02-29 23:07', variation: '  Variant A\n', stars: 5,
    comment: '  Synthetic comment A\n<&>  ', attributes: [' Material A ', 'Size A\n'], review_text: RAW_SENTINELS[2], content_type: 'comment',
    media_urls: [`https://example.invalid/${RAW_SENTINELS[1]}`], page: 1, source_url: PRODUCTS[product]!.productUrl, ...values };
}
export function result(product = 0, records: unknown[] = [row(product)], values: Record<string, unknown> = {}) {
  let cumulative = 0;
  const pages = [...new Set(records.map(r => (r as any)?.page ?? 1))].sort((a, b) => a - b).map(page => {
    const members = records.filter(r => ((r as any)?.page ?? 1) === page);
    cumulative += members.length;
    return { page, cards: members.length, collected: cumulative, ids: members.map(r => (r as any)?.review_id).filter(id => typeof id === 'string') };
  });
  return { job_id: IDS[product], complete: true, product_url: PRODUCTS[product]!.productUrl, kind: 'shopee_dom_crawl',
    product_title: 'Synthetic item', filter: 'With Comments (17)', expected_with_comments: 17, rating_filters: ['All (17)'],
    records, excluded: [], pages,
    started_at: AT, finished_at: '2026-02-01T00:00:09.000Z', stop_reason: 'record_limit', error: null, ...values };
}
export const RESULT_A = result(0, [row(), row(0, { page: 2 }), row(0, { review_id: 'A-attributes', comment: '', attributes: [' Texture A '], content_type: 'attributes_only', stars: null })]);
export const RESULT_B = result(1, [row(1, { comment: 'Synthetic comment B', variation: 'Variant B', posted_at_local: '2026-01-05 08:09', stars: '5' }),
  row(1, { review_id: 'B-conflict', comment: 'Synthetic first version' }), row(1, { review_id: 'B-conflict', comment: 'Synthetic second version', page: 2 })]);
export const RESULT_C = result(2, [row(2, { comment: 'Synthetic comment C', attributes: [], variation: '' }),
  row(2, { review_id: 'C-empty', comment: '', attributes: [], content_type: 'comment' }),
  row(2, { review_id: 'C-missing', comment: null }), row(2, { review_id: null, comment: 'Unidentified synthetic comment' })],
  { excluded: [{ review_id: 'C-excluded', reason: 'empty_or_media_only' }, { review_id: 'C-excluded', reason: 'empty_or_media_only' },
    { review_id: 'C-symbols', reason: 'empty_or_symbols_only' }] });
export const WRONG_SOURCE_RESULT = result(0, [row(0, { source_url: PRODUCTS[1].productUrl })]);
export const SECRET_ECHO_RESULT = result(0, [row()], { extra: { echo: TOKEN } });
export const ENCODED_SECRET_ECHO_RESULT = result(0, [row()], { extra: encodeURIComponent(TOKEN) });
export function job(product = 0, state = 'queued', values: Record<string, unknown> = {}, cap = 20) {
  return { id: IDS[product], request: { url: PRODUCTS[product]!.productUrl, max_comments: cap }, state, created_at: AT, updated_at: AT,
    collected: 0, page: 0, cancel_requested: false, error: null, result_available: false, ...values };
}
export const READY = { status: 'ok', browser: 'ready', active_job: null, queued: 0 };
