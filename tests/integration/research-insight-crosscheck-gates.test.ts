import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { crosscheckFlowFixture, crosscheckWorkspaceId as workspaceId, crosscheckRunId as runId, crosscheckOwner as owner, blankCrosscheckAnnotations } from '../helpers/crosscheck-flow-fixture.js';
import { insightCodingDigest } from '../../src/modules/analysis/research-automation/insight-default-coding.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';

test('actual retained second execution rejects multi-code conflict and cancellation, preserving exact terminal replay without calls/writes', async t => {
  const f = await crosscheckFlowFixture(t, 1, true);
  const first = f.latest.evidence.request;
  if (first.contractVersion !== 'insight-coding-default-propose-v1') throw new Error('Wrong fixture');
  const configuration = { ...f.configuration, providerId: 'synthetic-independent', modelId: 'second-fixture' };
  const request = () => ({ contractVersion: 'insight-crosscheck-request-v1', requestKey: randomUUID(), binding: f.context.binding,
    firstProposalId: f.latest.evidence.evidenceId, firstProposalSha256: f.latest.sha256, codebookSha256: first.codebookSha256,
    seed: 'a'.repeat(64), secondConfigurationSha256: insightCodingDigest(configuration) });
  const input = f.context.input.records[0]!.text!;
  let calls = 0;
  const conflictRequest = request();
  const ai = { configuration, port: { async generateText() {
    calls++; const annotations = blankCrosscheckAnnotations();
    annotations.corpora = [{ corpusIndex: 0, assignments: ['C1','C2'].map((code, at) => ({ recordIndex: 0, code, span: locatedSpan(input, at ? 'thích' : 'kích thước'),
      provenance: { basis: 'PENDING_AI' as const, coderRole: 'second-fixture', adjudication: null, disagreement: 'Synthetic uncertainty retained' } })), dispositions: [] }];
    return { text: JSON.stringify(annotations) };
  } } };
  const beforeCancel = f.db.prepare('SELECT total_changes() n').get();
  const early = new AbortController(); early.abort();
  await assert.rejects(f.service.prepareInsightCrosscheck(workspaceId, runId, request(), owner, ai, early.signal));
  assert.equal(calls, 0); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeCancel);
  const invalid = await f.service.prepareInsightCrosscheck(workspaceId, runId, conflictRequest, owner, ai);
  assert.equal(invalid.status, 'INVALID', JSON.stringify(invalid));
  if (invalid.status !== 'INVALID') throw new Error(JSON.stringify(invalid));
  assert.equal(invalid.code, 'INVALID_INSIGHT_CODING_RESPONSE'); assert.equal(invalid.rawCompletion, 'NOT_RETAINED');
  const row = f.db.prepare('SELECT state,validation_status,candidates_sha256 FROM analysis_research_automation_ai_executions WHERE execution_id=?').get(invalid.executionId);
  assert.deepEqual(row, { state: 'COMPLETED', validation_status: 'INVALID', candidates_sha256: null });
  const beforeInvalidReplay = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.prepareInsightCrosscheck(workspaceId, runId, conflictRequest, owner, null), invalid);
  assert.deepEqual(await f.service.readInsightCrosscheck(workspaceId, runId, conflictRequest.requestKey), invalid);
  assert.equal(calls, 1); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeInvalidReplay);
  const canceled = new AbortController(), unknownRequest = request();
  const unknown = await f.service.prepareInsightCrosscheck(workspaceId, runId, unknownRequest, owner, { configuration, port: { async generateText() {
    calls++; canceled.abort(); throw new Error('Synthetic cancellation after dispatch');
  } } }, canceled.signal);
  assert.equal(unknown.status, 'DISPATCH_UNKNOWN');
  const beforeUnknownReplay = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.prepareInsightCrosscheck(workspaceId, runId, unknownRequest, owner, null), unknown);
  assert.deepEqual(await f.service.readInsightCrosscheck(workspaceId, runId, unknownRequest.requestKey), unknown);
  assert.equal(calls, 2); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeUnknownReplay);
  assert.equal((await f.service.readInsightCoding(workspaceId, runId, f.pair.pairId)).evidence.filter(row => row.kind === 'PROPOSAL').length, 1);
  assert.deepEqual((await f.service.readInsightSourceContext(workspaceId, runId, f.pair.pairId)).input.records, f.context.input.records);
});

test('actual two-batch interruption freezes the whole sample and resumes only the prepared second batch with the retained configuration', async t => {
  const f = await crosscheckFlowFixture(t, 101);
  const first = f.latest.evidence.request;
  if (first.contractVersion !== 'insight-coding-default-propose-v1') throw new Error('Wrong fixture');
  const configuration = { ...f.configuration, providerId: 'synthetic-independent', modelId: 'second-fixture' };
  const request = { contractVersion: 'insight-crosscheck-request-v1', requestKey: randomUUID(), binding: f.context.binding,
    firstProposalId: f.latest.evidence.evidenceId, firstProposalSha256: f.latest.sha256, codebookSha256: first.codebookSha256,
    seed: 'a'.repeat(64), secondConfigurationSha256: insightCodingDigest(configuration) };
  const captures: number[][] = [];
  const ai = { configuration, port: { async generateText(value: { userText: string }) {
    captures.push(JSON.parse(value.userText).records.map((row: { recordIndex: number }) => row.recordIndex));
    return { text: JSON.stringify(blankCrosscheckAnnotations()) };
  } } };
  const canceled = new AbortController(), put = f.artifacts.put.bind(f.artifacts);
  f.artifacts.put = async bytes => {
    const stored = await put(bytes);
    const value = JSON.parse(Buffer.from(bytes).toString('utf8'));
    if (value.contractVersion === 'insight-crosscheck-source-v1' && value.batchIndex === 1) canceled.abort();
    return stored;
  };
  try { await assert.rejects(f.service.prepareInsightCrosscheck(workspaceId, runId, request, owner, ai, canceled.signal)); }
  finally { f.artifacts.put = put; }
  assert.deepEqual(captures, [Array.from({ length: 100 }, (_, index) => index)]);
  const frozen = f.db.prepare('SELECT state, admission_sha256 FROM analysis_research_automation_ai_executions WHERE coding_previous_proposal_id=? ORDER BY state').all(f.latest.evidence.evidenceId) as { state: string; admission_sha256: string }[];
  assert.deepEqual(frozen.map(row => row.state), ['COMPLETED', 'PREPARED']);
  const retained = JSON.parse((await f.artifacts.read(frozen[1]!.admission_sha256)).toString());
  assert.equal(retained.plan.sample.length, 101); assert.equal(retained.plan.seed, request.seed);
  assert.deepEqual(retained.plan.batches, [captures[0], [100]]);
  const before = f.db.prepare('SELECT total_changes() n').get();
  assert.equal((await f.service.readInsightCrosscheck(workspaceId, runId, request.requestKey)).status, 'INCOMPLETE');
  await assert.rejects(f.service.prepareInsightCrosscheck(workspaceId, runId, request, owner, null));
  await assert.rejects(f.service.prepareInsightCrosscheck(workspaceId, runId, request, owner, { ...ai, configuration: { ...configuration, modelId: 'changed-current' } }));
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(captures.length, 1);
  const resumed = await f.service.prepareInsightCrosscheck(workspaceId, runId, request, owner, ai);
  assert.equal(resumed.status, 'VALID');
  if (resumed.status !== 'VALID') throw new Error(JSON.stringify(resumed));
  assert.equal(resumed.exactRetry, true); assert.deepEqual(captures, [retained.plan.batches[0], [100]]);
  assert.deepEqual(resumed.snapshot.plan, retained.plan);
  const after = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.prepareInsightCrosscheck(workspaceId, runId, request, owner, null), resumed);
  assert.deepEqual(await f.service.readInsightCrosscheck(workspaceId, runId, request.requestKey), resumed);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), after); assert.equal(captures.length, 2);
});
