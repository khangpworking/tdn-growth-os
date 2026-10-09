import assert from 'node:assert/strict';
import test from 'node:test';
import { personaServiceFixture, personaPendingPipeline, PERSONA_WORKSPACE, PERSONA_RUN } from '../../tests/helpers/insight-persona-service-fixture';
import { personaDigest } from '../../src/modules/analysis/research-automation/insight-persona-contracts';
import { loadPersonas, loadPersonaEvidence, proposePersona, createPersonaReport } from '../src/research-automation/persona-api';
import { ResearchAutomationError } from '../src/research-automation/api';
import { randomUUID } from 'node:crypto';

test('persona client binds authentic retained source/history/exact requests and evidence digests; no implicit selection or retry', async t => {
  const f = await personaServiceFixture(t), pipeline = await personaPendingPipeline(f);
  const view = await f.service.listPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, f.pair.pairId), original = globalThis.fetch;
  const controller = new AbortController(); let calls = 0, lost = false, payload: unknown = view, status = 200;
  globalThis.fetch = (async (_url, init) => {
    calls++; assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error'); assert.equal(init?.cache, 'no-store');
    if (init?.method === 'POST') assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-only');
    else assert.equal(new Headers(init?.headers).get('authorization'), null);
    if (lost) throw new Error('Synthetic lost response'); return new Response(JSON.stringify(payload), { status });
  }) as typeof fetch;
  const read = () => loadPersonas(PERSONA_WORKSPACE, PERSONA_RUN, f.pair.pairId, controller.signal);
  try {
    assert.deepEqual(await read(), view);
    for (const invalid of [
      { ...view, binding: { ...view.binding, pairId: 'f'.repeat(64) } },
      { ...view, evidence: [...view.evidence, view.evidence[0]] },
      { ...view, source: { ...view.source, records: [] } },
      { ...view, evidence: [{ ...view.evidence[1], sha256: 'f'.repeat(64) }] },
      { ...view, source: { ...view.source, authorIdentity: 'SYNTHETIC_PRIVATE_VALUE' } },
    ]) { payload = invalid; await assert.rejects(read(), error => error instanceof ResearchAutomationError && error.kind === 'integrity'); }
    payload = pipeline.result.proposal;
    assert.deepEqual(await loadPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, pipeline.result.proposal.evidence.evidenceId, view.binding, controller.signal), payload);
    payload = pipeline.result; status = 201;
    assert.deepEqual(await proposePersona(PERSONA_WORKSPACE, PERSONA_RUN, pipeline.requests[2]!, 'synthetic-only', controller.signal), payload);
    const crossed = structuredClone(pipeline.result);
    if (crossed.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Expected proposal');
    crossed.proposal.evidence.request.requestKey = randomUUID(); crossed.proposal.sha256 = personaDigest(crossed.proposal.evidence); payload = crossed;
    await assert.rejects(proposePersona(PERSONA_WORKSPACE, PERSONA_RUN, pipeline.requests[2]!, 'synthetic-only', controller.signal));
    lost = true; const before = calls;
    await assert.rejects(proposePersona(PERSONA_WORKSPACE, PERSONA_RUN, pipeline.requests[2]!, 'synthetic-only', controller.signal));
    assert.equal(calls, before + 1, 'ambiguous transport does not retry');
    const invalidBefore = calls;
    await assert.rejects(proposePersona(PERSONA_WORKSPACE, PERSONA_RUN, { ...pipeline.requests[0]!, authorHash: 'f'.repeat(64) } as never, 'synthetic-only', controller.signal));
    await assert.rejects(proposePersona(PERSONA_WORKSPACE, PERSONA_RUN, pipeline.requests[0]!, '', controller.signal));
    assert.equal(calls, invalidBefore);
  } finally { globalThis.fetch = original; }
});

test('explicit persona report action uses a separate versioned final selection, guarded original binding and retained attempt status', async t => {
  const f = await personaServiceFixture(t), pipeline = await personaPendingPipeline(f), original = globalThis.fetch;
  const body = { contractVersion: 'automation-insight-persona-report-revision-v1' as const, requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' as const }, nativeReview: { decision: 'KEEP' as const } }, personaInsight: {
      contractVersion: 'insight-persona-report-select-v1' as const, proposalId: pipeline.result.proposal.evidence.evidenceId,
      proposalSha256: pipeline.result.proposal.sha256, binding: f.context.binding } };
  let status = 202, receipt = { attemptId: randomUUID(), attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, calls = 0;
  globalThis.fetch = (async (url, init) => {
    calls++; assert.ok(String(url).endsWith('/report-revisions')); assert.deepEqual(JSON.parse(String(init?.body)), body);
    return new Response(JSON.stringify(receipt), { status });
  }) as typeof fetch;
  try {
    assert.deepEqual(await createPersonaReport(PERSONA_WORKSPACE, PERSONA_RUN, body, 'synthetic-only', new AbortController().signal), receipt);
    status = 200; receipt = { ...receipt, exactRetry: true };
    assert.deepEqual(await createPersonaReport(PERSONA_WORKSPACE, PERSONA_RUN, body, 'synthetic-only', new AbortController().signal), receipt);
    receipt = { ...receipt, state: 'COMMITTED' };
    await assert.rejects(createPersonaReport(PERSONA_WORKSPACE, PERSONA_RUN, body, 'synthetic-only', new AbortController().signal));
    const before = calls;
    await assert.rejects(createPersonaReport(PERSONA_WORKSPACE, PERSONA_RUN, { ...body, personaInsight: { ...body.personaInsight, binding: { ...body.personaInsight.binding, runId: randomUUID() } } }, 'synthetic-only', new AbortController().signal));
    assert.equal(calls, before);
  } finally { globalThis.fetch = original; }
});
