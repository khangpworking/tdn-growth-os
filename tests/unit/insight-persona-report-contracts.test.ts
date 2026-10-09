import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { personaServiceFixture, personaPendingPipeline } from '../helpers/insight-persona-service-fixture.js';
import { personaReportRequestValid, personaSelectedReportValid, checkPersonaSelectedReport, personaDigest } from '../../src/modules/analysis/research-automation/insight-persona-contracts.js';
import * as browser from '../../frontend/src/generated/report-validators.generated.js';
import type { AutomationInsightPersonaReportRevisionRequest, PersonaSelectedReportSnapshot } from '../../contracts/analysis/automation-insight-persona-report.generated.js';
import apiSchema from '../../contracts/api/research-automation-insight-persona-api.schema.json' with { type: 'json' };

test('new selected-report namespace binds exact owning source and pending final proposal with no receipt/adoption/approval; historical request namespace remains closed', async t => {
  const f = await personaServiceFixture(t), pipeline = await personaPendingPipeline(f);
  if (pipeline.result.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Exact retained proposal required');
  const selected: PersonaSelectedReportSnapshot = { contractVersion: 'automation-insight-persona-report-snapshot-v1',
    selection: { contractVersion: 'insight-persona-report-select-v1', proposalId: pipeline.result.proposal.evidence.evidenceId,
      proposalSha256: pipeline.result.proposal.sha256, binding: f.context.binding }, executionId: pipeline.result.executionId,
    source: f.context.source, snapshot: pipeline.result.proposal.evidence.snapshot };
  const request: AutomationInsightPersonaReportRevisionRequest = { contractVersion: 'automation-insight-persona-report-revision-v1', requestKey: randomUUID(),
    previousPairId: f.pair.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, personaInsight: selected.selection };
  assert.equal(personaReportRequestValid(request), true); assert.equal(browser.insightPersonaReportRevision(request), true);
  assert.equal(personaSelectedReportValid(selected), true); assert.equal(browser.insightPersonaSelectedReport(selected), true);
  assert.deepEqual(checkPersonaSelectedReport(selected), selected);
  assert.equal(browser.insightReportRevision(request), false);
  assert.equal(browser.researchAutomationRevision(request), false);
  assert.equal(browser.insightPersonaRequest(request), false);
  for (const invalid of [
    { ...request, contractVersion: 'automation-insight-default-report-revision-v1' },
    { ...request, acceptedInsight: { proposalId: selected.selection.proposalId, receiptIds: [randomUUID()] } },
    { ...request, personaInsight: { ...selected.selection, receiptIds: [] } },
    { ...request, personaInsight: { ...selected.selection, approved: true } },
    { ...request, personaInsight: { ...selected.selection, binding: { ...selected.selection.binding, authorHash: 'f'.repeat(64) } } },
    { ...request, sources: { ...request.sources, nativeReview: { decision: 'SKIP' } } },
    { ...request, sources: { ...request.sources, metric: { decision: 'USE_PREPARED', packageId: randomUUID() } } },
    { ...request, personaInsight: { ...selected.selection, proposalSha256: null } },
    { ...request, personaInsight: { ...selected.selection, proposalId: 'latest' } },
  ]) { assert.equal(personaReportRequestValid(invalid), false); assert.equal(browser.insightPersonaReportRevision(invalid), false); }
  for (const extra of ['authorId', 'authorIdentity', 'authorHash', 'keyId', 'profile', 'privacy', 'ownerApproval', 'kappa']) {
    const invalid = { ...selected, [extra]: 'SYNTHETIC_PRIVATE_VALUE' };
    assert.equal(personaSelectedReportValid(invalid), false); assert.equal(browser.insightPersonaSelectedReport(invalid), false);
  }
  const before = f.db.prepare('SELECT total_changes() n').get();
  const crossed = structuredClone(selected); crossed.snapshot.binding = { ...crossed.snapshot.binding, pairId: 'f'.repeat(64) };
  assert.equal(personaSelectedReportValid(crossed), true); // Structure never establishes owning lineage.
  assert.throws(() => checkPersonaSelectedReport(crossed));
  const corruptSource = structuredClone(selected); corruptSource.source.records[0]!.locator.pageSha256 = 'f'.repeat(64);
  assert.throws(() => checkPersonaSelectedReport(corruptSource));
  const incomplete = structuredClone(selected); incomplete.snapshot.classificationComplete = false;
  assert.throws(() => checkPersonaSelectedReport(incomplete));
  const codebook = structuredClone(selected); codebook.snapshot.codebookSha256 = 'f'.repeat(64);
  assert.throws(() => checkPersonaSelectedReport(codebook));
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(pipeline.modelCalls(), 3);
});

test('old four persona API definitions remain exact across additive selected-report aliases', () => {
  assert.equal(personaDigest(Object.fromEntries(['request', 'entry', 'view', 'response'].map(key => [key, apiSchema.$defs[key as keyof typeof apiSchema.$defs]]))),
    'ac8964f4b1507874f88f444e2ac6fcb427b0abaff76a4bd38e2630f226fb8f06');
  assert.deepEqual(Object.keys(apiSchema.$defs), ['request', 'entry', 'view', 'response', 'personaReportRequest', 'personaSelectedReport']);
});
