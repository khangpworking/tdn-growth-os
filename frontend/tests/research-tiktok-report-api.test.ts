import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTikTokReader } from '../src/research-automation/tiktok-report-api';
import { ResearchAutomationError } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token';
const requestKey = '55555555-5555-4555-8555-555555555555';
const draftPairId = 'a'.repeat(64);
const semanticSha256 = 'b'.repeat(64);
const json = (value: unknown, status = 201) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const body = { contractVersion: 'insight-reader-build-tiktok-v1', reportKind: 'INSIGHT', requestKey, draftPairId, semanticSha256, sourceKind: 'TIKTOK' } as const;
const revision = {
  reportKind: 'INSIGHT', builderVersion: 'reader-report-insight-tiktok-v1', workspaceId, runId,
  revisionId: '33333333-3333-4333-8333-333333333333', revisionNumber: 1, state: 'PENDING_OWNER_REVIEW',
  draftPairId, semanticSha256, sourceReportSha256: semanticSha256, htmlSha256: 'd'.repeat(64),
  createdAt: '2026-10-08T00:00:00Z', decision: null,
};
const receipt = { contractVersion: 'reader-report-build-receipt-v2', exactRetry: false, revision };

test('TikTok Reader build accepts only the exact retained draft and report identity', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls += 1;
    assert.match(String(url), /\/owner-api\/workspaces\/.+\/research-automation\/runs\/.+\/reader-reports\/tiktok$/);
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${token}`);
    assert.deepEqual(JSON.parse(String(init?.body)), body);
    return json(receipt, 201);
  }) as typeof fetch;
  try {
    const result = await buildTikTokReader(workspaceId, runId, body, token);
    assert.equal(result.revision.builderVersion, 'reader-report-insight-tiktok-v1');
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});

test('TikTok Reader build rejects a receipt whose report digest differs from the selected report', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => json({ ...receipt, revision: { ...revision, sourceReportSha256: 'e'.repeat(64) } }, 201)) as typeof fetch;
  try {
    await assert.rejects(buildTikTokReader(workspaceId, runId, body, token), (failure: unknown) =>
      failure instanceof ResearchAutomationError && failure.kind === 'integrity');
  } finally { globalThis.fetch = original; }
});

test('TikTok Reader build without owner token sends no request', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls += 1; return json(receipt, 201); }) as typeof fetch;
  try {
    await assert.rejects(buildTikTokReader(workspaceId, runId, body, ''), (failure: unknown) =>
      failure instanceof ResearchAutomationError && failure.kind === 'authorization');
    assert.equal(calls, 0);
  } finally { globalThis.fetch = original; }
});
