import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { locatedSpan } from './located-insight-fixture.js';
import type { InsightProposedAnnotations } from '../../contracts/analysis/automation-insight-coding.generated.js';
import type { InsightDefaultModelRequest } from '../../contracts/analysis/automation-insight-model.generated.js';
export const crosscheckWorkspaceId = '11111111-1111-4111-8111-111111111111', crosscheckRunId = '22222222-2222-4222-8222-222222222222';
export const crosscheckOwner = { actorId: 'owner:synthetic-crosscheck', role: 'OWNER' as const };
export const blankCrosscheckAnnotations = (): InsightProposedAnnotations => ({ i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] });
/** Actual owning first-model executions, synthetic located source and task-local SQLite/CAS only. */
export async function crosscheckFlowFixture(t: TestContext, size = 201, twoCodes = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-crosscheck-flow-'));
  const now = () => new Date('2026-10-04T00:00:00.000Z'), databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db, artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => crosscheckWorkspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'crosscheck-flow-synthetic', title: 'Synthetic crosscheck flow' });
  const raw = Buffer.from(JSON.stringify(Array.from({ length: size }, (_, index) => ({ shopId: '78085196', itemId: '17678138164', reviewId: `synthetic-${index}`, comment: 'Tôi thích kích thước.', ratingStar: 4 }))));
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(artifactRoot), uuid: () => crosscheckRunId, now,
    shopeeCollectorFactory: () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }) });
  await service.start(crosscheckWorkspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT', keyword: 'Synthetic crosscheck flow', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(crosscheckWorkspaceId, crosscheckRunId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: (await service.getRun(crosscheckWorkspaceId, crosscheckRunId)).revision, definition: 'Synthetic crosscheck only', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] });
  await service.processNext(); await service.processNext();
  const pair = (await service.listReportVersions(crosscheckWorkspaceId, crosscheckRunId))[0]!;
  const context = await service.readInsightSourceContext(crosscheckWorkspaceId, crosscheckRunId, pair.pairId);
  const configuration = { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic-first', modelId: 'first-fixture', temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 };
  let firstCalls = 0, latest: Awaited<ReturnType<typeof service.proposeDefaultModelInsightCoding>>['proposal'];
  for (let from = 0; from < size; from += 100) {
    const prior = latest?.evidence.request;
    if (prior && prior.contractVersion !== 'insight-coding-default-propose-v1') throw new Error('Wrong synthetic default');
    const indexes = Array.from({ length: Math.min(100, size - from) }, (_, at) => from + at);
    const request: InsightDefaultModelRequest = { contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(), binding: context.binding,
      defaultRuleId: prior?.defaultRuleId ?? null, defaultRuleSha256: prior?.defaultRuleSha256 ?? null,
      previousProposalId: latest?.evidence.evidenceId ?? null, previousProposalSha256: latest?.sha256 ?? null, recordIndexes: indexes as [number, ...number[]] };
    const result = await service.proposeDefaultModelInsightCoding(crosscheckWorkspaceId, crosscheckRunId, request, crosscheckOwner, { configuration, port: { async generateText() {
      firstCalls++; const annotations = blankCrosscheckAnnotations(), span = locatedSpan(context.input.records[0]!.text!, 'kích thước');
      annotations.corpora = [{ corpusIndex: 0, assignments: indexes.map(recordIndex => ({ recordIndex, code: 'C1', span,
        provenance: { basis: 'PENDING_AI' as const, coderRole: 'first-fixture', adjudication: null, disagreement: null } })), dispositions: [] }];
      return { text: JSON.stringify({ codebooks: from === 0 ? [{ corpusIndex: 0, codes: [{ code: 'C1', label: 'size', phrase: 'kích thước', firstRecordIndex: 0, firstSpan: span }, ...(twoCodes ? [{ code: 'C2', label: 'liking', phrase: 'thích', firstRecordIndex: 0, firstSpan: locatedSpan(context.input.records[0]!.text!, 'thích') }] : [])] }] : [], annotations }) };
    } } });
    if (!result.proposal) throw new Error(`Synthetic first execution ${result.execution.status}`);
    latest = result.proposal;
  }
  if (!latest) throw new Error('Synthetic first source empty');
  return { root, db, artifacts, service, pair, context, latest, configuration, databasePath, artifactRoot, firstCalls: () => firstCalls };
}
