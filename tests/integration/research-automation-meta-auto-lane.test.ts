import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { createMetaAutoSource, META_AUTO_TABLE_TITLE, metaBrandKey, metaAutoReportView, metaPageUrl, metaSearchUrl, verifyMetaAutoEvidence, type MetaAutoSource } from '../../src/modules/analysis/research-automation/meta-auto-lane.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import type { MetricOpenCliProcessRunner } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

// Synthetic pages only. The fake runner never starts a process and nothing leaves the machine.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-17T03:00:00.000Z');
const brand = (label: string) => ({ label, key: metaBrandKey(label) });
const BRANDS = [brand('Thương hiệu Mẫu A'), brand('Thương hiệu Mẫu B')];

const searchHtml = (id: string, name: string) => `<html><body><a href="/ads/library/?view_all_page_id=${id}&country=VN">${name}</a><script>{"page_name":"${name}"}</script></body></html>`;
const pageText = (ids: readonly string[]) => `~${ids.length} results\n${ids.map(id => `Active\nLibrary ID: ${id}\nStarted running on 1 Mar 2026\nPlatforms\n`).join('\n')}`;
const PAGES = new Map<string, { html: string; text: string }>([
  [metaSearchUrl(BRANDS[0]!.label), { html: searchHtml('111', BRANDS[0]!.label), text: 'Kết quả' }],
  [metaPageUrl('111'), { html: '<html></html>', text: pageText(['5000000001', '5000000002']) }],
  [metaSearchUrl(BRANDS[1]!.label), { html: searchHtml('222', BRANDS[1]!.label), text: 'Kết quả' }],
  [metaPageUrl('222'), { html: '<html></html>', text: pageText(['5000000003']) }],
]);

function fakeLane(calls: string[][], supplyFixtureBrands: boolean): MetaAutoSource {
  let current: { html: string; text: string } | null = null, currentUrl = '';
  let t = 1_000_000;
  const runner: MetricOpenCliProcessRunner = async (_executable, argv) => {
    calls.push([...argv]);
    const args = argv.slice(2, -2);
    let stdout = '';
    if (args[0] === 'open') { currentUrl = args[1]!; current = PAGES.get(currentUrl) ?? { html: '<html></html>', text: '' }; }
    else if (args[0] === 'get' && args[1] === 'url') stdout = currentUrl;
    else if (args[0] === 'get' && args[1] === 'html') stdout = current?.html ?? '';
    else if (args[0] === 'extract') {
      const start = Number(args[2]); const text = current?.text ?? '';
      stdout = JSON.stringify({ url: currentUrl, content: text.slice(start, start + 200), next_start_char: start + 200 < text.length ? start + 200 : null });
    }
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout, stderr: '' }) };
  };
  const lane = createMetaAutoSource({ createRunner: () => runner, clock: { monotonicMs: () => t, sleep: async ms => { t += ms; } }, now, env: { PATH: '/usr/bin' } });
  // Evidence tests inject synthetic pick brands; the no-pick test exercises the actual service input.
  return { collect: (input, options) => lane.collect(supplyFixtureBrands ? { brands: BRANDS } : input, options) };
}

async function runToDraft(t: TestContext, on: boolean, supplyFixtureBrands = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-meta-auto-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'meta-auto', title: 'Synthetic meta-auto run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const calls: string[][] = [];
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(),
    sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'v1' }, ...(on ? { metaAutoSource: fakeLane(calls, supplyFixtureBrands) } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic insulated container', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const step = db.prepare(`SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { sha: string };
  const document = JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument;
  const usage = db.prepare(`SELECT ordinal, provider, request_count n FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(row => { const v = row as { ordinal: bigint | number; provider: string; n: bigint | number }; return [Number(v.ordinal), v.provider, Number(v.n)] as const; });
  const html = (await service.readReport(workspaceId, runId, 'MARKET')).bytes.toString();
  const activity = await service.readSourceActivity(workspaceId);
  return { document, usage, html, doc: new JSDOM(html).window.document, calls, activity, db, artifacts };
}

test('flag off: no metaAuto field, no usage 12, no auto table, no call', async t => {
  const off = await runToDraft(t, false);
  assert.equal('metaAuto' in off.document, false);
  assert.equal(off.usage.some(([ordinal]) => ordinal === 12), false);
  assert.equal(off.html.includes(META_AUTO_TABLE_TITLE), false);
  assert.equal(off.calls.length, 0);
  assert.equal(off.activity['meta-ad-library'].lastUsageAt, null);
});

test('without an auto-run pick record COLLECTION has no brands: NO_BRANDS and no browser call', async t => {
  const on = await runToDraft(t, true, false);
  assert.equal(on.document.metaAuto?.status, 'NO_BRANDS');
  assert.deepEqual(on.document.metaAuto?.brands, []);
  assert.equal(on.calls.length, 0);
  assert.equal(on.usage.some(([ordinal]) => ordinal === 12), false);
});

test('flag on: the step stores the read, usage 12 counts opens, and the stored evidence re-verifies offline', async t => {
  const on = await runToDraft(t, true);
  const meta = on.document.metaAuto;
  assert.ok(meta);
  assert.equal(meta.status, 'OK');
  assert.deepEqual(meta.brands.map(b => b.status), ['OK', 'OK']);
  assert.deepEqual(meta.brands.map(b => b.ads.length), [2, 1]);
  assert.ok(meta.evidence, 'evidence package published');
  assert.equal(on.calls.filter(c => c[2] === 'open').length, 4);
  assert.deepEqual(on.usage.filter(([ordinal]) => ordinal === 12), [[12, 'meta-ad-library', 4]]);
  assert.equal(on.activity['meta-ad-library'].lastUsageAt, now().toISOString());
  const reader = new FoundationSourcePackageReader(new SourcePackageService({ db: on.db, artifactStore: on.artifacts }));
  assert.equal(await verifyMetaAutoEvidence(reader, meta, runId), true);
  assert.equal(await verifyMetaAutoEvidence(reader, meta, '55555555-5555-4555-8555-555555555555'), false, 'evidence is bound to its run');
  const tampered = { ...meta, brands: meta.brands.map((b, i) => i === 0 ? { ...b, ads: b.ads.slice(1) } : b) };
  assert.equal(await verifyMetaAutoEvidence(reader, tampered, runId), false, 'a changed step copy fails the replay');
  const view = metaAutoReportView(meta, true);
  assert.deepEqual(view?.rows.map(row => [row.label, row.ok, row.adCount]), [['Thương hiệu Mẫu A', true, 2], ['Thương hiệu Mẫu B', true, 1]]);
  // Market 7.2 lives in the reader report (as the owner rows do); the draft renderer stays unchanged.
  assert.equal(on.html.includes(META_AUTO_TABLE_TITLE), false);
  assert.equal(on.html.includes('tdnmeta'), false);
  assert.deepEqual(providerNameViolations(on.html), []);
  assert.deepEqual(visibleTextViolations(reportVisibleText(on.doc)), []);
});
