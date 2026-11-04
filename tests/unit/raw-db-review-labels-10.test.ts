import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { labelRows, parseLabelCodebook } from '../../src/modules/raw-db/review-labeller.js';
import { hasReviewContent, reviewFilterQuestions } from '../../src/modules/raw-db/review-filter.js';

// Independent owner-pinned bytes, copied without rewriting Vietnamese prose.
const pinnedText = readFileSync(new URL('../fixtures/review-labels-10-codebook.json', import.meta.url), 'utf8');
const freshBook = () => JSON.parse(pinnedText);
const filterText = JSON.parse(readFileSync(new URL('../fixtures/review-labels-10-filter-text.json', import.meta.url), 'utf8'));

test('R-RV01: the shipped DRAFT codebook is the exact pinned ten-theme file', () => {
  const actual = readFileSync(new URL('../../tools/mcp-insight/data/insight-theme-codebook.json', import.meta.url));
  assert.ok(actual.equals(Buffer.from(pinnedText)), 'the shipped file differs from the pinned 2026-11-04.1 bytes');
});

test('R-RV01: logistics codes remain forbidden in the new format', () => {
  for (const code of ['T-GIAOHANG', 'T-DONGGOI', 'T-DICHVU']) {
    const book = freshBook();
    book.core.find((theme: { code: string }) => theme.code === 'T-GIA').code = code;
    assert.throws(() => parseLabelCodebook(JSON.stringify(book)), /RAW_DB_CODES_CODEBOOK_INVALID/, code);
  }
});

test('R-RV03: accept the pinned per-theme options and reject incomplete or untyped option sets', () => {
  assert.doesNotThrow(() => parseLabelCodebook(pinnedText), 'the new file itself is valid');
  const invalid: [string, (book: ReturnType<typeof freshBook>) => void][] = [
    ['blank guide', book => { book.guide = ' \n\t'; }],
    ['waitTheme outside core', book => { book.waitTheme = 'T-ABSENT'; }],
    ['global options lack KHONG_NHAC', book => { book.options = book.options.filter((o: { key: string }) => o.key !== 'KHONG_NHAC'); }],
    ['own options lack KHONG_NHAC', book => { book.core[1].options.pop(); }],
    ['global counted option lacks polarity', book => { delete book.options[0].polarity; }],
    ['own counted option lacks polarity', book => { delete book.core[1].options[0].polarity; }],
    ['own counted option has invalid polarity', book => { book.core[1].options[0].polarity = 'positive'; }],
    ['waitTheme lacks CHUA_DANHGIA', book => {
      book.core[0].options = book.options.filter((o: { key: string }) => o.key !== 'CHUA_DANHGIA');
    }],
  ];
  for (const [name, mutate] of invalid) {
    const book = freshBook();
    mutate(book);
    assert.throws(() => parseLabelCodebook(JSON.stringify(book)), /RAW_DB_CODES_CODEBOOK_INVALID/, name);
  }
});

// These controls distinguish counted mass from mention/uncertainty mass. In particular,
// summing CHUA_DANHGIA changes both the empty result and the unclear row below.
test('R-RV04: CHUA_DANHGIA neither creates a price row nor inflates a normal p_yes', () => {
  const book = parseLabelCodebook(pinnedText);
  assert.deepEqual(labelRows(book, new Map([['T-GIA', {
    KHEN: 0.01, CHE: 0.01, HAI: 0, KE: 0.01, CHUA_DANHGIA: 0.92, KHONG_NHAC: 0.05,
  }]])), []);
  assert.deepEqual(labelRows(book, new Map([['T-GIA', {
    KHEN: 0.30, CHE: 0.24, HAI: 0, KE: 0, CHUA_DANHGIA: 0.40, KHONG_NHAC: 0.06,
  }]])), [{ theme_code: 'T-GIA', p_yes: 0.54, status: 'unclear', polarity: 'khong_ro_huong', choice: null }]);
});

test('R-RV04: round counted mass to nine places before applying unclear and keep thresholds', () => {
  const book = parseLabelCodebook(pinnedText);
  const cases = [
    { yes: 0.4999999994, rows: [] },
    { yes: 0.4999999996, rows: [{ theme_code: 'T-GIA', p_yes: 0.5, status: 'unclear', polarity: 'khong_ro_huong', choice: null }] },
    { yes: 0.6999999994, rows: [{ theme_code: 'T-GIA', p_yes: 0.699999999, status: 'unclear', polarity: 'khong_ro_huong', choice: null }] },
    { yes: 0.6999999996, rows: [{ theme_code: 'T-GIA', p_yes: 0.7, status: 'kept', polarity: 'khong_ro_huong', choice: null }] },
  ];
  for (const { yes, rows } of cases) {
    assert.deepEqual(labelRows(book, new Map([['T-GIA', {
      KHEN: yes / 2, CHE: yes / 2, HAI: 0, KE: 0, CHUA_DANHGIA: 0, KHONG_NHAC: 1 - yes,
    }]])), rows, String(yes));
  }
});

test('R-RV04: direction ties use option order, not probability-object insertion order or fixed polarity keys', () => {
  const book = parseLabelCodebook(pinnedText);
  assert.deepEqual(labelRows(book, new Map([['T-GIA', {
    CHE: 0.5, KHEN: 0.5, HAI: 0, KE: 0, CHUA_DANHGIA: 0, KHONG_NHAC: 0,
  }]])), [{ theme_code: 'T-GIA', p_yes: 1, status: 'kept', polarity: 'khen', choice: 'KHEN' }]);
  assert.deepEqual(labelRows(book, new Map([['T-PHANUNG', {
    PHU_DINH: 0.5, CO: 0.5, HAI: 0, KHONG_NHAC: 0,
  }]])), [{ theme_code: 'T-PHANUNG', p_yes: 1, status: 'kept', polarity: 'che', choice: 'CO' }]);
});

test('R-RV05: normal counted mass takes precedence over the wait exception at the unclear boundary', () => {
  const book = parseLabelCodebook(pinnedText);
  assert.deepEqual(labelRows(book, new Map([['T-CONGDUNG', {
    KHEN: 0.5, CHE: 0, HAI: 0, KE: 0, CHUA_DANHGIA: 0.5, KHONG_NHAC: 0,
  }]])), [{ theme_code: 'T-CONGDUNG', p_yes: 0.5, status: 'unclear', polarity: 'khen', choice: 'KHEN' }]);
});

test('R-RV05: the wait exception follows book.waitTheme and rounds its probability', () => {
  const definition = freshBook();
  definition.waitTheme = 'T-GIA';
  const book = parseLabelCodebook(JSON.stringify(definition));
  assert.deepEqual(labelRows(book, new Map([
    ['T-CONGDUNG', { KHEN: 0, CHE: 0, HAI: 0, KE: 0, CHUA_DANHGIA: 0.9, KHONG_NHAC: 0.1 }],
    ['T-GIA', { KHEN: 0, CHE: 0, HAI: 0, KE: 0, CHUA_DANHGIA: 0.9000000004, KHONG_NHAC: 0.0999999996 }],
  ])), [{ theme_code: 'T-GIA', p_yes: 0.9, status: 'unclear', polarity: 'khong_ro_huong', choice: 'CHUA_DANHGIA' }]);
});

test('R-RV06: LOC and CHE use the exact pinned instructions, criteria and three-line state', () => {
  const cases = [
    { input: { productName: 'Sản phẩm giả lập 🧪', text: ' Tốt ', attributesJson: '["Công dụng: ok","Mùi: nhẹ"]' },
      state: 'Sản phẩm đang được đánh giá: Sản phẩm giả lập 🧪\nLời viết: Tốt\nCác mục khách điền, gồm tên mục và câu trả lời: Công dụng: ok; Mùi: nhẹ' },
    { input: { productName: null, text: null, attributesJson: null },
      state: 'Sản phẩm đang được đánh giá: không rõ\nLời viết: (trống)\nCác mục khách điền, gồm tên mục và câu trả lời: (trống)' },
    { input: { productName: '', text: ' \t ', attributesJson: '[]' },
      state: 'Sản phẩm đang được đánh giá: không rõ\nLời viết: (trống)\nCác mục khách điền, gồm tên mục và câu trả lời: (trống)' },
  ];
  for (const { input, state } of cases) {
    assert.deepEqual(reviewFilterQuestions(input), [
      { id: 'LOC', state, ...filterText.LOC }, { id: 'CHE', state, ...filterText.CHE },
    ]);
  }
});

test('R-RV06: punctuation removal applies to text while the existing attribute rule stays intact', () => {
  assert.equal(hasReviewContent(' \t.，—!?\u0000\u200b', null), false);
  assert.equal(hasReviewContent('.', '[":"]'), false);
  assert.equal(hasReviewContent('.', '["."]'), true, 'punctuation is still content in an attribute');
  assert.equal(hasReviewContent('+', null), true, 'Unicode symbols are content');
});
