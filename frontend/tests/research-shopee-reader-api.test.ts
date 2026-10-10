import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShopeeReader } from '../src/research-automation/shopee-report-api';
import { ResearchAutomationError } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token';
const requestKey = '55555555-5555-4555-8555-555555555555';
const draftPairId = 'a'.repeat(64);
const semanticSha256 = 'b'.repeat(64);
const json = (value: unknown, status = 201) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const body = { contractVersion: 'insight-reader-build-shopee-v1', reportKind: 'INSIGHT', requestKey, draftPairId, semanticSha256, sourceKind: 'SHOPEE' } as const;
const revision = {
  reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-shopee-v1', workspaceId, runId,
  revisionId: '33333333-3333-4333-8333-333333333333', revisionNumber: 1, state: 'PENDING_OWNER_REVIEW',
  draftPairId, semanticSha256, sourceReportSha256: semanticSha256, htmlSha256: 'd'.repeat(64),
  createdAt: '2026-10-08T00:00:00Z', decision: null,
};
const receipt = { contractVersion: 'reader-report-build-receipt-v2', exactRetry: false, revision };

const expectRefusal = (promise: Promise<unknown>, kind: string) => assert.rejects(promise, (failure: unknown) =>
  failure instanceof ResearchAutomationError && failure.kind === kind);

test('Shopee Reader build posts the shopee route and accepts the exact revision identity', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    assert.match(String(url), /\/owner-api\/workspaces\/.+\/research-automation\/runs\/.+\/reader-reports\/shopee$/);
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.deepEqual(JSON.parse(String(init?.body)), body);
    return json(receipt, 201);
  }) as typeof fetch;
  try {
    const result = await buildShopeeReader(workspaceId, runId, body, token);
    assert.equal(result.revision.builderVersion, 'reader-report-insight-shopee-v1');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('Shopee Reader build rejects a receipt whose report digest differs from the selected report', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => json({ ...receipt, revision: { ...revision, sourceReportSha256: 'e'.repeat(64) } }, 201)) as typeof fetch;
  try {
    await expectRefusal(buildShopeeReader(workspaceId, runId, body, token), 'integrity');
  } finally { globalThis.fetch = original; }
});

test('Shopee Reader build rejects a TikTok builder version on the Shopee route', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => json({ ...receipt, revision: { ...revision, builderVersion: 'reader-report-insight-tiktok-v1' } }, 201)) as typeof fetch;
  try {
    await expectRefusal(buildShopeeReader(workspaceId, runId, body, token), 'integrity');
  } finally { globalThis.fetch = original; }
});

test('Shopee Reader build refuses without an OWNER token and makes no request', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return json(receipt, 201); }) as typeof fetch;
  try {
    await expectRefusal(buildShopeeReader(workspaceId, runId, body, ''), 'authorization');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('Shopee Reader build refuses a request body that does not match the contract', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return json(receipt, 201); }) as typeof fetch;
  try {
    await expectRefusal(buildShopeeReader(workspaceId, runId, { ...body, sourceKind: 'TIKTOK' } as never, token), 'rejected');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});

test('Shopee finding template substitutes only its own code record token and flags unresolved tokens', async () => {
  const { renderFinding } = await import('../src/research-automation/ShopeeReportPanel');
  const finding = { sectionId: 'I02', code: 'C1', label: 'Chất lượng', template: 'Có {{shopee.codes.C1.records}} bình luận.', status: 'PROPOSED_AWAITING_REVIEW', scope: 'mẫu đã chọn', citations: [{ citationId: 1, locator: 'comment 1' }] } as never;
  assert.deepEqual(renderFinding(finding, 3), { text: 'Có 3 bình luận.', unresolved: false });
  const foreign = { ...finding, template: 'Có {{shopee.codes.C2.records}} bình luận.' } as never;
  assert.deepEqual(renderFinding(foreign, 3), { text: 'Có {{shopee.codes.C2.records}} bình luận.', unresolved: true });
});
