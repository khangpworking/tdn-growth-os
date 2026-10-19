import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
// === PHASE-2 BINDING SECTION (reviewed handoff + code.patch lines 10–15, 112–122, 205–210, 237, 246) ===
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
// The negative-evidence run uses the same assertions with pinned main's public builder.
const targetCheckout = process.env.TDN_G_REFERENCES_TARGET_CHECKOUT;
if (targetCheckout) {
  const pointer = readFileSync(resolve(targetCheckout, '.git'), 'utf8').trim().replace(/^gitdir: /u, '');
  assert.equal(readFileSync(resolve(targetCheckout, pointer, 'HEAD'), 'utf8').trim(), REFERENCE_REVIEW_BASE);
}
const builder = process.env.TDN_G_REFERENCES_TARGET_CHECKOUT
  ? (await import(pathToFileURL(resolve(process.env.TDN_G_REFERENCES_TARGET_CHECKOUT,
    'src/modules/analysis/research-automation/reports.ts')).href)).buildResearchAutomationReport as typeof buildResearchAutomationReport
  : buildResearchAutomationReport;
const renderCurrent = (input: AutomationReportInput) => builder(input, 'MARKET');
// Independent literal vocabulary: old 17 from main; additions/meanings from the reviewed handoff.
const CHECKER_TERMS = ['listing', 'review', 'reviews', 'export', 'peer set', 'variant', 'pack', 'insight',
  'section', 'Giá TB', 'P25', 'P75', 'NSX', 'H1', 'ROAS', 'CPA', 'AI'];
const ADDED_TERMS: Readonly<Record<string, string>> = {
  CPI: 'chỉ số giá tiêu dùng', USD: 'đô la Mỹ', VND: 'đồng Việt Nam',
  HS: 'mã phân loại hàng hóa trong thương mại quốc tế', 'HS code': 'mã phân loại hàng hóa trong thương mại quốc tế',
  HS6: 'mã phân loại hàng hóa quốc tế gồm sáu chữ số', UTC: 'giờ quốc tế phối hợp', GDP: 'tổng sản phẩm trong nước',
  PDF: 'định dạng tài liệu giữ nguyên bố cục', SKU: 'mã quản lý một loại hàng hoặc biến thể',
  'CC BY': 'giấy phép cho phép sử dụng lại với điều kiện ghi công nguồn',
  'World Bank Open Data': 'dữ liệu mở của Ngân hàng Thế giới', BLDC: 'động cơ điện một chiều không chổi than',
  DC: 'dòng điện một chiều', AC: 'dòng điện xoay chiều', RPM: 'số vòng quay mỗi phút', motor: 'động cơ', brushless: 'không chổi than',
};
const definedTerms = () => [...CHECKER_TERMS, ...Object.keys(ADDED_TERMS)];
const COPY = {
  convention: 'Quý báo cáo là quý chứa phần lớn số ngày của kỳ mẫu bán hàng; nếu hai quý có số ngày bằng nhau, chọn quý sau.',
  seriesLabel: 'Kỳ số liệu từng sản phẩm', seriesStart: 'Các kỳ đã lưu: ',
  seriesEnd: '. Các kỳ này tách riêng với kỳ mẫu bán hàng.',
  appendix: 'Phụ lục · và truy nguồn', coverMetadata: '', familySelector: '.cite-family',
  capture: 'Bản thu dữ liệu', pdf: 'Tài liệu PDF', sourceOrdinal: 'mục nguồn', link: 'Mở nguồn',
};
// === END PHASE-2 BINDING SECTION ===

import assert, { AssertionError } from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import type { CitationEntry, CitationTrace } from '../../src/modules/analysis/citation-registry.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { REFERENCE_BRAND, REFERENCE_DAY, REFERENCE_EXPECTED, REFERENCE_LABEL, REFERENCE_LONG_URL,
  REFERENCE_SHAPES, referenceIdentity, referenceInput, referencePdfInput, referenceRegistryFixture,
  type ReferenceShape } from '../helpers/package-g-references-fixture.js';
import { referenceBaselineBytes, REFERENCE_BASE, REFERENCE_REVIEW_BASE } from '../helpers/package-g-references-baselines.js';
import { fullMarket14Input } from '../helpers/market14-full-fixture.js';

const text = (node: Node | null | undefined): string => node?.textContent?.replace(/\s+/gu, ' ').trim() ?? '';
const word = (term: string) => new RegExp(`(?<![\\p{L}\\p{N}_])${term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}(?![\\p{L}\\p{N}_])`, 'iu');
const TERMS = '[data-glossary] tbody tr td:first-child, .pl-terms-table tbody tr td:first-child';
const CONVENTION = /(?:đa số|nhiều nhất|phần lớn|nhiều ngày nhất)/iu;
const TIE = /(?:bằng nhau|ngang nhau|hòa)/iu;
const LATER = /quý (?:sau|muộn hơn|mới hơn)|(?:sau|muộn hơn).*quý/iu;
const APPENDIX_TITLE = 'Phụ lục và truy nguồn'; // canonical catalog title on pinned main
const APPENDIX_BODY = 'và truy nguồn';
type Built = ReturnType<typeof renderCurrent>;
type Item = 'M1' | 'M20' | 'M21' | 'L1' | 'L2' | 'L3';
const ITEMS: readonly Item[] = ['M1', 'M20', 'M21', 'L1', 'L2', 'L3'];
const inputs: Partial<Record<ReferenceShape, Promise<AutomationReportInput>>> = {};
const inputFor = async (shape: ReferenceShape) => structuredClone(await (inputs[shape] ??= referenceInput(shape)));
function domFor(t: TestContext, report: Built) {
  const dom = new JSDOM(report.html.toString());
  t.after(() => dom.window.close());
  return dom.window.document;
}
function section(doc: Document, id: string) {
  const node = doc.getElementById(id);
  assert.ok(node, `public report contains #${id}`);
  return node;
}
function glossary(doc: Document) { return [...doc.querySelectorAll(TERMS)].map(text); }
function authored(doc: Document): string {
  const copy = doc.body.cloneNode(true) as HTMLElement;
  for (const node of copy.querySelectorAll('q, [data-quote], blockquote, code, pre, [hidden], [aria-hidden="true"], [data-glossary], .pl-terms-table, style, script, svg, title, template, noscript, .brand')) node.remove();
  return text(copy).replace(/(?:https?:\/\/|www\.)[^\s<>]+/giu, ' ');
}
// Independent DOM scan matching rule 1's documented scan boundary, without importing its term table.
function checkerVisible(doc: Document): string {
  const copy = doc.body.cloneNode(true) as HTMLElement;
  for (const node of copy.querySelectorAll('[data-glossary], .pl-terms-table, style, script, svg, title, template, noscript')) node.remove();
  return text(copy);
}
function registryTargets(doc: Document) {
  const ids = [...doc.querySelectorAll('.citation-register li')].map(node => node.id);
  const targets = [...doc.querySelectorAll('sup.cite')].map(node => `cite-${text(node).slice(1, -1)}`);
  assert.deepEqual([...new Set(targets)], ids, 'consecutive references follow first visible occurrence');
  assert.deepEqual(ids, ids.map((_, index) => `cite-${index + 1}`));
}
type CitationSnapshot = { citations: CitationTrace; citationEntries: readonly CitationEntry[] };
function evidenceSnapshot(snapshot: CitationSnapshot, identities: ReadonlySet<string>) {
  const citations = snapshot.citations.entries.filter(entry => identities.has(entry.identity))
    .map(({ number: _number, ...entry }) => entry);
  const citationIds = new Set(citations.map(entry => entry.citationId));
  const citationEntries = snapshot.citationEntries.filter(entry => citationIds.has(entry.citationId))
    .map(({ number: _number, label: _label, ...entry }) => entry);
  return { citations, citationEntries };
}
function adjacentDuplicates(doc: Document) {
  return [...doc.querySelectorAll('sup.cite')].filter(mark => {
    let next = mark.nextSibling;
    while (next?.nodeType === 3 && !text(next)) next = next.nextSibling;
    return next?.nodeType === 1 && (next as Element).matches('sup.cite') && text(mark) === text(next);
  });
}

/** One table-driven check per row and shape; the same assertions drive the negative control. */
function checkRow(item: Item, shape: ReferenceShape, doc: Document) {
  const expected = REFERENCE_EXPECTED[shape];
  if (item === 'M1') {
    const scope = section(doc, 'M02');
    const notes = [...scope.querySelectorAll('p, dd')].filter(node => CONVENTION.test(text(node)));
    assert.equal(notes.length, shape === 'Q3' ? 0 : 1, 'majority convention occurs exactly once for crossing windows');
    if (shape !== 'Q3') {
      assert.match(text(notes[0]), /quý/iu);
      assert.match(text(notes[0]), TIE);
      assert.match(text(notes[0]), LATER);
      assert.ok(text(scope).includes(COPY.convention));
    }
    for (const date of [expected.start, expected.end]) assert.ok(text(scope).includes(date.split('-').reverse().join('/')));
    if (shape === 'Q1') {
      const periods = [...scope.querySelectorAll('dt')].find(node => text(node) === COPY.seriesLabel)?.nextElementSibling;
      const windows = ['31', '28', '31', '30', '31', '30', '31', '31', '30', '31', '30', '31']
        .map((last, i) => `01/${String(i + 1).padStart(2, '0')}/2025–${last}/${String(i + 1).padStart(2, '0')}/2025`);
      assert.equal(text(periods), COPY.seriesStart + windows.join('; ') + COPY.seriesEnd);
      assert.doesNotMatch(text(scope), /Diễn biến từng sản phẩmTheo từng kỳ trong khoảng từ 01\/01\/2025 đến 31\/10\/2026/u,
        'requested window is not the actual tracked series');
    }
  } else if (item === 'M20') {
    const rows = [...section(doc, 'M13').querySelectorAll('table.observations tbody tr')];
    assert.equal(rows.length, shape === 'Q2' ? 2 : expected.identities, 'synthetic evidence reached the public report');
    const marks = rows.map(row => text(row.querySelector('sup.cite')));
    assert.equal(new Set(marks).size, expected.identities, 'N different identities have N reference numbers');
    for (const mark of new Set(marks)) {
      const entry = doc.getElementById(`cite-${mark.slice(1, -1)}`);
      assert.ok(entry);
      assert.ok(text(entry).includes(REFERENCE_DAY), 'retained capture date is visible');
      const ordinal = mark.slice(1, -1);
      assert.equal(text(entry.querySelector(COPY.familySelector)), `${COPY.capture} · ${COPY.sourceOrdinal} ${ordinal}`);
      assert.equal(text(entry.querySelector('.cite-label')), REFERENCE_LABEL);
    }
    const visibleEntries = [...doc.querySelectorAll('.citation-register li')].map(node => text(node).replace(/^\[\d+\]\s*[·,]?\s*/u, ''));
    assert.equal(new Set(visibleEntries).size, visibleEntries.length, 'visible provenance distinguishes every reference');
    const css = [...doc.querySelectorAll('style')].map(node => node.textContent).join('\n');
    assert.equal(/\.citation-register\s+a\s*::?after\s*\{[^}]*attr\(\s*href\s*\)/iu.test(css), false,
      'report CSS relinquishes the printed href suffix');
    registryTargets(doc);
  } else if (item === 'M21') {
    const prose = authored(doc), listed = glossary(doc), scanned = checkerVisible(doc);
    const required = new Set([...definedTerms(), ...expected.glossary]);
    for (const term of required) {
      if (word(term).test(prose)) assert.ok(listed.some(value => word(term).test(value)), `${term}: authored use has a definition`);
    }
    for (const row of doc.querySelectorAll('[data-glossary] tbody tr')) {
      const meaning = text(row.querySelector('td:nth-child(2)')), term = text(row.querySelector('td'));
      assert.ok(meaning, 'a glossary entry has a definition');
      if (ADDED_TERMS[term]) assert.equal(meaning, ADDED_TERMS[term]);
    }
    for (const term of CHECKER_TERMS) if (word(term).test(scanned)) {
      assert.ok(listed.includes(term), `${term}: checker-required use keeps a definition, including quotes`);
    }
    for (const term of listed) assert.ok(word(term).test(prose)
      || (CHECKER_TERMS.includes(term) && word(term).test(scanned)), `${term}: no unused/quote-only padding`);
    assert.ok(!listed.includes(expected.quoteOnly), 'the title-only or unused acronym adds no entry');
  } else if (item === 'L1') {
    const link = doc.querySelector('.toc a[href="#M13"]');
    assert.ok(link);
    assert.equal((text(link).match(/Phụ lục/gu) ?? []).length, 1, 'appendix label appears once');
    assert.match(text(link), /^Phụ lục\s+[·:|–—-]\s+và truy nguồn$/u, 'a literal separator separates label and catalog title remainder');
    assert.equal(text(link), COPY.appendix);
    assert.equal(text(section(doc, 'M13').querySelector('.sh-head h2')), APPENDIX_TITLE);
    assert.ok(text(link).endsWith(APPENDIX_BODY));
  } else if (item === 'L2') {
    const cover = doc.querySelector('.cv-left')!;
    // Without a browser these are semantic rows, not physical wrapping lines.
    const lines = [...cover.querySelectorAll('h1, h2, p, .cv-meta b, .cv-meta span')].filter(node => !node.closest('.brand') && text(node));
    assert.ok(lines.length <= 3, `cover has ${lines.length} text rows; maximum three`);
    assert.equal(cover.querySelectorAll('h1').length, 1);
    assert.doesNotMatch(text(cover).replace(text(cover.querySelector('.brand')), ''), /Việt Nam/u);
    assert.match(text(section(doc, 'M02')), /Việt Nam/u);
    assert.ok(text(cover).includes(expected.quarter));
    assert.ok(text(cover).includes(expected.range));
    assert.equal(text(cover.querySelector('.cv-meta')), COPY.coverMetadata);
    assert.equal(cover.querySelector('.brand')!.outerHTML, REFERENCE_BRAND);
    const image = cover.querySelector('img.cv-art')!;
    assert.equal(image.getAttribute('src'), 'data:image/jpeg;base64,/9j/2Q==');
    assert.equal(image.getAttribute('alt'), 'Hình minh họa tổng hợp của mẫu');
    assert.equal(auditMarket14(doc.documentElement.outerHTML).find(row => row.rule === '10')?.ok, true);
  } else {
    assert.equal(adjacentDuplicates(doc).length, 0, 'one adjacent marker per identity and locator');
    if (shape === 'Q2') {
      const marks = [...section(doc, 'M13').querySelectorAll('table.observations tbody tr sup.cite')].map(text);
      assert.equal(marks.length, 2, 'two separate claims each retain their marker');
      assert.equal(marks[0], marks[1]);
    }
    if (shape === 'Q1') {
      const marks = [...section(doc, 'M13').querySelectorAll('table.observations tbody tr sup.cite')].map(text);
      assert.equal(new Set(marks).size, 3, 'equal-label distinct identities keep separate markers');
    }
    registryTargets(doc);
  }
}

for (const shape of REFERENCE_SHAPES) {
  for (const item of ITEMS) test(`${item} ${shape}: contract row`, async t => {
    checkRow(item, shape, domFor(t, renderCurrent(await inputFor(shape))));
  });

  test(`preserved ${shape}: exact quarter, quotes, hrefs, brand and pre-reader citation identities`, async t => {
    const input = await inputFor(shape), report = renderCurrent(input), doc = domFor(t, report);
    const expected = REFERENCE_EXPECTED[shape];
    const mainHtml = gunzipSync(readFileSync(new URL(`../fixtures/package-g-references/${shape}-main.html.gz`, import.meta.url)));
    const mainManifest = JSON.parse(readFileSync(new URL('../fixtures/package-g-references/main-reader-manifest.json', import.meta.url), 'utf8'));
    assert.equal(createHash('sha256').update(mainHtml).digest('hex'), mainManifest[shape].sha256);
    const mainDoc = domFor(t, { html: mainHtml } as Built);
    assert.equal(text(doc.querySelector('.cv-quarter')), expected.quarter);
    assert.equal(text(doc.querySelector('.cv-quarter')), text(mainDoc.querySelector('.cv-quarter')), 'computed quarter equals pinned main');
    assert.equal(text(doc.querySelector('.cv-period')), expected.range);
    const externalTargets = (page: Document) => [...new Set([...page.querySelectorAll('a[href]')]
      .map(node => node.getAttribute('href')!).filter(href => /^[a-z]+:/iu.test(href)))].sort();
    assert.deepEqual(externalTargets(doc), externalTargets(mainDoc), 'all exact retained href targets equal main');
    assert.equal(doc.querySelector('.brand')!.outerHTML, REFERENCE_BRAND);
    assert.ok([...doc.querySelectorAll('[data-quote],q')].some(node => node.textContent === expected.title), 'retained title bytes survive escaping exactly');
    assert.equal(doc.querySelectorAll('[data-quote] b, [data-quote] i:not(.pi)').length, 0, 'title markup stays inert');
    if (shape === 'Q1') {
      const links = [...doc.querySelectorAll('.citation-register a')].filter(node => node.getAttribute('href') === REFERENCE_LONG_URL);
      assert.equal(links.length, 1);
      assert.equal(text(links[0]), COPY.link);
      assert.ok(text(links[0]).length <= 100);
      assert.doesNotMatch(text(links[0]), /%[0-9A-F]{2}/iu);
    }
    const sampleDates = `${expected.start.split('-').reverse().join('/')} đến ${expected.end.split('-').reverse().join('/')}`;
    for (const row of section(doc, 'M13').querySelectorAll('table.observations tbody tr')) {
      assert.equal(text(row.querySelector('td:nth-child(4)')), sampleDates, 'collection window stays exact');
    }
    if (shape === 'Q1') {
      const actualSeries = text(section(doc, 'M03'));
      for (const [month, last] of [['01', '31'], ['02', '28'], ['03', '31'], ['04', '30'], ['05', '31'], ['06', '30'],
        ['07', '31'], ['08', '31'], ['09', '30'], ['10', '31'], ['11', '30'], ['12', '31']]) {
        assert.ok(actualSeries.includes(`01/${month}/2025 đến ${last}/${month}/2025`), 'E actual monthly source periods are preserved');
      }
    }
    const control = JSON.parse(readFileSync(new URL(`../fixtures/package-g-references/${shape}-citations.json`, import.meta.url), 'utf8'));
    const semantic = report.semantic as CitationSnapshot;
    const wanted = new Set(Array.from({ length: expected.identities }, (_, i) => referenceIdentity(i + 1)));
    assert.deepEqual(evidenceSnapshot(semantic, wanted), evidenceSnapshot(control, wanted),
      'technical and semantic evidence survives reader pruning; display labels may improve');
    const entries = semantic.citations.entries;
    for (let n = 1; n <= expected.identities; n++) assert.ok(entries.some(entry => entry.identity === referenceIdentity(n)));
  });

  test(`M21 ${shape}: unused known term and acronym substring do not pad glossary`, async t => {
    const doc = domFor(t, renderCurrent(await inputFor(shape)));
    assert.ok(definedTerms().includes('NSX'));
    assert.ok(!glossary(doc).includes('NSX'));
    const prose = authored(doc);
    assert.equal(word(REFERENCE_EXPECTED[shape].quoteOnly).test(prose), false, 'fixture acronym occurs only in a quote or is unused');
    if (shape === 'Q2') {
      assert.match(prose, /Mai/u);
      assert.equal(word('AI').test(prose), false, 'ordinary word is not the acronym');
      assert.ok(!glossary(doc).includes('AI'));
    }
    assert.ok(!glossary(doc).includes('H1'), 'known term absent from the whole report is absent from glossary');
  });
}

test('M20 Q1: one identity with two PDF locators retains both numbers and pages', async t => {
  const doc = domFor(t, renderCurrent(referencePdfInput(await inputFor('Q1'))));
  const entries = [...doc.querySelectorAll('.citation-register li')].filter(node => text(node).includes('Tài liệu tổng hợp mẫu'));
  assert.equal(entries.length, 2);
  for (const entry of entries) assert.equal(text(entry.querySelector(COPY.familySelector)),
    `${COPY.pdf} · ${COPY.sourceOrdinal} ${entry.id.slice(5)}`);
  assert.deepEqual(entries.map(node => text(node.querySelector('.cite-locator'))), ['trang 4', 'trang 5']);
  const marks = [...section(doc, 'M09').querySelectorAll('blockquote[data-quote]')].map(node => text(node.parentElement?.querySelector('sup.cite')));
  assert.equal(marks.length, 2);
  assert.notEqual(marks[0], marks[1]);
});

for (const [term, required] of [['ROAS', true], ['BLDC', false]] as const) {
  test(`M21 quoted-only ${term}: ${required ? 'checker entry and all machine rules' : 'no non-checker entry'}`, async t => {
    const input = await inputFor('Q1');
    const title = `Tư liệu mẫu ${term}`, site = `Trang mẫu ${term}`;
    const quotedInput = { ...input, collection: { ...input.collection!, webResults: [{ ...input.collection!.webResults![0]!, title, site }] } };
    const report = renderCurrent(quotedInput), doc = domFor(t, report);
    assert.ok([...doc.querySelectorAll('q,[data-quote]')].some(node => node.textContent === title));
    assert.ok(word(term).test(checkerVisible(doc)));
    assert.equal(word(term).test(authored(doc)), false, 'term really occurs only inside verbatim quotes');
    assert.equal(glossary(doc).includes(term), required);
    assert.deepEqual(auditMarket14(report.html.toString()).filter(row => row.kind === 'machine' && !row.ok), []);
    assert.doesNotThrow(() => assertMarket14MachineRules(report.html.toString()));
  });
}

test('machine rules: all three full reports retain every machine PASS', async t => {
  for (const shape of REFERENCE_SHAPES) {
    const report = renderCurrent(await inputFor(shape)), html = report.html.toString();
    const audited = auditMarket14(html);
    assert.equal(audited.length, 14, shape);
    assert.deepEqual(audited.filter(row => row.kind === 'machine' && !row.ok), [], shape);
    assert.doesNotThrow(() => assertMarket14MachineRules(html));
    domFor(t, report);
  }
});

test('current reader without capture details spells out percentages outside share charts', async t => {
  const input = await fullMarket14Input();
  const { capture: _capture, ...metricMethods } = input.metricMethods!;
  const report = renderCurrent({ ...input, metricMethods }), doc = domFor(t, report);
  const prose = authored(doc);
  assert.match(prose, /\d[\d,.]*(?:%| phần trăm)/u, 'the fixture actually contains percentage measurements');
  const copy = doc.body.cloneNode(true) as HTMLElement;
  for (const node of copy.querySelectorAll('q, [data-quote], blockquote, code, pre, svg, style, script, template, noscript, [hidden], [aria-hidden="true"], figure.market-chart')) node.remove();
  assert.doesNotMatch(text(copy), /%/u, 'authored prose and table cells spell out percentages');
  assert.doesNotMatch(text(copy), /\b0\s+(?:dòng|giá trị)|không phải 0/u, 'empty states spell out zero');
  assert.doesNotThrow(() => assertMarket14MachineRules(report.html.toString()));
});

let byteControls: Promise<Record<string, Buffer>> | undefined;
for (const name of ['legacy-market', 'market-template-v4', 'insight']) test(`byte baseline: ${name}`, async () => {
  const expected = gunzipSync(readFileSync(new URL(`../fixtures/package-g-references/${name}.html.gz`, import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../fixtures/package-g-references/manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.base, REFERENCE_BASE);
  assert.equal(createHash('sha256').update(expected).digest('hex'), manifest.files[name].sha256);
  const actual = await (byteControls ??= referenceBaselineBytes(process.env.TDN_G_REFERENCES_TARGET_CHECKOUT ?? process.cwd()));
  assert.deepEqual(actual[name], expected);
});

test('negative control: pinned main builds healthy Q1 and every item detector rejects its old behavior', async t => {
  // Frozen rendered main evidence keeps the regression suite portable. The final lane
  // separately executes these same assertions against main's actual public builder.
  const html = gunzipSync(readFileSync(new URL('../fixtures/package-g-references/Q1-main.html.gz', import.meta.url)));
  const manifest = JSON.parse(readFileSync(new URL('../fixtures/package-g-references/main-reader-manifest.json', import.meta.url), 'utf8'));
  assert.equal(manifest.base, REFERENCE_BASE);
  assert.equal(createHash('sha256').update(html).digest('hex'), manifest.Q1.sha256);
  const report = { html } as Built;
  assert.doesNotThrow(() => assertMarket14MachineRules(report.html.toString()), 'a missing import/build error is not a useful negative control');
  const doc = domFor(t, report);
  for (const item of ITEMS) assert.throws(() => checkRow(item, 'Q1', doc), AssertionError, `${item} must reject old behavior`);
  // Fixture identity semantics are the existing shared default, independently of the reader pass.
  const registry = referenceRegistryFixture('Q1');
  assert.equal(registry.entries.length, 5);
  assert.equal(registry.marks.length, 5);
  const registryDom = new JSDOM(registry.register);
  try { assert.equal(registryDom.window.document.querySelectorAll('li').length, 5); }
  finally { registryDom.window.close(); }
});
