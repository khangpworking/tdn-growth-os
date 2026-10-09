import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { inspectMetricWorkbookProfile } from '../../src/modules/analysis/metric-source-profile.js';
import { AutomationMetricMethodBridge, type MetricRunInput } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';

export const coverageWorkspaceId = '11111111-1111-4111-8111-111111111111';
export const coverageRunId = '22222222-2222-4222-8222-222222222222';
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown) => Buffer.from(canonicalJson(value));
const now = () => new Date('2026-10-09T00:00:00.000Z');

export async function metricCoverageFixture(t: TestContext, profile: 'v1' | 'v2' = 'v2', brand: string | null = '  Nhãn nguồn Đỏ  ') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-coverage-metric-'));
  const db = openDatabase({ databasePath: path.join(root, 'synthetic.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => coverageWorkspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'coverage-source', title: 'Synthetic coverage source boundary' });
  const workspaces = new FlowDiscoveryWorkspaceReader(discovery);
  const input: MetricRunInput = { runId: coverageRunId, scopeConfirmedAt: '2026-10-08T00:30:00.000Z',
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId: coverageWorkspaceId, country: 'VN', mode: 'PRODUCT',
      keyword: 'Synthetic product', description: null, interview: null, requestedPeriod: { startDate: '2026-08-17', endDate: '2026-09-15', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId: coverageWorkspaceId, runId: coverageRunId,
      definition: 'Synthetic declared export, not authenticated measurement dates', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] } };
  const brandCell = profile === 'v1' ? 'G2' : 'F2';
  const run = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile,
    cells: { [brandCell]: brand === null ? null : { type: 's', value: brand } } }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr.toString());
  const workbook = run.stdout, inspection = inspectMetricWorkbookProfile(workbook);
  const manifest = json({ contractVersion: '1.0.0', ...inspection,
    source: { sha256: hash(workbook), label: 'Synthetic operator export', provenanceBasis: 'Synthetic source bytes; declared period unverified',
      evidenceFamily: 'synthetic-metric', sheetName: 'Sheet1', headerSha256: inspection.headerSha256, lastRow: inspection.lastRow },
    scope: { key: 'synthetic-declared-scope', platform: 'shopee', selection: 'UNSPECIFIED', start: '2026-08-17', end: '2026-09-15',
      periodBasis: 'Unverified operator declaration', acquiredAt: null }, precision: { revenue: 'unknown', units: 'unknown' },
    labelCodebookVersion: 'unassigned-v1', wideUnknownPolicy: 'exclude' });
  // Only the manifest's source carries header/row evidence; profile fields remain canonical.
  const parsed = JSON.parse(manifest.toString()); delete parsed.headerSha256; delete parsed.lastRow;
  const descriptor = json({ contractVersion: 'automation-metric-source-v1', runId: coverageRunId, workspaceId: coverageWorkspaceId,
    runBindingSha256: hash(json(input)), keyword: input.start.keyword, workbookPath: 'metric/export.xlsx', manifestPath: 'metric/manifest.json',
    labelsPath: null, sourceContextPath: 'metric/context.txt' });
  const files = new Map([['metric/export.xlsx', workbook], ['metric/manifest.json', json(parsed)],
    ['metric/context.txt', Buffer.from('Synthetic operator keyword; no authenticated measurement witness.\n')],
    ['normalized/automation-metric-source.json', descriptor]]);
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  await packages.intake({ contractVersion: '1.0.0', packageKey: `automation-metric-source:${coverageRunId}`, version: 1,
    sourceLabel: 'Synthetic operator export', sourceAcquiredAt: null,
    files: [...files].map(([name, bytes]) => ({ path: name, sha256: hash(bytes), byteSize: bytes.length,
      mediaType: name.endsWith('.xlsx') ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : name.endsWith('.txt') ? 'text/plain' : 'application/json',
      representationRole: name.endsWith('.xlsx') ? 'structured' as const : 'derived' as const, evidenceFamily: 'synthetic-metric',
      independence: 'non_independent' as const, providerProvenance: 'operator_supplied_unverified' as const, provenanceBasis: 'Synthetic fixture only' })) }, files);
  const bridge = new AutomationMetricMethodBridge({ db, artifactStore: artifacts, workspaces, now });
  const snapshot = await bridge.execute(input); assert.ok(snapshot);
  return { root, db, artifacts, reader: new FoundationSourcePackageReader(packages), bridge, input, snapshot, workbook, brandCell };
}
