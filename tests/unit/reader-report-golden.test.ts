import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import { Bundle, classify, scopeMetrics, type Profile, type Row } from '../../src/modules/analysis/reader-report/index.js';

// Parity with the owner-approved thạch dừa reader report (05/10/2026). The row
// data is commercial, so it never enters this public repo: point
// READER_REPORT_GOLDEN_DIR at a folder holding build-data-rows2.json, data.json
// and thach-dua.json (the profile). Without it the test is skipped.
const dir = process.env.READER_REPORT_GOLDEN_DIR;
const read = (name: string): any => JSON.parse(fs.readFileSync(path.join(dir!, name), 'utf8'));

test('kit reproduces every approved thạch dừa number', { skip: dir ? false : 'READER_REPORT_GOLDEN_DIR not set' }, () => {
  const profile: Profile = read('thach-dua.json');
  const rows: Row[] = read('build-data-rows2.json').map((r: any) => ({ ...r, platform: 'shopee', label: r.rel }));
  const gold = read('data.json');
  classify(rows, profile);
  const S = scopeMetrics(new Bundle(), 'shopee', rows, profile);

  const goldSeg = new Map<number, string>(gold.rows.map((r: any) => [r.i, r.seg]));
  assert.equal(rows.length, 223);
  assert.deepEqual(rows.filter(r => goldSeg.get(r.i) !== r.seg).map(r => r.i), [], 'segment of every row');
  for (const g of gold.segs) {
    const k = S.segs.find(s => s.k === g.k);
    assert.ok(k, `segment ${g.k}`);
    assert.deepEqual([k.n, k.rev, k.units, k.shops, k.aspP25, k.aspMed, k.aspP75, k.top],
      [g.n, g.rev, g.units, g.shops, g.aspP25, g.aspMed, g.aspP75, g.top.map((x: any) => x.i)], `segment ${g.k}`);
  }
  assert.deepEqual([S.core.length, S.cr, S.cu, S.shops.length], [gold.core.n, gold.core.rev, gold.core.units, gold.core.shops], 'core');
  assert.deepEqual(S.conc.map(([n, v]) => [n, v.toFixed(2)]), gold.conc, 'concentration');
  assert.deepEqual(S.shops.slice(0, 15).map(s => [s.shop, s.n, s.rev, s.units, s.segs, s.brands, s.top.listing]),
    gold.shops.map((s: any) => [s.shop, s.n, s.rev, s.units, s.segs, s.brands, s.top.listing]), 'top 15 shops');
  assert.deepEqual(S.brands, gold.brands, 'brands');
  assert.deepEqual(S.one.map(r => [r.i, r.seg]), gold.one.map((r: any) => [r.i, r.seg]), '1 kg benchmark');
});
