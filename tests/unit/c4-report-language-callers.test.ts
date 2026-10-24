import assert from 'node:assert/strict';
import test from 'node:test';
import { assertReaderSafeCitation, CitationLabelError } from '../../src/modules/analysis/citation-registry.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';
import { createComtradeSource, validateVerification } from '../../src/modules/analysis/research-automation/comtrade-lane.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { selectPdfExcerpts } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import { readerTextSafe } from '../../src/modules/analysis/research-automation/reader-plain-text.js';
import { webTextHidden } from '../../src/modules/analysis/research-automation/web-page-type.js';

// Owner Q1–Q5, 24/10/2026: caller behavior, independently of the shared module's own table tests.
const f1 = (html: string) => {
  const row = lint(html, { reportKind: 'INSIGHT' }).find(item => item.rule.startsWith('F1 '));
  assert.ok(row, 'Insight must run F1');
  return row.ok;
};
const gate = (html: string, rule = 'G08_PROVIDER_NAME') => {
  const row = auditMarketReportHtml(html, { presentation: false }).find(item => item.rule === rule);
  assert.ok(row, rule);
  return row.ok;
};
const citation = (label: string) => assertReaderSafeCitation({ label, quote: null, locatorText: null, url: null });
const providerError = (error: unknown) => error instanceof CitationLabelError && error.code === 'PROVIDER_NAME_IN_LABEL';
const RUN = '22222222-2222-4222-8222-222222222222', SHA = 'a'.repeat(64);
function pdf(text: string) {
  return selectPdfExcerpts({ contractVersion: 'pageindex-verified-quotes-v1', approvalState: 'UNREVIEWED', runId: RUN,
    quotes: [{ sourceSha256: SHA, cloudDocId: 'synthetic-doc', sectionId: 'M09', page: 2, quote: text, quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED' }] },
  RUN, new Map([[SHA, 'Tài liệu ngành hàng']]));
}

for (const name of ['Gemini', 'Nemotron', 'NVIDIA']) {
  test(`copied web title with ${name} is hidden`, () => {
    assert.equal(webTextHidden(`Thông tin từ ${name}`), true);
    assert.equal(webTextHidden('Thông tin từ Shopee'), false);
  });
  test(`PDF selection leaves out ${name} without losing a safe excerpt`, () => {
    const picked = pdf(`Thông tin từ ${name}.`);
    assert.deepEqual(picked.excerpts, []);
    assert.deepEqual(picked.leftOut, [{ sourceSha256: SHA, page: 2, reason: 'NOT_READER_SAFE' }]);
    assert.deepEqual(pdf('Thông tin từ Shopee.').excerpts.map(item => item.text), ['Thông tin từ Shopee.']);
  });
  test(`Insight quote safety withholds ${name}`, () => {
    assert.equal(readerTextSafe(`Thông tin từ ${name}.`), false);
    assert.equal(readerTextSafe('Thông tin từ TikTok Shop.'), true);
  });
}

for (const name of ['OpenAI', 'Google']) {
  test(`Insight F1 refuses ${name} in narrative`, () => assert.equal(f1(`<p>Thông tin từ ${name}.</p>`), false));
}
test('Insight F1 checks hidden text, accessible attributes, head title, SVG and surviving comments', () => {
  for (const html of ['<div hidden>OpenAI</div>', '<div style="display:none">OpenAI</div>', '<div aria-hidden="true">Google</div>',
    '<img alt="OpenAI">', '<p title="Google"></p>', '<p aria-label="OpenAI"></p>', '<head><title>Google</title></head>',
    '<svg><text>OpenAI</text></svg>', '<!-- a > Google -->']) assert.equal(f1(html), false, html);
});
test('Insight F1 accepts marketplace prose and a provider href with a safe label', () => {
  for (const html of ['<p>Shopee và TikTok Shop</p>', '<a href="https://openai.com">Nguồn tham khảo</a>']) assert.equal(f1(html), true, html);
});
test('F1 allows lower-case metric and method ids while refusing Metric and METRIC (Q2)', () => {
  for (const [text, ok] of [['metric', true], ['metric-scope-v1', true], ['Metric', false], ['METRIC', false]] as const) {
    assert.equal(f1(`<p>${text}</p>`), ok, text);
  }
});
test('Market hidden names fail G08 while other hidden wording remains outside visible-text rules (Q5)', () => {
  assert.equal(gate('<div hidden>OpenAI</div><p>Shopee</p>'), false);
  assert.equal(gate('<div hidden>Sản phẩm tốt nhất.</div><p>Shopee</p>', 'U13_SUPERLATIVE'), true);
});

const publicNames = ['CloakBrowser', 'Cloak Browser', 'cloak-browser', 'cloak_browser', 'ShopeePublicReviewCollector', 'shopee-public-review'];
test('F1 refuses public-review tools without a flag (Q4)', () => {
  for (const name of publicNames) assert.equal(f1(`<p>${name}</p>`), false, name);
  assert.equal(f1('<p>review công khai trên Shopee</p>'), true);
});
test('G08 refuses public-review tools without a flag (Q4)', () => {
  for (const name of publicNames) assert.equal(gate(`<p>${name}</p>`), false, name);
  assert.equal(gate('<p>review công khai trên Shopee</p>'), true);
});
test('citation refuses public-review tools without a flag (Q4)', () => {
  for (const name of publicNames) assert.throws(() => citation(name), providerError, name);
  assert.doesNotThrow(() => citation('review công khai trên Shopee'));
});

const verification = { typicalProductVi: 'Bình giữ nhiệt.', covers: true, reasonVi: 'Thuộc nhóm hàng.', descriptionVi: 'Mô tả hàng hóa.' };
test('Comtrade owner text rejects Kalodata and accepts lower-case metric (Q2)', () => {
  assert.equal(validateVerification(JSON.stringify({ ...verification, reasonVi: 'Theo Kalodata.' })), null);
  const safe = { ...verification, reasonVi: 'Thước đo metric phù hợp.' };
  assert.deepEqual(validateVerification(JSON.stringify(safe)), safe);
});
test('Comtrade accepts metric tons in source descriptions', async () => {
  let clock = 0;
  const transport: ProviderTransport = {
    now: () => clock,
    sleep: async ms => { clock += ms; },
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return new Response(JSON.stringify({ data: [{ period: Number(url.searchParams.get('period')), reporterDesc: 'Synthetic Reporter',
        flowCode: url.searchParams.get('flowCode'), cmdCode: url.searchParams.get('cmdCode'), cmdDesc: 'Containers measured in metric tons', primaryValue: 500 }] }),
      { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  };
  const source = createComtradeSource({ transport, model: { generateText: async request => JSON.stringify(
    request.systemText.includes('map a product') ? { candidates: ['123456'] } : verification) } });
  const result = await source.collect({ keyword: 'bình giữ nhiệt', description: null, mode: 'CATEGORY', periodEndDate: '2026-09-30' });
  assert.equal(result.status, 'OK');
  assert.equal(result.officialDescription, 'Containers measured in metric tons');
});
test('citation decodes numeric entities, catches Gemini, keeps data substrings and AI word boundaries', () => {
  for (const label of ['Kalo&#100;ata', 'Gemini', 'Damian']) assert.throws(() => citation(label), providerError, label);
  assert.doesNotThrow(() => citation('majevi'));
});
