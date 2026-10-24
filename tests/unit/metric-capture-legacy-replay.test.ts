import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { AutomationMetricMethodBridge, type MetricRunInput } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import type { DiscoveryWorkspaceArtifact } from '../../contracts/flow/discovery-workspace-artifact.generated.js';

type StoredRow = Record<string, string | number | null>;

test('a synthetic stored pre-change capture verifies its v1 receipt and re-renders byte-identically', async t => {
  // Frozen on the base revision before the app-side splitter/filter was applied.
  // Retained schema/catalog bytes are embedded too, independent of future contract edits.
  const fixture = JSON.parse(await fs.readFile(new URL('../fixtures/metric-capture-legacy-v1.json', import.meta.url), 'utf8')) as {
    reportInput: AutomationReportInput; htmlSha256: string; workspace: DiscoveryWorkspaceArtifact;
    packages: StoredRow[]; files: StoredRow[]; origins: StoredRow[];
    artifacts: { metadata: StoredRow; text: string }[];
  };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'capture-legacy-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite') }).db;
  const artifactStore = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const insert = (table: string, row: StoredRow) => {
    const keys = Object.keys(row);
    db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  };
  for (const artifact of fixture.artifacts) {
    const bytes = Buffer.from(artifact.text);
    const stored = await artifactStore.put(bytes);
    assert.equal(stored.sha256, artifact.metadata.sha256);
    insert('artifact_manifests', artifact.metadata);
  }
  for (const row of fixture.packages) insert('foundation_source_packages', { ...row, finalized_at: null });
  for (const row of fixture.files) insert('foundation_source_package_files', row);
  for (const row of fixture.origins) insert('foundation_source_attachment_origins', row);
  for (const row of fixture.packages) db.prepare('UPDATE foundation_source_packages SET finalized_at=? WHERE package_id=?').run(row.finalized_at, row.package_id);
  const snapshot = fixture.reportInput.metricMethods!;
  const configFile = fixture.files.find(row => row.package_id === snapshot.sourcePackage.packageId && row.logical_path === 'methods/metric-run.json')!;
  const config = JSON.parse((await artifactStore.read(configFile.artifact_sha256 as string)).toString('utf8')) as { input: MetricRunInput };
  const bridge = new AutomationMetricMethodBridge({ db, artifactStore, workspaces: { readVerifiedWorkspace: async () => fixture.workspace }, now: () => new Date('2026-02-01T00:00:00.000Z') });
  const before = db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await bridge.verify(snapshot, config.input), snapshot);
  const { platformHeadlines: _headlines, ...oldCapture } = snapshot.capture!;
  assert.deepEqual(await bridge.verify({ ...snapshot, capture: oldCapture }, config.input), { ...snapshot, capture: oldCapture });
  assert.deepEqual(db.prepare('SELECT total_changes() n').get(), before, 'verification is read only');
  // fixture.htmlSha256 pins today's renderer on stored input; no production path compares a re-render with stored bytes.
  // c2 PR3 re-froze it: owner Q4 (R-L14): the M12 evidence inventory now writes the full proposal label sentence; that sentence is the only byte change.
  const rendered = buildResearchAutomationReport(fixture.reportInput, 'MARKET');
  assert.equal(createHash('sha256').update(rendered.html).digest('hex'), fixture.htmlSha256);
  assert.match(rendered.html.toString('utf8'), /reviews Total sold products/);
  assert.equal(snapshot.result.input.profileId, 'automation-metric-capture-v1');
});
