import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { Readable } from 'node:stream';
import test from 'node:test';
import { ModuleError } from '../../scripts/module-pick.js';
import { executeSamplingAttempt, reserveAttempt, reserveConfiguredAttempt, reviewSamplingCommand, reviewSamplingView, samplingContext, saveReviewPlan } from '../../scripts/module-review-sampling.js';
import { reviewPolicy, samplingDigest, validateSamplingResult, ReviewSamplingError, type ShopeeReviewPlan } from '../../src/modules/foundation/shopee-review-sampling.js';
import type { SamplingJobInput, SamplingJournal, SamplingResult, ReviewLink } from '../../contracts/foundation/shopee-review-sampling.generated.js';
import { moduleRow } from '../fixtures/shopee-module-review-data.js';

const POLICY_INPUT = { mode: 'stars' as const, stars: [2, 3], totalPerLink: 500, allocation: 'pooled' as const };
const COUNT_INPUT = { mode: 'with-comments' as const, stars: [], totalPerLink: 300, allocation: 'pooled' as const };
const PAGES_INPUT = { mode: 'with-comments' as const, stars: [], limitBy: 'pages' as const, pagesPerLink: 10, allocation: 'pooled' as const };
const ATTEMPT = '11111111-1111-4111-8111-111111111111';
const EXECUTION = '22222222-2222-4222-8222-222222222222';
const AT = '2026-11-11T03:00:00.000Z';

const sha = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
const writeJson = async (path: string, value: unknown) => {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};

async function fixture(policyInput: unknown = POLICY_INPUT, linkCount = 1) {
  const dir = await mkdtemp(join(tmpdir(), 'shopee-automatic-'));
  const run = join(dir, 'run-1');
  const state = join(dir, 'state');
  const policy = reviewPolicy(policyInput);
  const request = {
    format: 'request-v2', preset: { keywords: ['son'] },
    windows: [{ id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-11' }, intervalDays: 7 }],
    principalTitles: [], collectionPolicy: policy,
  };
  const links = Array.from({ length: linkCount }, (_, index) => {
    const shopId = String(100 + index), itemId = String(200 + index);
    return { rank: index + 1, productBaseId: `1__${itemId}__${shopId}`, shopId, itemId,
      url: `https://shopee.vn/product/${shopId}/${itemId}`, brand: null, revenue: 1, reason: 'Synthetic link' };
  });
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

async function withFixture<T>(work: (value: Awaited<ReturnType<typeof fixture>>) => Promise<T>, policyInput?: unknown, linkCount = 1) {
  const value = await fixture(policyInput, linkCount);
  const previous = process.env.SHOPEE_FLOW_STATE;
  process.env.SHOPEE_FLOW_STATE = value.state;
  try { return await work(value); }
  finally {
    if (previous === undefined) delete process.env.SHOPEE_FLOW_STATE;
    else process.env.SHOPEE_FLOW_STATE = previous;
    await rm(value.dir, { recursive: true, force: true });
  }
}

/** Replaces the manual fixture selection with a schema-valid v2 one that binds its step-2 link log. */
async function v2SelectionBoundToLog(run: string) {
  const logPath = join(run, 'm2/link-checks.json');
  const logBytes = Buffer.from(`${JSON.stringify({ format: 'link-check-log-v1', runId: basename(run), entries: [] }, null, 2)}\n`);
  await writeFile(logPath, logBytes);
  const selection = {
    format: 'selection-v1', runId: basename(run), source: 'auto', pickRuleVersion: 'metric-products-unique-v2',
    metricInputSha256: 'a'.repeat(64),
    links: [{ rank: 1, productBaseId: '1__200__100', shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200',
      brand: null, revenue: 1, reason: 'Synthetic link', sourceRank: 1, productName: 'Synthetic link', shopName: null }],
    counts: { walked: 1, deleted: 0, notIncluded: 0, tokenGuardRejected: 0, eligible: 1, picked: 1, maskedRows: 0, maskedAboveLowestPick: 0 },
    selectionProof: { sourceMap: 'raw-responses.json#/0/body/data', rawSha256: 'a'.repeat(64), windowId: 'selected',
      sortBy: 'revenue_custom__desc', candidateCount: 1, distinctCount: 1, unresolvedCount: 0, shortageReason: null, skipped: [],
      matcher: { provider: 'typesafe-jev', model: 'synthetic', questionVersion: 'a'.repeat(64), threshold: 0.7 },
      decisions: [], linkChecksSha256: sha(logBytes) },
  };
  const selectionBytes = Buffer.from(`${JSON.stringify(selection, null, 2)}\n`);
  await writeFile(join(run, 'm2/selection.json'), selectionBytes);
  await writeJson(join(run, 'gates/m2.json'), { format: 'handoff-v1', module: 'M2', runId: basename(run), skillVersion: 'synthetic',
    verdict: 'PASS', inputSha256: null, outputSha256: sha(selectionBytes), checks: [], errorCode: null, next: 'M3' });
  return { selection, logPath };
}

test('an m3 admission keeps the step-2 log a v2 selection bound, and only that log', () => withFixture(async ({ run }) => {
  const { logPath } = await v2SelectionBoundToLog(run);
  assert.deepEqual((await samplingContext(run)).links,
    [{ shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200' }], 'the bound log passes admission');
  const changed = (error: unknown) => error instanceof ModuleError && error.code === 'GATE_INPUT_CHANGED' && error.exitCode === 23;
  await writeFile(logPath, Buffer.concat([await readFile(logPath), Buffer.from('\n')]));
  await assert.rejects(samplingContext(run), changed, 'edited log bytes fail admission');
  await rm(logPath);
  await assert.rejects(samplingContext(run), changed, 'a deleted log fails admission');
}));

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

function failedJournal(request: SamplingJobInput, link: ReviewLink, errorCode: string): SamplingJournal {
  return { format: 'shopee-sampling-journal-v1', inputSha256: samplingDigest(request), request, intentAt: AT,
    deadline: '2026-11-11T03:40:00.000Z', baselineIds: [],
    job: { id: `90000000-0000-4000-8000-${link.itemId.padStart(12, '0')}`, request, state: 'failed',
      created_at: AT, updated_at: AT, result_available: false },
    result: null, resultSha256: null, terminal: true, errorCode, requestCount: 2, requestCountUncertain: false, cancelIntent: false };
}

async function runLinks(run: string, respond: (request: SamplingJobInput, link: ReviewLink, plan: ShopeeReviewPlan | null) => SamplingJournal) {
  const started = await reserveConfiguredAttempt(run, { executionId: EXECUTION, sequence: 1 });
  const requests: SamplingJobInput[] = [];
  const result = await executeSamplingAttempt({ runDir: run, kind: 'custom', attemptId: started.attemptId, collector: {
    run: async (_file, request, link, plan) => { requests.push(request); return respond(request, link, plan); },
  } });
  const base = join(run, 'm3-custom/attempts', started.attemptId);
  return { result, requests, gate: JSON.parse(await readFile(join(base, 'gate.json'), 'utf8')),
    outcome: JSON.parse(await readFile(join(base, 'output/outcome.json'), 'utf8')) };
}

for (const code of ['PRODUCT_UNAVAILABLE', 'RATINGS_MISSING'] as const) {
  test(`a ${code} link is skipped and the next link is still collected`, () => withFixture(async ({ run }) => {
    const dead = 'https://shopee.vn/product/100/200';
    const { result, requests, gate, outcome } = await runLinks(run, (request, link, plan) =>
      link.url === dead ? failedJournal(request, link, code) : terminalJournal(request, link, plan!, 1, 'exhausted'));
    assert.equal(requests.length, 2, 'the loop continues with the next link');
    assert.equal(result.status, 'SUCCEEDED');
    assert.equal(gate.verdict, 'PASS');
    const check = gate.checks.find((value: { id: string }) => value.id === 'links_skipped');
    assert.deepEqual([check.level, check.ok, check.got], ['warn', false, 1]);
    assert.equal(outcome.verdict, 'PARTIAL_LINKS');
    assert.deepEqual([outcome.links[0].skipped, outcome.links[0].stopReason], [true, code]);
    assert.deepEqual([outcome.links[1].skipped, outcome.links[1].stopReason], [false, 'exhausted']);
  }, COUNT_INPUT, 2));
}

test('a session code still stops the attempt and leaves later links unstarted', () => withFixture(async ({ run }) => {
  const { result, requests, gate, outcome } = await runLinks(run, (request, link, plan) =>
    link.url === 'https://shopee.vn/product/100/200' ? failedJournal(request, link, 'PRODUCT_UNAVAILABLE')
      : link.url === 'https://shopee.vn/product/101/201' ? failedJournal(request, link, 'HUMAN_LOGIN_REQUIRED')
        : terminalJournal(request, link, plan!, 1, 'exhausted'));
  assert.equal(requests.length, 2, 'the third link is never started');
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, 'HUMAN_LOGIN_REQUIRED');
  assert.equal(gate.verdict, 'WAIT_OWNER');
  assert.equal(outcome.verdict, 'FAILED');
  assert.deepEqual([outcome.links[0].skipped, outcome.links[0].stopReason], [true, 'PRODUCT_UNAVAILABLE']);
  assert.deepEqual([outcome.links[1].skipped, outcome.links[1].stopReason], [false, 'HUMAN_LOGIN_REQUIRED']);
  assert.deepEqual([outcome.links[2].skipped, outcome.links[2].stopReason], [false, 'not_started']);
}, COUNT_INPUT, 3));

test('a run where every link is dead cannot pass without a collected link', () => withFixture(async ({ run }) => {
  const { result, requests, gate, outcome } = await runLinks(run, (request, link) =>
    failedJournal(request, link, 'PRODUCT_UNAVAILABLE'));
  assert.equal(requests.length, 2, 'both links are tried');
  assert.equal(gate.verdict, 'FAIL');
  assert.equal(gate.checks.find((value: { id: string }) => value.id === 'min_reviews_per_link').ok, false);
  const check = gate.checks.find((value: { id: string }) => value.id === 'links_skipped');
  assert.deepEqual([check.level, check.ok, check.got], ['warn', false, 2]);
  assert.equal(outcome.verdict, 'FAILED');
  assert.equal(result.errorCode, 'M3_GATE_FAILED');
}, COUNT_INPUT, 2));

test('a custom link with no text review is skipped and the other link still passes', () => withFixture(async ({ run }) => {
  const empty = 'https://shopee.vn/product/100/200';
  const { result, gate, outcome } = await runLinks(run, (request, link, plan) =>
    terminalJournal(request, link, plan!, link.url === empty ? 0 : 1, 'exhausted'));
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(gate.verdict, 'PASS');
  const check = gate.checks.find((value: { id: string }) => value.id === 'links_skipped');
  assert.deepEqual([check.level, check.ok, check.got], ['warn', false, 1]);
  assert.equal(outcome.verdict, 'PARTIAL_LINKS');
  assert.deepEqual([outcome.links[0].skipped, outcome.links[0].stopReason], [true, 'NO_TEXT_REVIEWS']);
  assert.deepEqual([outcome.links[1].skipped, outcome.links[1].stopReason], [false, 'exhausted']);
}, COUNT_INPUT, 2));

test('every custom link ending with no text review still fails the gate', () => withFixture(async ({ run }) => {
  const { result, gate, outcome } = await runLinks(run, (request, link, plan) => terminalJournal(request, link, plan!, 0, 'exhausted'));
  assert.equal(gate.verdict, 'FAIL');
  assert.equal(gate.checks.find((value: { id: string }) => value.id === 'min_reviews_per_link').ok, false);
  const check = gate.checks.find((value: { id: string }) => value.id === 'links_skipped');
  assert.deepEqual([check.level, check.ok, check.got], ['warn', false, 2]);
  assert.equal(outcome.verdict, 'FAILED');
  assert.equal(result.errorCode, 'M3_GATE_FAILED');
  assert.deepEqual(outcome.links.map((link: { skipped: boolean; stopReason: string }) => [link.skipped, link.stopReason]),
    [[true, 'NO_TEXT_REVIEWS'], [true, 'NO_TEXT_REVIEWS']]);
}, COUNT_INPUT, 2));

test('a zero-row result that fails validation is refused, never skipped as no-text', () => withFixture(async ({ run }) => {
  const started = await reserveConfiguredAttempt(run, { executionId: EXECUTION, sequence: 1 });
  const tampered = (request: SamplingJobInput, link: ReviewLink, plan: ShopeeReviewPlan) => {
    const journal = terminalJournal(request, link, plan, 0, 'exhausted');
    const result = { ...(journal.result as SamplingResult), planSha256: 'c'.repeat(64) };
    return { ...journal, result, resultSha256: samplingDigest(result) };
  };
  await assert.rejects(executeSamplingAttempt({ runDir: run, kind: 'custom', attemptId: started.attemptId, collector: {
    run: async (_file, request, link, plan) => link.url === 'https://shopee.vn/product/100/200'
      ? tampered(request, link, plan!) : terminalJournal(request, link, plan!, 1, 'exhausted'),
  } }), (error: unknown) => error instanceof ReviewSamplingError && error.code === 'REVIEW_RESULT_CHANGED');
  const base = join(run, 'm3-custom/attempts', started.attemptId);
  // Nothing is published, so the attempt neither passes nor records NO_TEXT_REVIEWS for the invalid link.
  await assert.rejects(readFile(join(base, 'gate.json')));
  await assert.rejects(readFile(join(base, 'output/outcome.json')));
}, COUNT_INPUT, 2));

test('a counts attempt stops on a dead first link with its reason and starts no later job', () => withFixture(async ({ run }) => {
  const started = await reserveAttempt(run, 'counts');
  const requests: SamplingJobInput[] = [];
  const result = await executeSamplingAttempt({ runDir: run, kind: 'counts', attemptId: started.attemptId, collector: {
    run: async (_file, request, link) => { requests.push(request); return failedJournal(request, link, 'PRODUCT_UNAVAILABLE'); },
  } });
  assert.equal(requests.length, 1, 'the first product error stops a counts attempt');
  assert.equal(result.status, 'FAILED');
  assert.equal(result.errorCode, 'PRODUCT_UNAVAILABLE');
}, COUNT_INPUT, 2));

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
    'no_duplicate_review_ids', 'product_ids_match_m2', 'shape_shopee_public_rows', 'links_skipped']);
  assert.equal(outcome.verdict, 'OK');
  assert.deepEqual(outcome.links.map((link: { requested: unknown; shortfall: unknown; actual: unknown }) => [link.requested, link.actual, link.shortfall]), [[null, 10, null]]);
}, PAGES_INPUT));

test('a pages-mode link without any saved review is skipped as no-text and still fails min_reviews_per_link', () => withFixture(async ({ run }) => {
  const { gate } = await runAutomatic(run, 0, 'exhausted');
  assert.equal(gate.verdict, 'FAIL');
  assert.deepEqual(gate.checks.filter((check: { ok: boolean }) => !check.ok).map((check: { id: string }) => check.id),
    ['min_reviews_per_link', 'links_skipped']);
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
    'no_duplicate_review_ids', 'product_ids_match_m2', 'shape_shopee_public_rows', 'links_below_cap', 'links_skipped']);
}, { mode: 'with-comments', stars: [], totalPerLink: 300, allocation: 'pooled' }));

async function withStdin<T>(text: string, run: () => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'stdin')!;
  Object.defineProperty(process, 'stdin', { value: Readable.from([Buffer.from(text)]), configurable: true });
  try { return await run(); } finally { Object.defineProperty(process, 'stdin', descriptor); }
}

async function withStdout<T>(run: (lines: string[]) => Promise<T>): Promise<T> {
  const descriptor = Object.getOwnPropertyDescriptor(process, 'stdout')!;
  const lines: string[] = [];
  Object.defineProperty(process, 'stdout', { value: { write: (chunk: string) => { lines.push(String(chunk)); return true; } }, configurable: true });
  try { return await run(lines); } finally { Object.defineProperty(process, 'stdout', descriptor); }
}

test('the serve-views action answers one line per run in input order', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shopee-serve-views-'));
  const state = join(dir, 'state'), first = join(dir, 'run-a'), second = join(dir, 'run-b');
  await mkdir(state);
  await mkdir(first);
  await mkdir(second);
  const previous = process.env.SHOPEE_FLOW_STATE;
  process.env.SHOPEE_FLOW_STATE = state;
  try {
    const lines = await withStdout(lines => withStdin(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`, async () => {
      await reviewSamplingCommand(['serve-views']);
      return lines;
    }));
    assert.deepEqual(lines.map(line => JSON.parse(line)), [{ ok: true, view: await reviewSamplingView(first) },
      { ok: true, view: await reviewSamplingView(second) }]);
  } finally {
    if (previous === undefined) delete process.env.SHOPEE_FLOW_STATE;
    else process.env.SHOPEE_FLOW_STATE = previous;
    await rm(dir, { recursive: true, force: true });
  }
});

test('the serve-views action answers a failing run and keeps serving the others', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shopee-serve-views-'));
  const state = join(dir, 'state'), good = join(dir, 'run-a'), bad = join(dir, 'run-b');
  await mkdir(state);
  await mkdir(good);
  await mkdir(join(bad, 'm3-custom', 'plans'), { recursive: true });
  await writeJson(join(bad, 'm3-custom', 'plans', 'not-a-plan.json'), {});
  const previous = process.env.SHOPEE_FLOW_STATE;
  process.env.SHOPEE_FLOW_STATE = state;
  try {
    const lines = await withStdout(lines => withStdin(`${JSON.stringify(bad)}\n${JSON.stringify(good)}\n`, async () => {
      await reviewSamplingCommand(['serve-views']);
      return lines;
    }));
    const [failed, kept] = lines.map(line => JSON.parse(line)) as { ok: boolean, error?: { code: string, message: string, exitCode: number } }[];
    assert.ok(failed);
    assert.equal(failed.ok, false);
    assert.equal(failed.error?.code, 'REVIEW_PLAN_INVALID');
    assert.equal(failed.error?.message, 'REVIEW_PLAN_INVALID');
    assert.equal(failed.error?.exitCode, 20);
    assert.deepEqual(kept, { ok: true, view: await reviewSamplingView(good) });
  } finally {
    if (previous === undefined) delete process.env.SHOPEE_FLOW_STATE;
    else process.env.SHOPEE_FLOW_STATE = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
