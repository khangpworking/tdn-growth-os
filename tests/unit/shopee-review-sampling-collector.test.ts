import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import {
  reviewPolicy, samplingDigest, starTargets,
} from '../../src/modules/foundation/shopee-review-sampling.js';
import { ShopeeReviewSamplingCollector, readSamplingJournal } from '../../src/platform/collectors/shopee-review-sampling.js';
import { createM2LinkCheck, LinkCheckStop } from '../../scripts/module-link-check.js';
import { readdir } from 'node:fs/promises';

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
function busyService(otherActive: () => boolean, options: { runningReads?: number; postDelayMs?: number; clock?: () => Date } = {}) {
  const created = AT.toISOString();
  const other = { id: '00000000-0000-4000-8000-0000000000f0', request: { url: 'https://shopee.vn/product/9/9', max_comments: 1 },
    created_at: created, updated_at: created, result_available: false };
  const jobs = new Map<string, { job: Record<string, unknown>; reads: number }>();
  const log = { posts: 0, postsWhileBusy: 0, lists: 0 };
  const isActive = (state: unknown) => state === 'queued' || state === 'running';
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = url.pathname + url.search;
    if (route === '/session') return response({ state: 'ready', authenticated: true, checked_at: (options.clock?.() ?? AT).toISOString() });
    if (route === '/jobs?limit=100') {
      log.lists++;
      return response([{ ...other, state: otherActive() ? 'running' : 'succeeded' }, ...[...jobs.values()].map(entry => entry.job)]);
    }
    if ((route === '/jobs' || route === '/count-jobs') && init?.method === 'POST') {
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

test('owner L4: a lock held by another process blocks both waiters; its process ending releases it, nothing is removed as stale', async () => {
  const { plan, planSha256 } = planFixture();
  const first = requestFixture(planSha256);
  const second = { ...first, sampling: { ...first.sampling, attemptId: '00000000-0000-4000-8000-0000000000bb' } };
  const { fakeFetch, log } = busyService(() => false, { runningReads: 2, postDelayMs: 30 });
  await withDir(async (dir) => {
    const lock = path.join(dir, 'review-submit.lock');
    // Another run holds the lock in its own process (an old lock left by a run that will die).
    const holder = spawn(process.execPath, ['-e', `const D=require('better-sqlite3');const d=new D(${JSON.stringify(lock)},{timeout:0});` +
      `d.exec('BEGIN EXCLUSIVE');process.stdout.write('held\\n');setInterval(()=>{},1000);`], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'inherit'] });
    await once(holder.stdout!, 'data');
    let lockWaits = 0, postsWhileHeld: number | null = null;
    const sleep = async (ms: number) => {
      if (ms === 1_000 && ++lockWaits === 6 && postsWhileHeld === null) {
        postsWhileHeld = log.posts;
        const exited = once(holder, 'exit');
        holder.kill('SIGKILL');
        await exited;
      }
      await new Promise(resolve => setTimeout(resolve, 5));
    };
    let a, b;
    try {
      [a, b] = await Promise.all([
        collector(fakeFetch, { sleep, submitLockFile: lock }).run(path.join(dir, 'a.json'), first, LINK, plan),
        collector(fakeFetch, { sleep, submitLockFile: lock }).run(path.join(dir, 'b.json'), second, LINK, plan),
      ]);
    } finally { holder.kill('SIGKILL'); }
    assert.equal(postsWhileHeld, 0, 'no waiter submits while another process holds the lock');
    assert.deepEqual([a.errorCode, b.errorCode], [null, null]);
  });
  assert.deepEqual([log.posts, log.postsWhileBusy], [2, 0], 'after the holder died, the two waiters still submit one at a time');
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
  let journalFile = '';
  const atCancel: unknown[] = [];

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = url.pathname + url.search;
    requests.push({ method: init?.method ?? 'GET', route });
    if (route === '/jobs?limit=100') return response([candidate, decoy]);
    if (route === `/jobs/${candidateId}/cancel`) {
      // What a crash right now would leave on disk: the cancel intent and its reason, saved together.
      const saved = JSON.parse(await readFile(journalFile, 'utf8'));
      atCancel.push([saved.cancelIntent, saved.errorCode]);
      return response({ state: 'cancelled' }, 202);
    }
    if (route === `/jobs/${candidateId}`) return response(cancelled);
    throw new Error('unexpected synthetic route ' + route);
  }) as typeof fetch;

  await withDir(async (dir) => {
    const file = path.join(dir, 'journal.json');
    journalFile = file;
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
    // #9: the same expired job reconciled with no owner stop is recorded as DEADLINE, not as a stop by the owner.
    await writeFile(file, canonicalJson(journal), { mode: 0o600 });
    const expired = await collector(fakeFetch).run(file, request, LINK, plan, true);
    assert.deepEqual([expired.terminal, expired.errorCode], [true, 'DEADLINE']);
    assert.deepEqual(atCancel, [[true, 'OWNER_ABORTED'], [true, 'DEADLINE']], 'the reason is on disk before the cancel is sent');
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

const FAILED_JOB_ID = '00000000-0000-4000-8000-000000000031';

/** One job that reaches `error` on the collector side; nothing else is served. */
function failedService(error: string) {
  const created = AT.toISOString();
  let job: Record<string, unknown> | null = null;
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const route = url.pathname + url.search;
    if (route === '/session') return response({ state: 'ready', authenticated: true, checked_at: created });
    if (route === '/jobs?limit=100') return response(job ? [job] : []);
    if ((route === '/jobs' || route === '/count-jobs') && init?.method === 'POST') {
      job = { id: FAILED_JOB_ID, request: JSON.parse(String(init.body)), state: 'running',
        created_at: created, updated_at: created, result_available: false };
      return response(job, 202);
    }
    if (route === `/jobs/${FAILED_JOB_ID}`) return response({ ...job, state: 'failed', error });
    throw new Error('unexpected synthetic route ' + route);
  }) as typeof fetch;
}

test('a failed sampling or count job keeps PRODUCT_UNAVAILABLE and RATINGS_MISSING as its journal code', async () => {
  const { plan, planSha256 } = planFixture();
  const cases: [string, any, any][] = [
    ['sampling', requestFixture(planSha256), plan],
    ['counts', { kind: 'counts', url: LINK.url, request_key: ATTEMPT }, null],
  ];
  for (const [name, request, requestPlan] of cases) {
    for (const code of ['PRODUCT_UNAVAILABLE', 'RATINGS_MISSING']) {
      await withDir(async (dir) => {
        const journal = await collector(failedService(code)).run(path.join(dir, 'journal.json'), request, LINK, requestPlan);
        assert.deepEqual([journal.errorCode, journal.terminal], [code, true], `${name} job: ${code}`);
      });
    }
  }
});

test('any other failed job keeps the SOURCE_JOB_FAILED mapping', async () => {
  const { plan, planSha256 } = planFixture();
  await withDir(async (dir) => {
    const journal = await collector(failedService('SERVICE_RESTARTED')).run(path.join(dir, 'journal.json'), requestFixture(planSha256), LINK, plan);
    assert.deepEqual([journal.errorCode, journal.terminal], ['SOURCE_JOB_FAILED', true]);
  });
});

test('#1 1A: only a step-3 reading whose product page did not behave as expected is REVIEWS_UNREADABLE; a service failure is not', async () => {
  const { plan, planSha256 } = planFixture();
  const cases: [string, string, any, any][] = [
    ['CONTROL_CHANGED', 'REVIEWS_UNREADABLE', requestFixture(planSha256), plan],
    ['SOURCE_ACTION_FAILED', 'SOURCE_JOB_FAILED', requestFixture(planSha256), plan],
    ['CONTROL_CHANGED', 'SOURCE_JOB_FAILED', { kind: 'counts', url: LINK.url, request_key: ATTEMPT }, null],
  ];
  for (const [error, expected, request, requestPlan] of cases) await withDir(async (dir) => {
    const journal = await collector(failedService(error)).run(path.join(dir, 'journal.json'), request, LINK, requestPlan);
    assert.deepEqual([journal.errorCode, journal.terminal], [expected, true], `${error} / ${'kind' in request ? 'count' : 'step 3'}`);
  });
});

test('a running count job is polled each 1 s; a running step-3 sampling job keeps 3 s', async () => {
  const { plan, planSha256 } = planFixture();
  const cases: [string, any, any, number][] = [
    ['counts', { kind: 'counts', url: LINK.url, request_key: ATTEMPT }, null, 1_000],
    ['sampling', requestFixture(planSha256), plan, 3_000],
  ];
  for (const [name, request, requestPlan, expected] of cases) {
    const { fakeFetch, log } = busyService(() => false, { runningReads: 2 });
    const pollSleeps: number[] = [];
    const sleep = async (ms: number) => { if (log.posts > 0) pollSleeps.push(ms); };
    await withDir(async (dir) => {
      await collector(fakeFetch, { sleep }).run(path.join(dir, 'journal.json'), request, LINK, requestPlan);
    });
    assert.deepEqual(pollSleeps, [expected, expected], `${name}: two waits while the job was running`);
  }
});

const COUNT_LINK = { productBaseId: '1__200__100', shopId: '100', itemId: '200', url: LINK.url };

test('#2: a run that waited 15 minutes for another run still checks its step-2 links; each count job gets its 2 minutes from submission', async () => {
  let clock = AT.getTime();
  const now = () => new Date(clock), otherUntil = clock + 15 * 60_000;
  const { fakeFetch, log } = busyService(() => clock < otherUntil, { clock: now, runningReads: 1 });
  await withDir(async (dir) => {
    const journalDir = path.join(dir, 'link-check-journal');
    const { check } = createM2LinkCheck({ collector: collector(fakeFetch, { now, sleep: async (ms: number) => { clock += ms; } }),
      policy: null, journalDir, deadline: clock + 10 * 60_000, now });
    assert.equal((await check(COUNT_LINK)).result, 'ok', 'the 15-minute wait used neither the 2-minute nor the step-2 limit');
    assert.equal((await check(COUNT_LINK)).result, 'ok', 'the step-2 limit moved by the wait');
    for (const name of await readdir(journalDir)) {
      const journal = (await readSamplingJournal(path.join(journalDir, name)))!;
      assert.equal(Date.parse(journal.deadline) - Date.parse(journal.intentAt!), 120_000);
    }
  });
  assert.deepEqual([log.posts, log.postsWhileBusy], [2, 0]);
});

test('#9: the step-2 time limit ends a running count job as DEADLINE in its file, not as a stop by the owner', async () => {
  const stamp = () => new Date().toISOString();
  let job: Record<string, unknown> | null = null;
  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input)), route = url.pathname + url.search;
    if (route === '/session') return response({ state: 'ready', authenticated: true, checked_at: stamp() });
    if (route === '/jobs?limit=100') return response(job ? [job] : []);
    if (route === '/count-jobs' && init?.method === 'POST') {
      job = { id: '00000000-0000-4000-8000-000000000001', request: JSON.parse(String(init.body)), state: 'running',
        created_at: stamp(), updated_at: stamp(), result_available: false };
      return response(job, 202);
    }
    if (route.endsWith('/cancel')) { job = { ...job!, state: 'cancelled', updated_at: stamp() }; return response(job); }
    // The status read never answers: only a time limit ends it.
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))));
  }) as typeof fetch;
  await withDir(async (dir) => {
    const journalDir = path.join(dir, 'link-check-journal');
    const { check } = createM2LinkCheck({ collector: new ShopeeReviewSamplingCollector({ token: TOKEN, fetch: fakeFetch, submitLockFile: LOCK }),
      policy: null, journalDir, deadline: Date.now() + 400 });
    await assert.rejects(check(COUNT_LINK), (error: unknown) => error instanceof LinkCheckStop && error.code === 'LINK_CHECK_FAILED');
    const [name] = await readdir(journalDir);
    assert.equal((await readSamplingJournal(path.join(journalDir, name!)))!.errorCode, 'DEADLINE');
  });
});

test('#9: a deadline cancel keeps DEADLINE across a recovery that could not confirm it, then ends as DEADLINE', async () => {
  const request = { kind: 'counts', url: LINK.url, request_key: ATTEMPT } as const;
  const created = new Date(AT.getTime() - 60_000).toISOString();
  const bound = { id: '00000000-0000-4000-8000-000000000009', request, state: 'running', created_at: created, updated_at: created,
    result_available: false };
  let state = 'running';
  const fakeFetch = (async (input: string | URL | Request) => {
    const route = new URL(String(input)).pathname;
    if (route === `/jobs/${bound.id}`) return response({ ...bound, state, updated_at: AT.toISOString() });
    throw new Error('unexpected synthetic route ' + route);
  }) as typeof fetch;
  await withDir(async (dir) => {
    const file = path.join(dir, 'journal.json');
    // The shared budget ran out before the job's own deadline: the cancel was sent with its reason.
    await writeFile(file, canonicalJson({ format: 'shopee-sampling-journal-v1', inputSha256: samplingDigest(request), request,
      intentAt: created, deadline: new Date(AT.getTime() + 60_000).toISOString(), baselineIds: [], job: bound, result: null,
      resultSha256: null, terminal: false, errorCode: 'DEADLINE', requestCount: 2, requestCountUncertain: false, cancelIntent: true }), { mode: 0o600 });
    const unconfirmed = await collector(fakeFetch).run(file, request, LINK, null, true, undefined, { deadline: AT.getTime() + 60_000 });
    assert.deepEqual([unconfirmed.terminal, unconfirmed.errorCode], [false, 'DEADLINE'], 'the job still runs: the reason stays');
    state = 'cancelled';
    const ended = await collector(fakeFetch).run(file, request, LINK, null, true, undefined, { deadline: AT.getTime() + 60_000 });
    assert.deepEqual([ended.terminal, ended.errorCode], [true, 'DEADLINE']);
  });
});

test('#2: slow work before a submission with no other run uses the step-2 limit: nothing is submitted past it', async () => {
  let clock = AT.getTime(), sessions = 0;
  const now = () => new Date(clock);
  const { fakeFetch, log } = busyService(() => false, { clock: now });
  const slowFirstSession = (async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname === '/session' && sessions++ === 0) clock += 7 * 60_000;
    return fakeFetch(input, init);
  }) as typeof fetch;
  await withDir(async (dir) => {
    const journalDir = path.join(dir, 'link-check-journal');
    const { check, entries } = createM2LinkCheck({ collector: collector(slowFirstSession, { now, sleep: async (ms: number) => { clock += ms; } }),
      policy: null, journalDir, deadline: clock + 6 * 60_000, now });
    await assert.rejects(check(COUNT_LINK), (error: unknown) => error instanceof LinkCheckStop && error.code === 'LINK_CHECK_FAILED',
      'the 7 slow minutes were not a wait for another run');
    assert.deepEqual([log.posts, entries.length], [0, 0], 'no submission and no verdict');
    const [name] = await readdir(journalDir);
    assert.equal((await readSamplingJournal(path.join(journalDir, name!)))!.errorCode, 'DEADLINE');
  });
});

test('#2: a count job gets only what is left of the step-2 limit when that is under 2 minutes', async () => {
  let clock = AT.getTime(), sessions = 0;
  const now = () => new Date(clock);
  const { fakeFetch } = busyService(() => false, { clock: now });
  const slowSession = (async (input: string | URL | Request, init?: RequestInit) => {
    if (new URL(String(input)).pathname === '/session' && sessions++ === 0) clock += 20_000;   // 20 s of the 45 s used
    return fakeFetch(input, init);
  }) as typeof fetch;
  await withDir(async (dir) => {
    const journalDir = path.join(dir, 'link-check-journal');
    const { check } = createM2LinkCheck({ collector: collector(slowSession, { now, sleep: async (ms: number) => { clock += ms; } }),
      policy: null, journalDir, deadline: clock + 45_000, now });
    assert.equal((await check(COUNT_LINK)).result, 'ok');
    const [name] = await readdir(journalDir);
    const journal = (await readSamplingJournal(path.join(journalDir, name!)))!;
    assert.equal(Date.parse(journal.deadline) - Date.parse(journal.intentAt!), 25_000);
  });
});

test('#2: a caller deadline already passed when run() starts its work means no submission', async () => {
  const { fakeFetch, log } = busyService(() => false);
  await withDir(async (dir) => {
    const journal = await collector(fakeFetch).run(path.join(dir, 'journal.json'), { kind: 'counts', url: LINK.url, request_key: ATTEMPT },
      LINK, null, false, undefined, { deadline: AT.getTime() - 1 });
    assert.deepEqual([journal.errorCode, journal.terminal, journal.intentAt], ['DEADLINE', true, null]);
  });
  assert.equal(log.posts, 0);
});

test('#2: the wait for another run ends at 20 minutes as DEADLINE, with nothing submitted', async () => {
  let clock = AT.getTime();
  const now = () => new Date(clock), otherUntil = clock + 25 * 60_000;
  const { fakeFetch, log } = busyService(() => clock < otherUntil, { clock: now });
  await withDir(async (dir) => {
    const journal = await collector(fakeFetch, { now, sleep: async (ms: number) => { clock += ms; } })
      .run(path.join(dir, 'journal.json'), { kind: 'counts', url: LINK.url, request_key: ATTEMPT }, LINK, null);
    assert.deepEqual([journal.errorCode, journal.terminal, journal.intentAt], ['DEADLINE', true, null]);
  });
  assert.equal(log.posts, 0);
  assert.ok(clock - AT.getTime() <= 20 * 60_000 + 15_000, 'stopped at the 20-minute cap');
});
