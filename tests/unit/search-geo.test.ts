import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import {
  normalizeProvince, provinceRegion, searchGeoAverageText, searchGeoDocument, searchGeoEnabled, searchGeoRenderable, searchGeoText, searchGeoNoteText, summarizeSearchGeo,
  SEARCH_GEO_USAGE_ORDINAL, VN_PROVINCES, VN_REGIONS,
} from '../../src/modules/analysis/research-automation/search-geo.js';
import { validSearchGeo } from '../../src/modules/analysis/research-automation/service.js';
import { GEO_FIXTURES, syntheticGeoProvinces, syntheticSearchGeo } from '../helpers/search-geo-synthetic.js';

test('the six regions carry the exact Vietnamese labels and all 63 provinces map to one of them', () => {
  assert.deepEqual([...VN_REGIONS], ['Trung du và miền núi phía Bắc', 'Đồng bằng sông Hồng', 'Bắc Trung Bộ và Duyên hải miền Trung', 'Tây Nguyên', 'Đông Nam Bộ', 'Đồng bằng sông Cửu Long']);
  assert.equal(VN_PROVINCES.length, 63);
  assert.equal(new Set(VN_PROVINCES).size, 63);
  for (const name of VN_PROVINCES) assert.ok(provinceRegion(name), name);
  const counts = VN_REGIONS.map(region => VN_PROVINCES.filter(name => provinceRegion(name) === region).length);
  assert.deepEqual(counts, [14, 11, 14, 5, 6, 13]);
});

test('provider spellings are cleaned up before the lookup', () => {
  assert.equal(normalizeProvince('Thành phố Hồ Chí Minh'), 'Hồ Chí Minh');
  assert.equal(normalizeProvince('Tỉnh Thanh Hoá'), 'Thanh Hóa');
  assert.equal(normalizeProvince('tỉnh Khánh Hoà'), 'Khánh Hòa');
  assert.equal(normalizeProvince('Đăk Lăk'), 'Đắk Lắk');
  assert.equal(normalizeProvince('Bà Rịa–Vũng Tàu'), 'Bà Rịa - Vũng Tàu');
  assert.equal(provinceRegion('Thừa Thiên - Huế'), 'Bắc Trung Bộ và Duyên hải miền Trung');
  assert.equal(provinceRegion('Thành phố Hà Nội'.normalize('NFD')), 'Đồng bằng sông Hồng', 'decomposed input is NFC-normalised');
  assert.equal(provinceRegion('Atlantis'), null);
  for (const name of ['TP.HCM', 'Ho Chi Minh City', 'Hồ Chí Minh']) assert.equal(provinceRegion(name), 'Đông Nam Bộ', name);
  for (const name of ['Hanoi', 'Ha Noi', 'Hà Nội']) assert.equal(provinceRegion(name), 'Đồng bằng sông Hồng', name);
  assert.equal(provinceRegion('Thua Thien Hue'), 'Bắc Trung Bộ và Duyên hải miền Trung');
  assert.equal(provinceRegion('Ba Ria - Vung Tau'), 'Đông Nam Bộ');
  for (const name of ['Bình Phước', 'Tây Ninh']) assert.equal(provinceRegion(name), 'Đông Nam Bộ', name);
  assert.equal(provinceRegion('Quảng Ninh'), 'Đồng bằng sông Hồng');
  assert.equal(provinceRegion('Long An'), 'Đồng bằng sông Cửu Long');
  assert.equal(provinceRegion('Lâm Đồng'), 'Tây Nguyên');
});

test('fixture quạt điện: six of the top ten in the Red River Delta picks that region', () => {
  const summary = summarizeSearchGeo(syntheticGeoProvinces(GEO_FIXTURES['quạt điện']));
  assert.deepEqual(summary.choice, { kind: 'REGION', region: 'Đồng bằng sông Hồng', inTop: 6 });
  assert.equal(summary.regions.find(row => row.region === 'Đồng bằng sông Hồng')?.inTop, 6);
  assert.equal(summary.regions.reduce((sum, row) => sum + row.inTop, 0), 10);
  const text = searchGeoText(summary);
  assert.match(text.result, /^Kết quả: vùng nổi bật là Đồng bằng sông Hồng \(6 trong 10 tỉnh đứng đầu\)\.$/);
  assert.match(text.seen, /^Thấy gì: /);
  assert.match(text.use, /^Cách đọc: chỉ số cho biết mức quan tâm tương đối/u);
  assert.doesNotMatch(text.use, /nhất|hàng đầu|ưu tiên|quảng cáo|chọn kho/u);
  assert.match(text.dont, /^Đừng hiểu là: đây không phải số lượt tìm kiếm, không phải số người mua hay doanh số;/);
  assert.match(text.topLine, /^5 tỉnh, thành phố đứng đầu về mức quan tâm \(theo 63 tỉnh, thành phố trước sáp nhập năm 2025\): Hà Nội \(100\), Hải Phòng \(99\)/);
});

test('fixture bình giữ nhiệt: four and four is a tie, so nationwide with no filter', () => {
  const summary = summarizeSearchGeo(syntheticGeoProvinces(GEO_FIXTURES['bình giữ nhiệt']));
  assert.deepEqual(summary.choice, { kind: 'NATIONWIDE', why: 'SPREAD', leading: ['Đồng bằng sông Hồng', 'Đông Nam Bộ'], leadingInTop: 4 });
  const text = searchGeoText(summary);
  assert.match(text.result, /^Kết quả: chưa có vùng nổi bật theo quy tắc đếm tỉnh\. Trong 10 tỉnh đứng đầu: Đồng bằng sông Hồng và Đông Nam Bộ \(mỗi vùng 4 tỉnh\)\.$/);
  assert.match(text.use, /không đo nhu cầu mua hay khả năng giao hàng/u);
});

test('fixture thạch dừa: at most three per region, so nationwide with no filter', () => {
  const summary = summarizeSearchGeo(syntheticGeoProvinces(GEO_FIXTURES['thạch dừa']));
  assert.equal(summary.choice.kind, 'NATIONWIDE');
  assert.equal(Math.max(...summary.regions.map(row => row.inTop)), 3);
  assert.match(searchGeoText(summary).result, /^Kết quả: chưa có vùng nổi bật theo quy tắc đếm tỉnh\.$/);
});

test('fewer than ten provinces with a value gives no choice', () => {
  const provinces = GEO_FIXTURES['quạt điện'].slice(0, 9).map((name, i) => ({ name, index: 90 - i }));
  const summary = summarizeSearchGeo([...provinces, { name: 'Cà Mau', index: null }]);
  assert.deepEqual(summary.choice, { kind: 'NATIONWIDE', why: 'TOO_FEW', valued: 9 });
  assert.match(searchGeoText(summary).seen, /chỉ 9 tỉnh/);
});

test('an unmapped name in the top ten gives no choice, even with a clear majority', () => {
  const provinces = [{ name: 'Atlantis', index: 100 }, ...syntheticGeoProvinces(GEO_FIXTURES['quạt điện'])];
  const summary = summarizeSearchGeo(provinces);
  assert.deepEqual(summary.choice, { kind: 'NATIONWIDE', why: 'UNMAPPED', unmapped: ['Atlantis'] });
  assert.match(searchGeoText(summary).seen, /không khớp danh sách 63 tỉnh/u);
  assert.doesNotMatch(searchGeoText(summary).seen, /Atlantis/);
});

test('ties in the index are broken by name, so the top ten is stable', () => {
  const tied = VN_PROVINCES.map(name => ({ name, index: 50 }));
  const a = summarizeSearchGeo(tied), b = summarizeSearchGeo([...tied].reverse());
  assert.deepEqual(a.top.map(row => row.name), b.top.map(row => row.name));
  assert.deepEqual(a.top.map(row => row.name), [...VN_PROVINCES].sort((x, y) => x < y ? -1 : x > y ? 1 : 0).slice(0, 10));
});

test('two regions with five provinces each do not imply that neither reached five', () => {
  const names = ['Hà Nội', 'Hải Phòng', 'Bắc Ninh', 'Hải Dương', 'Quảng Ninh', 'Hồ Chí Minh', 'Bình Dương', 'Đồng Nai', 'Tây Ninh', 'Bình Phước'];
  const summary = summarizeSearchGeo(names.map((name, i) => ({ name, index: 100 - i })));
  assert.equal(summary.choice.kind, 'NATIONWIDE');
  assert.doesNotMatch(searchGeoText(summary).seen, /không vùng nào có từ 5 tỉnh trở lên/u);
});

test('region averages count only provinces with a value and use a Vietnamese comma', () => {
  const summary = summarizeSearchGeo([{ name: 'Kon Tum', index: 10 }, { name: 'Gia Lai', index: 15 }, { name: 'Lâm Đồng', index: null }, { name: 'Đắk Nông', index: 0 }]);
  const row = summary.regions.find(item => item.region === 'Tây Nguyên')!;
  assert.equal(row.average, 8.3);
  assert.equal(row.provincesWithValue, 3);
  assert.equal(searchGeoAverageText(row.average), '8,3');
  assert.equal(searchGeoAverageText(null), '');
});

test('stored document: reasons, renderable predicate and strict validation', () => {
  const skipped = searchGeoDocument({ kind: 'SKIPPED', keyword: 'quạt điện', reason: 'PERIOD_NOT_COVERED' }, null);
  const thrown = searchGeoDocument({ kind: 'THROWN', keyword: 'quạt điện' }, null);
  assert.deepEqual([skipped.status, skipped.reason, thrown.status, thrown.reason], ['SKIPPED', 'PERIOD_NOT_COVERED', 'FAILED', 'PROVIDER_FAILED']);
  const collected = syntheticSearchGeo();
  assert.equal(searchGeoRenderable(collected), true);
  assert.equal(searchGeoRenderable(skipped), false);
  assert.equal(searchGeoRenderable({ ...collected, captureIndex: null }), false);
  assert.equal(searchGeoRenderable({ ...collected, provinces: [{ name: 'Atlantis', index: 50 }] }), false);
  for (const value of [skipped, thrown, collected]) assert.equal(validSearchGeo(value), true);
  assert.equal(validSearchGeo({ ...collected, provinces: [...collected.provinces, collected.provinces[0]] }), false, 'no repeated name');
  assert.equal(validSearchGeo({ ...collected, provinces: [{ name: 'Hà Nội', index: 101 }] }), false);
  assert.equal(validSearchGeo({ ...collected, provinces: [{ name: 'Hà Nội', index: 5, extra: 1 }] }), false);
  assert.equal(validSearchGeo({ ...collected, provinces: Array.from({ length: 81 }, (_, i) => ({ name: `T${i}`, index: 1 })) }), false, 'cap 80');
  assert.equal(validSearchGeo({ ...collected, reason: 'PROVIDER_FAILED' }), false);
  assert.equal(validSearchGeo({ ...thrown, provinces: collected.provinces }), false);
  assert.equal(validSearchGeo({ ...collected, geo: 'US' }), false);
  for (const value of [
    { ...skipped, reason: 'PROVIDER_FAILED' }, { ...thrown, reason: 'PERIOD_NOT_COVERED' },
    { ...collected, extra: true }, { ...collected, keyword: ' ' },
    { ...collected, captureIndex: 512 }, { ...collected, captureIndex: -1 }, { ...collected, captureIndex: 0.5 },
    { ...thrown, retrievedAt: collected.retrievedAt },
    { ...collected, provinces: [{ name: ' ', index: 20 }] },
    { ...collected, provinces: [{ name: 'Hà Nội', index: null }] },
    { ...collected, provinces: [{ name: 'Thanh Hóa', index: 80 }, { name: 'Tỉnh Thanh Hoá', index: 70 }] },
  ]) assert.equal(validSearchGeo(value), false, JSON.stringify(value));
  assert.equal(SEARCH_GEO_USAGE_ORDINAL, 16);
});

test('TDN_RESEARCH_SEARCH_TRENDS_GEO_ENABLED works only when exactly "1" and only beside the search-interest lane', t => {
  assert.equal(searchGeoEnabled({ TDN_RESEARCH_SEARCH_TRENDS_GEO_ENABLED: '1' }), true);
  for (const value of ['', '0', 'true', ' 1', '01']) assert.equal(searchGeoEnabled({ TDN_RESEARCH_SEARCH_TRENDS_GEO_ENABLED: value }), false);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-trends-geo-config-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const frontendDist = path.join(root, 'dist'); fs.mkdirSync(frontendDist);
  fs.writeFileSync(path.join(frontendDist, 'index.html'), '<!doctype html><p>Synthetic app</p>');
  const base = { TDN_WORKSPACE_DB: path.join(root, 'test.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts') };
  const read = (env: NodeJS.ProcessEnv) => operatorAppConfigurationFromEnvironment({ ...base, ...env }, { frontendDist, version: 'synthetic' });
  assert.equal('researchSearchTrendsGeo' in read({ TDN_RESEARCH_SEARCH_TRENDS_GEO_ENABLED: '1' }), false, 'needs the search-interest lane');
  const trends = read({ TDN_RESEARCH_SEARCH_TRENDS_ENABLED: '1' });
  const both = read({ TDN_RESEARCH_SEARCH_TRENDS_ENABLED: '1', TDN_RESEARCH_SEARCH_TRENDS_GEO_ENABLED: '1' });
  assert.equal(both.researchSearchTrendsGeo, true);
  const { researchSearchTrendsGeo: _flag, ...rest } = both;
  assert.deepEqual(rest, trends, 'nothing else changes');
});

test('SRC1 row 6: range validators reject malformed ranges and retain legacy documents', () => {
  const range = { startDate: '2024-01-01', endDate: '2024-12-31' };
  const legacy = syntheticSearchGeo();
  const current = { ...legacy, window: 'REQUESTED_RANGE', requestedRange: range };
  assert.equal(validSearchGeo(current), true);
  assert.equal(validSearchGeo(legacy), true);
  assert.equal(validSearchGeo(searchGeoDocument({ kind: 'SKIPPED', keyword: 'sản phẩm mẫu', reason: 'PERIOD_NOT_COVERED' }, null)), true);
  for (const requestedRange of [undefined, null, { ...range, extra: true }, { ...range, startDate: 'bad' },
    { ...range, startDate: '2024-02-30' }, { startDate: '2025-01-01', endDate: range.endDate }]) {
    assert.equal(validSearchGeo({ ...current, requestedRange }), false, JSON.stringify(requestedRange));
  }
  assert.equal(validSearchGeo({ ...legacy, requestedRange: range }), false);
  assert.equal(validSearchGeo({ ...current, extra: true }), false);
});
