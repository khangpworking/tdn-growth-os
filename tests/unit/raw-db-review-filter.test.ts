import assert from 'node:assert/strict';
import test from 'node:test';
import {
  decideReviewFilter, hasReviewContent, reviewFilterEnabled, reviewFilterQuestions,
} from '../../src/modules/raw-db/review-filter.js';

// Independent expected decisions from R-RF05. Negative control: remove the complaint
// guard; "complaint at exactly 0.50" must fail with EXCLUDE instead of UNRESOLVED.
// Other area controls: restore the old colon branch -> R-RF03 feedback before the colon;
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

test('R-RF03 hasReviewContent: visible feedback before a colon is content', () => {
  const cases = [
    { name: 'SQL nulls', text: null, attrs: null, content: false },
    { name: 'whitespace and invisible characters', text: ' \t\r\n\u00a0\u200b\u200c\u200d\u2060\ufeff', attrs: null, content: false },
    { name: 'blank items and a colon', text: '', attrs: '[""," ",":"]', content: false },
    { name: 'invisible items and fullwidth colon', text: null, attrs: '["\\u115f\\u1160\\u2800：\\u3164\\uffa0\\u200b\\u2060"]', content: false },
    { name: 'Dùng bị ngứa: has visible feedback before the colon', text: '', attrs: '["Dùng bị ngứa:"]', content: true },
    { name: 'prompt prefixes count as content', text: '', attrs: '["Công dụng: ","Đối tượng sử dụng:"]', content: true },
    { name: 'visible prefix with invisible suffix', text: null, attrs: '["Công dụng: \\u200b\\u2060"]', content: true },
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
    state: 'Sản phẩm đang được đánh giá: Sản phẩm giả lập 🧪\nLời viết: Nắp thử nghiệm.\nCác mục khách điền, gồm tên mục và câu trả lời: Vị: dịu; Hộp thử' },
    { input: { productName: null, text: null, attributesJson: null },
      state: 'Sản phẩm đang được đánh giá: không rõ\nLời viết: (trống)\nCác mục khách điền, gồm tên mục và câu trả lời: (trống)' },
    { input: { productName: '', text: ' \t ', attributesJson: '{"ghiChu":"mẫu"}' },
      state: 'Sản phẩm đang được đánh giá: không rõ\nLời viết: (trống)\nCác mục khách điền, gồm tên mục và câu trả lời: {"ghiChu":"mẫu"}' },
  ];
  for (const { input, state } of cases) {
    assert.deepEqual(reviewFilterQuestions(input), [
      { id: 'LOC', state,
        instructions: 'Nội dung có liên quan đến sản phẩm hoặc đơn hàng đang được đánh giá không? Đọc cả lời viết và các mục khách điền. Các mục dạng «Tên mục: câu trả lời» có thể nằm ngay trong lời viết; vẫn tính đó là nội dung người mua cung cấp. Chỉ cần có một ý hiểu được và liên quan thì giữ, dù phần khác lạc đề. So sánh, sản phẩm dùng kết hợp và quà kèm có thể liên quan. Phản hồi ngắn, emoji, chưa dùng, chưa biết kết quả hoặc chưa nhận hàng vẫn có thể liên quan. Lời ngắn kiểu khẩu ngữ (tạm, cũng cũng) vẫn là phản hồi. Không xét lời viết thật hay giả. Không loại vì văn phong giống quảng cáo, nhận xu, lặp lời hoặc ngắn. Mô tả đúng sản phẩm vẫn được giữ.',
        criteria: {
          GIU: 'Có ý liên quan đến sản phẩm hoặc đơn hàng này',
          LOAI: 'Toàn bộ nội dung rõ ràng không liên quan, hoặc là chữ gõ bừa không đọc ra nghĩa',
          RIENG: 'Chưa đủ căn cứ phân biệt hai trường hợp trên',
        } },
      { id: 'CHE', state,
        instructions: 'Trong phần liên quan, người viết có nêu nhận xét bất lợi về sản phẩm hoặc đơn hàng này không? Phân biệt sản phẩm hiện tại với sản phẩm khác; tình trạng có sẵn với điều xảy ra khi dùng. Bệnh trạng trước dùng và việc chưa thể đánh giá không tự động là lời chê. Vẫn tính vấn đề đi kèm lời khen.',
        criteria: {
          CO: 'Có vấn đề hoặc nhận xét bất lợi được nêu rõ',
          KHONG: 'Không có nhận xét bất lợi',
          RIENG: 'Có thể có nhận xét bất lợi nhưng chưa xác định được ý nghĩa hoặc đối tượng',
        } },
    ]);
  }
});

test('R-RF08 reviewFilterEnabled: only the exact string true enables filtering', () => {
  for (const value of [undefined, 'false', 'TRUE', ' true ', '1', 'true']) {
    const environment = value === undefined ? {} : { TDN_RAW_DB_REVIEW_FILTER_ENABLED: value };
    assert.equal(reviewFilterEnabled(environment), value === 'true', String(value));
  }
});
