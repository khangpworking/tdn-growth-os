import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/index.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import {
  createKalodataReplayTransport, KALODATA_REPLAY_NOTICE_VI, KALODATA_REPLAY_PLACEHOLDER_KEY, KalodataReplayScopeMismatchError,
  loadKalodataReplayIndex, readKalodataReplaySource,
} from '../../src/modules/analysis/research-automation/kalodata-replay.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type BetterSqlite3 from 'better-sqlite3';

// Synthetic documentation values only: no real product ids, keys, hosts or paths.
const sourceWorkspace = '11111111-1111-4111-8111-111111111111';
const replayWorkspace = '11111111-1111-4111-8111-111111111112';
const sourceRunId = '22222222-2222-4222-8222-222222222222';
const replayRunId = '22222222-2222-4222-8222-222222222223';
const period = { startDate: '2026-07-01', endDate: '2026-08-29' } as const;
const sourceNow = () => new Date('2026-10-02T00:00:00.000Z');
// A later clock: the quick-search window differs from the stored one, so the remap path is exercised.
const replayNow = () => new Date('2026-10-09T00:00:00.000Z');

interface Counts { balance: number; rank: number; detail: number; other: number }

function fakeKalodata(counts: Counts, now: () => Date): ProviderTransport {
  return {
    now: () => now().getTime(),
    sleep: async () => {},
    fetch: (async (input, init) => {
      const url = new URL(String(input));
      let payload: unknown;
      if (url.pathname.endsWith('/credit/balance')) { counts.balance += 1; payload = { success: true, data: { totalRemain: 100 } }; }
      else if (url.pathname.endsWith('/product/rank')) {
        counts.rank += 1;
        payload = { success: true, data: [{ product_id: '101', product_name: 'Synthetic thermos', unit_price: 120000 }] };
      } else if (url.pathname.endsWith('/product/detail')) {
        counts.detail += 1;
        const body = JSON.parse(String(init?.body)) as { product_id: string; date_range: string };
        payload = { success: true, data: { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
          product_name: 'Synthetic thermos', revenue: 1000, sales_volumn: 7, unit_price: 120000 } };
      } else { counts.other += 1; throw new Error(`Unexpected fixture endpoint: ${url.pathname}`); }
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  };
}

async function runMarket(db: BetterSqlite3.Database, artifacts: ContentAddressedArtifactStore, options: {
  workspaceId: string; runId: string; now: () => Date; transport: ProviderTransport; key: string;
  replay?: ReturnType<typeof readKalodataReplaySource>; keyword?: string; selected?: string; renderer?: boolean;
}) {
  const provider = createResearchAutomationProviderRegistry({ kalodataSecretKey: options.key, serpApiKey: null, apifyTokenConfigured: false }, options.transport).get('KALODATA');
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => options.workspaceId, now: options.now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: `replay-${options.workspaceId.slice(-4)}`, title: 'Synthetic replay' });
  let nextUuid = 0;
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    source: bindResearchAutomationProvider(provider), now: options.now, ...(options.replay ? { kalodataReplay: options.replay } : {}),
    // Same shape as the API renderer: the report builder output, no PDF configured.
    ...(options.renderer ? { renderer: async (input: Parameters<typeof buildResearchAutomationReport>[0], kind: 'MARKET' | 'INSIGHT') => ({ ...buildResearchAutomationReport(input, kind), pdfUnavailableCode: 'PDF_RENDERER_NOT_CONFIGURED' as const }) } : {}),
    uuid: () => nextUuid++ === 0 ? options.runId : `99999999-9999-4999-8999-${options.runId.slice(-4)}${String(nextUuid).padStart(8, '0')}`,
  });
  const drain = async () => { for (let step = 0; step < 40 && await service.processNext(); step += 1) { /* drain */ } };
  await service.start(options.workspaceId, {
    contractVersion: 'research-automation-start-v1', requestKey: `33333333-3333-4333-8333-33333333${options.runId.slice(-4)}`,
    mode: 'PRODUCT', keyword: options.keyword ?? 'thermos', requestedPeriod: period, reports: ['MARKET'],
  });
  await drain();
  const awaiting = await service.getRun(options.workspaceId, options.runId);
  await service.confirmScope(options.workspaceId, options.runId, {
    contractVersion: 'research-automation-confirm-v1', requestKey: `44444444-4444-4444-8444-44444444${options.runId.slice(-4)}`,
    expectedRevision: awaiting.revision, definition: 'Vietnam thermos source observations',
    includeTerms: ['thermos'], excludeTerms: [], selectedProductIds: [options.selected ?? 'kalodata:101'], peerProductIds: [],
  });
  await drain();
  return { service, run: await service.getRun(options.workspaceId, options.runId) };
}

async function fixture(t: TestContext, renderer = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-kalodata-replay-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now: sourceNow }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const live: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const source = await runMarket(db, artifacts, { workspaceId: sourceWorkspace, runId: sourceRunId, now: sourceNow, transport: fakeKalodata(live, sourceNow), key: 'synthetic-secret', renderer });
  return { db, artifacts, live, source };
}

const outputHtml = async (db: BetterSqlite3.Database, artifacts: ContentAddressedArtifactStore, runId: string) => {
  const row = db.prepare(`SELECT html_sha256 sha FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind='MARKET'`).get(runId) as { sha: string } | undefined;
  return row ? (await artifacts.read(row.sha)).toString('utf8') : undefined;
};
const usage = (db: BetterSqlite3.Database, runId: string) => db.prepare(`SELECT step_id stepId, provider, operation, request_count n, cost_state state, cost_unit unit, cost_amount amount
  FROM analysis_research_automation_usage WHERE run_id=? ORDER BY step_id, ordinal`).all(runId) as { stepId: string; provider: string; operation: string; n: bigint; state: string; unit: string | null; amount: string | null }[];
const captureShas = (db: BetterSqlite3.Database, runId: string) => (db.prepare(`SELECT artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND provider='kalodata'`)
  .all(runId) as { sha: string }[]).map(row => row.sha);

test('a Market run replays every sales-data request from the source run with zero live calls', async t => {
  const { db, artifacts, live, source } = await fixture(t);
  assert.ok(live.rank > 0 && live.detail > 0, 'the source run made live (fake) calls');
  const sourceHtml = await outputHtml(db, artifacts, sourceRunId);
  assert.ok(sourceHtml, `source run produced a Market draft (${source.run.status})`);
  assert.ok(!sourceHtml.includes(KALODATA_REPLAY_NOTICE_VI), 'flag off: no test notice');

  const replay = readKalodataReplaySource(db, sourceRunId);
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const transport = createKalodataReplayTransport(fakeKalodata(inner, replayNow), () => loadKalodataReplayIndex(db, artifacts, sourceRunId));
  const result = await runMarket(db, artifacts, { workspaceId: replayWorkspace, runId: replayRunId, now: replayNow, transport, key: KALODATA_REPLAY_PLACEHOLDER_KEY, replay });

  assert.deepEqual(inner, { balance: 0, rank: 0, detail: 0, other: 0 }, 'no request reached the live transport');
  assert.equal(transport.stats.missed, 0);
  assert.ok(transport.stats.replayed > 0);
  assert.equal(result.run.status, source.run.status, 'the replay run reaches the same state as the source run');

  const html = await outputHtml(db, artifacts, replayRunId);
  assert.ok(html, 'replay run produced a Market draft');
  assert.ok(html.includes(KALODATA_REPLAY_NOTICE_VI), 'visible test notice in the report HTML');
  const visible = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible, /\b(kalodata|metric|tradeint|dami|nvidia|jev)\b/i, 'report text names no data provider');

  const rows = usage(db, replayRunId).filter(row => row.provider === 'kalodata');
  assert.ok(rows.length > 0);
  for (const row of rows) assert.deepEqual([row.operation, row.state, row.unit, row.amount], ['provider.replay', 'KNOWN', 'CREDITS', '0']);
  assert.ok(usage(db, sourceRunId).every(row => row.operation !== 'provider.replay'), 'source run usage is unchanged');

  // Captures point at the replayed bytes: each replayed response sha is one the source run stored.
  const sourceResponseShas = new Set<string>();
  for (const sha of captureShas(db, sourceRunId)) sourceResponseShas.add((JSON.parse((await artifacts.read(sha)).toString('utf8')) as { responseSha256: string }).responseSha256);
  const replayShas = captureShas(db, replayRunId);
  assert.ok(replayShas.length > 0);
  for (const sha of replayShas) {
    const envelope = JSON.parse((await artifacts.read(sha)).toString('utf8')) as { responseSha256: string; requestParameters: unknown };
    assert.ok(sourceResponseShas.has(envelope.responseSha256), 'replayed response bytes equal a stored source response');
  }
});

test('a run with a different keyword is refused before any work', async t => {
  const { db, artifacts } = await fixture(t);
  const replay = readKalodataReplaySource(db, sourceRunId);
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const transport = createKalodataReplayTransport(fakeKalodata(inner, replayNow), () => loadKalodataReplayIndex(db, artifacts, sourceRunId));
  await assert.rejects(runMarket(db, artifacts, { workspaceId: replayWorkspace, runId: replayRunId, now: replayNow, transport, key: KALODATA_REPLAY_PLACEHOLDER_KEY, replay, keyword: 'blender' }),
    (error: unknown) => error instanceof KalodataReplayScopeMismatchError && error.code === 'KALODATA_REPLAY_SCOPE_MISMATCH');
  assert.equal(transport.stats.replayed + transport.stats.missed, 0);
});

test('a product with no stored answer fails closed with KALODATA_REPLAY_MISS and never reaches the live source', async t => {
  const { db, artifacts } = await fixture(t);
  const replay = readKalodataReplaySource(db, sourceRunId);
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  // Same scope but the stored index is emptied of detail answers: every collection detail call misses.
  const emptyDetail = createKalodataReplayTransport(fakeKalodata(inner, replayNow), async () => {
    const index = await loadKalodataReplayIndex(db, artifacts, sourceRunId);
    return { ...index, detail: new Map() };
  });
  const result = await runMarket(db, artifacts, { workspaceId: replayWorkspace, runId: replayRunId, now: replayNow, transport: emptyDetail, key: KALODATA_REPLAY_PLACEHOLDER_KEY, replay });
  assert.deepEqual(inner, { balance: 0, rank: 0, detail: 0, other: 0 }, 'misses never fall through to the live transport');
  assert.ok(emptyDetail.stats.missed > 0);
  const codes = result.run.steps.map(step => step.code);
  assert.ok(codes.includes('KALODATA_REPLAY_MISS'), JSON.stringify(result.run.steps.map(step => [step.stepId, step.state, step.code])));
  assert.notEqual(result.run.status, 'DRAFT_READY');
});

test('the report-builder renderer path (as the API wires it) also carries the notice; flag off it does not', async t => {
  const { db, artifacts } = await fixture(t, true);
  const sourceHtml = await outputHtml(db, artifacts, sourceRunId);
  assert.ok(sourceHtml && !sourceHtml.includes(KALODATA_REPLAY_NOTICE_VI));
  const replay = readKalodataReplaySource(db, sourceRunId);
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const transport = createKalodataReplayTransport(fakeKalodata(inner, replayNow), () => loadKalodataReplayIndex(db, artifacts, sourceRunId));
  await runMarket(db, artifacts, { workspaceId: replayWorkspace, runId: replayRunId, now: replayNow, transport, key: KALODATA_REPLAY_PLACEHOLDER_KEY, replay, renderer: true });
  assert.deepEqual(inner, { balance: 0, rank: 0, detail: 0, other: 0 });
  const html = await outputHtml(db, artifacts, replayRunId);
  assert.ok(html && html.includes(KALODATA_REPLAY_NOTICE_VI));
  assert.ok(sourceHtml.length + 1 < html.length, 'only the notice is added');
});

// Flag-off identity: these digests were produced by the same fixture on main e0754a3 (before this change).
const MAIN_E0754A3 = {
  fallbackHtmlSha256: 'de6bfa2bc1439e19ebf2b7df2d400883a378afab53f91f7014bdc89c585975f3', rendererHtmlSha256: 'f8d4c9df817e11238e4b7e39f4a6bba4762c6aafaddf269d9335b239ece0ee86', usage: 'fcb8b1c018c4684f0d28d3982be7ee2640acaec7f28dfe1fe16f0d0270e1541a', captures: '918b01c1fbd95b2c726f05b3e38c5acf1a89fc3f7c5ba3b3748e1070abaf9f39',
};
test('flag off: outputs and usage rows are byte-identical to main', async t => {
  const { createHash } = await import('node:crypto');
  const digest = (value: string) => createHash('sha256').update(value).digest('hex');
  const plain = await fixture(t);
  const rendered = await fixture(t, true);
  const fallbackHtml = await outputHtml(plain.db, plain.artifacts, sourceRunId);
  const rendererHtml = await outputHtml(rendered.db, rendered.artifacts, sourceRunId);
  const usageRows = JSON.stringify(usage(plain.db, sourceRunId), (_key, value: unknown) => typeof value === 'bigint' ? Number(value) : value);
  assert.equal(digest(fallbackHtml!), MAIN_E0754A3.fallbackHtmlSha256);
  assert.equal(digest(rendererHtml!), MAIN_E0754A3.rendererHtmlSha256);
  assert.equal(digest(usageRows), MAIN_E0754A3.usage);
  assert.equal(digest(captureShas(plain.db, sourceRunId).sort().join(',')), MAIN_E0754A3.captures);
});
