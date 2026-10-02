import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createRequire } from 'node:module';
import apiSchema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector, CollectionPendingError } from '../../src/platform/collectors/apify-shopee.js';
import type { ShopeeCollectorFactory } from '../../src/modules/analysis/research-automation/exact-shopee-bridge.js';
import { MAX_HTML_BYTES } from '../../src/modules/analysis/research-automation/model.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const url = 'https://shopee.vn/product/78085196/17678138164';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
ajv.addSchema(apiSchema);
const validateRun = ajv.getSchema(`${apiSchema.$id}#/$defs/run`)!;
function assertRunContract(run: unknown) { assert.equal(validateRun(run), true, JSON.stringify(validateRun.errors)); }
async function fixture(t: TestContext, factory?: ShopeeCollectorFactory, oversizedView = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-exact-review-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'exact-review', title: 'Synthetic exact review acceptance' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, ...(factory ? { shopeeCollectorFactory: factory } : {}), renderer: (input, kind) => {
      const rendered = buildResearchAutomationReport(input, kind);
      return oversizedView && kind === 'INSIGHT' && input.reviewCorpus ? { ...rendered, html: Buffer.alloc(MAX_HTML_BYTES + 1, 'x') } : rendered;
    } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'Synthetic coconut jelly', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision,
    definition: 'Synthetic exact listing, not a TikTok substitute', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [url] };
  return { root, db, artifacts, service, confirm };
}

test('explicit listing scope flows through collection and frozen corpus to both reports without a discovery substitute', async t => {
  let calls = 0;
  const raw = Buffer.from(JSON.stringify([
    { shopId: '78085196', itemId: '17678138164', reviewId: 'synthetic-1', comment: 'Thạch giòn, ăn với sữa chua. <script>bad()</script>', ratingStar: 9, author: 'Do not project me' },
    { shopId: '99', itemId: '1', reviewId: 'foreign', comment: 'Wrong product', ratingStar: 5 },
  ]));
  const state = await fixture(t, () => ({ requestsIssued: () => 0, collector: { mode: 'fixture', collect: async (...args) => { calls++; return new FixtureShopeeCollector(raw).collect(...args); } } }));
  await assert.rejects(state.service.confirmScope(workspaceId, runId, { ...state.confirm, exactShopeeUrls: [url, 'https://shopee.vn/x-i.78085196.17678138164'] }), /distinct/);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  assert.equal((await state.service.confirmScope(workspaceId, runId, state.confirm)).exactRetry, true);
  assert.equal(calls, 0, 'confirmation only queues the bounded collection');
  await state.service.processNext();
  await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assertRunContract(ready);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.deepEqual(ready.definition?.exactShopeeUrls, [url]);
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.reviewCorpus.coverage.rawRows, 2);
  assert.equal(semantic.reviewCorpus.coverage.invalidRatingRawRows, 1);
  assert.equal(semantic.reviewCorpus.coverage.quarantinedRawRows, 1);
  assert.equal(semantic.reviewCorpus.codingState, 'NOT_CODED');
  assert.equal(semantic.completion.completedAnalyticalSections, 0);
  const before = state.db.prepare('SELECT total_changes() n').get();
  const report = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  const html = report.bytes.toString();
  assert.match(html, /Thạch giòn/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /Do not project me|<script>/);
  assert.match(html, /Tách riêng/);
  assert.match(html, /Chưa coding/);
  assert.deepEqual((await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes, report.bytes);
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  assert.equal(calls, 1);
  const page = semantic.reviewCorpus.sourcePages[0].sha256 as string;
  await fs.writeFile(path.join(state.root, 'artifacts', 'sha256', page.slice(0, 2), page), 'corrupt');
  await assert.rejects(state.service.readReport(workspaceId, runId, 'INSIGHT'), /./, 'report replay verifies its original raw pages');
});

test('unconfigured or ambiguous review collection remains explicit, does not retry, and preserves two partial reports', async t => {
  for (const mode of ['unconfigured', 'ambiguous'] as const) await t.test(mode, async sub => {
    let calls = 0;
    const state = await fixture(sub, mode === 'unconfigured' ? undefined : () => ({ requestsIssued: () => calls,
      collector: { mode: 'live', collect: async () => { calls++; throw new CollectionPendingError('Secret provider response must not appear'); } } }));
    await state.service.confirmScope(workspaceId, runId, state.confirm);
    await state.service.processNext(); await state.service.processNext();
    const ready = await state.service.getRun(workspaceId, runId);
    assertRunContract(ready);
    assert.equal(ready.steps.find(row => row.stepId === 'COLLECTION')?.state, mode === 'ambiguous' ? 'FAILED' : 'UNAVAILABLE');
    assert.equal(ready.status, 'DRAFT_READY');
    assert.ok(ready.blockers.some(row => row.code === (mode === 'unconfigured' ? 'EXACT_SHOPEE_NOT_CONFIGURED' : 'EXACT_SHOPEE_PENDING_RECONCILIATION')));
    assert.doesNotMatch(JSON.stringify(ready), /Secret provider/);
    assert.equal(ready.usage.hasUnknownCost, mode === 'ambiguous');
    await state.service.readReport(workspaceId, runId, 'MARKET'); await state.service.readReport(workspaceId, runId, 'INSIGHT');
    assert.equal(await state.service.processNext(), false);
    assert.equal(calls, mode === 'ambiguous' ? 1 : 0);
  });
});

test('an oversized quote view preserves the independent Market report and full raw collection without truncation or recollection', async t => {
  let calls = 0;
  const raw = Buffer.from(JSON.stringify([{ shopId: '78085196', itemId: '17678138164', comment: 'Full original text', ratingStar: 5 }]));
  const state = await fixture(t, () => ({ requestsIssued: () => 0, collector: { mode: 'fixture', collect: async (...args) => { calls++; return new FixtureShopeeCollector(raw).collect(...args); } } }), true);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.reviewCorpusFailure, 'REVIEW_CORPUS_REPORT_TOO_LARGE');
  assert.equal(semantic.reviewCorpus, null);
  const report = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  assert.match(report.bytes.toString(), /vượt giới hạn kích thước báo cáo/);
  await state.service.readReport(workspaceId, runId, 'MARKET');
  const pageSha = (await import('node:crypto')).createHash('sha256').update(raw).digest('hex');
  assert.deepEqual(await state.artifacts.read(pageSha), raw);
  assert.equal(calls, 1);
});
