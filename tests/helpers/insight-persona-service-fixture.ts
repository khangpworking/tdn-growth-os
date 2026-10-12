import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import type { PersonaSource, PersonaQuoteSelection, PersonaModelRequest, PersonaProposalEvidence, PersonaBinding, PersonaTaxonomyRequest, PersonaClassificationRequest, PersonaSynthesisRequest } from '../../contracts/analysis/automation-insight-persona.generated.js';
import type { ResearchPersonaEntry } from '../../contracts/api/research-automation-insight-persona-api.generated.js';
import { personaDigest } from '../../src/modules/analysis/research-automation/insight-persona-contracts.js';
export const PERSONA_WORKSPACE = '11111111-1111-4111-8111-111111111111';
export const PERSONA_RUN = '22222222-2222-4222-8222-222222222222';
export const PERSONA_KEY = '33333333-3333-4333-8333-333333333333';
export const personaOwner = { actorId: 'owner:persona-fixture', role: 'OWNER' as const };
export const personaConfiguration = { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic', modelId: 'fixture-persona',
  temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 };
export const personaServiceRows = () => Array.from({ length: 18 }, (_, index) => ({ reviewId: String(8000000001 + index),
  shopId: '2001', itemId: String(3001 + index % 3), authorId: String(918273640 + index), author: 'PRIVATE_AUTHOR', profileUrl: 'PRIVATE_PROFILE',
  comment: [`When I carry it to work I want no sweet drink; I worry about the bag.`,
    `After exercise I want a light drink; I do not want to buy a large bottle.`,
    `On a late shift I want a small drink; I worry about delivery timing.`][Math.floor(index / 6)]!, ratingStar: 5, createdAt: null }));
export function personaQuote(source: PersonaSource, index: number): PersonaQuoteSelection {
  const record = source.records[index]!;
  return { recordIndex: index, recordId: record.recordId, locator: structuredClone(record.locator),
    span: { start: 0, end: record.text!.length, quote: record.text! } };
}
export function personaFixtureResponse(input: { stage: string; records: PersonaSource['records']; codebookSha256: string | null }, source: PersonaSource) {
  if (input.stage === 'TAXONOMY') return { contractVersion: 'insight-persona-taxonomy-response-v1', taxonomy: { contractVersion: 'insight-persona-taxonomy-v1',
    topics: [{ code: 'need', label: 'Literal source need', meaning: 'Proposed source-stated need', examples: [personaQuote(source, input.records[0]!.recordIndex)] }],
    journeys: [{ code: 'use', label: 'Literal use context', meaning: 'Proposed undated source context', examples: [personaQuote(source, input.records[0]!.recordIndex)] }] } };
  if (input.stage === 'CLASSIFY') return { contractVersion: 'insight-persona-classification-response-v1', codebookSha256: input.codebookSha256,
    records: input.records.map(row => ({ recordIndex: row.recordIndex, confidence: 'HIGH', status: 'CLASSIFIED', topic: 'need', journey: 'use',
      sentiment: 'MIXED', quotes: [personaQuote(source, row.recordIndex)], uncertainty: null })) };
  const attribute = (index: number) => ({ kind: 'SITUATION', value: source.records[index]!.text!, quotes: [personaQuote(source, index)] });
  const cards = Array.from({ length: 9 }, (_, card) => ({ cardKey: `card${card}`, situation: attribute(card * 2),
    quotes: [personaQuote(source, card * 2), personaQuote(source, card * 2 + 1)], attributes: [] }));
  return { contractVersion: 'insight-persona-synthesis-response-v1', codebookSha256: input.codebookSha256, cards,
    personas: Array.from({ length: 3 }, (_, group) => ({ cardKeys: [0, 1, 2].map(at => `card${group * 3 + at}`), attributes: [attribute(group * 6)] })), insufficiency: null };
}
export function personaIndexes(values: readonly number[]): PersonaTaxonomyRequest['recordIndexes'] {
  if (!values.length) throw new Error('Synthetic stage requires nonempty admitted indexes');
  return [values[0]!, ...values.slice(1)];
}
export function personaStageRequest(binding: PersonaBinding): PersonaTaxonomyRequest;
export function personaStageRequest(binding: PersonaBinding, prior: ResearchPersonaEntry, stage: 'CLASSIFY'): PersonaClassificationRequest;
export function personaStageRequest(binding: PersonaBinding, prior: ResearchPersonaEntry, stage: 'SYNTHESIZE'): PersonaSynthesisRequest;
export function personaStageRequest(binding: PersonaBinding, prior?: ResearchPersonaEntry, stage?: 'CLASSIFY' | 'SYNTHESIZE'): PersonaModelRequest {
  if (!prior) return { contractVersion: 'insight-persona-model-request-v1', requestKey: randomUUID(), binding,
    rootId: null, rootSha256: null, previousProposalId: null, previousProposalSha256: null, stage: 'TAXONOMY', recordIndexes: [0] };
  if (prior.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Exact proposal required');
  const common = { contractVersion: 'insight-persona-model-request-v1' as const, requestKey: randomUUID(), binding, rootId: prior.evidence.rootId,
    rootSha256: prior.evidence.rootSha256, previousProposalId: prior.evidence.evidenceId, previousProposalSha256: prior.sha256 };
  return stage === 'SYNTHESIZE' ? { ...common, stage, recordIndexes: [] } : { ...common, stage: 'CLASSIFY', recordIndexes: [0] };
}
export async function personaServiceFixture(t: TestContext, rows: unknown[] = personaServiceRows(), products = 3) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-persona-service-'));
  const now = () => new Date('2026-10-09T00:00:00.000Z');
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db, artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => PERSONA_WORKSPACE, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'persona-fixture', title: 'Synthetic persona evidence' });
  const privacy = createShopeePrivateIntake({ salt: Buffer.alloc(32, 7), keyId: PERSONA_KEY });
  const collector = new FixtureShopeeCollector(Buffer.from(JSON.stringify(rows)), privacy); let calls = 0;
  const staging = new RequestScopedArtifactStore(artifactRoot);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, metricAttachmentStore: staging,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => PERSONA_RUN, now,
    sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'synthetic-v1' }, renderer: buildResearchAutomationReport,
    privateShopee: { source: { contractVersion: 'automation-private-shopee-source-v1', profile: privacy.profile }, factory: () => ({ requestsIssued: () => calls,
      collector: { mode: collector.mode, privacyProfile: collector.privacyProfile, async collect(...args) { calls++; return collector.collect(...args); } } }) } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(PERSONA_WORKSPACE, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT',
    keyword: 'Synthetic undated source personas', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(PERSONA_WORKSPACE, PERSONA_RUN, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(PERSONA_WORKSPACE, PERSONA_RUN)).revision, definition: 'Synthetic source-bound qualitative context',
    includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    exactShopeeUrls: Array.from({ length: products }, (_, index) => `https://shopee.vn/product/2001/${3001 + index}`) });
  await service.processNext(); await service.processNext();
  const pair = (await service.listReportVersions(PERSONA_WORKSPACE, PERSONA_RUN))[0]!;
  const oldReport = await service.readReport(PERSONA_WORKSPACE, PERSONA_RUN, 'INSIGHT', false, pair.pairId);
  const context = await service.readPersonaSourceContext(PERSONA_WORKSPACE, PERSONA_RUN, pair.pairId);
  return { root, databasePath, artifactRoot, db, artifacts, staging, service, pair, oldReport, context, privacy,
    collectorCalls: () => calls, digest: personaDigest };
}

export async function personaPendingPipeline(f: Awaited<ReturnType<typeof personaServiceFixture>>) {
  let modelCalls = 0; const captured: string[] = [];
  const ai = { configuration: personaConfiguration, port: { async generateText({ userText }: { userText: string }) {
    modelCalls++; captured.push(userText); return { text: JSON.stringify(personaFixtureResponse(JSON.parse(userText), f.context.source)) };
  } } };
  const first = personaStageRequest(f.context.binding); first.recordIndexes = personaIndexes(f.context.source.taxonomySample.recordIndexes);
  const taxonomy = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, first, personaOwner, ai);
  if (taxonomy.status !== 'PROPOSED' || taxonomy.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('No retained taxonomy');
  const second = personaStageRequest(f.context.binding, taxonomy.proposal, 'CLASSIFY'); second.recordIndexes = personaIndexes(f.context.source.eligibleRecordIndexes);
  const classified = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, second, personaOwner, ai);
  if (classified.status !== 'PROPOSED' || classified.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('No retained classifications');
  const third = personaStageRequest(f.context.binding, classified.proposal, 'SYNTHESIZE');
  const result = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, third, personaOwner, ai);
  if (result.status !== 'PROPOSED' || result.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('No retained persona proposal');
  return { modelCalls: () => modelCalls, captured, requests: [first, second, third], responses: [taxonomy, classified, result], result };
}
