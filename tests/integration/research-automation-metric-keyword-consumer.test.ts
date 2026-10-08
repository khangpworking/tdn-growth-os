import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { keywordDraftConfiguration } from '../../src/modules/analysis/research-automation/keyword-cliproxy-transport.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import type { AutomationConfirmedSourceSet } from '../../contracts/analysis/automation-confirmed-source-set.generated.js';
import type { ResearchAutomationMetricPrepareReceipt } from '../../contracts/api/research-automation-metric-intake-api.generated.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const token = 'synthetic-metric-owner-token-0-not-a-live-credential';
const title = '  Thạch dừa  nguyên văn – An Nhiên 350g  ';
const kalodataName = 'Thạch dừa tên nguồn Kalodata riêng';
const period = { startDate: '2026-08-17', endDate: '2026-09-15' };
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function fixture(t: TestContext, enabled = true, cancelDuringModel = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-keyword-owner-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath }).db;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-keyword-owner', title: 'Synthetic Metric keyword consumer' });
  const modelRequests: { model: string; messages: { content: string }[] }[] = [];
  let cancelModel: (() => Promise<void>) | undefined;
  const gateway = http.createServer(async (request, response) => {
    const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
    modelRequests.push(JSON.parse(Buffer.concat(chunks).toString()));
    if (cancelDuringModel) await cancelModel!();
    response.writeHead(200, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic separate term' }] }) }, finish_reason: 'stop' }] }));
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const calls: string[] = [];
  const transport: ProviderTransport = { sleep: async () => {}, now: () => Date.parse('2026-10-08T00:00:00Z'),
    fetch: (async (url: string | URL | Request, options?: RequestInit) => {
      const endpoint = new URL(String(url)); calls.push(endpoint.pathname);
      let data: unknown;
      if (endpoint.pathname.endsWith('/credit/balance')) data = { success: true, data: { totalRemain: 100 } };
      else if (endpoint.pathname.endsWith('/product/rank')) data = { success: true, data: [{ product_id: '12345', product_name: kalodataName, unit_price: 10000 }] };
      else if (endpoint.pathname.endsWith('/product/detail')) data = { success: true, data: { product_id: JSON.parse(options!.body as string).product_id,
        product_region: 'VN', product_name: kalodataName, product_description: [], revenue: 10, sales_volumn: 2, unit_price: 10000,
        min_price: 10000, max_price: 10000, video_revenue: 6, live_revenue: 4, shopping_mall_revenue: 0 } };
      else {
        assert.equal(endpoint.hostname, 'serpapi.com');
        data = { organic_results: [
          { position: 1, title: 'Thạch dừa trong mẫu', link: 'https://example.test/keep', snippet: 'Synthetic included result' },
          { position: 2, title: 'Thạch dừa và thạch dứa', link: 'https://example.test/drop', snippet: 'Synthetic excluded result' },
          { position: 3, title: 'thach dua', link: 'https://example.test/unclear', snippet: 'Synthetic unclear result' },
        ] };
      }
      return new Response(JSON.stringify(data), { status: 200 });
    }) as typeof fetch };
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  let app: ReturnType<typeof openResearchAutomationApi> | undefined;
  t.after(async () => {
    try { await app?.close(); }
    finally {
      server.closeAllConnections(); gateway.closeAllConnections();
      await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => gateway.close(() => resolve()))]);
      db.close(); await fs.rm(root, { recursive: true, force: true });
    }
  });
  const configuration = keywordDraftConfiguration('synthetic-metric-keyword-model');
  app = openResearchAutomationApi({ databasePath, artifactRoot, origin,
    providers: { kalodataSecretKey: 'synthetic-sales-key', serpApiKey: 'synthetic-web-key', apifyTokenConfigured: false },
    owner: { databasePath, artifactRoot, writeEnabled: true, token, actorId: 'synthetic-owner', allowedOrigin: origin },
    ...(enabled ? { keywordDrafting: { cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-gateway-key' }, configuration } } : {}),
  }, transport);
  server.on('request', app.handler);
  const ownerRoot = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs`;
  const headers = { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const post = async (url: string, body: unknown, expectedStatus = 202) => {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    assert.equal(response.status, expectedStatus, await response.clone().text()); return response.json() as Promise<any>;
  };
  const started = await post(ownerRoot, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'thạch dừa', reports: ['MARKET', 'INSIGHT'], requestedPeriod: period });
  const id = started.run.runId as string;
  const readRoot = `${origin}/api/workspaces/${workspaceId}/research-automation/runs/${id}`;
  cancelModel = async () => {
    const current = await (await fetch(readRoot)).json() as { revision: number };
    await post(`${ownerRoot}/${id}/cancel`, { contractVersion: 'research-automation-cancel-v1', requestKey: randomUUID(), expectedRevision: current.revision }, 200);
  };
  const wait = async (status: string) => {
    for (let n = 0; n < 400; n++) {
      const response = await fetch(readRoot); assert.equal(response.status, 200);
      const value = await response.json() as Awaited<ReturnType<ResearchAutomationService['getRun']>>;
      if (value.status === status) return value;
      assert.ok(!['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(value.status), JSON.stringify(value));
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`Synthetic run did not reach ${status}`);
  };
  const awaiting = await wait('AWAITING_SCOPE'); assert.equal(awaiting.productCards.length, 1);
  // Product approval is independent of the package; a card never supplies a name cell.
  const scope = { definition: 'Synthetic owner-confirmed source scope', includeTerms: ['thạch dừa'], excludeTerms: ['thạch dứa'], selectedProductIds: [awaiting.productCards[0]!.productId], peerProductIds: [], exactShopeeUrls: [] };
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], {
    input: JSON.stringify({ profile: 'v3', cells: { A2: { type: 's', value: title }, A4: { type: 's', value: title } } }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  const form = new FormData();
  form.set('metadata', JSON.stringify({ contractVersion: 'automation-metric-prepare-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    scope, sourceLabel: 'Synthetic combined Metric export', acquiredAt: null, measurementPeriod: { ...period, basis: 'Synthetic period' },
    precision: { revenue: 'unknown', units: 'unknown' }, selection: 'UNSPECIFIED', sourceContext: 'Synthetic owner workbook; not provider verified' }));
  form.set('workbook', new File([new Uint8Array(generated.stdout)], 'synthetic.xlsx'));
  const uploadUrl = `${ownerRoot}/${id}/sources/metric`;
  const upload = () => fetch(uploadUrl, { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}` }, body: form });
  const preparedResponse = await upload(); assert.equal(preparedResponse.status, 201, await preparedResponse.clone().text());
  const prepared = await preparedResponse.json() as ResearchAutomationMetricPrepareReceipt;
  const retryUpload = await upload(); assert.equal(retryUpload.status, 200);
  assert.deepEqual(await retryUpload.json(), { ...prepared, exactRetry: true }); assert.equal(modelRequests.length, 0);
  const confirmBody = { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(), expectedRevision: awaiting.revision, ...scope,
    sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } };
  const confirm = await post(`${ownerRoot}/${id}/confirm-scope`, confirmBody);
  const sourceRow = db.prepare('SELECT confirmed_source_set_sha256 digest FROM analysis_research_automation_runs WHERE run_id=?').get(id) as { digest: string };
  const confirmedSources = JSON.parse((await artifacts.read(sourceRow.digest)).toString()) as AutomationConfirmedSourceSet;
  assert.ok(confirmedSources.metric.decision === 'ADMITTED');
  const sourcePackage = confirmedSources.metric.sourcePackage;
  assert.equal(sourcePackage.packageId, prepared.packageId);
  await wait(cancelDuringModel ? 'CANCELLED' : 'DRAFT_READY');
  const callsAfterReady = calls.length, modelCallsAfterReady = modelRequests.length;
  const retry = await post(`${ownerRoot}/${id}/confirm-scope`, confirmBody, 200); assert.equal(retry.exactRetry, true);
  assert.equal(retry.run.runId, confirm.run.runId); assert.equal(calls.length, callsAfterReady); assert.equal(modelRequests.length, modelCallsAfterReady);
  const readService = (onUnexpectedModel: () => void = () => { throw new Error('read must not dispatch'); }) => new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    sourceEvidence: { modelIdentity: 'changed-current-model', promptVersion: 'changed-current-prompt', transport: { draftLists: async () => {
      onUnexpectedModel(); return { keywords: ['different-current-keyword'], exclusions: [] };
    } } },
  });
  const service = readService();
  const packet = await service.readSourceEvidence(workspaceId, id); assert.ok(packet);
  return { db, artifacts, id, prepared, sourcePackage, packet, modelRequests, calls, readService, service, readRoot, configuration };
}

test('real OWNER selected workbook -> configured fake keyword model -> retained v3 -> L9/report/read preserves exact cells and no-call replay', async t => {
  const f = await fixture(t);
  assert.equal(f.modelRequests.length, 1);
  const record = await f.service.readSourceKeywordDraft(workspaceId, f.id, f.packet.draftDigest!);
  assert.ok(record.contractVersion === 'l9-keyword-list-draft-record-v3');
  const refs = record.salesNameRefs.filter(ref => 'kind' in ref);
  assert.deepEqual(refs.map(ref => [ref.row, ref.locator]), [[2, 'Sheet1!A2'], [4, 'Sheet1!A4']]);
  for (const ref of refs) assert.deepEqual(ref.sourcePackage, f.sourcePackage);
  assert.deepEqual(record.seeds.productNames.filter(name => name === title), [title, title]);
  assert.ok(record.seeds.productNames.every(name => name === title || name === kalodataName));
  assert.equal(record.model.prompt, f.modelRequests[0]!.messages[0]!.content);
  assert.equal(f.modelRequests[0]!.model, 'synthetic-metric-keyword-model'); assert.deepEqual(record.model.configuration, f.configuration);
  assert.deepEqual(f.packet.admission!.result.results.map(row => row.decision), ['INCLUDED', 'EXCLUDED', 'UNCLEAR']);
  assert.deepEqual(f.packet.admission!.result.accounting, { included: 1, excluded: 1, unclear: 1, byReason: { EXCLUDED_TERM: 1, UNRESOLVED_UNDIACRITICIZED: 1 } });
  const numericSource = f.packet.sourceAppendix.rows.filter(row => row.registryId === 'S01');
  assert.deepEqual(numericSource.map(row => row.binding), [{ kind: 'package', ref: f.sourcePackage.manifestArtifactSha256 }]);
  const before = hash(f.db.serialize()), calls = [...f.calls], modelCalls = f.modelRequests.length;
  for (const kind of ['MARKET', 'INSIGHT'] as const) {
    const saved = await f.service.readReport(workspaceId, f.id, kind);
    const doc = new JSDOM(saved.bytes.toString()).window.document;
    assert.equal(doc.querySelectorAll('[aria-label="Kết quả tìm kiếm trên web đã lưu"] tbody tr').length, 1);
    assert.equal(doc.querySelectorAll('.citation-register a[href="https://example.test/drop"]').length, 0);
    const semantic = JSON.parse((await f.artifacts.read(saved.versionId)).toString());
    assert.deepEqual(semantic.sourceEvidence.sourceAppendix.rows.filter((row: { registryId: string }) => row.registryId === 'S01').map((row: { binding: unknown }) => row.binding), [{ kind: 'package', ref: f.sourcePackage.manifestArtifactSha256 }]);
    assert.deepEqual((await f.readService().readReport(workspaceId, f.id, kind)).bytes, saved.bytes);
    const response = await fetch(`${f.readRoot}/reports/${kind.toLowerCase()}`); assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), saved.bytes);
  }
  assert.deepEqual(await f.readService().readSourceKeywordDraft(workspaceId, f.id, f.packet.draftDigest!), record);
  assert.equal(hash(f.db.serialize()), before); assert.deepEqual(f.calls, calls); assert.equal(f.modelRequests.length, modelCalls);
  const workbook = refs[0]!.workbook.sha256, file = f.artifacts.pathForDigest(workbook), original = await fs.readFile(file);
  await fs.writeFile(file, 'tampered synthetic workbook');
  let unexpected = 0;
  try {
    const service = f.readService(() => { unexpected++; });
    await assert.rejects(service.draftSourceKeywords(workspaceId, f.id));
    await assert.rejects(service.readSourceKeywordDraft(workspaceId, f.id, f.packet.draftDigest!));
    await assert.rejects(service.readReport(workspaceId, f.id, 'MARKET'));
    await assert.rejects(service.readSourceKeywordDraft(randomUUID(), f.id, f.packet.draftDigest!));
    await assert.rejects(service.readSourceKeywordDraft(workspaceId, randomUUID(), f.packet.draftDigest!));
  } finally { await fs.writeFile(file, original); }
  assert.equal(unexpected, 0); assert.deepEqual(f.calls, calls); assert.equal(f.modelRequests.length, modelCalls);
});

test('confirmed Metric workbook alone does not configure a model or manufacture L9 source use', async t => {
  const f = await fixture(t, false);
  assert.equal(f.modelRequests.length, 0); assert.equal(f.packet.draftDigest, null); assert.equal(f.packet.admission, null);
  assert.equal(f.packet.unavailableReason, 'MODEL_NOT_CONFIGURED');
  assert.equal(f.packet.sourceAppendix.rows.some(row => row.registryId === 'S01'), false, 'no keyword method consumed the cells');
  const insight = await f.service.readReport(workspaceId, f.id, 'INSIGHT');
  const semantic = JSON.parse((await f.artifacts.read(insight.versionId)).toString());
  assert.equal(semantic.sourceEvidence.sourceAppendix.rows.some((row: { registryId: string }) => row.registryId === 'S01'), false);
});

test('OWNER cancellation during actual Metric-seeded fake model dispatch admits no successful draft or report', async t => {
  const f = await fixture(t, true, true);
  assert.equal(f.modelRequests.length, 1); assert.equal(f.packet.draftDigest, null); assert.equal(f.packet.admission, null);
  assert.equal(f.packet.unavailableReason, 'DRAFT_FAILED');
  assert.equal(f.packet.sourceAppendix.rows.some(row => row.registryId === 'S01'), false);
  const run = await f.service.getRun(workspaceId, f.id);
  assert.equal(run.status, 'CANCELLED'); assert.equal(run.steps.find(row => row.stepId === 'COLLECTION')!.state, 'CANCELLED');
  assert.equal(run.steps.find(row => row.stepId === 'REPORTS')!.state, 'SKIPPED');
  await assert.rejects(f.service.readReport(workspaceId, f.id, 'MARKET'));
});
