import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import test from 'node:test';
import { auditMaskedRows, derivePickCandidate, main, ModuleError, readRequest } from '../../scripts/module-pick.js';
import { CAPTURE_ROW_PROFILE } from '../../src/modules/analysis/research-automation/capture-row-quality.js';

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
const runDir = () => mkdtemp(join(tmpdir(), 'shopee-pick-'));
const writeJson = (dir: string, name: string, value: unknown) => writeFile(join(dir, name), `${JSON.stringify(value, null, 2)}\n`, { encoding: 'utf8' });

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
