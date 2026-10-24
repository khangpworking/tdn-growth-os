import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { assertReaderSafeCitation, CitationLabelError, CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';
import { createComtradeSource, validateVerification } from '../../src/modules/analysis/research-automation/comtrade-lane.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { pdfExcerptBlockHtml, pdfExcerptCitation, selectPdfExcerpts } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import { readerTextSafe } from '../../src/modules/analysis/research-automation/reader-plain-text.js';
import { webTextHidden } from '../../src/modules/analysis/research-automation/web-page-type.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { sync2ReportFixture } from '../helpers/sync2-report-fixture.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { prepareShopeeReaderBuild } from '../../src/modules/analysis/reader-report/shopee-build-v1.js';
import { prepareTikTokReaderBuild } from '../../src/modules/analysis/reader-report/tiktok-build-v1.js';
import { buildInsightReaderTemplate } from '../../src/modules/analysis/reader-report/insight-template.js';

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
    '<img alt="OpenAI">', '<img alt=OpenAI>', '<p title=Google></p>', '<p aria-label=OpenAI></p>',
    '<p title="Google"></p>', '<p aria-label="OpenAI"></p>', '<head><title>Google</title></head>',
    '<svg><text>OpenAI</text></svg>', '<!-- a > Google -->']) assert.equal(f1(html), false, html);
});
test('Insight F1 accepts marketplace prose and a provider href with a safe label', () => {
  for (const html of ['<p>Shopee và TikTok Shop</p>', '<a href="https://openai.com">Nguồn tham khảo</a>']) assert.equal(f1(html), true, html);
  // Owner Q5 / c4 I2: link targets stay outside the name check, including public-review reports.
  for (const publicReviewSource of [false, true]) {
    for (const html of ['<a href="https://openai.com">Nguồn tham khảo</a>', '<a href=https://google.com>Nguồn tham khảo</a>']) {
      assert.equal(auditMarketReportHtml(html, { presentation: false, publicReviewSource }).find(row => row.rule === 'G08_PROVIDER_NAME')!.ok, true, html);
    }
    assert.equal(auditMarketReportHtml('<img alt="OpenAI">', { presentation: false, publicReviewSource }).find(row => row.rule === 'G08_PROVIDER_NAME')!.ok, false);
  }
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

function qualitativeInput(): AutomationReportInput {
  const input = sync2ReportFixture();
  const text = 'Thông tin từ Shopee.';
  const locator = { owner: 'https://example.test/retained', pageSha256: SHA, pageIndex: 0, rowIndex: 0, textPointer: '/records/0/text' };
  const qualitativeDraft: NonNullable<AutomationReportInput['qualitativeDraft']> = {
    contractVersion: 'automation-qualitative-draft-v1', draftId: RUN, requestKey: RUN,
    binding: { workspaceId: input.run.workspaceId, runId: input.run.runId, scopeSha256: SHA, sourceSetSha256: SHA,
      requestedPeriod: input.start.requestedPeriod },
    source: { platform: 'SHOPEE', sourceType: 'S05_LOCATED_REVIEW', sourceSha256: SHA,
      sourcePackageId: null, sourceManifestSha256: null, sourceContentSha256: null },
    records: [{ recordIndex: 0, recordId: 'record-0', text, locator, sourceHash: SHA, author: { state: 'UNAVAILABLE', hash: null }, admission: 'INCLUDED', admissionReason: null }],
    classifications: [{ recordIndex: 0, recordId: 'record-0', status: 'CLASSIFIED', confidence: 'MEDIUM', situation: 'Sau giờ làm',
      journey: null, topic: 'Mùi vị', statedSentiment: 'POSITIVE', uncertainty: null,
      quotes: [{ recordIndex: 0, recordId: 'record-0', locator, text, start: 0, end: text.length }] }],
    cards: [], counts: { included: 1, excluded: 0, unclear: 0, classified: 1, unclassified: 0 },
    policy: { status: 'PROPOSED_AWAITING_REVIEW', reliability: { state: 'UNAVAILABLE', code: 'U11_STATISTIC_UNAVAILABLE' }, releaseEligibility: 'UNAVAILABLE', mainConclusionUse: 'EXCLUDED' },
    limitations: ['Chỉ đọc các bản ghi đã lưu.'],
  };
  return { ...input, qualitativeDraft };
}

test('Insight report assembly checks authored names without the public-review flag', () => {
  const input = qualitativeInput();
  assert.match(buildResearchAutomationReport(input, 'INSIGHT').html.toString(), /Thông tin từ Shopee\./);
  for (const name of ['OpenAI', 'Google']) {
    input.qualitativeDraft!.classifications[0]!.topic = `Theo ${name}`;
    assert.throws(() => buildResearchAutomationReport(input, 'INSIGHT'), /INSIGHT_READER_NAME_REFUSED/, name);
  }
});

test('copied Insight citation URLs and quotes are withheld item by item without aborting the report', () => {
  for (const url of ['https://google.com/reviews', 'https://example.test/Gemini']) {
    const input = qualitativeInput();
    input.qualitativeDraft!.records[0]!.locator.owner = url;
    const before = JSON.stringify(input);
    const html = buildResearchAutomationReport(input, 'INSIGHT').html.toString();
    assert.equal(html.includes(url), false, url);
    assert.match(html, /Thông tin từ Shopee\./, 'a safe quote and its record survive');
    assert.equal(JSON.stringify(input), before, 'retained evidence is unchanged');
  }
  const input = qualitativeInput(), draft = input.qualitativeDraft!;
  const quote = draft.classifications[0]!.quotes[0]!;
  draft.records[0]!.text = quote.text = 'Thông tin từ Gemini.';
  quote.end = quote.text.length;
  const html = buildResearchAutomationReport(input, 'INSIGHT').html.toString();
  assert.doesNotMatch(html, /Thông tin từ Gemini\./);
  assert.match(html, /Nguyên văn được giữ trong bản lưu nguồn/);
});

test('copied web citation labels decode names without aborting report assembly', () => {
  const input = sync2ReportFixture();
  const report = buildResearchAutomationReport({ ...input, collection: {
    contractVersion: 'research-automation-step-result-v1', runId: input.run.runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED',
    productCards: [], comparables: [], coverage: [], limitations: [], webResults: [
      { position: 1, title: 'Thông tin từ Shopee', site: 'Gem&#105;ni', url: 'https://example.test/article',
        snippet: null, retrievedAt: input.run.createdAt, captureIndex: 0 },
    ],
  } }, 'INSIGHT');
  assert.match(report.html.toString(), /Thông tin từ Shopee/);
  assert.doesNotMatch(report.html.toString(), /Gemini|Gem&amp;#105;ni/);
});

test('saved PDF excerpts with newly hidden names are omitted before citation registration', () => {
  const registry = new CitationRegistry();
  const texts = ['Thông tin từ Shopee.', 'Thông tin từ Gemini.', 'Theo G e m i n i.', 'Theo N V I D I A.',
    'Thông tin từ Gem&#105;ni.', 'Theo NVID&#x49;A.'];
  const excerpts = texts.map((text, index) => ({ sourceSha256: SHA, page: index + 1, text, label: `Tài liệu ngành hàng, trang ${index + 1}` }));
  const html = pdfExcerptBlockHtml(excerpts, value => value, excerpt => String(registry.cite(pdfExcerptCitation(excerpt))));
  assert.match(html, /Thông tin từ Shopee\./);
  for (const text of texts.slice(1)) assert.equal(html.includes(text), false, text);
  assert.equal(registry.entries().length, 1);
  assert.deepEqual(excerpts.map(excerpt => excerpt.text), texts, 'saved excerpts are unchanged');
});

for (const platform of ['shopee', 'tiktok'] as const) {
  test(`${platform} reader withholds names in copied quotes and their full record context`, () => {
    const hash = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
    for (const location of platform === 'tiktok' ? ['quote', 'context', 'url'] : ['quote', 'context']) {
      const frozen = JSON.parse(readFileSync(`tests/fixtures/${platform}-v1-reader-origin-input.json`, 'utf8'));
      const build = () => {
        const prepared = platform === 'shopee'
          ? prepareShopeeReaderBuild(frozen.identity, frozen.draft, frozen.report, frozen.source, frozen.acquiredAt, frozen.scope)
          : prepareTikTokReaderBuild(frozen.identity, frozen.draft, frozen.report, frozen.source, frozen.acquiredAt, frozen.scope);
        return buildInsightReaderTemplate(prepared.page).html;
      };
      assert.equal(f1(build()), true, 'name-free frozen input still passes');
      for (const record of frozen.source.records) {
        if (location === 'url') record.videoUrl = 'https://www.tiktok.com/@Google/video/1000';
        else if (record.text !== null) record.text = location === 'quote' ? 'Gemini' : `${record.text} Google`;
      }
      if (location === 'quote') {
        for (const code of frozen.draft.codes) code.quote = { text: 'Gemini', start: 0, end: 6 };
        frozen.report.draftSha256 = frozen.identity.draftPairId = hash(frozen.draft);
        frozen.identity.semanticSha256 = frozen.identity.sourceReportSha256 = hash(frozen.report);
      }
      const html = build();
      assert.equal(f1(html), true, location);
      assert.doesNotMatch(html, /Gemini|Google/);
      if (location !== 'url') assert.match(html, /Nguyên văn được giữ trong bản lưu nguồn/);
    }
  });
}
