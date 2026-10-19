import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import * as ts from 'typescript';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { validateMetricWebSnapshot } from '../../src/modules/analysis/research-automation/metric-web-snapshot.js';
import { MAX_METRIC_CAPTURE_BYTES, MetricCaptureRejection, verifyMetricCaptureArchive } from '../../src/modules/analysis/research-automation/metric-capture-intake.js';
import { readerRowsFromMetricCapture } from '../../src/modules/analysis/reader-report/metric-capture-rows.js';
import { CAPTURE_ROW_PROFILE, CAPTURE_ROW_PROFILE_V2 } from '../../src/modules/analysis/research-automation/capture-row-quality.js';

const captureUrl = new URL('../../tools/opencli-metric/clis/metric/capture.js', import.meta.url);
const metricUrl = new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url);
const manifestSchemaUrl = new URL('../../contracts/analysis/automation-metric-results-capture-v1.schema.json', import.meta.url);
const snapshotSchemaUrl = new URL('../../contracts/analysis/automation-metric-web-snapshot-v1.schema.json', import.meta.url);
const METRIC_DATA_VERSION = 'metric-results-data-v2';

const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const rawFixture = (): unknown => JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8'));
/** Mutable draft of the fixture JSON; `validateMetricWebSnapshot` is the real gate at the end. */
type SnapshotDraft = Record<string, unknown> & { scope: Record<string, unknown>; groups: Record<string, Record<string, unknown>> };

function snapshotFixture(): AutomationMetricWebSnapshotV1 {
  const snapshot = rawFixture() as SnapshotDraft;
  snapshot.captureId = 'capture-synthetic-209';
  snapshot.scope = {
    keywords: ['synthetic jar'], platforms: ['shopee', 'tiktok'],
    period: { startDate: '2026-01-01', endDate: '2026-01-29' }, category: null,
    ticks: [], advancedFilters: [], exclusions: [],
  };
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_CAPTURED' };
  const productColumns = ['name', 'shop', 'platform', 'revenue', 'units', 'category'];
  const cell = (label: string, text: string, pointer: string) => ({ label, text, sourcePointer: pointer });
  const value = (label: string, number: number | null, unit: 'VND' | 'COUNT', platform: 'shopee' | 'tiktok' | 'unknown') => ({
    label, displayed: number === null ? '–' : String(number), value: number, unit, precision: 'exact', platform,
    period: snapshot.scope.period, sourcePointer: `${platform}.${label}`,
  });
  snapshot.groups.W12_topProducts = {
    columns: productColumns,
    rows: [
      { cells: { name: cell('Tên', 'Synthetic A', 'products[0].name'), shop: cell('Shop', 'Shop A', 'products[0].shop'), platform: cell('Sàn', 'shopee', 'products[0].platform'), revenue: value('Doanh thu', 1200, 'VND', 'shopee'), units: value('Lượt bán', 3, 'COUNT', 'shopee'), category: cell('Ngành', 'Nhóm A', 'products[0].category') } },
      { cells: { name: cell('Tên', 'Synthetic B', 'products[1].name'), shop: cell('Shop', 'Shop B', 'products[1].shop'), platform: cell('Sàn', 'tiktok', 'products[1].platform'), revenue: value('Doanh thu', 800, 'VND', 'tiktok'), units: value('Lượt bán', 0, 'COUNT', 'tiktok'), category: cell('Ngành', 'Nhóm B', 'products[1].category') } },
      { cells: { name: cell('Tên', 'Synthetic unknown', 'products[2].name'), shop: cell('Shop', 'Shop ?', 'products[2].shop'), platform: cell('Sàn', 'unknown', 'products[2].platform'), revenue: value('Doanh thu', 500, 'VND', 'unknown'), units: value('Lượt bán', null, 'COUNT', 'unknown'), category: cell('Ngành', 'Nhóm ?', 'products[2].category') } },
    ],
  };
  return validateMetricWebSnapshot(snapshot);
}

function archive(snapshot: AutomationMetricWebSnapshotV1, captureGate: unknown = { cleared: true }, extra: Record<string, unknown> = {}): { snapshot: Buffer; manifest: Buffer } {
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = {
    contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: snapshot.scope, resultCount: 3,
    productPagination: { cap: 3, totalShown: 5, pageSize: 3, pagesRead: 1, rowsRead: 3, truncated: true },
    views: [], sourceMap: {}, files: [{ path: 'snapshot.json', sha256: hash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }],
    screenshotSkips: [], archive: { rawResponses: 'raw/', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: [] }, noReportFileRequested: true,
    captureGate,
    ...extra,
  };
  return { snapshot: snapshotBytes, manifest: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}

const rejects = (run: () => unknown, code: string): void => {
  assert.throws(run, (error: unknown) => error instanceof MetricCaptureRejection && error.code === code, code);
};

/** The three page toggles the adapter adds to `appliedFilters` on top of the snapshot scope. */
const adapterToggles = (): Record<string, unknown> => ({
  smartQuery: true, aiNormalisation: false, usefulFilters: { fake: false, gifts: true, deleted: false },
});

const realisticChartSeries = (): Record<string, unknown> => ({
  contractVersion: METRIC_DATA_VERSION,
  series: [
    { series: 'priceRange', platform: 'shopee', label: '0-100', value: 320, source: 'response:/v2/market/search_basic' },
    { series: 'priceRange', platform: 'shopee', label: '100-200', value: 210, source: 'response:/v2/market/search_basic' },
    { series: 'priceRange', platform: 'tiktok', label: '0-100', value: 410, source: 'response:/v2/market/search_basic' },
    { series: 'priceRange', platform: 'tiktok', label: '100-200', value: 180, source: 'response:/v2/market/search_basic' },
    { series: 'headline', platform: 'shopee', revenue: 1000, units: 10, previousRevenue: 900, previousUnits: 9, source: 'response:/v2/market/search_basic' },
  ],
  trendOffered: false,
  trendNote: 'not offered by the source',
});

test('capture rows split platforms, preserve unknown attribution, and use stable synthetic IDs with honest nulls', () => {
  const snapshot = snapshotFixture();
  const first = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], 'automation-metric-capture-v1');
  const second = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], 'automation-metric-capture-v1');
  assert.deepEqual(first.rows.map(row => row.platform), ['shopee', 'tiktok']);
  assert.equal(first.unattributed.length, 1);
  assert.equal(first.rows[0]!.listingSynthetic, true);
  assert.equal(first.rows[0]!.listing, second.rows[0]!.listing);
  assert.equal(first.rows[0]!.start, null);
  assert.equal(first.rows[0]!.brand, '(không ghi)');
  assert.equal(first.rows[1]!.asp, null);
  assert.equal(first.unattributed[0]!.platform, 'unknown');
  assert.equal(first.unattributed[0]!.listingSynthetic, true);
  assert.equal(first.unattributed[0]!.listing, second.unattributed[0]!.listing);
});

test('reader rows replay v2 and v3 on identical source bytes, preserving lineage and exclusion reasons', () => {
  const draft = snapshotFixture();
  draft.scope.keywords = ['quạt điện'];
  const table = draft.groups.W12_topProducts;
  assert.ok(!('absent' in table));
  const names = ['Trục quạt điện mẫu thử', 'Quạt điện lắc đầu mẫu thử', 'Chiết áp mẫu thử quạt điện', 'Đầu mùa sale Quạt điện mẫu thử', 'Motor quạt điện'];
  table.rows = names.map((name, i) => {
    const row = structuredClone(table.rows[i % 2]!);
    const cells = row.cells as Record<string, { text?: string; value?: number | null; displayed?: string }>;
    cells.name!.text = name;
    cells.revenue!.value = 100; cells.revenue!.displayed = '100';
    cells.units!.value = 1; cells.units!.displayed = '1';
    return row;
  });
  const snapshot = validateMetricWebSnapshot(draft), retained = canonicalJson(snapshot);
  const v2 = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], CAPTURE_ROW_PROFILE_V2);
  const v3 = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], CAPTURE_ROW_PROFILE);
  assert.deepEqual(v2.rows.map(row => row.title), names.slice(0, 4));
  assert.deepEqual(v2.excluded.map(row => [row.title, row.reason]), [[names[4], 'NOT_MAIN_PRODUCT']]);
  assert.deepEqual(v3.rows.map(row => row.title), [names[1], names[3]]);
  assert.deepEqual(v3.excluded.map(row => [row.title, row.reason]), [names[0], names[2], names[4]].map(name => [name, 'NOT_MAIN_PRODUCT']));
  assert.deepEqual(readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok']), v3, 'default is latest');
  const keptV2 = v2.rows.find(row => row.title === names[1])!;
  assert.deepEqual(v3.rows[0], keptV2, 'row identity and raw position do not depend on filtering');
  const v1 = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], 'automation-metric-capture-v1');
  assert.equal(v1.rows.length, names.length, 'v1 negative control retains even old accessory prefixes');
  assert.deepEqual(v1.excluded, []);
  assert.equal(canonicalJson(snapshot), retained);
});

test('capture archive validates pretty JSON bytes and refuses digest, gate, schema, and size failures with typed codes', () => {
  const valid = archive(snapshotFixture());
  const checked = verifyMetricCaptureArchive(valid.snapshot, valid.manifest);
  assert.equal(checked.capture.truncation.rowsRead, 3);
  const missingGate = JSON.parse(valid.manifest.toString('utf8')) as Record<string, unknown>;
  delete missingGate.captureGate;
  assert.throws(() => verifyMetricCaptureArchive(valid.snapshot, Buffer.from(JSON.stringify(missingGate))),
    (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_GATE_NOT_CLEARED');
  const cleared = archive(snapshotFixture(), { cleared: true });
  assert.equal(verifyMetricCaptureArchive(cleared.snapshot, cleared.manifest).capture.captureId, 'capture-synthetic-209');
  const wrongValue = JSON.parse(valid.snapshot.toString('utf8')); wrongValue.capturedAt = '2026-01-01T00:00:01Z';
  const wrongSnapshot = Buffer.from(JSON.stringify(wrongValue, null, 2) + '\n');
  assert.throws(() => verifyMetricCaptureArchive(wrongSnapshot, valid.manifest), (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_DIGEST_MISMATCH');
  for (const gate of [true, false, { cleared: false }, { cleared: false, status: 'REPLAY' }, { cleared: false, status: 'CLEARED' }, { status: 'CLEARED' }, { cleared: true, status: 'CLEARED' }, { cleared: true, status: 'BLOCKED' }, { cleared: 'true' }, {}]) {
    const uncleared = archive(snapshotFixture(), gate);
    assert.throws(() => verifyMetricCaptureArchive(uncleared.snapshot, uncleared.manifest), (error: unknown) => error instanceof MetricCaptureRejection && ['CAPTURE_GATE_NOT_CLEARED', 'CAPTURE_MANIFEST_INVALID'].includes(error.code), JSON.stringify(gate));
  }
  const invalid = JSON.parse(valid.snapshot.toString('utf8')); invalid.groups.W12_topProducts.rows[0].cells.name = { wrong: true };
  const invalidBytes = Buffer.from(canonicalJson(invalid));
  const invalidManifest = JSON.parse(valid.manifest.toString('utf8')); invalidManifest.files[0].sha256 = hash(invalidBytes); invalidManifest.files[0].byteSize = invalidBytes.length;
  assert.throws(() => verifyMetricCaptureArchive(invalidBytes, Buffer.from(canonicalJson(invalidManifest))), (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_SCHEMA_INVALID');
  assert.throws(() => verifyMetricCaptureArchive(Buffer.alloc(MAX_METRIC_CAPTURE_BYTES + 1), valid.manifest), (error: unknown) => error instanceof MetricCaptureRejection && error.code === 'CAPTURE_OVERSIZE');
});

function verified(snapshot: AutomationMetricWebSnapshotV1, extra: Record<string, unknown> = {}, gate: unknown = { cleared: true }) {
  const files = archive(snapshot, gate, extra);
  return verifyMetricCaptureArchive(files.snapshot, files.manifest);
}

const rejected = (snapshot: AutomationMetricWebSnapshotV1, extra: Record<string, unknown>, code: string): void =>
  rejects(() => verified(snapshot, extra), code);

test('manifest accepts the adapter chart-series fields and rejects malformed ones', () => {
  const snapshot = snapshotFixture();
  const ok = verified(snapshot, { metricDataVersion: METRIC_DATA_VERSION, chartSeries: realisticChartSeries() });
  assert.equal(ok.manifest.metricDataVersion, METRIC_DATA_VERSION);
  assert.equal(ok.manifest.chartSeries?.series.length, 5);
  // Older captures without the two fields stay valid.
  assert.equal(verified(snapshot).manifest.metricDataVersion, undefined);
  // A version the adapter does not emit is refused.
  rejected(snapshot, { metricDataVersion: 'metric-results-data-v3' }, 'CAPTURE_MANIFEST_INVALID');
  // A top-level key the adapter never writes is refused.
  rejected(snapshot, { unknownKey: 1 }, 'CAPTURE_MANIFEST_INVALID');
  const malformed = realisticChartSeries();
  malformed.series = [{ ...(malformed.series as Record<string, unknown>[])[0], extra: 1 }];
  rejected(snapshot, { chartSeries: malformed }, 'CAPTURE_MANIFEST_INVALID');
  const wrongType = realisticChartSeries();
  wrongType.series = 'not-an-array';
  rejected(snapshot, { chartSeries: wrongType }, 'CAPTURE_MANIFEST_INVALID');
  rejected(snapshot, { chartSeries: 'not-an-object' }, 'CAPTURE_MANIFEST_INVALID');
});

test('manifest accepts the adapter page toggles in appliedFilters and keeps the snapshot scope exact', () => {
  const snapshot = snapshotFixture();
  const toggles = { ...snapshot.scope, ...adapterToggles() };
  assert.equal(verified(snapshot, { appliedFilters: toggles }).capture.captureId, 'capture-synthetic-209');
  // Toggles are allowed only in appliedFilters, never in the snapshot scope.
  const pollutedScope = { ...snapshotFixture(), scope: { ...snapshot.scope, smartQuery: true } };
  const pollutedBytes = Buffer.from(JSON.stringify(pollutedScope, null, 2) + '\n');
  const pollutedManifest = JSON.parse(archive(snapshot, { cleared: true }, { appliedFilters: toggles }).manifest.toString('utf8'));
  pollutedManifest.files[0].sha256 = hash(pollutedBytes); pollutedManifest.files[0].byteSize = pollutedBytes.length;
  rejects(() => verifyMetricCaptureArchive(pollutedBytes, Buffer.from(canonicalJson(pollutedManifest))), 'CAPTURE_SCHEMA_INVALID');
  // A toggle with the wrong type is refused.
  rejected(snapshot, { appliedFilters: { ...toggles, smartQuery: 'yes' } }, 'CAPTURE_MANIFEST_INVALID');
  // An unknown extra key in appliedFilters is refused.
  rejected(snapshot, { appliedFilters: { ...toggles, notes: 'x' } }, 'CAPTURE_MANIFEST_INVALID');
  // Useful-filter names are the closed set emitted by the adapter.
  rejected(snapshot, { appliedFilters: { ...toggles, usefulFilters: { fake: false, gifts: true, deleted: false, unknown: true } } }, 'CAPTURE_MANIFEST_INVALID');
  rejected(snapshot, { appliedFilters: { ...toggles, usefulFilters: { fake: 'yes' } } }, 'CAPTURE_MANIFEST_INVALID');
  // Drift between the scope-shaped part and the snapshot scope is still a scope mismatch.
  rejected(snapshot, { appliedFilters: { ...toggles, keywords: ['synthetic-other'] } }, 'CAPTURE_SCOPE_MISMATCH');
  rejected(snapshot, { appliedFilters: { ...toggles, period: { startDate: '2025-01-01', endDate: '2025-01-29' } } }, 'CAPTURE_SCOPE_MISMATCH');
});

// --- DRIFT GUARD -----------------------------------------------------------
// The adapter is pinned by digest on the live machine, so the app must accept
// whatever it writes. These checks run the real capture code and read the
// adapter source, so the next adapter field addition fails CI instead of
// failing a live capture.

const manifestSchema = JSON.parse(readFileSync(manifestSchemaUrl, 'utf8')) as {
  properties: Record<string, unknown>;
  $defs: Record<string, { properties?: Record<string, unknown> }>;
};
const snapshotSchema = JSON.parse(readFileSync(snapshotSchemaUrl, 'utf8')) as { $defs: Record<string, { properties?: Record<string, unknown> }> };
const propertyNames = (holder: { properties?: Record<string, unknown> } | undefined): Set<string> => new Set(Object.keys(holder?.properties ?? {}));

function objectLiteralKeys(node: ts.ObjectLiteralExpression): string[] {
  return node.properties
    .map(property => (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) ? property.name.getText() : ''))
    .filter(Boolean);
}

function assignedObject(source: ts.SourceFile, variable: string, requiredKey: string): ts.ObjectLiteralExpression {
  let object: ts.ObjectLiteralExpression | null = null;
  const visit = (node: ts.Node): void => {
    if (object || !ts.isVariableDeclaration(node) || !ts.isIdentifier(node.name) || node.name.text !== variable) { ts.forEachChild(node, visit); return; }
    if (node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
      const found = objectLiteralKeys(node.initializer);
      if (found.includes(requiredKey)) object = node.initializer;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  assert.ok(object, `${variable} object literal with ${requiredKey} found in adapter source`);
  return object;
}

function functionObjectKeys(source: ts.SourceFile, functionName: string): string[] {
  const keys = new Set<string>();
  const visit = (node: ts.Node): void => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === functionName && node.body) {
      const collect = (inner: ts.Node): void => {
        if (ts.isObjectLiteralExpression(inner)) for (const key of objectLiteralKeys(inner)) keys.add(key);
        ts.forEachChild(inner, collect);
      };
      collect(node.body);
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, visit);
  return [...keys].sort();
}

const adapterSource = (url: URL): ts.SourceFile => ts.createSourceFile('adapter.js', readFileSync(url, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const adapterCaptureResponse = (platformId: number, value: number): unknown => ({ platform_id: platformId, value });
const adapterScope = (): Record<string, unknown> => ({
  keywords: ['synthetic jar'], platforms: ['shopee', 'tiktok'],
  period: { startDate: '2026-01-01', endDate: '2026-01-29' }, category: null,
  ticks: [], advancedFilters: [], exclusions: [],
});
const adapterResponses = (): unknown[] => [
  { urlPath: '/v2/market/search_basic', body: { data: { search_basic: { aggregations: [
    { aggregation: 'REVENUE_TOTAL_CUSTOM', entity: { platforms: { shopee: adapterCaptureResponse(1, 1000), tiktok: adapterCaptureResponse(2, 2000) } } },
    { aggregation: 'ORDER_TOTAL_CUSTOM', entity: { platforms: { shopee: adapterCaptureResponse(1, 10), tiktok: adapterCaptureResponse(2, 20) } } },
    { aggregation: 'REVENUE__BY__PRICE_RANGE_CUSTOM', entities: [
      { key: '0-100', platforms: { shopee: adapterCaptureResponse(1, 300), tiktok: adapterCaptureResponse(2, 700) } },
      { from: 100, to: 200, platforms: { shopee: adapterCaptureResponse(1, 250) } },
    ] },
    { aggregation: 'REVENUE__BY__LOCATION_CUSTOM', entities: [{ key: 'Synthetic province', platforms: { shopee: adapterCaptureResponse(1, 150) } }] },
    { aggregation: 'REVENUE__BY__SHOP_TYPE_CUSTOM', entities: [{ key: '1', platforms: { shopee: adapterCaptureResponse(1, 90) } }] },
    { aggregation: 'REVENUE__BY__CATEGORIES_CUSTOM', entities: [{ key: 'Synthetic category', platforms: { tiktok: adapterCaptureResponse(2, 60) } }] },
  ] } } } },
  { urlPath: '/v2/market/analytics/products', body: { data: { products: [{ platform_id: 1, product_name: 'Synthetic product', revenue_custom: 500, order_custom: 5 }] } } },
  { urlPath: '/v2/market/analytics/shops', body: { data: { shops: [{ platform_id: 1, shop_name: 'Synthetic shop', revenue_custom_sum: 400, order_custom_sum: 4, previous_revenue_custom_sum: 300, previous_order_custom_sum: 3 }] } } },
  { urlPath: '/v2/market/analytics/groups', body: { data: { groups: [{ brand: 'Synthetic brand', platform_id: 2, revenue_custom_sum: 200, order_custom_sum: 2 }] } } },
  { urlPath: '/v2/market/analytics/shops-insight', body: { data: { shops: [{ platform_id: 1, shop_name: 'Synthetic shop', order_revenue_intervals: [{ start_date: '2026-01-01', end_date: '2026-01-07', revenue_custom_sum: 100, order_custom_sum: 1 }] }] } } },
];

test('DRIFT GUARD: the real adapter manifest is accepted by the schema and every adapter key exists in the schema', async () => {
  // The adapter is plain JS outside the app's typecheck roots, so it is loaded
  // by URL at call time rather than statically imported.
  const capture = (await import(captureUrl.href)) as { extractResultsPage: (input: unknown) => { chartSeries: { contractVersion: string; series: { series: string }[] } } };
  const extracted = capture.extractResultsPage({
    responses: adapterResponses(), scope: adapterScope(), captureId: 'capture-synthetic-209',
    specDigest: 'a'.repeat(64), capturedAt: '2026-01-29T00:00:00.000Z', pageCap: 100, platformIdMap: { 1: 'shopee', 2: 'tiktok' },
  });
  const kinds = new Set(extracted.chartSeries.series.map(row => row.series));
  for (const kind of ['priceRange', 'province', 'shopType', 'category', 'headline', 'topProducts', 'topShops', 'topBrands', 'trend']) assert.ok(kinds.has(kind), `adapter emits ${kind} rows`);

  const snapshot = snapshotFixture();
  const files = archive(snapshot, { cleared: true }, {
    metricDataVersion: extracted.chartSeries.contractVersion,
    chartSeries: extracted.chartSeries,
    appliedFilters: { ...snapshot.scope, ...adapterToggles() },
  });
  const verified = verifyMetricCaptureArchive(files.snapshot, files.manifest);
  assert.equal(verified.manifest.chartSeries?.series.length, extracted.chartSeries.series.length);

  const metricSource = adapterSource(metricUrl);
  const captureSource = adapterSource(captureUrl);
  const manifestKeys = objectLiteralKeys(assignedObject(metricSource, 'manifest', 'productPagination'));
  for (const key of manifestKeys) assert.ok(key in manifestSchema.properties, `manifest.${key} is declared in the capture schema`);
  const appliedFilters = assignedObject(metricSource, 'appliedFilters', 'keywords');
  const appliedFilterKeys = objectLiteralKeys(appliedFilters);
  const appliedFilterProperties = propertyNames(manifestSchema.$defs.appliedFilters);
  for (const key of appliedFilterKeys) assert.ok(appliedFilterProperties.has(key), `appliedFilters.${key} is declared in the capture schema`);
  const usefulFilters = appliedFilters.properties.find((property): property is ts.PropertyAssignment => ts.isPropertyAssignment(property) && property.name.getText() === 'usefulFilters');
  assert.ok(usefulFilters && ts.isObjectLiteralExpression(usefulFilters.initializer), 'adapter usefulFilters is an object literal');
  const usefulFilterSchema = (manifestSchema.$defs.appliedFilters!.properties!.usefulFilters) as { properties: Record<string, unknown> };
  for (const key of objectLiteralKeys(usefulFilters.initializer)) assert.ok(key in usefulFilterSchema.properties, `usefulFilters.${key} is declared in the capture schema`);
  const chartSeriesKeys = functionObjectKeys(captureSource, 'chartSeriesFromResponses');
  const chartSeriesProperties = new Set([...propertyNames(manifestSchema.$defs.chartSeries), ...Object.keys(manifestSchema.$defs).filter(name => /^chartSeries.*Row$/.test(name)).flatMap(name => [...propertyNames(manifestSchema.$defs[name])])]);
  for (const key of chartSeriesKeys) assert.ok(chartSeriesProperties.has(key), `chartSeries row key ${key} is declared in the capture schema`);
  // The manifest `appliedFilters` repeats every snapshot scope property.
  for (const key of propertyNames(snapshotSchema.$defs.scope)) assert.ok(appliedFilterProperties.has(key), `snapshot scope key ${key} is declared in appliedFilters`);
  // The page toggles stay out of the snapshot scope contract.
  for (const key of Object.keys(adapterToggles())) assert.ok(!propertyNames(snapshotSchema.$defs.scope).has(key), `snapshot scope must not declare the toggle ${key}`);
});
