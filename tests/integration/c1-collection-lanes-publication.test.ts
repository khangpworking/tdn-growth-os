import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { createMetaAutoSource } from '../../src/modules/analysis/research-automation/meta-auto-lane.js';
import { createTikTokTopAdsSource } from '../../src/modules/analysis/research-automation/tiktok-top-ads-lane.js';
import { VideoWatchLane } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import type { MetricOpenCliProcessRunner } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00Z');

// Real lane parsers retain these synthetic logged-out reads; no child process or network call runs.
function browserOptions() {
  let url = '', elapsed = 0;
  const runner: MetricOpenCliProcessRunner = async (_executable, argv) => {
    const args = argv.slice(2, -2);
    let stdout = '';
    if (args[0] === 'open') url = args[1]!;
    else if (args[0] === 'get') stdout = args[1] === 'url' ? url : '<html></html>';
    else if (args[0] === 'extract') stdout = JSON.stringify({ url, content: 'Synthetic retained read', next_start_char: null });
    return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout, stderr: '' }) };
  };
  return { createRunner: () => runner, now, env: { PATH: '/usr/bin' },
    clock: { monotonicMs: () => elapsed, sleep: async (ms: number) => { elapsed += ms; } } };
}

test('service publishes Meta then TikTok after video and before usage, unless the owner cancels during video', async t => {
  for (const cancel of [false, true]) await t.test(cancel ? 'CANCELLING refuses both attachments' : 'active run preserves publication order', async t => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-c1-publication-'));
    const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
    t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
    const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
    const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
    await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'c1-publication', title: 'Synthetic publication lifecycle' });
    // Observe actual durable writes, without replacing the package writer or the service's state guard.
    db.exec(`CREATE TEMP TABLE publication_events (event TEXT NOT NULL);
      CREATE TEMP TRIGGER record_attachment AFTER UPDATE OF finalized_at ON main.foundation_source_packages
      WHEN OLD.finalized_at IS NULL AND NEW.finalized_at IS NOT NULL
      BEGIN INSERT INTO publication_events VALUES (CASE
        WHEN NEW.package_key GLOB 'automation-meta-auto:*' THEN 'meta'
        WHEN NEW.package_key GLOB 'automation-tiktok-top-ads:*' THEN 'tiktok'
        ELSE NEW.package_key END); END;
      CREATE TEMP TRIGGER record_usage AFTER INSERT ON main.analysis_research_automation_usage
      WHEN NEW.step_id='COLLECTION'
      BEGIN INSERT INTO publication_events VALUES ('usage:' || NEW.ordinal); END;`);
    const video = new VideoWatchLane({ media: { mediaDir: path.join(root, 'media'), ytdlpBin: 'unused', ffprobeBin: 'unused' }, model: null, now });
    const meta = createMetaAutoSource(browserOptions());
    const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
      workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source: syntheticProductSource(), videoWatch: video,
      metaAutoSource: { collect: (_input, options) => meta.collect({ brands: [{ label: 'Synthetic', key: 'synthetic' }] }, options) },
      tiktokTopAdsSource: createTikTokTopAdsSource(browserOptions()),
    });
    // The public video source boundary returns an ambiguous failure; its usage must still follow publication.
    video.run = async () => {
      db.prepare('INSERT INTO publication_events VALUES (?)').run('video');
      if (cancel) {
        const current = await service.getRun(workspaceId, runId);
        const receipt = await service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1',
          requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: current.revision });
        assert.equal(receipt.run.status, 'CANCELLING');
      }
      throw new Error('Synthetic ambiguous video failure');
    };
    await service.start(workspaceId, { contractVersion: 'research-automation-start-v1',
      requestKey: '33333333-3333-4333-8333-333333333333', mode: 'CATEGORY', keyword: 'synthetic product',
      requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    await service.processNext();
    await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1',
      requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: (await service.getRun(workspaceId, runId)).revision,
      definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
    await service.processNext();
    const events = db.prepare('SELECT event FROM publication_events ORDER BY rowid').all().map(row => (row as { event: string }).event);
    assert.deepEqual(events, ['video', ...(cancel ? [] : ['meta', 'tiktok']), 'usage:0', 'usage:8', 'usage:12', 'usage:13']);
    const stored = db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { sha: string };
    const document = JSON.parse((await artifacts.read(stored.sha)).toString()) as StepResultDocument;
    assert.equal(Boolean(document.metaAuto?.evidence), !cancel);
    assert.equal(Boolean(document.tiktokTopAds?.evidence), !cancel);
    if (cancel) assert.equal((await service.getRun(workspaceId, runId)).status, 'CANCELLED');
  });
});
