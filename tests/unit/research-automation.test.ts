import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { withDatabaseMutationMutex } from '../../src/platform/db/database-mutation-mutex.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import {
  ResearchAutomationConflictError,
  ResearchAutomationService,
  ResearchAutomationWorker,
  type AutomationSourcePort,
  type ResearchAutomationReportRenderer,
} from '../../src/modules/analysis/research-automation/index.js';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const cardId = 'kalodata:12345';

function syntheticSource(): AutomationSourcePort {
  const capture = {
    captureId: 'kalodata-0001', provider: 'KALODATA', operation: 'kalodata.product.rank', billing: 'FREE_ACCOUNT_QUERY', method: 'POST',
    endpoint: 'https://www.kalodata.com/openapi/product/rank', requestParameters: { keyword: 'calcium' }, requestBodyBytes: Buffer.from('{"keyword":"calcium"}'),
    queryWindow: { startDate: '2026-09-01', endDate: '2026-09-30' }, pageNumber: 1, productRef: cardId, requestedAt: '2026-10-02T00:00:00.000Z', completedAt: '2026-10-02T00:00:01.000Z',
    outcome: 'OK', httpStatus: 200, responseBytes: Buffer.from('{"data":[]}'), responseSha256: 'a'.repeat(64), responseByteLength: 13, providerCode: null,
  } as const;
  const card = {
    productId: cardId, provider: 'kalodata', sourceProductId: '12345', role: 'PRINCIPAL', title: 'Synthetic calcium', sourceUrl: 'https://www.kalodata.com/products/12345', imageUrl: null,
    description: null, descriptionState: 'EMPTY', observedWindow: { startDate: '2026-09-01', endDate: '2026-09-30', label: 'QUICK_SEARCH_RECENT_WINDOW' }, retrievedAt: capture.completedAt,
  } as const;
  return {
    id: 'KALODATA',
    async quickSearch(input) {
      const step: StepResultDocument = { contractVersion: 'research-automation-step-result-v1', runId: input.runId, stepId: 'QUICK_SEARCH', outcome: 'SUCCEEDED', productCards: [card], comparables: [], coverage: [{ provider: 'kalodata', dataset: 'quick_search_product_cards', state: 'COLLECTED', observedStartDate: '2026-09-01', observedEndDate: '2026-09-30', truncated: false, note: null }], limitations: [] };
      return { result: { contractVersion: 'research-automation-provider-v1', provider: 'KALODATA', status: 'SUCCEEDED', searchWindow: null, cards: [], candidatePool: { rowsReturned: 1, validDistinctProducts: 1, duplicateRowsCollapsed: 0, invalidRows: 0 }, coverage: [], usage: { provider: 'KALODATA', requestsIssued: 1, paidRequestsIssued: 0, ambiguousPaidRequests: 0, automaticRetries: 0, credits: { status: 'NONE_USED' }, monetaryCharge: { status: 'UNKNOWN', reason: 'synthetic' } }, captures: [capture], limitations: [] } as any, step };
    },
    async collect(input) {
      const step: StepResultDocument = { contractVersion: 'research-automation-step-result-v1', runId: input.runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [], comparables: [], coverage: [{ provider: 'kalodata', dataset: 'product_period_detail', state: 'COLLECTED', observedStartDate: '2026-09-01', observedEndDate: '2026-09-30', truncated: false, note: null }], limitations: [] };
      return { result: { contractVersion: 'research-automation-provider-v1', provider: 'KALODATA', status: 'SUCCEEDED', requestedPeriod: input.requestedPeriod, productObservations: [], productPeriodSummaries: [], webResults: [], coverage: [], usage: { provider: 'KALODATA', requestsIssued: 1, paidRequestsIssued: 0, ambiguousPaidRequests: 0, automaticRetries: 0, credits: { status: 'NONE_USED' }, monetaryCharge: { status: 'UNKNOWN', reason: 'synthetic' } }, captures: [capture], limitations: [] } as any, step };
    },
  };
}

async function fixture(renderer?: ResearchAutomationReportRenderer, source: AutomationSourcePort = syntheticSource(), artifactStore?: ContentAddressedArtifactStore) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-research-automation-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now: () => new Date('2026-10-02T00:00:00.000Z') }).db;
  const artifacts = artifactStore ?? new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now: () => new Date('2026-10-01T00:00:00.000Z') });
  await discoveries.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'research-automation', title: 'Synthetic discovery workspace' });
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discoveries), source, uuid: () => runId,
    now: () => new Date('2026-10-02T00:00:00.000Z'), renderer: renderer ?? ((input, kind) => ({ semantic: { contractVersion: 'research-automation-report-v1', kind, runId: input.run.runId, workspaceId: input.run.workspaceId }, html: Buffer.from(`<html><body>${kind}</body></html>`) })),
  });
  return { root, db, service };
}

async function waitFor(service: ResearchAutomationService, workspace: string, run: string, status: ResearchAutomationRun['status'], worker?: ResearchAutomationWorker): Promise<ResearchAutomationRun> {
  let latest: ResearchAutomationRun | undefined;
  for (let index = 0; index < 100; index += 1) {
    const value = await service.getRun(workspace, run); latest = value;
    if (worker?.lastError !== undefined) throw worker.lastError;
    if (value.status === status) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${status}; latest status was ${latest?.status ?? 'unknown'}.`);
}

// One owner proof covers attempt lifecycle, not browser gestures or SQL text.
test('failed and cancelled supplemental attempts do not advance report versions; restart reuses the frozen queued sources', async () => {
  let failInsight = false;
  const state = await fixture((input, kind) => {
    if (failInsight && kind === 'INSIGHT') throw new Error('Synthetic renderer failure after Market');
    return { semantic: { contractVersion: 'research-automation-report-v1', kind, runId, workspaceId },
      html: Buffer.from(`<html>${kind}</html>`) };
  });
  try {
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '14141414-1414-4414-8414-141414141414',
      mode: 'CATEGORY', keyword: 'synthetic attempt lifecycle', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
    await state.service.processNext();
    const awaiting = await state.service.getRun(workspaceId, runId);
    await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '15151515-1515-4515-8515-151515151515',
      expectedRevision: awaiting.revision, definition: 'Synthetic unchanged scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
      sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
    await state.service.processNext(); await state.service.processNext();
    const [original] = await state.service.listReportVersions(workspaceId, runId);
    assert.ok(original);
    const savedRun = state.db.prepare('SELECT * FROM analysis_research_automation_runs').all();
    const savedUsage = state.db.prepare('SELECT * FROM analysis_research_automation_usage').all();
    const request = { contractVersion: 'automation-report-revision-v1', requestKey: '16161616-1616-4616-8616-161616161616', previousPairId: original.pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
    const failed = await state.service.requestReportRevision(workspaceId, runId, request);
    failInsight = true; await state.service.processNext(); failInsight = false;
    assert.equal((await state.service.requestReportRevision(workspaceId, runId, request)).state, 'FAILED');
    assert.equal((await state.service.listReportVersions(workspaceId, runId)).length, 1);
    assert.equal((state.db.prepare('SELECT count(*) n FROM analysis_research_automation_attempt_outputs').get() as { n: bigint }).n, 0n);
    const cancelled = await state.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: '17171717-1717-4717-8717-171717171717' });
    assert.equal(cancelled.attemptNumber, failed.attemptNumber + 1);
    const cancelKey = '18181818-1818-4818-8818-181818181818';
    const cancellation = await state.service.cancelReportRevision(workspaceId, runId, cancelled.attemptId, cancelKey);
    assert.equal(cancellation.state, 'CANCELLED');
    const before = state.db.prepare('SELECT total_changes() n').get();
    assert.deepEqual(await state.service.cancelReportRevision(workspaceId, runId, cancelled.attemptId, cancelKey), { ...cancellation, exactRetry: true });
    assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
    assert.equal(await state.service.processNext(), false);
    const recovered = await state.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: '19191919-1919-4919-8919-191919191919' });
    const frozen = state.db.prepare('SELECT source_set_sha256 sha FROM analysis_research_automation_attempts WHERE attempt_id=?').get(recovered.attemptId);
    // Crash-state fixture: durable claim persisted, no output publication committed.
    state.db.prepare(`UPDATE analysis_research_automation_attempts SET state='RUNNING',started_at='2026-10-02T01:00:00.000Z' WHERE attempt_id=?`).run(recovered.attemptId);
    const inactiveHandle = new ResearchAutomationService({ db: state.db,
      artifactStore: new ContentAddressedArtifactStore(path.join(state.root, 'artifacts')),
      workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: state.db,
        artifactStore: new ContentAddressedArtifactStore(path.join(state.root, 'artifacts')) })) });
    await inactiveHandle.interruptActive();
    assert.deepEqual(state.db.prepare('SELECT state FROM analysis_research_automation_attempts WHERE attempt_id=?').get(recovered.attemptId), { state: 'RUNNING' });
    await state.service.recoverOnStart();
    assert.deepEqual(state.db.prepare('SELECT source_set_sha256 sha FROM analysis_research_automation_attempts WHERE attempt_id=?').get(recovered.attemptId), frozen);
    await state.service.processNext();
    const versions = await state.service.listReportVersions(workspaceId, runId);
    assert.deepEqual(versions.map(item => item.versionNumber), [1, 2]);
    assert.equal((await state.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: '19191919-1919-4919-8919-191919191919' })).attemptNumber, 3);
    assert.deepEqual(state.db.prepare('SELECT * FROM analysis_research_automation_runs').all(), savedRun);
    assert.deepEqual(state.db.prepare('SELECT * FROM analysis_research_automation_usage').all(), savedUsage);
    await assert.rejects(state.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: '20202020-2020-4020-8020-202020202020', definition: 'changed scope' }), /invalid/);
  } finally { state.db.close(); await fs.rm(state.root, { recursive: true, force: true }); }
});

test('start request keys are exact-idempotent and changed content conflicts', async () => {
  const state = await fixture();
  try {
    const request = { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333', mode: 'PRODUCT', keyword: 'calcium', description: 'Sản phẩm bổ sung\n- dạng viên\tcho người lớn', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] } as const;
    const first = await state.service.start(workspaceId, request);
    const retry = await state.service.start(workspaceId, request);
    assert.equal(first.exactRetry, false);
    assert.equal(retry.exactRetry, true);
    assert.equal(retry.run.runId, first.run.runId);
    await assert.rejects(() => state.service.start(workspaceId, { ...request, keyword: 'changed' }), (error: unknown) => error instanceof ResearchAutomationConflictError && error.code === 'request_key_conflict');
  } finally {
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('worker persists raw captures and reaches an immutable partial draft after explicit scope', async () => {
  const state = await fixture();
  const worker = new ResearchAutomationWorker({ service: state.service, db: state.db });
  try {
    const start = await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '44444444-4444-4444-8444-444444444444', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    await worker.start();
    const awaiting = await waitFor(state.service, workspaceId, runId, 'AWAITING_SCOPE', worker);
    assert.equal(worker.lastError, undefined);
    const confirmed = await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: awaiting.revision, definition: 'Vietnam calcium products\n- adults\tpriority', includeTerms: ['calcium'], excludeTerms: [], selectedProductIds: [cardId], peerProductIds: [cardId] });
    assert.equal(confirmed.run.status, 'COLLECTION_QUEUED');
    worker.wake();
    const ready = await waitFor(state.service, workspaceId, runId, 'DRAFT_READY', worker);
    const market = ready.outputs?.market;
    assert.ok(market);
    assert.equal(market.web, true);
    assert.equal(market.pdf.available, false);
    const captureCount = (state.db.prepare('SELECT count(*) AS count FROM analysis_research_automation_captures WHERE run_id=?').get(runId) as { count: bigint }).count;
    assert.equal(captureCount, 2n);
    const html = await state.service.readReport(workspaceId, runId, 'MARKET');
    assert.match(html.bytes.toString('utf8'), /MARKET/);
  } finally {
    await worker.close();
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('only one simultaneous worker pickup renders the queued report pair', async () => {
  const rendered: string[] = [];
  const renderer: ResearchAutomationReportRenderer = (input, kind) => {
    rendered.push(kind);
    return { semantic: { contractVersion: 'research-automation-report-v1', kind,
      runId: input.run.runId, workspaceId: input.run.workspaceId }, html: Buffer.from(`<html><body>${kind}</body></html>`) };
  };
  const state = await fixture(renderer);
  try {
    const artifacts = new ContentAddressedArtifactStore(path.join(state.root, 'artifacts'));
    const discoveries = new DiscoveryWorkspaceService({ db: state.db, artifactStore: artifacts });
    const second = new ResearchAutomationService({ db: state.db, artifactStore: artifacts,
      workspaceReader: new FlowDiscoveryWorkspaceReader(discoveries), renderer,
      now: () => new Date('2026-10-02T00:00:00.000Z') });
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1',
      requestKey: '12121212-1212-4212-8212-121212121212', mode: 'CATEGORY', keyword: 'synthetic pickup',
      requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
    await state.service.processNext();
    const awaiting = await state.service.getRun(workspaceId, runId);
    await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1',
      requestKey: '13131313-1313-4313-8313-131313131313', expectedRevision: awaiting.revision,
      definition: 'Synthetic empty selected scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] });
    await state.service.processNext();
    const picked = await Promise.all([state.service.processNext(), second.processNext()]);
    assert.deepEqual(picked.sort(), [false, true], 'A queued step must have exactly one successful claim');
    assert.deepEqual(rendered, ['MARKET', 'INSIGHT'], 'A losing worker must not run either renderer');
    const ready = await state.service.getRun(workspaceId, runId);
    assert.equal(ready.status, 'DRAFT_READY');
    assert.ok(ready.outputs?.market && ready.outputs.insight);
    assert.equal((state.db.prepare('SELECT count(*) n FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { n: bigint }).n, 2n);
  } finally {
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('an explicit no-product scope drafts without requesting or claiming product period collection', async () => {
  const source = syntheticSource();
  let collectCalls = 0;
  const state = await fixture(undefined, { ...source, collect: (input, options) => { collectCalls += 1; return source.collect(input, options); } });
  const worker = new ResearchAutomationWorker({ service: state.service, db: state.db });
  try {
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '16161616-1616-4161-8161-161616161616', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    await worker.start();
    const awaiting = await waitFor(state.service, workspaceId, runId, 'AWAITING_SCOPE', worker);
    await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '17171717-1717-4171-8171-171717171717', expectedRevision: awaiting.revision, definition: 'Exact listing not among the cards', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] });
    worker.wake();
    const ready = await waitFor(state.service, workspaceId, runId, 'DRAFT_READY', worker);
    assert.equal(collectCalls, 0);
    const collection = ready.steps.find((step) => step.stepId === 'COLLECTION');
    assert.equal(collection?.state, 'SKIPPED');
    assert.equal(collection?.code, 'NO_APPROVED_PRODUCT_REFS');
    assert.deepEqual(ready.coverage.sources.filter((value) => value.state === 'COLLECTED').map((value) => value.dataset), ['quick_search_product_cards']);
    assert.equal(ready.usage.entries.some((entry) => entry.stepId === 'COLLECTION'), false);
    assert.ok(ready.outputs?.market);
  } finally {
    await worker.close();
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('cancelling a delayed renderer closes the reports step and never publishes a draft', async () => {
  let rendererStarted!: () => void;
  let releaseRenderer!: () => void;
  const started = new Promise<void>((resolve) => { rendererStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseRenderer = resolve; });
  const state = await fixture(async (input, kind, signal) => {
    rendererStarted();
    await release;
    if (signal?.aborted) throw new Error('renderer aborted');
    return { semantic: { contractVersion: 'research-automation-report-v1', kind, runId: input.run.runId, workspaceId: input.run.workspaceId }, html: Buffer.from(`<html><body>${kind}</body></html>`) };
  });
  const worker = new ResearchAutomationWorker({ service: state.service, db: state.db });
  try {
    const start = await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '66666666-6666-4666-8666-666666666666', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    await worker.start();
    const awaiting = await waitFor(state.service, workspaceId, runId, 'AWAITING_SCOPE', worker);
    await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '77777777-7777-4777-8777-777777777777', expectedRevision: awaiting.revision, definition: 'Vietnam calcium products', includeTerms: ['calcium'], excludeTerms: [], selectedProductIds: [cardId], peerProductIds: [cardId] });
    worker.wake();
    await waitFor(state.service, workspaceId, runId, 'RENDERING');
    await started;
    const rendering = await state.service.getRun(workspaceId, runId);
    const cancelled = await state.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '88888888-8888-4888-8888-888888888888', expectedRevision: rendering.revision });
    assert.equal(cancelled.run.status, 'CANCELLED');
    assert.equal(cancelled.run.steps.find((step) => step.stepId === 'REPORTS')?.state, 'CANCELLED');
    releaseRenderer();
    await new Promise((resolve) => setTimeout(resolve, 10));
    const final = await state.service.getRun(workspaceId, runId);
    assert.equal(final.status, 'CANCELLED');
    assert.equal(final.outputs, undefined);
  } finally {
    releaseRenderer();
    await worker.close();
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('external report aborts settle cancellation without publishing at every boundary', async t => {
  for (const timing of ['before reports', 'last renderer', 'waiting publication'] as const) await t.test(timing, async () => {
    const controller = new AbortController();
    const artifactRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-report-abort-'));
    const html = Buffer.from('<html><body>MARKET</body></html>');
    let reportReads = 0;
    let reporting = false;
    let rendererCalls = 0;
    let reportStored!: () => void;
    const stored = new Promise<void>(resolve => { reportStored = resolve; });
    let lockAcquired!: () => void;
    const acquired = new Promise<void>(resolve => { lockAcquired = resolve; });
    let releasePublication!: () => void;
    const release = new Promise<void>(resolve => { releasePublication = resolve; });
    let publicationLock: Promise<void> | undefined;
    let processing: Promise<boolean> | undefined;
    class ObservedArtifactStore extends ContentAddressedArtifactStore {
      override async read(sha256: string, options?: { readonly maxBytes?: number }): Promise<Buffer> {
        if (reporting) reportReads += 1;
        return super.read(sha256, options);
      }
      override async put(bytes: Uint8Array) {
        const artifact = await super.put(bytes);
        if (reporting && Buffer.from(bytes).equals(html)) reportStored();
        return artifact;
      }
    }
    const artifacts = new ObservedArtifactStore(artifactRoot);
    const state = await fixture(async (input, kind) => {
      rendererCalls += 1;
      if (timing === 'last renderer') controller.abort();
      if (timing === 'waiting publication') {
        publicationLock = withDatabaseMutationMutex(state.db, async () => {
          lockAcquired();
          await release;
        });
        await acquired;
      }
      // Deliberately returns successfully even when the supplied signal aborted.
      return { semantic: { contractVersion: 'research-automation-report-v1', kind, runId: input.run.runId, workspaceId: input.run.workspaceId }, html };
    }, syntheticSource(), artifacts);
    try {
      await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '18181818-1818-4181-8181-181818181818', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
      assert.equal(await state.service.processNext(), true);
      const awaiting = await state.service.getRun(workspaceId, runId);
      await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '19191919-1919-4191-8191-191919191919', expectedRevision: awaiting.revision, definition: 'Vietnam calcium products', includeTerms: ['calcium'], excludeTerms: [], selectedProductIds: [cardId], peerProductIds: [] });
      assert.equal(await state.service.processNext(), true);
      assert.equal((await state.service.getRun(workspaceId, runId)).status, 'RENDERING');
      reporting = true;
      if (timing === 'before reports') controller.abort();
      processing = state.service.processNext(controller.signal);
      if (timing === 'waiting publication') {
        await stored;
        // The final CAS write has completed; let its continuation queue publication
        // behind the held real mutation mutex before delivering the abort.
        await new Promise<void>(resolve => setImmediate(resolve));
        assert.equal((state.db.prepare('SELECT count(*) AS count FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { count: bigint }).count, 0n);
        controller.abort();
        releasePublication();
      }
      assert.equal(await processing, true);
      await publicationLock;
      if (timing === 'before reports') assert.equal(reportReads, 0, 'An already-aborted report must not start reading method inputs');
      assert.equal(rendererCalls, timing === 'before reports' ? 0 : 1);
      const cancelled = await state.service.getRun(workspaceId, runId);
      assert.equal(cancelled.status, 'CANCELLED');
      assert.equal(cancelled.steps.find(step => step.stepId === 'REPORTS')?.state, 'CANCELLED');
      assert.equal(cancelled.steps.find(step => step.stepId === 'REPORTS')?.code, 'CANCELLED_DURING_REPORT_RENDERING');
      assert.equal(cancelled.outputs, undefined);
      assert.equal((state.db.prepare('SELECT count(*) AS count FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { count: bigint }).count, 0n);
      assert.equal((state.db.prepare('SELECT count(*) AS count FROM foundation_source_packages').get() as { count: bigint }).count, 0n);
    } finally {
      releasePublication();
      await processing;
      await publicationLock;
      state.db.close();
      await fs.rm(state.root, { recursive: true, force: true });
      await fs.rm(artifactRoot, { recursive: true, force: true });
    }
  });
});

test('cancelling an in-flight provider settles all downstream steps as skipped', async () => {
  let providerStarted!: () => void;
  const started = new Promise<void>((resolve) => { providerStarted = resolve; });
  const base = syntheticSource();
  const source: AutomationSourcePort = {
    id: base.id,
    async quickSearch(input, options) {
      providerStarted();
      await new Promise<never>((_resolve, reject) => {
        options?.signal?.addEventListener('abort', () => reject(new Error('synthetic provider abort')), { once: true });
      });
      return base.quickSearch(input, options);
    },
    collect: base.collect,
  };
  const state = await fixture(undefined, source);
  const worker = new ResearchAutomationWorker({ service: state.service, db: state.db });
  try {
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '12121212-1212-4121-8121-121212121212', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    await worker.start();
    await waitFor(state.service, workspaceId, runId, 'QUICK_SEARCH_RUNNING', worker);
    await started;
    const running = await state.service.getRun(workspaceId, runId);
    const cancelled = await state.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '13131313-1313-4131-8131-131313131313', expectedRevision: running.revision });
    assert.equal(cancelled.run.status, 'CANCELLING');
    const final = await waitFor(state.service, workspaceId, runId, 'CANCELLED', worker);
    const steps = new Map(final.steps.map((step) => [step.stepId, step]));
    assert.equal(steps.get('QUICK_SEARCH')?.state, 'CANCELLED');
    assert.equal(steps.get('COLLECTION')?.state, 'SKIPPED');
    assert.equal(steps.get('COLLECTION')?.code, 'SKIPPED_AFTER_STOP');
    assert.equal(steps.get('REPORTS')?.state, 'SKIPPED');
    assert.equal(steps.get('REPORTS')?.code, 'SKIPPED_AFTER_STOP');
  } finally {
    await worker.close();
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('invalid renderer PDF fails the reports step without publishing outputs', async () => {
  const state = await fixture((input, kind) => ({
    semantic: { contractVersion: 'research-automation-report-v1', kind, runId: input.run.runId, workspaceId: input.run.workspaceId },
    html: Buffer.from(`<html><body>${kind}</body></html>`),
    pdf: Buffer.from('not a pdf'),
  }));
  const worker = new ResearchAutomationWorker({ service: state.service, db: state.db });
  try {
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    await worker.start();
    const awaiting = await waitFor(state.service, workspaceId, runId, 'AWAITING_SCOPE');
    await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', expectedRevision: awaiting.revision, definition: 'Vietnam calcium products', includeTerms: ['calcium'], excludeTerms: [], selectedProductIds: [cardId], peerProductIds: [cardId] });
    worker.wake();
    const failed = await waitFor(state.service, workspaceId, runId, 'FAILED');
    assert.equal(failed.steps.find((step: { stepId: string; code?: string | null }) => step.stepId === 'REPORTS')?.code, 'REPORT_RENDER_FAILED');
    assert.equal(failed.outputs, undefined);
    assert.equal((state.db.prepare('SELECT count(*) AS count FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { count: bigint }).count, 0n);
  } finally {
    await worker.close();
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('worker close interrupts an in-flight provider once and restart does not replay it', async () => {
  let releaseProvider!: () => void;
  const providerGate = new Promise<void>((resolve) => { releaseProvider = resolve; });
  const base = syntheticSource();
  let providerCalls = 0;
  const source: AutomationSourcePort = {
    id: base.id,
    async quickSearch(input, options) {
      providerCalls += 1;
      await providerGate;
      const bound = await base.quickSearch(input, options);
      return { ...bound, result: { ...bound.result, usage: { ...bound.result.usage, paidRequestsIssued: 1, ambiguousPaidRequests: 1, credits: { status: 'UNKNOWN', unit: null, reason: 'synthetic interruption' } } } } as any;
    },
    collect: base.collect,
  };
  const state = await fixture(undefined, source);
  const worker = new ResearchAutomationWorker({ service: state.service, db: state.db });
  let restarted: ResearchAutomationWorker | undefined;
  try {
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '99999999-9999-4999-8999-999999999999', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    await worker.start();
    await waitFor(state.service, workspaceId, runId, 'QUICK_SEARCH_RUNNING');
    const closing = worker.close();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal((await state.service.getRun(workspaceId, runId)).status, 'INTERRUPTED');
    releaseProvider();
    await closing;
    assert.equal(providerCalls, 1);
    restarted = new ResearchAutomationWorker({ service: state.service, db: state.db });
    await restarted.start();
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.equal(providerCalls, 1);
    const final = await state.service.getRun(workspaceId, runId);
    assert.equal(final.status, 'INTERRUPTED');
    const steps = new Map(final.steps.map((step) => [step.stepId, step]));
    assert.equal(steps.get('QUICK_SEARCH')?.state, 'INTERRUPTED');
    assert.equal(steps.get('COLLECTION')?.state, 'SKIPPED');
    assert.equal(steps.get('COLLECTION')?.code, 'SKIPPED_AFTER_STOP');
    assert.equal(steps.get('REPORTS')?.state, 'SKIPPED');
    assert.equal(steps.get('REPORTS')?.code, 'SKIPPED_AFTER_STOP');
    assert.equal((state.db.prepare('SELECT count(*) AS count FROM analysis_research_automation_captures WHERE run_id=?').get(runId) as { count: bigint }).count, 1n);
    assert.equal((state.db.prepare("SELECT cost_state AS state FROM analysis_research_automation_usage WHERE run_id=?").get(runId) as { state: string }).state, 'UNKNOWN');
    await restarted.close();
  } finally {
    releaseProvider();
    await worker.close();
    if (restarted) await restarted.close();
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('report publication transaction failure settles the run without partial outputs', async () => {
  const state = await fixture();
  try {
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '14141414-1414-4141-8141-141414141414', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
    assert.equal(await state.service.processNext(), true);
    const awaiting = await state.service.getRun(workspaceId, runId);
    await state.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '15151515-1515-4151-8151-151515151515', expectedRevision: awaiting.revision, definition: 'Vietnam calcium products', includeTerms: ['calcium'], excludeTerms: [], selectedProductIds: [cardId], peerProductIds: [cardId] });
    assert.equal(await state.service.processNext(), true);
    state.db.exec(`CREATE TRIGGER synthetic_output_publication_failure
      BEFORE INSERT ON analysis_research_automation_outputs
      WHEN NEW.report_kind = 'INSIGHT'
      BEGIN
        SELECT RAISE(ABORT, 'synthetic output publication failure');
      END;`);

    await state.service.processNext();

    const failed = await state.service.getRun(workspaceId, runId);
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.steps.find((step) => step.stepId === 'REPORTS')?.state, 'FAILED');
    assert.equal(failed.steps.find((step) => step.stepId === 'REPORTS')?.code, 'REPORT_RENDER_FAILED');
    assert.equal((state.db.prepare('SELECT count(*) AS count FROM analysis_research_automation_outputs WHERE run_id=?').get(runId) as { count: bigint }).count, 0n);
  } finally {
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
  }
});

test('worker close during artifact read prevents a provider claim', async () => {
  let readStarted!: () => void;
  let releaseRead!: () => void;
  const started = new Promise<void>((resolve) => { readStarted = resolve; });
  const release = new Promise<void>((resolve) => { releaseRead = resolve; });
  class DelayedArtifactStore extends ContentAddressedArtifactStore {
    #delay = false;

    arm(): void {
      this.#delay = true;
    }

    override async read(sha256: string, options?: { readonly maxBytes?: number }): Promise<Buffer> {
      if (this.#delay) {
        this.#delay = false;
        readStarted();
        await release;
      }
      return super.read(sha256, options);
    }
  }
  const base = syntheticSource();
  let providerCalls = 0;
  const source: AutomationSourcePort = {
    id: base.id,
    async quickSearch(input, options) {
      providerCalls += 1;
      return base.quickSearch(input, options);
    },
    collect: base.collect,
  };
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-research-automation-artifact-read-'));
  const artifacts = new DelayedArtifactStore(path.join(root, 'artifacts'));
  const state = await fixture(undefined, source, artifacts);
  const worker = new ResearchAutomationWorker({ service: state.service, db: state.db });
  try {
    await state.service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '16161616-1616-4161-8161-161616161616', mode: 'PRODUCT', keyword: 'calcium', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
    artifacts.arm();
    await worker.start();
    await started;
    const closing = worker.close();
    releaseRead();
    await closing;
    assert.equal(providerCalls, 0);
    assert.equal((await state.service.getRun(workspaceId, runId)).status, 'INTERRUPTED');
  } finally {
    releaseRead();
    await worker.close();
    state.db.close();
    await fs.rm(state.root, { recursive: true, force: true });
    await fs.rm(root, { recursive: true, force: true });
  }
});
