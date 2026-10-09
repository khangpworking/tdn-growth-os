import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { syntheticProductSource, syntheticWebSource, SYNTHETIC_CARD_ID } from './research-synthetic-sources.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { MetaPageSavedCapture, MetaPageLocatedLiteral } from '../../contracts/analysis/meta-page-source-v1.generated.js';
import type { MetaPagePrepareRequest } from '../../contracts/api/research-automation-meta-page-api.generated.js';
export const metaWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const metaRunId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-08T12:00:00.000Z');
const period = { startDate: '2026-01-01', endDate: '2026-01-30' };
const sha = (v: Uint8Array): string => createHash('sha256').update(v).digest('hex');
export function savedMetaCapture() {
  const chunks: Buffer[] = [Buffer.from('<html><body>')]; let offset = chunks[0]!.length;
  const located = (value: string): MetaPageLocatedLiteral => {
    const bytes = Buffer.from(value); const span = { byteOffset: offset, byteLength: bytes.length };
    chunks.push(bytes, Buffer.from('\n')); offset += bytes.length + 1; return { value, span };
  };
  const makeAd = (id: string, text: string, status = 'Active') => ({ libraryId: located(id), libraryLink: located(`https://www.facebook.com/ads/library/?id=${id}`),
    pageId: located('123456'), pageName: located('Synthetic Brand page'), startDate: located('2026-09-08'), stopDate: null, status: located(status),
    platforms: null, versionCount: located('2 versions'), spendRange: null, impressionRange: null, text: located(text) });
  const included = makeAd('9001', 'Synthetic nồi chiên '.repeat(20));
  const ads = [included, makeAd('9002', 'Synthetic nồi chiên accessory', 'Inactive'), makeAd('9003', 'nôi chiên'), structuredClone(included)];
  chunks.push(Buffer.from('</body></html>')); const html = Buffer.concat(chunks);
  const capture: MetaPageSavedCapture = { contractVersion: 'meta-page-saved-capture-v1', profile: 'operator-located-visible-declarations-v1', provenance: 'SYNTHETIC',
    controlState: 'READY', pageId: '123456', libraryUrl: 'https://www.facebook.com/ads/library/?view_all_page_id=123456&country=VN',
    capturedAt: '2026-10-08T08:00:00.000Z', htmlSha256: sha(html), ads };
  return { html, capture, visible: Buffer.from(JSON.stringify(capture)) };
}
export async function metaOwningFixture(t: TestContext, firstShopId = '10') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-meta-owning-'));
  const databasePath = path.join(root, 'fixture.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot), staging = new RequestScopedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => metaWorkspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'meta-owning-source', title: 'Synthetic Meta owning source' });
  let providerCalls = 0, modelCalls = 0;
  const original = syntheticProductSource();
  const source: AutomationSourcePort = { ...original, quickSearch: async (input, options) => {
    providerCalls++; const result = await original.quickSearch(input, options);
    const raw = Buffer.from(JSON.stringify({ data: [{ product_id: '12345', product_name: 'Synthetic nồi chiên' }] }));
    return { ...result, result: { ...result.result, captures: result.result.captures.map(c => ({ ...c, responseBytes: raw, responseSha256: sha(raw), responseByteLength: raw.length })) } };
  }, collect: async (input, options) => { providerCalls++; const result = await original.collect(input, options); return { ...result, result: { ...result.result, captures: [] } }; } };
  const workspaces = new FlowDiscoveryWorkspaceReader(discovery);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, metricAttachmentStore: staging, workspaceReader: workspaces, now, uuid: () => metaRunId,
    source, webSource: syntheticWebSource(() => { providerCalls++; }, [{ position: 1, title: 'Synthetic Brand nồi chiên', link: 'https://www.facebook.com/123456', snippet: 'Synthetic page search result' }]),
    sourceEvidence: { modelIdentity: 'synthetic-keyword-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => { modelCalls++; return { keywords: ['nồi chiên'], exclusions: [{ term: 'accessory', reason: 'Separate fixture accessory' }] }; } } },
    renderer: buildResearchAutomationReport });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(metaWorkspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT', keyword: 'nồi chiên', requestedPeriod: period, reports: ['MARKET'] });
  await service.processNext(); const awaiting = await service.getRun(metaWorkspaceId, metaRunId);
  const scope = { definition: 'Synthetic nồi chiên source universe', includeTerms: ['nồi chiên'], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] };
  const workbook = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2', cells: {
    A2: { type: 's', value: 'Synthetic nồi chiên A' }, A3: { type: 's', value: 'Synthetic nồi chiên B' },
    B2: { type: 's', value: `https://shopee.vn/synthetic-a-i.${firstShopId}.101` }, I2: { type: 's', value: `https://shopee.vn/shop/${firstShopId}` }, J2: { type: 's', value: `1__101__${firstShopId}` } } }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(workbook.status, 0, workbook.stderr.toString());
  const prepared = await service.prepareMetricSource(metaWorkspaceId, metaRunId, { contractVersion: 'automation-metric-prepare-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    scope, sourceLabel: 'Synthetic workbook', sourceContext: 'Synthetic source universe', measurementPeriod: { ...period, basis: 'Synthetic measurement period' }, selection: 'OFF', acquiredAt: null,
    precision: { revenue: 'exact', units: 'exact' } }, workbook.stdout);
  await service.confirmScope(metaWorkspaceId, metaRunId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(), expectedRevision: awaiting.revision, ...scope,
    sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  await service.processNext(); await service.processNext();
  const ready = await service.getRun(metaWorkspaceId, metaRunId); assert.equal(ready.status, 'DRAFT_READY');
  const firstPair = (await service.listReportVersions(metaWorkspaceId, metaRunId))[0]!;
  const adopted = await service.adoptMetricRule(metaWorkspaceId, metaRunId, { contractVersion: 'automation-metric-rule-adopt-v1', requestKey: randomUUID(), expectedRevision: ready.revision,
    rulebook: { ruleId: 'meta-synthetic-universe', revision: 1, title: 'Synthetic product rules', definitions: { CORE_CANDIDATE: 'Fixture standalone products', ADJACENT: 'Fixture accessories', OUTSIDE: 'Other fixture rows', UNKNOWN: 'Unknown fixture rows' },
      groups: [{ key: 'fixture-group', label: 'Synthetic group', definition: 'Only this fixture' }], wideUnknownPolicy: 'exclude' } }, { actorId: 'owner:synthetic', role: 'OWNER' });
  const review = await service.readMetricMembership(metaWorkspaceId, metaRunId, firstPair.pairId, adopted.adoptionId);
  const proposed = await service.proposeMetricMembership(metaWorkspaceId, metaRunId, { contractVersion: 'metric-membership-propose-v1', requestKey: randomUUID(), pairId: firstPair.pairId, adoptionId: adopted.adoptionId,
    assignments: review.records.map(row => ({ recordKey: row.recordKey, classification: 'CORE_CANDIDATE', group: 'fixture-group' })) }, { actorId: 'owner:synthetic', role: 'OWNER' });
  const accepted = await service.acceptMetricMembership(metaWorkspaceId, metaRunId, { contractVersion: 'metric-membership-accept-v1', requestKey: randomUUID(), proposalId: proposed.id,
    selectedRecordKeys: review.records.map(row => row.recordKey) }, { actorId: 'owner:synthetic', role: 'OWNER' });
  await service.requestReportRevision(metaWorkspaceId, metaRunId, { contractVersion: 'automation-classified-report-revision-v1', requestKey: randomUUID(), previousPairId: firstPair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, acceptedMetric: { adoptionId: adopted.adoptionId, receiptIds: [accepted.id] } });
  await service.processNext();
  const pair = (await service.listReportVersions(metaWorkspaceId, metaRunId)).at(-1)!;
  const report = await service.readReport(metaWorkspaceId, metaRunId, 'MARKET', false, pair.pairId);
  const semantic = JSON.parse((await artifacts.read(report.versionId)).toString());
  assert.equal(semantic.defaultMarketPeers.frames[0].state, 'SELECTED');
  const collection = await service.readSourceEvidence(metaWorkspaceId, metaRunId); assert.ok(collection?.draftDigest);
  const raw = savedMetaCapture(), current = await service.getRun(metaWorkspaceId, metaRunId);
  const request: MetaPagePrepareRequest = { contractVersion: 'meta-page-prepare-v1', requestKey: randomUUID(), expectedRevision: current.revision,
    selection: { pairId: pair.pairId, peerFrameIndex: 0, peerIdentityKey: semantic.defaultMarketPeers.frames[0].selected[0].identity.key,
      keywordDraftSha256: collection.draftDigest, searchCaptureId: collection.admission!.result.results[0]!.recordId.split('#')[0]!, searchPosition: 1, pageId: '123456' },
    htmlBase64: raw.html.toString('base64'), visibleFieldsBase64: raw.visible.toString('base64') };
  return { root, databasePath, artifactRoot, db, artifacts, staging, service, request, raw, pair, firstPair, report, current,
    calls: () => ({ provider: providerCalls, model: modelCalls }), workspaces };
}
