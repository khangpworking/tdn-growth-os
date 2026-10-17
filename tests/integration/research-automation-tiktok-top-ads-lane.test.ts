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
import { createTikTokTopAdsSource, tiktokTopAdsReportView, tiktokTopAdsUrl, verifyTikTokTopAdsEvidence, TIKTOK_TOP_ADS_TABLE_TITLE, type TikTokTopAdsSource } from '../../src/modules/analysis/research-automation/tiktok-top-ads-lane.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import type { MetricOpenCliProcessRunner } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

// Synthetic pages only. The fake runner never starts a process and nothing leaves the machine.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-17T03:00:00.000Z');
const KEYWORD = 'synthetic insulated container';
const card = (caption: string, brand: string) => `Ad caption: ${caption}\nBrand: ${brand}\nIndustry: Đồ gia dụng\nObjective: Lượt xem video\nLikes: 1,2K\nCTR: 3%\n`;
const PAGES = new Map<string, string>([[tiktokTopAdsUrl(KEYWORD), [card('Synthetic insulated container mẫu A', 'Thương hiệu Mẫu A'),
  card('Synthetic insulated container mẫu B', 'Thương hiệu Mẫu B'), card('Son môi mẫu C', 'Thương hiệu Mẫu C')].join('\n')]]);

function fakeLane(calls: string[][]): TikTokTopAdsSource {
  let text = '', currentUrl = '';
  let t = 1_000_000;
  const runner: MetricOpenCliProcessRunner = async (_executable, argv) => {
    calls.push([...argv]);
    const args = argv.slice(2, -2);
    let stdout = '';
    if (args[0] === 'open') { currentUrl = args[1]!; text = PAGES.get(currentUrl) ?? ''; }
    else if (args[0] === 'get' && args[1] === 'url') stdout = currentUrl;
    else if (args[0] === 'get' && args[1] === 'html') stdout = '<html></html>';
    else if (args[0] === 'extract') {
      const start = Number(args[2]);
      stdout = JSON.stringify({ url: currentUrl, content: text.slice(start, start + 200), next_start_char: start + 200 < text.length ? start + 200 : null });
    }
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout, stderr: '' }) };
  };
  return createTikTokTopAdsSource({ createRunner: () => runner, clock: { monotonicMs: () => t, sleep: async ms => { t += ms; } }, now, env: { PATH: '/usr/bin' } });
}

async function runToDraft(t: TestContext, on: boolean) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-tiktok-top-ads-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'tiktok-top-ads', title: 'Synthetic TikTok top-ads run' });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const calls: string[][] = [];
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: (input, kind) => buildResearchAutomationReport(input, kind), source: syntheticProductSource(),
    sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'v1' }, ...(on ? { tiktokTopAdsSource: fakeLane(calls) } : {}) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: KEYWORD, requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
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

test('flag off: no tiktokTopAds field, no usage 13, no table, no call, and the draft bytes match a run without the lane', async t => {
  const off = await runToDraft(t, false);
  assert.equal('tiktokTopAds' in off.document, false);
  assert.equal(off.usage.some(([ordinal]) => ordinal === 13), false);
  assert.equal(off.html.includes(TIKTOK_TOP_ADS_TABLE_TITLE), false);
  assert.equal(off.calls.length, 0);
  assert.equal(off.activity['tiktok-top-ads'].lastUsageAt, null);
  const again = await runToDraft(t, false);
  assert.equal(again.html, off.html, 'the plain draft is stable byte for byte');
  const on = await runToDraft(t, true);
  assert.equal(on.html, off.html, 'the draft renderer is unchanged by the lane (table 7.4 lives in the reader report)');
});

test('flag on: the step stores the read, usage 13 counts opens, and the stored evidence re-verifies offline', async t => {
  const on = await runToDraft(t, true);
  const read = on.document.tiktokTopAds;
  assert.ok(read);
  assert.equal(read.status, 'OK');
  assert.equal(read.keyword, KEYWORD);
  assert.deepEqual(read.cards.map(c => c.caption.text), ['Synthetic insulated container mẫu A', 'Synthetic insulated container mẫu B']);
  assert.equal(read.droppedCards, 1);
  assert.ok(read.evidence, 'evidence package published');
  assert.equal(on.calls.filter(c => c[2] === 'open').length, 1);
  assert.deepEqual(on.usage.filter(([ordinal]) => ordinal === 13), [[13, 'tiktok-top-ads', 1]]);
  assert.equal(on.activity['tiktok-top-ads'].lastUsageAt, now().toISOString());
  const reader = new FoundationSourcePackageReader(new SourcePackageService({ db: on.db, artifactStore: on.artifacts }));
  assert.equal(await verifyTikTokTopAdsEvidence(reader, read, runId), true);
  assert.equal(await verifyTikTokTopAdsEvidence(reader, read, '55555555-5555-4555-8555-555555555555'), false, 'evidence is bound to its run');
  const tampered = { ...read, cards: read.cards.slice(1) };
  assert.equal(await verifyTikTokTopAdsEvidence(reader, tampered, runId), false, 'a changed step copy fails the replay');
  const view = tiktokTopAdsReportView(read, true);
  assert.deepEqual(view?.rows.map(row => [row.caption, row.account, row.likes]), [
    ['Synthetic insulated container mẫu A', 'Thương hiệu Mẫu A', '1,2K'], ['Synthetic insulated container mẫu B', 'Thương hiệu Mẫu B', '1,2K']]);
  assert.equal(on.html.includes(TIKTOK_TOP_ADS_TABLE_TITLE), false);
  assert.equal(on.html.includes('tdntiktok'), false);
  assert.deepEqual(providerNameViolations(on.html), []);
  assert.deepEqual(visibleTextViolations(reportVisibleText(on.doc)), []);
});
