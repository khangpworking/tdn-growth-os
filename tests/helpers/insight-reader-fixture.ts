import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { seedNativeDamiPackage } from './native-dami-package-fixture.js';
import { syntheticProductSource } from './research-synthetic-sources.js';

export const readerWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const readerRunId = '22222222-2222-4222-8222-222222222222';
export const readerOwner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
export const readerNow = () => new Date('2026-10-08T00:00:00.000Z');

/** Actual source intake/run/literal revision, fake transport only, no Metric file. */
export async function insightReaderFixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-insight-reader-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now: readerNow }).db;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => readerWorkspaceId, now: readerNow });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'insight-reader-synthetic', title: 'Synthetic Insight reader' });
  const text = 'Tôi đã dùng sản phẩm. Tôi đặt hàng trước, rồi nhận hàng sau.';
  const rows = [{ id: '1', text, star: 5 }, { id: '2', text, star: 1 }, { id: '3', text: '', star: 4 },
    { id: '4', text: 'Nguồn thiếu sao', star: null }, { id: '5', text: null, star: 2 }];
  await seedNativeDamiPackage(new SourcePackageService({ db, artifactStore: artifacts, now: readerNow }), { rawRows: rows.map(row => ({
    type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: row.id, comment: row.text, rating_star: row.star })) });
  let input: AutomationReportInput | undefined, calls = 0;
  const source = syntheticProductSource();
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => readerRunId,
    now: readerNow, readerReportFlint: false, source: { ...source,
      quickSearch: async (...args) => { calls++; return source.quickSearch(...args); },
      collect: async (...args) => { calls++; return source.collect(...args); } },
    renderer: (value, kind) => { input = value; return buildResearchAutomationReport(value, kind); } });
  await service.start(readerWorkspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT', keyword: 'Synthetic Insight reader',
    requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(readerWorkspaceId, readerRunId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(readerWorkspaceId, readerRunId)).revision,
    definition: 'Synthetic native listing only', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] });
  await service.processNext(); await service.processNext();
  assert.equal((await service.getRun(readerWorkspaceId, readerRunId)).status, 'DRAFT_READY');
  const original = (await service.listReportVersions(readerWorkspaceId, readerRunId))[0]!;
  const revision = await service.requestReportRevision(readerWorkspaceId, readerRunId, {
    contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: original.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } });
  await service.processNext();
  const attempt = (await service.listReportAttempts(readerWorkspaceId, readerRunId)).find(row => row.attemptId === revision.attemptId)!;
  assert.equal(attempt.state, 'COMMITTED'); assert.ok(attempt.pairId); assert.ok(input);
  const pair = (await service.listReportVersions(readerWorkspaceId, readerRunId)).find(row => row.pairId === attempt.pairId)!;
  const report = await service.readReport(readerWorkspaceId, readerRunId, 'INSIGHT', false, pair.pairId);
  const semantic = JSON.parse((await artifacts.read(report.versionId)).toString('utf8')) as Record<string, unknown>;
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v19');
  assert.ok(input.insightLiteral); assert.ok(input.nativeReview);
  return { root, db, artifacts, service, databasePath, artifactRoot, input, pair, report, semantic, calls: () => calls };
}
