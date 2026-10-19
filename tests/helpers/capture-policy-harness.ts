import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { validateMetricWebSnapshot } from '../../src/modules/analysis/research-automation/metric-web-snapshot.js';

// Entirely synthetic, with no configured provider, capture runner, browser or HTTP server.
export const policyWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const policyRunId = '22222222-2222-4222-8222-222222222222';
export const policyNow = () => new Date('2026-02-01T00:00:00.000Z');
export const policyHash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

export function policyArchive(suffix = '') {
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8')) as AutomationMetricWebSnapshotV1;
  snapshot.captureId = `capture-policy-synthetic${suffix ? '-second' : ''}`;
  const period = { startDate: '2026-01-01', endDate: '2026-01-29' };
  snapshot.scope = { keywords: ['quạt điện'], platforms: ['shopee'], period, category: null, ticks: [], advancedFilters: [], exclusions: [] };
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_CAPTURED' };
  const titles = ['Quạt điện mẫu A lắc đầu', 'Trục quạt điện mẫu thử', 'Chiết áp mẫu thử quạt điện', 'Motor quạt điện mẫu thử',
    'Quạt điện mẫu B xoay đầu', 'Quạt điện mẫu C để đầu giường', 'Quạt điện mẫu D', 'Quạt điện mẫu E'];
  snapshot.groups.W12_topProducts = { columns: ['name', 'shop', 'platform', 'revenue', 'units'], rows: titles.map((title, i) => {
    const revenue = i === 6 ? 999999 : 1000, units = i === 7 ? 0 : i === 6 ? 1 : 10;
    return { cells: {
      name: { label: 'Tên', text: title + suffix, sourcePointer: `p[${i}].name` },
      shop: { label: 'Shop', text: `Gian hàng mẫu ${String.fromCharCode(65 + i)}`, sourcePointer: `p[${i}].shop` },
      platform: { label: 'Sàn', text: 'shopee', sourcePointer: `p[${i}].platform` },
      revenue: { label: 'Doanh thu', displayed: String(revenue), value: revenue, unit: 'VND', precision: 'exact', platform: 'shopee', period, sourcePointer: `p[${i}].revenue` },
      units: { label: 'Lượt bán', displayed: String(units), value: units, unit: 'COUNT', precision: 'exact', platform: 'shopee', period, sourcePointer: `p[${i}].units` },
    } };
  }) };
  validateMetricWebSnapshot(snapshot);
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = { contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: snapshot.scope, resultCount: titles.length,
    productPagination: { cap: titles.length, totalShown: titles.length, pageSize: titles.length, pagesRead: 1, rowsRead: titles.length, truncated: false },
    views: [], sourceMap: {}, files: [{ path: 'snapshot.json', sha256: policyHash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }],
    screenshotSkips: [], archive: { rawResponses: 'raw/', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: [] }, noReportFileRequested: true,
    captureGate: { cleared: true } };
  return { snapshot, snapshotBytes, manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}

export async function policyRun(t: Pick<TestContext, 'after'>, decision: 'USE_PREPARED' | 'SKIPPED' = 'USE_PREPARED', secondCapture = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-policy-test-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now: policyNow }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => policyWorkspaceId, now: policyNow });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'capture-policy-test', title: 'Synthetic capture policy' });
  const workspaces = new FlowDiscoveryWorkspaceReader(discovery);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: workspaces,
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => policyRunId, now: policyNow, readerReportFlint: false });
  await service.start(policyWorkspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'quạt điện',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const prepare = async (suffix: string) => {
    const archive = policyArchive(suffix);
    const receipt = await service.prepareMetricCapture(policyWorkspaceId, policyRunId, { contractVersion: 'automation-metric-capture-prepare-v1', requestKey: randomUUID(),
      expectedRevision: (await service.getRun(policyWorkspaceId, policyRunId)).revision, sourceContext: 'Synthetic capture row policy fixture' }, archive.snapshotBytes, archive.manifestBytes);
    return { ...archive, packageId: receipt.packageId };
  };
  const first = await prepare('');
  const second = secondCapture ? await prepare(' mẫu khác') : undefined;
  await service.confirmScope(policyWorkspaceId, policyRunId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(policyWorkspaceId, policyRunId)).revision, definition: 'Synthetic fan sample', includeTerms: ['quạt điện'], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], sources: { metric: decision === 'USE_PREPARED' ? { decision, packageId: first.packageId } : { decision }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 20 && await service.processNext(); i++);
  assert.equal((await service.getRun(policyWorkspaceId, policyRunId)).status, 'DRAFT_READY');
  return { db, artifacts, service, workspaces, first, second };
}
