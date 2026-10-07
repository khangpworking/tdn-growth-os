import assert from 'node:assert/strict';
import test from 'node:test';
import { CitationLabelError, CitationRegistry, type CitationInput } from '../../src/modules/analysis/citation-registry.js';
import { renderCitationMark, renderCitationRegister } from '../../src/modules/analysis/citation-register-html.js';

// Owner contract (#125 Phase 1): one [n] per source+locator, no number without
// lineage, and no provider identity in anything a reader sees.

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const PROVIDERS = ['Metric', 'Kalodata', 'TradeInt', 'Dami', 'SerpApi', 'Apify', 'PageIndex', 'Agent-Reach', 'OpenCLI', 'zen-studio'];

const input = (over: Partial<CitationInput> = {}): CitationInput => ({
  sourceKind: 'CAPTURE',
  identity: DIGEST_A,
  locator: { kind: 'xlsx', sheet: 'Tổng quan', cell: 'B4' },
  label: 'Bảng doanh số ngành hàng',
  retrievedAt: '2026-09-30T08:00:00Z',
  url: null,
  quote: null,
  quoteVerification: 'NOT_APPLICABLE',
  ...over,
});

const code = (fn: () => unknown): string => {
  try { fn(); } catch (error) { if (error instanceof CitationLabelError) return error.code; throw error; }
  return 'NO_ERROR';
};

function feed(registry: CitationRegistry): (number | null)[] {
  return [
    registry.cite(input({ technical: { provider: 'Metric', packageId: 'pkg-1' } })),
    registry.cite(input({ sourceKind: 'PDF_PAGE', identity: DIGEST_B, locator: 'page 3', label: 'Báo cáo ngành <2026> & "dự báo"' })),
    registry.cite(input({ sourceKind: 'WEB_RESULT', identity: 'https://example.vn/bai-viet', locator: null, url: 'https://example.vn/bai-viet?token=x#frag', retrievedAt: null, label: 'Bài viết về thị trường' })),
    registry.cite(input()),
    registry.cite(input({ identity: '  ' })),
  ];
}

test('numbers follow first appearance, reuse the same source+locator, and register every number once', () => {
  const registry = new CitationRegistry();
  assert.deepEqual(feed(registry), [1, 2, 3, 1, null]);
  // Same source, different locator: a new number.
  assert.equal(registry.cite(input({ locator: { kind: 'xlsx', sheet: 'Tổng quan', cell: 'B5' } })), 4);
  // Same id with a different label keeps the first label.
  assert.equal(registry.cite(input({ label: 'Nhãn khác' })), 1);
  const entries = registry.entries();
  assert.deepEqual(entries.map(entry => entry.number), [1, 2, 3, 4]);
  assert.equal(new Set(entries.map(entry => entry.citationId)).size, 4);
  assert.equal(entries[0]!.label, 'Bảng doanh số ngành hàng');
  assert.deepEqual(entries.map(entry => entry.locatorText), ['bảng Tổng quan, ô B4', 'trang 3', null, 'bảng Tổng quan, ô B5']);
  assert.equal(registry.cite(input({ locator: '/groups/W2/revenue' })), 5);
  assert.equal(registry.entries()[4]!.locatorText, 'mục /groups/W2/revenue');
});

test('a source without lineage gets no number and no entry', () => {
  const registry = new CitationRegistry();
  for (const identity of [null, '', '   ', '\n\t']) assert.equal(registry.cite(input({ identity })), null);
  assert.deepEqual(registry.entries(), []);
  assert.deepEqual(registry.technicalTrace().entries, []);
  assert.equal(renderCitationRegister(registry.entries(), { format: 'web' }), '');
});

test('provider names are rejected in label and quote but kept in the technical trace only', () => {
  for (const name of PROVIDERS) {
    for (const variant of [name, name.toLowerCase(), name.toUpperCase()]) {
      assert.equal(code(() => new CitationRegistry().cite(input({ label: `Số liệu từ ${variant}` }))), 'PROVIDER_NAME_IN_LABEL', variant);
      assert.equal(code(() => new CitationRegistry().cite(input({ quote: `trích ${variant} nói`, quoteVerification: 'UNVERIFIED' }))), 'PROVIDER_NAME_IN_LABEL', variant);
    }
  }
  const registry = new CitationRegistry();
  feed(registry);
  const trace = JSON.stringify(registry.technicalTrace());
  assert.match(trace, /"provider":"Metric"/);
  assert.equal(registry.technicalTrace().contractVersion, 'citation-trace-v1');
  const readerSide = JSON.stringify(registry.entries());
  assert.ok(!/metric|pkg-1/i.test(readerSide));
});

test('only https links are accepted and shown without query or fragment', () => {
  for (const url of ['http://example.vn/a', 'javascript:alert(1)', 'data:text/html,<b>x</b>', 'not a url', 'https://user:pw@example.vn/a']) {
    assert.equal(code(() => new CitationRegistry().cite(input({ url }))), 'INVALID_URL', url);
  }
  const registry = new CitationRegistry();
  registry.cite(input({ url: 'https://example.vn/bai-viet?token=x#frag' }));
  assert.equal(registry.entries()[0]!.url, 'https://example.vn/bai-viet');
});

test('malformed input fails closed', () => {
  assert.equal(code(() => new CitationRegistry().cite(input({ label: '  ' }))), 'INVALID_INPUT');
  assert.equal(code(() => new CitationRegistry().cite(input({ retrievedAt: 'hôm qua' }))), 'INVALID_INPUT');
  assert.equal(code(() => new CitationRegistry().cite(input({ locator: { kind: 'pdf', page: 0, fragment: null } }))), 'INVALID_INPUT');
  assert.equal(code(() => new CitationRegistry().cite(input({ sourceKind: 'OTHER' as never }))), 'INVALID_INPUT');
});

test('rendered register is escaped, reader-safe, and prints the URL as text only for pdf', () => {
  const registry = new CitationRegistry();
  feed(registry);
  const web = renderCitationRegister(registry.entries(), { format: 'web' });
  const pdf = renderCitationRegister(registry.entries(), { format: 'pdf' });
  for (const html of [web, pdf]) {
    assert.ok(html.startsWith('<section class="citation-register"><h2>Nguồn tham khảo</h2><ol>'));
    assert.ok(html.endsWith('</ol></section>'));
    assert.equal(html.match(/<li /g)?.length, 3);
    for (const n of [1, 2, 3]) assert.equal(html.split(`[${n}]`).length - 1, 1, `[${n}] once`);
    assert.ok(html.includes('ngày 30/09/2026'));
    assert.ok(html.includes('Báo cáo ngành &lt;2026&gt; &amp; &quot;dự báo&quot;'));
    assert.ok(!html.includes('<2026>'));
    assert.ok(!/[0-9a-f]{64}/.test(html), 'no digest');
    assert.ok(!html.includes('?') && !html.includes('token') && !html.includes('#frag'));
    for (const name of PROVIDERS) assert.ok(!html.toLowerCase().includes(name.toLowerCase()), name);
    assert.ok(html.includes('href="https://example.vn/bai-viet"'));
  }
  const visible = (html: string): string => html.replace(/<[^>]+>/g, ' ');
  assert.ok(visible(pdf).includes('https://example.vn/bai-viet'));
  assert.ok(!visible(web).includes('https://example.vn/bai-viet'));
  assert.equal(renderCitationMark(7), '<sup class="cite">[7]</sup>');
});

test('the same cite sequence gives byte-identical entries, trace and html', () => {
  const left = new CitationRegistry();
  const right = new CitationRegistry();
  feed(left);
  feed(right);
  assert.equal(JSON.stringify(left.entries()), JSON.stringify(right.entries()));
  assert.equal(JSON.stringify(left.technicalTrace()), JSON.stringify(right.technicalTrace()));
  for (const format of ['web', 'pdf'] as const) {
    assert.equal(renderCitationRegister(left.entries(), { format }), renderCitationRegister(right.entries(), { format }));
  }
});
