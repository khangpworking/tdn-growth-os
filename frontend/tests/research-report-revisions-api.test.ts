import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutomationReportRevisionRequest } from '../../contracts/api/research-automation-revision-api.generated';
import type { AutomationClassifiedReportRevisionRequest } from '../../contracts/analysis/automation-classified-report-revision.generated';
import type { AutomationInsightReportRevisionRequest } from '../../contracts/analysis/automation-insight-report-revision.generated';
import type { AutomationBoundedReportRevisionRequest } from '../../contracts/analysis/automation-bounded-report-revision.generated';
import type { AutomationQuoteReportRevisionRequest } from '../../contracts/analysis/automation-quote-report-revision.generated';
import {
  cancelReportAttempt,
  createReportRevision,
  loadReportAttempts,
  loadReportAttempt,
  loadReportVersions,
  exactReportUrl,
} from '../src/research-automation/report-revisions-api';
import { ResearchAutomationError } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const requestKey = '44444444-4444-4444-8444-444444444444';
const pairOne = 'a'.repeat(64);
const pairTwo = 'b'.repeat(64);
const versionOne = 'c'.repeat(64);
const versionTwo = 'd'.repeat(64);
const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });

function pair(pairId: string, versionNumber: number, pairAttemptId: string | null, outputKinds: readonly ('MARKET' | 'INSIGHT')[] = ['MARKET', 'INSIGHT']) {
  return { pairId, versionNumber, attemptId: pairAttemptId, outputs: outputKinds.map((kind, index) => ({ kind, versionId: index === 0 ? versionOne : versionTwo, pdfAvailable: false })) };
}

function revisionRequest(): AutomationReportRevisionRequest {
  return { contractVersion: 'automation-report-revision-v1', requestKey, previousPairId: pairOne,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
}

test('report revision reads use exact routes and reject identity, pair, output, and sequence contradictions', async () => {
  const originalFetch = globalThis.fetch;
  const list = { contractVersion: 'automation-report-version-list-v1', workspaceId, runId, versions: [pair(pairOne, 1, null), pair(pairTwo, 2, attemptId)] };
  let response: Response = json(list);
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions`);
    assert.equal(init?.body, undefined);
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    return response;
  }) as typeof fetch;
  const readList = () => loadReportVersions(workspaceId, runId, new AbortController().signal);
  try {
    assert.deepEqual(await readList(), list);
    for (const invalid of [
      { ...list, runId: '55555555-5555-4555-8555-555555555555' },
      { ...list, versions: [pair(pairOne, 1, null), pair(pairOne, 2, attemptId)] },
      { ...list, versions: [pair(pairOne, 2, null), pair(pairTwo, 3, attemptId)] },
      { ...list, versions: [pair(pairOne, 1, null, ['MARKET', 'MARKET'])] },
      { ...list, versions: [pair(pairOne, 1, null), pair(pairTwo, 2, null)] },
      { ...list, versions: [pair(pairOne, 1, null), pair(pairTwo, 2, attemptId, ['INSIGHT'])] },
    ]) {
      response = json(invalid);
      await assert.rejects(readList(), error => error instanceof ResearchAutomationError && error.kind === 'integrity');
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('exact attempt reads verify the route identity and closed receipt state', async () => {
  const originalFetch = globalThis.fetch;
  const receipt = { attemptId, attemptNumber: 2, state: 'QUEUED', pairId: null, exactRetry: false } as const;
  let response: Response = json(receipt);
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-attempts/${attemptId}`);
    assert.equal(init?.body, undefined);
    return response;
  }) as typeof fetch;
  const read = () => loadReportAttempt(workspaceId, runId, attemptId, new AbortController().signal);
  try {
    assert.deepEqual(await read(), receipt);
    response = json({ ...receipt, attemptId: '55555555-5555-4555-8555-555555555555' });
    await assert.rejects(read(), error => error instanceof ResearchAutomationError && error.kind === 'integrity');
    response = json({ ...receipt, state: 'COMMITTED' });
    await assert.rejects(read(), error => error instanceof ResearchAutomationError && error.kind === 'integrity');
  } finally { globalThis.fetch = originalFetch; }
});

test('attempt inventory reloads exact retained receipts without inventing a latest attempt', async () => {
  const originalFetch = globalThis.fetch;
  const receipt = { attemptId, attemptNumber: 1, state: 'RUNNING', pairId: null, exactRetry: false } as const;
  const list = { contractVersion: 'automation-report-attempt-list-v1', workspaceId, runId, attempts: [receipt] };
  let response: Response = json(list);
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-attempts`);
    assert.equal(init?.body, undefined);
    return response;
  }) as typeof fetch;
  const read = () => loadReportAttempts(workspaceId, runId, new AbortController().signal);
  try {
    assert.deepEqual(await read(), list);
    response = json({ ...list, attempts: [{ ...receipt, exactRetry: true }] });
    await assert.rejects(read(), error => error instanceof ResearchAutomationError && error.kind === 'integrity');
    response = json({ ...list, attempts: [receipt, { ...receipt, attemptId: '55555555-5555-4555-8555-555555555555', attemptNumber: 4, state: 'FAILED' }] });
    await assert.rejects(read(), error => error instanceof ResearchAutomationError && error.kind === 'integrity');
  } finally { globalThis.fetch = originalFetch; }
});

test('revision writes send one exact owner snapshot and cancel one exact attempt request', async () => {
  const originalFetch = globalThis.fetch;
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/report-revisions')) return json({ attemptId, attemptNumber: 2, state: 'QUEUED', pairId: null, exactRetry: false }, 202);
    return json({ attemptId, attemptNumber: 2, state: 'CANCELLED', pairId: null, exactRetry: false }, 200);
  }) as typeof fetch;
  try {
    const body = revisionRequest();
    assert.deepEqual(await createReportRevision(workspaceId, runId, body, 'owner-token'), { attemptId, attemptNumber: 2, state: 'QUEUED', pairId: null, exactRetry: false });
    const classified: AutomationClassifiedReportRevisionRequest = { contractVersion: 'automation-classified-report-revision-v1',
      requestKey, previousPairId: pairOne, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      acceptedMetric: { adoptionId: attemptId, receiptIds: [runId] } };
    await createReportRevision(workspaceId, runId, classified, 'owner-token');
    assert.deepEqual(JSON.parse(String(calls[1]!.init?.body)), classified);
    await assert.rejects(createReportRevision(workspaceId, runId, { ...classified,
      sources: { ...classified.sources, nativeReview: { decision: 'SKIP' } } } as unknown as AutomationClassifiedReportRevisionRequest, 'owner-token'),
    error => error instanceof ResearchAutomationError && error.kind === 'rejected');
    const cancelBody = { contractVersion: 'automation-report-revision-cancel-v1' as const, requestKey };
    assert.deepEqual(await cancelReportAttempt(workspaceId, runId, attemptId, cancelBody, 'owner-token'), { attemptId, attemptNumber: 2, state: 'CANCELLED', pairId: null, exactRetry: false });
    assert.equal(calls.length, 3);
    assert.equal(calls[0]!.url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-revisions`);
    assert.equal(calls[2]!.url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-attempts/${attemptId}/cancel`);
    assert.equal(new Headers(calls[0]!.init?.headers).get('Authorization'), 'Bearer owner-token');
    assert.deepEqual(JSON.parse(String(calls[0]!.init?.body)), body);
    assert.deepEqual(JSON.parse(String(calls[2]!.init?.body)), cancelBody);
    assert.equal(calls[0]!.init?.credentials, 'omit');
    assert.equal(calls[0]!.init?.redirect, 'error');
    const insight: AutomationInsightReportRevisionRequest = { contractVersion: 'automation-insight-report-revision-v1',
      requestKey, previousPairId: pairOne, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      acceptedInsight: { proposalId: attemptId, receiptIds: [runId] } };
    await createReportRevision(workspaceId, runId, insight, 'owner-token');
    assert.deepEqual(JSON.parse(String(calls[3]!.init?.body)), insight);
    await assert.rejects(createReportRevision(workspaceId, runId, { ...insight,
      sources: { ...insight.sources, nativeReview: { decision: 'SKIP' } } } as unknown as AutomationInsightReportRevisionRequest, 'owner-token'),
    error => error instanceof ResearchAutomationError && error.kind === 'rejected');
    assert.equal(calls.length, 4, 'invalid Insight source replacement is rejected before sending');
  } finally { globalThis.fetch = originalFetch; }
});

test('quote and bounded revisions preserve exact package choices and reject malformed or mixed requests before sending', async () => {
  const originalFetch = globalThis.fetch;
  const sent: unknown[] = [];
  let unavailable = false;
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-revisions`);
    assert.equal(new Headers(init?.headers).get('Authorization'), 'Bearer owner-token');
    sent.push(JSON.parse(String(init?.body)));
    if (unavailable) throw new TypeError('connection lost');
    return json({ attemptId, attemptNumber: 2, state: 'QUEUED', pairId: null, exactRetry: false }, 202);
  }) as typeof fetch;
  const selection = { decision: 'USE_PACKAGE' as const, packageId: attemptId,
    manifestArtifactSha256: versionOne, packageContentSha256: versionTwo, descriptorPath: 'method/descriptor.json' };
  const quote: AutomationQuoteReportRevisionRequest = { ...revisionRequest(),
    contractVersion: 'automation-quote-report-revision-v1', quoteMethods: selection };
  const bounded: AutomationBoundedReportRevisionRequest = { ...revisionRequest(),
    contractVersion: 'automation-bounded-report-revision-v1', boundedMethods: selection };
  try {
    for (const body of [quote, { ...quote, quoteMethods: { decision: 'SKIP' as const } },
      bounded, { ...bounded, boundedMethods: { decision: 'SKIP' as const } }]) {
      await createReportRevision(workspaceId, runId, body, 'owner-token');
      assert.deepEqual(sent.at(-1), body);
    }
    for (const [body, field] of [[quote, 'quoteMethods'], [bounded, 'boundedMethods']] as const) {
      for (const invalid of [
        { ...body, sources: { ...body.sources, metric: { decision: 'SKIP' } } },
        { ...body, sources: { ...body.sources, nativeReview: { decision: 'SKIP' } } },
        { ...body, previousPairId: 'latest' },
        { ...body, [field]: { ...selection, manifestArtifactSha256: 'broken' } },
        { ...body, [field]: { ...selection, packageContentSha256: 'broken' } },
        { ...body, [field]: { ...selection, packageId: 'latest' } },
        { ...body, [field]: { ...selection, descriptorPath: '../private.json' } },
        { ...body, [field]: { decision: 'SKIP', packageId: attemptId } },
        { ...body, [field === 'quoteMethods' ? 'boundedMethods' : 'quoteMethods']: selection },
      ]) {
        await assert.rejects(createReportRevision(workspaceId, runId,
          invalid as Parameters<typeof createReportRevision>[2], 'owner-token'),
        error => error instanceof ResearchAutomationError && error.kind === 'rejected');
      }
    }
    assert.equal(sent.length, 4, 'invalid input never reaches the write endpoint');
    unavailable = true;
    await assert.rejects(createReportRevision(workspaceId, runId, quote, 'owner-token'),
      error => error instanceof ResearchAutomationError && error.kind === 'connection');
    assert.equal(sent.length, 5, 'ambiguous transport failure is not retried automatically');
    unavailable = false;
    await createReportRevision(workspaceId, runId, quote, 'owner-token');
    assert.deepEqual(sent[5], sent[4], 'explicit retry retains the same source selection and request identity');
  } finally { globalThis.fetch = originalFetch; }
});

test('report pair URLs require an exact pair digest and never address an implicit latest version', () => {
  assert.equal(exactReportUrl(workspaceId, runId, pairTwo, 'market', 'web'), `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairTwo}/reports/market`);
  assert.equal(exactReportUrl(workspaceId, runId, pairTwo, 'insight', 'pdf'), `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairTwo}/reports/insight/pdf`);
  assert.throws(() => exactReportUrl(workspaceId, runId, 'not-a-digest', 'market', 'web'), TypeError);
});
