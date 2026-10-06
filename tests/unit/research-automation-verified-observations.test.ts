import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import {
  MAX_CAPTURE_ENVELOPE_BYTES, MAX_CAPTURES_PER_STEP, ResearchAutomationIntegrityError,
  type CaptureRecord, type StepResultDocument,
} from '../../src/modules/analysis/research-automation/model.js';
import {
  verifyAutomationObservations, type VerifyAutomationObservationsInput,
} from '../../src/modules/analysis/research-automation/verified-observations.js';

const runId = '22222222-2222-4222-8222-222222222222';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const window = { startDate: '2026-09-01', endDate: '2026-09-30' };
const completedAt = '2026-10-02T00:00:01.000Z';
type Fixture = VerifyAutomationObservationsInput & { readonly collection: StepResultDocument; readonly envelope: Record<string, unknown> };

function sha(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

function fixture(data: Record<string, unknown> = {
  product_id: '101', product_region: 'vn', product_name: 'Synthetic jelly', product_description: [],
  revenue: 1250.5, sales_volumn: 0, unit_price: 50, video_revenue: 0, live_revenue: 1250.5, shopping_mall_revenue: 0,
}): Fixture {
  const request = { region: 'VN', language: 'vi-VN', currency: 'VND', product_id: '101', date_range: '2026-09-01~2026-09-30', need_image: 1, need_extra: false };
  const response = Buffer.from(JSON.stringify({ success: true, data }));
  const envelope = {
    contractVersion: 'research-automation-capture-v1', captureId: 'kalodata-0002', provider: 'KALODATA',
    operation: 'kalodata.product.detail', billing: 'PAID_CREDITS', method: 'POST',
    endpoint: 'https://www.kalodata.com/openapi/v1/tiktok/product/detail', requestParameters: request,
    requestBodyBytesBase64: Buffer.from(JSON.stringify(request)).toString('base64'), queryWindow: window,
    pageNumber: null, productRef: 'kalodata:101', requestedAt: '2026-10-02T00:00:00.000Z', completedAt,
    outcome: 'OK', httpStatus: 200, responseBytesBase64: response.toString('base64'),
    responseSha256: sha(response), responseByteLength: response.byteLength, providerCode: null,
  };
  const input = {
    runId,
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'PRODUCT', keyword: 'jelly',
      description: null, interview: null, requestedPeriod: { ...window, dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Owner approved exact product',
      includeTerms: [], excludeTerms: [], selectedProductIds: ['kalodata:101'], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED',
      productCards: [], comparables: [
        { productId: 'kalodata:101', provider: 'kalodata', metric: 'GMV_VND', value: '1250.5', window, captureIndex: 0 },
        { productId: 'kalodata:101', provider: 'kalodata', metric: 'UNITS_SOLD', value: '0', window, captureIndex: 0 },
      ], coverage: [], limitations: [] },
    captures: [{ stepId: 'COLLECTION', ordinal: 0, artifactSha256: '', mediaType: 'application/vnd.tdn.research-automation.capture+json',
      provider: 'kalodata', operation: 'kalodata.product.detail', retrievedAt: completedAt, window, truncated: false }],
    captureBytes: new Map<string, Buffer>(), envelope,
  } as const;
  return retainEnvelope(input, envelope);
}

function retainEnvelope(input: Fixture, envelope: Record<string, unknown>, bytes = Buffer.from(canonicalJson(envelope))): Fixture {
  const digest = sha(bytes);
  const capture = { ...input.captures[0]!, artifactSha256: digest };
  return { ...input, envelope, captures: [capture], captureBytes: new Map([[digest, bytes]]) };
}

function changeResponse(input: Fixture, response: Buffer): Fixture {
  return retainEnvelope(input, { ...input.envelope, responseBytesBase64: response.toString('base64'),
    responseSha256: sha(response), responseByteLength: response.byteLength });
}

function reject(input: VerifyAutomationObservationsInput, message: RegExp): void {
  assert.throws(() => verifyAutomationObservations(input), error => error instanceof ResearchAutomationIntegrityError && message.test(error.message));
}

test('verifies actual Kalodata fields, exact evidence and zero without inventing a measure or product label', () => {
  const input = fixture();
  const actual = verifyAutomationObservations(input);
  assert.deepEqual(actual.map(row => ({ metric: row.comparable.metric, value: row.comparable.value, field: row.measureLiteral,
    source: row.sourceWording, locator: row.evidence.responseLocator, entity: row.entityLabel })), [
    { metric: 'GMV_VND', value: '1250.5', field: 'revenue', source: '{"revenue":1250.5}', locator: '/data/revenue', entity: 'Synthetic jelly' },
    { metric: 'UNITS_SOLD', value: '0', field: 'sales_volumn', source: '{"sales_volumn":0}', locator: '/data/sales_volumn', entity: 'Synthetic jelly' },
  ]);
  assert.equal(actual[0]!.comparable, input.collection.comparables[0]);
  assert.deepEqual(actual[0]!.evidence, {
    captureSha256: input.captures[0]!.artifactSha256, responseSha256: input.envelope.responseSha256,
    responseLocator: '/data/revenue', requestWindow: window, providerProductId: '101', retainedOutcome: 'OK',
  });
  const alternative = fixture({ product_id: '101', revenue: 1250.5, sales_volumn: null, sales_volume: 0 });
  const units = verifyAutomationObservations(alternative)[1]!;
  assert.equal(units.measureLiteral, 'sales_volume');
  assert.equal(units.evidence.responseLocator, '/data/sales_volume');
  assert.equal(units.sourceWording, '{"sales_volume":0}');
  assert.equal(units.entityLabel, null);
  const unnamed = verifyAutomationObservations(fixture({ product_id: '101', product_name: ' \n\t ', revenue: 1250.5, sales_volumn: 0 }));
  assert.deepEqual(unnamed.map(row => [row.comparable.value, row.entityLabel]), [['1250.5', null], ['0', null]]);
});

test('revalidates historical INVALID_PAYLOAD captures only when their unchanged raw exchange is currently valid', () => {
  const original = fixture();
  const recovered = retainEnvelope(original, { ...original.envelope, outcome: 'INVALID_PAYLOAD' });
  const retainedBytes = Buffer.from(recovered.captureBytes.get(recovered.captures[0]!.artifactSha256)!);
  const actual = verifyAutomationObservations(recovered);
  assert.deepEqual(actual.map(row => [row.comparable.value, row.evidence.retainedOutcome]), [
    ['1250.5', 'INVALID_PAYLOAD'], ['0', 'INVALID_PAYLOAD'],
  ]);
  assert.equal(recovered.envelope.outcome, 'INVALID_PAYLOAD');
  assert.deepEqual(recovered.captureBytes.get(recovered.captures[0]!.artifactSha256), retainedBytes);
  const malformed = fixture({ product_id: '101', product_region: 'vn', revenue: '1250.5', sales_volumn: 0 });
  reject(retainEnvelope(malformed, { ...malformed.envelope, outcome: 'INVALID_PAYLOAD' }), /actual provider field/);
  const wrongCountry = fixture({ product_id: '101', product_region: 'th', revenue: 1250.5, sales_volumn: 0 });
  reject(retainEnvelope(wrongCountry, { ...wrongCountry.envelope, outcome: 'INVALID_PAYLOAD' }), /contradicts its requested/);
  reject(changeResponse(recovered, Buffer.from('{"success":false,"data":{"product_id":"101","revenue":1250.5,"sales_volumn":0}}')), /no successful provider record/);
  reject(retainEnvelope(recovered, { ...recovered.envelope, httpStatus: 403 }), /capture metadata/);
});

test('uses the COLLECTION ordinal map when retained capture records are unordered and other steps share ordinals', () => {
  const input = fixture();
  const collectionCapture = { ...input.captures[0]!, ordinal: 2 };
  const discoveryCapture: CaptureRecord = { ...collectionCapture, stepId: 'QUICK_SEARCH', ordinal: 0, operation: 'kalodata.product.rank' };
  const actual = verifyAutomationObservations({ ...input, captures: [discoveryCapture, collectionCapture],
    collection: { ...input.collection, comparables: input.collection.comparables.map(row => ({ ...row, captureIndex: 2 })) } });
  assert.deepEqual(actual.map(row => row.comparable.value), ['1250.5', '0']);
  reject({ ...input, captures: [collectionCapture], collection: input.collection }, /incompatible collection capture/);
  reject({ ...input, captures: [input.captures[0]!, input.captures[0]!] }, /ordinal is duplicated/);
});

test('rejects normalized measures that disagree with a valid retained successful response', () => {
  const cases = [
    { label: 'changed revenue', data: { revenue: 1251 }, message: /actual provider field/ },
    { label: 'missing revenue', data: { revenue: undefined }, message: /actual provider field/ },
    { label: 'missing units', data: { sales_volumn: undefined }, message: /actual provider field/ },
    { label: 'string revenue', data: { revenue: '1250.5' }, message: /actual provider field/ },
    { label: 'fractional units', data: { sales_volumn: 0.5 }, message: /actual provider field/ },
    { label: 'unsafe amount', data: { revenue: Number.MAX_SAFE_INTEGER + 1 }, message: /actual provider field/ },
    { label: 'negative amount', data: { revenue: -1 }, message: /actual provider field/ },
    { label: 'wrong product', data: { product_id: '999' }, message: /response product/ },
    { label: 'numeric product ID', data: { product_id: 101 }, message: /response product/ },
    { label: 'wrong region', data: { product_region: 'th' }, message: /contradicts its requested/ },
    { label: 'wrong currency', data: { currency: 'USD' }, message: /contradicts its requested/ },
    { label: 'wrong dates', data: { date_range: '2026-08-01~2026-08-30' }, message: /contradicts its requested/ },
  ];
  for (const row of cases) {
    const data: Record<string, unknown> = { product_id: '101', product_region: 'vn', revenue: 1250.5, sales_volumn: 0, ...row.data };
    for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
    assert.throws(() => verifyAutomationObservations(fixture(data)), error =>
      error instanceof ResearchAutomationIntegrityError && row.message.test(error.message), row.label);
  }
  const input = fixture();
  reject({ ...input, collection: { ...input.collection, comparables: [{ ...input.collection.comparables[0]!, value: '1251' }] } }, /actual provider field/);
});

test('rejects mismatched request scope even when new capture and response hashes are valid', () => {
  const input = fixture();
  for (const patch of [{ region: 'TH' }, { currency: 'USD' }, { product_id: '999' }, { date_range: '2026-08-01~2026-08-30' }]) {
    const request = { ...(input.envelope.requestParameters as Record<string, unknown>), ...patch };
    reject(retainEnvelope(input, { ...input.envelope, requestParameters: request,
      requestBodyBytesBase64: Buffer.from(JSON.stringify(request)).toString('base64') }), /request country, currency, product or dates/);
  }
  reject(retainEnvelope(input, { ...input.envelope, requestParameters: { region: 'VN', currency: 'VND' } }), /request country/);
});

test('rejects capture corruption, false response receipts, invalid byte encoding and unsuccessful payloads', () => {
  const input = fixture();
  const digest = input.captures[0]!.artifactSha256;
  reject({ ...input, captureBytes: new Map() }, /capture bytes are missing/);
  reject({ ...input, captureBytes: new Map([[digest, Buffer.from('{}')]]) }, /different digest/);
  reject({ ...input, captureBytes: new Map([[digest, Buffer.alloc(MAX_CAPTURE_ENVELOPE_BYTES + 1)]]) }, /oversized/);
  reject(retainEnvelope(input, input.envelope, Buffer.from(JSON.stringify(input.envelope))), /not canonical JSON/);
  const patches: readonly [Record<string, unknown>, RegExp][] = [
    [{ responseSha256: 'f'.repeat(64) }, /response length or digest/],
    [{ responseByteLength: 1 }, /response length or digest/],
    [{ responseBytesBase64: null }, /response bytes are missing/],
    [{ responseBytesBase64: '%%%=' }, /invalid base64/],
    [{ requestBodyBytesBase64: 'e30' }, /request bytes are missing or invalid base64/],
  ];
  for (const [patch, message] of patches) reject(retainEnvelope(input, { ...input.envelope, ...patch }), message);
  const invalidUtf8 = Buffer.concat([Buffer.from('{"success":true,"data":{"product_id":"101","note":"'), Buffer.from([255]), Buffer.from('"}}')]);
  reject(changeResponse(input, invalidUtf8), /response bytes are not valid UTF-8/);
  reject(changeResponse(input, Buffer.from('not JSON')), /response bytes are not valid JSON/);
  reject(changeResponse(input, Buffer.from('{"success":false,"data":{"product_id":"101","revenue":1250.5,"sales_volumn":0}}')), /no successful provider record/);
  reject(changeResponse(input, Buffer.from('{"success":true,"data":null}')), /no successful provider record/);
});

test('requires matching successful capture metadata and never interprets an unknown provider as Kalodata', () => {
  const input = fixture();
  const patches = [
    { provider: 'SERPAPI' }, { operation: 'kalodata.product.rank' }, { method: 'GET' },
    { endpoint: 'https://example.com/detail' }, { outcome: 'HTTP_ERROR' }, { httpStatus: 500 },
    { completedAt: '2026-10-02T00:00:02.000Z' }, { queryWindow: { ...window, endDate: '2026-09-29' } },
    { requestedAt: '2026-10-02T00:00:03.000Z' },
  ];
  for (const patch of patches) reject(retainEnvelope(input, { ...input.envelope, ...patch }), /capture metadata/);
  reject(retainEnvelope(input, { ...input.envelope, productRef: 'kalodata:999' }), /request country/);
  for (const patch of [{ truncated: true }, { provider: 'serpapi' }, { operation: 'serpapi.google.search' }, { mediaType: 'application/json' }]) {
    reject({ ...input, captures: [{ ...input.captures[0]!, ...patch }] }, /incompatible collection capture/);
  }
  reject({ ...input, collection: { ...input.collection, comparables: [{ ...input.collection.comparables[0]!, provider: 'serpapi' }] } }, /not supported or approved/);
});

test('enforces frozen run, approved refs, exact period and uniqueness before admitting any observation', () => {
  const input = fixture();
  reject({ ...input, scope: { ...input.scope, runId: 'different-run' } }, /run, scope or requested period/);
  reject({ ...input, scope: { ...input.scope, workspaceId: 'different-workspace' } }, /run, scope or requested period/);
  reject({ ...input, collection: { ...input.collection, runId: 'different-run' } }, /collection identity/);
  reject({ ...input, scope: { ...input.scope, selectedProductIds: [] } }, /not supported or approved/);
  reject({ ...input, start: { ...input.start, requestedPeriod: { ...window, dayCount: 31 } } }, /requested period/);
  reject({ ...input, collection: { ...input.collection, comparables: [{ ...input.collection.comparables[0]!,
    window: { startDate: '2026-08-31', endDate: '2026-09-29' } }] } }, /outside the supported requested period/);
  reject({ ...input, collection: { ...input.collection, comparables: [{ ...input.collection.comparables[0]!,
    window: { startDate: '2026-09-31', endDate: '2026-09-31' } }] } }, /outside the supported requested period/);
  reject({ ...input, collection: { ...input.collection, comparables: [input.collection.comparables[0]!, input.collection.comparables[0]!] } }, /metric window is duplicated/);
  reject({ ...input, captures: [{ ...input.captures[0]!, ordinal: MAX_CAPTURES_PER_STEP }] }, /capture ordinal/);
  reject({ ...input, collection: { ...input.collection, comparables: Array(MAX_CAPTURES_PER_STEP * 2 + 1).fill(input.collection.comparables[0]!) } }, /collection identity or bound/);
  assert.equal(verifyAutomationObservations({ ...input, scope: { ...input.scope, selectedProductIds: [], peerProductIds: ['kalodata:101'] } }).length, 2);
  assert.deepEqual(verifyAutomationObservations({ ...input, collection: null, captures: [], captureBytes: new Map() }), []);
  assert.deepEqual(verifyAutomationObservations({ ...input, collection: { ...input.collection, comparables: [] }, captureBytes: new Map() }), []);
});
