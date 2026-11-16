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

// Tests never touch the machine-wide lock of real runs.
const LOCK = path.join(tmpdir(), `shopee-sampling-lock-${process.pid}`, 'review-submit.lock');

function collector(fetchImpl: typeof fetch, options: Partial<ConstructorParameters<typeof ShopeeReviewSamplingCollector>[0]> = {}): ShopeeReviewSamplingCollector {
  return new ShopeeReviewSamplingCollector({
    token: TOKEN, fetch: fetchImpl, now: () => AT, sleep: async () => {}, submitLockFile: LOCK, ...options,
  });
}

/** A local review service: one job per POST, `running` for `runningReads` status reads, then `succeeded`. */
function busyService(otherActive: () => boolean, options: { runningReads?: number; postDelayMs?: number } = {}) {
  const created = AT.toISOString();
  const other = { id: '00000000-0000-4000-8000-0000000000f0', request: { url: 'https://shopee.vn/product/9/9', max_comments: 1 },
    created_at: created, updated_at: created, result_available: false };
  const jobs = new Map<string, { job: Record<string, unknown>; reads: number }>();
  const log = { posts: 0, postsWhileBusy: 0, lists: 0 };
  const isActive = (state: unknown) => state === 'queued' || state === 'running';
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = url.pathname + url.search;
    if (route === '/session') return response({ state: 'ready', authenticated: true, checked_at: created });
    if (route === '/jobs?limit=100') {
      log.lists++;
      return response([{ ...other, state: otherActive() ? 'running' : 'succeeded' }, ...[...jobs.values()].map(entry => entry.job)]);
    }
    if (route === '/jobs' && init?.method === 'POST') {
      log.posts++;
      if (otherActive() || [...jobs.values()].some(entry => isActive(entry.job.state))) log.postsWhileBusy++;
      const id = `00000000-0000-4000-8000-${String(jobs.size + 1).padStart(12, '0')}`;
      const job = { id, request: JSON.parse(String(init.body)), state: 'running', created_at: created, updated_at: created,
        result_available: true, collected: 1 };
      jobs.set(id, { job, reads: 0 });
      if (options.postDelayMs) await new Promise(resolve => setTimeout(resolve, options.postDelayMs));
      return response(job, 202);
    }
    const found = /^\/jobs\/([0-9a-f-]+)(\/result)?$/.exec(route);
    const entry = found ? jobs.get(found[1]!) : undefined;
    if (entry && !found![2]) {
      entry.reads++;
      if (entry.reads > (options.runningReads ?? 0)) entry.job = { ...entry.job, state: 'succeeded' };
      return response(entry.job);
    }
    if (entry) {
      const request = entry.job.request as { sampling: unknown };
      return response({ job_id: entry.job.id, product_url: LINK.url, complete: entry.job.state === 'succeeded',
        ...(entry.job.state === 'succeeded' ? { stop_reason: 'exhausted' } : {}), sampling: request.sampling, observed_at: created,
        records: [RECORD], pages: PAGES, groups: GROUPS, source_counts: sourceCounts() });
    }
    throw new Error('unexpected synthetic route ' + route);
  }) as typeof fetch;
  return { fakeFetch, log };
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

test('owner L4: a busy service is waited for, polling about every 10 s, then the job is submitted once', async () => {
  const { plan, planSha256 } = planFixture();
  const request = requestFixture(planSha256);
  let polls = 0;
  const { fakeFetch, log } = busyService(() => polls < 2);
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); if (ms === 10_000) polls++; };
  await withDir(async (dir) => {
    const journal = await collector(fakeFetch, { sleep }).run(path.join(dir, 'journal.json'), request, LINK, plan);
    assert.equal(journal.errorCode, null, 'another run being busy is not a failure');
    assert.equal(journal.terminal, true);
    assert.equal(journal.result?.format === 'shopee-sampled-result-v1' ? journal.result.rows.length : null, 1);
  });
  assert.deepEqual(sleeps.filter(ms => ms === 10_000), [10_000, 10_000], 'two waits while the other job ran');
  assert.deepEqual([log.posts, log.postsWhileBusy], [1, 0], 'one submit, only after the service became free');
});

test('owner L4: Stop while waiting for a busy service ends the attempt without any submit', async () => {
  const { plan, planSha256 } = planFixture();
  const request = requestFixture(planSha256);
  const { fakeFetch, log } = busyService(() => true);
  const controller = new AbortController();
  await withDir(async (dir) => {
    const journal = await collector(fakeFetch, { sleep: async () => { controller.abort(); } })
      .run(path.join(dir, 'journal.json'), request, LINK, plan, false, controller.signal);
    assert.deepEqual([journal.errorCode, journal.terminal, journal.intentAt, journal.job], ['OWNER_ABORTED', true, null, null]);
  });
  assert.equal(log.posts, 0, 'nothing is submitted while waiting');
});

test('owner L4: two waiting runs never both submit when the service becomes free', async () => {
  const { plan, planSha256 } = planFixture();
  const first = requestFixture(planSha256);
  const second = { ...first, sampling: { ...first.sampling, attemptId: '00000000-0000-4000-8000-0000000000bb' } };
  let polls = 0;
  // A slow submit response leaves room for the other run to read a still-free job list without the lock.
  const { fakeFetch, log } = busyService(() => polls < 2, { runningReads: 2, postDelayMs: 30 });
  const sleep = async (ms: number) => { if (ms === 10_000) polls++; await new Promise(resolve => setTimeout(resolve, 5)); };
  await withDir(async (dir) => {
    const [a, b] = await Promise.all([
      collector(fakeFetch, { sleep }).run(path.join(dir, 'a.json'), first, LINK, plan),
      collector(fakeFetch, { sleep }).run(path.join(dir, 'b.json'), second, LINK, plan),
    ]);
    assert.deepEqual([a.errorCode, b.errorCode], [null, null]);
    assert.notEqual(a.job?.id, b.job?.id, 'each run binds its own job');
  });
  assert.deepEqual([log.posts, log.postsWhileBusy], [2, 0], 'the second run submits only after the first job finished');
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
