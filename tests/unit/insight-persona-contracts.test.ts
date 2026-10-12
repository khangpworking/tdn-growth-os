import assert from 'node:assert/strict';
import test from 'node:test';
import { personaSourceFixture } from '../helpers/insight-persona-fixture.js';
import { checkPersonaSource, checkPersonaBinding, checkPersonaTaxonomy, checkPersonaClassifications, checkPersonaSynthesis,
  personaRequestValid, personaSourceValid, personaSnapshotValid, personaDigest, personaViewValid } from '../../src/modules/analysis/research-automation/insight-persona-contracts.js';
import * as browser from '../../frontend/src/generated/report-validators.generated.js';
import type { PersonaBinding, PersonaSource } from '../../contracts/analysis/automation-insight-persona.generated.js';

const bindingFor = (source: PersonaSource): PersonaBinding => ({ ...source.binding, pairId: 'd'.repeat(64), semanticSha256: 'e'.repeat(64),
  corpusSha256: source.corpus.artifactSha256, collectionId: source.corpus.collectionId, collectionSha256: source.corpus.collectionSha256,
  sourceRequestSha256: source.corpus.requestSha256, viewSha256: source.viewSha256, sourceSha256: personaDigest(source) });
const taxonomyFor = (quote: unknown) => ({ contractVersion: 'insight-persona-taxonomy-v1',
  topics: [{ code: 'need', label: 'Source need', meaning: 'Proposed source-bound need', examples: [quote] }],
  journeys: [{ code: 'use', label: 'Use context', meaning: 'Proposed literal context, no episode/period claim', examples: [quote] }] });

test('new canonical safe source and binding validate actual retained source; ratings remain exact unions and private fields fail closed', async t => {
  const f = await personaSourceFixture(t);
  const source = checkPersonaSource(f.evidence.publicSource());
  assert.deepEqual(checkPersonaBinding(bindingFor(source), source), bindingFor(source));
  for (const field of ['authorIdentity', 'authorId', 'authorHash', 'keyId', 'profile', 'reviewId']) {
    const leaked = structuredClone(source) as unknown as { records: Record<string, unknown>[] };
    leaked.records[0]![field] = 'SYNTHETIC_SECRET'; assert.equal(personaSourceValid(leaked), false, field);
  }
  const outOfRange = structuredClone(source); outOfRange.records[0]!.rating = { fieldPresent: true, state: 'INVALID', value: 0 };
  assert.equal(personaSourceValid(outOfRange), true);
  const forged = structuredClone(source) as unknown as { records: { rating: unknown }[] };
  for (const rating of [0, null, { fieldPresent: false, state: 'VALID', value: 5 }, { fieldPresent: true, state: 'VALID', value: 0 }]) {
    forged.records[0]!.rating = rating; assert.equal(personaSourceValid(forged), false);
  }
  for (const key of ['workspaceId', 'runId', 'startSha256', 'scopeSha256', 'confirmedSourceSetSha256', 'corpusSha256',
    'collectionId', 'collectionSha256', 'sourceRequestSha256', 'sourceSha256', 'viewSha256'] as const) {
    const binding = bindingFor(source); binding[key] = key.endsWith('Id') ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : 'f'.repeat(64);
    assert.throws(() => checkPersonaBinding(binding, source), /INVALID_INSIGHT_PERSONA_CONTRACT/, key);
  }
  const blank = structuredClone(source); blank.records[0]!.text = ' ';
  assert.throws(() => checkPersonaSource(blank));
  const duplicate = structuredClone(source); duplicate.records[1]!.recordId = duplicate.records[0]!.recordId;
  assert.throws(() => checkPersonaSource(duplicate));
  const changedMembership = structuredClone(source); changedMembership.eligibleRecordIndexes.pop();
  assert.throws(() => checkPersonaSource(changedMembership));
});

test('canonical stage requests and browser validators retain exact source selectors without authority object injection or implicit approval', async t => {
  const f = await personaSourceFixture(t), source = checkPersonaSource(f.evidence.publicSource());
  const request = { contractVersion: 'insight-persona-model-request-v1', requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    binding: bindingFor(source), rootId: null, rootSha256: null, previousProposalId: null, previousProposalSha256: null,
    stage: 'TAXONOMY', recordIndexes: source.taxonomySample.recordIndexes };
  assert.equal(personaRequestValid(request), true); assert.equal(browser.insightPersonaRequest(request), true);
  for (const change of [{ rootId: request.requestKey }, { stage: 'CLASSIFY' }, { stage: 'SYNTHESIZE' }, { recordIndexes: [] },
    { recordIndexes: [0, 0] }, { semantic: { ownerApproved: true } }, { actorRole: 'MEMBER' }, { binding: { ...request.binding, authorHash: 'f'.repeat(64) } }]) {
    const invalid = { ...request, ...change }; assert.equal(personaRequestValid(invalid), false); assert.equal(browser.insightPersonaRequest(invalid), false);
  }
  const view = { contractVersion: 'insight-persona-view-v1', binding: request.binding, source, evidence: [], releaseEligibility: 'UNAVAILABLE' };
  assert.equal(personaViewValid(view), true); assert.equal(browser.insightPersonaView(view), true);
  assert.equal(browser.insightPersonaView({ ...view, releaseEligibility: 'ELIGIBLE' }), false);
  assert.equal(browser.insightPersonaResponse({ contractVersion: 'insight-persona-model-response-v1', status: 'NOT_DISPATCHED', reason: 'AI_NOT_CONFIGURED' }), true);
});

test('taxonomy/classification guards pin exact quote/codebook/member proofs; LOW/AMBIGUOUS have no numeric or classified contribution', async t => {
  const f = await personaSourceFixture(t), source = checkPersonaSource(f.evidence.publicSource());
  const taxonomy = checkPersonaTaxonomy(taxonomyFor(f.quote(0)), source);
  const classification = { contractVersion: 'insight-persona-classification-response-v1', codebookSha256: personaDigest(taxonomy), records: [
    { recordIndex: 0, confidence: 'HIGH', status: 'CLASSIFIED', topic: 'need', journey: 'use', sentiment: 'NEGATIVE', quotes: [f.quote(0)], uncertainty: null },
    { recordIndex: 1, confidence: 'LOW', status: 'UNCLASSIFIED', topic: null, journey: null, sentiment: null, quotes: [], uncertainty: 'Source meaning unclear.' },
    { recordIndex: 2, confidence: 'AMBIGUOUS', status: 'UNCLASSIFIED', topic: null, journey: null, sentiment: null, quotes: [f.quote(2)], uncertainty: 'Contrary evidence remains.' },
  ] };
  assert.equal(checkPersonaClassifications(classification, source, taxonomy, [0, 1, 2]).records[1]!.topic, null);
  for (const change of [{ codebookSha256: 'f'.repeat(64) }, { records: [classification.records[0], classification.records[0]] },
    { records: [{ ...classification.records[0], topic: 'unknown' }] }, { records: [{ ...classification.records[0], confidence: 0.99 }] },
    { records: [{ ...classification.records[0], confidence: 'LOW' }] }, { records: [{ ...classification.records[0], quotes: [f.quote(1)] }] },
    { records: [{ ...classification.records[0], uncertainty: 'Unresolved ambiguity.' }] }])
    assert.throws(() => checkPersonaClassifications({ ...classification, ...change }, source, taxonomy, [0]));
  const duplicateCode = taxonomyFor(f.quote(0)); duplicateCode.topics.push(duplicateCode.topics[0]!);
  assert.throws(() => checkPersonaTaxonomy(duplicateCode, source));
  const wrongQuote = f.quote(0); wrongQuote.span.quote = 'Source did not say this';
  assert.throws(() => checkPersonaTaxonomy(taxonomyFor(wrongQuote), source));
});

test('situation/cards/persona attributes require admitted exact quote pointers; unsupported demographics, cross-card members and low-confidence records rejected', async t => {
  const f = await personaSourceFixture(t), source = checkPersonaSource(f.evidence.publicSource());
  const taxonomy = checkPersonaTaxonomy(taxonomyFor(f.quote(0)), source);
  const situation = (index: number) => ({ kind: 'SITUATION', value: f.quote(index).span.quote, quotes: [f.quote(index)] });
  const cards = [0, 2, 4].map(index => ({ cardKey: `card${index}`, situation: situation(index), quotes: [f.quote(index), f.quote(index + 1)], attributes: [] }));
  const response = { contractVersion: 'insight-persona-synthesis-response-v1', codebookSha256: personaDigest(taxonomy), cards,
    personas: [{ cardKeys: ['card0', 'card2', 'card4'], attributes: [situation(0)] }], insufficiency: null };
  assert.equal(checkPersonaSynthesis(response, source, taxonomy, new Set([0, 1, 2, 3, 4, 5])).cards.length, 3);
  for (const attribute of [{ ...situation(0), quotes: [] }, { ...situation(0), kind: 'AGE' }, { ...situation(0), quotes: [f.quote(2)] },
    { ...situation(0), quotes: [{ ...f.quote(0), recordId: 'f'.repeat(64) }] }]) {
    const invalid = structuredClone(response); invalid.cards[0]!.attributes = [attribute] as never;
    assert.throws(() => checkPersonaSynthesis(invalid, source, taxonomy, new Set([0, 1, 2, 3, 4, 5])));
  }
  assert.throws(() => checkPersonaSynthesis(response, source, taxonomy, new Set([0, 1, 2, 3, 4])));
  const wrongCard = structuredClone(response); wrongCard.personas[0]!.cardKeys[0] = 'not-retained';
  assert.throws(() => checkPersonaSynthesis(wrongCard, source, taxonomy, new Set([0, 1, 2, 3, 4, 5])));
});

test('snapshot namespace permits honest shortage, never one/two personas or an approval/statistical release', async t => {
  const f = await personaSourceFixture(t), source = checkPersonaSource(f.evidence.publicSource());
  const snapshot = { contractVersion: 'insight-persona-snapshot-v1', binding: bindingFor(source), taxonomy: null, codebookSha256: null,
    classifications: [], cards: [], personas: [], insufficiency: 'Not enough supported cards and source products.', classificationComplete: false,
    status: 'PROPOSED', releaseEligibility: 'UNAVAILABLE' };
  assert.equal(personaSnapshotValid(snapshot), true);
  assert.equal(personaSnapshotValid({ ...snapshot, status: 'APPROVED' }), false);
  assert.equal(personaSnapshotValid({ ...snapshot, kappa: 0.6 }), false);
  const minimum = f.evidence.persona([[f.quote(0), f.quote(1)], [f.quote(2), f.quote(3)], [f.quote(4), f.quote(5)]]);
  const candidate = { personaId: 'a'.repeat(64), cardIds: minimum.cards.map(card => card.cardId),
    attributes: [{ kind: 'SITUATION', value: f.quote(0).span.quote, quotes: [f.quote(0)] }],
    recordIndexes: minimum.recordIndexes, authorEvidence: minimum.authorEvidence, broaderScopeEligible: true,
    sampleSize: minimum.sampleSize, sampleSizeLabel: minimum.sampleSizeLabel, label: minimum.label,
    identityLimitation: minimum.identityLimitation, status: 'PROPOSED', releaseEligibility: 'UNAVAILABLE' };
  assert.equal(personaSnapshotValid({ ...snapshot, personas: [candidate] }), false);
  assert.equal(personaSnapshotValid({ ...snapshot, personas: [candidate, { ...candidate, personaId: 'b'.repeat(64) }] }), false);
  assert.equal(personaSnapshotValid({ ...snapshot, personas: [candidate, { ...candidate, personaId: 'b'.repeat(64) },
    { ...candidate, personaId: 'c'.repeat(64) }] }), true); // Structural guard only, not author/scope verification or segmentation truth.
  assert.equal(personaSnapshotValid({ ...snapshot, personas: Array(7).fill(candidate) }), false);
  assert.equal(personaSnapshotValid({ ...snapshot, persons: 6 }), false);
});
