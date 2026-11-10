import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { main } from '../../scripts/module-collect-public.js';
import { ModuleError } from '../../scripts/module-pick.js';
import type { PublicCollectedPages, PublicReviewEnvelope, PublicReviewReceipt, ShopeePublicReviewCollector } from '../../src/platform/collectors/shopee-public-reviews.js';

type PublicRow = PublicReviewEnvelope['rows'][number];

// Synthetic fixtures only: invented ids, urls and review text.
const ITEM = '12345678901';
const SHOP = '987654321';
const ITEM_2 = '22345678901';
const SHOP_2 = '876543210';
const AT = '2026-11-10T03:00:00Z';
const sha256 = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const link = (rank: number, item = ITEM, shop = SHOP) => ({
  rank, productBaseId: `1__${item}__${shop}`, shopId: shop, itemId: item,
  url: `https://shopee.vn/product/${shop}/${item}`,
  brand: 'Hoa Giấy', revenue: 500, reason: `Hạng chọn ${rank}, doanh thu kỳ 500 đồng, thương hiệu Hoa Giấy.`,
});

const request = (cap: number) => ({
  format: 'request-v1', preset: { keywords: ['son'] },
  windows: [
    { id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-10' }, intervalDays: 7 },
    { id: '12m', period: { startDate: '2025-11-11', endDate: '2026-11-10' }, intervalDays: 30 },
  ],
  reviewCapPerLink: cap, principalTitles: [],
});
const selection = (runId: string, cap: number, links = [link(1)]) => ({
  format: 'selection-v1', runId, source: 'auto', pickRuleVersion: 'autorun-pick-v3', metricInputSha256: 'a'.repeat(64),
  links,
  counts: { walked: 1, deleted: 0, notIncluded: 0, tokenGuardRejected: 0, eligible: 1, picked: links.length,
    maskedRows: 0, maskedAboveLowestPick: 0 },
});
const reviewRow = (reviewId: string, item = ITEM, shop = SHOP): PublicRow => ({
  reviewId, shopId: shop, itemId: item, postedAtLocal: '2026-11-01', createdAt: '2026-11-01T10:00:00+07:00',
  variation: null, ratingStar: 5, ratingState: 'VALID', comment: 'Sản phẩm dùng tốt.', attributes: [],
  contentType: 'COMMENT', sourcePage: 1, sourceUrl: `https://shopee.vn/product/${shop}/${item}`, sourceRow: 0, admissionReasons: [],
});
const envelope = (rows: PublicRow[], cap: number, item = ITEM, shop = SHOP): PublicReviewEnvelope => ({
  contractVersion: 'shopee-public-sanitized-result-v1', jobId: '11111111-1111-4111-8111-111111111111',
  productUrl: `https://shopee.vn/product/${shop}/${item}`, shopId: shop, itemId: item, maxReviewsPerProduct: cap, complete: true, stopReason: 'record_limit',
  filter: 'HAS_COMMENTS', expectedWithComments: rows.length, startedAt: AT, finishedAt: AT, excluded: [], diagnostics: [],
  pages: [{ page: 1, cards: rows.length, collected: rows.length, ids: rows.map(row => row.reviewId) }], rows,
});
const receipt = (input: { state?: PublicReviewReceipt['state']; stopCode?: PublicReviewReceipt['stopCode']; item?: string; shop?: string } = {}): PublicReviewReceipt => ({
  productUrl: `https://shopee.vn/product/${input.shop ?? SHOP}/${input.item ?? ITEM}`, shopId: input.shop ?? SHOP, itemId: input.item ?? ITEM, inputSha256: 'b'.repeat(64),
  jobId: '11111111-1111-4111-8111-111111111111', state: input.state ?? 'succeeded', stopCode: input.stopCode ?? null,
  createdAt: AT, observedAt: AT, attemptedAt: AT, complete: true, stopReason: 'record_limit', resultAvailable: true,
  resultSha256: 'c'.repeat(64), resultByteSize: 1, requestCount: 1, requestCountUncertain: false, timedOut: false, cancelIntent: false,
});
type CollectResult = Omit<PublicCollectedPages, 'confirmedSourceSetSha256'>;
const collector = (result: CollectResult, confirmedSourceSetSha256: string): Pick<ShopeePublicReviewCollector, 'collect'> => ({
  collect: async () => ({ ...result, confirmedSourceSetSha256 }),
});

async function runDir(cap = 1, links = [link(1)]) {
  const dir = await mkdtemp(join(tmpdir(), 'shopee-collect-'));
  const runId = basename(dir);
  await writeFile(join(dir, 'request.json'), `${JSON.stringify(request(cap), null, 2)}\n`, 'utf8');
  await mkdir(join(dir, 'm2'), { recursive: true });
  await mkdir(join(dir, 'gates'), { recursive: true });
  const bytes = `${JSON.stringify(selection(runId, cap, links), null, 2)}\n`;
  await writeFile(join(dir, 'm2/selection.json'), bytes, 'utf8');
  await writeFile(join(dir, 'gates/m2.json'), `${JSON.stringify({
    format: 'handoff-v1', module: 'M2', runId, skillVersion: '1.0.0', verdict: 'PASS',
    inputSha256: null, outputSha256: sha256(bytes), checks: [], errorCode: null, next: 'M3',
  }, null, 2)}\n`, 'utf8');
  return { dir, runId, sha: sha256(bytes) };
}
const readJson = async (path: string) => JSON.parse(await readFile(path, 'utf8')) as unknown;

test('OK collection writes the public rows and an OK outcome, then passes', async () => {
  const { dir, sha } = await runDir();
  const rows = [reviewRow('r-1')];
  try {
    const result = await main({ runDir: dir, collector: collector({
      mode: 'fixture', providerId: 'shopee-public-review', mappingRevision: 'shopee-public-review-row-v1',
      maxReviewsPerProduct: 1, usageTotalUsd: 0, warnings: [], pages: [{ bytes: Buffer.from(JSON.stringify(rows)), offset: 0 }],
      envelopes: [envelope(rows, 1)], listings: [receipt()], attemptedAt: AT, reused: false,
    }, sha) });
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.errorCode, null);
    assert.equal(result.exitCode, 0);
    assert.equal(result.reviews, 1);
    assert.deepEqual(await readJson(join(dir, 'm3/reviews.json')), rows);
    assert.deepEqual(await readJson(join(dir, 'm3/outcome.json')), { format: 'm3-outcome-v1', verdict: 'OK', errorCode: null });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a partial collection keeps the rows of every link and passes', async () => {
  const links = [link(1), link(2, ITEM_2, SHOP_2)];
  const { dir, sha } = await runDir(5, links);
  const first = ['r-1', 'r-2', 'r-3', 'r-4', 'r-5'].map(id => reviewRow(id));
  const second = ['r-6', 'r-7'].map(id => reviewRow(id, ITEM_2, SHOP_2));
  try {
    const result = await main({ runDir: dir, collector: collector({
      mode: 'fixture', providerId: 'shopee-public-review', mappingRevision: 'shopee-public-review-row-v1',
      maxReviewsPerProduct: 5, usageTotalUsd: 0, warnings: [],
      pages: [{ bytes: Buffer.from(JSON.stringify(first)), offset: 0 },
        { bytes: Buffer.from(JSON.stringify(second)), offset: first.length }],
      envelopes: [envelope(first, 5), envelope(second, 5, ITEM_2, SHOP_2)],
      listings: [receipt(), receipt({ item: ITEM_2, shop: SHOP_2 })], attemptedAt: AT, reused: false,
    }, sha) });
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.errorCode, null);
    assert.equal(result.exitCode, 0);
    assert.equal(result.reviews, 7);
    assert.deepEqual(await readJson(join(dir, 'm3/reviews.json')), [...first, ...second]);
    assert.deepEqual(await readJson(join(dir, 'm3/outcome.json')),
      { format: 'm3-outcome-v1', verdict: 'PARTIAL_LISTINGS', errorCode: null });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a verdict outside the success list writes no rows and waits for the owner', async () => {
  const links = [link(1), link(2, ITEM_2, SHOP_2)];
  const { dir, sha } = await runDir(5, links);
  const first = ['r-1', 'r-2', 'r-3', 'r-4', 'r-5'].map(id => reviewRow(id));
  const second = ['r-6', 'r-7'].map(id => reviewRow(id, ITEM_2, SHOP_2));
  try {
    const result = await main({ runDir: dir, collector: collector({
      mode: 'fixture', providerId: 'shopee-public-review', mappingRevision: 'shopee-public-review-row-v1',
      maxReviewsPerProduct: 5, usageTotalUsd: 0, warnings: [],
      pages: [{ bytes: Buffer.from(JSON.stringify(first)), offset: 0 },
        { bytes: Buffer.from(JSON.stringify(second)), offset: first.length }],
      envelopes: [envelope(first, 5), envelope(second, 5, ITEM_2, SHOP_2)],
      listings: [receipt(), receipt({ state: 'needs_verification', stopCode: 'HUMAN_VERIFICATION_REQUIRED', item: ITEM_2, shop: SHOP_2 })],
      attemptedAt: AT, reused: false,
    }, sha) });
    assert.equal(result.verdict, 'WAIT_OWNER');
    assert.equal(result.errorCode, 'SHOPEE_VERIFICATION_REQUIRED');
    assert.equal(result.exitCode, 21);
    assert.equal(result.reviews, 0);
    assert.deepEqual(await readJson(join(dir, 'm3/reviews.json')), []);
    assert.deepEqual(await readJson(join(dir, 'm3/outcome.json')),
      { format: 'm3-outcome-v1', verdict: 'SHOPEE_VERIFICATION_REQUIRED', errorCode: 'SHOPEE_VERIFICATION_REQUIRED' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a Shopee login loss waits for the owner and never reports PASS', async () => {
  const { dir, sha } = await runDir();
  try {
    const result = await main({ runDir: dir, collector: collector({
      mode: 'fixture', providerId: 'shopee-public-review', mappingRevision: 'shopee-public-review-row-v1',
      maxReviewsPerProduct: 1, usageTotalUsd: 0, warnings: [], pages: [], envelopes: [],
      listings: [receipt({ state: 'needs_login', stopCode: 'HUMAN_LOGIN_REQUIRED' })], attemptedAt: AT, reused: false,
    }, sha) });
    assert.equal(result.verdict, 'WAIT_OWNER');
    assert.equal(result.errorCode, 'SHOPEE_LOGIN_REQUIRED');
    assert.equal(result.exitCode, 21);
    assert.equal(result.reviews, 0);
    assert.deepEqual(await readJson(join(dir, 'm3/outcome.json')),
      { format: 'm3-outcome-v1', verdict: 'SHOPEE_LOGIN_REQUIRED', errorCode: 'SHOPEE_LOGIN_REQUIRED' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('another collector error fails with code 20', async () => {
  const { dir, sha } = await runDir();
  try {
    const result = await main({ runDir: dir, collector: collector({
      mode: 'fixture', providerId: 'shopee-public-review', mappingRevision: 'shopee-public-review-row-v1',
      maxReviewsPerProduct: 1, usageTotalUsd: 0, warnings: [], pages: [], envelopes: [],
      listings: [receipt({ state: 'SHOPEE_REVIEW_HTTP_500', stopCode: 'SHOPEE_REVIEW_HTTP_500' })], attemptedAt: AT, reused: false,
    }, sha) });
    assert.equal(result.verdict, 'FAIL');
    assert.equal(result.errorCode, 'PROVIDER_BLOCKED');
    assert.equal(result.exitCode, 20);
    assert.deepEqual(await readJson(join(dir, 'm3/reviews.json')), []);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a missing M2 slip is refused before any collection', async () => {
  const { dir, sha } = await runDir();
  try {
    await rm(join(dir, 'gates/m2.json'));
    await assert.rejects(main({ runDir: dir, collector: collector({
      mode: 'fixture', providerId: 'shopee-public-review', mappingRevision: 'shopee-public-review-row-v1',
      maxReviewsPerProduct: 1, usageTotalUsd: 0, warnings: [], pages: [], envelopes: [], listings: [], attemptedAt: AT, reused: false,
    }, sha) }), (error: unknown) => error instanceof ModuleError && error.code === 'GATE_NOT_PASSED' && error.exitCode === 22);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('an injected collector reads no token and opens no network', async () => {
  const { dir, sha } = await runDir();
  const saved = { enabled: process.env.TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED, token: process.env.TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN };
  const savedFetch = globalThis.fetch;
  let fetched = 0;
  process.env.TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED = '1';
  delete process.env.TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN;
  globalThis.fetch = (async () => { fetched++; throw new Error('network is not allowed in this test'); }) as typeof fetch;
  const rows = [reviewRow('r-2')];
  try {
    const result = await main({ runDir: dir, collector: collector({
      mode: 'fixture', providerId: 'shopee-public-review', mappingRevision: 'shopee-public-review-row-v1',
      maxReviewsPerProduct: 1, usageTotalUsd: 0, warnings: [], pages: [{ bytes: Buffer.from(JSON.stringify(rows)), offset: 0 }],
      envelopes: [envelope(rows, 1)], listings: [receipt()], attemptedAt: AT, reused: false,
    }, sha) });
    assert.equal(result.verdict, 'PASS');
    assert.equal(fetched, 0);
  } finally {
    globalThis.fetch = savedFetch;
    if (saved.enabled === undefined) delete process.env.TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED;
    else process.env.TDN_RESEARCH_SHOPEE_PUBLIC_ENABLED = saved.enabled;
    if (saved.token === undefined) delete process.env.TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN;
    else process.env.TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN = saved.token;
    await rm(dir, { recursive: true, force: true });
  }
});
