import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { hashFolder, main, ModuleError, sha256 } from '../../scripts/module-pick.js';
import { moduleOutputs, readModuleEvidence, verifyModuleSelection } from '../../scripts/module-metric-output.js';
import { answer, fakeJev } from '../helpers/fake-pick-jev.js';
import { buildModuleRun as buildRun, distinctRows as distinct, preset, product, requestBytes, window } from '../helpers/module-run-fixture.js';

test('module outputs project a real retained capture and selection without recomputing identity', async t => {
  const { run, rawBytes } = await buildRun(t);
  const output = await moduleOutputs(run) as any;
  assert.equal(output.format, 'module-outputs-v1');
  assert.equal(output.runId, basename(run));
  assert.deepEqual([output.m1.captureSuccess, output.m1.dataValid, output.m1.errorCode], [true, true, null]);
  assert.deepEqual(output.m1.keywords, preset.keywords);
  assert.deepEqual(output.m1.period, window.period);
  assert.equal(output.m1.shopeeRowCount, 5);
  assert.deepEqual(Object.keys(output.m1.evidence), ['fullPage', 'raw']);
  for (const kind of ['fullPage', 'raw']) {
    const descriptor = output.m1.evidence[kind];
    assert.equal(descriptor.available, true);
    assert.equal(descriptor.errorCode, null);
    assert.match(descriptor.sha256, /^[a-f0-9]{64}$/);
    assert.equal(descriptor.byteSize, (await readFile(join(run, 'm1/selected/evidence', descriptor.fileName))).length);
  }
  assert.deepEqual(output.m1.evidence.raw.sha256, sha256(rawBytes));
  assert.equal(output.m2.policy, 'metric-products-unique-v1');
  assert.deepEqual([output.m2.legacyVerdict, output.m2.linksMatchSourceOrder, output.m2.fiveDistinct,
    output.m2.selectedCount, output.m2.shortageReason, output.m2.errorCode], [null, true, true, 5, null, null]);
  assert.deepEqual(output.m2.links.map((link: any) => [link.rank, link.sourceRank]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  assert.deepEqual(Object.keys(output.m2.evidence), ['topProducts']);
  assert.equal(output.m2.evidence.topProducts.available, true);
  assert.deepEqual(output.m2.skipped, []);
});

test('module outputs keep legacy predicate fields null and label the saved gate verdict', async t => {
  const legacyRows = Array.from({ length: 5 }, (_, i) => ({
    product_base_id: `1__${9200 + i}__${811 + i}`, product_name: `Synthetic term one pickable ${i + 1}`,
    shop_base_id: String(811 + i), platform_id: 1, order_custom: 1, revenue_custom: 900 - i * 10,
    brand: 'Synthetic Brand', final_brand: 'Synthetic Brand',
  }));
  const { run } = await buildRun(t, { rows: legacyRows, policy: false, legacyGate: true, evidence: false });
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.policy, 'legacy');
  assert.equal(output.m2.legacyVerdict, 'PASS');
  assert.deepEqual([output.m2.linksMatchSourceOrder, output.m2.fiveDistinct, output.m2.shortageReason], [null, null, null]);
  assert.deepEqual([output.m1.evidence.fullPage.available, output.m1.evidence.raw.available], [false, false]);
  assert.deepEqual([output.m1.evidence.fullPage.errorCode, output.m1.evidence.raw.errorCode],
    ['LEGACY_EVIDENCE_UNBOUND', 'LEGACY_EVIDENCE_UNBOUND']);
  assert.equal(output.m2.evidence.topProducts.errorCode, 'LEGACY_EVIDENCE_UNBOUND');
  const link = output.m2.links[0];
  assert.deepEqual([link.sourceRank, link.productName, link.groupKey, link.groupingBasis], [null, null, null, null]);
  assert.equal(link.brand, 'Synthetic Brand', 'existing legacy link fields are retained, not reinterpreted');
});

test('module outputs report an uncaptured run as unknown instead of failed or complete', async t => {
  const run = await mkdtemp(join(tmpdir(), 'shopee-module-output-'));
  t.after(() => rm(run, { recursive: true, force: true }));
  await writeFile(join(run, 'request.json'), requestBytes(true));
  const output = await moduleOutputs(run) as any;
  assert.deepEqual([output.m1.captureSuccess, output.m1.dataValid, output.m1.shopeeRowCount], [null, null, null]);
  assert.equal(output.m1.errorCode, 'CAPTURE_FILES_MISSING');
  assert.deepEqual([output.m1.evidence.fullPage.errorCode, output.m1.evidence.raw.errorCode],
    ['CAPTURE_FILES_MISSING', 'CAPTURE_FILES_MISSING']);
  assert.deepEqual([output.m2.links, output.m2.skipped], [[], []]);
  assert.equal(output.m2.errorCode, 'SELECTION_MISSING');
});

test('a shortage is reported with its reason while the captured rows stay visible', async t => {
  const groups = distinct(4).map((row, i) => ({ ...row, revenue_custom: [10_000, 9_900, 9_700, 9_600][i] }));
  const rows = [groups[0]!, groups[1]!, product('DHC Kẽm / DHC Vitamin C', 801, 9_800), groups[2]!, groups[3]!];
  const { run } = await buildRun(t, { rows });
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.fiveDistinct, false);
  assert.equal(output.m2.shortageReason, 'PICK_TITLE_GROUP_UNRESOLVED');
  assert.equal(output.m2.errorCode, 'PICK_TITLE_GROUP_UNRESOLVED');
  assert.equal(output.m2.selectedCount, 4);
  assert.equal(output.m2.evidence.topProducts.available, true, 'a business shortage does not hide available evidence');
});

test('a selected source rank outside the pictured panel is an explicit technical M2 error', async t => {
  const duplicates = Array.from({ length: 15 }, (_, i) => ({ ...product('DHC Kẽm 60 viên', 801, 10_000 - i * 10) }));
  const later = ['DHC Vitamin C 60 ngày', 'DHC Biotin 60 ngày', 'DHC Magiê 60 ngày', 'DHC Canxi 60 ngày']
    .map((name, i) => product(name, 801, 9_000 - i * 10));
  const { run } = await buildRun(t, { rows: [...duplicates, ...later], pictured: Array.from({ length: 15 }, (_, i) => i) });
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.fiveDistinct, true, 'business predicates stay truthful');
  assert.equal(output.m2.selectedCount, 5);
  assert.equal(output.m2.errorCode, 'EVIDENCE_RANK_NOT_COVERED', 'the uncovered rank is a specific technical failure');
  assert.equal(output.m2.evidence.topProducts.available, false);
});

test('a panel without both native sorting controls cannot certify the selected ranks', async t => {
  const { run } = await buildRun(t, { controls: false });
  const output = await moduleOutputs(run) as any;
  assert.deepEqual([output.m2.fiveDistinct, output.m2.selectedCount], [true, 5]);
  assert.equal(output.m2.evidence.topProducts.available, false);
  assert.equal(output.m2.evidence.topProducts.errorCode, 'EVIDENCE_PRODUCTS_CONTROLS_MISSING');
  assert.equal(output.m2.errorCode, 'EVIDENCE_PRODUCTS_CONTROLS_MISSING');
});

test('raw candidates beyond the pictured panel stay captured and source-ordered', async t => {
  const rows = [...distinct(5), ...Array.from({ length: 15 }, () => product('DHC Kẽm 60 viên', 801, 8_000))];
  const { run } = await buildRun(t, { rows, pictured: Array.from({ length: 15 }, (_, i) => i) });
  const output = await moduleOutputs(run) as any;
  const saved = JSON.parse(await readFile(join(run, 'm2/selection.json'), 'utf8'));
  assert.equal(saved.selectionProof.candidateCount, 20, 'all captured candidates are retained');
  assert.equal(output.m2.selectedCount, 5);
  assert.equal(output.m2.linksMatchSourceOrder, true);
  assert.deepEqual([output.m2.fiveDistinct, output.m2.errorCode], [true, null],
    'chosen ranks inside the pictured panel are covered; unused raw rows do not block M2');
});

test('retained evidence opens only with the exact saved digest', async t => {
  const { run, rawBytes } = await buildRun(t);
  const output = await moduleOutputs(run) as any;
  const raw = await readModuleEvidence(run, 'raw', output.m1.evidence.raw.sha256);
  assert.deepEqual(Buffer.from(raw), Buffer.from(rawBytes));
  const panel = await readModuleEvidence(run, 'top-products', output.m2.evidence.topProducts.sha256);
  assert.equal(Buffer.from(panel).length, output.m2.evidence.topProducts.byteSize);
  await assert.rejects(readModuleEvidence(run, 'top-products', 'b'.repeat(64)),
    (error: any) => error?.code === 'EVIDENCE_HASH_MISMATCH');
});

type Row = Record<string, unknown>;
const fullRow = (i: number, revenue: number): Row => ({
  product_base_id: `1__${9300 + i}__${821 + i}`, product_name: `Synthetic term one pickable ${i + 1}`,
  shop_base_id: String(821 + i), platform_id: 1, revenue_custom: revenue, brand: 'Synthetic Brand', final_brand: 'Synthetic Brand',
  shop_name: `Synthetic Shop ${i + 1}`, official_type: i % 2, final_categories: [{ name: 'Group A', level: 0 }, { name: 'Group B', level: 1 }],
  price: 100_000 + i, price_min: 90_000, price_max: 120_000, previous_revenue_custom: 500, order_custom: 10 + i,
  previous_order_custom: 4, revenue: 7_000, order_count: 70, rating_avg: 4.5, rating_count: 12, platform_created_at: '2026-01-20 10:00:00',
});
const jsonText = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

/** The stored legacy layout: request-v1, one raw file under m1/run1, no capture manifest or source map. */
async function legacyRun(t: any, rows: Row[], saved: (rows: Row[]) => unknown[] = r => r) {
  const run = await mkdtemp(join(tmpdir(), 'shopee-module-output-'));
  t.after(() => rm(run, { recursive: true, force: true }));
  await writeFile(join(run, 'request.json'), jsonText({ format: 'request-v1', preset: { keywords: ['synthetic term one'] }, principalTitles: [],
    windows: [{ id: '30d', period: { startDate: '2026-10-01', endDate: '2026-10-30' }, intervalDays: 7 }], reviewCapPerLink: 300 }));
  await mkdir(join(run, 'm1/run1'), { recursive: true });
  const responses = [{ urlPath: '/v2/market/analytics/search-basic/', status: 200, body: { status: 'success', data: {} } },
    { urlPath: '/v2/market/analytics/products/', status: 200, requestBody: { sort_by: 'revenue_custom__desc', page: 0 },
      body: { status: 'success', data: { products: rows } } }];
  await writeFile(join(run, 'm1/run1/raw-responses.json'), jsonText(responses));
  await mkdir(join(run, 'gates'), { recursive: true });
  await writeFile(join(run, 'gates/m1.json'), jsonText({ format: 'handoff-v1', module: 'M1', runId: basename(run), skillVersion: '1.0.0',
    verdict: 'PASS', inputSha256: null, outputSha256: await hashFolder(run, 'm1'), checks: [], errorCode: null, next: null }));
  await main(run);
  const products = saved(rows);
  if (products !== rows) {
    responses[1]!.body.data = { products } as never;
    await writeFile(join(run, 'm1/run1/raw-responses.json'), jsonText(responses));
  }
  return run;
}

test('B1: step 1 reports the saved products order as true, false or unknown with the existing order check', async t => {
  const { run } = await buildRun(t);
  assert.equal(((await moduleOutputs(run)) as any).m1.revenueOrderDescending, true);
  const rising = await legacyRun(t, [fullRow(0, 100), fullRow(1, 300), fullRow(2, 200)]);
  assert.equal(((await moduleOutputs(rising)) as any).m1.revenueOrderDescending, false, 'a higher revenue after a lower one');
  const unreadable = await legacyRun(t, [fullRow(0, 300), { ...fullRow(1, 0), revenue_custom: '' }, fullRow(2, 100)]);
  assert.equal(((await moduleOutputs(unreadable)) as any).m1.revenueOrderDescending, null, 'an empty revenue cannot be ordered');
  const uncaptured = await mkdtemp(join(tmpdir(), 'shopee-module-output-'));
  t.after(() => rm(uncaptured, { recursive: true, force: true }));
  await writeFile(join(uncaptured, 'request.json'), requestBytes(true));
  assert.equal(((await moduleOutputs(uncaptured)) as any).m1.revenueOrderDescending, null);
});

test('B2: each picked link carries its saved Metric products row and 1-based rank', async t => {
  const rows = distinct(5, i => ({ shop_name: `Shop ${i}`, official_type: 1, final_categories: [{ name: 'Root', level: 0 }],
    price: 1_000 + i, price_min: 900, price_max: '1200', previous_revenue_custom: 77, order_custom: 5, previous_order_custom: 3,
    revenue: 9_999, order_count: 99, rating_avg: 4.8, rating_count: 6, platform_created_at: '2026-02-01 08:00:00' }));
  const { run } = await buildRun(t, { rows });
  const output = await moduleOutputs(run) as any;
  assert.deepEqual(output.m2.links.map((l: any) => [l.sourceRank, l.metricProduct.rank]), [[1, 1], [2, 2], [3, 3], [4, 4], [5, 5]]);
  assert.deepEqual(output.m2.links[2].metricProduct, { rank: 3, productName: rows[2]!.product_name, shopName: 'Shop 2', officialType: 1,
    brand: 'DHC', categories: ['Root'], price: 1_002, priceMin: 900, priceMax: 1200, periodRevenue: rows[2]!.revenue_custom,
    previousRevenue: 77, periodSold: 5, previousSold: 3, totalRevenue: 9_999, totalSold: 99, ratingAvg: 4.8, ratingCount: 6,
    listedAt: '2026-02-01 08:00:00' });
  assert.deepEqual([output.m2.linksMatchSourceOrder, output.m2.fiveDistinct, output.m2.errorCode], [true, true, null], 'selection result unchanged');
});

test('B2: legacy links are looked up at read time without changing the legacy verdict or fields', async t => {
  const rows = [fullRow(0, 900), { product_base_id: '8__1__2', product_name: 'Other platform', revenue_custom: 800 }, fullRow(1, 700), fullRow(2, 600)];
  const run = await legacyRun(t, rows);
  await writeFile(join(run, 'gates/m2.json'), jsonText({ format: 'handoff-v1', module: 'M2', runId: basename(run), skillVersion: '1.0.0',
    verdict: 'PASS', inputSha256: await hashFolder(run, 'm1'), outputSha256: sha256(await readFile(join(run, 'm2/selection.json'))),
    checks: [], errorCode: null, next: null }));
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.policy, 'legacy');
  assert.equal(output.m2.legacyVerdict, 'PASS');
  assert.deepEqual([output.m2.linksMatchSourceOrder, output.m2.fiveDistinct, output.m2.shortageReason], [null, null, null]);
  const second = output.m2.links.find((l: any) => l.productBaseId === rows[2]!.product_base_id);
  assert.deepEqual([second.sourceRank, second.productName, second.shopName], [null, null, null], 'existing legacy fields keep their meaning');
  assert.equal(second.metricProduct.rank, 3, 'rank counts every row of the saved response, other platforms included');
  assert.deepEqual([second.metricProduct.productName, second.metricProduct.shopName, second.metricProduct.officialType,
    second.metricProduct.categories, second.metricProduct.priceMax], [rows[2]!.product_name, 'Synthetic Shop 2', 1, ['Group A', 'Group B'], 120_000]);
});

test('B2: a link whose row is missing from the saved response has no product fields', async t => {
  const rows = [fullRow(0, 900), fullRow(1, 700)];
  const run = await legacyRun(t, rows, saved => saved.filter(row => row.product_base_id !== rows[1]!.product_base_id));
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.links.find((l: any) => l.productBaseId === rows[1]!.product_base_id).metricProduct, null);
  assert.equal(output.m2.links.find((l: any) => l.productBaseId === rows[0]!.product_base_id).metricProduct.rank, 1);
});

test('B2: the rank is the row position in the saved response, malformed entries included', async t => {
  const rows = [fullRow(0, 900), fullRow(1, 700)];
  const run = await legacyRun(t, rows, saved => [null, ...saved]);
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.links.find((l: any) => l.productBaseId === rows[0]!.product_base_id).metricProduct.rank, 2);
});

test('B2: a saved number too large to be finite reads as null and the response stays valid', async t => {
  const rows = [fullRow(0, 900), fullRow(1, 700)];
  const run = await legacyRun(t, rows, saved => [{ ...saved[0], price: '9'.repeat(400) }, saved[1]]);
  const product = (await moduleOutputs(run) as any).m2.links.find((l: any) => l.productBaseId === rows[0]!.product_base_id).metricProduct;
  assert.deepEqual([product.price, product.priceMax], [null, 120_000]);
});

/** A v2 run: rank 3 is a duplicate of pick 1, rank 4 is unsure, five products are picked. */
async function v2Run(t: any) {
  const rows = Array.from({ length: 7 }, (_, i) => product('Synthetic listing ' + (i + 1), 801, 10_000 - i * 100));
  const fake = fakeJev([answer(1, 'MOI', 0.9), answer(2, 'SP1', 0.9), answer(2, 'MOI', 0.6),
    answer(2, 'MOI', 0.9), answer(3, 'MOI', 0.9), answer(4, 'MOI', 0.9)]);
  const built = await buildRun(t, { rows, policy: 'metric-products-unique-v2', jev: fake.jev });
  return { ...built, saved: JSON.parse(await readFile(join(built.run, 'm2/selection.json'), 'utf8')) };
}

test('v2: the gate replays the saved answers to the saved selection without asking Jev', async t => {
  const { run, saved } = await v2Run(t);
  assert.deepEqual(saved.links.map((l: any) => l.sourceRank), [1, 2, 5, 6, 7]);
  const realFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('no network in the replay'); }) as typeof fetch;
  try {
    const proof = await verifyModuleSelection(run);
    assert.deepEqual([proof.fiveDistinct, proof.shortageReason, proof.errorCode], [true, null, null]);
    const output = await moduleOutputs(run) as any;
    assert.equal(output.m2.policy, 'metric-products-unique-v2');
    assert.deepEqual(output.m2.skipped.map((s: any) => [s.sourceRank, s.reason, s.duplicateOfRank]),
      [[3, 'SAME_PRODUCT', 1], [4, 'PRODUCT_MATCH_UNSURE', null]]);
  } finally { globalThis.fetch = realFetch; }
  assert.equal(calls, 0);
});

test('v2: an edited, removed, reordered or added decision, a changed link or threshold is PICK_PROOF_MISMATCH', async t => {
  const { run, saved } = await v2Run(t);
  const tamper = (change: (s: any) => void) => { const copy = structuredClone(saved); change(copy); return copy; };
  const cases: [string, any][] = [
    ['edited outcome', tamper(s => { s.selectionProof.decisions[1].outcome = 'PICKED'; })],
    ['edited answer', tamper(s => { s.selectionProof.decisions[2].probabilities = { SP1: 0.05, SP2: 0.05, MOI: 0.9 }; })],
    ['removed decision', tamper(s => { s.selectionProof.decisions.splice(2, 1); })],
    ['reordered decisions', tamper(s => { s.selectionProof.decisions.reverse(); })],
    ['added decision', tamper(s => { s.selectionProof.decisions.push(structuredClone(s.selectionProof.decisions[0])); })],
    ['changed link', tamper(s => { s.links[4].productBaseId = s.links[3].productBaseId; })],
    ['changed threshold', tamper(s => { s.selectionProof.matcher.threshold = 0.6; })],
    ['changed question version', tamper(s => { s.selectionProof.matcher.questionVersion = 'b'.repeat(64); })],
  ];
  for (const [name, selection] of cases) {
    await writeFile(join(run, 'm2/selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
    await assert.rejects(verifyModuleSelection(run), (error: unknown) => error instanceof ModuleError && error.code === 'PICK_PROOF_MISMATCH', name);
  }
});
