import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { autorunRequestKey } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { SYNTHETIC_CARD_ID } from '../helpers/research-synthetic-sources.js';
import { autorun, drain, driveUntil, dump, fixture, keyword, requestCount, rewindStartKey, startRun, untilIdle, withRawResponses, workspaceId } from '../helpers/autorun-harness.js';
import type { AutorunScopeRecord } from '../../src/modules/analysis/research-automation/autorun-scope.js';
import { scopeLinesVi } from '../../src/modules/analysis/research-automation/autorun-scope.js';

// Synthetic fixtures only: no real keyword, product, shop or customer data; no process is spawned.

async function keywordWaitFixture(t: test.TestContext, category: string | null = null) {
  const requestBody = JSON.stringify({ include_query: { queries: [keyword] } });
  const raw = [
    { urlPath: '/v2/market/analytics/search-basic/', requestBody, body: { data: { search_basic: { aggregations: category ? [
      { aggregation: 'REVENUE__BY__CATEGORIES_CUSTOM', entities: [{ key: 'c1000000001', platforms: [{ platform_id: 1, value: 900 }, { platform_id: 8, value: 100 }] }] },
    ] : [] } } } },
    { urlPath: '/v2/market/analytics/products/', requestBody, body: { data: { products: ['Alpha', 'Beta', 'Gamma'].map((brand, i) => ({
      product_base_id: `1__${101 + i}__${201 + i}`, product_name: `Alternate jar ${brand}`, brand, revenue_custom: 100 - i,
      bee_categories: category ? [{ id: 'c1000000001', name: category, level: 0 }] : [],
    })) } } },
  ];
  return fixture(t, 'on', undefined, capture => async (config, request) => {
    const result = await capture.run(config, request);
    if (result.ok) {
      const rawBytes = Buffer.from(JSON.stringify(raw));
      const manifestPath = join(result.captureDir, 'manifest.json');
      await writeFile(manifestPath, withRawResponses(await readFile(manifestPath), rawBytes));
      await writeFile(join(result.captureDir, 'raw-responses.json'), rawBytes);
    }
    return result;
  }, undefined, { sourceEvidence: { modelIdentity: 'synthetic:model', promptVersion: 'synthetic-v1',
    transport: { draftLists: async () => ({ keywords: ['alternate jar'], exclusions: [] }) } } });
}

const keywordStart = (extras: Record<string, unknown> = {}) => ({
  contractVersion: 'research-automation-start-v2', requestKey: randomUUID(), mode: 'CATEGORY', keyword,
  requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'], ...extras,
});
async function firstCapture(f: Awaited<ReturnType<typeof keywordWaitFixture>>, service = f.service) {
  await driveUntil(service, () => f.capture.calls.length === 1);
  await service.settleAutoRunCaptures();
}
async function keywordScope(f: Awaited<ReturnType<typeof keywordWaitFixture>>, runId: string): Promise<AutorunScopeRecord> {
  return JSON.parse(await readFile(join(f.capture.captureRoot, runId, 'scope.json'), 'utf8'));
}

test('K2 no wait by default: omitted and false match a null answer with keyword 1 only', async t => {
  for (const category of [null, 'Synthetic category']) await t.test(category ?? 'All categories', async st => {
    const reference = await keywordWaitFixture(st, category);
    const referenceId = (await reference.service.start(workspaceId, keywordStart({ contractVersion: 'research-automation-start-v1' }))).run.runId;
    await firstCapture(reference);
    assert.equal(autorun(reference.db, referenceId)?.stopCode, 'KEYWORD2_AWAITING');
    await reference.service.retryAutoRunCapture(workspaceId, referenceId, {
      contractVersion: 'research-automation-autorun-keyword-v1', requestKey: randomUUID(), keyword2: null,
    });
    const expected = category ? { keywords: [keyword], category, outcome: 'PENDING' } : null;
    assert.deepEqual((await keywordScope(reference, referenceId)).capture2, expected);
    for (const extras of [{}, { waitForKeyword2: false }]) await st.test(JSON.stringify(extras), async sst => {
      const f = await keywordWaitFixture(sst, category);
      const runId = (await f.service.start(workspaceId, keywordStart(extras))).run.runId;
      await firstCapture(f);
      const row = autorun(f.db, runId)!;
      assert.deepEqual([row.phase, row.state, row.stopCode], [category ? 'CAPTURE' : 'PREPARE', 'QUEUED', null]);
      const scope = await keywordScope(f, runId);
      assert.equal(scope.keyword2.skipped, 'KEYWORD2_NOT_REQUESTED');
      assert.equal(scopeLinesVi(scope)[0], `Từ khóa: chỉ dùng "${keyword}". Từ khóa 2 không được yêu cầu ở bước bắt đầu nên tự động bỏ qua.`);
      assert.deepEqual(scope.capture2, expected);
      assert.equal((await f.service.getRun(workspaceId, runId)).autoRun?.keyword2Suggestion, undefined);
      if (category) {
        await f.service.processNext(); await f.service.settleAutoRunCaptures();
        assert.deepEqual(f.capture.calls[1]?.second, { keywords: [keyword], category });
        assert.equal(f.capture.calls.length, 2, 'the category change requires exactly the same extra capture as a null answer');
        assert.equal(autorun(f.db, runId)?.phase, 'PREPARE');
      } else assert.equal(f.capture.calls.length, 1, 'All + keyword 1 reuses the first capture');
    });
  });
});

test('K2 opt-in and legacy starts retain the wait and AI prefill across restart', async t => {
  for (const kind of ['opt-in', 'start-v1', 'retained snapshot'] as const) await t.test(kind, async st => {
    const f = await keywordWaitFixture(st);
    const receipt = await f.service.start(workspaceId, keywordStart(kind === 'opt-in'
      ? { waitForKeyword2: true } : { contractVersion: 'research-automation-start-v1' }));
    const runId = receipt.run.runId;
    const row = f.db.prepare('SELECT start_request_sha256 sha FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { sha: string };
    const retained = await f.artifacts.read(row.sha);
    const snapshot = JSON.parse(retained.toString());
    if (kind !== 'opt-in') assert.equal(Object.hasOwn(snapshot, 'waitForKeyword2'), false);
    const service = kind === 'retained snapshot' ? f.make() : f.service;
    if (kind === 'retained snapshot') await service.recoverOnStart();
    await firstCapture(f, service);
    const run = await service.getRun(workspaceId, runId);
    assert.deepEqual([run.autoRun?.phase, run.autoRun?.stopCode], ['STOPPED', 'KEYWORD2_AWAITING']);
    assert.deepEqual(run.autoRun?.keyword2Suggestion, { keyword1: keyword, term: 'alternate jar', titles: 3, titleCount: 3, brands: 3, categoryId: null });
    assert.equal((await keywordScope(f, runId)).keyword2.skipped, undefined);
    assert.equal(f.capture.calls.length, 1);
    assert.deepEqual(await f.artifacts.read(row.sha), retained, 'reading an old start never rewrites its bytes');
  });
});

test('flag off: no auto-run row, no capture, and the projection and database match a service without the option', async t => {
  const off = await fixture(t, 'off');
  const absent = await fixture(t, 'absent');
  const offRun = await startRun(off.service); rewindStartKey();
  const absentRun = await startRun(absent.service);
  await drain(off.service); await drain(absent.service);
  assert.equal(offRun, absentRun);
  assert.equal(off.capture.calls.length, 0);
  assert.equal((off.db.prepare('SELECT count(*) n FROM research_automation_autorun').get() as { n: bigint }).n, 0n);
  assert.deepEqual(await off.service.getRun(workspaceId, offRun), await absent.service.getRun(workspaceId, absentRun));
  assert.deepEqual(dump(off.db), dump(absent.db));
});

test('happy path: capture, prepare, pick and confirm with SKIP review, then PRESENT and DONE once the presentation is committed', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  assert.equal(autorun(f.db, runId)!.phase, 'WAITING_SCOPE');
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1);
  assert.deepEqual({ runId: f.capture.calls[0]!.runId, keyword: f.capture.calls[0]!.keyword }, { runId, keyword });
  const row = autorun(f.db, runId)!;
  assert.deepEqual({ phase: row.phase, state: row.state, stopCode: row.stopCode }, { phase: 'DONE', state: 'QUEUED', stopCode: null });
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  // DONE now follows the presentation step: exactly one committed revision attempt.
  assert.deepEqual(f.db.prepare(`SELECT state FROM analysis_research_automation_attempts WHERE run_id=?`).all(runId), [{ state: 'COMMITTED' }]);
  assert.equal(f.service.confirms.length, 1);
  const body = f.service.confirms[0] as { requestKey: string; sources: { nativeReview: string; metric: { decision: string; packageId: string } }; exactShopeeUrls: string[]; selectedProductIds: string[] };
  assert.equal(body.requestKey, autorunRequestKey(runId, 'confirm'));
  assert.equal(body.sources.nativeReview, 'SKIP');
  assert.deepEqual(body.sources.metric, { decision: 'USE_PREPARED', packageId: row.packageId });
  assert.deepEqual(body.selectedProductIds, [SYNTHETIC_CARD_ID]);
  // Fewer than five eligible links still continues; the unrelated row is never picked.
  assert.deepEqual(body.exactShopeeUrls, ['https://shopee.vn/product/201/101', 'https://shopee.vn/product/202/102', 'https://shopee.vn/product/203/103']);
  assert.ok(row.pickId && /^[0-9a-f]{64}$/.test(row.pickId));
  const manifest = f.db.prepare('SELECT media_type mediaType FROM artifact_manifests WHERE sha256=?').get(row.pickId) as { mediaType: string } | undefined;
  assert.equal(manifest?.mediaType, 'application/json', 'pick record is a registered content-addressed artifact');
});

test('a retained v3 pick without demotedRows or aiExcludedRows still loads at CONFIRM after restart', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  await driveUntil(f.service, () => autorun(f.db, runId)?.phase === 'CONFIRM');
  const row = autorun(f.db, runId)!;
  assert.ok(row.pickId);
  const pick = JSON.parse((await f.artifacts.read(row.pickId)).toString());
  assert.equal(pick.contractVersion, 'autorun-pick-record-v3');
  assert.equal(Object.hasOwn(pick, 'demotedRows'), false);
  assert.equal(Object.hasOwn(pick, 'aiExcludedRows'), false);
  assert.deepEqual(pick.urls, ['https://shopee.vn/product/201/101', 'https://shopee.vn/product/202/102', 'https://shopee.vn/product/203/103']);
  const restarted = f.make();
  await restarted.recoverOnStart();
  await drain(restarted);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['DONE', null]);
  assert.equal(restarted.confirms.length, 1);
  assert.deepEqual((await restarted.getRun(workspaceId, runId)).definition?.exactShopeeUrls, pick.urls);
  assert.equal(f.capture.calls.length, 1, 'loading the retained pick must not repeat capture');
});

test('Q2 rows 1 and 3: Insight-only confirms picked Shopee URLs and brands, finishes without PRESENT or ad reads', async t => {
  for (const reports of [['INSIGHT'], ['MARKET'], ['MARKET', 'INSIGHT']] as ('MARKET' | 'INSIGHT')[][]) await t.test(reports.join('+'), async st => {
    const adBrands: string[][] = [], metaBrands: string[][] = [];
    const f = await fixture(st, 'on', undefined, undefined, undefined, {
      searchAdsSource: { collect: async input => {
        adBrands.push(input.brands.map(brand => brand.label));
        return { status: 'NO_DATA', brands: [], requests: 0, ambiguousRequests: 0 };
      } },
      metaAutoSource: { collect: async input => {
        metaBrands.push(input.brands.map(brand => brand.label));
        return { status: 'NO_DATA', stop: null, reasonVi: null, opens: 0, reads: [], brands: [] };
      } },
    });
    const runId = await startRun(f.service, reports);
    assert.equal(autorun(f.db, runId)?.phase, 'WAITING_SCOPE');
    const phases: string[] = [];
    for (let i = 0; i < 200; i++) {
      const phase = autorun(f.db, runId)!.phase;
      phases.push(phase);
      if (phase === 'DONE' || phase === 'STOPPED') break;
      if (!(await f.service.processNext())) await f.service.settleAutoRunCaptures();
    }
    assert.equal(f.capture.calls.length, 1);
    const row = autorun(f.db, runId)!;
    assert.deepEqual([row.phase, row.stopCode], ['DONE', null]);
    const market = reports.includes('MARKET');
    assert.equal(phases.includes('PRESENT'), market);
    assert.deepEqual(f.db.prepare('SELECT state FROM analysis_research_automation_attempts WHERE run_id=?').all(runId), market ? [{ state: 'COMMITTED' }] : []);
    assert.equal(f.service.revisions.length, market ? 1 : 0);
    assert.equal(row.revisionAttemptId !== null, market);
    const run = await f.service.getRun(workspaceId, runId);
    assert.equal(run.status, 'DRAFT_READY');
    assert.equal(f.service.confirms.length, 1);
    const expectedUrls = ['https://shopee.vn/product/201/101', 'https://shopee.vn/product/202/102', 'https://shopee.vn/product/203/103'];
    assert.deepEqual((f.service.confirms[0] as { exactShopeeUrls: string[] }).exactShopeeUrls, expectedUrls);
    assert.deepEqual(run.definition?.exactShopeeUrls, expectedUrls, 'the accepted scope retains the exact picked links');
    assert.ok(row.pickId);
    const pick = JSON.parse((await f.artifacts.read(row.pickId)).toString()) as { links: { brand: string }[] };
    assert.deepEqual(pick.links.map(item => item.brand), ['Brand A', 'Brand B', 'Brand C']);
    assert.deepEqual(adBrands, market ? [['Brand A', 'Brand B', 'Brand C']] : []);
    assert.deepEqual(metaBrands, market ? [['Brand A', 'Brand B']] : []);
    if (!market) {
      assert.equal((await f.service.readReport(workspaceId, runId, 'INSIGHT')).kind, 'INSIGHT');
      assert.deepEqual(f.db.prepare('SELECT report_kind FROM analysis_research_automation_outputs WHERE run_id=?').all(runId), [{ report_kind: 'INSIGHT' }]);
    }
  });
});

test('restart during CAPTURE stops the row as CAPTURE_INTERRUPTED and never re-runs the capture', async t => {
  const f = await fixture(t, 'on', () => 'hold');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.calls.length, 1);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CAPTURE', 'RUNNING']);
  const restarted = f.make();
  await restarted.recoverOnStart();
  const stopped = autorun(f.db, runId)!;
  assert.deepEqual([stopped.phase, stopped.stopCode], ['STOPPED', 'CAPTURE_INTERRUPTED']);
  assert.ok(stopped.stopDetail!.length <= 300 && !/[\\/]/.test(stopped.stopDetail!), 'stop detail is short and path-free');
  await drain(restarted);
  // The old process finishing late cannot revive the stopped row.
  f.capture.release(runId); await f.service.settleAutoRunCaptures();
  assert.equal(autorun(f.db, runId)!.stopCode, 'CAPTURE_INTERRUPTED');
  assert.equal(f.capture.calls.length, 1);
});

test('restart during CONFIRM replays the same request key without a duplicate confirmation', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  f.service.hangAfterConfirm = true;
  // Drive until the confirm is accepted but the process "dies" before the write-back.
  for (let i = 0; i < 50; i++) {
    const moved = await Promise.race([f.service.processNext(), f.service.hung]);
    if (moved === 'hung') break;
    if (!moved) await f.service.settleAutoRunCaptures();
  }
  assert.equal(f.service.confirms.length, 1);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CONFIRM', 'RUNNING']);
  const confirmKey = autorunRequestKey(runId, 'confirm');
  assert.equal(requestCount(f.db, confirmKey), 1);
  const restarted = f.make();
  await restarted.recoverOnStart();
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CONFIRM', 'QUEUED']);
  await drain(restarted);
  assert.equal(restarted.confirms.length, 1);
  assert.equal((restarted.confirms[0] as { requestKey: string }).requestKey, confirmKey);
  assert.deepEqual(restarted.confirms[0], f.service.confirms[0], 'replay sends the exact recorded request');
  assert.equal(requestCount(f.db, confirmKey), 1);
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
  assert.equal(f.capture.calls.length, 1);
});

test('owner confirming by hand first stops the auto-run as SCOPE_CHANGED_BY_OWNER', async t => {
  const f = await fixture(t, 'on', () => 'hold');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  const awaiting = await f.service.getRun(workspaceId, runId);
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  await f.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic owner scope', includeTerms: [keyword], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  f.capture.release(runId);
  await drain(f.service);
  const row = autorun(f.db, runId)!;
  assert.deepEqual([row.phase, row.stopCode], ['STOPPED', 'SCOPE_CHANGED_BY_OWNER']);
  assert.equal(f.service.confirms.length, 1, 'only the owner confirmation was sent');
  assert.equal(requestCount(f.db, autorunRequestKey(runId, 'confirm')), 0);
});

test('cancel during capture aborts it and stops the row as CANCELLED', async t => {
  const f = await fixture(t, 'on', () => 'abortable');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.signals[0]!.aborted, false);
  const run = await f.service.getRun(workspaceId, runId);
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: run.revision });
  assert.equal(f.capture.signals[0]!.aborted, true);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'CANCELLED']);
  await drain(f.service);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'CANCELLED'], 'the cancel wins over the late capture result');
  assert.equal(f.capture.calls.length, 1);
});

test('two runs: only one capture runs at a time', async t => {
  let first: string | undefined;
  const f = await fixture(t, 'on', runId => { first ??= runId; return runId === first ? 'hold' : 'ok'; });
  const a = await startRun(f.service);
  const b = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.calls.length, 1);
  const waiting = f.capture.calls[0]!.runId === a ? b : a;
  assert.deepEqual([autorun(f.db, waiting)!.phase, autorun(f.db, waiting)!.state], ['CAPTURE', 'QUEUED']);
  f.capture.release(f.capture.calls[0]!.runId);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 2);
  assert.equal(f.capture.maxActive, 1);
  assert.equal(autorun(f.db, a)!.phase, 'DONE');
  assert.equal(autorun(f.db, b)!.phase, 'DONE');
});

test('a login stop also stops the other queued captures of the workspace', async t => {
  const f = await fixture(t, 'on', () => ({ ok: false, code: 'METRIC_LOGIN_REQUIRED', detail: 'login required', executorCalls: 1 }));
  const a = await startRun(f.service);
  const b = await startRun(f.service);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1);
  for (const runId of [a, b]) assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'METRIC_LOGIN_REQUIRED']);
  for (const runId of [a, b]) assert.equal((await f.service.getRun(workspaceId, runId)).status, 'AWAITING_SCOPE', 'the run stays open for the owner');
});

// Frozen owner input must survive a service restart to reach CAPTURE unchanged.
// Runner transport/publication behavior is owned by metric-capture-runner.test.ts.
test('explicit preset is frozen on start and forwarded to CAPTURE after restart without category fallback', async t => {
  const f = await fixture(t, 'on', () => ({ ok: false, code: 'CAPTURE_CATEGORY_NOT_SELECTABLE', detail: 'capture stopped', executorCalls: 1 }));
  const { spec } = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));
  spec.preset.keywords[0] = keyword;
  spec.windows[0].period = { startDate: '2026-01-01', endDate: '2026-01-30' };
  spec.windows[1].period = { startDate: '2025-01-31', endDate: '2026-01-30' };
  const expected = structuredClone(spec);
  const receipt = await f.service.start(workspaceId, {
    contractVersion: 'research-automation-start-v2', requestKey: '99999999-9999-4999-8999-999999999999',
    mode: 'CATEGORY', keyword, reports: ['MARKET'], requestedPeriod: spec.windows[1].period, metricV3Preset: spec,
  });
  spec.preset.keywords[1] = 'changed after start';
  await drain(f.make());
  assert.equal(f.capture.calls.length, 1);
  assert.deepEqual(f.capture.calls[0]!.metricV3Preset, expected);
  assert.equal(f.capture.calls[0]!.second, undefined);
  const state = autorun(f.db, receipt.run.runId)!;
  assert.equal(state.phase, 'STOPPED');
  assert.equal(state.stopCode, 'CAPTURE_CATEGORY_NOT_SELECTABLE');
  assert.equal(Number(state.captureReady), 0);
});
