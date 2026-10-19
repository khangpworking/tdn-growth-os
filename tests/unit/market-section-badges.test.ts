import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { describeDescriptiveSection } from '../../src/modules/analysis/research-automation/descriptive-report.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { badgeEvent, badgeProducts, sectionBadgeInput, withBadgeMethods } from '../helpers/market-section-badges-fixture.js';

const partialNote = 'Các dòng trong bảng chỉ là ngày ra mắt do nguồn khai báo, không phải động lực hay rủi ro.';
const text = (node: Element) => node.textContent!.replace(/\s+/gu, ' ').trim();

function inspect(input: AutomationReportInput, check: (reader: Document, trace: Document) => void): void {
  const report = buildResearchAutomationReport(input, 'MARKET');
  const reader = new JSDOM(report.html.toString()), trace = new JSDOM(report.traceHtml!.toString());
  try { check(reader.window.document, trace.window.document); }
  finally { reader.window.close(); trace.window.close(); }
}
function section(doc: Document, id: string): Element {
  const node = doc.querySelector(`#${id}`);
  assert.ok(node, `${id} is delivered`);
  return node;
}
const badge = (doc: Document, id: string) => section(doc, id).querySelector('.state')?.textContent;
const gap = (doc: Document, id: string) => section(doc, id).querySelector('.state')?.getAttribute('data-section-gap');

test('M06 trade table and both macro charts alone are national background', async () => {
  inspect(await sectionBadgeInput('background'), (reader, trace) => {
    assert.equal(badge(reader, 'M06'), 'Chỉ có số liệu nền cả nước');
    for (const doc of [reader, trace]) {
      const supply = section(doc, 'M06');
      assert.equal(supply.querySelectorAll('table[data-exhibit-scope="national"]').length, 1);
      assert.equal(supply.querySelectorAll('figure.market-chart[data-exhibit-scope="national"]').length, 2);
      assert.equal(supply.querySelectorAll('table:not([data-exhibit-scope]), figure:not([data-exhibit-scope])').length, 0);
      assert.match(text(supply), doc === reader ? /Bảng 6\.1/u : /Bảng 6\.2/u);
    }
    assert.equal(gap(trace, 'M06'), '1');
  });
});

test('M06 usable supply rows plus national trade exhibits have product data', async () => {
  inspect(await sectionBadgeInput('observed'), (reader, trace) => {
    assert.equal(badge(reader, 'M06'), 'Có số liệu');
    assert.ok(section(reader, 'M06').querySelector('table:not([data-exhibit-scope])'));
    assert.equal(section(reader, 'M06').querySelectorAll('[data-exhibit-scope="national"]').length, 3);
    assert.equal(gap(trace, 'M06'), null);
  });
});

test('M05 tables 5.3, 5.4, 5.5 and macro charts alone are national background', async () => {
  const { descriptiveMethods: _methods, ...input } = await sectionBadgeInput('background');
  inspect(input, (reader, trace) => {
    assert.equal(badge(reader, 'M05'), 'Chỉ có số liệu nền cả nước');
    for (const doc of [reader, trace]) {
      const demand = section(doc, 'M05');
      for (const exhibit of doc === reader ? ['Bảng 5.1', 'Bảng 5.2', 'Bảng 5.3'] : ['Bảng 5.3', 'Bảng 5.4', 'Bảng 5.5']) {
        const label = [...demand.querySelectorAll('.exn')].find(node => text(node) === exhibit);
        assert.ok(label, exhibit);
        assert.equal(label.closest('.table-wrap')!.querySelector('table')!.getAttribute('data-exhibit-scope'), 'national');
      }
      assert.equal(demand.querySelectorAll('figure.market-chart[data-exhibit-scope="national"]').length, 2);
      assert.equal(demand.querySelectorAll('table:not([data-exhibit-scope]), figure:not([data-exhibit-scope])').length, 0);
    }
  });
});

test('M05 search-interest figure counts as data alongside national background', async () => {
  const { descriptiveMethods: _methods, ...background } = await sectionBadgeInput('background');
  const observed = await sectionBadgeInput('observed');
  inspect({ ...background, collection: { ...background.collection!, searchInterest: observed.collection!.searchInterest! },
    searchInterestChart: observed.searchInterestChart! }, reader => {
    assert.equal(badge(reader, 'M05'), 'Có số liệu');
    assert.ok(section(reader, 'M05').querySelector('figure:not([data-exhibit-scope])'));
    assert.equal(section(reader, 'M05').querySelectorAll('table:not([data-exhibit-scope])').length, 0);
  });
});

test('M07 ranking chart 7.1 with no usable peers has only partial data', async () => {
  inspect(await sectionBadgeInput('background'), (reader, trace) => {
    assert.equal(badge(reader, 'M07'), 'Có một phần số liệu');
    assert.match(text(section(reader, 'M07').querySelector('figure')!), /Hình 7\.1/u);
    assert.equal(gap(trace, 'M07'), '1');
    assert.equal(gap(reader, 'M07'), null, 'delivery consumes the state marker');
  });
});

test('M07 usable peers retain the data badge without a gap', async () => {
  inspect(await sectionBadgeInput('observed'), (reader, trace) => {
    assert.equal(badge(reader, 'M07'), 'Có số liệu');
    assert.equal(gap(trace, 'M07'), null);
    assert.ok(section(reader, 'M07').querySelector('table'));
  });
});

test('M09 launch-only rows have dated title, platform, partial note and partial badge', async () => {
  const input = await sectionBadgeInput('background');
  inspect(input, (reader, trace) => {
    const events = section(reader, 'M09');
    assert.equal(events.querySelector('caption')!.textContent, 'Bảng 9.1: Sự kiện do nguồn nêu, từ 01/01/2026 đến 30/01/2026');
    assert.deepEqual([...events.querySelectorAll('thead th')].map(text), ['Sản phẩm', 'Sàn', 'Sự kiện', 'Ngày', 'Nguồn']);
    assert.equal(events.querySelector('tbody td')!.textContent, badgeProducts.background.title);
    assert.equal(text(events.querySelector('tbody td:nth-child(2)')!), 'TikTok Shop');
    assert.ok(text(events).includes(partialNote));
    assert.equal(badge(reader, 'M09'), 'Có một phần số liệu');
    assert.equal(gap(trace, 'M09'), '1');
  });
  const view = describeDescriptiveSection(input.descriptiveMethods!, 'M09', { mark: () => '[1]' }, true,
    { market14: true, requestedPeriod: input.start.requestedPeriod });
  assert.equal(view.partial, true);
});

test('M09 one in-period non-launch statement removes the partial classification', async () => {
  inspect(await sectionBadgeInput('observed'), (reader, trace) => {
    assert.equal(badge(reader, 'M09'), 'Có số liệu');
    assert.equal(gap(trace, 'M09'), null);
    assert.equal(section(reader, 'M09').querySelectorAll('tbody tr').length, 2);
    assert.equal(section(reader, 'M09').querySelector('q')!.textContent, 'Nguồn ghi nhận một đợt thay đổi bao bì trong kỳ.');
    assert.equal(text(section(reader, 'M09')).includes(partialNote), false);
  });
});

test('M09 an unrecognised product reference does not guess its platform', async () => {
  const input = await sectionBadgeInput('empty');
  inspect(withBadgeMethods(input, { m09: [badgeEvent(badgeProducts.empty.ref, '2026-01-10'), badgeEvent(badgeProducts.background.ref, '2026-01-15')] }), reader => {
    assert.deepEqual([...section(reader, 'M09').querySelectorAll('tbody td:nth-child(2)')].map(text), ['Chưa rõ sàn', 'TikTok Shop']);
  });
});

test('M09 can deliver a table whose only event has an unrecognised platform', async () => {
  const input = await sectionBadgeInput('empty');
  inspect(withBadgeMethods(input, { m09: [badgeEvent(badgeProducts.empty.ref, '2026-01-10')] }), reader => {
    const events = section(reader, 'M09');
    assert.deepEqual([...events.querySelectorAll('thead th')].map(text), ['Sản phẩm', 'Sự kiện', 'Ngày', 'Nguồn']);
    assert.equal(events.querySelectorAll('tbody tr').length, 1);
    assert.equal(events.querySelectorAll('tbody tr td').length, 4);
    assert.equal(text(events.querySelector('tbody td:nth-child(2)')!), 'Ngày ra mắt do nguồn khai báo');
    assert.equal(text(events.querySelector('tbody td:nth-child(3)')!), '10/01/2026');
    assert.equal(text(events).includes('Chưa rõ sàn'), false);
  });
});

test('M09 a mixed table keeps the platform column when a recognised event comes first', async () => {
  const input = await sectionBadgeInput('empty');
  inspect(withBadgeMethods(input, { m09: [badgeEvent(badgeProducts.background.ref, '2026-01-10'), badgeEvent(badgeProducts.empty.ref, '2026-01-15')] }), reader => {
    const events = section(reader, 'M09');
    assert.deepEqual([...events.querySelectorAll('thead th')].map(text), ['Sản phẩm', 'Sàn', 'Sự kiện', 'Ngày', 'Nguồn']);
    assert.deepEqual([...events.querySelectorAll('tbody td:nth-child(2)')].map(text), ['TikTok Shop', 'Chưa rõ sàn']);
    assert.deepEqual([...events.querySelectorAll('tbody tr')].map(row => row.querySelectorAll('td').length), [5, 5]);
    assert.deepEqual([...events.querySelectorAll('tbody td:nth-child(4)')].map(text), ['10/01/2026', '15/01/2026']);
  });
});

for (const [name, dates, wording] of [
  ['before-only', ['2025-12-31'], 'trước 01/01/2026'],
  ['after-only', ['2026-01-31'], 'sau 30/01/2026'],
  ['both', ['2025-12-31', '2026-01-31'], 'trước 01/01/2026 hoặc sau 30/01/2026'],
] as const) test(`M09 omitted dates: ${name}`, async () => {
  const input = await sectionBadgeInput('background'), ref = badgeProducts.background.ref;
  inspect(withBadgeMethods(input, { m09: [badgeEvent(ref, '2026-01-15'), ...dates.map(date => badgeEvent(ref, date, true))] }), (reader, trace) => {
    const events = section(reader, 'M09');
    assert.equal([...events.querySelectorAll('p')].map(text).find(line => line.startsWith('Đã lược bỏ')),
      `Đã lược bỏ các sự kiện có ngày ${wording}, ngoài kỳ báo cáo.`);
    assert.equal(events.querySelectorAll('tbody tr').length, 1);
    assert.equal(badge(reader, 'M09'), 'Có một phần số liệu', 'out-of-period statements cannot fill the gap');
    assert.equal(gap(trace, 'M09'), '1');
  });
});

test('M09 includes both report boundary dates and omits undated rows', async () => {
  const input = await sectionBadgeInput('background'), ref = badgeProducts.background.ref;
  inspect(withBadgeMethods(input, { m09: ['2026-01-01', '2026-01-30', null].map(date => badgeEvent(ref, date)) }), reader => {
    const events = section(reader, 'M09');
    assert.deepEqual([...events.querySelectorAll('tbody td:nth-child(4)')].map(text), ['01/01/2026', '30/01/2026']);
    assert.equal(badge(reader, 'M09'), 'Có một phần số liệu');
  });
});

test('M09 empty third product has a dated empty state and no event table', async () => {
  inspect(await sectionBadgeInput('empty'), (reader, trace) => {
    const events = section(reader, 'M09');
    assert.ok(text(events).includes('Chưa đủ dữ liệu về sự kiện từ 01/01/2026 đến 30/01/2026.'));
    assert.equal(events.querySelector('table'), null);
    assert.equal(badge(reader, 'M09'), 'Chưa đủ dữ liệu');
    assert.equal(gap(trace, 'M09'), '1');
  });
});

const excerpt = { sourceSha256: 'a'.repeat(64), page: 3, text: 'Tài liệu giả lập nêu thay đổi về bao bì.', label: 'Tài liệu giả lập, trang 3' };
for (const [name, enabled, excerpts, expectedGap] of [
  ['enabled excerpts', true, [excerpt], null],
  ['disabled excerpts', false, [excerpt], '1'],
  ['enabled but empty excerpts', true, [], '1'],
] as const) test(`M09 launch-only PDF evidence gate: ${name}`, async () => {
  const input = await sectionBadgeInput('background');
  const sourceEvidence = { ...buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] }), ...(enabled ? { pdfExcerpts: true as const } : {}) };
  inspect({ ...input, start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' }, sourceEvidence, pdfExcerpts: excerpts }, (reader, trace) => {
    assert.equal(gap(trace, 'M09'), expectedGap);
    if (expectedGap) assert.equal(badge(reader, 'M09'), 'Có một phần số liệu');
    assert.equal(section(reader, 'M09').querySelectorAll('.pdf-excerpts li').length, enabled ? excerpts.length : 0);
  });
});

for (const enabled of [true, false]) test(`M09 launch-only seller-video evidence gate: ${enabled}`, async () => {
  const input = await sectionBadgeInput('background');
  const sourceEvidence = { ...buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] }), ...(enabled ? { sellerVideos: true as const } : {}) };
  const ref = { packageId: 'synthetic-video-package', manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64) };
  const sellerVideos: NonNullable<AutomationReportInput['sellerVideos']> = { contractVersion: 'seller-videos-v1', sources: { tables: [], readings: [ref] },
    table: null, readings: [{ package: ref, readingSha256: 'd'.repeat(64), voiceLabel: 'lời người bán',
      excerpts: [{ text: 'Mẫu giả lập có hộp giấy mới.', startSeconds: 1, endSeconds: 4 }] }], leftOut: [] };
  inspect({ ...input, start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' }, sourceEvidence, sellerVideos }, (reader, trace) => {
    assert.equal(gap(trace, 'M09'), enabled ? null : '1');
    if (!enabled) assert.equal(badge(reader, 'M09'), 'Có một phần số liệu');
  });
});

test('M08 price precedence is unchanged across the three products; M02 and M13 have no badge', async () => {
  for (const product of ['background', 'observed', 'empty'] as const) inspect(await sectionBadgeInput(product), reader => {
    assert.equal(badge(reader, 'M08'), 'Chưa đủ dữ liệu');
    assert.equal(badge(reader, 'M02'), undefined);
    assert.equal(badge(reader, 'M13'), undefined);
  });
});

for (const price of ['125000', null] as const) test(`M08 retains the ${price === null ? 'unreadable' : 'reference'} price badge in the delivered report`, async () => {
  const input = await sectionBadgeInput('background'), ref = badgeProducts.background.ref;
  const source = { sourceSha256: 'e'.repeat(64), fieldPointer: '/price' };
  // The same bounded synthetic projection used by the existing price-reader tests.
  const marketInventory = { temporal: { input: { frame: { members: [{ memberKey: ref }] }, observations: [{
    observationId: 'capture-1-revenue', subjectMemberKeys: [ref], retrievedAt: '2026-01-20T00:00:00Z',
    measure: { literal: 'revenue', unit: 'VND', currency: 'VND' }, value: { decimal: '250000', literal: null },
    requestedWindow: { start: '2026-01-01', end: '2026-01-30' }, source,
  }] } }, quotes: { input: { quotes: [{ quoteId: 'capture-1-unit-price', acquiredAt: '2026-01-20T00:00:00Z',
    offerText: null, price: { value: price, range: null, currency: 'VND', state: price === null ? 'UNREADABLE' : 'NON_EXACT' }, source }] } },
  } as unknown as NonNullable<AutomationReportInput['marketInventory']>;
  inspect({ ...input, marketInventory }, reader => {
    assert.equal(badge(reader, 'M08'), price === null ? 'Chưa có giá đọc được' : 'Có giá tham khảo, chưa xác minh');
  });
});
