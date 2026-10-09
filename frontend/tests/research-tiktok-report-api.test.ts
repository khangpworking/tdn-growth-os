import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTikTokReader, digestTikTokDraft, loadTikTokCodingView } from '../src/research-automation/tiktok-report-api';
import type { TikTokDraftCoding } from '../../contracts/analysis/tiktok-coding-proposal-v1.generated';
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

test('TikTok coding read view accepts a valid view for a distinct coding package and rejects digest or count drift', async () => {
  const codingPackageId = '44444444-4444-4444-8444-444444444444';
  const corpusPackageId = '66666666-6666-4666-8666-666666666666';
  const proposalId = '77777777-7777-4777-8777-777777777777';
  const sha = 'c'.repeat(64);
  const binding = { workspaceId, runId, scopeSha256: sha, sourceSetSha256: sha, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } };
  const corpus = { packageId: corpusPackageId, manifestArtifactSha256: sha, packageContentSha256: sha };
  const counts = { recordsCoded: 1, codesProposed: 1, quotesCited: 1 };
  const citation = { citationId: 1, locator: 'comment 1', url: null };
  const draft = {
    contractVersion: 'tiktok-draft-coding-v1', proposalId, requestKey, binding, corpus, keywordDigest: sha, promptVersion: 'tiktok-coding-prompt-v1',
    codes: [{ code: 'C1', label: 'Synthetic code', recordIndex: 0, quote: { text: 'synthetic quote', start: 0, end: 15 }, citationId: 1 }],
    counts, status: 'PROPOSED_AWAITING_REVIEW', limitations: ['synthetic limitation'],
  };
  const draftSha256 = await digestTikTokDraft(draft as TikTokDraftCoding);
  const report = {
    contractVersion: 'tiktok-coded-report-v1', proposalId, draftSha256, corpus, keywordDigest: sha,
    findings: [{ sectionId: 'I02', code: 'C1', label: 'Synthetic code', template: 'synthetic', status: 'PROPOSED_AWAITING_REVIEW', scope: 'synthetic', citations: [{ citationId: 1, locator: 'comment 1', url: null }] }],
    counts, status: 'PROPOSED_AWAITING_REVIEW', limitations: ['synthetic limitation'],
  };
  const view = { contractVersion: 'tiktok-coding-read-v1', draft, report, citations: [citation], finalizedAt: '2026-10-09T00:00:00Z' };
  const fetchView = (value: unknown) => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () => json(value, 200)) as typeof fetch;
    return () => { globalThis.fetch = original; };
  };
  const restore = fetchView(view);
  try {
    const loaded = await loadTikTokCodingView(workspaceId, runId, codingPackageId, new AbortController().signal);
    assert.equal(loaded.draft.corpus.packageId, corpusPackageId);
  } finally { restore(); }
  const drifted = [
    { ...view, report: { ...report, draftSha256: 'e'.repeat(64) } },
    { ...view, report: { ...report, counts: { ...counts, quotesCited: 2 } } },
  ];
  for (const value of drifted) {
    const undo = fetchView(value);
    try {
      await assert.rejects(loadTikTokCodingView(workspaceId, runId, codingPackageId, new AbortController().signal), (failure: unknown) =>
        failure instanceof ResearchAutomationError && failure.kind === 'integrity');
    } finally { undo(); }
  }
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
