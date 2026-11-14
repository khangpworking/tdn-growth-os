import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import {
  reviewPolicy, samplingDigest, starTargets,
} from '../../src/modules/foundation/shopee-review-sampling.js';
import { ShopeeReviewSamplingCollector } from '../../src/platform/collectors/shopee-review-sampling.js';

const TOKEN = 'synthetic-token';
const LINK = { shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200' };
const AT = new Date('2026-11-01T03:00:00.000Z');
const ATTEMPT = '00000000-0000-4000-8000-0000000000aa';

function planFixture(mode: 'with-comments' | 'stars' = 'with-comments') {
  const policy = reviewPolicy({
    mode, stars: mode === 'stars' ? [1, 2] : [], totalPerLink: 4, allocation: 'pooled',
  });
  const plan = {
    format: 'shopee-review-plan-v1' as const,
    runId: 'run-synthetic',
    requestSha256: 'a'.repeat(64),
    m2Digest: 'b'.repeat(64),
    policy,
    policySha256: samplingDigest(policy),
    targets: starTargets(policy),
    links: [LINK],
  };
  return { plan, planSha256: samplingDigest(plan) };
}

function requestFixture(planSha256: string): any {
  const built = planFixture();
  return {
    url: LINK.url,
    max_comments: 4,
    sampling: {
      planSha256, policySha256: built.plan.policySha256, policy: built.plan.policy, attemptId: ATTEMPT,
    },
  };
}

const countValue = (value: number) => ({ status: 'observed', value });

function sourceCounts() {
  return {
    stars: {
      '1': countValue(1), '2': countValue(2), '3': countValue(3), '4': countValue(4), '5': countValue(5),
    },
    withComments: countValue(2),
  };
}

const RECORD = {
  review_id: 'r1', author: 'Synthetic', posted_at_local: '2026-11-01 09:00', variation: '',
  stars: 5, comment: 'Sản phẩm tốt', attributes: ['Màu: đen'], content_type: 'comment',
  review_text: 'Sản phẩm tốt', source_filter: 'with-comments', source_url: LINK.url, page: 1,
};
const PAGES = [{ filter: 'with-comments', page: 1, cards: 1, collected: 1, ids: ['r1'] }];
const GROUPS = [{ filter: 'with-comments', stopReason: 'exhausted' }];

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function withDir<T>(work: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), 'shopee-sampling-'));
  try { return await work(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}

function collector(fetchImpl: typeof fetch): ShopeeReviewSamplingCollector {
  return new ShopeeReviewSamplingCollector({
    token: TOKEN, fetch: fetchImpl, now: () => AT, sleep: async () => {},
  });
}

test('a running checkpoint without terminal stop_reason is retained and later becomes terminal', async () => {
  const { plan, planSha256 } = planFixture();
  const request = requestFixture(planSha256);
  const created = AT.toISOString();
  const baseJob = {
    id: '00000000-0000-4000-8000-000000000001', request, created_at: created,
    updated_at: created, result_available: true, collected: 1,
  };
  const runningJob = { ...baseJob, state: 'running' };
  const succeededJob = { ...baseJob, state: 'succeeded' };
  const checkpoint = {
    job_id: baseJob.id, product_url: LINK.url, complete: false,
    sampling: request.sampling, observed_at: created, records: [RECORD], pages: PAGES,
    groups: GROUPS, source_counts: sourceCounts(),
  };
  const terminal = { ...checkpoint, complete: true, stop_reason: 'exhausted' };
  const calls: string[] = [];
  let submitted = false, statusReads = 0, resultReads = 0;

  const fakeFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const route = url.pathname + url.search;
    calls.push(route);
    if (route === '/session') return response({ state: 'ready', authenticated: true, checked_at: created });
    if (route === '/jobs?limit=100') return response(submitted ? [runningJob] : []);
    if (route === '/jobs') { submitted = true; return response(runningJob, 202); }
    if (route === `/jobs/${baseJob.id}`) {
      statusReads++;
      return response(statusReads === 1 ? runningJob : succeededJob);
    }
    if (route === `/jobs/${baseJob.id}/result`) {
      resultReads++;
      return response(resultReads === 1 ? checkpoint : terminal);
    }
    throw new Error('unexpected synthetic route ' + route);
  }) as typeof fetch;

  await withDir(async (dir) => {
    const journal = await collector(fakeFetch).run(path.join(dir, 'journal.json'), request, LINK, plan);
    assert.equal(journal.errorCode, null);
    assert.equal(journal.terminal, true);
    assert.equal(journal.result?.format, 'shopee-sampled-result-v1');
    assert.equal(journal.result?.phase, 'terminal');
    assert.equal(journal.result?.complete, true);
    assert.equal(journal.result?.rows.length, 1);
    assert.equal(journal.result?.rows[0]?.reviewId, 'r1');
  });
  assert.equal(resultReads, 2, 'the running checkpoint is read before the terminal result');
  assert.ok(!calls.includes(`/jobs/${baseJob.id}/cancel`), 'a healthy attempt is never cancelled');
});

test('a written record with an unparsed raw date stays admissible instead of failing the job', async () => {
  const { plan, planSha256 } = planFixture();
  const request = requestFixture(planSha256);
  const created = AT.toISOString();
  const job = {
    id: '00000000-0000-4000-8000-000000000004', request, created_at: created, updated_at: created,
    result_available: true, collected: 1, state: 'succeeded',
  };
  const record = { ...RECORD, review_id: 'r-unknown-date', posted_at_local: 'không rõ ngày' };
  const pages = [{ filter: 'with-comments', page: 1, cards: 1, collected: 1, ids: ['r-unknown-date'] }];
  const result = {
    job_id: job.id, product_url: LINK.url, complete: true, stop_reason: 'exhausted',
    sampling: request.sampling, observed_at: created, records: [record], pages,
    groups: GROUPS, source_counts: sourceCounts(),
  };
  let submitted = false;

  const fakeFetch = (async (input: string | URL | Request) => {
    const route = new URL(String(input)).pathname + new URL(String(input)).search;
    if (route === '/session') return response({ state: 'ready', authenticated: true, checked_at: created });
    if (route === '/jobs?limit=100') return response(submitted ? [job] : []);
    if (route === '/jobs') { submitted = true; return response(job, 202); }
    if (route === `/jobs/${job.id}`) return response(job);
    if (route === `/jobs/${job.id}/result`) return response(result);
    throw new Error('unexpected synthetic route ' + route);
  }) as typeof fetch;

  await withDir(async (dir) => {
    const journal = await collector(fakeFetch).run(path.join(dir, 'journal.json'), request, LINK, plan);
    assert.equal(journal.errorCode, null);
    assert.equal(journal.terminal, true);
    const result = journal.result;
    assert.equal(result?.format, 'shopee-sampled-result-v1');
    const row = result?.format === 'shopee-sampled-result-v1' ? result.rows[0] : undefined;
    assert.equal(row?.createdAt, null);
    assert.deepEqual(row?.admissionReasons, ['SOURCE_TIME_NOT_PARSED']);
    assert.equal(row?.comment, 'Sản phẩm tốt');
  });
});

test('reconcile after a lost submit response and expired deadline reads, cancels and binds only the exact job', async () => {
  const { plan, planSha256 } = planFixture();
  const request = requestFixture(planSha256);
  const intentAt = new Date(AT.getTime() - 60_000);
  const deadline = new Date(AT.getTime() - 30_000);
  const candidateId = '00000000-0000-4000-8000-000000000002';
  const decoyId = '00000000-0000-4000-8000-000000000003';
  const job = (id: string, req: unknown, state: string, updated: string) => ({
    id, request: req, state, created_at: intentAt.toISOString(), updated_at: updated,
    result_available: false,
  });
  const candidate = job(candidateId, request, 'running', AT.toISOString());
  const decoyPolicy = reviewPolicy({ mode: 'all', stars: [], totalPerLink: 4, allocation: 'pooled' });
  const decoyRequest = { url: LINK.url, max_comments: 4,
    sampling: { planSha256, policySha256: samplingDigest(decoyPolicy), policy: decoyPolicy,
      attemptId: '00000000-0000-4000-8000-0000000000bb' } };
  const decoy = job(decoyId, decoyRequest, 'running', AT.toISOString());
  const cancelled = { ...candidate, state: 'cancelled', updated_at: new Date(AT.getTime() + 1000).toISOString() };
  const requests: { method: string; route: string }[] = [];

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = url.pathname + url.search;
    requests.push({ method: init?.method ?? 'GET', route });
    if (route === '/jobs?limit=100') return response([candidate, decoy]);
    if (route === `/jobs/${candidateId}/cancel`) return response({ state: 'cancelled' }, 202);
    if (route === `/jobs/${candidateId}`) return response(cancelled);
    throw new Error('unexpected synthetic route ' + route);
  }) as typeof fetch;

  await withDir(async (dir) => {
    const file = path.join(dir, 'journal.json');
    const journal = {
      format: 'shopee-sampling-journal-v1', inputSha256: samplingDigest(request), request,
      intentAt: intentAt.toISOString(), deadline: deadline.toISOString(), baselineIds: [], job: null,
      result: null, resultSha256: null, terminal: false, errorCode: null, requestCount: 1,
      requestCountUncertain: true, cancelIntent: false,
    };
    await writeFile(file, canonicalJson(journal), { mode: 0o600 });
    const controller = new AbortController();
    controller.abort();
    const recovered = await collector(fakeFetch).run(file, request, LINK, plan, true, controller.signal);

    assert.equal(recovered.terminal, true);
    assert.equal(recovered.errorCode, 'OWNER_ABORTED');
    assert.equal(recovered.job?.id, candidateId, 'only the exact policy identity is bound');
    assert.ok(!requests.some((entry) => entry.method === 'POST' && ['/jobs', '/count-jobs'].includes(entry.route)),
      'reconcile never submits a replacement');
    assert.deepEqual(requests.filter((entry) => entry.method === 'POST'),
      [{ method: 'POST', route: `/jobs/${candidateId}/cancel` }], 'past the deadline only the same attempt is cancelled');
    assert.ok(!requests.some((entry) => entry.route.includes(decoyId)), 'the decoy job is never read or cancelled');
  });
});

test('reconcile binds a page-limited job only when max_pages also matches', async () => {
  const policy = reviewPolicy({ mode: 'with-comments', stars: [], limitBy: 'pages', pagesPerLink: 10, allocation: 'pooled' });
  const plan = { format: 'shopee-review-plan-v1' as const, runId: 'run-synthetic', requestSha256: 'a'.repeat(64), m2Digest: 'b'.repeat(64),
    policy, policySha256: samplingDigest(policy), targets: starTargets(policy), links: [LINK] };
  const planSha256 = samplingDigest(plan);
  const request = { url: LINK.url, max_comments: 2000, max_pages: 10,
    sampling: { planSha256, policySha256: plan.policySha256, policy, attemptId: ATTEMPT } };
  const intentAt = new Date(AT.getTime() - 60_000);
  const job = (id: string, req: unknown) => ({ id, request: req, state: 'running', created_at: intentAt.toISOString(),
    updated_at: AT.toISOString(), result_available: false });
  const candidateId = '00000000-0000-4000-8000-000000000002';
  const decoyId = '00000000-0000-4000-8000-000000000003';
  const routes: string[] = [];
  const fakeFetch = (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    routes.push(url.pathname + url.search);
    if (url.pathname === '/jobs') return response([job(candidateId, request), job(decoyId, { ...request, max_pages: 20 })]);
    if (url.pathname === `/jobs/${candidateId}`) return response({ ...job(candidateId, request), state: 'cancelled' });
    if (url.pathname === `/jobs/${candidateId}/cancel`) return response({ state: 'cancelled' }, 202);
    throw new Error('unexpected synthetic route ' + url.pathname);
  }) as typeof fetch;

  await withDir(async (dir) => {
    const file = path.join(dir, 'journal.json');
    await writeFile(file, canonicalJson({
      format: 'shopee-sampling-journal-v1', inputSha256: samplingDigest(request), request,
      intentAt: intentAt.toISOString(), deadline: new Date(AT.getTime() - 30_000).toISOString(), baselineIds: [], job: null,
      result: null, resultSha256: null, terminal: false, errorCode: null, requestCount: 1,
      requestCountUncertain: true, cancelIntent: false,
    }), { mode: 0o600 });
    const controller = new AbortController();
    controller.abort();
    const recovered = await collector(fakeFetch).run(file, request, LINK, plan, true, controller.signal);
    assert.equal(recovered.job?.id, candidateId);
    assert.ok(!routes.some((route) => route.includes(decoyId)), 'a job with another page limit is never bound');
  });
});
