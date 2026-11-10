import assert from 'node:assert/strict';
import test from 'node:test';
import modules from '../../skills/tdn-shopee-flow/modules.json' with { type: 'json' };
import { metricV3Defaults } from '../../src/shared/metric-v3-preset.js';

// R5: the flow recipe and the app preset must describe the same two Metric windows.
const endDate = '2026-11-10';
const days = (date: string) => Date.parse(date);

test('the modules.json window recipe reproduces metricV3Defaults for one end date', () => {
  const recipe = modules.params.windows as { id: string; startOffsetDays: number; intervalDays: number }[];
  const expected = metricV3Defaults('son', null, endDate).windows;
  assert.equal(recipe.length, expected.length);
  for (let i = 0; i < recipe.length; i++) {
    const start = new Date(days(endDate) + recipe[i]!.startOffsetDays * 86400000).toISOString().slice(0, 10);
    assert.equal(recipe[i]!.id, expected[i]!.id);
    assert.equal(start, expected[i]!.period.startDate);
    assert.equal(endDate, expected[i]!.period.endDate);
    assert.equal(recipe[i]!.intervalDays, expected[i]!.intervalDays);
  }
  assert.equal(modules.params.pickWindow.preset, '30d');
});
