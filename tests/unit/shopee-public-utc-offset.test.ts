import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import type { ShopeePublicJournal } from '../../contracts/foundation/shopee-public-journal.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { ShopeePublicReviewCollector } from '../../src/platform/collectors/shopee-public-reviews.js';
import { AT, IDS, PRODUCTS, TOKEN, job } from '../fixtures/shopee-public-results.js';
import { FakeClock, FakeTransport, ORIGIN, retainedFiles, successfulScript, temporaryPublicStore, type Exchange } from '../helpers/shopee-public-fakes.js';

type Boundary = 'submit' | 'status' | 'list';
type JobTimes = { created_at: string; updated_at: string };
const boundaries: Boundary[] = ['submit', 'status', 'list'];
const formats = [
  { name: 'whole seconds', wire: { created_at: '2026-02-01T00:00:00+00:00', updated_at: '2026-02-01T00:00:01+00:00' },
    stored: { created_at: AT, updated_at: '2026-02-01T00:00:01.000Z' } },
  { name: 'milliseconds', wire: { created_at: '2026-02-01T00:00:00.080+00:00', updated_at: '2026-02-01T00:00:01.123+00:00' },
    stored: { created_at: '2026-02-01T00:00:00.080Z', updated_at: '2026-02-01T00:00:01.123Z' } },
  { name: 'Python microseconds', wire: { created_at: '2026-02-01T00:00:00.080525+00:00', updated_at: '2026-02-01T00:00:01.123999+00:00' },
    stored: { created_at: '2026-02-01T00:00:00.080Z', updated_at: '2026-02-01T00:00:01.123Z' } },
];

function stampJobs(script: Exchange[], times: JobTimes) {
  for (const exchange of script) {
    if (exchange.body && typeof exchange.body === 'object' && 'created_at' in exchange.body) Object.assign(exchange.body, times);
  }
}

async function run(t: TestContext, script: Exchange[], products = PRODUCTS.slice(0, 1)) {
  const store = await temporaryPublicStore(t), clock = new FakeClock();
  const transport = new FakeTransport(script, () => clock.milliseconds);
  const observedJobs: NonNullable<ShopeePublicJournal['job']>[] = [];
  const collector = new ShopeePublicReviewCollector({ token: TOKEN, baseUrl: ORIGIN, journalRoot: store.journalRoot,
    maxReviewsPerProduct: 20, confirmedSourceSetSha256: 'a'.repeat(64), clock: clock.now, sleep: clock.sleep,
    fetch: async (input, init) => {
      // Observe durable state before the next service response can overwrite it.
      for (const [name, bytes] of await retainedFiles(store.journalRoot)) if (name.endsWith('.json')) {
        const journal: ShopeePublicJournal = JSON.parse(bytes.toString());
        if (journal.job) observedJobs.push(journal.job);
      }
      return transport.fetch(input, init);
    } });
  const value = await collector.collect(products.map(product => ({ ...product, platform: 'shopee' as const })), 'b'.repeat(64), 'synthetic-utc-offset');
  const files = await retainedFiles(store.journalRoot);
  const journals = [...files.values()].map(bytes => JSON.parse(bytes.toString()) as ShopeePublicJournal);
  return { value, transport, files, journals, observedJobs };
}

// Row 1: each reader owns a distinct risk (submit validation, bound status identity,
// and adoption from reconciliation). Other responses use the canonical equivalent.
for (const boundary of boundaries) for (const format of formats) {
  test(`S05 UTC row 1: ${boundary} accepts ${format.name} and persists canonical milliseconds`, async t => {
    const script = successfulScript([1]);
    stampJobs(script, format.stored);
    if (boundary === 'submit') Object.assign(script[2]!.body as object, format.wire);
    else if (boundary === 'status') {
      for (const index of [3, 4, 5]) Object.assign(script[index]!.body as object, format.wire);
      // The final all-Z observation also proves equivalent wire spellings compare equal.
    } else {
      script[2] = { method: 'POST', path: '/jobs', status: 503 };
      script.splice(3, 0, { method: 'GET', path: '/jobs?limit=100', body: [job(0, 'queued', format.wire)] });
    }
    const { value, journals, observedJobs, transport } = await run(t, script);
    assert.equal(value.listings[0]!.stopCode, null);
    assert.equal(value.listings[0]!.state, 'succeeded');
    assert.equal(value.listings[0]!.createdAt, format.stored.created_at);
    assert.equal(value.envelopes[0]!.rows.length, 1);
    assert.ok(observedJobs.length > 0, 'the accepted job was durably stored before polling');
    for (const stored of [...observedJobs, journals[0]!.job!]) {
      assert.equal(stored.created_at, format.stored.created_at);
      assert.equal(stored.updated_at, format.stored.updated_at);
    }
    assert.equal(journals[0]!.terminal!.createdAt, format.stored.created_at);
    transport.done();
  });
}

// Row 2: alter one field at a time so a valid companion cannot mask rejection.
const invalidJobTimes = [
  { name: 'positive offset', field: 'created_at', value: '2026-02-01T00:00:00+07:00' },
  { name: 'negative offset', field: 'updated_at', value: '2026-02-01T00:00:00-05:00' },
  { name: 'impossible calendar date', field: 'created_at', value: '2026-02-30T00:00:00+00:00' },
  { name: 'malformed text', field: 'updated_at', value: 'synthetic-invalid-time' },
] as const;
const rejectionCases = [
  ...boundaries.flatMap(boundary => invalidJobTimes.map(invalid => ({ boundary, ...invalid }))),
  { boundary: 'status' as const, name: 'unknown negative zero offset', field: 'created_at', value: '2026-02-01T00:00:00-00:00' },
  { boundary: 'status' as const, name: 'compact zero offset', field: 'updated_at', value: '2026-02-01T00:00:00+0000' },
];
for (const entry of rejectionCases) {
  // Submit/list cannot bind a valid job after dispatch: preserve the existing SUBMISSION_UNCERTAIN policy (S05 row 4).
  const expectedCode = entry.boundary === 'status' ? 'SHOPEE_REVIEW_INVALID_RESPONSE' : 'SUBMISSION_UNCERTAIN';
  test(`S05 UTC row 2: ${entry.boundary} rejects ${entry.field} ${entry.name} with ${expectedCode}`, async t => {
    const bad = job(0, 'queued', { [entry.field]: entry.value });
    let script: Exchange[];
    if (entry.boundary === 'status') {
      script = successfulScript([1]).slice(0, 4); script[3]!.body = bad;
    } else if (entry.boundary === 'submit') {
      script = successfulScript([1]).slice(0, 3); script[2]!.body = bad;
      script.push({ method: 'GET', path: '/jobs?limit=100', body: [] });
    } else {
      script = successfulScript([1]).slice(0, 2);
      script.push({ method: 'POST', path: '/jobs', status: 503 },
        { method: 'GET', path: '/jobs?limit=100', body: [bad] });
    }
    const { value, journals, transport } = await run(t, script);
    transport.done();
    assert.equal(value.envelopes.length, 0);
    assert.equal(value.listings[0]!.stopCode, expectedCode);
    assert.equal(journals[0]!.terminal!.stopCode, expectedCode);
    if (entry.boundary !== 'status') assert.equal(journals[0]!.job, null);
  });
}

// Row 3: two exact listings, including a real list-adoption path after a 503.
for (const reconcileSecond of [false, true]) {
  test(`S05 UTC row 3: two listings complete with zero-offset submit/list rows (${reconcileSecond ? 'reconciliation' : 'baseline'})`, async t => {
    const format = formats[2]!;
    const script = successfulScript([2, 1]).filter(exchange => {
      const body = exchange.body as { state?: string } | undefined;
      return exchange.method !== 'GET' || !['queued', 'running'].includes(body?.state ?? '');
    });
    stampJobs(script, format.wire);
    script[1]!.body = [job(2, 'succeeded', format.wire)];
    const secondList = script.findIndex((exchange, index) => index > 1 && exchange.path === '/jobs?limit=100');
    script[secondList]!.body = [job(0, 'succeeded', format.wire)];
    if (reconcileSecond) {
      const secondSubmit = secondList + 1;
      script[secondSubmit] = { method: 'POST', path: '/jobs', status: 503 };
      script.splice(secondSubmit + 1, 0, { method: 'GET', path: '/jobs?limit=100', body: [
        job(0, 'succeeded', format.wire), job(1, 'queued', format.wire),
      ] });
    }
    const { value, transport, journals } = await run(t, script, PRODUCTS.slice(0, 2));
    assert.equal(transport.posts().length, 2);
    assert.deepEqual(value.listings.map(receipt => [receipt.jobId, receipt.state, receipt.stopCode, receipt.complete]), [
      [IDS[0], 'succeeded', null, true], [IDS[1], 'succeeded', null, true],
    ]);
    assert.deepEqual(value.envelopes.map(envelope => [envelope.itemId, envelope.rows.length]), [['92001', 2], ['92002', 1]]);
    for (const journal of journals) {
      assert.equal(journal.job!.created_at, format.stored.created_at);
      assert.equal(journal.job!.updated_at, format.stored.updated_at);
      assert.equal(journal.terminal!.stopCode, null);
    }
    transport.done();
  });
}

// Row 4: frozen hashes captured by running this fixture with the pre-fix source
// from a070e8d2. Snapshot and terminal are the envelope and receipt stored in JSON.
const allZBaseline = [{ name: 'one synthetic completed listing', expected: {
  journal: 'b0176195fa77882cd47e840ec4b6ff723060c169bd4ef8c712ca58022aa78ece',
  envelope: '2a6b56a56d77cd35c392da424d6ab67adf48c11d7eedb71141006baf08ccab4a',
  receipt: '87785002735ed64abfe3a8edbbf3e028edc60d88392794e5df73fac8d1fccb86',
} }];
for (const baseline of allZBaseline) {
  test(`S05 UTC row 4: all-Z journal/envelope/receipt retain pre-fix bytes (${baseline.name})`, async t => {
    const { files, journals, value, transport } = await run(t, successfulScript([1]));
    assert.equal(files.size, 1);
    const journal = journals[0]!;
    const digest = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
    assert.deepEqual({ journal: digest([...files.values()][0]!), envelope: digest(canonicalJson(journal.snapshot)),
      receipt: digest(canonicalJson(journal.terminal)) }, baseline.expected);
    assert.equal(canonicalJson(value.envelopes[0]), canonicalJson(journal.snapshot));
    assert.equal(canonicalJson(value.listings[0]), canonicalJson(journal.terminal));
    transport.done();
  });
}

// Row 5: result timestamps have a nullable contract: rejecting an invalid field
// means storing null, while retaining the result's valid reviews and other time.
const resultTimeCases = [
  { field: 'started_at', storedField: 'startedAt', name: 'accepts microseconds', wire: '2026-02-01T00:00:00.080525+00:00', expected: '2026-02-01T00:00:00.080Z' },
  { field: 'started_at', storedField: 'startedAt', name: 'rejects non-zero offset', wire: '2026-02-01T00:00:00+07:00', expected: null },
  { field: 'finished_at', storedField: 'finishedAt', name: 'accepts whole seconds', wire: '2026-02-01T00:00:09+00:00', expected: '2026-02-01T00:00:09.000Z' },
  { field: 'finished_at', storedField: 'finishedAt', name: 'rejects malformed timestamp', wire: 'synthetic-invalid-time', expected: null },
] as const;
for (const entry of resultTimeCases) {
  test(`S05 UTC row 5: result ${entry.field} ${entry.name}`, async t => {
    const script = successfulScript([1]);
    Object.assign(script[6]!.body as object, { [entry.field]: entry.wire });
    const { value, journals, transport } = await run(t, script);
    assert.equal(value.listings[0]!.stopCode, null);
    assert.equal(value.envelopes[0]![entry.storedField], entry.expected);
    assert.equal(journals[0]!.snapshot![entry.storedField], entry.expected);
    const otherField = entry.storedField === 'startedAt' ? 'finishedAt' : 'startedAt';
    assert.equal(value.envelopes[0]![otherField], otherField === 'startedAt' ? AT : '2026-02-01T00:00:09.000Z');
    assert.equal(value.envelopes[0]!.rows.length, 1);
    transport.done();
  });
}
