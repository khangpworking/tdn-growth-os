import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { auditMaskedRows, derivePickCandidate, hashFolder, main, ModuleError, pickRaw, readPickSource, readRequest, sha256 } from '../../scripts/module-pick.js';
import { createM2LinkCheck, LINK_CHECK_BUDGET_MS, LinkCheckStop } from '../../scripts/module-link-check.js';
import { ShopeeReviewSamplingCollector } from '../../src/platform/collectors/shopee-review-sampling.js';
import { CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { ReviewSamplingError } from '../../src/modules/foundation/shopee-review-sampling.js';
import { pickJevFromEnvironment } from '../../scripts/module-product-pick-jev.js';
import { answer, answersAfterRejection, fakeJev, noWait } from '../helpers/fake-pick-jev.js';
import { fakeLinkCollector } from '../helpers/fake-link-collector.js';
import { buildUserPageRun, jsonBytes } from '../helpers/user-page-run-fixture.js';

const { buildV3WindowManifest } = await import(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);

// Synthetic rows only: invented names, brands, shops and ids.
let nextItem = 5000;
const row = (name: string, shop: number, revenue: number | string | null, extra: Record<string, unknown> = {}) =>
  ({ product_base_id: `1__${nextItem++}__${shop}`, product_name: name, shop_base_id: String(shop), revenue_custom: revenue, order_custom: 1, ...extra });
const raw = (rows: unknown[]) => ({ code: 0, data: { page: 1, list: rows.slice(0, 2) }, more: [{ nested: { items: rows.slice(2) } }] });
const request = (extra: Record<string, unknown> = {}) => ({
  format: 'request-v1', preset: { keywords: ['son'] },
  windows: [
    { id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-10' }, intervalDays: 7 },
    { id: '12m', period: { startDate: '2025-11-11', endDate: '2026-11-10' }, intervalDays: 30 },
  ],
  reviewCapPerLink: 300, principalTitles: [], ...extra,
});
const configuredRequest = (policy: Record<string, unknown> = {}) => ({
  format: 'request-v2', preset: { keywords: ['son'] },
  windows: [
    { id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-10' }, intervalDays: 7 },
    { id: '12m', period: { startDate: '2025-11-11', endDate: '2026-11-10' }, intervalDays: 30 },
  ],
  principalTitles: [],
  collectionPolicy: {
    format: 'shopee-review-policy-v1', mode: 'stars', stars: [2, 3], totalPerLink: 500,
    allocation: 'pooled', textRule: 'comment-or-attributes-v1',
    order: 'native-filter-ascending-stars-v1', ...policy,
  },
});
const runDir = () => mkdtemp(join(tmpdir(), 'shopee-pick-'));
const writeJson = (dir: string, name: string, value: unknown) => writeFile(join(dir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });

// Synthetic selected-window capture reused from the live-map contract fixture.
const metricFixture = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));
const selectedWindow = { id: 'selected', period: { startDate: '2026-09-16', endDate: '2026-10-02' }, intervalDays: 7 };
const selectedPreset = { ...structuredClone(metricFixture.spec.preset), smartExclusion: false };
const selectedSpec = { contractVersion: 'metric-v3-capture-spec-v3', preset: selectedPreset, windows: [structuredClone(selectedWindow)] };
const selectedResponses = metricFixture.windows[0].responses.map((response: any) => ({
  ...structuredClone(response),
  requestBody: { ...structuredClone(response.requestBody), start_date: '20260916', end_date: '20261002' },
}));

function selectedRequest(): Record<string, unknown> {
  return {
    format: 'request-v2', preset: { keywords: selectedPreset.keywords }, windows: [structuredClone(selectedWindow)],
    captureSpec: structuredClone(selectedSpec),
    metricInput: { format: 'shopee-metric-input-v1', preset: structuredClone(selectedPreset), window: structuredClone(selectedWindow) },
    principalTitles: [], collectionPolicy: configuredRequest().collectionPolicy,
  };
}

/** Writes the outer manifest, the selected window manifest and its raw source, all hashed as the flow writes them. */
async function writeSelectedCapture(dir: string, observation: {
  appliedState?: any;
  selectedCategoryIds?: string[];
  responses?: unknown[];
} = {}) {
  const responses = observation.responses ?? selectedResponses;
  const rawBytes = `${JSON.stringify(responses, null, 2)}\n`;
  const part = buildV3WindowManifest(selectedSpec, structuredClone(selectedWindow), {
    taxonomy: structuredClone(selectedPreset.category),
    appliedState: observation.appliedState ?? structuredClone(selectedPreset),
    keywordInput: '', selectedCategoryIds: observation.selectedCategoryIds ?? selectedPreset.category.children.map((child: any) => child.id),
    period: structuredClone(selectedWindow.period), categoryMode: 'Advanced', multi: true,
    comparisonDefault: true, displayedKPIs: 'synthetic selected-window capture',
  }, responses, '2026-11-10T00:00:00.000Z');
  const partBytes = `${JSON.stringify(part, null, 2)}\n`;
  const specDigest = sha256(`${JSON.stringify(selectedSpec, null, 2)}\n`);
  const outer = {
    contractVersion: 'metric-v3-capture-v1', specDigest,
    windows: [{ window: 'selected', path: 'selected/manifest.json', sha256: sha256(partBytes) }],
  };
  await mkdir(join(dir, 'm1/selected'), { recursive: true });
  await writeJson(dir, 'm1/manifest.json', outer);
  await writeJson(dir, 'm1/selected/manifest.json', part);
  await writeFile(join(dir, 'm1/selected/raw-responses.json'), rawBytes);
  return { outer, part, partBytes, specDigest };
}

/** Republishes a mutated window manifest with hashes recomputed exactly as the flow would. */
async function publishWindow(dir: string, state: { outer: any; part: any }) {
  const partBytes = `${JSON.stringify(state.part, null, 2)}\n`;
  state.outer.windows[0].sha256 = sha256(partBytes);
  await writeFile(join(dir, 'm1/selected/manifest.json'), partBytes);
  await writeJson(dir, 'm1/manifest.json', state.outer);
}

/** Rewrites the raw source and the window manifest hash chain, leaving every digest internally consistent. */
async function rewriteRaw(dir: string, state: { outer: any; part: any }, raw: unknown) {
  const rawBytes = `${JSON.stringify(raw, null, 2)}\n`;
  state.part.files[0].sha256 = sha256(rawBytes);
  state.part.files[0].byteSize = Buffer.byteLength(rawBytes);
  await writeFile(join(dir, 'm1/selected/raw-responses.json'), rawBytes);
  await publishWindow(dir, state);
}

/** The saved preset with every set-valued member in a different but equivalent order. */
function reorderedAppliedState() {
  const appliedState = structuredClone(selectedPreset);
  appliedState.platforms.reverse();
  appliedState.shopTypes.reverse();
  appliedState.category.children.reverse();
  return { appliedState, selectedCategoryIds: appliedState.category.children.map((child: any) => child.id) };
}

test('derivePickCandidate ranks the real pick result by revenue descending', () => {
  const rows = [
    row('Son kem lì Hoa Giấy đỏ gạch', 31, 500, { brand: 'Hoa Giấy' }),
    row('Son thỏi mềm Mây Hồng', 32, 300, { brand: 'Mây Hồng' }),
    row('Son dưỡng Đồi Thông', 33, 100, { brand: 'Đồi Thông' }),
  ];
  const picked = derivePickCandidate(raw(rows), ['son'], []);
  assert.equal(picked.pickRuleVersion, 'autorun-pick-v3');
  assert.deepEqual(picked.links.map(link => link.revenue), [500, 300, 100]);
  assert.deepEqual(picked.links.map(link => link.rank), [1, 2, 3]);
  assert.equal(picked.links[0]!.productBaseId, rows[0]!.product_base_id);
  for (const link of picked.links) {
    assert.equal(link.url, `https://shopee.vn/product/${link.shopId}/${link.itemId}`);
    assert.match(link.reason, new RegExp(`^Hạng chọn ${link.rank}, doanh thu kỳ [\\d.]+ đồng, thương hiệu .+\\.$`));
  }
  assert.match(picked.links[0]!.reason, /500 đồng/);
});

test('auditMaskedRows finds no row above the lowest picked revenue', () => {
  const rows = [
    row('Son kem lì Hoa Giấy', 41, 500, { brand: 'Hoa Giấy' }),
    row('Son thỏi Mây Hồng', 42, 100, { brand: 'Mây Hồng' }),
  ];
  const picked = derivePickCandidate(raw(rows), ['son'], []);
  const withMasked = raw([...rows,
    { product_base_id: '1__[REDACTED]__901', product_name: 'son che', revenue_custom: 80 },
    { product_base_id: '1__[REDACTED]__902', product_name: 'son che', revenue_custom: null },
  ]);
  const audit = auditMaskedRows(withMasked, picked.links);
  assert.equal(audit.maskedRows, 2);
  assert.equal(audit.maskedAboveLowestPick, 0);
});

test('auditMaskedRows counts a masked row above the lowest pick and is strict at equal revenue', () => {
  const picked = derivePickCandidate(raw([
    row('Son kem lì Hoa Giấy', 43, 500, { brand: 'Hoa Giấy' }),
    row('Son thỏi Mây Hồng', 44, 100, { brand: 'Mây Hồng' }),
  ]), ['son'], []).links;
  const above = auditMaskedRows(raw([
    { product_base_id: '1__[REDACTED]__903', revenue_custom: 200 },
    { product_base_id: '1__[REDACTED]__904', revenue: 100 },
  ]), picked);
  assert.equal(above.maskedRows, 2);
  assert.equal(above.maskedAboveLowestPick, 1);
  const equalOnly = auditMaskedRows(raw([{ product_base_id: '1__[REDACTED]__905', revenue_custom: 100 }]), picked);
  assert.equal(equalOnly.maskedAboveLowestPick, 0);
  assert.equal(equalOnly.maskedRows, 1);
});

test('readRequest accepts a request without captureSpec', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', request());
    const parsed = await readRequest(dir);
    assert.deepEqual(parsed.keywords, ['son']);
    assert.equal(parsed.reviewCapPerLink, 300);
    assert.equal(parsed.captureSpec, undefined);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('readRequest reads the canonical request-v2 policy as the execution cap', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', configuredRequest());
    const parsed = await readRequest(dir);
    assert.deepEqual(parsed.keywords, ['son']);
    assert.equal(parsed.reviewCapPerLink, 500);
    assert.deepEqual(parsed.collectionPolicy, configuredRequest().collectionPolicy);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('readRequest fails closed on a non-canonical request-v2 policy', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', configuredRequest({ stars: [3, 2] }));
    await assert.rejects(readRequest(dir), (error: unknown) =>
      error instanceof ReviewSamplingError && error.code === 'REVIEW_POLICY_INVALID');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('pickRaw reads only the selected v3 window after verifying every capture digest', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', selectedRequest());
    await mkdir(join(dir, 'm1/run1'), { recursive: true });
    await writeJson(dir, 'm1/run1/raw-responses.json', { decoy: 'legacy 30-day capture' });
    await writeSelectedCapture(dir);
    assert.deepEqual(await pickRaw(dir), selectedResponses, 'M2 reads the run window, never the legacy 30-day folder');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('pickRaw accepts a producer capture whose applied sets are equivalent but reordered', async () => {
  const dir = await runDir();
  try {
    const { appliedState, selectedCategoryIds } = reorderedAppliedState();
    await writeJson(dir, 'request.json', selectedRequest());
    const state = await writeSelectedCapture(dir, { appliedState, selectedCategoryIds });
    const rawBytes = await readFile(join(dir, 'm1/selected/raw-responses.json'));
    assert.equal(state.outer.windows[0]!.sha256, sha256(await readFile(join(dir, 'm1/selected/manifest.json'))));
    assert.equal(state.part.specDigest, state.specDigest);
    assert.equal(state.part.files[0]!.sha256, sha256(rawBytes));
    assert.equal(state.part.files[0]!.byteSize, rawBytes.length);
    assert.deepEqual(state.part.appliedState.platforms, [...selectedPreset.platforms].reverse());
    assert.deepEqual(state.part.appliedState.shopTypes, [...selectedPreset.shopTypes].reverse());
    assert.deepEqual(state.part.selectedCategoryIds, [...selectedPreset.category.children.map((child: any) => child.id)].reverse());
    assert.deepEqual(await pickRaw(dir), selectedResponses);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('main picks from a reordered producer capture behind a passing M1 gate', async () => {
  const dir = await runDir();
  try {
    const responses = structuredClone(selectedResponses) as any[];
    responses.find(response => response.urlPath === '/v2/market/analytics/products/')!
      .body.data.products.push({ product_base_id: '1__9101__911', product_name: 'Synthetic term one pickable',
        shop_base_id: '911', revenue_custom: 900, order_custom: 2, brand: 'Synthetic Brand' });
    const { appliedState, selectedCategoryIds } = reorderedAppliedState();
    await writeJson(dir, 'request.json', selectedRequest());
    await writeSelectedCapture(dir, { appliedState, selectedCategoryIds, responses });
    await mkdir(join(dir, 'gates'), { recursive: true });
    await writeJson(dir, 'gates/m1.json', {
      format: 'handoff-v1', module: 'M1', runId: basename(dir), skillVersion: '1.0.0', verdict: 'PASS',
      inputSha256: null, outputSha256: await hashFolder(dir, 'm1'), checks: [], errorCode: null, next: null,
    });
    const result = await main(dir);
    assert.equal(result.verdict, 'PASS');
    assert.deepEqual(result.pickedIds, ['1__9101__911']);
    const saved = JSON.parse(await readFile(join(dir, 'm2/selection.json'), 'utf8'));
    assert.deepEqual(saved.links.map((link: any) => link.productBaseId), ['1__9101__911']);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

/** Synthetic source rows for the accepted metric-products-unique-v1 policy. */
const uniqueRows = (titles: readonly [string, string][]) => titles.map(([title, item], i) => ({
  product_base_id: `1__${item}__801`, product_name: title, shop_base_id: '801', platform_id: 1,
  revenue_custom: 1000 - i * 10, brand: 'DHC', final_brand: 'DHC',
}));
function uniqueCapture(rows: unknown[]) {
  const responses = structuredClone(selectedResponses) as any[];
  responses.find(response => response.urlPath === '/v2/market/analytics/products/')!.body.data.products = rows;
  return responses;
}
const uniqueRequest = () => ({ ...selectedRequest(), selectionPolicy: 'metric-products-unique-v1' });
async function writePassingM1Gate(dir: string) {
  await mkdir(join(dir, 'gates'), { recursive: true });
  await writeJson(dir, 'gates/m1.json', {
    format: 'handoff-v1', module: 'M1', runId: basename(dir), skillVersion: '1.0.0', verdict: 'PASS',
    inputSha256: null, outputSha256: await hashFolder(dir, 'm1'), checks: [], errorCode: null, next: null,
  });
}

test('main applies the named policy in source order and skips a later pack-count duplicate', async () => {
  const dir = await runDir();
  try {
    const rows = uniqueRows([
      ['DHC Kẽm 60 viên', '8101'], ['DHC Kẽm 120 viên', '8102'], ['DHC Vitamin C 60 ngày', '8103'],
      ['DHC Biotin 60 ngày', '8104'], ['DHC Magiê 60 ngày', '8105'], ['DHC Canxi 60 ngày', '8106'],
    ]);
    await writeJson(dir, 'request.json', uniqueRequest());
    await writeSelectedCapture(dir, { responses: uniqueCapture(rows) });
    await writePassingM1Gate(dir);
    const result = await main(dir);
    assert.equal(result.verdict, 'PASS');
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.pickedIds, ['1__8101__801', '1__8103__801', '1__8104__801', '1__8105__801', '1__8106__801']);
    const saved = JSON.parse(await readFile(join(dir, 'm2/selection.json'), 'utf8'));
    assert.equal(saved.pickRuleVersion, 'metric-products-unique-v1');
    assert.deepEqual(saved.links.map((link: any) => link.sourceRank), [1, 3, 4, 5, 6]);
    assert.deepEqual(saved.selectionProof.skipped, [
      { sourceRank: 2, productBaseId: '1__8102__801', reason: 'SAME_TITLE_COMPONENT_GROUP', duplicateOfRank: 1 }]);
    assert.equal(saved.selectionProof.shortageReason, null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('main reports a relevant unresolved title before the fifth pick instead of claiming five distinct', async () => {
  const dir = await runDir();
  try {
    const rows = uniqueRows([
      ['DHC Kẽm 60 ngày', '8201'], ['DHC Vitamin C 60 ngày', '8202'], ['DHC Kẽm / DHC Vitamin C', '8203'],
      ['DHC Biotin 60 ngày', '8204'], ['DHC Magiê 60 ngày', '8205'], ['DHC Canxi 60 ngày', '8206'],
    ]);
    await writeJson(dir, 'request.json', uniqueRequest());
    await writeSelectedCapture(dir, { responses: uniqueCapture(rows) });
    await writePassingM1Gate(dir);
    const result = await main(dir);
    assert.equal(result.verdict, 'FAIL');
    assert.equal(result.exitCode, 20);
    assert.equal(result.errorCode, 'PICK_TITLE_GROUP_UNRESOLVED');
    const saved = JSON.parse(await readFile(join(dir, 'm2/selection.json'), 'utf8'));
    assert.equal(saved.links.length, 5, 'five resolved rows are still shown truthfully');
    assert.equal(saved.selectionProof.unresolvedCount, 1);
    assert.equal(saved.selectionProof.shortageReason, 'PICK_TITLE_GROUP_UNRESOLVED');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('main reports a captured-product shortage without padding the list', async () => {
  const dir = await runDir();
  try {
    const rows = uniqueRows([['DHC Kẽm', '8301'], ['DHC Vitamin C', '8302'], ['DHC Biotin', '8303']]);
    await writeJson(dir, 'request.json', uniqueRequest());
    await writeSelectedCapture(dir, { responses: uniqueCapture(rows) });
    await writePassingM1Gate(dir);
    const result = await main(dir);
    assert.equal(result.verdict, 'FAIL');
    assert.equal(result.exitCode, 20);
    assert.equal(result.errorCode, 'FEWER_THAN_FIVE_DISTINCT_PRODUCTS');
    const saved = JSON.parse(await readFile(join(dir, 'm2/selection.json'), 'utf8'));
    assert.equal(saved.links.length, 3);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

const v2Request = () => ({ ...selectedRequest(), selectionPolicy: 'metric-products-unique-v2' });
/** Six synthetic Shopee candidates the v2 walk can pick in source order. */
const v2Rows = (items: readonly string[]) => uniqueRows(items.map((item, i) => [`Synthetic candidate ${i + 1}`, item]))
  .map(row => ({ ...row, shop_base_id: '1__801' }));
const rowUrl = (row: Record<string, unknown>) => {
  const [, itemId] = String(row.product_base_id).split('__');
  return `https://shopee.vn/product/801/${itemId}`;
};
async function writeV2Run(dir: string, rows: unknown[]) {
  await writeJson(dir, 'request.json', v2Request());
  await writeSelectedCapture(dir, { responses: uniqueCapture(rows) });
  await writePassingM1Gate(dir);
}
const v2Answers = (count: number) => Array.from({ length: count }, (_, i) => answer(i + 1, 'MOI', 0.9));

test('a v2 walk replaces a link whose count job reports a dead product and logs every check', async () => {
  for (const errorCode of ['PRODUCT_UNAVAILABLE', 'RATINGS_MISSING'] as const) {
    const dir = await runDir();
    try {
      const rows = v2Rows(['8501', '8502', '8503', '8504', '8505', '8506']);
      await writeV2Run(dir, rows);
      const fake = fakeJev(answersAfterRejection());
      const dead = rowUrl(rows[1]!);
      const { collector, asked } = fakeLinkCollector(url => url === dead ? { errorCode } : {});
      const result = await main(dir, { jev: () => fake.jev, sleep: noWait, linkCollector: () => collector });
      assert.equal(result.verdict, 'PASS', errorCode);
      assert.deepEqual(result.pickedIds,
        ['1__8501__801', '1__8503__801', '1__8504__801', '1__8505__801', '1__8506__801'], errorCode);
      assert.deepEqual(asked, rows.map(rowUrl), 'each accepted candidate is checked once, in walk order');
      assert.deepEqual(Object.keys(fake.asked[1]![0]!.criteria), ['SP1', 'MOI'], 'the dead link never becomes a pick or a Jev option');
      const log = JSON.parse(await readFile(join(dir, 'm2/link-checks.json'), 'utf8'));
      assert.deepEqual([log.format, log.runId], ['link-check-log-v1', basename(dir)]);
      assert.deepEqual(log.entries.map((entry: any) => [entry.productBaseId, entry.stage, entry.result, entry.reason]), [
        ['1__8501__801', 'm2', 'ok', null], ['1__8502__801', 'm2', 'rejected', errorCode],
        ['1__8503__801', 'm2', 'ok', null], ['1__8504__801', 'm2', 'ok', null],
        ['1__8505__801', 'm2', 'ok', null], ['1__8506__801', 'm2', 'ok', null],
      ]);
      assert.equal(log.entries[1].starCounts, null);
      assert.deepEqual(log.entries[0].starCounts, { 1: 3, 2: 3, 3: 3, 4: 3, 5: 3 });
      for (const entry of log.entries) assert.ok(!Number.isNaN(Date.parse(entry.checkedAt)));
      const saved = JSON.parse(await readFile(join(dir, 'm2/selection.json'), 'utf8'));
      assert.equal(saved.selectionProof.linkChecksSha256, sha256(await readFile(join(dir, 'm2/link-checks.json'))));
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('a v2 walk rejects a link whose requested stars all have zero reviews, and keeps one with any target star', async () => {
  const runWithStars = async (stars: Record<string, number>, script: ReturnType<typeof answersAfterRejection>) => {
    const dir = await runDir();
    try {
      const rows = v2Rows(['8511', '8512', '8513', '8514', '8515', '8516']);
      await writeV2Run(dir, rows);
      const fake = fakeJev(script);
      const target = rowUrl(rows[1]!);
      const { collector } = fakeLinkCollector(url => url === target ? { stars } : {});
      const result = await main(dir, { jev: () => fake.jev, sleep: noWait, linkCollector: () => collector });
      const log = JSON.parse(await readFile(join(dir, 'm2/link-checks.json'), 'utf8'));
      return { result, entry: log.entries[1] };
    } finally { await rm(dir, { recursive: true, force: true }); }
  };
  const zero = await runWithStars({ '2': 0, '3': 0 }, answersAfterRejection());
  assert.deepEqual(zero.result.pickedIds, ['1__8511__801', '1__8513__801', '1__8514__801', '1__8515__801', '1__8516__801']);
  assert.deepEqual([zero.entry.result, zero.entry.reason, zero.entry.starCounts],
    ['rejected', 'NO_TARGET_STAR_REVIEWS', { 1: 3, 2: 0, 3: 0, 4: 3, 5: 3 }]);
  const positive = await runWithStars({ '2': 0, '3': 1 }, v2Answers(4));
  assert.deepEqual([positive.result.pickedIds[1], positive.entry.result, positive.entry.reason],
    ['1__8512__801', 'ok', null], 'one requested star with reviews is enough');
});

test('a count job that cannot answer stops step 2 with the session code or LINK_CHECK_FAILED', async () => {
  const cases = [['HUMAN_LOGIN_REQUIRED', 'HUMAN_LOGIN_REQUIRED'], ['HUMAN_VERIFICATION_REQUIRED', 'HUMAN_VERIFICATION_REQUIRED'],
    ['SOURCE_ACTION_FAILED', 'LINK_CHECK_FAILED']] as const;
  for (const [errorCode, expected] of cases) {
    const dir = await runDir();
    try {
      const rows = v2Rows(['8601', '8602']);
      await writeV2Run(dir, rows);
      const { collector } = fakeLinkCollector(url => url === rowUrl(rows[0]!) ? { errorCode } : {});
      await assert.rejects(main(dir, { jev: () => fakeJev([]).jev, sleep: noWait, linkCollector: () => collector }),
        (error: unknown) => error instanceof ModuleError && error.code === expected, errorCode);
      await assert.rejects(readFile(join(dir, 'm2/selection.json')), { code: 'ENOENT' }, errorCode);
      await assert.rejects(readFile(join(dir, 'm2/link-checks.json')), { code: 'ENOENT' }, errorCode);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('a step-2 stop after a completed check keeps that check in the log and publishes no selection', async () => {
  const dir = await runDir();
  try {
    const rows = v2Rows(['8651', '8652', '8653']);
    await writeV2Run(dir, rows);
    const blocked = rowUrl(rows[1]!);
    const { collector, asked } = fakeLinkCollector(url => url === blocked ? { errorCode: 'HUMAN_LOGIN_REQUIRED' } : {});
    await assert.rejects(main(dir, { jev: () => fakeJev([answer(1, 'MOI', 0.9)]).jev, sleep: noWait, linkCollector: () => collector }),
      (error: unknown) => error instanceof ModuleError && error.code === 'HUMAN_LOGIN_REQUIRED');
    assert.deepEqual(asked, [rowUrl(rows[0]!), blocked], 'the stop happens while checking the second candidate');
    const log = JSON.parse(await readFile(join(dir, 'm2/link-checks.json'), 'utf8'));
    assert.deepEqual(log.entries.map((entry: any) => [entry.productBaseId, entry.result, entry.reason]), [['1__8651__801', 'ok', null]],
      'the check that completed before the stop stays in the log');
    await assert.rejects(readFile(join(dir, 'm2/selection.json')), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a lost count-job submission keeps its journal under m2 and is reconciled before a new one', async () => {
  const dir = await runDir();
  try {
    const rows = v2Rows(['8661', '8662']);
    await writeV2Run(dir, rows);
    const now = '2026-11-18T03:00:00.000Z';
    const routes: string[] = [];
    let lost = true;
    const fakeFetch: typeof fetch = async (input, init) => {
      const method = init?.method ?? 'GET', url = new URL(String(input));
      routes.push(`${method} ${url.pathname}${url.search}`);
      if (method === 'GET' && url.pathname === '/session')
        return Response.json({ state: 'ready', authenticated: true, checked_at: now });
      if (method === 'GET' && url.pathname === '/jobs') return Response.json([]);
      if (method === 'POST' && url.pathname === '/count-jobs') {
        if (lost) { lost = false; throw new TypeError('synthetic network loss'); }
      }
      throw new Error(`unexpected ${method} ${url.pathname}`);
    };
    const collector = new ShopeeReviewSamplingCollector({ token: 'synthetic-token', fetch: fakeFetch,
      now: () => new Date(now), sleep: noWait, submitLockFile: join(dir, 'submit.lock') });
    const collect = () => main(dir, { jev: () => fakeJev([]).jev, sleep: noWait, linkCollector: () => collector });
    const failed = (error: unknown) => error instanceof ModuleError && error.code === 'LINK_CHECK_FAILED';
    await assert.rejects(collect(), failed);
    const journals = await readdir(join(dir, 'm2/link-check-journal'));
    assert.equal(journals.filter(name => name.endsWith('.json')).length, 1, 'the unresolved journal stays with the run');
    await assert.rejects(readFile(join(dir, 'm2/link-checks.json')), { code: 'ENOENT' });
    assert.equal(routes.filter(route => route === 'POST /count-jobs').length, 1, 'the lost submission is never repeated');
    await assert.rejects(collect(), failed);
    assert.equal(routes.filter(route => route === 'POST /count-jobs').length, 1, 'the retry reconciles, it never resubmits');
    assert.equal(routes.filter(route => route === 'GET /jobs?limit=100').length, 2,
      'one free-service poll before the lost submission, one on the reconcile');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the step-2 link-check budget stops with LINK_CHECK_FAILED before another check', async () => {
  const dir = await runDir();
  try {
    assert.equal(LINK_CHECK_BUDGET_MS, 600_000, 'owner decision: 10 minutes for all count checks of one run');
    let clock = Date.parse('2026-11-18T03:00:00.000Z');
    const { collector, asked } = fakeLinkCollector();
    const { check, entries } = createM2LinkCheck({ collector, policy: null, journalDir: join(dir, 'm2/link-check-journal'),
      now: () => new Date(clock) });
    const link = (itemId: string) => ({ productBaseId: `1__${itemId}__801`, shopId: '801', itemId, url: `https://shopee.vn/product/801/${itemId}` });
    assert.equal((await check(link('9001'))).result, 'ok');
    clock += LINK_CHECK_BUDGET_MS;
    await assert.rejects(check(link('9002')), (error: unknown) => error instanceof LinkCheckStop && error.code === 'LINK_CHECK_FAILED');
    assert.deepEqual(asked, [link('9001').url], 'no count job starts after the budget');
    assert.equal(entries.length, 1, 'the refused check records no verdict');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a rejected link with no later candidate leaves the existing four-pick shortage', async () => {
  const dir = await runDir();
  try {
    const rows = v2Rows(['8701', '8702', '8703', '8704', '8705']);
    await writeV2Run(dir, rows);
    const dead = rowUrl(rows[1]!);
    const { collector } = fakeLinkCollector(url => url === dead ? { errorCode: 'PRODUCT_UNAVAILABLE' } : {});
    const result = await main(dir, { jev: () => fakeJev(answersAfterRejection()).jev, sleep: noWait, linkCollector: () => collector });
    assert.deepEqual([result.verdict, result.errorCode], ['FAIL', 'FEWER_THAN_FIVE_DISTINCT_PRODUCTS']);
    assert.deepEqual(result.pickedIds, ['1__8701__801', '1__8703__801', '1__8704__801', '1__8705__801']);
    const saved = JSON.parse(await readFile(join(dir, 'm2/selection.json'), 'utf8'));
    assert.equal(saved.links.length, 4);
    assert.equal(saved.selectionProof.shortageReason, 'FEWER_THAN_FIVE_DISTINCT_PRODUCTS');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('a new v2 request is read with its rule, like v1', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', v2Request());
    assert.equal((await readRequest(dir)).selectionPolicy, 'metric-products-unique-v2');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('main stops a v2 run with PICK_JEV_UNAVAILABLE and writes no selection when Jev cannot answer', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', v2Request());
    await writeSelectedCapture(dir, { responses: uniqueCapture(uniqueRows([['Synthetic one', '8401'], ['Synthetic two', '8402']]).map(row => ({ ...row, shop_base_id: '1__801' }))) });
    await writePassingM1Gate(dir);
    const unavailable = (error: unknown) => error instanceof ModuleError && error.code === 'PICK_JEV_UNAVAILABLE';
    const failing = fakeJev(['http-error', 'malformed', 'throws']);
    const { collector } = fakeLinkCollector();
    await assert.rejects(main(dir, { jev: () => failing.jev, sleep: noWait, linkCollector: () => collector }), unavailable);
    assert.equal(failing.asked.length, 3);
    for (const environment of [{}, { TDN_RESEARCH_JEV_ENABLED: 'true' }])
      await assert.rejects(main(dir, { jev: () => pickJevFromEnvironment(environment), linkCollector: () => collector }), unavailable, 'disabled or no key');
    await assert.rejects(readFile(join(dir, 'm2/selection.json')), { code: 'ENOENT' });
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('pickRaw refuses captures whose applied sets are missing, foreign, duplicated, mislabeled or tampered', async () => {
  const cases: [string, (state: any, dir: string) => Promise<void>, string][] = [
    ['missing platform', async (state, dir) => {
      state.part.appliedState.platforms = state.part.appliedState.platforms.slice(1);
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['duplicate platform', async (state, dir) => {
      state.part.appliedState.platforms = [state.part.appliedState.platforms[0], ...state.part.appliedState.platforms.slice(0, 3)];
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['missing shop type', async (state, dir) => {
      state.part.appliedState.shopTypes = state.part.appliedState.shopTypes.slice(0, 1);
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['mislabeled category child', async (state, dir) => {
      state.part.appliedState.category.children[0] = { id: 'c407923064', label: 'Synthetic foreign label' };
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['missing category child', async (state, dir) => {
      state.part.appliedState.category.children.pop();
      state.part.selectedCategoryIds.pop();
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['foreign selected category id', async (state, dir) => {
      state.part.selectedCategoryIds = [...state.part.selectedCategoryIds.slice(0, 3), 'c999999999'];
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['duplicate selected category id', async (state, dir) => {
      state.part.selectedCategoryIds = [state.part.selectedCategoryIds[0], ...state.part.selectedCategoryIds.slice(0, 3)];
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['source map', async (state, dir) => {
      state.part.sourceMap.products = 'raw-responses.json#/0/body/data';
      await publishWindow(dir, state);
    }, 'CAPTURE_SPEC_MISMATCH'],
    ['stale raw hash', async (_state, dir) => {
      await writeFile(join(dir, 'm1/selected/raw-responses.json'), `${JSON.stringify([{ decoy: true }], null, 2)}\n`);
    }, 'CAPTURE_HASH_MISMATCH'],
    ['request scope change with consistent hashes', async (state, dir) => {
      const raw = JSON.parse(await readFile(join(dir, 'm1/selected/raw-responses.json'), 'utf8'));
      raw.find((response: any) => response.urlPath === '/v2/market/analytics/products/')
        .requestBody.include_query.platforms = [1, 2];
      await rewriteRaw(dir, state, raw);
    }, 'CAPTURE_SPEC_MISMATCH'],
  ];
  for (const [name, mutate, code] of cases) {
    const dir = await runDir();
    try {
      await writeJson(dir, 'request.json', selectedRequest());
      const state = await writeSelectedCapture(dir);
      await mutate(state, dir);
      await assert.rejects(pickRaw(dir), (error: unknown) => error instanceof ModuleError && error.code === code, name);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('readRequest keeps the frozen request keyword order', async () => {
  const dir = await runDir();
  try {
    const value = selectedRequest();
    (value.preset as any).keywords = [...(value.preset as any).keywords].reverse();
    await writeJson(dir, 'request.json', value);
    await assert.rejects(readRequest(dir), (error: unknown) =>
      error instanceof ModuleError && error.code === 'CAPTURE_SPEC_MISMATCH');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('pickRaw rejects a mismatched selected window instead of falling back to the legacy capture', async () => {
  const cases: [string, (state: { outer: any; part: any }, dir: string) => Promise<void>, string][] = [
    ['outer digest', async ({ outer }) => { outer.specDigest = '0'.repeat(64); }, 'CAPTURE_SPEC_MISMATCH'],
    ['legacy window reference', async ({ outer }) => { outer.windows[0].window = '30d'; }, 'PICK_WINDOW_MISSING'],
    ['window period', async ({ outer, part }, dir) => {
      part.window.period.endDate = '2026-10-03';
      const bytes = `${JSON.stringify(part, null, 2)}\n`;
      outer.windows[0].sha256 = sha256(bytes);
      await writeFile(join(dir, 'm1/selected/manifest.json'), bytes);
    }, 'CAPTURE_SPEC_MISMATCH'],
  ];
  for (const [name, mutate, code] of cases) {
    const dir = await runDir();
    try {
      await writeJson(dir, 'request.json', selectedRequest());
      const state = await writeSelectedCapture(dir);
      await mutate(state, dir);
      await writeJson(dir, 'm1/manifest.json', state.outer);
      await assert.rejects(pickRaw(dir), (error: unknown) =>
        error instanceof ModuleError && error.code === code, name);
    } finally { await rm(dir, { recursive: true, force: true }); }
  }
});

test('readRequest rejects request windows that disagree with the saved v3 spec', async () => {
  const dir = await runDir();
  try {
    const value = selectedRequest();
    (value.windows as any[])[0].period.endDate = '2026-10-03';
    await writeJson(dir, 'request.json', value);
    await assert.rejects(readRequest(dir), (error: unknown) =>
      error instanceof ModuleError && error.code === 'CAPTURE_SPEC_MISMATCH');
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('pickRaw keeps the legacy run1 source when the request has no captureSpec', async () => {
  const dir = await runDir();
  try {
    const legacy = { code: 0, data: { page: 1, list: [row('Son kem lì Hoa Giấy', 61, 500)] } };
    await writeJson(dir, 'request.json', request());
    await mkdir(join(dir, 'm1/run1'), { recursive: true });
    await writeJson(dir, 'm1/run1/raw-responses.json', legacy);
    assert.deepEqual(await pickRaw(dir), legacy);
  } finally { await rm(dir, { recursive: true, force: true }); }
});


test('main refuses a run whose M1 slip is missing', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', request());
    await assert.rejects(main(dir), (error: unknown) =>
      error instanceof ModuleError && error.code === 'GATE_NOT_PASSED' && error.exitCode === 22);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('main refuses a run whose M1 slip failed', async () => {
  const dir = await runDir();
  try {
    await writeJson(dir, 'request.json', request());
    await mkdir(join(dir, 'gates'), { recursive: true });
    await writeJson(dir, 'gates/m1.json', {
      format: 'handoff-v1', module: 'M1', runId: basename(dir), skillVersion: '1.0.0', verdict: 'FAIL',
      inputSha256: null, outputSha256: null, checks: [], errorCode: 'CAPTURE_FAILED', next: null,
    });
    await assert.rejects(main(dir), (error: unknown) =>
      error instanceof ModuleError && error.code === 'GATE_NOT_PASSED' && error.exitCode === 22);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('the pick profile stays the capture profile that names autorun-pick-v3', () => {
  assert.equal(CAPTURE_ROW_PROFILE, 'automation-metric-capture-v3');
});

test('readPickSource returns the saved products response for a user-page run', async t => {
  const { run, raw } = await buildUserPageRun(t);
  const source = await readPickSource(run);
  assert.equal(source.prefix, 'm1');
  assert.equal((source.part as any).contractVersion, 'metric-user-page-window-v1');
  assert.deepEqual((source.part as any).sourceMap, { products: 'raw-responses.json#/0/body/data' });
  assert.deepEqual(source.raw, raw);
  assert.deepEqual(await pickRaw(run), raw);
});

test('readPickSource refuses a user-page run after one changed file', async t => {
  const cases: [string, (state: Awaited<ReturnType<typeof buildUserPageRun>>) => Promise<void>, string][] = [
    ['raw', async ({ run, raw }) => {
      await writeFile(join(run, 'm1/selected/raw-responses.json'), jsonBytes([{ ...raw[0], status: 201 }]));
    }, 'CAPTURE_HASH_MISMATCH'],
    ['window manifest', async ({ run, part }) => {
      await writeFile(join(run, 'm1/selected/manifest.json'), jsonBytes({ ...part, capturedAt: '2026-11-18T00:00:00.000Z' }));
    }, 'CAPTURE_HASH_MISMATCH'],
    ['request scope', async ({ run, request }) => {
      (request.metricSource.scope as any).platforms = [1];
      await writeFile(join(run, 'request.json'), jsonBytes(request));
    }, 'CAPTURE_INPUT_INVALID'],
    ['request window', async ({ run, request }) => {
      request.windows[0]!.period.endDate = '2026-11-13';
      await writeFile(join(run, 'request.json'), jsonBytes(request));
    }, 'CAPTURE_WINDOW_MISMATCH'],
  ];
  for (const [name, mutate, code] of cases) {
    const state = await buildUserPageRun(t);
    await mutate(state);
    await assert.rejects(readPickSource(state.run), (error: unknown) =>
      error instanceof ModuleError && error.code === code, name);
  }
});
