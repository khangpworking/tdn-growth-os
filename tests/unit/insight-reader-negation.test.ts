import assert from 'node:assert/strict';
import test from 'node:test';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';

const corpus = 'Chưa mã hóa nội dung; số dòng không phải số khách hàng, tỷ lệ chủ đề hay độ phủ toàn thị trường.';
const located = 'Không suy rộng thành số người, tỷ lệ dân số hay thị phần.';
const checks = (html: string, reportKind: 'INSIGHT' | 'MARKET' = 'INSIGHT') => lint(html, { reportKind });
const f5 = (html: string) => checks(html).find(row => row.rule.startsWith('F5 '))!.ok;
const w4 = (html: string) => checks(html).find(row => row.rule.startsWith('W4 '))!.ok;

test('separate sentence, clause, line and block claims cannot inherit a preceding unrelated negation', () => {
  for (const term of ['toàn thị trường', 'thị phần', 'quy mô thị trường']) {
    for (const separator of ['. ', '; ', '! ', '? ', '\n', '\r\n', ', nhưng ', ', tuy nhiên ', ', song ', ', but ', ', however ', '</p><p>', '</div><div>', '</blockquote><blockquote>', '<br>', '<hr>']) {
      const html = `<p>Nguồn này không đủ${separator}Đây là ${term}.</p>`;
      assert.equal(f5(html), false, html);
      if (term === 'thị phần') assert.equal(w4(html), false, html);
    }
    assert.equal(f5(`<p>Nguồn này không đủ, đây là ${term}.</p>`), false);
    assert.equal(f5(`<p>Không có dữ liệu; đây là ${term}.</p>`), false);
  }
});

test('exact retained disclaimers and direct scope limitations stay eligible without allowing changed claims', () => {
  for (const text of [corpus, located, 'Đây không phải toàn thị trường.', 'Đây chưa phải thị phần.',
    'Không đại diện cho toàn thị trường.', 'Chưa có bằng chứng về thị phần.',
    'bản ghi định vị không phải số người, mức phổ biến, quy mô thị trường hay tác động nhân quả']) {
    assert.equal(f5(`<p>${text}</p>`), true, text); assert.equal(w4(`<p>${text}</p>`), true, text);
  }
  for (const text of [corpus, located]) {
    assert.equal(f5(`<p>${text}</p><p>Đây là toàn thị trường.</p>`), false);
    assert.equal(w4(`<p>${text}</p><p>Đây là thị phần.</p>`), false);
    assert.equal(f5(`<p>${text.replace('không phải', 'chính là').replace('Không suy rộng', 'Suy rộng')}</p>`), false);
  }
  for (const separator of ['\n', '</p><p>', '<br>']) {
    assert.equal(f5(`<p>${corpus.replace(' toàn thị trường', `${separator}toàn thị trường`)}</p>`), false);
    assert.equal(w4(`<p>${located.replace(' thị phần', `${separator}thị phần`)}</p>`), false);
  }
  assert.equal(f5(`<p>${corpus.replace('toàn thị trường', 'thị phần')}</p>`), false);
  assert.equal(f5(`<p>${corpus.replace('toàn thị trường', 'quy mô thị trường')}</p>`), false);
});

test('source quotes and invisible assets stay inert, while titles and provider names retain their gates', () => {
  assert.equal(f5('<p data-quote>Nguồn này không đủ. Đây là toàn thị trường.</p>'), true);
  assert.equal(w4('<td data-quote>Đây là thị phần.</td>'), true);
  assert.equal(f5('<style>\n/* toàn thị trường */\n</style><script>\n"thị phần";\n</script><svg><text>quy mô thị trường</text></svg>'), true);
  assert.equal(f5('<title>Nguồn này không đủ. Đây là toàn thị trường.</title>'), false);
  assert.equal(checks('<p data-quote>Kalodata: toàn thị trường.</p>').find(row => row.rule.startsWith('F1 '))!.ok, false);
});

test('historical Market and default gating keep the original preceding-negation behavior', () => {
  for (const term of ['toàn thị trường', 'thị phần']) {
    const html = `<p>Nguồn này không đủ. Đây là ${term}.</p>`;
    const market = checks(html, 'MARKET');
    assert.equal(market.find(row => row.rule.startsWith('F5 '))!.ok, true);
    assert.equal(market.find(row => row.rule.startsWith('W4 '))!.ok, true);
    assert.deepEqual(lint(html), market);
    assert.equal(f5(html), false);
    if (term === 'thị phần') assert.equal(w4(html), false);
  }
  assert.equal(checks(`<p>${corpus}</p>`, 'MARKET').find(row => row.rule.startsWith('F5 '))!.ok, false);
});
