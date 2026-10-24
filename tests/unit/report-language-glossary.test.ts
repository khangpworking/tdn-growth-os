import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { MARKET_GLOSSARY, type GlossaryEntry } from '../../src/modules/analysis/report-language/glossary.js';
import { auditMarket14, GLOSSARY } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { CURRENT_MARKET_READER_TERMS, filterReaderGlossary, MARKET_READER_TERMS } from '../../src/modules/analysis/research-automation/market-reader-glossary.js';

type ReaderTerm = readonly [string, string];

// Literal reader lists from origin/main before c4 PR3; their bytes and order are a compatibility contract.
const ORIGINAL_MARKET_READER_TERMS: readonly ReaderTerm[] = [
  ['listing', 'sản phẩm'], ['review', 'đánh giá'], ['reviews', 'đánh giá'], ['export', 'tệp dữ liệu'],
  ['peer set', 'nhóm đối thủ'], ['variant', 'biến thể'], ['pack', 'gói'], ['insight', 'hiểu biết'], ['section', 'phần'],
  ['Giá TB', 'giá trung bình'], ['P25', 'mốc 25 phần trăm'], ['P75', 'mốc 75 phần trăm'],
  ['NSX', 'nhà sản xuất'], ['H1', 'giả thuyết 1'], ['ROAS', 'tỷ lệ doanh thu trên chi phí quảng cáo'],
  ['CPA', 'chi phí trên đơn'], ['AI', 'trí tuệ nhân tạo'],
];

const ORIGINAL_CURRENT_MARKET_READER_TERMS: readonly ReaderTerm[] = [
  ...ORIGINAL_MARKET_READER_TERMS,
  ['CPI', 'chỉ số giá tiêu dùng'], ['USD', 'đô la Mỹ'], ['VND', 'đồng Việt Nam'],
  ['HS', 'mã phân loại hàng hóa trong thương mại quốc tế'], ['HS code', 'mã phân loại hàng hóa trong thương mại quốc tế'],
  ['HS6', 'mã phân loại hàng hóa quốc tế gồm sáu chữ số'], ['UTC', 'giờ quốc tế phối hợp'],
  ['GDP', 'tổng sản phẩm trong nước'], ['PDF', 'định dạng tài liệu giữ nguyên bố cục'],
  ['SKU', 'mã quản lý một loại hàng hoặc biến thể'], ['CC BY', 'giấy phép cho phép sử dụng lại với điều kiện ghi công nguồn'],
  ['World Bank Open Data', 'dữ liệu mở của Ngân hàng Thế giới'],
  ['BLDC', 'động cơ điện một chiều không chổi than'], ['DC', 'dòng điện một chiều'], ['AC', 'dòng điện xoay chiều'],
  ['RPM', 'số vòng quay mỗi phút'], ['motor', 'động cơ'], ['brushless', 'không chổi than'],
];

for (const { name, actual, expected } of [
  { name: 'MARKET_READER_TERMS', actual: MARKET_READER_TERMS, expected: ORIGINAL_MARKET_READER_TERMS },
  { name: 'CURRENT_MARKET_READER_TERMS', actual: CURRENT_MARKET_READER_TERMS, expected: ORIGINAL_CURRENT_MARKET_READER_TERMS },
]) {
  test(`${name} preserves the original bytes and rejects a one-byte change`, () => {
    const compare = (copy: readonly ReaderTerm[]) => assert.deepEqual(
      Buffer.from(JSON.stringify(actual), 'utf8'), Buffer.from(JSON.stringify(copy), 'utf8'),
    );
    compare(expected);
    const changed = expected.map(([term, meaning]): ReaderTerm => [term, meaning]);
    changed[0] = ['Listing', changed[0]![1]];
    assert.throws(() => compare(changed), { code: 'ERR_ASSERTION' });
  });
}

function assertCheckerParity(entries: readonly GlossaryEntry[]): void {
  const checkerEntries = entries.filter(entry => !entry.readerOnly);
  assert.equal(checkerEntries.length, 17);
  assert.equal(GLOSSARY.length, checkerEntries.length);
  for (const entry of checkerEntries) {
    const pairs = GLOSSARY.filter(([term]) => term.test(entry.term));
    assert.equal(pairs.length, 1, `${entry.term} has one checker entry`);
    const [term, meaning] = pairs[0]!;
    const definition = `${entry.term} ${entry.meaning}`;
    assert.ok(term.test(definition) && meaning.test(definition), `${entry.term} definition satisfies both checker patterns`);
  }
}

test('all 17 shared glossary definitions satisfy their checker pair', () => {
  assertCheckerParity(MARKET_GLOSSARY);
});

test('all 18 reader-only glossary terms are absent from the checker', () => {
  const readerOnly = MARKET_GLOSSARY.filter(entry => entry.readerOnly);
  assert.equal(readerOnly.length, 18);
  for (const entry of readerOnly) {
    assert.equal(GLOSSARY.some(([term]) => term.test(entry.term)), false, `${entry.term} is reader-only`);
  }
});

test('the same parity comparison rejects a changed meaning', () => {
  const changed = MARKET_GLOSSARY.map(entry => entry.term === 'listing' ? { ...entry, meaning: 'không có định nghĩa' } : entry);
  assert.throws(() => assertCheckerParity(changed), {
    code: 'ERR_ASSERTION', message: /listing definition satisfies both checker patterns/u,
  });
});

function rule1(html: string) {
  const result = auditMarket14(html).find(item => item.rule === '1');
  assert.ok(result, 'the public audit returns glossary rule 1');
  return result;
}

const glossaryRow = ([term, meaning]: ReaderTerm) => `<tr><td>${term}</td><td>${meaning}</td></tr>`;
const fullGlossary = `<table data-glossary="true"><tbody>${ORIGINAL_CURRENT_MARKET_READER_TERMS.map(glossaryRow).join('')}</tbody></table>`;

for (const { prose, term, required } of [
  { prose: 'peerset', term: 'peer set', required: true },
  { prose: 'peer set', term: 'peer set', required: true },
  { prose: 'P250', term: 'P25', required: false },
  { prose: 'P25', term: 'P25', required: true },
  { prose: 'giá TB', term: 'Giá TB', required: true },
  { prose: 'Giá TB', term: 'Giá TB', required: true },
  { prose: 'AI', term: 'AI', required: true },
]) {
  test(`D7: ${JSON.stringify(prose)} has the same checker and current-reader verdict`, () => {
    const report = `<html><body><p>${prose}</p></body></html>`;
    const checked = rule1(report);
    const filtered = filterReaderGlossary(report.replace('</body>', `${fullGlossary}</body>`), { currentReader: true });
    const entry = ORIGINAL_CURRENT_MARKET_READER_TERMS.find(([name]) => name === term);
    assert.ok(entry, `${term} exists in the frozen reader list`);
    const kept = filtered.includes(glossaryRow(entry));
    assert.deepEqual({ checkerRequires: !checked.ok, filterKeeps: kept }, {
      checkerRequires: required, filterKeeps: required,
    }, checked.detail);
  });
}

test('rule 1 still accepts the saved versioned Market reader fixture', async () => {
  const html = await readFile(new URL('../fixtures/package-f-plus-versioned-market.html', import.meta.url), 'utf8');
  const checked = rule1(html);
  assert.equal(checked.ok, true, checked.detail);
});
