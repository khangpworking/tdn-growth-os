import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { AutomationMarketMethodBridge, type AutomationMarketMethodInput } from '../../src/modules/analysis/research-automation/market-method-bridge.js';
import { ResearchAutomationIntegrityError, type CaptureRecord } from '../../src/modules/analysis/research-automation/model.js';

const runId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const period = { startDate: '2026-09-01', endDate: '2026-09-30' };
const now = () => new Date('2026-10-02T00:00:00.000Z');
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const digest = (value: unknown) => sha(Buffer.from(canonicalJson(value)));
const changes = (db: ReturnType<typeof openDatabase>['db']): number => (db.prepare('SELECT total_changes() AS count').get() as { count: number }).count;

async function fixture(t: TestContext, data: Record<string, unknown> = {
  product_id: '101', product_region: 'vn', product_name: 'Synthetic thermos', revenue: 1250.5, sales_volumn: 0,
  unit_price: 120000, min_price: 110000, max_price: 160000,
}, metrics = true, outcome = 'OK') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-market-bridge-'));
  const db = openDatabase({ databasePath: path.join(directory, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(directory, { recursive: true, force: true }); });
  const request = Buffer.from(JSON.stringify({ region: 'VN', language: 'vi-VN', currency: 'VND', product_id: '101', date_range: '2026-09-01~2026-09-30' }));
  const response = Buffer.from(JSON.stringify({ success: true, data }));
  const envelope = {
    contractVersion: 'research-automation-capture-v1', captureId: 'kalodata-0002', provider: 'KALODATA', operation: 'kalodata.product.detail',
    billing: 'PAID_CREDITS', method: 'POST', endpoint: 'https://www.kalodata.com/openapi/v1/tiktok/product/detail',
    requestParameters: JSON.parse(request.toString()) as unknown, requestBodyBytesBase64: request.toString('base64'), queryWindow: period,
    pageNumber: null, productRef: 'kalodata:101', requestedAt: '2026-10-02T00:00:00.000Z', completedAt: '2026-10-02T00:00:01.000Z',
    outcome, httpStatus: 200, responseBytesBase64: response.toString('base64'), responseSha256: sha(response), responseByteLength: response.length, providerCode: null,
  };
  const captureBytes = Buffer.from(canonicalJson(envelope));
  const stored = await artifacts.put(captureBytes);
  const capture: CaptureRecord = { stepId: 'COLLECTION', ordinal: 0, artifactSha256: stored.sha256,
    mediaType: 'application/vnd.tdn.research-automation.capture+json', provider: 'kalodata', operation: 'kalodata.product.detail',
    retrievedAt: envelope.completedAt, window: period, truncated: false };
  const input: AutomationMarketMethodInput = {
    runId, start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'PRODUCT', keyword: 'thermos',
      description: null, interview: null, requestedPeriod: { ...period, dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic owner-confirmed provider object',
      includeTerms: [], excludeTerms: [], selectedProductIds: ['kalodata:101'], peerProductIds: ['kalodata:202'] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [],
      comparables: metrics ? [
        { productId: 'kalodata:101', provider: 'kalodata', metric: 'GMV_VND', value: '1250.5', window: period, captureIndex: 0 },
        { productId: 'kalodata:101', provider: 'kalodata', metric: 'UNITS_SOLD', value: '0', window: period, captureIndex: 0 },
      ] : [], coverage: [], limitations: [] }, captures: [capture],
  };
  const bridge = new AutomationMarketMethodBridge({ db, artifactStore: artifacts, now });
  return { db, artifacts, bridge, input, envelope, captureBytes, request, response };
}

test('real retained detail bytes produce Foundation-bound M03/M08 inventory, not temporal sums or purchased-pack prices', async t => {
  const f = await fixture(t);
  const output = (await f.bridge.execute(f.input))!;
  assert.deepEqual(output.temporal.input.observations.map(row => [row.measure.literal, row.value.state, row.value.decimal]), [
    ['revenue', 'NON_EXACT', '1250.5'], ['sales_volumn', 'OBSERVED_ZERO', '0'],
  ]);
  assert.deepEqual(output.temporal.input.frame.members.map(row => [row.memberKey, row.identityState, row.listingId]), [
    ['kalodata:101', 'UNKNOWN', null], ['kalodata:202', 'UNKNOWN', null],
  ]);
  assert.deepEqual(output.temporal.operations, []);
  assert.deepEqual(output.temporal.input.observations[0]!.rawQuery, { start: '2026-09-01', end: '2026-09-30',
    binding: { sourceSha256: sha(f.request), locator: 'payloads/collection-0-request.json/date_range', fieldPointer: '/date_range' } });
  assert.equal(output.temporal.input.observations[0]!.observedWindow.interval, null);
  assert.equal(output.temporal.input.observations[0]!.measure.additive, null);
  assert.deepEqual(output.quotes.input.quotes.map(row => [row.price.state, row.price.value, row.price.range]), [
    ['NON_EXACT', '120000', null], ['RANGE', null, { minimum: '110000', maximum: '160000' }],
  ]);
  for (const row of output.quotes.quotes) for (const result of [row.pricePerPurchasedPack, row.pricePerPhysicalItem, row.pricePer100gNet, row.pricePer100gDrained]) {
    assert.equal(result.status, 'UNAVAILABLE'); assert.equal(result.exact, null); assert.ok(result.reasons.includes('PRICE_NOT_EXACT'));
  }
  assert.ok(output.temporal.input.sources.every(source => source.role === 'SOURCE'));
  const retained = await new SourcePackageService({ db: f.db, artifactStore: f.artifacts, now }).readVerified(output.sourcePackage.packageId);
  assert.equal(retained.manifest.packageKey, `automation-method:${runId}-market-v1`);
  assert.deepEqual(retained.files.find(file => file.path === 'captures/collection-0.json')!.bytes, f.captureBytes);
  assert.deepEqual(retained.files.find(file => file.path === 'payloads/collection-0-request.json')!.bytes, f.request);
  assert.deepEqual(retained.files.find(file => file.path === 'payloads/collection-0-response.json')!.bytes, f.response);
  assert.equal(output.temporal.input.observations[0]!.rawResponseSha256, sha(f.response));
  assert.equal(output.quotes.input.quotes[0]!.price.binding!.fieldPointer, '/data/unit_price');
  assert.equal(output.temporal.input.observations[0]!.source.fieldPointer, '/data/revenue');
  assert.ok(retained.files.every(file => file.independence === 'non_independent' && file.providerProvenance !== 'verified'));
  const before = changes(f.db);
  assert.deepEqual(await f.bridge.execute(f.input), output);
  assert.equal(changes(f.db), before, 'same run intake must be exact-idempotent');
});

test('price-only responses preserve zero, missing endpoints, unreadable fields and contradictory ranges without synthetic scalars', async t => {
  const cases = [
    { name: 'zero price and lower endpoint only', fields: { unit_price: 0, min_price: 12 }, state: 'NON_EXACT', value: '0', minimum: 'REPORTED_NON_EXACT', maximum: 'MISSING', rangeState: 'INCOMPLETE_OR_UNREADABLE', count: 1 },
    { name: 'unit price absent but complete range', fields: { min_price: 10, max_price: 20 }, state: 'MISSING', value: null, minimum: 'REPORTED_NON_EXACT', maximum: 'REPORTED_NON_EXACT', rangeState: 'REPORTED_RANGE', count: 2 },
    { name: 'unreadable upper endpoint', fields: { unit_price: '120000', min_price: 10, max_price: 'unknown' }, state: 'UNREADABLE', value: null, minimum: 'REPORTED_NON_EXACT', maximum: 'UNREADABLE', rangeState: 'INCOMPLETE_OR_UNREADABLE', count: 1 },
    { name: 'reversed endpoints', fields: { unit_price: 30, min_price: 40, max_price: 20 }, state: 'NON_EXACT', value: '30', minimum: 'REPORTED_NON_EXACT', maximum: 'REPORTED_NON_EXACT', rangeState: 'CONFLICTING', count: 1 },
  ];
  for (const c of cases) await t.test(c.name, async child => {
    const f = await fixture(child, { product_id: '101', product_region: 'vn', ...c.fields }, false, 'INVALID_PAYLOAD');
    const output = (await f.bridge.execute(f.input))!;
    assert.equal(output.temporal.input.observations.length, 0);
    assert.equal(output.quotes.input.quotes.length, c.count);
    const quote = output.quotes.input.quotes[0]!;
    assert.equal(quote.price.state, c.state); assert.equal(quote.price.value, c.value);
    const wording = JSON.parse(quote.offerText!) as { min_price: { state: string }; max_price: { state: string; present: boolean }; rangeState: string };
    assert.equal(wording.min_price.state, c.minimum); assert.equal(wording.max_price.state, c.maximum); assert.equal(wording.rangeState, c.rangeState);
    if (c.name === 'zero price and lower endpoint only') assert.equal(wording.max_price.present, false);
    assert.equal(quote.observedAt, null); assert.equal(quote.identity.variantState, 'UNKNOWN'); assert.equal(quote.pack.count.value, null);
    const retained = await new SourcePackageService({ db: f.db, artifactStore: f.artifacts, now }).readVerified(output.sourcePackage.packageId);
    const mapping = JSON.parse(retained.files.find(file => file.path === 'normalized/market-run.json')!.bytes.toString()) as { admittedCaptures: Array<{ retainedOutcome: string }> };
    assert.equal(mapping.admittedCaptures[0]!.retainedOutcome, 'INVALID_PAYLOAD');
  });
});

test('frozen package replay is mutation-free and rejects run, descriptor, capture and metadata drift', async t => {
  const f = await fixture(t);
  const output = (await f.bridge.execute(f.input))!;
  const committed = await f.artifacts.put(Buffer.from(canonicalJson(output)));
  const stored = JSON.parse((await f.artifacts.read(committed.sha256)).toString()) as unknown;
  f.db.pragma('query_only = ON');
  const readonlyBridge = new AutomationMarketMethodBridge({ db: f.db, artifactStore: f.artifacts,
    now: () => { throw new Error('replay must not use the clock'); } });
  const before = changes(f.db);
  assert.deepEqual(await readonlyBridge.verify(stored, f.input), output);
  assert.equal(changes(f.db), before);
  const changedDescriptor = structuredClone(output);
  changedDescriptor.quotes.input.quotes[0]!.price.value = '1';
  changedDescriptor.quotes.inputSha256 = digest(changedDescriptor.quotes.input);
  const { methodOutputId: _old, ...body } = changedDescriptor.quotes;
  changedDescriptor.quotes.methodOutputId = digest(body);
  await assert.rejects(() => readonlyBridge.verify(changedDescriptor, f.input), /retained descriptor/);
  await assert.rejects(() => readonlyBridge.verify(stored, { ...f.input, scope: { ...f.input.scope, definition: 'Changed scope' } }), /frozen run/);
  await assert.rejects(() => readonlyBridge.verify(stored, { ...f.input, captures: [{ ...f.input.captures[0]!, artifactSha256: 'f'.repeat(64) }] }), /frozen run/);
  f.db.pragma('query_only = OFF');
  // Model out-of-band store corruption in this disposable database. Normal
  // application writes cannot alter finalized metadata because this guard fires.
  f.db.exec('DROP TRIGGER foundation_source_package_files_no_update');
  f.db.prepare("UPDATE foundation_source_package_files SET provider_provenance='verified' WHERE package_id=? AND logical_path='payloads/collection-0-response.json'").run(output.sourcePackage.packageId);
  await assert.rejects(() => readonlyBridge.verify(stored, f.input), /metadata|manifest|differ/i);
});

test('raw response contradictions and inventory overflow reject admission before Foundation writes', async t => {
  const cases = [
    { name: 'wrong product', data: { product_id: '202', product_region: 'vn', unit_price: 10 }, metrics: false, message: /approved product/ },
    { name: 'wrong country', data: { product_id: '101', product_region: 'th', unit_price: 10 }, metrics: false, message: /contradicts/ },
    { name: 'wrong dates', data: { product_id: '101', date_range: '2026-08-01~2026-08-31', unit_price: 10 }, metrics: false, message: /contradicts/ },
    { name: 'normalized amount not actual field', data: { product_id: '101', product_region: 'vn', revenue: 999, sales_volumn: 0 }, metrics: true, message: /actual provider field/ },
  ];
  for (const c of cases) await t.test(c.name, async child => {
    const f = await fixture(child, c.data, c.metrics);
    const before = changes(f.db);
    await assert.rejects(() => f.bridge.execute(f.input), error => error instanceof ResearchAutomationIntegrityError && c.message.test(error.message));
    assert.equal(changes(f.db), before);
  });
  await t.test('502 quote records do not silently truncate to 500', async child => {
    const f = await fixture(child, { product_id: '101', product_region: 'vn', unit_price: 10, min_price: 8, max_price: 12 }, false);
    const captures: CaptureRecord[] = [];
    for (let ordinal = 0; ordinal < 251; ordinal++) {
      const retained = await f.artifacts.put(Buffer.from(canonicalJson({ ...f.envelope, captureId: `synthetic-${ordinal}` })));
      captures.push({ ...f.input.captures[0]!, ordinal, artifactSha256: retained.sha256 });
    }
    const before = changes(f.db);
    await assert.rejects(() => f.bridge.execute({ ...f.input, captures }), /quote inventory exceeds 500/);
    assert.equal(changes(f.db), before);
  });
});
