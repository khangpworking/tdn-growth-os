import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import {
  ResearchAutomationConflictError,
  ResearchAutomationService,
  ResearchAutomationWorker,
  type AutomationSourcePort,
  type ResearchAutomationReportRenderer,
} from '../../src/modules/analysis/research-automation/index.js';
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

async function fixture(renderer?: ResearchAutomationReportRenderer, source: AutomationSourcePort = syntheticSource()) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-research-automation-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now: () => new Date('2026-10-02T00:00:00.000Z') }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now: () => new Date('2026-10-01T00:00:00.000Z') });
  await discoveries.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'research-automation', title: 'Synthetic discovery workspace' });
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discoveries), source, uuid: () => runId,
    now: () => new Date('2026-10-02T00:00:00.000Z'), renderer: renderer ?? ((input, kind) => ({ semantic: { contractVersion: 'research-automation-report-v1', kind, runId: input.run.runId, workspaceId: input.run.workspaceId }, html: Buffer.from(`<html><body>${kind}</body></html>`) })),
  });
  return { root, db, service };
}

async function waitFor(service: ResearchAutomationService, workspace: string, run: string, status: string, worker?: ResearchAutomationWorker): Promise<any> {
  let latest: any;
  for (let index = 0; index < 100; index += 1) {
    const value = await service.getRun(workspace, run); latest = value;
    if (worker?.lastError !== undefined) throw worker.lastError;
    if (value.status === status) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${status}; latest status was ${latest?.status ?? 'unknown'}.`);
}

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
    assert.equal(ready.outputs.market.web, true);
    assert.equal(ready.outputs.market.pdf.available, false);
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
