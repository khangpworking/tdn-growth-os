import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { auditMaskedRows, derivePickCandidate, main, ModuleError, pickRaw, readRequest, sha256 } from '../../scripts/module-pick.js';
import { CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { ReviewSamplingError } from '../../src/modules/foundation/shopee-review-sampling.js';

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
async function writeSelectedCapture(dir: string) {
  const rawBytes = `${JSON.stringify(selectedResponses, null, 2)}\n`;
  const part = buildV3WindowManifest(selectedSpec, structuredClone(selectedWindow), {
    taxonomy: structuredClone(selectedPreset.category),
    appliedState: structuredClone(selectedPreset),
    keywordInput: '', selectedCategoryIds: selectedPreset.category.children.map((child: any) => child.id),
    period: structuredClone(selectedWindow.period), categoryMode: 'Advanced', multi: true,
    comparisonDefault: true, displayedKPIs: 'synthetic selected-window capture',
  }, selectedResponses, '2026-11-10T00:00:00.000Z');
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
