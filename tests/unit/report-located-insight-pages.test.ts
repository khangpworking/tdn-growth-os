import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { locatedInsightPackageFixture } from '../helpers/located-insight-package-fixture.js';

// This boundary owns safe readable HTML and ratio admission in the view. Method
// tests own arithmetic; report integration owns retention and artifact links.
// Dropped escaping, omitted full context, authenticated-review wording or an
// unconditional ratio projection would regress these public rendering behaviors.
test('located quote HTML keeps literal source context and does not turn imported review into approval', () => {
  const { descriptor } = locatedInsightPackageFixture();
  const attribution = 'Nguồn giả lập <img src="x" onerror="alert(1)">';
  descriptor.records[0]!.sourceAttribution = attribution;
  descriptor.i04[0]!.provenance = {
    basis: 'HUMAN_REVIEWED', coderRole: 'Người rà soát theo tệp nhập',
    adjudication: 'Khai báo đã rà soát trong tệp nhập', disagreement: null,
  };
  const { output } = buildLocatedInsightMethods(descriptor);
  const html = renderLocatedInsightSection(output, 'I04');
  assert.ok(html);
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    assert.equal(document.querySelector('q')?.textContent, 'mua A');
    assert.equal(document.querySelectorAll('script, img, [onerror]').length, 0);
    const quoteRow = document.querySelector('tbody tr');
    assert.ok(quoteRow);
    assert.ok(quoteRow.textContent?.includes(attribution));
    const contextLink = quoteRow.querySelector<HTMLAnchorElement>('a[href^="#"]');
    assert.ok(contextLink);
    const context = document.getElementById(contextLink.getAttribute('href')!.slice(1));
    assert.ok(context, 'the quote must lead to a real original-record disclosure');
    assert.equal(context.tagName, 'DETAILS');
    assert.equal(context.querySelector('div')?.textContent, descriptor.records[0]!.text);
    assert.ok(context.textContent?.includes('/records/0/text'));
    assert.ok(context.textContent?.includes(descriptor.records[0]!.sourceSha256));
    // Page numbering is 1-based while method pointers are 0-based; the page must say so.
    assert.equal(context.querySelector('summary')?.textContent?.startsWith('Bản ghi 1:'), true);
    assert.ok([...document.querySelectorAll('p')].some(paragraph => paragraph.textContent?.includes('Bản ghi N ứng với chỉ số N − 1')));
    const limits = [...document.querySelectorAll('ul.limits li')];
    assert.deepEqual(limits.filter(item => item.querySelector('code')).map(item => item.querySelector('code')!.textContent),
      [...output.sections.I04.blockers, ...output.limitations]);
    assert.ok(limits.some(item => item.querySelector('code + small')?.textContent), 'internal codes need a Vietnamese gloss beside the raw code');
    const provenance = quoteRow.querySelector('details');
    assert.ok(provenance);
    assert.ok(provenance.textContent?.includes('Hồ sơ khai báo đã được người rà soát'));
    assert.ok(provenance.textContent?.includes('chưa được xác thực thành phê duyệt'));
  } finally {
    dom.window.close();
  }
});

test('I10 count table displays complete n/N and withholds it while coding is pending', () => {
  const { descriptor } = locatedInsightPackageFixture();
  for (const complete of [true, false]) {
    descriptor.corpora[0]!.dispositions[2]!.state = complete ? 'UNCODED' : 'PENDING';
    const { output } = buildLocatedInsightMethods(descriptor);
    const html = renderLocatedInsightSection(output, 'I10');
    assert.ok(html);
    const dom = new JSDOM(html);
    try {
      const document = dom.window.document;
      const table = [...document.querySelectorAll('table')].find(candidate =>
        [...candidate.querySelectorAll('thead th')].some(cell => cell.textContent === 'n/N trong tập này'));
      assert.ok(table, 'the corpus counts need a labelled ratio column');
      const firstCode = table.querySelector('tbody tr');
      assert.ok(firstCode);
      assert.ok(firstCode.querySelector('th[scope="row"]')?.textContent?.includes('Dễ nuốt'));
      assert.equal(firstCode.children[2]?.textContent, complete ? '2/3' : 'Chưa công bố');
      if (!complete) {
        assert.ok([...table.querySelectorAll('tbody tr')].every(row => row.children[2]?.textContent === 'Chưa công bố'));
        const pendingNotice = [...document.querySelectorAll('p')].find(paragraph =>
          paragraph.textContent?.includes('1 bản ghi đang chờ mã hóa hoặc phân xử'));
        assert.ok(pendingNotice, 'pending coverage must be visible outside collapsed details');
        assert.equal(pendingNotice.closest('details'), null);
      }
    } finally {
      dom.window.close();
    }
  }
});
