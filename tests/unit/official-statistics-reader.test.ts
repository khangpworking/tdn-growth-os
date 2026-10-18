import assert from 'node:assert/strict';
import test from 'node:test';
import {
  officialStatsCitation, officialStatsProvinceCitation, officialStatsProvinceContext,
  officialStatsProvinceRowLabel, officialStatsRowLabel, officialStatsStatusText,
  officialStatsTechnicalCitation, officialStatsUnitText,
} from '../../src/modules/analysis/research-automation/official-statistics-lane.js';
import { fullOfficialStats } from '../helpers/market14-full-fixture.js';

test('CPI keeps bases on each row and omits a shared base when they differ', () => {
  const original = fullOfficialStats(), row = original.values[0]!;
  const value = { ...original, values: [
    { ...row, base: 'tháng 9 năm 2025' }, { ...row, cell: 'E14', base: 'tháng 8 năm 2026' },
  ] };
  const bytes = JSON.stringify(value);
  assert.equal(officialStatsUnitText(value.values[0]!), 'chỉ số, kỳ gốc: tháng 9 năm 2025');
  assert.equal(officialStatsUnitText(value.values[1]!), 'chỉ số, kỳ gốc: tháng 8 năm 2026');
  assert.equal(officialStatsProvinceContext(value), 'Kỳ: Tháng 9 năm 2026.');
  assert.equal(officialStatsProvinceContext(original), 'Kỳ: Tháng 9 năm 2026. Kỳ gốc: tháng trước = 100.');
  assert.equal(JSON.stringify(value), bytes);
});

test('unstated status is a word-free dash; source revisions and stated statuses remain explicit', () => {
  const value = fullOfficialStats(), row = value.values[0]!;
  assert.equal(officialStatsStatusText(value, row), '—');
  assert.equal(officialStatsStatusText(value, { ...row, status: 'SO_BO' }), 'sơ bộ');
  const revised = { ...value, files: value.files.map(file => ({ ...file, revised: true })) };
  assert.equal(officialStatsStatusText(revised, row), 'tệp đã được nguồn cập nhật lại');
  assert.equal(officialStatsStatusText(revised, { ...row, status: 'UOC_TINH' }), 'ước tính; tệp đã được nguồn cập nhật lại');
  assert.doesNotMatch(officialStatsProvinceContext(revised), /Trạng thái|bảng không ghi/u);
});

test('source labels become sentence case only for display', () => {
  const row = { table: 'CPI_WORKBOOK' as const, label: 'CHỈ SỐ GIÁ TIÊU DÙNG' };
  assert.equal(officialStatsRowLabel(row), 'Chỉ số giá tiêu dùng (Mọi ngành hàng; tham chiếu cả nước)');
  assert.match(officialStatsProvinceRowLabel(row.label, 'tháng trước'), /kỳ gốc: tháng trước = 100/u);
  assert.equal(officialStatsProvinceRowLabel(row.label), 'Chỉ số giá tiêu dùng (Mọi ngành hàng; dòng tham chiếu)');
  assert.equal(officialStatsRowLabel({ ...row, label: 'II. ĐỒ UỐNG VÀ THUỐC LÁ' }), 'II. Đồ uống và thuốc lá');
  assert.equal(row.label, 'CHỈ SỐ GIÁ TIÊU DÙNG');
});

test('CPI reader citations contain period and publication date; technical citations retain file, sheet and row', () => {
  const value = fullOfficialStats(), row = value.values[0]!;
  const expected = 'Cục Thống kê, số liệu CPI tháng 9/2026, công bố 01/10/2026';
  assert.equal(officialStatsCitation(value, row), expected);
  assert.equal(officialStatsProvinceCitation(value, { row: 9 }), expected);
  const technical = officialStatsTechnicalCitation(value, row);
  assert.deepEqual({ file: technical.file, sheet: technical.sheet, row: technical.row }, { file: 'CPI-synthetic.xlsx', sheet: 'Cả nước', row: '14' });
  assert.ok(JSON.parse(technical.locators!).some((item: { sheet: string; cell: string }) => item.sheet === 'Địa phương' && item.cell === 'C11'));
});
