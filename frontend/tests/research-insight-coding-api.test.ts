import assert from 'node:assert/strict';
import test from 'node:test';
import { locatedInsightFixture } from '../../tests/helpers/located-insight-fixture';
import { ResearchAutomationError } from '../src/research-automation/api';
import { loadInsightCoding, adoptInsightCoding, proposeInsightCoding, acceptInsightCoding, proposeInsightCodingModel } from '../src/research-automation/insight-coding-api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const requestKey = '44444444-4444-4444-8444-444444444444';
const pairId = 'a'.repeat(64);
const binding = { workspaceId, runId, pairId, scopeSha256: 'b'.repeat(64), reportSha256: 'c'.repeat(64),
  sourceKind: 'NATIVE' as const, sourcePackageSha256: 'd'.repeat(64), inputSha256: 'e'.repeat(64) };
const adoption = { contractVersion: 'insight-coding-adopt-v1' as const, requestKey, binding,
  rules: { ruleId: 'synthetic', revision: 1, question: 'Which statements occur?', inclusionRule: 'All retained records', adjudicationRule: 'Keep unresolved pending', corpora: [] } };
const proposal = { contractVersion: 'insight-coding-propose-v1' as const, requestKey, adoptionId: evidenceId, previousProposalId: null,
  annotations: { i06: [], i09: [], i13Mentions: [], corpora: [] } };
const acceptance = { contractVersion: 'insight-coding-accept-v1' as const, requestKey, proposalId: evidenceId, proposalSha256: 'f'.repeat(64),
  selection: { contractVersion: 'automation-insight-selection-v1' as const, i06: [], i09: [], i13Mentions: [], corpora: [] } };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const integrity = (error: unknown) => error instanceof ResearchAutomationError && error.kind === 'integrity';

test('Insight model client distinguishes retained outcomes and never retries an ambiguous dispatch', async () => {
  const original = globalThis.fetch;
  const body = { contractVersion: 'insight-model-request-v1' as const, requestKey, adoptionId: evidenceId,
    previousProposalId: null, recordIndexes: [0, 2] };
  const proposed = { contractVersion: 'insight-model-response-v1', status: 'PROPOSED', executionId: runId,
    proposal: { contractVersion: 'insight-coding-mutation-v1', kind: 'PROPOSAL', evidenceId, exactRetry: false } };
  const pending = [
    { status: 'NOT_DISPATCHED', reason: 'AI_NOT_CONFIGURED' },
    { status: 'NOT_DISPATCHED', reason: 'INSUFFICIENT_EVIDENCE' },
    { status: 'PREPARED', executionId: runId },
    { status: 'INVALID', executionId: runId, code: 'INVALID_INSIGHT_CODING_RESPONSE' },
    { status: 'DISPATCH_UNKNOWN', executionId: runId, code: 'TRANSPORT_OUTCOME_AMBIGUOUS' },
  ].map(row => ({ contractVersion: 'insight-model-response-v1', ...row }));
  const controller = new AbortController();
  let payload: unknown = proposed;
  let status = 201;
  let calls = 0;
  let lost = false;
  globalThis.fetch = (async (url, init) => {
    calls++;
    assert.equal(url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/insight-coding-model-proposals`);
    assert.deepEqual(JSON.parse(String(init?.body)), body);
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-token');
    assert.equal(init?.signal, controller.signal);
    assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    if (lost) throw new Error('Lost response after submission');
    return json(payload, status);
  }) as typeof fetch;
  const send = (request = body) => proposeInsightCodingModel(workspaceId, runId, request, 'synthetic-token', controller.signal);
  try {
    assert.deepEqual(await send(), proposed);
    status = 200;
    payload = { ...proposed, proposal: { ...proposed.proposal, exactRetry: true } };
    assert.deepEqual(await send(), payload);
    for (const outcome of pending) {
      payload = outcome;
      const before = calls;
      assert.deepEqual(await send(), outcome);
      assert.equal(calls, before + 1);
      status = 201;
      await assert.rejects(send(), integrity);
      status = 200;
    }
    for (const invalid of [
      proposed,
      { ...proposed, proposal: { ...proposed.proposal, exactRetry: true, kind: 'RECEIPT' } },
      { ...pending[0], actorId: 'must-not-leak' },
      { ...pending[4], code: 'INVENTED' },
    ]) {
      payload = invalid;
      await assert.rejects(send(), integrity);
    }
    const beforeInvalid = calls;
    await assert.rejects(send({ ...body, recordIndexes: [0, 0] }), error => error instanceof ResearchAutomationError && error.kind === 'rejected');
    await assert.rejects(send({ ...body, recordIndexes: [] }), error => error instanceof ResearchAutomationError && error.kind === 'rejected');
    assert.equal(calls, beforeInvalid, 'invalid batches are not submitted');
    lost = true;
    const beforeLost = calls;
    await assert.rejects(send(), error => error instanceof ResearchAutomationError && error.kind === 'connection');
    assert.equal(calls, beforeLost + 1, 'ambiguous model call has no automatic retry');
    controller.abort();
    await assert.rejects(send(), /Lost response after submission/);
  } finally { globalThis.fetch = original; }
});

// Client transport owns wrong-response identity and accidental retry risks; the
// persisted HTTP journey owns authentication, source verification and writes.
test('Insight client rejects crossed pair bindings and duplicate evidence without dropping history', async () => {
  const original = globalThis.fetch;
  const item = { evidenceId, kind: 'ADOPTION', sequence: 1, binding, request: adoption,
    createdAt: '2026-10-04T00:00:00.000Z', sha256: 'f'.repeat(64) };
  const view = { contractVersion: 'insight-coding-view-v1', context: { binding, input: locatedInsightFixture() }, evidence: [item] };
  let payload: unknown = view;
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/insight-coding/${pairId}`);
    assert.equal(new Headers(init?.headers).get('authorization'), null);
    assert.equal(init?.body, undefined);
    return json(payload);
  }) as typeof fetch;
  const read = () => loadInsightCoding(workspaceId, runId, pairId, new AbortController().signal);
  try {
    assert.deepEqual(await read(), view);
    for (const invalid of [
      { ...view, context: { ...view.context, binding: { ...binding, pairId: '0'.repeat(64) } } },
      { ...view, evidence: [{ ...item, binding: { ...binding, inputSha256: '0'.repeat(64) } }] },
      { ...view, evidence: [item, item] },
      { ...view, evidence: [{ ...item, request: proposal }] },
      { ...view, actorId: 'must-not-leak' },
    ]) {
      payload = invalid;
      await assert.rejects(read(), integrity);
    }
    payload = { ...view, evidence: [] };
    assert.deepEqual((await read()).evidence, []);
  } finally { globalThis.fetch = original; }
});

test('Insight client sends explicit snapshots once and verifies mutation kind and retry status', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  const rows = [
    { action: 'insight-coding-adoptions', kind: 'ADOPTION', body: adoption, send: () => adoptInsightCoding(workspaceId, runId, adoption, 'synthetic-token') },
    { action: 'insight-coding-proposals', kind: 'PROPOSAL', body: proposal, send: () => proposeInsightCoding(workspaceId, runId, proposal, 'synthetic-token') },
    { action: 'insight-coding-receipts', kind: 'RECEIPT', body: acceptance, send: () => acceptInsightCoding(workspaceId, runId, acceptance, 'synthetic-token') },
  ];
  try {
    for (const row of rows) {
      let status = 201;
      let payload = { contractVersion: 'insight-coding-mutation-v1', evidenceId, kind: row.kind, exactRetry: false };
      let lost = false;
      globalThis.fetch = (async (url, init) => {
        calls++;
        assert.equal(url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/${row.action}`);
        assert.deepEqual(JSON.parse(String(init?.body)), row.body);
        assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer synthetic-token');
        assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
        if (lost) throw new Error('Synthetic lost response');
        return json(payload, status);
      }) as typeof fetch;
      assert.deepEqual(await row.send(), payload);
      status = 200; payload = { ...payload, exactRetry: true };
      assert.deepEqual(await row.send(), payload);
      payload = { ...payload, exactRetry: false };
      await assert.rejects(row.send(), integrity);
      payload = { ...payload, exactRetry: true, kind: row.kind === 'RECEIPT' ? 'PROPOSAL' : 'RECEIPT' };
      await assert.rejects(row.send(), integrity);
      lost = true;
      const before = calls;
      await assert.rejects(row.send(), error => error instanceof ResearchAutomationError && error.kind === 'connection');
      assert.equal(calls, before + 1, 'ambiguous submission is not retried automatically');
    }
  } finally { globalThis.fetch = original; }
});
