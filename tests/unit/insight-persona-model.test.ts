import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { personaSourceFixture, personaRows } from '../helpers/insight-persona-fixture.js';
import { personaFixtureResponse, personaQuote, personaIndexes } from '../helpers/insight-persona-service-fixture.js';
import { personaDigest, checkPersonaSource } from '../../src/modules/analysis/research-automation/insight-persona-contracts.js';
import { buildPersonaModelInput, buildPersonaAdmission } from '../../src/modules/analysis/research-automation/insight-persona-model.js';
import { projectPersonaResponse, type PersonaStageSource } from '../../src/modules/analysis/research-automation/insight-persona-projection.js';
import type { PersonaModelRequest, PersonaModelResponse } from '../../contracts/analysis/automation-insight-persona.generated.js';

async function sourceFixture(t: Parameters<typeof personaSourceFixture>[0], rows = personaRows()) {
  const f = await personaSourceFixture(t, rows), safe = checkPersonaSource(f.evidence.publicSource());
  const binding = { ...safe.binding, pairId: 'd'.repeat(64), semanticSha256: 'e'.repeat(64), corpusSha256: safe.corpus.artifactSha256,
    collectionId: safe.corpus.collectionId, collectionSha256: safe.corpus.collectionSha256, sourceRequestSha256: safe.corpus.requestSha256,
    viewSha256: safe.viewSha256, sourceSha256: personaDigest(safe) };
  const request: PersonaModelRequest = { contractVersion: 'insight-persona-model-request-v1', requestKey: randomUUID(), binding,
    rootId: null, rootSha256: null, previousProposalId: null, previousProposalSha256: null, stage: 'TAXONOMY', recordIndexes: personaIndexes(safe.taxonomySample.recordIndexes) };
  const source: PersonaStageSource = { binding, evidence: f.evidence, request, previous: null };
  return { f, source, safe };
}
test('pure stage projection uses authenticated source sample and full100-member lineage; source dates/negation preserved and no private metadata in input/admission', async t => {
  const { f, source, safe } = await sourceFixture(t, personaRows(101));
  const input = buildPersonaModelInput(source);
  assert.equal(input.records.length, 101); assert.equal(input.classifications.length, 0); assert.equal(input.taxonomy, null);
  const taxonomy = projectPersonaResponse(source, personaFixtureResponse(input, safe) as PersonaModelResponse).snapshot;
  const classify: PersonaStageSource = { ...source, previous: taxonomy, request: { contractVersion: 'insight-persona-model-request-v1', requestKey: randomUUID(),
    binding: source.binding, rootId: randomUUID(), rootSha256: 'a'.repeat(64), previousProposalId: randomUUID(), previousProposalSha256: 'b'.repeat(64),
    stage: 'CLASSIFY', recordIndexes: personaIndexes(safe.eligibleRecordIndexes.slice(0, 100)) } };
  if (classify.request.stage !== 'CLASSIFY') throw new Error('Expected classification');
  const classifyRequest = classify.request;
  const batch = buildPersonaModelInput(classify); assert.equal(batch.records.length, 100); assert.equal(batch.classifications.length, 0);
  const snapshot = projectPersonaResponse(classify, personaFixtureResponse(batch, safe) as PersonaModelResponse).snapshot;
  assert.equal(snapshot.classificationComplete, false); assert.equal(snapshot.classifications.length, 100);
  assert.throws(() => buildPersonaModelInput({ ...classify, previous: snapshot, request: { ...classifyRequest, recordIndexes: [0] } }));
  const last = { ...classify, previous: snapshot, request: { ...classifyRequest, recordIndexes: personaIndexes([100]) } };
  const complete = projectPersonaResponse(last, personaFixtureResponse(buildPersonaModelInput(last), safe) as PersonaModelResponse).snapshot;
  assert.equal(complete.classificationComplete, true); assert.equal(complete.classifications.length, 101);
  const bytes = JSON.stringify({ admission: buildPersonaAdmission(source), input });
  for (const value of [f.selection.marker.profile.keyId, f.selection.marker.profile.keyCommitment,
    ...f.corpus.projection.records.map(row => row.authorIdentity.hash!)]) assert.equal(bytes.includes(value), false);
  assert.equal(input.records[0]!.text, f.corpus.projection.records[0]!.comment);
  assert.equal(input.records[0]!.sourceDate.eligibility, 'UNKNOWN');
});

test('application keeps qualified cards but refuses repeated-card manufactured personas, literal unsupported attributes and unresolved classifications', async t => {
  const { source, safe } = await sourceFixture(t);
  const taxonomy = projectPersonaResponse(source, personaFixtureResponse(buildPersonaModelInput(source), safe) as PersonaModelResponse).snapshot;
  const classify: PersonaStageSource = { ...source, previous: taxonomy, request: { contractVersion: 'insight-persona-model-request-v1', requestKey: randomUUID(),
    binding: source.binding, rootId: randomUUID(), rootSha256: 'a'.repeat(64), previousProposalId: randomUUID(), previousProposalSha256: 'b'.repeat(64),
    stage: 'CLASSIFY', recordIndexes: personaIndexes(safe.eligibleRecordIndexes) } };
  if (classify.request.stage !== 'CLASSIFY') throw new Error('Expected classification');
  const classifyRequest = classify.request;
  const classified = projectPersonaResponse(classify, personaFixtureResponse(buildPersonaModelInput(classify), safe) as PersonaModelResponse).snapshot;
  const synthesize: PersonaStageSource = { ...classify, previous: classified, request: { ...classifyRequest, stage: 'SYNTHESIZE', recordIndexes: [] } };
  const attribute = (index: number) => ({ kind: 'SITUATION' as const, value: safe.records[index]!.text!, quotes: [personaQuote(safe, index)] });
  const response = { contractVersion: 'insight-persona-synthesis-response-v1' as const, codebookSha256: taxonomy.codebookSha256!,
    cards: [0, 2, 4].map(index => ({ cardKey: `c${index}`, situation: attribute(index), quotes: [personaQuote(safe, index), personaQuote(safe, index + 1)],
      attributes: [{ kind: 'NEED' as const, value: 'Unsupported made-up claim', quotes: [personaQuote(safe, index)] }] })),
    personas: Array.from({ length: 3 }, () => ({ cardKeys: ['c0', 'c2', 'c4'], attributes: [attribute(0)] })), insufficiency: null };
  const projected = projectPersonaResponse(synthesize, response as PersonaModelResponse).snapshot;
  assert.equal(projected.cards.length, 3); assert.equal(projected.personas.length, 0); assert.ok(projected.insufficiency);
  assert.ok(projected.cards.every(card => card.attributes.length === 0));
  assert.equal(JSON.stringify(projected).includes('Unsupported made-up claim'), false);
  const low = structuredClone(classified); low.classifications[0] = { recordIndex: 0, confidence: 'LOW', status: 'UNCLASSIFIED',
    topic: null, journey: null, sentiment: null, quotes: [], uncertainty: 'Ambiguous source.' };
  assert.throws(() => projectPersonaResponse({ ...synthesize, previous: low }, response as PersonaModelResponse));
});
