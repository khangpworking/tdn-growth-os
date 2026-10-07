import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import {
  isPartialMonth,
  normaliseMetricWebSnapshot,
  parseVietnameseDisplayNumber,
  type MetricWebFacts,
  type MetricWebMonthFact,
  type MetricWebValueFact,
} from '../../src/modules/analysis/research-automation/metric-web-facts.js';
import { validateMetricWebSnapshot } from '../../src/modules/analysis/research-automation/metric-web-snapshot.js';

// #127 Phase 2b step 2: the normaliser only copies and parses. It never sums
// platforms, never computes shares, and keeps a missing value as null.

const load = (name: string): AutomationMetricWebSnapshotV1 =>
  validateMetricWebSnapshot(JSON.parse(readFileSync(new URL(`../fixtures/metric-web-snapshot/${name}.json`, import.meta.url), 'utf8')));

const isValueFact = (node: unknown): node is MetricWebValueFact =>
  typeof node === 'object' && node !== null && 'unit' in node && 'displayed' in node;

function valueFacts(node: unknown, found: MetricWebValueFact[] = []): MetricWebValueFact[] {
  if (isValueFact(node)) found.push(node);
  else if (Array.isArray(node)) node.forEach(item => valueFacts(item, found));
  else if (typeof node === 'object' && node !== null) Object.values(node).forEach(item => valueFacts(item, found));
  return found;
}

test('parseVietnameseDisplayNumber reads every supported form and nothing else', () => {
  const table: [string, ReturnType<typeof parseVietnameseDisplayNumber>][] = [
    ['12,3 tỷ', { value: 12_300_000_000, unit: 'VND' }],
    ['4,5 triệu', { value: 4_500_000, unit: 'VND' }],
    ['850 nghìn', { value: 850_000, unit: 'VND' }],
    ['37,8%', { value: 37.8, unit: 'PERCENT' }],
    ['1.234.567', { value: 1_234_567, unit: 'COUNT' }],
    ['-5,2%', { value: -5.2, unit: 'PERCENT' }],
    ['8 tỷ', { value: 8_000_000_000, unit: 'VND' }],
    ['  512,3 triệu ', { value: 512_300_000, unit: 'VND' }],
    ['0%', { value: 0, unit: 'PERCENT' }],
    ['-0,0%', { value: 0, unit: 'PERCENT' }],
    ['4512', { value: 4_512, unit: 'COUNT' }],
    ['', null],
    ['-', null],
    ['Mới', null],
    ['12.3 tỷ', null],
    ['1.23', null],
    ['1,234,567', null],
    ['12,3 ty', null],
    ['12,3 tỷ đồng', null],
    ['~12 tỷ', null],
    ['12 tỷ 300 triệu', null],
    ['1e9', null],
    ['NaN', null],
    ['--5%', null],
    ['5%%', null],
    ['12,3 Tỷ'.normalize('NFD'), { value: 12_300_000_000, unit: 'VND' }],
  ];
  for (const [displayed, expected] of table) assert.deepEqual(parseVietnameseDisplayNumber(displayed), expected, JSON.stringify(displayed));
  assert.ok(Object.is(parseVietnameseDisplayNumber('-0,0%')!.value, 0), 'no negative zero');
});

test('raw values pass through with their exact precision', () => {
  const facts = normaliseMetricWebSnapshot(load('full'));
  assert.deepEqual(facts.kpi.revenue.current, {
    label: 'Doanh số', displayed: '12,3 tỷ', unit: 'VND', platform: 'all',
    period: { startDate: '2025-09-15', endDate: '2026-09-20' }, sourcePointer: 'overview.revenue.value',
    value: 12_312_345_678, precision: 'exact',
  });
  assert.equal(facts.kpi.units.changePct!.value, -5.2);
  const inputNumbers = new Set(valueFacts(load('full').groups).map(value => value.value));
  for (const fact of valueFacts(facts)) {
    if (fact.value === null) continue;
    assert.equal(fact.precision, 'exact', fact.sourcePointer);
    assert.ok(inputNumbers.has(fact.value), `${fact.sourcePointer} copied, not computed`);
  }
});

test('display-only values are parsed as display_rounded; unparseable or unit-mismatched text stays null', () => {
  const facts = normaliseMetricWebSnapshot(load('display-only'));
  const expect = (fact: MetricWebValueFact | null, value: number | null, precision: string): void => {
    assert.ok(fact !== null);
    assert.equal(fact.value, value, fact.sourcePointer);
    assert.equal(fact.precision, precision, fact.sourcePointer);
  };
  expect(facts.kpi.revenue.current, 12_300_000_000, 'display_rounded');
  expect(facts.kpi.revenue.changePct, 18.4, 'display_rounded');
  expect(facts.kpi.units.current, 1_234_567, 'display_rounded');
  expect(facts.kpi.units.changePct, -5.2, 'display_rounded');
  expect(facts.kpi.soldListings.current, 850_000, 'display_rounded');
  expect(facts.kpi.shops.changePct, null, 'display_rounded');
  expect(facts.platformSplit[0]!.revenue, 8_000_000_000, 'display_rounded');
  expect(facts.platformSplit[1]!.share, 34.9, 'display_rounded');
  assert.ok(!('absent' in facts.monthly));
  expect(facts.monthly.shopee!['2025-09']!.revenue, 512_300_000, 'display_rounded');
  expect(facts.monthly.shopee!['2025-09']!.units, 4_100, 'display_rounded');
  assert.ok(Array.isArray(facts.topShops));
  expect(facts.topShops[1]!.rankOld as MetricWebValueFact, null, 'display_rounded');
  expect(facts.topShops[0]!.rankNew as MetricWebValueFact, 1, 'display_rounded');

  const raw = load('display-only');
  raw.groups.W2_kpi.revenue.current.displayed = '37,8%';
  raw.groups.W2_kpi.revenue.changePct!.displayed = '4,5 triệu';
  const mismatched = normaliseMetricWebSnapshot(raw);
  assert.equal(mismatched.kpi.revenue.current.value, null, 'percent text on a VND value is not used');
  assert.equal(mismatched.kpi.revenue.changePct!.value, null, 'amount text on a PERCENT value is not used');
});

test('partial months are flagged only where scope.period cuts the month', () => {
  const facts = normaliseMetricWebSnapshot(load('full'));
  assert.ok(!('absent' in facts.monthly));
  for (const platform of ['shopee', 'tiktok'] as const) {
    const months: Readonly<Record<string, MetricWebMonthFact>> = facts.monthly[platform]!;
    assert.equal(Object.keys(months).length, 13);
    assert.deepEqual(Object.keys(months), [...Object.keys(months)].sort());
    assert.deepEqual(Object.entries(months).filter(([, point]) => point.partial).map(([month]) => month), ['2025-09', '2026-09']);
  }
  assert.equal(facts.monthly.tiktok!['2026-01']!.units, null, 'missing units stay null');
  const whole = { startDate: '2025-01-01', endDate: '2025-12-31' };
  assert.equal(isPartialMonth('2025-01', whole), false);
  assert.equal(isPartialMonth('2025-12', whole), false);
  assert.equal(isPartialMonth('2024-02', { startDate: '2024-01-01', endDate: '2024-02-29' }), false, 'leap February ends on 29');
  assert.equal(isPartialMonth('2025-02', { startDate: '2025-01-01', endDate: '2025-02-27' }), true);
  assert.equal(isPartialMonth('2025-03', { startDate: '2025-03-02', endDate: '2025-03-31' }), true);
});

test('absent groups become the absent marker, never an empty list', () => {
  const facts = normaliseMetricWebSnapshot(load('absent-optional'));
  assert.deepEqual(facts.category, { absent: true, reason: 'NOT_ON_PAGE' });
  assert.deepEqual(facts.priceLevel, { absent: true, reason: 'NOT_CAPTURED' });
  assert.deepEqual(facts.top10Share, { brand: { absent: true, reason: 'RECON_PENDING' }, shop: { absent: true, reason: 'NOT_ON_PAGE' } });
  assert.deepEqual(facts.brandByShopType, { absent: true, reason: 'NOT_CAPTURED' });
  assert.deepEqual(facts.shopType, { absent: true, reason: 'RECON_PENDING' });
  for (const key of ['location', 'topProducts', 'topShops', 'topBrands', 'detailHistory'] as const) {
    assert.equal((facts[key] as { absent?: boolean }).absent, true, key);
  }
  const noMonthly = load('full');
  noMonthly.groups.W4_monthly = { absent: true, reason: 'NOT_ON_PAGE' };
  assert.deepEqual(normaliseMetricWebSnapshot(noMonthly).monthly, { absent: true, reason: 'NOT_ON_PAGE' });
});

function assertNoCrossPlatformSum(facts: MetricWebFacts): number {
  const all = valueFacts(facts);
  const capturedAll = new Set(all.filter(fact => fact.platform === 'all' && fact.value !== null).map(fact => fact.value));
  const byMetric = new Map<string, MetricWebValueFact[]>();
  for (const fact of all) {
    if (fact.platform === 'all' || fact.value === null) continue;
    const key = `${fact.label}|${fact.unit}|${fact.period.startDate}|${fact.period.endDate}`;
    byMetric.set(key, [...(byMetric.get(key) ?? []), fact]);
  }
  let checked = 0;
  for (const [key, metric] of byMetric) {
    const shopee = metric.filter(fact => fact.platform === 'shopee');
    const tiktok = metric.filter(fact => fact.platform === 'tiktok');
    for (const left of shopee) {
      for (const right of tiktok) {
        const sum = left.value! + right.value!;
        checked += 1;
        if (capturedAll.has(sum)) continue;
        assert.ok(!all.some(fact => fact.value === sum), `${key}: ${sum} is a shopee+tiktok sum`);
      }
    }
  }
  return checked;
}

test('no output value is a sum across platforms unless the page itself showed that total', () => {
  for (const name of ['full', 'display-only', 'absent-optional']) {
    assert.ok(assertNoCrossPlatformSum(normaliseMetricWebSnapshot(load(name))) > 0, `${name} had platform pairs to check`);
  }
  // Without the captured total, the sum must not appear anywhere.
  const raw = load('full');
  raw.groups.W2_kpi.revenue.current.value = 1;
  const facts = normaliseMetricWebSnapshot(raw);
  assertNoCrossPlatformSum(facts);
  assert.ok(!valueFacts(facts).some(fact => fact.value === 12_312_345_678));
});

test('normaliser is pure and deterministic', () => {
  const source = readFileSync(new URL('../../src/modules/analysis/research-automation/metric-web-facts.ts', import.meta.url), 'utf8');
  for (const forbidden of [/node:fs|from 'fs'/, /\bfetch\s*\(/, /Date\.now/, /Math\.random/, /process\./, /new Date\(\)/]) {
    assert.ok(!forbidden.test(source), String(forbidden));
  }
  const snapshot = load('full');
  const before = JSON.stringify(snapshot);
  const left = JSON.stringify(normaliseMetricWebSnapshot(snapshot));
  const right = JSON.stringify(normaliseMetricWebSnapshot(load('full')));
  assert.equal(left, right);
  assert.equal(JSON.stringify(snapshot), before, 'input not mutated');
  const facts = normaliseMetricWebSnapshot(snapshot);
  facts.scope.keywords[0] = 'changed';
  assert.equal(snapshot.scope.keywords[0], 'bình giữ nhiệt', 'facts do not alias the input');
});
