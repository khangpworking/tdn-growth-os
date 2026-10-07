import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import {
  checkSnapshotScope,
  METRIC_WEB_TABLE_COLUMNS,
  MetricWebSnapshotError,
  validateMetricWebSnapshot,
  type MetricScopeSpec,
  type MetricXlsxScopeManifest,
} from '../../src/modules/analysis/research-automation/metric-web-snapshot.js';

// #127 Phase 2b: a web snapshot is accepted only in the contract shape, with
// W1-W3 present, known columns only, and the same search as the xlsx capture.

const fixture = (name: string): Record<string, any> =>
  JSON.parse(readFileSync(new URL(`../fixtures/metric-web-snapshot/${name}.json`, import.meta.url), 'utf8')) as Record<string, any>;

function rejection(value: unknown): MetricWebSnapshotError {
  try {
    validateMetricWebSnapshot(value);
  } catch (error) {
    if (error instanceof MetricWebSnapshotError) return error;
    throw error;
  }
  assert.fail('expected the snapshot to be rejected');
}

test('valid synthetic fixtures pass unchanged', () => {
  for (const name of ['full', 'display-only', 'absent-optional']) {
    const raw = fixture(name);
    const before = JSON.stringify(raw);
    assert.equal(validateMetricWebSnapshot(raw), raw, name);
    assert.equal(JSON.stringify(raw), before, `${name} not mutated`);
  }
});

test('invalid fixtures are rejected with a clear code and message', () => {
  const absentW2 = rejection(fixture('absent-w2'));
  assert.equal(absentW2.code, 'METRIC_UI_CHANGED');
  assert.deepEqual(absentW2.issues, ['W2_kpi is marked absent']);

  const extra = rejection(fixture('extra-field'));
  assert.equal(extra.code, 'METRIC_WEB_SNAPSHOT_INVALID');
  assert.deepEqual(extra.issues, ['/groups/W3_platformSplit/0 must NOT have additional properties']);

  const unknown = rejection(fixture('unknown-column'));
  assert.equal(unknown.code, 'METRIC_WEB_SNAPSHOT_INVALID');
  assert.deepEqual(unknown.issues, ['W13_topShops: unknown column "growthScore"']);
  assert.match(unknown.message, /growthScore/);
});

test('W1 and W3 may not be Absent either; W4-W16 may', () => {
  const scopeAbsent = fixture('full');
  scopeAbsent.scope = { absent: true, reason: 'NOT_ON_PAGE' };
  assert.deepEqual(rejection(scopeAbsent).issues, ['scope (W1) is marked absent']);
  const splitAbsent = fixture('full');
  splitAbsent.groups.W3_platformSplit = { absent: true, reason: 'NOT_CAPTURED' };
  splitAbsent.groups.W2_kpi = { absent: true, reason: 'NOT_CAPTURED' };
  const both = rejection(splitAbsent);
  assert.equal(both.code, 'METRIC_UI_CHANGED');
  assert.deepEqual(both.issues, ['W2_kpi is marked absent', 'W3_platformSplit is marked absent']);
  const monthlyAbsent = fixture('full');
  monthlyAbsent.groups.W4_monthly = { absent: true, reason: 'RECON_PENDING' };
  assert.doesNotThrow(() => validateMetricWebSnapshot(monthlyAbsent));
});

test('missing groups, bad absent reasons and unknown top-level fields are schema errors', () => {
  const missing = fixture('full');
  delete missing.groups.W14_topBrands;
  assert.equal(rejection(missing).code, 'METRIC_WEB_SNAPSHOT_INVALID');
  const reason = fixture('full');
  reason.groups.W5_category = { absent: true, reason: 'EMPTY' };
  assert.equal(rejection(reason).code, 'METRIC_WEB_SNAPSHOT_INVALID');
  const topLevel = fixture('full');
  topLevel.marketTotal = 1;
  assert.ok(rejection(topLevel).issues.includes('/ must NOT have additional properties'));
  const digest = fixture('full');
  digest.specDigest = 'not-a-digest';
  assert.equal(rejection(digest).code, 'METRIC_WEB_SNAPSHOT_INVALID');
});

test('every table group rejects an unknown column and an undeclared cell', () => {
  for (const group of Object.keys(METRIC_WEB_TABLE_COLUMNS)) {
    const column = fixture('full');
    column.groups[group].columns.push('derivedTotal');
    assert.deepEqual(rejection(column).issues, [`${group}: unknown column "derivedTotal"`], group);
    const cell = fixture('full');
    const declared = cell.groups[group].columns as string[];
    const spare = METRIC_WEB_TABLE_COLUMNS[group as keyof typeof METRIC_WEB_TABLE_COLUMNS].find(key => !declared.includes(key));
    if (spare === undefined) continue;
    cell.groups[group].rows[0].cells[spare] = { label: 'x', text: 'y', sourcePointer: 'z' };
    assert.deepEqual(rejection(cell).issues, [`${group}: row 0 has undeclared cell "${spare}"`], group);
  }
});

test('W4 rejects a duplicate month and a month outside the period', () => {
  const duplicate = fixture('full');
  duplicate.groups.W4_monthly.push(structuredClone(duplicate.groups.W4_monthly[0]));
  assert.deepEqual(rejection(duplicate).issues, ['W4_monthly: duplicate point shopee 2025-09']);
  const outside = fixture('full');
  outside.groups.W4_monthly[0].month = '2025-08';
  assert.deepEqual(rejection(outside).issues, ['W4_monthly: shopee 2025-08 is outside scope.period']);
});

const snapshot = (): AutomationMetricWebSnapshotV1 => validateMetricWebSnapshot(fixture('full'));
const spec = (): MetricScopeSpec => ({
  specDigest: 'c'.repeat(64),
  keywords: ['bình giữ nhiệt', 'Bình nước'],
  platforms: ['shopee', 'tiktok'],
  period: { startDate: '2025-09-15', endDate: '2026-09-20' },
  category: 'Nhà cửa & Đời sống',
});
const manifest = (): MetricXlsxScopeManifest => ({ ...spec(), captureId: 'cap-synthetic-001' });

test('scope gate: identical scope is ok, and keyword case, spacing and order do not matter', () => {
  assert.deepEqual(checkSnapshotScope(snapshot(), spec(), manifest()), { ok: true });
  const loose = { ...spec(), keywords: ['  BÌNH NƯỚC ', 'bình giữ nhiệt', 'Bình Giữ Nhiệt'], platforms: ['tiktok', 'shopee'] };
  assert.deepEqual(checkSnapshotScope(snapshot(), loose, { ...manifest(), keywords: loose.keywords, platforms: loose.platforms }), { ok: true });
});

test('scope gate: each field changed alone is named exactly, on either reference', () => {
  const cases: [string, (s: MetricScopeSpec) => MetricScopeSpec][] = [
    ['specDigest', s => ({ ...s, specDigest: 'd'.repeat(64) })],
    ['keywords', s => ({ ...s, keywords: ['bình giữ nhiệt'] })],
    ['platforms', s => ({ ...s, platforms: ['shopee'] })],
    ['period', s => ({ ...s, period: { ...s.period, endDate: '2026-09-21' } })],
    ['period', s => ({ ...s, period: { ...s.period, startDate: '2025-09-14' } })],
    ['category', s => ({ ...s, category: null })],
  ];
  for (const [field, change] of cases) {
    const expected = { ok: false, code: 'METRIC_SNAPSHOT_SCOPE_MISMATCH', fields: [field] };
    assert.deepEqual(checkSnapshotScope(snapshot(), change(spec()), manifest()), expected, `spec ${field}`);
    assert.deepEqual(checkSnapshotScope(snapshot(), spec(), { ...change(manifest()), captureId: 'cap-synthetic-001' }), expected, `xlsx ${field}`);
  }
  assert.deepEqual(checkSnapshotScope(snapshot(), spec(), { ...manifest(), captureId: 'cap-other' }),
    { ok: false, code: 'METRIC_SNAPSHOT_SCOPE_MISMATCH', fields: ['captureId'] });
  const nullCategory = snapshot();
  nullCategory.scope.category = null;
  assert.deepEqual(checkSnapshotScope(nullCategory, { ...spec(), category: null }, { ...manifest(), category: null }), { ok: true });
});

test('scope gate: several differences are all listed, sorted, without throwing', () => {
  assert.deepEqual(checkSnapshotScope(snapshot(), { ...spec(), platforms: ['tiktok'], category: 'Khác' }, manifest()),
    { ok: false, code: 'METRIC_SNAPSHOT_SCOPE_MISMATCH', fields: ['category', 'platforms'] });
  const everything = { specDigest: 'e'.repeat(64), keywords: ['khác'], platforms: ['tiktok'], period: { startDate: '2024-01-01', endDate: '2024-12-31' }, category: null };
  assert.deepEqual(checkSnapshotScope(snapshot(), everything, { ...everything, captureId: 'x' }),
    { ok: false, code: 'METRIC_SNAPSHOT_SCOPE_MISMATCH', fields: ['captureId', 'category', 'keywords', 'period', 'platforms', 'specDigest'] });
});
