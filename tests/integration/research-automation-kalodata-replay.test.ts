import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
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
      if (url.hostname === 'serpapi.com') { counts.other += 1; payload = { organic_results: [] }; }
      else if (url.pathname.endsWith('/credit/balance')) { counts.balance += 1; payload = { success: true, data: { totalRemain: 100 } }; }
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
  replay?: ReturnType<typeof readKalodataReplaySource>; keyword?: string; selected?: string; renderer?: boolean; web?: boolean;
  requestedPeriod?: { readonly startDate: string; readonly endDate: string };
}) {
  const provider = createResearchAutomationProviderRegistry({ kalodataSecretKey: options.key, serpApiKey: null, apifyTokenConfigured: false }, options.transport).get('KALODATA');
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => options.workspaceId, now: options.now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: `replay-${options.workspaceId.slice(-4)}`, title: 'Synthetic replay' });
  let nextUuid = 0;
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    source: bindResearchAutomationProvider(provider), now: options.now, ...(options.replay ? { kalodataReplay: options.replay } : {}),
    ...(options.web ? { webSource: bindResearchAutomationProvider(createResearchAutomationProviderRegistry({ kalodataSecretKey: null,
      serpApiKey: 'synthetic-web-key', apifyTokenConfigured: false }, options.transport).get('SERPAPI')) } : {}),
    // Same shape as the API renderer: the report builder output, no PDF configured.
    ...(options.renderer ? { renderer: async (input: Parameters<typeof buildResearchAutomationReport>[0], kind: 'MARKET' | 'INSIGHT') => ({ ...buildResearchAutomationReport(input, kind), pdfUnavailableCode: 'PDF_RENDERER_NOT_CONFIGURED' as const }) } : {}),
    uuid: () => nextUuid++ === 0 ? options.runId : `99999999-9999-4999-8999-${options.runId.slice(-4)}${String(nextUuid).padStart(8, '0')}`,
  });
  const drain = async () => { for (let step = 0; step < 40 && await service.processNext(); step += 1) { /* drain */ } };
  await service.start(options.workspaceId, {
    contractVersion: 'research-automation-start-v1', requestKey: `33333333-3333-4333-8333-33333333${options.runId.slice(-4)}`,
    mode: 'PRODUCT', keyword: options.keyword ?? 'thermos', requestedPeriod: options.requestedPeriod ?? period, reports: ['MARKET'],
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

test('a period mismatch is refused before a run or provider work is created', async t => {
  const { db, artifacts } = await fixture(t);
  const replay = readKalodataReplaySource(db, sourceRunId);
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const transport = createKalodataReplayTransport(fakeKalodata(inner, replayNow), () => loadKalodataReplayIndex(db, artifacts, sourceRunId));
  await assert.rejects(runMarket(db, artifacts, { workspaceId: replayWorkspace, runId: replayRunId, now: replayNow, transport,
    key: KALODATA_REPLAY_PLACEHOLDER_KEY, replay, requestedPeriod: { ...period, endDate: '2026-08-28' } }), KalodataReplayScopeMismatchError);
  assert.equal(db.prepare('SELECT 1 FROM analysis_research_automation_runs WHERE run_id=?').get(replayRunId), undefined);
  assert.deepEqual(inner, { balance: 0, rank: 0, detail: 0, other: 0 });
  assert.equal(transport.stats.replayed + transport.stats.missed, 0);
});

test('replay labels only sales-data usage; web provider requests and cost state are preserved', async t => {
  const { db, artifacts } = await fixture(t);
  const replay = readKalodataReplaySource(db, sourceRunId);
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const transport = createKalodataReplayTransport(fakeKalodata(inner, replayNow), () => loadKalodataReplayIndex(db, artifacts, sourceRunId));
  await runMarket(db, artifacts, { workspaceId: replayWorkspace, runId: replayRunId, now: replayNow, transport,
    key: KALODATA_REPLAY_PLACEHOLDER_KEY, replay, web: true });
  assert.equal(inner.balance + inner.rank + inner.detail, 0);
  assert.ok(inner.other > 0, 'web requests still reach their transport');
  const rows = usage(db, replayRunId);
  const web = rows.filter(row => row.provider === 'serpapi');
  assert.ok(web.length > 0);
  for (const row of web) {
    assert.ok(row.n > 0n);
    assert.deepEqual([row.operation, row.state, row.unit, row.amount], ['provider.run', 'UNKNOWN', null, null]);
  }
  assert.ok(rows.filter(row => row.provider === 'kalodata').every(row => row.operation === 'provider.replay' && row.amount === '0'));
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
  assert.equal(html.split('data-test-replay="1"').length - 1, 1, 'exactly one visible notice');
  const visible = html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, ' ');
  assert.doesNotMatch(visible, /\b(kalodata|metric|tradeint|dami|nvidia|jev)\b/i, 'API renderer text names no provider');
});

// Flag-off identity: digests from main e0754a3 with the same fixed-UUID fixture.
// The original renderer golden was nondeterministic because package UUIDs were not fixed.
// c2 PR3 re-froze rendererHtmlSha256 only: owner Q4 (R-L14): the M12 evidence inventory now writes the full proposal label sentence; that sentence is the only byte change.
const MAIN_E0754A3 = {
  fallbackHtmlSha256: 'de6bfa2bc1439e19ebf2b7df2d400883a378afab53f91f7014bdc89c585975f3', rendererHtmlSha256: '4ed5fd382e9dd4fc214369eb4985e86c3586550fb136df9730da9f883b993eeb', usage: 'fcb8b1c018c4684f0d28d3982be7ee2640acaec7f28dfe1fe16f0d0270e1541a', captures: '918b01c1fbd95b2c726f05b3e38c5acf1a89fc3f7c5ba3b3748e1070abaf9f39',
};
test('flag off: outputs and usage rows are byte-identical to main', async t => {
  // SourcePackageService creates UUIDs outside the service fixture's injected uuid.
  // Freeze those too: claim IDs and their display order depend on package identity.
  let nextPackageUuid = 0;
  t.mock.method(crypto, 'randomUUID', () => `aaaaaaaa-aaaa-4aaa-8aaa-${String(++nextPackageUuid).padStart(12, '0')}`);
  syncBuiltinESMExports();
  t.after(() => { t.mock.restoreAll(); syncBuiltinESMExports(); });
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

test('runs copied into the replay instance outside the source scope cannot be confirmed or executed', async t => {
  const { db, artifacts } = await fixture(t);
  const replay = readKalodataReplaySource(db, sourceRunId);
  const otherPeriod = { ...period, endDate: '2026-08-28' } as const;
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => replayWorkspace, now: replayNow });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'replay-copied', title: 'Synthetic copied runs' });
  const live: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const transport = createKalodataReplayTransport(fakeKalodata(inner, replayNow), () => loadKalodataReplayIndex(db, artifacts, sourceRunId));
  let nextUuid = 0;
  const service = (replayMode: boolean) => new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), now: replayNow,
    source: bindResearchAutomationProvider(createResearchAutomationProviderRegistry({ kalodataSecretKey: replayMode ? KALODATA_REPLAY_PLACEHOLDER_KEY : 'synthetic-secret',
      serpApiKey: null, apifyTokenConfigured: false }, replayMode ? transport : fakeKalodata(live, replayNow)).get('KALODATA')),
    ...(replayMode ? { kalodataReplay: replay } : {}),
    uuid: () => `88888888-8888-4888-8888-${String(++nextUuid).padStart(12, '0')}`,
  });
  // Two runs made before the copy (no replay): one waits for scope, one is already queued.
  const before = service(false);
  const drain = async (svc: ResearchAutomationService) => { for (let step = 0; step < 40 && await svc.processNext(); step += 1) { /* drain */ } };
  const startRun = async (n: string) => {
    const { run: { runId } } = await before.start(replayWorkspace, { contractVersion: 'research-automation-start-v1', requestKey: `33333333-3333-4333-8333-3333333399${n}`,
      mode: 'PRODUCT', keyword: 'thermos', requestedPeriod: otherPeriod, reports: ['MARKET'] });
    return runId;
  };
  const waiting = await startRun('01');
  const queued = await startRun('02');
  await drain(before);
  const confirm = (svc: ResearchAutomationService, runId: string, revision: number, n: string) => svc.confirmScope(replayWorkspace, runId, {
    contractVersion: 'research-automation-confirm-v1', requestKey: `44444444-4444-4444-8444-4444444499${n}`, expectedRevision: revision,
    definition: 'Vietnam thermos source observations', includeTerms: ['thermos'], excludeTerms: [], selectedProductIds: ['kalodata:101'], peerProductIds: [],
  });
  await confirm(before, queued, (await before.getRun(replayWorkspace, queued)).revision, '02');

  const replayService = service(true);
  await assert.rejects(confirm(replayService, waiting, (await replayService.getRun(replayWorkspace, waiting)).revision, '01'), KalodataReplayScopeMismatchError);
  assert.equal((await replayService.getRun(replayWorkspace, waiting)).status, 'AWAITING_SCOPE');
  await drain(replayService);
  const settled = await replayService.getRun(replayWorkspace, queued);
  assert.equal(settled.status, 'CANCELLED');
  assert.equal(settled.steps.find(step => step.stepId === 'COLLECTION')?.code, 'KALODATA_REPLAY_SCOPE_MISMATCH');
  assert.equal(await outputHtml(db, artifacts, queued), undefined, 'no draft for a run outside the source scope');
  assert.deepEqual(inner, { balance: 0, rank: 0, detail: 0, other: 0 });
  assert.equal(transport.stats.replayed + transport.stats.missed, 0, 'no request reached the replay transport');
});

test('the replay gate stops copied rendering runs and automatic capture, and refuses owner actions on them', async t => {
  const { db, artifacts } = await fixture(t);
  const replay = readKalodataReplaySource(db, sourceRunId);
  const otherPeriod = { ...period, endDate: '2026-08-28' } as const;
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => replayWorkspace, now: replayNow });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'replay-gate', title: 'Synthetic copied runs' });
  const inner: Counts = { balance: 0, rank: 0, detail: 0, other: 0 };
  const transport = createKalodataReplayTransport(fakeKalodata(inner, replayNow), () => loadKalodataReplayIndex(db, artifacts, sourceRunId));
  let captures = 0;
  let nextUuid = 0;
  const service = (replayMode: boolean) => new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), now: replayNow,
    source: bindResearchAutomationProvider(createResearchAutomationProviderRegistry({ kalodataSecretKey: replayMode ? KALODATA_REPLAY_PLACEHOLDER_KEY : 'synthetic-secret',
      serpApiKey: null, apifyTokenConfigured: false }, replayMode ? transport : fakeKalodata({ balance: 0, rank: 0, detail: 0, other: 0 }, replayNow)).get('KALODATA')),
    ...(replayMode ? { kalodataReplay: replay, autoRun: { enabled: true, runner: { enabledEnv: '1', captureRoot: path.join(os.tmpdir(), 'tdn-replay-no-capture') },
      runCapture: (async () => { captures += 1; throw new Error('capture must not run'); }) as never } } : {}),
    uuid: () => `77777777-7777-4777-8777-${String(++nextUuid).padStart(12, '0')}`,
  });
  const before = service(false);
  const startRun = async (n: string) => (await before.start(replayWorkspace, { contractVersion: 'research-automation-start-v1', requestKey: `33333333-3333-4333-8333-3333333377${n}`,
    mode: 'PRODUCT', keyword: 'thermos', requestedPeriod: otherPeriod, reports: ['MARKET'] })).run.runId;
  const waiting = await startRun('01');
  const rendering = await startRun('02');
  for (let step = 0; step < 10 && await before.processNext(); step += 1) { /* quick searches */ }
  await before.confirmScope(replayWorkspace, rendering, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444447702',
    expectedRevision: (await before.getRun(replayWorkspace, rendering)).revision, definition: 'Vietnam thermos source observations',
    includeTerms: ['thermos'], excludeTerms: [], selectedProductIds: ['kalodata:101'], peerProductIds: [] });
  for (let step = 0; step < 10 && (await before.getRun(replayWorkspace, rendering)).status !== 'RENDERING' && await before.processNext(); step += 1) { /* collection only */ }
  assert.equal((await before.getRun(replayWorkspace, rendering)).status, 'RENDERING', 'copied while the report is pending');
  // An automatic capture copied in while its run waits for scope.
  const at = replayNow().toISOString();
  db.prepare(`INSERT INTO research_automation_autorun(run_id,workspace_id,phase,phase_state,capture_dir_key,prepare_request_key,confirm_request_key,revision_request_key,created_at,updated_at)
    VALUES (?,?,'CAPTURE','QUEUED',?,?,?,?,?,?)`).run(waiting, replayWorkspace, waiting, '55555555-5555-4555-8555-555555557701', '55555555-5555-4555-8555-555555557702', '55555555-5555-4555-8555-555555557703', at, at);

  const replayService = service(true);
  assert.throws(() => replayService.assertReplayRunInScope(waiting), KalodataReplayScopeMismatchError, 'owner actions on a copied run are refused');
  assert.doesNotThrow(() => replayService.assertReplayRunInScope(sourceRunId), 'the source scope stays open');
  assert.doesNotThrow(() => before.assertReplayRunInScope(waiting), 'flag off: no gate');
  for (let step = 0; step < 10 && await replayService.processNext(); step += 1) { /* drain */ }
  assert.equal((await replayService.getRun(replayWorkspace, rendering)).status, 'CANCELLED');
  assert.equal(await outputHtml(db, artifacts, rendering), undefined, 'no draft for a copied run outside the source scope');
  assert.equal((await replayService.getRun(replayWorkspace, waiting)).status, 'CANCELLED');
  assert.deepEqual({ ...db.prepare('SELECT phase,stop_code code FROM research_automation_autorun WHERE run_id=?').get(waiting) as object },
    { phase: 'STOPPED', code: 'KALODATA_REPLAY_SCOPE_MISMATCH' });
  assert.equal(captures, 0, 'the capture provider was never called');
  assert.deepEqual(inner, { balance: 0, rank: 0, detail: 0, other: 0 });
  assert.equal(transport.stats.replayed + transport.stats.missed, 0);

  // Copied mid-flight: a running quick search with a running capture. Startup recovery quarantines it instead of interrupting or requeueing.
  const running = await startRun('03');
  db.prepare(`UPDATE analysis_research_automation_runs SET revision=revision+1,status='QUICK_SEARCH_RUNNING' WHERE run_id=?`).run(running);
  db.prepare(`UPDATE analysis_research_automation_steps SET state='RUNNING',started_at=? WHERE run_id=? AND state='QUEUED'`).run(at, running);
  db.prepare(`INSERT INTO research_automation_autorun(run_id,workspace_id,phase,phase_state,capture_dir_key,prepare_request_key,confirm_request_key,revision_request_key,created_at,updated_at)
    VALUES (?,?,'CAPTURE','RUNNING',?,?,?,?,?,?)`).run(running, replayWorkspace, running, '55555555-5555-4555-8555-555555557711', '55555555-5555-4555-8555-555555557712', '55555555-5555-4555-8555-555555557713', at, at);
  const restarted = service(true);
  await restarted.recoverOnStart();
  const recovered = await restarted.getRun(replayWorkspace, running);
  assert.equal(recovered.status, 'CANCELLED', 'a copied running quick search is quarantined, not interrupted');
  assert.ok(recovered.steps.some(step => step.code === 'KALODATA_REPLAY_SCOPE_MISMATCH'));
  assert.deepEqual({ ...db.prepare('SELECT phase,phase_state state,stop_code code FROM research_automation_autorun WHERE run_id=?').get(running) as object },
    { phase: 'STOPPED', state: 'QUEUED', code: 'KALODATA_REPLAY_SCOPE_MISMATCH' }, 'a copied running capture stops with the scope code');
  assert.equal(await restarted.processNext(), false, 'nothing is left to dispatch');
  assert.equal(captures, 0);
});
