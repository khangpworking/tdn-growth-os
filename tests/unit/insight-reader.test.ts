import assert from 'node:assert/strict';
import test from 'node:test';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../src/platform/artifacts/artifact-store.js';
import { publishReaderReport, ReaderReportGateError } from '../../src/modules/analysis/reader-report/build.js';
import { projectRetainedInsightFindings, INSIGHT_SECTION_IDS } from '../../src/modules/analysis/reader-report/insight-projection.js';
import { buildInsightReaderTemplate } from '../../src/modules/analysis/reader-report/insight-template.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';

function page(output?: ReturnType<typeof buildLocatedInsightMethods>['output'], draft = false) {
  const registry = new CitationRegistry();
  const citations = { mark: (input: Parameters<CitationRegistry['cite']>[0]) => {
    const number = registry.cite(input);
    return number === null ? '<span class="cite-missing">Chưa có nguồn</span>' : `<sup class="cite">[${number}]</sup>`;
  } };
  return buildInsightReaderTemplate({ keyword: 'Mẫu thử', definition: 'Phạm vi tổng hợp thử nghiệm',
    period: { startDate: '2026-09-01', endDate: '2026-09-30' },
    registry, findings: projectRetainedInsightFindings(output, draft),
    sections: output ? (['I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09'] as const).map(id => ({ id,
      explanation: 'Khai báo bám lời nguồn; chưa phải mục phân tích hoàn chỉnh.',
      body: renderLocatedInsightSection(output, id, { bundleDownload: false, citations })! })) : [] });
}
const gate = (html: string) => lint(html, { reportKind: 'INSIGHT', visibleTextRules: true, sectionIds: ['insight-findings', ...INSIGHT_SECTION_IDS] });

test('Insight reader copies exact draft family counts, with shared citations, per-sentence labels and no aggregation', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const output = buildLocatedInsightMethods(input).output;
  const before = JSON.stringify(output);
  const { html, narrator } = page(output, true);
  assert.match(html, /2 bản ghi có khai báo về hành vi \(đề xuất, chờ chủ duyệt\)/);
  assert.match(html, /Trạng thái:.*Đề xuất, chờ chủ duyệt; chưa đủ điều kiện phát hành/);
  assert.equal((html.match(/<li><p data-classified="pending">/g) ?? []).length, 6);
  assert.ok(!html.includes('<ol class="insight-findings"'));
  assert.equal(narrator.bundle.value('insight.I04.records'), output.sections.I04.draftLocatedRecordCount);
  assert.equal(narrator.bundle.value('insight.I05.records'), output.sections.I05.draftLocatedRecordCount);
  assert.ok(![...narrator.bundle.m.keys()].some(key => key.includes('both') || key.includes('total')));
  assert.ok(gate(html).every(check => check.ok), JSON.stringify(gate(html).filter(check => !check.ok)));
  assert.equal(narrator.checkHardcoded().hardcoded.length, 0);
  assert.equal(narrator.notInBundle().length, 0);
  assert.equal(JSON.stringify(output), before);
});

test('missing or unsupported retained draft methods show an honest shortage and all seventeen sections', () => {
  const empty = page();
  for (const id of INSIGHT_SECTION_IDS) assert.ok(empty.html.includes(`<section id="${id}">`));
  assert.match(empty.html, /Chưa đủ bằng chứng được đưa vào/);
  assert.match(empty.html, /Chưa có phương án hoặc đề xuất đã lưu đủ điều kiện/);
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v1';
  const old = page(buildLocatedInsightMethods(input).output, true);
  assert.match(old.html, /Chưa đủ bằng chứng được đưa vào/);
  assert.ok(!old.narrator.bundle.has('insight.I04.records'), 'Accepted-only zeros cannot become draft counts');
  assert.ok(gate(empty.html).every(check => check.ok));
});

test('Insight citation and visible-text gates reject missing targets, rankings and misplaced draft labels', () => {
  const input = nextInsightFixture(); input.draftCountsVersion = 'draft-counts-v2';
  const { html } = page(buildLocatedInsightMethods(input).output, true);
  const fails = (value: string, prefix: string) => gate(value).some(check => check.rule.startsWith(prefix) && !check.ok);
  assert.ok(fails(html.replace('id="cite-1"', 'id="removed-citation"'), 'I_CITATIONS'));
  assert.ok(fails(html.replace('<main>', '<main><p>Cách tốt nhất.</p>'), 'U13_SUPERLATIVE'));
  assert.ok(fails(html.replace('<main>', '<main><p>Thị phần là 10%.</p>'), 'W4'));
  assert.ok(fails(html.replace(/\(đề xuất, chờ chủ duyệt\)/g, '(đề xuất). Cần chờ chủ duyệt'), 'U13_PENDING_NUMBER'));
  assert.ok(fails(html.replace('id="I17"', 'id="removed-appendix"'), 'Cấu trúc'));
});

test('shared publisher rejects handwritten numbers or broken Insight citations before storing any artifact', async () => {
  class NoWrites extends ContentAddressedArtifactStore {
    calls = 0;
    override async put(_bytes: Uint8Array): Promise<StoredArtifact> { this.calls++; throw new Error('Unexpected artifact write'); }
  }
  const store = new NoWrites('/unused-synthetic-reader-store');
  const built = page(); built.narrator.nar('Có 98765 bản ghi.', 'synthetic-injection');
  await assert.rejects(publishReaderReport(store, { ...built, reportKind: 'INSIGHT', visibleTextRules: true, sectionIds: INSIGHT_SECTION_IDS }), ReaderReportGateError);
  assert.equal(store.calls, 0);
  const valid = page();
  await assert.rejects(publishReaderReport(store, { ...valid, html: valid.html.replace('<main>', '<main><sup class="cite">[123]</sup>'), reportKind: 'INSIGHT', sectionIds: INSIGHT_SECTION_IDS }), ReaderReportGateError);
  assert.equal(store.calls, 0);
});
