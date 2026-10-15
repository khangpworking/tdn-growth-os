// Seeded L9 list errors E01–E15 from the 15/10 ontology deep test (lane L7),
// expressed in the l9-keyword-data-v1 contract. Each case must fail closed in
// checkData before any record is counted. The RDF model linked every exclusion
// to a concept; v1 has no such link, so E06 maps to the reason (the only text
// that says what an exclusion means) and E07 stays a todo until a contract v2
// carries the link.
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  filterKeywordMeanings,
  KEYWORD_MEANING_FILTER_DATA_CONTRACT,
  KeywordMeaningFilterInputError,
  type KeywordMeaningFilterData,
} from '../../src/modules/analysis/keyword-meaning-filter.js';

type Category = 'thachdua' | 'quatdien' | 'sonmoi';

function baseline(): Record<Category, KeywordMeaningFilterData> {
  const data = (category: string, keywords: string[], exclusions: [string, string][]): KeywordMeaningFilterData => ({
    contractVersion: KEYWORD_MEANING_FILTER_DATA_CONTRACT, dataVersion: `l9-seed-${category}-v1`, category,
    provenance: 'MODEL_DRAFTED', keywords: keywords as [string, ...string[]],
    exclusions: exclusions.map(([term, reason]) => ({ term, reason })),
  });
  return {
    thachdua: data('thạch dừa', ['thạch dừa', 'thạch dừa lên men'], [
      ['thạch dứa', 'Thạch làm từ dứa, khác thạch dừa'],
      ['thạch rau câu nước dừa', 'Rau câu pha nước dừa, không phải thạch dừa'],
      ['thử thách', 'Từ thử thách, không phải sản phẩm'],
    ]),
    quatdien: data('quạt điện', ['quạt điện', 'quạt đứng'], [
      ['quạt cầm tay', 'Quạt mini cầm tay, phân khúc khác'],
      ['quạt điều hòa', 'Quạt hơi nước, ngành khác'],
    ]),
    sonmoi: data('son môi', ['son môi', 'son kem lì'], [
      ['son dưỡng', 'Son dưỡng không màu, khác son môi'],
      ['sơn móng tay', 'Sơn móng, không phải son môi'],
    ]),
  };
}

function rejects(category: Category, mutate: (data: KeywordMeaningFilterData) => void, message: RegExp): void {
  const data = baseline()[category];
  mutate(data);
  assert.throws(() => filterKeywordMeanings(data, []), (error: unknown) =>
    error instanceof KeywordMeaningFilterInputError && message.test(error.message));
}

const nfd = (text: string) => text.normalize('NFD');
const BOTH = /both keyword and exclusion/;
const INSIDE = /is inside keyword/;
const NOT_NFC = /not NFC-normalized/;
const DIACRITICS = /differ only by diacritics|lost the diacritics/;
const SCHEMA = /canonical schema validation/;
const DUPLICATE = /duplicate keyword/;

test('baseline lists with marked look-alike exclusions pass and keep thạch dừa included', () => {
  const lists = baseline();
  for (const data of Object.values(lists)) assert.doesNotThrow(() => filterKeywordMeanings(data, []));
  const result = filterKeywordMeanings(lists.thachdua, [
    { recordId: 'r-1', text: 'Thạch dừa An Nhiên' },
    { recordId: 'r-2', text: 'thạch dứa đóng hộp' },
  ]);
  assert.deepEqual(result.results.map(row => row.decision), ['INCLUDED', 'EXCLUDED']);
  // An exclusion that contains a keyword is narrower than the keyword, not wider.
  const narrower = baseline().thachdua;
  narrower.exclusions.push({ term: 'thạch dừa giả', reason: 'Hàng giả, không tính' });
  assert.doesNotThrow(() => filterKeywordMeanings(narrower, []));
});

test('E01 keyword equals exclusion (exact)', () => {
  rejects('thachdua', data => { data.keywords.push('thạch dứa'); }, BOTH);
});

test('E02 keyword equals exclusion (case variant)', () => {
  rejects('quatdien', data => { data.keywords.push('Quạt Cầm Tay'); }, BOTH);
});

test('E03 keyword stored NFD', () => {
  rejects('thachdua', data => { data.keywords[0] = nfd('thạch dừa'); }, NOT_NFC);
});

test('E04 NFD exclusion hides an overlap with an NFC keyword', () => {
  rejects('sonmoi', data => { data.exclusions.push({ term: nfd('son kem lì'), reason: 'Lỗi gieo: trùng từ khoá' }); }, NOT_NFC);
  // The same overlap typed in NFC is still caught as an overlap.
  rejects('sonmoi', data => { data.exclusions.push({ term: 'son kem lì', reason: 'Lỗi gieo: trùng từ khoá' }); }, BOTH);
});

test('E05 keyword with stripped diacritics (thach dua beside thạch dừa)', () => {
  rejects('thachdua', data => { data.keywords.push('thach dua'); }, DIACRITICS);
});

test('E06 exclusion that does not say what it denotes (v1: blank reason)', () => {
  rejects('quatdien', data => { data.exclusions[0] = { term: 'quạt cầm tay', reason: '   ' }; }, SCHEMA);
});

test('E07 exclusion that denotes a non-confusable concept', { todo: 'needs an exclusion concept link (l9-keyword-data v2)' }, () => {
  rejects('thachdua', data => { data.exclusions.push({ term: 'quạt mini', reason: 'Lỗi gieo: khác ngành hoàn toàn' }); }, /confusable/);
});

test('E08 exclusion that denotes the target itself (son moi in the son môi list)', () => {
  rejects('sonmoi', data => { data.exclusions.push({ term: 'son moi', reason: 'Lỗi gieo: chính là từ khoá' }); }, DIACRITICS);
});

test('E09 exclusion missing reason', () => {
  rejects('quatdien', data => { delete (data.exclusions[1] as { reason?: string }).reason; }, SCHEMA);
});

test('E10 exclusion inside a keyword swallows every match (dừa)', () => {
  rejects('thachdua', data => { data.exclusions.push({ term: 'dừa', reason: 'Lỗi gieo: quá rộng' }); }, INSIDE);
});

test('E11 duplicate keyword (case variant)', () => {
  rejects('sonmoi', data => { data.keywords.push('Son Môi'); }, DUPLICATE);
});

test('E12 typo field on the list (exlusions)', () => {
  rejects('sonmoi', data => { Object.assign(data, { exlusions: [] }); }, SCHEMA);
});

test('E13 typo field on an exclusion entry', () => {
  rejects('quatdien', data => { Object.assign(data.exclusions[0]!, { kind: 'Exclusoin' }); }, SCHEMA);
});

test('E14 empty keyword', () => {
  rejects('quatdien', data => { data.keywords.push(''); }, SCHEMA);
});

test('E15 confusable label drafted as a keyword (thạch dứa beside thạch dừa)', () => {
  rejects('thachdua', data => { data.keywords.push('thạch dứa'); data.exclusions.shift(); }, DIACRITICS);
});
