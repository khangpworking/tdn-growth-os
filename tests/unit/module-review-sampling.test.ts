import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { ModuleError } from '../../scripts/module-pick.js';
import { executeSamplingAttempt, reserveAttempt, reserveConfiguredAttempt, reviewSamplingView, saveReviewPlan } from '../../scripts/module-review-sampling.js';
import { reviewPolicy, samplingDigest, validateSamplingResult, ReviewSamplingError, type ShopeeReviewPlan } from '../../src/modules/foundation/shopee-review-sampling.js';
import type { SamplingJobInput, SamplingJournal, SamplingResult, ReviewLink } from '../../contracts/foundation/shopee-review-sampling.generated.js';
import { moduleRow } from '../fixtures/shopee-module-review-data.js';

const POLICY_INPUT = { mode: 'stars' as const, stars: [2, 3], totalPerLink: 500, allocation: 'pooled' as const };
const PAGES_INPUT = { mode: 'with-comments' as const, stars: [], limitBy: 'pages' as const, pagesPerLink: 10, allocation: 'pooled' as const };
const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const EXECUTION = '22222222-2222-4222-8222-222222222222';
const AT = '2026-11-11T03:00:00.000Z';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const writeJson = async (path: string, value: unknown) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

async function fixture(policyInput: unknown = POLICY_INPUT) {
  const dir = await mkdtemp(join(tmpdir(), 'shopee-automatic-'));
  const run = join(dir, 'run-1');
  const state = join(dir, 'state');
  const policy = reviewPolicy(policyInput);
  const request = {
    format: 'request-v2', preset: { keywords: ['son'] },
    windows: [{ id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-11' }, intervalDays: 7 }],
    principalTitles: [], collectionPolicy: policy,
  };
  const links = [{ rank: 1, productBaseId: '1__200__100', shopId: '100', itemId: '200',
    url: 'https://shopee.vn/product/100/200', brand: null, revenue: 1, reason: 'Synthetic link' }];
  const selection = {
    format: 'selection-v1', runId: basename(run), source: 'manual', pickRuleVersion: 'manual',
    metricInputSha256: null, links,
    counts: { walked: 1, deleted: 0, notIncluded: 0, tokenGuardRejected: 0, eligible: 1, picked: 1,
      maskedRows: 0, maskedAboveLowestPick: 0 },
  };
  const requestBytes = Buffer.from(`${JSON.stringify(request, null, 2)}\n`);
  const selectionBytes = Buffer.from(`${JSON.stringify(selection, null, 2)}\n`);
  for (const [relative, bytes] of [
    ['request.json', requestBytes],
    ['m2/selection.json', selectionBytes],
    ['gates/m2.json', Buffer.from(`${JSON.stringify({
      format: 'handoff-v1', module: 'M2', runId: basename(run), skillVersion: 'synthetic',
      verdict: 'PASS', inputSha256: null, outputSha256: sha(selectionBytes), checks: [],
      errorCode: null, next: 'M3',
    }, null, 2)}\n`)],
  ] as const) {
    const path = join(run, relative);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, bytes, 'utf8');
  }
  const saved = await saveReviewPlan(run, policyInput);
  return { dir, run, state, requestBytes, selectionBytes, saved };
}

async function withFixture<T>(work: (value: Awaited<ReturnType<typeof fixture>>) => Promise<T>, policyInput?: unknown) {
  const value = await fixture(policyInput);
  const previous = process.env.SHOPEE_FLOW_STATE;
  process.env.SHOPEE_FLOW_STATE = value.state;
  try { return await work(value); }
  finally {
    if (previous === undefined) delete process.env.SHOPEE_FLOW_STATE;
    else process.env.SHOPEE_FLOW_STATE = previous;
    await rm(value.dir, { recursive: true, force: true });
  }
}

test('an automatic binding without attempt metadata refuses redispatch and stays UNCERTAIN', () => withFixture(async ({ run, requestBytes, selectionBytes, saved }) => {
  await writeJson(join(run, 'm3-custom/automatic.json'), {
    format: 'shopee-automatic-review-binding-v1', runId: basename(run),
    requestSha256: sha(requestBytes), m2Digest: sha(selectionBytes),
    policySha256: saved.plan.policySha256, planSha256: saved.planSha256,
    attemptId: ATTEMPT, executionId: EXECUTION, sequence: 4, createdAt: AT,
  });

  await assert.rejects(reserveConfiguredAttempt(run, {
    executionId: '33333333-3333-4333-8333-333333333333', sequence: 5,
  }), (error: unknown) => error instanceof ModuleError && error.code === 'REVIEW_RESERVATION_INCOMPLETE');

  const view = await reviewSamplingView(run);
  assert.equal(view.blockedBy?.code, 'REVIEW_RESERVATION_INCOMPLETE');
  const attempt = view.attempts.find(value => value.attemptId === ATTEMPT);
  assert.ok(attempt);
  assert.equal(attempt.status, 'UNCERTAIN');
  assert.equal(attempt.errorCode, 'REVIEW_RESERVATION_INCOMPLETE');
  assert.equal(attempt.executionId, EXECUTION);
  assert.equal(attempt.sequence, 4);
  assert.equal(attempt.planSha256, saved.planSha256);
  assert.equal(attempt.requestSha256, sha(requestBytes));
  assert.equal(attempt.m2Digest, sha(selectionBytes));
  assert.equal(attempt.gate, null);
  assert.deepEqual(attempt.links, []);
  assert.deepEqual(await readdir(join(run, 'm3-custom/attempts')).catch(() => []), []);
}));

test('a repeated automatic reservation refuses without replacing the prior receipt', () => withFixture(async ({ run }) => {
  const first = await reserveConfiguredAttempt(run, { executionId: EXECUTION, sequence: 3 });
  assert.equal(first.format, 'review-attempt-start-v1');
  assert.equal(first.executionId, EXECUTION);
  assert.equal(first.sequence, 3);

  const attemptPath = join(run, 'm3-custom/attempts', first.attemptId);
  const bindingPath = join(run, 'm3-custom/automatic.json');
  const bindingBytes = await readFile(bindingPath);
  const attemptBytes = await readFile(join(attemptPath, 'attempt.json'));
  const stateBytes = await readFile(join(attemptPath, 'state.json'));

  await assert.rejects(reserveConfiguredAttempt(run, {
    executionId: '44444444-4444-4444-8444-444444444444', sequence: 4,
  }), (error: unknown) => error instanceof ModuleError && error.code === 'AUTOMATIC_COLLECTION_EXISTS');

  assert.deepEqual(await readFile(bindingPath), bindingBytes);
  assert.deepEqual(await readFile(join(attemptPath, 'attempt.json')), attemptBytes);
  assert.deepEqual(await readFile(join(attemptPath, 'state.json')), stateBytes);
  assert.deepEqual(await readdir(join(run, 'm3-custom/attempts')), [first.attemptId]);
  const saved = JSON.parse(attemptBytes.toString('utf8'));
  assert.equal(saved.executionId, EXECUTION);
  assert.equal(saved.sequence, 3);
}));

test('an explicit custom reservation carries the same execution identity into attempt metadata', () => withFixture(async ({ run, saved }) => {
  const created = await reserveAttempt(run, 'custom', saved.planSha256, {
    executionId: '55555555-5555-4555-8555-555555555555', sequence: 7,
  });
  assert.equal(created.format, 'review-attempt-start-v1');
  assert.equal(created.executionId, '55555555-5555-4555-8555-555555555555');
  assert.equal(created.sequence, 7);
  const metadata = JSON.parse(await readFile(join(run, 'm3-custom/attempts', created.attemptId, 'attempt.json'), 'utf8'));
  assert.equal(metadata.executionId, created.executionId);
  assert.equal(metadata.sequence, created.sequence);
  assert.equal(metadata.planSha256, saved.planSha256);
  assert.equal(samplingDigest(metadata), JSON.parse(await readFile(
    join(run, 'm3-custom/attempts', created.attemptId, 'state.json'), 'utf8')).attemptSha256);
}));

/** A terminal source result with `pageCount` saved pages (6 cards each) and one admitted row per page. */
function terminalJournal(request: SamplingJobInput, link: ReviewLink, plan: ShopeeReviewPlan, pageCount: number, stopReason: 'page_limit' | 'exhausted'): SamplingJournal {
  if (!('sampling' in request)) throw new Error('collection request expected');
  const pages = Array.from({ length: pageCount }, (_, index) => ({ filter: 'with-comments' as const, page: index + 1, cards: 6, collected: index + 1,
    ids: Array.from({ length: 6 }, (_, card) => `r${index + 1}-${card}`) }));
  const rows = pages.map(page => ({ ...moduleRow(link, page.ids[0]!, { sourcePage: page.page }), admissionReasons: [] }));
  const result: SamplingResult = { format: 'shopee-sampled-result-v1', jobId: '66666666-6666-4666-8666-666666666666', inputSha256: samplingDigest(request),
    planSha256: request.sampling.planSha256, policySha256: plan.policySha256, link, rows, pages, groups: [{ filter: 'with-comments', stopReason }],
    sourceCounts: null, stopReason, complete: true, phase: 'terminal', sourceSha256: 'b'.repeat(64) };
  return { format: 'shopee-sampling-journal-v1', inputSha256: samplingDigest(request), request, intentAt: AT, deadline: '2026-11-11T03:40:00.000Z',
    baselineIds: [], job: { id: result.jobId, request, state: 'succeeded', created_at: AT, updated_at: AT, result_available: true, collected: rows.length },
    result, resultSha256: samplingDigest(result), terminal: true, errorCode: null, requestCount: 2, requestCountUncertain: false, cancelIntent: false };
}

async function runAutomatic(run: string, pageCount: number, stopReason: 'page_limit' | 'exhausted') {
  const started = await reserveConfiguredAttempt(run, { executionId: EXECUTION, sequence: 1 });
  const requests: SamplingJobInput[] = [];
  const result = await executeSamplingAttempt({ runDir: run, kind: 'custom', attemptId: started.attemptId, collector: {
    run: async (_file, request, link, plan) => { requests.push(request); return terminalJournal(request, link, plan!, pageCount, stopReason); },
  } });
  const base = join(run, 'm3-custom/attempts', started.attemptId);
  return { result, requests, gate: JSON.parse(await readFile(join(base, 'gate.json'), 'utf8')),
    outcome: JSON.parse(await readFile(join(base, 'output/outcome.json'), 'utf8')) };
}

test('a pages-mode run saves policy v2, asks the service for max_pages and gates on saved pages', () => withFixture(async ({ run }) => {
  const request = JSON.parse(await readFile(join(run, 'request.json'), 'utf8'));
  assert.deepEqual(request.collectionPolicy, { format: 'shopee-review-policy-v2', limitBy: 'pages', mode: 'with-comments', stars: [],
    pagesPerLink: 10, totalPerLink: 2000, allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1' });
  const { result, requests, gate, outcome } = await runAutomatic(run, 10, 'page_limit');
  assert.equal(requests.length, 1);
  const [sent] = requests;
  assert.ok(sent && 'sampling' in sent);
  assert.equal(sent.max_pages, 10, 'the page limit travels with the job and its identity');
  assert.equal(sent.max_comments, 2000, 'comments are bounded only by the service safety cap');
  assert.equal(sent.sampling.policy.format, 'shopee-review-policy-v2');
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(gate.verdict, 'PASS');
  assert.deepEqual(gate.checks.map((check: { id: string }) => check.id), ['verdict_ok', 'min_reviews_per_link', 'pages_not_exceeded',
    'no_duplicate_review_ids', 'product_ids_match_m2', 'shape_shopee_public_rows']);
  assert.equal(outcome.verdict, 'OK');
  assert.deepEqual(outcome.links.map((link: { requested: unknown; shortfall: unknown; actual: unknown }) => [link.requested, link.actual, link.shortfall]), [[null, 10, null]]);
}, PAGES_INPUT));

test('a pages-mode link without any saved review fails min_reviews_per_link', () => withFixture(async ({ run }) => {
  const { gate } = await runAutomatic(run, 0, 'exhausted');
  assert.equal(gate.verdict, 'FAIL');
  assert.deepEqual(gate.checks.filter((check: { ok: boolean }) => !check.ok).map((check: { id: string }) => check.id), ['min_reviews_per_link']);
}, PAGES_INPUT));

test('a source result with more pages than pagesPerLink is refused', () => withFixture(async ({ run, saved }) => {
  const plan = saved.plan, link = plan.links[0]!;
  const request: SamplingJobInput = { url: link.url, max_comments: 2000, max_pages: 10,
    sampling: { attemptId: ATTEMPT, planSha256: saved.planSha256, policySha256: plan.policySha256, policy: plan.policy } };
  const journal = terminalJournal(request, link, plan, 11, 'page_limit');
  assert.throws(() => validateSamplingResult(journal.result!, plan, saved.planSha256, link, samplingDigest(request)),
    (error: unknown) => error instanceof ReviewSamplingError && error.code === 'REVIEW_PAGE_LIMIT_EXCEEDED');
}, PAGES_INPUT));

test('a count-mode run keeps v1, sends no max_pages and keeps its comment-cap gate', () => withFixture(async ({ run }) => {
  const { requests, gate } = await runAutomatic(run, 2, 'exhausted');
  const [sent] = requests;
  assert.ok(sent && 'sampling' in sent);
  assert.equal('max_pages' in sent, false);
  assert.equal(sent.sampling.policy.format, 'shopee-review-policy-v1');
  assert.deepEqual(gate.checks.map((check: { id: string }) => check.id), ['verdict_ok', 'min_reviews_per_link', 'cap_not_exceeded',
    'no_duplicate_review_ids', 'product_ids_match_m2', 'shape_shopee_public_rows', 'links_below_cap']);
}, { mode: 'with-comments', stars: [], totalPerLink: 300, allocation: 'pooled' }));
