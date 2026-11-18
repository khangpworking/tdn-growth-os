import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { basename, dirname, join } from 'node:path';
import { hashFolder, main, ModuleError, sha256 } from '../../scripts/module-pick.js';
import { saveReviewPlan } from '../../scripts/module-review-sampling.js';
import { samplingDigest } from '../../src/modules/foundation/shopee-review-sampling.js';
import { moduleOutputs, readModuleEvidence, verifyModuleCapture, verifyModuleSelection } from '../../scripts/module-metric-output.js';
import { answer, answersAfterRejection, fakeJev, noWait } from '../helpers/fake-pick-jev.js';
import { fakeLinkCollector } from '../helpers/fake-link-collector.js';
import { buildModuleRun as buildRun, distinctRows as distinct, preset, product, requestBytes, window } from '../helpers/module-run-fixture.js';
import { buildUserPageRun, jsonBytes, USER_PAGE_WINDOW } from '../helpers/user-page-run-fixture.js';

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
  assert.deepEqual(output.linkIssues, [], 'a legacy run has no link issues');
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

test('a selected source rank outside the pictured panel hides the picture but M2 still passes', async t => {
  const duplicates = Array.from({ length: 15 }, (_, i) => ({ ...product('DHC Kẽm 60 viên', 801, 10_000 - i * 10) }));
  const later = ['DHC Vitamin C 60 ngày', 'DHC Biotin 60 ngày', 'DHC Magiê 60 ngày', 'DHC Canxi 60 ngày']
    .map((name, i) => product(name, 801, 9_000 - i * 10));
  const { run } = await buildRun(t, { rows: [...duplicates, ...later], pictured: Array.from({ length: 15 }, (_, i) => i) });
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.fiveDistinct, true, 'business predicates stay truthful');
  assert.equal(output.m2.selectedCount, 5);
  assert.equal(output.m2.errorCode, null, 'the picture is not an M2 criterion (owner decision)');
  assert.deepEqual([output.m2.evidence.topProducts.available, output.m2.evidence.topProducts.errorCode],
    [false, 'EVIDENCE_RANK_NOT_COVERED'], 'the uncovered picture is not shown');
  await assert.rejects(readModuleEvidence(run, 'top-products', 'a'.repeat(64)),
    (error: any) => error?.code === 'EVIDENCE_RANK_NOT_COVERED', 'an uncovered picture is never served');
  // The real step-2 gate (shopee_flow.py) passes on the same run.
  const state = await mkdtemp(join(tmpdir(), 'shopee-flow-state-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const gate = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    ['skills/tdn-shopee-flow/scripts/shopee_flow.py', 'gate', 'm2', '--run', basename(run)],
    { env: { ...process.env, SHOPEE_FLOW_RUNS: dirname(run), SHOPEE_FLOW_STATE: state }, encoding: 'utf8', timeout: 60_000 });
  const slip = JSON.parse(gate.stdout);
  assert.deepEqual([gate.status, slip.verdict, slip.errorCode], [0, 'PASS', null], gate.stderr);
  assert.deepEqual(slip.checks.map((c: any) => [c.id, c.ok]), [['links_match_source_order', true], ['five_distinct_products', true]],
    'a request without productSelection keeps the historical gate check name');
});

test('a panel without both native sorting controls cannot certify the selected ranks', async t => {
  const { run } = await buildRun(t, { controls: false });
  const output = await moduleOutputs(run) as any;
  assert.deepEqual([output.m2.fiveDistinct, output.m2.selectedCount], [true, 5]);
  assert.equal(output.m2.evidence.topProducts.available, false);
  assert.equal(output.m2.evidence.topProducts.errorCode, 'EVIDENCE_PRODUCTS_CONTROLS_MISSING');
  assert.equal(output.m2.errorCode, null, 'the picture state is not an M2 error');
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
  const rows = Array.from({ length: 7 }, (_, i) => ({ ...product('Synthetic listing ' + (i + 1), 801, 10_000 - i * 100), shop_base_id: '1__801' }));
  const fake = fakeJev([answer(1, 'MOI', 0.9), answer(2, 'SP1', 0.9), answer(2, 'MOI', 0.6),
    answer(2, 'MOI', 0.9), answer(3, 'MOI', 0.9), answer(4, 'MOI', 0.9)]);
  const built = await buildRun(t, { rows, policy: 'metric-products-unique-v2', jev: fake.jev });
  return { ...built, saved: JSON.parse(await readFile(join(built.run, 'm2/selection.json'), 'utf8')) };
}

test('B0: a user-page run projects its selected window and picks without logic changes', async t => {
  const { run } = await buildUserPageRun(t);
  const output = await moduleOutputs(run) as any;
  assert.deepEqual(output.m1.period, USER_PAGE_WINDOW.period);
  assert.deepEqual([output.m1.captureSuccess, output.m1.dataValid, output.m1.revenueOrderDescending, output.m1.shopeeRowCount],
    [true, true, true, 5]);
  assert.deepEqual([output.m2.links, output.m2.errorCode], [[], 'SELECTION_MISSING']);
  const fake = fakeJev([answer(1, 'MOI', 0.9), answer(2, 'MOI', 0.9), answer(3, 'MOI', 0.9), answer(4, 'MOI', 0.9)]);
  const { collector } = fakeLinkCollector();
  const result = await main(run, { jev: () => fake.jev, sleep: noWait, linkCollector: () => collector });
  assert.deepEqual([result.verdict, result.exitCode, result.pickedIds.length], ['PASS', 0, 5]);
  const proof = await verifyModuleSelection(run);
  assert.deepEqual([proof.fiveDistinct, proof.selectedCount, proof.errorCode], [true, 5, null]);
});

test('B0: a user-page run whose request changed after creation fails the frozen request check', async t => {
  const { run, request } = await buildUserPageRun(t);
  request.windows[0]!.period.endDate = '2026-11-13';
  await writeFile(join(run, 'request.json'), jsonBytes(request));
  await assert.rejects(verifyModuleCapture(run), (error: unknown) =>
    error instanceof ModuleError && error.code === 'RUN_TRACKING_CHANGED');
});

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
    // The checks of a live answer, each on a decision that is otherwise consistent with the file.
    ['option outside SP1..SPn + MOI', tamper(s => { s.selectionProof.decisions[0].probabilities = { SP1: 0.1, SP2: 0, MOI: 0.9 }; })],
    ['option missing', tamper(s => { s.selectionProof.decisions[1].probabilities = { SP1: 0.9, MOI: 0.1 }; })],
    ['probabilities sum beyond 1 ± 0.02', tamper(s => { s.selectionProof.decisions[0].probabilities = { SP1: 0.1, MOI: 0.95 }; })],
    ['choice outside the options', tamper(s => { s.selectionProof.decisions[0].choice = 'SP2'; })],
  ];
  for (const [name, selection] of cases) {
    await writeFile(join(run, 'm2/selection.json'), `${JSON.stringify(selection, null, 2)}\n`);
    await assert.rejects(verifyModuleSelection(run), (error: unknown) => error instanceof ModuleError && error.code === 'PICK_PROOF_MISMATCH', name);
  }
  // A probability outside 0..1 is already refused by the selection schema, before the replay.
  await writeFile(join(run, 'm2/selection.json'),
    `${JSON.stringify(tamper(s => { s.selectionProof.decisions[0].probabilities = { SP1: -0.1, MOI: 1.1 }; }), null, 2)}\n`);
  await assert.rejects(verifyModuleSelection(run), (error: unknown) => error instanceof ModuleError && error.code === 'MODULE_INPUT_INVALID');
});

const linkUrl = (row: any) => `https://shopee.vn/product/801/${String(row.product_base_id).split('__')[1]}`;

test('v2: replay reads the saved link verdicts, so an edited or missing log is PICK_PROOF_MISMATCH', async t => {
  const rows = Array.from({ length: 6 }, (_, i) => product('Synthetic listing ' + (i + 1), 801, 10_000 - i * 100));
  const dead = linkUrl(rows[1]);
  const fake = fakeJev(answersAfterRejection());
  const { collector, asked } = fakeLinkCollector(url => url === dead ? { errorCode: 'PRODUCT_UNAVAILABLE' } : {});
  const { run } = await buildRun(t, { rows, policy: 'metric-products-unique-v2', jev: fake.jev, linkCollector: collector });
  const proof = await verifyModuleSelection(run);
  assert.deepEqual([proof.fiveDistinct, proof.selectedCount], [true, 5]);
  assert.equal(asked.length, 6, 'the live run checked each accepted candidate once');
  const logPath = join(run, 'm2/link-checks.json'), logText = await readFile(logPath, 'utf8');
  const tampered = JSON.parse(logText);
  tampered.entries[1].reason = 'RATINGS_MISSING';
  await writeFile(logPath, `${JSON.stringify(tampered, null, 2)}\n`);
  await assert.rejects(verifyModuleSelection(run), (error: unknown) => error instanceof ModuleError && error.code === 'PICK_PROOF_MISMATCH');
  await writeFile(logPath, logText);
  await rm(logPath);
  await assert.rejects(verifyModuleSelection(run), (error: unknown) => error instanceof ModuleError && error.code === 'PICK_PROOF_MISMATCH',
    'without the log, the replay accepts the dead link again and disagrees with the saved selection');
});

test('link issues name step-2 replacements and every step-3 attempt with a final outcome', async t => {
  const rows = Array.from({ length: 5 }, (_, i) => product('Synthetic listing ' + (i + 1), 801, 10_000 - i * 100));
  const dead = [linkUrl(rows[1]), linkUrl(rows[4])];
  const fake = fakeJev([answer(1, 'MOI', 0.9), answer(1, 'MOI', 0.9), answer(2, 'MOI', 0.9), answer(3, 'MOI', 0.9)]);
  const { collector } = fakeLinkCollector(url => dead.includes(url) ? { errorCode: 'PRODUCT_UNAVAILABLE' } : {});
  const { run } = await buildRun(t, { rows, policy: 'metric-products-unique-v2', jev: fake.jev, linkCollector: collector });
  const selection = JSON.parse(await readFile(join(run, 'm2/selection.json'), 'utf8'));
  const log = JSON.parse(await readFile(join(run, 'm2/link-checks.json'), 'utf8'));
  const checkedAt = (productBaseId: string) => log.entries.find((entry: any) => entry.productBaseId === productBaseId).checkedAt;
  const attemptA = '11111111-1111-4111-8111-111111111111', attemptB = '22222222-2222-4222-8222-222222222222';
  const attemptC = '33333333-3333-4333-8333-333333333333';
  const endedA = '2026-11-18T04:00:00.000Z', endedB = '2026-11-18T05:00:00.000Z', endedC = '2026-11-18T06:00:00.000Z';
  const attemptLink = (link: any) => ({ shopId: link.shopId, itemId: link.itemId, url: link.url });
  const summary = (link: any, stopReason: string, skipped: boolean) =>
    ({ shopId: link.shopId, itemId: link.itemId, requested: null, actual: skipped ? null : 10, shortfall: null, stopReason, stars: [], skipped });
  // The plan reader admits only after the M2 slip names this exact selection.
  await writeFile(join(run, 'gates/m2.json'), jsonBytes({ format: 'handoff-v1', module: 'M2', runId: basename(run),
    skillVersion: 'synthetic', verdict: 'PASS', inputSha256: await hashFolder(run, 'm1'),
    outputSha256: sha256(await readFile(join(run, 'm2/selection.json'))), checks: [], errorCode: null, next: 'M3' }));
  const { planSha256 } = await saveReviewPlan(run, { mode: 'stars', stars: [2, 3], totalPerLink: 500, allocation: 'pooled' });
  const writeAttempt = async (attemptId: string, skipped: Record<number, [string, boolean]>, endedAt: string,
      status = 'FAILED') => {
    const base = join(run, 'm3-custom/attempts', attemptId);
    await mkdir(join(base, 'output'), { recursive: true });
    const attempt = { format: 'shopee-review-attempt-v1', kind: 'custom', attemptId,
      runId: basename(run), createdAt: '2026-11-18T03:00:00.000Z', m2Digest: sha256(await readFile(join(run, 'm2/selection.json'))),
      requestSha256: sha256(await readFile(join(run, 'request.json'))), planSha256, links: selection.links.map(attemptLink) };
    await writeFile(join(base, 'attempt.json'), jsonBytes(attempt));
    await writeFile(join(base, 'output/outcome.json'), jsonBytes({ format: 'm3-custom-outcome-v1', planSha256,
      verdict: 'PARTIAL_LINKS', errorCode: null, links: selection.links.map((link: any, index: number) =>
        summary(link, skipped[index]?.[0] ?? 'exhausted', skipped[index]?.[1] ?? false)) }));
    const outputSha256 = await hashFolder(run, `m3-custom/attempts/${attemptId}/output`);
    await writeFile(join(base, 'gate.json'), jsonBytes({ format: 'handoff-v1', module: 'M3', runId: basename(run),
      skillVersion: 'synthetic', verdict: 'FAIL', inputSha256: planSha256, outputSha256, checks: [], errorCode: 'M3_GATE_FAILED', next: null }));
    await writeFile(join(base, 'state.json'), jsonBytes({ format: 'shopee-review-attempt-state-v1',
      attemptSha256: samplingDigest(attempt), status, pid: null, errorCode: 'M3_GATE_FAILED', outputSha256, endedAt }));
  };
  await writeAttempt(attemptA, { 0: ['PRODUCT_UNAVAILABLE', true] }, endedA);
  await writeAttempt(attemptB, { 2: ['RATINGS_MISSING', true] }, endedB);
  // A stopped attempt wrote its outcome, end time and UNCERTAIN state, but a later journal stays unresolved.
  await writeAttempt(attemptC, { 1: ['PRODUCT_UNAVAILABLE', true] }, endedC, 'UNCERTAIN');
  const journalDir = join(run, 'm3-custom/attempts', attemptC, 'journal');
  await mkdir(journalDir, { recursive: true });
  await writeFile(join(journalDir, `${samplingDigest(attemptLink(selection.links[selection.links.length - 1]))}.json`),
    jsonBytes({ format: 'shopee-sampling-journal-v1', terminal: false, result: null }));
  // The label is the durable attempt end, never the file mtime: A's file is touched last, its issue stays first.
  await utimes(join(run, 'm3-custom/attempts', attemptA, 'output/outcome.json'),
    new Date('2026-11-18T09:00:00.000Z'), new Date('2026-11-18T09:00:00.000Z'));
  const output = await moduleOutputs(run) as any;
  assert.deepEqual(output.linkIssues, [
    { stage: 'm2', productBaseId: rows[1]!.product_base_id, url: dead[0], reason: 'PRODUCT_UNAVAILABLE',
      at: checkedAt(rows[1]!.product_base_id as string), replacedBy: rows[2]!.product_base_id, attemptId: null },
    { stage: 'm2', productBaseId: rows[4]!.product_base_id, url: dead[1], reason: 'PRODUCT_UNAVAILABLE',
      at: checkedAt(rows[4]!.product_base_id as string), replacedBy: null, attemptId: null },
    { stage: 'm3', productBaseId: selection.links[1].productBaseId, url: selection.links[1].url,
      reason: 'PRODUCT_UNAVAILABLE', at: endedC, replacedBy: null, attemptId: attemptC },
    { stage: 'm3', productBaseId: selection.links[2].productBaseId, url: selection.links[2].url,
      reason: 'RATINGS_MISSING', at: endedB, replacedBy: null, attemptId: attemptB },
    { stage: 'm3', productBaseId: selection.links[0].productBaseId, url: selection.links[0].url,
      reason: 'PRODUCT_UNAVAILABLE', at: endedA, replacedBy: null, attemptId: attemptA },
  ], 'step-3 issues come newest attempt end first; an unresolved later journal does not hide the skipped link');
  for (const issue of output.linkIssues) assert.match(issue.at, /^\d{4}-\d{2}-\d{2}T/);
  // The projection is a display list: an edited log shows as saved, and a missing log contributes nothing.
  const logText = await readFile(join(run, 'm2/link-checks.json'), 'utf8');
  const edited = JSON.parse(logText);
  edited.entries[1].reason = 'RATINGS_MISSING';
  await writeFile(join(run, 'm2/link-checks.json'), `${JSON.stringify(edited, null, 2)}\n`);
  const shown = await moduleOutputs(run) as any;
  assert.equal(shown.linkIssues.find((issue: any) => issue.productBaseId === rows[1]!.product_base_id).reason,
    'RATINGS_MISSING', 'the display list reads the saved log as it is');
  await rm(join(run, 'm2/link-checks.json'));
  const withoutLog = await moduleOutputs(run) as any;
  assert.deepEqual(withoutLog.linkIssues.filter((issue: any) => issue.stage === 'm2'), []);
  await writeFile(join(run, 'm2/link-checks.json'), logText);
  // A malformed outcome contributes no items and never fails the projection.
  await writeFile(join(run, 'm3-custom/attempts', attemptB, 'output/outcome.json'), jsonBytes({ format: 'tampered' }));
  const tamperedOutput = await moduleOutputs(run) as any;
  assert.deepEqual(tamperedOutput.linkIssues.map((issue: any) => issue.attemptId).filter(Boolean), [attemptC, attemptA],
    'the malformed attempt is dropped and its neighbours stay');
  const outcomeB = join(run, 'm3-custom/attempts', attemptB, 'output/outcome.json');
  const outcomeWith = (reason: string) => ({ format: 'm3-custom-outcome-v1', planSha256, verdict: 'PARTIAL_LINKS',
    errorCode: null, links: selection.links.map((link: any, index: number) => summary(link, index === 2 ? reason : 'exhausted', index === 2)) });
  // An otherwise valid outcome whose stop reason is outside the closed list drops that attempt only.
  await writeFile(outcomeB, jsonBytes(outcomeWith('BAD')));
  const badReason = await moduleOutputs(run) as any;
  assert.deepEqual(badReason.linkIssues.map((issue: any) => issue.attemptId).filter(Boolean), [attemptC, attemptA],
    'a stop reason outside the closed list drops the attempt; the others stay and outputs still builds');
  // A parseable but non-RFC3339 end time is rejected the same way.
  await writeFile(outcomeB, jsonBytes(outcomeWith('RATINGS_MISSING')));
  const statePath = join(run, 'm3-custom/attempts', attemptB, 'state.json');
  const stateB = JSON.parse(await readFile(statePath, 'utf8'));
  await writeFile(statePath, jsonBytes({ ...stateB, endedAt: '2026-11-18 05:00:00' }));
  const badDate = await moduleOutputs(run) as any;
  assert.deepEqual(badDate.linkIssues.map((issue: any) => issue.attemptId).filter(Boolean), [attemptC, attemptA],
    'an end time outside RFC3339 drops the attempt; the others stay and outputs still builds');
  // A custom link whose collection ended with no saved review is skipped with its own reason and still projects.
  const last = selection.links.length - 1;
  await writeAttempt(attemptA, { 0: ['PRODUCT_UNAVAILABLE', true], [last]: ['NO_TEXT_REVIEWS', true] }, endedA);
  const withNoText = await moduleOutputs(run) as any;
  assert.deepEqual(withNoText.linkIssues.find((issue: any) =>
    issue.attemptId === attemptA && issue.productBaseId === selection.links[last].productBaseId),
  { stage: 'm3', productBaseId: selection.links[last].productBaseId, url: selection.links[last].url,
    reason: 'NO_TEXT_REVIEWS', at: endedA, replacedBy: null, attemptId: attemptA });
});

test('a stopped step-2 attempt with an unbound log still projects its rejections', async t => {
  const rows = Array.from({ length: 5 }, (_, i) => product('Synthetic listing ' + (i + 1), 801, 10_000 - i * 100));
  const dead = linkUrl(rows[1]);
  const { collector } = fakeLinkCollector(url => url === dead ? { errorCode: 'PRODUCT_UNAVAILABLE' } : {});
  const { run } = await buildRun(t, { rows, policy: 'metric-products-unique-v2', jev: fakeJev(answersAfterRejection()).jev, linkCollector: collector });
  // A step-2 stop publishes the log without a selection, so no proof binds its hash.
  await rm(join(run, 'm2/selection.json'));
  const output = await moduleOutputs(run) as any;
  assert.equal(output.m2.errorCode, 'SELECTION_MISSING');
  assert.deepEqual(output.linkIssues.map((issue: any) => [issue.stage, issue.reason, issue.replacedBy]),
    [['m2', 'PRODUCT_UNAVAILABLE', rows[2]!.product_base_id]]);
});

test('F644 all mode rejects a dead link without naming a replacement', async t => {
  const rows = Array.from({ length: 3 }, (_, i) => product('Synthetic listing ' + (i + 1), 801, 10_000 - i * 100));
  const dead = linkUrl(rows[1]);
  const { collector } = fakeLinkCollector(url => url === dead ? { errorCode: 'PRODUCT_UNAVAILABLE' } : {});
  const { run } = await buildRun(t, { rows, policy: 'metric-products-unique-v2', productSelection: { mode: 'all' }, linkCollector: collector });
  const output = await moduleOutputs(run) as any;
  assert.deepEqual(output.linkIssues.map((issue: any) => [issue.productBaseId, issue.reason, issue.replacedBy]),
    [[rows[1]!.product_base_id, 'PRODUCT_UNAVAILABLE', null]], 'all mode accepts the same dead link without replacement');
  assert.equal(output.m2.selectedCount, 2);
});

test('F644 replay reproduces top 8 and all from the saved proof, and the gate asks for the requested count', async t => {
  const items = distinct(9);
  const top = await buildRun(t, { rows: items, policy: 'metric-products-unique-v2', productSelection: { mode: 'top', count: 8 },
    jev: fakeJev(Array.from({ length: 7 }, (_, i) => answer(i + 1, 'MOI', 0.9))).jev });
  const topProof = await verifyModuleSelection(top.run) as any;
  assert.deepEqual([topProof.requested, topProof.requestedDistinct, topProof.selectedCount], [8, true, 8]);
  const state = await mkdtemp(join(tmpdir(), 'shopee-flow-state-'));
  t.after(() => rm(state, { recursive: true, force: true }));
  const gate = spawnSync(process.platform === 'win32' ? 'python' : 'python3',
    ['skills/tdn-shopee-flow/scripts/shopee_flow.py', 'gate', 'm2', '--run', basename(top.run)],
    { env: { ...process.env, SHOPEE_FLOW_RUNS: dirname(top.run), SHOPEE_FLOW_STATE: state }, encoding: 'utf8', timeout: 60_000 });
  const slip = JSON.parse(gate.stdout);
  assert.deepEqual([gate.status, slip.verdict], [0, 'PASS'], gate.stderr);
  const requested = slip.checks.find((c: any) => c.id === 'requested_distinct_products');
  assert.deepEqual([requested.ok, requested.got], [true, { requested: 8, found: 8 }]);

  const all = await buildRun(t, { rows: items, policy: 'metric-products-unique-v2', productSelection: { mode: 'all' } });
  const allProof = await verifyModuleSelection(all.run) as any;
  assert.deepEqual([allProof.requested, allProof.requestedDistinct, allProof.selectedCount], [1, true, 9],
    'all links every Shopee row, repeated titles included');
  const output = await moduleOutputs(all.run) as any;
  assert.deepEqual([output.m2.requested, output.m2.requestedDistinct, output.m2.fiveDistinct], [1, true, true]);
});

test('F644 an explicit top count below five and above five report their own shortage counts', async t => {
  const items = distinct(5);
  const short = await buildRun(t, { rows: items, policy: 'metric-products-unique-v2', productSelection: { mode: 'top', count: 8 },
    jev: fakeJev(Array.from({ length: 4 }, (_, i) => answer(i + 1, 'MOI', 0.9))).jev });
  const proof = await verifyModuleSelection(short.run) as any;
  assert.deepEqual([proof.requested, proof.requestedDistinct, proof.selectedCount, proof.shortageReason, proof.shortageDetail],
    [8, false, 5, 'FEWER_PRODUCTS_THAN_REQUESTED', { requested: 8, found: 5 }]);
  const one = await buildRun(t, { rows: items, policy: 'metric-products-unique-v2', productSelection: { mode: 'top', count: 1 },
    jev: fakeJev([]).jev });
  const oneProof = await verifyModuleSelection(one.run) as any;
  assert.deepEqual([oneProof.requested, oneProof.requestedDistinct, oneProof.selectedCount], [1, true, 1]);
});

test('F644 a saved productSelection that disagrees with the request is PICK_PROOF_MISMATCH', async t => {
  const { run } = await buildRun(t, { rows: distinct(7), policy: 'metric-products-unique-v2', productSelection: { mode: 'top', count: 8 },
    jev: fakeJev(Array.from({ length: 6 }, (_, i) => answer(i + 1, 'MOI', 0.9))).jev });
  const selection = JSON.parse(await readFile(join(run, 'm2/selection.json'), 'utf8'));
  selection.selectionProof.productSelection = { mode: 'all' };
  await writeFile(join(run, 'm2/selection.json'), jsonBytes(selection));
  await assert.rejects(verifyModuleSelection(run), (error: any) => error?.code === 'PICK_PROOF_MISMATCH');
});
