import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { reportVisibleText } from '../helpers/report-visible-text.js';
import { assertNoPublicReviewZeroPlaceholder, assertPublicReviewVisibleText } from '../helpers/shopee-public-visible-text.js';
import { FakeClock, FakeTransport, assertNoRawLeak, retainedFiles, successfulScript, throwingSpy } from '../helpers/shopee-public-fakes.js';
import { AT, PRODUCTS, RAW_SENTINELS, RESULT_A, RESULT_B, RESULT_C, TOKEN } from '../fixtures/shopee-public-results.js';

// BEGIN PHASE-2 BINDING: adapt real service options, references and schema projections here only.
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { publicScenario, candidateBaselines, sourceGate } from '../helpers/shopee-public-scenario.js';
const binding = {
  scenario: publicScenario,
  candidateBaselines,
  gate: sourceGate,
  passage(html: string): string {
    const document = new JSDOM(html).window.document;
    try {
      const node = document.querySelector('.public-review-source');
      assert.ok(node, 'actual nonempty source passage required');
      return reportVisibleText(`<body>${node.outerHTML}</body>`);
    } finally { document.defaultView?.close(); }
  },
};
// END PHASE-2 BINDING. Assertions and expected strings below are frozen in phase 1.

const LIMITS = (cap: number) => [
  'Nguồn: review công khai trên Shopee.',
  `Lượt đọc này lấy tối đa ${cap} đánh giá dạng chữ cho mỗi sản phẩm, trong phần trang sản phẩm hiển thị khi bật bộ lọc “có bình luận”. Phạm vi này không phải toàn bộ lịch sử đánh giá.`,
  'Một số đánh giá chỉ có thuộc tính dạng chữ, không có bình luận tự do. Số bình luận đọc được được ghi riêng với số bản ghi đánh giá.',
  'Thời gian đánh giá được giữ theo cách trang sản phẩm hiển thị, theo giờ Việt Nam. Kỳ báo cáo không giới hạn ngày của các đánh giá này.',
  'Số đánh giá không phải số người. Nội dung chưa được mã hóa; chưa có kết luận về tỷ lệ ý kiến hay đặc điểm khách hàng.',
];
const EMPTY = 'Chưa thu được đánh giá trong lượt này; không suy ra sản phẩm không có đánh giá.';
const NO_COMMENT = 'Chưa có bình luận tự do để đọc.';
const HUMAN_BLOCK = 'Lượt đọc cần người vận hành xử lý đăng nhập hoặc xác minh. Phần dữ liệu đã đọc được giữ lại; lượt này đã dừng.';
const CAP_MET = 'Đã đạt giới hạn của lượt đọc; điều này không có nghĩa đã đọc hết đánh giá.';
const short = (cap: number) => `Số bản ghi giữ được ít hơn giới hạn ${cap} đánh giá của lượt đọc.`;
const trial = (cap: number) => `Đây là mẫu thử nhỏ, tối đa ${cap} đánh giá mỗi sản phẩm, được thu cho báo cáo thử nghiệm. Mẫu này không đại diện cho toàn bộ đánh giá.`;
const hasLine = (text: string, line: string) => assert.ok(text.includes(line), `missing fixed copy: ${line}`);
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const passage = (html: string): string => binding.passage(html);

test('S1 config/status are read-only, flag-off has no factory/root/card; enabled has the free S05 card', async t => {
  const f = await binding.scenario(t);
  for (const flag of [undefined, '0']) {
    const before = await retainedFiles(f.root);
    const status = await f.status({ flag, companions: 'malformed' });
    assert.equal(status.sources.some((r: any) => r.source === 'SHOPEE_PUBLIC_REVIEWS'), false);
    assert.equal(f.publicFactoryCalls.length, 0); assert.equal(f.transport.calls.length, 0);
    assert.deepEqual(await retainedFiles(f.root), before);
  }
  const status = await f.status({ flag: '1', cap: 300 });
  const index = status.sources.findIndex((r: any) => r.source === 'SHOPEE_PUBLIC_REVIEWS');
  assert.ok(index > 0); assert.equal(index, status.sources.findIndex((r: any) => r.source === 'APIFY_SHOPEE') + 1);
  const card = status.sources[index];
  assert.deepEqual({ registryIds: card.registryIds, tier: card.tier, group: card.group, reportName: card.reportName, paid: card.paid,
    arrival: card.arrival, credential: card.credential, spendCapUsd: card.spendCapUsd, maxRecordsPerProduct: card.maxRecordsPerProduct, state: card.state },
  { registryIds: ['S05'], tier: 'B', group: 'CUSTOMER_VOICE', reportName: 'review công khai trên Shopee', paid: false,
    arrival: 'FREE_COLLECT', credential: 'CONFIGURED', spendCapUsd: null, maxRecordsPerProduct: 300, state: 'READY' });
  assert.equal((await f.status({ flag: '1', executorEnabled: false })).sources[index].state, 'EXECUTOR_DISABLED');
  assert.equal(f.transport.calls.length, 0); assert.equal(JSON.stringify(status).includes(TOKEN), false);
});
for (const cap of [1, 7, 20, 21, 299, 300]) test(`S8 explicit standard confirmation atomically freezes C=${cap} with no native lookup`, async t => {
  const f = await binding.scenario(t, { cap, productCount: 5 });
  const confirmed = await f.confirmPublic();
  assert.equal(confirmed.contractVersion, 'automation-confirmed-source-set-v2');
  assert.deepEqual(confirmed.nativeReview, { decision: 'NONE' });
  assert.deepEqual(confirmed.reviewAcquisition, { providerId: 'shopee-public-review', maxReviewsPerProduct: cap, mappingRevision: 'shopee-public-review-row-v1', sampleMode: 'STANDARD' });
  assert.equal(confirmed.scope.testReviewCap, undefined); assert.equal(confirmed.scope.exactShopeeUrls.length, 5);
  assert.equal(f.nativeInventorySpy.calls.length, 0); assert.equal(f.transport.calls.length, 0);
  assert.equal(confirmed.sha256, hash(confirmed.bytes));
  const changes = f.db.prepare('SELECT total_changes() n').get();
  await assert.rejects(f.confirmPublic({ sameRequestKey: true, cap: cap === 1 ? 20 : 1 }));
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
});
for (const mode of ['SKIP', 'RESOLVED', 'DAMAGED', 'AMBIGUOUS', 'UNSUPPORTED']) test(`S8 native decision ${mode} never falls through to a collector`, async t => {
  const f = await binding.scenario(t, { native: mode });
  if (['DAMAGED', 'AMBIGUOUS', 'UNSUPPORTED'].includes(mode)) await assert.rejects(f.confirmNative());
  else {
    const source = await f.confirmNative(); assert.equal(source.contractVersion, 'automation-confirmed-source-set-v1');
    await f.finish();
  }
  assert.equal(f.transport.calls.length, 0); assert.equal(f.publicFactoryCalls.length, 0); assert.equal(f.paidSpy.calls.length, 0);
});
for (const option of [{ mode: 'TRIAL' as const, cap: 21 }, { mode: 'TRIAL' as const, cap: 20, reports: ['INSIGHT'] },
  { mode: 'TRIAL' as const, cap: 20, reports: ['MARKET', 'INSIGHT'] }, { private: true }, { policy: true }]) test(`S8 unauthorized source combination ${JSON.stringify(option)}`, async t => {
  const f = await binding.scenario(t, option); const before = f.db.prepare('SELECT total_changes() n').get();
  await assert.rejects(f.confirmPublic()); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  assert.equal(f.transport.calls.length, 0); assert.equal(f.paidSpy.calls.length, 0);
});
test('S8 fresh legacy acquiring confirmation requires explicit v3; SKIP and resolved native remain legacy', async t => {
  const f = await binding.scenario(t); await assert.rejects(f.confirmLegacyAcquire()); assert.equal(f.transport.calls.length, 0);
});
test('S8 confirmation transaction rollback leaves no partial scope/request/source-set rows', async t => {
  const f = await binding.scenario(t); const before = await f.confirmationRows();
  await assert.rejects(f.confirmPublic({ faultAt: 'source-set-transaction' }));
  assert.deepEqual(await f.confirmationRows(), before); assert.equal(f.transport.calls.length, 0);
});
for (const cap of [1, 20, 21, 299, 300]) test(`S8 auto-run uses explicit public standard acquisition at ${cap} without trial reduction`, async t => {
  const f = await binding.scenario(t, { cap }); const confirmation = await f.autoRunToConfirmation();
  assert.equal(confirmation.contractVersion, 'research-automation-confirm-v3');
  assert.deepEqual(confirmation.sources.nativeReview, { decision: 'COLLECT_EXACT', providerId: 'shopee-public-review', maxReviewsPerProduct: cap });
  assert.deepEqual(confirmation.exactShopeeUrls, f.unchangedPickedUrls); assert.ok(confirmation.exactShopeeUrls.length <= 5);
  assert.equal(confirmation.testReviewCap, undefined);
});
for (const cap of [1, 20]) test(`S8 auto-run trial uses explicit public test acquisition at ${cap}`, async t => {
  const f = await binding.scenario(t, { cap, mode: 'TRIAL' }); const confirmation = await f.autoRunToConfirmation();
  assert.equal(confirmation.contractVersion, 'research-automation-confirm-v3');
  assert.deepEqual(confirmation.sources.nativeReview, { decision: 'COLLECT_EXACT_TEST', providerId: 'shopee-public-review', maxReviewsPerProduct: cap });
});
test('S8 auto-run empty URL selection remains SKIP without public dispatch', async t => {
  const f = await binding.scenario(t); const confirmation = await f.autoRunToConfirmation({ emptySelection: true });
  assert.equal(confirmation.sources.nativeReview, 'SKIP'); assert.equal(f.publicFactoryCalls.length, 0); assert.equal(f.transport.calls.length, 0);
});

for (const faultAt of ['before-base-checkpoint-commit', 'job-running', 'after-retention-before-finalization']) test(`S4 real worker recovery at ${faultAt}`, async t => {
  const f = await binding.scenario(t, { faultAt });
  assert.ok(f.service instanceof ResearchAutomationService);
  await f.confirmPublic(); await assert.rejects(f.processToFault());
  const callsBefore = f.transport.calls.length;
  const baseBefore = await f.baseRows();
  const restarted = await f.recreateFromDisk({ throwBase: true, throwPaid: true, throwSearch: true, throwPdf: true, throwOtherProviders: true, throwModel: true });
  assert.ok(restarted.service instanceof ResearchAutomationService);
  await restarted.service.recoverOnStart(); await restarted.finish();
  const tailCalls = restarted.transport.calls.slice(callsBefore);
  if (faultAt === 'job-running') {
    assert.ok(tailCalls.length > 0); assert.ok(tailCalls.every((call: any) => call.method === 'GET' && /^\/jobs\/[^/]+(?:\/result)?$/u.test(new URL(call.url).pathname)));
    assert.deepEqual(await restarted.baseRows(), baseBefore);
  } else assert.equal(tailCalls.length, 0);
  assert.equal(restarted.paidSpy.calls.length, 0); assert.equal(restarted.baseSpy.calls.length, 0);
  if (faultAt === 'before-base-checkpoint-commit') { assert.equal(restarted.transport.posts().length, 0); assert.equal(await restarted.statusCode(), 'INTERRUPTED'); }
  else {
    const before = await restarted.allReportAndUsageBytes();
    await restarted.service.recoverOnStart(); await restarted.finish();
    assert.deepEqual(await restarted.allReportAndUsageBytes(), before);
  }
});
for (const faultAt of ['damaged-base-checkpoint', 'human-block-finalized', 'cancel-intent-finalized']) test(`S4 ${faultAt} never reopens acquisition`, async t => {
  const f = await binding.scenario(t, { faultAt }); await f.confirmPublic(); await f.prepareRecoveryCase();
  const restarted = await f.recreateFromDisk({ throwAllProviders: true });
  await restarted.service.recoverOnStart(); await restarted.finish();
  assert.equal(restarted.transport.calls.length, 0); assert.equal(restarted.paidSpy.calls.length, 0);
});
test('S4 checkpoint schema enforces FKs, immutable exact retry and existing step guards', async t => {
  const f = await binding.scenario(t, { faultAt: 'job-running' }); await f.confirmPublic(); await assert.rejects(f.processToFault());
  const table = 'analysis_research_automation_review_stages';
  const rows = f.db.prepare(`SELECT * FROM ${table}`).all(); assert.equal(rows.length, 1);
  assert.equal(f.db.prepare(`PRAGMA table_list('${table}')`).get().strict, 1n);
  const foreignKeys = f.db.prepare(`PRAGMA foreign_key_list('${table}')`).all();
  assert.deepEqual(foreignKeys.map((r: any) => r.from).sort(), ['base_step_sha256', 'confirmed_source_set_sha256', 'run_id']);
  assert.equal(foreignKeys.filter((r: any) => r.table === 'artifact_manifests').length, 2);
  assert.throws(() => f.db.prepare(`UPDATE ${table} SET created_at='2026-02-02T00:00:00.000Z'`).run());
  assert.throws(() => f.db.prepare(`DELETE FROM ${table}`).run());
  assert.throws(() => f.db.prepare(`INSERT INTO ${table} VALUES (?, ?, ?, ?)`).run('missing-run', 'f'.repeat(64), 'e'.repeat(64), AT));
  assert.deepEqual(await f.retryBaseCheckpoint(), { exactRetry: true });
  assert.deepEqual(f.db.prepare(`SELECT * FROM ${table}`).all(), rows);
  const step = f.db.prepare("SELECT * FROM analysis_research_automation_steps WHERE step_id='COLLECTION' AND run_id=?").get(f.runId);
  assert.equal(step.state, 'RUNNING'); assert.equal(step.result_sha256, null);
  assert.throws(() => f.db.prepare("UPDATE analysis_research_automation_steps SET result_sha256=? WHERE run_id=? AND step_id='COLLECTION'").run(rows[0].base_step_sha256, f.runId));
  assert.throws(() => f.db.prepare("UPDATE analysis_research_automation_steps SET state='RUNNING' WHERE run_id=? AND step_id='COLLECTION'").run(f.runId));
  const before = await f.baseRows(); await assert.rejects(f.persistBaseCheckpoint({ faultAt: 'transaction' })); assert.deepEqual(await f.baseRows(), before);
  const restarted = await f.recreateFromDisk(); await restarted.service.recoverOnStart();
  const queued = await restarted.collectionStep(); if (queued.state === 'QUEUED') assert.equal(queued.result_sha256, null);
  await restarted.finish(); await assert.rejects(restarted.reopenSettledStep());
});
test('S4 historical read-only database without checkpoint table replays without querying the missing table', async t => {
  const f = await binding.scenario(t); const historical = await f.historicalReadOnlyWithoutStages();
  const bytes = await historical.readReports(); assert.ok(bytes.length > 0); assert.equal(historical.transport.calls.length, 0);
});
test('S2 acquisition-wide absolute deadline stops the next product after restart', async t => {
  const f = await binding.scenario(t, { productCount: 5, faultAt: 'between-products' }); await f.confirmPublic(); await assert.rejects(f.processToFault());
  const first = await f.persistedDeadlines(); assert.equal(first.acquisitionDeadline - first.firstIntent, 12000000);
  const restarted = await f.recreateFromDisk({ nowMilliseconds: first.acquisitionDeadline }); await restarted.service.recoverOnStart(); await restarted.finish();
  assert.equal(restarted.transport.posts().length, 0); assert.deepEqual(await restarted.persistedDeadlines(), first);
});
for (const state of ['partial', 'failed', 'cancelled', 'interrupted', 'needs_login', 'needs_verification']) test(`S2 serial continuation policy after ${state}`, async t => {
  const f = await binding.scenario(t, { state, counts: [1, 1, 1] }); await f.confirmPublic(); await f.finish();
  const stopped = state.startsWith('needs_'); assert.equal(f.transport.posts().length, stopped ? 1 : 3);
  assert.equal(f.transport.calls.filter((c: any) => new URL(c.url).pathname === '/health').length, stopped ? 1 : 3);
  assert.equal((await f.receipts()).length, 3, 'receipts include unsubmitted products');
  if (stopped) { assert.equal((await f.outcome()).outcome, 'PROVIDER_BLOCKED'); assert.equal((await f.receipts())[1].jobId, null); }
});

for (const field of ['source-set', 'step', 'collection', 'page', 'envelope', 'corpus', 'report', 'reader-build']) test(`S8 actual reader rejects corrupt ${field} despite rehashed semantic wrapper`, async t => {
  const f = await binding.scenario(t); await f.confirmPublic(); await f.finish(); await f.buildReader();
  await f.corruptRetained(field, { rehashSemanticWrapper: true });
  const before = f.transport.calls.length;
  if (field !== 'reader-build') await assert.rejects(f.readReport());
  if (field !== 'report') await assert.rejects(f.readReader());
  assert.equal(f.transport.calls.length, before, 'integrity failure never authorizes replacement'); assert.equal(f.paidSpy.calls.length, 0);
});
test('S8 frozen source survives runtime cap/token/flag changes without substitution', async t => {
  const f = await binding.scenario(t, { cap: 7 }); await f.confirmPublic();
  await f.setRuntime({ enabled: true, cap: 300, token: 'synthetic-different-token', paid: true });
  await f.finish(); assert.ok(f.transport.posts().every((c: any) => JSON.parse(c.init.body).max_comments === 7));
  const bytes = await f.allReportAndUsageBytes(); const n = f.transport.calls.length;
  await f.setRuntime({ enabled: false }); await f.readReport(); await f.buildReader(); await f.readReader(); await f.exportReport();
  assert.equal(f.transport.calls.length, n); assert.deepEqual(await f.existingReportAndUsageBytes(), bytes); assert.equal(f.paidSpy.calls.length, 0);
});
test('S8 KEEP retains marker/reference/corpus; SKIP removes evidence, outcome and disclosure', async t => {
  const f = await binding.scenario(t); await f.confirmPublic(); await f.finish(); const original = await f.retainedReviewContext();
  const n = f.transport.calls.length; await f.revise('KEEP'); assert.deepEqual(await f.retainedReviewContext(), original);
  await f.revise('SKIP'); assert.equal(await f.retainedReviewContext(), undefined);
  const html = await f.readReport(); assert.equal(html.includes(LIMITS(20)[0]), false); assert.equal(f.transport.calls.length, n);
});
test('S7 actual retention admits the three synthetic products without storing raw author/media/composed fields', async t => {
  const f = await binding.scenario(t, { cap: 20 }); await f.setResults([RESULT_A, RESULT_B, RESULT_C]); await f.confirmPublic(); await f.finish();
  assert.deepEqual((await f.outcome()).listings.map((l: any) => l.reviews), [2, 1, 1]); assert.equal(f.transport.posts().length, 3);
  assert.equal((await f.corpus()).counts.readableCommentRecords, 3);
  await assertNoRawLeak(f.root, RAW_SENTINELS, [f.logs, f.errors, await f.packages()]);
});
test('S8 raw-only evidence stays NOT_CODED and never invokes private/literal/AI coding', async t => {
  const f = await binding.scenario(t, { reports: ['MARKET', 'INSIGHT'] }); await f.confirmPublic(); await f.finish();
  const output = await f.semantic(); assert.equal(output.reviewAdmission, 'RAW_CAPTURE_ONLY'); assert.equal(output.reviewCodingState, 'NOT_CODED');
  assert.equal(output.reviewCorpus, undefined); assert.ok(output.publicReviewCorpus);
  assert.equal(f.codingSpy.calls.length, 0); assert.equal(f.modelSpy.calls.length, 0);
  assert.ok((await f.reviewDependentSections()).every((s: any) => s.state !== 'METHOD_OUTPUT'));
  assert.equal((await f.usage()).filter((u: any) => u.operation === 'reviews').length, 1);
  const usage = (await f.usage()).find((u: any) => u.operation === 'reviews');
  assert.deepEqual({ state: usage.costState, unit: usage.costUnit, amount: usage.costAmount }, { state: 'KNOWN', unit: 'USD', amount: '0' });
});
for (const state of ['needs_login', 'app-timeout', 'successful-empty']) test(`S8 zero-USD usage and stable attempt time for ${state}`, async t => {
  const f = await binding.scenario(t, { state, counts: [0, 0, 0] }); await f.confirmPublic(); await f.finish();
  const usage = (await f.usage()).filter((u: any) => u.operation === 'reviews'); assert.equal(usage.length, 1);
  assert.deepEqual({ state: usage[0].costState, unit: usage[0].costUnit, amount: usage[0].costAmount }, { state: 'KNOWN', unit: 'USD', amount: '0' });
  const outcome = await f.outcome(); const bytes = await f.allReportAndUsageBytes(); const before = f.transport.calls.length;
  f.clock.advance(86400000); await f.readReport(); await f.readReport();
  assert.equal((await f.outcome()).attemptedAt, outcome.attemptedAt); assert.equal((await f.outcome()).reused, outcome.reused);
  assert.deepEqual(await f.allReportAndUsageBytes(), bytes); assert.equal(f.transport.calls.length, before);
});
for (const stage of ['before-submit', 'post-without-id', 'sleep', 'poll', 'result-stream']) test(`S5 actual owner abort during ${stage} settles CANCELLED with pre-abort evidence only`, async t => {
  const f = await binding.scenario(t); await f.confirmPublic(); await f.abortAt(stage); await f.finish();
  assert.equal((await f.service.getRun(f.workspaceId, f.runId)).status, 'CANCELLED');
  const afterAbort = f.transport.calls.slice(f.abortInvocationIndex);
  assert.ok(afterAbort.every((call: any) => call.method === 'POST' && new URL(call.url).pathname.endsWith('/cancel')));
  assert.ok(afterAbort.length <= 1); assert.equal(f.transport.posts().length, stage === 'before-submit' ? 0 : 1);
  assert.deepEqual(await f.retainedRows(), f.validatedRowsAtAbort); await assertNoRawLeak(f.root, RAW_SENTINELS, [f.errors, f.logs]);
});
test('S5 crash after durable cancel intent never resends uncertain cancellation', async t => {
  const f = await binding.scenario(t, { faultAt: 'after-cancel-intent-before-dispatch' }); await f.confirmPublic(); await assert.rejects(f.abortAt('poll'));
  const restarted = await f.recreateFromDisk({ throwAllProviders: true }); await restarted.service.recoverOnStart(); await restarted.finish();
  assert.equal(restarted.transport.calls.length, 0); assert.equal((await restarted.service.getRun(f.workspaceId, f.runId)).status, 'CANCELLED');
});
test('S5 service cancelled is distinct from owner-aborted top-level state', async t => {
  const f = await binding.scenario(t, { state: 'cancelled', counts: [1, 1, 1] }); await f.confirmPublic(); await f.finish();
  assert.equal((await f.service.getRun(f.workspaceId, f.runId)).status, 'DRAFT_READY'); assert.equal((await f.outcome()).outcome, 'PARTIAL_LISTINGS');
});
test('S5 persisted dispatch gap explicitly exposes uncertainty instead of an exact usage count', async t => {
  const f = await binding.scenario(t, { faultAt: 'after-request-count-before-fetch' }); await f.confirmPublic(); await assert.rejects(f.processToFault());
  const restarted = await f.recreateFromDisk(); await restarted.service.recoverOnStart(); await restarted.finish();
  const receipt = (await restarted.receipts())[0]; assert.equal(receipt.requestCountUncertain, true);
  assert.ok(receipt.requestCount >= restarted.transport.calls.length); assert.equal((await restarted.status()).exactInvocationCount, undefined);
});
test('S4 bounded corpus fallback retains exact capture/accounting and a verified artifact reference', async t => {
  const f = await binding.scenario(t); await f.setCorpusSizeCase('inline-budget'); await f.confirmPublic(); await f.finish();
  const semantic = await f.semantic(); assert.ok(semantic.publicReviewCorpusReference); assert.equal(semantic.publicReviewCorpus, undefined);
  await f.readReport(); await f.corruptRetained('corpus-reference', { rehashSemanticWrapper: true }); await assert.rejects(f.readReport());
  const g = await binding.scenario(t); await g.setCorpusSizeCase('over-8MiB'); await g.confirmPublic(); await g.finish();
  assert.equal((await g.semantic()).publicReviewCorpusFailure, 'PUBLIC_REVIEW_CORPUS_TOO_LARGE'); assert.ok(await g.sanitizedCapture()); assert.ok(await g.accounting());
});

test('S9 independent main fixture artifact membership and bytes match candidate output exactly', async t => {
  const baselineRoot = new URL('../fixtures/shopee-public-main/', import.meta.url);
  const manifest = JSON.parse(await fs.readFile(new URL('manifest.json', baselineRoot), 'utf8'));
  assert.equal(manifest.revision, 'e10c7a720c655489e2abaa65633e133b279eba8e');
  const decode = (bytes: Buffer): Map<string, Buffer> => new Map(JSON.parse(gunzipSync(bytes).toString()).map((r: any) => [r.name, Buffer.from(r.base64, 'base64')]));
  const reference = decode(await fs.readFile(new URL('artifacts.json.gz', baselineRoot)));
  for (const env of [{}, { TDN_RESEARCH_SHOPEE_PUBLIC_TOKEN: '\n', TDN_RESEARCH_SHOPEE_PUBLIC_BASE_URL: 'invalid', TDN_RESEARCH_SHOPEE_PUBLIC_MAX_COMMENTS_PER_PRODUCT: '01' }]) {
    const candidateRoot = await binding.candidateBaselines(t, env);
    const candidate = JSON.parse(await fs.readFile(path.join(candidateRoot, 'manifest.json'), 'utf8'));
    const actual = decode(await fs.readFile(path.join(candidateRoot, 'artifacts.json.gz')));
    assert.deepEqual(candidate.files, manifest.files, 'no added/removed/renamed/rehashed package entries');
    assert.deepEqual([...actual.keys()], [...reference.keys()]);
    for (const file of manifest.files) {
      const expected = reference.get(file.name)!;
      assert.equal(hash(expected), file.sha256); assert.equal(expected.length, file.byteSize);
      assert.deepEqual(actual.get(file.name), expected, file.name);
    }
  }
});
test('S9 retained old source replay while public runtime is enabled keeps bytes and factory untouched', async t => {
  const f = await binding.scenario(t); const old = await f.loadLegacyBaselines(); const before = await old.allBytes();
  await old.setRuntime({ enabled: true }); await old.readReportsAndSources(); assert.deepEqual(await old.allBytes(), before);
  assert.equal(old.transport.calls.length, 0); assert.equal(old.publicFactoryCalls.length, 0);
});

const presentationVariants = [
  { cap: 300, counts: [0, 0, 0] }, { cap: 300, counts: [300, 7, 0] }, { cap: 300, counts: [300, 300, 300] },
  { cap: 7, counts: [7, 7, 7] }, { cap: 20, mode: 'TRIAL' as const, counts: [20, 7, 0] },
  { cap: 20, counts: [1, 1, 1], attributesOnly: true }, { cap: 20, counts: [7, 0, 0], state: 'needs_login' },
] as const;
for (const variant of presentationVariants) test(`S10 shared draft/reader disclosure ${JSON.stringify(variant)}`, async t => {
  const f = await binding.scenario(t, { ...variant, counts: [...variant.counts], noPercentageEvidence: true });
  await f.confirmPublic(); await f.finish();
  const automated = await f.readReport(); await f.buildReader(); const reader = await f.readReader();
  const left = passage(automated), right = passage(reader); assert.equal(left, right);
  for (const line of LIMITS(variant.cap)) hasLine(left, line);
  assert.doesNotMatch(left, /%|\/300/u); assertNoPublicReviewZeroPlaceholder(left);
  assertPublicReviewVisibleText(reportVisibleText(automated)); assertPublicReviewVisibleText(reportVisibleText(reader));
  if (variant.counts.every(n => n === 0)) hasLine(left, EMPTY);
  if (variant.counts.some(n => n < variant.cap) && variant.counts.some(n => n > 0)) hasLine(left, short(variant.cap));
  if ('mode' in variant) { hasLine(left, trial(20)); assert.doesNotMatch(automated + reader, /\/300/u); }
  if ('state' in variant) hasLine(left, HUMAN_BLOCK);
  if ('attributesOnly' in variant) { hasLine(left, NO_COMMENT); assert.doesNotMatch(left, /có 0 bình luận/u); }
  else for (const n of new Set(variant.counts.filter(n => n > 0))) hasLine(left, `Đã giữ ${n} bản ghi đánh giá, trong đó có ${n} bình luận đọc được.`);
  if (variant.counts.every(n => n === variant.cap)) hasLine(left, CAP_MET);
  assert.equal((await f.readerBuildRecord()).builderId, 'reader-report-market-v5');
  assert.equal((await f.semantic()).rendererVersion, 'automation-report-kit-v31');
  assert.equal((await f.readerBuildRecord()).publicReviewSource.acquisition.state, 'FINAL');
});
// Preserved recovery assertions are separate from presentation so scoped runs need no restart.
test('S10 retained reader replay across all presentation shapes', async t => {
  for (const variant of presentationVariants) {
    const f = await binding.scenario(t, { ...variant, counts: [...variant.counts], noPercentageEvidence: true });
    await f.confirmPublic(); await f.finish();
    const automated = await f.readReport(); await f.buildReader(); const reader = await f.readReader();
    const before = await f.outcome(); const calls = f.transport.calls.length;
    const restarted = await f.recreateFromDisk({ runtimeEnabled: false, throwAllProviders: true, throwModel: true });
    assert.equal(await restarted.readReaderSolelyFromBuild(), reader); assert.equal(await restarted.readReport(), automated);
    assert.deepEqual(await restarted.outcome(), before); assert.equal(restarted.transport.calls.length, calls);
    assert.equal((await restarted.readerBuildRecord()).builderId, 'reader-report-market-v5');
    assert.equal((await restarted.semantic()).rendererVersion, 'automation-report-kit-v31');
    assert.equal((await restarted.readerBuildRecord()).publicReviewSource.acquisition.state, 'FINAL');
  }
});
test('S10 bare-zero detector preserves identifiers and rejects authored placeholders', () => {
  for (const text of ['generic-quote-unit-v1@1.0.0', 'tablet-quote-normalization@2.0.0',
    'v1.0.0 synthetic_0 category[0] synthetic/0 0,25 0.5', 'Chưa có mục phân tích hoàn chỉnh.']) {
    assert.doesNotThrow(() => assertNoPublicReviewZeroPlaceholder(text));
  }
  for (const text of ['Mục phân tích hoàn chỉnh: 0', 'Mục phân tích hoàn chỉnh: 0.',
    'generic-quote-unit-v1@1.0.0; Mục phân tích hoàn chỉnh: 0.', 'Số bản ghi: (0).']) {
    assert.throws(() => assertNoPublicReviewZeroPlaceholder(text), /bare numeric zero placeholder/u);
  }
  assert.throws(() => assertPublicReviewVisibleText('Tỷ lệ hoàn thành: 5%'));
});
const rejectedNames = ['CloakBrowser', 'Cloak Browser', 'cloak-browser', 'cloak_browser', 'ShopeePublicReviewCollector', 'shopee-public-review'];
for (const which of ['lint', 'citation', 'business'] as const) for (const name of rejectedNames) test(`S10 ${which} rejects new-source label ${name}`, async () => {
  for (const label of [name, name.toUpperCase(), name.replace(/o/gu, '&#111;')]) for (const html of [
    `<p>${label}</p>`, `<h1>${label}</h1>`, `<span title="${label}">Nguồn</span>`, `<div aria-label="${label}">Nguồn</div>`, `<svg><text>${label}</text></svg>`,
  ]) await assert.rejects(binding.gate(which, html, true));
});
test('S10 negative control: injected forbidden citation/reader label is rejected by actual build', async t => {
  const f = await binding.scenario(t); await f.confirmPublic(); await f.finish();
  await assert.rejects(f.buildReader({ injectedCitationLabel: 'CloakBrowser' }));
  await assert.rejects(f.buildReader({ injectedReaderLabel: 'CloakBrowser' }));
});
test('S10 negative control: corrupt retained result digest refuses report with zero replacement calls', async t => {
  const f = await binding.scenario(t); await f.confirmPublic(); await f.finish(); await f.buildReader();
  await f.corruptRetained('result-digest', { rehashSemanticWrapper: true });
  const calls = f.transport.calls.length; await assert.rejects(f.readReport()); await assert.rejects(f.readReader());
  assert.equal(f.transport.calls.length, calls); assert.equal(f.paidSpy.calls.length, 0);
});
