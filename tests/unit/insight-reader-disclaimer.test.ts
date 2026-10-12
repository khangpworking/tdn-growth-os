import assert from 'node:assert/strict';
import test from 'node:test';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';

const disclaimer = 'Chưa mã hóa nội dung; số dòng không phải số khách hàng, tỷ lệ chủ đề hay độ phủ toàn thị trường.';
const f5 = (html: string, reportKind: 'INSIGHT' | 'MARKET' = 'INSIGHT') =>
  lint(html, { reportKind }).find(check => check.rule.startsWith('F5 '))!;

test('retained corpus coverage limitation is admitted only by the Insight reader gate', () => {
  const html = `<section id="I03"><p>${disclaimer}</p></section><section id="I17"><p>${disclaimer}</p></section>`;
  assert.equal(f5(html).ok, true);
  assert.equal(f5(html, 'MARKET').ok, false);
  assert.deepEqual(lint(html), lint(html, { reportKind: 'MARKET' }));
});

test('a retained limitation cannot authorize another whole-market or market-share assertion', () => {
  for (const claim of ['Đây là toàn thị trường.', 'Đây là quy mô thị trường.', 'Đây là thị phần.']) {
    assert.equal(f5(`<p>${claim}</p>`).ok, false, claim);
    assert.equal(f5(`<p>${disclaimer}</p><p>${claim}</p>`).ok, false, claim);
    assert.equal(f5(`<p>Không có dữ liệu được xác minh cho câu trước.</p><p>Phát biểu tiếp theo giữ riêng phạm vi: ${claim}</p>`).ok, false, claim);
    assert.equal(f5(`<p>${disclaimer.replace('không phải', 'chính là')}</p>`).ok, false);
  }
  for (const term of ['thị phần', 'quy mô thị trường']) {
    const changed = `<p>${disclaimer.replace('toàn thị trường', term)}</p>`;
    assert.equal(f5(changed).ok, false, 'a different claim is not the retained corpus limitation');
  }
});

test('quoted source wording remains inert while an affirmative report title is checked', () => {
  assert.equal(f5('<table><tr><td data-quote>Đây là toàn thị trường.</td></tr></table>').ok, true);
  assert.equal(f5('<title>Đây là toàn thị trường.</title>').ok, false);
  const providerQuote = lint('<table><tr><td data-quote>Theo Kalodata: toàn thị trường.</td></tr></table>', { reportKind: 'INSIGHT' });
  assert.equal(providerQuote.find(check => check.rule.startsWith('F1 '))!.ok, false);
});
