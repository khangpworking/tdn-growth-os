import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideReviewFilter, hasReviewContent, reviewFilterEnabled, reviewFilterQuestions,
} from '../../src/modules/raw-db/review-filter.js';

// Independent expected decisions from R-RF05. Negative control: remove the complaint
// guard; "complaint at exactly 0.50" must fail with EXCLUDE instead of UNRESOLVED.
// Other area controls: count an unanswered prompt as content -> R-RF03 table;
// add a star/group field to the state -> R-RF04 exact prompt; accept TRUE -> R-RF08 flag table.
const decisions = [
  { name: 'missing star guard precedes complaint', keep: 0.05, exclude: 0.90, unresolved: 0.05,
    complaint: 0.60, star: null, outcome: 'UNRESOLVED', reason: 'GUARD_NO_STAR' },
  { name: 'three-star guard precedes complaint', keep: 0.05, exclude: 0.90, unresolved: 0.05,
    complaint: 0.60, star: 3, outcome: 'UNRESOLVED', reason: 'GUARD_LOW_STAR' },
  { name: 'complaint at 0.60', keep: 0.05, exclude: 0.90, unresolved: 0.05,
    complaint: 0.60, star: 5, outcome: 'UNRESOLVED', reason: 'GUARD_COMPLAINT' },
  { name: 'complaint at exactly 0.50', keep: 0.20, exclude: 0.70, unresolved: 0.10,
    complaint: 0.50, star: 5, outcome: 'UNRESOLVED', reason: 'GUARD_COMPLAINT' },
  { name: 'exclude at exactly 0.70 with complaint 0.49', keep: 0.20, exclude: 0.70, unresolved: 0.10,
    complaint: 0.49, star: 4, outcome: 'EXCLUDE', reason: 'JEV_EXCLUDE' },
  { name: 'exclude below 0.70 is unresolved', keep: 0.201, exclude: 0.699, unresolved: 0.10,
    complaint: 0.10, star: 5, outcome: 'UNRESOLVED', reason: 'JEV_UNRESOLVED' },
  { name: 'keep wins a tie for largest', keep: 0.40, exclude: 0.20, unresolved: 0.40,
    complaint: 0.60, star: 1, outcome: 'KEEP', reason: 'JEV_KEEP' },
  { name: 'keep is largest', keep: 0.80, exclude: 0.10, unresolved: 0.10,
    complaint: 0.10, star: 5, outcome: 'KEEP', reason: 'JEV_KEEP' },
  { name: 'unresolved is largest', keep: 0.20, exclude: 0.10, unresolved: 0.70,
    complaint: 0.10, star: 5, outcome: 'UNRESOLVED', reason: 'JEV_UNRESOLVED' },
] as const;

for (const { name, outcome, reason, ...input } of decisions) {
  test(`R-RF05 decideReviewFilter: ${name}`, () => {
    assert.deepEqual(decideReviewFilter(input), { outcome, reason });
  });
}

test('R-RF03 hasReviewContent: only empty text and unanswered attributes are free', () => {
  const cases = [
    { name: 'SQL nulls', text: null, attrs: null, content: false },
    { name: 'whitespace and invisible characters', text: ' \t\r\n\u00a0\u200b\u200c\u200d\u2060\ufeff', attrs: null, content: false },
    { name: 'unanswered prompts', text: '', attrs: '["Công dụng: ","Đối tượng sử dụng:"]', content: false },
    { name: 'invisible answer is empty', text: null, attrs: '["Công dụng: \\u200b\\u2060"]', content: false },
    { name: 'short word', text: 'Đẹp', attrs: null, content: true },
    { name: 'short score', text: '10/10', attrs: null, content: true },
    { name: 'emoji', text: '👍', attrs: null, content: true },
    { name: 'attribute without a colon', text: null, attrs: '["nắp bị xước"]', content: true },
    { name: 'answered attribute', text: ' ', attrs: '["Công dụng:","Đóng gói: tốt"]', content: true },
  ];
  for (const row of cases) assert.equal(hasReviewContent(row.text, row.attrs), row.content, row.name);
});

test('R-RF04 reviewFilterQuestions: exact LOC/CHE wording, separate evidence fields and no star', () => {
  const cases = [
    { input: { productName: 'Sản phẩm giả lập 🧪', text: ' \nNắp thử nghiệm.\r\n ',
      attributesJson: '["Vị: dịu","Hộp thử"]' },
    state: 'Sản phẩm: Sản phẩm giả lập 🧪. Lời viết: Nắp thử nghiệm.. Phần khách điền: Vị: dịu; Hộp thử' },
    { input: { productName: null, text: null, attributesJson: null },
      state: 'Sản phẩm: không rõ. Lời viết: (trống). Phần khách điền: (trống)' },
    { input: { productName: '', text: ' \t ', attributesJson: '{"ghiChu":"mẫu"}' },
      state: 'Sản phẩm: không rõ. Lời viết: (trống). Phần khách điền: {"ghiChu":"mẫu"}' },
  ];
  for (const { input, state } of cases) {
    assert.deepEqual(reviewFilterQuestions(input), [
      { id: 'LOC', state,
        instructions: 'Phân loại đánh giá của người mua theo quan hệ với sản phẩm hoặc đơn hàng này. Tính là liên quan: nội dung nói về sản phẩm, giao hàng, đóng gói, shop hoặc giá; giao sai hàng; quà tặng kèm; combo; so sánh với hàng khác; ghi chú nhận xu đi kèm nội dung khác; lời rất ngắn như Ok, Tốt, Đẹp, 10/10 hoặc emoji, vì đó vẫn là phản hồi của người mua. Không đủ căn cứ thì không chọn LOAI. Không xét thật giả, đúng sai.',
        criteria: {
          GIU: 'Nói về sản phẩm hoặc đơn hàng này, hoặc là phản hồi ngắn của người mua',
          LOAI: 'Rõ ràng không liên quan đến sản phẩm và đơn hàng này: quảng cáo, tin nhắn, đoạn văn chép, đánh giá món hàng khác không liên hệ với đơn hàng, hoặc chữ vô nghĩa',
          RIENG: 'Không đủ thông tin để quyết định',
        } },
      { id: 'CHE', state,
        instructions: 'Người viết có nói điều gì không hài lòng, lỗi, thiếu, sai, hỏng, chưa thấy hiệu quả, hoặc phàn nàn về sản phẩm, đơn hàng, giao hàng hay shop không?',
        criteria: { CO: 'Có lời chê hoặc phàn nàn', KHONG: 'Không có lời chê hoặc phàn nàn' } },
    ]);
  }
});

test('R-RF08 reviewFilterEnabled: only the exact string true enables filtering', () => {
  for (const value of [undefined, 'false', 'TRUE', ' true ', '1', 'true']) {
    const environment = value === undefined ? {} : { TDN_RAW_DB_REVIEW_FILTER_ENABLED: value };
    assert.equal(reviewFilterEnabled(environment), value === 'true', String(value));
  }
});
